import type { AlbumPreset, SidechainConfig } from "../types";

const TARGET_LOOP_COUNT = 16;

interface Track {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  output: GainNode;
  started: boolean;
}

export interface LoopEngine {
  loadPreset: (preset: AlbumPreset, onProgress?: (loaded: number, total: number) => void) => Promise<void>;
  start: () => Promise<void>;
  setPlaying: (nextPlaying: boolean) => Promise<void>;
  setActive: (index: number, isActive: boolean) => void;
  setMasterVolume: (value: number) => void;
  setSidechainConfig: (config: SidechainConfig | null | undefined) => void;
  setSidechainEnabled: (enabled: boolean) => void;
  setSidechainStrength: (strength: number) => void;
  getActive: () => boolean[];
  getIsPlaying: () => boolean;
  getAnalyser: () => AnalyserNode | null;
  destroy: () => void;
}

export function createLoopEngine(): LoopEngine {
  let audioContext: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let tracks: Track[] = [];
  let activeState = new Array(TARGET_LOOP_COUNT).fill(false);
  let isPlaying = false;
  let hasStartedTransport = false;
  let silentAudio: HTMLAudioElement | null = null;
  let sidechainConfig: SidechainConfig | null = null;
  let sidechainEnabled = false;
  let sidechainStrength = 0.65;
  let sidechainTriggerSet = new Set<number>();
  let sidechainTargetSet = new Set<number>();
  let sidechainAnalyser: AnalyserNode | null = null;
  let sidechainTap: GainNode | null = null;
  let sidechainSink: GainNode | null = null;
  let sidechainData: Uint8Array | null = null;
  let sidechainFrameId: number | null = null;
  let sidechainEnvelope = 0;
  let sidechainLastTime = 0;
  let sidechainCurrentDucking = 1;
  let sidechainFloorHoldTime = 0;

  const clamp01 = (value: number) => Math.max(0, Math.min(1, Number(value)));

  const fadeTo = (gainNode: GainNode, value: number, duration = 0.04) => {
    if (!audioContext) {
      return;
    }

    const now = audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(value, now + duration);
  };

  const ensureContext = async () => {
    if (!audioContext) {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Web Audio API is not available in this browser.");
      }
      audioContext = new AudioContextCtor();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.95;
      
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;

      sidechainAnalyser = audioContext.createAnalyser();
      sidechainAnalyser.fftSize = 512;
      sidechainAnalyser.smoothingTimeConstant = 0.25;
      sidechainData = new Uint8Array(sidechainAnalyser.frequencyBinCount);
      sidechainTap = audioContext.createGain();
      sidechainTap.gain.value = 1;
      sidechainSink = audioContext.createGain();
      sidechainSink.gain.value = 0;
      
      masterGain.connect(analyser);
      analyser.connect(audioContext.destination);
      sidechainTap.connect(sidechainAnalyser);
      sidechainAnalyser.connect(sidechainSink);
      sidechainSink.connect(audioContext.destination);

      // create silent audio to keep ios safari web audio active in background
      silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
      silentAudio.loop = true;
      const silentSource = audioContext.createMediaElementSource(silentAudio);
      silentSource.connect(audioContext.destination);

      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
          void setPlaying(true);
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          void setPlaying(false);
        });
      }
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  };

  const fetchAndDecode = async (url: string | null): Promise<AudioBuffer | null> => {
    if (!url) {
      return null;
    }
    if (!audioContext) {
      throw new Error("Audio context not initialized.");
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load loop file: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
  };

  const createSourceForTrack = (track: Track, offset = 0): AudioBufferSourceNode | null => {
    if (!audioContext || !track.buffer) {
      return null;
    }

    const source = audioContext.createBufferSource();
    source.buffer = track.buffer;
    source.loop = true;
    source.connect(track.gain);

    track.source = source;
    track.started = true;
    source.start(offset, 0);
    return source;
  };

  const stopTrackAudio = () => {
    if (sidechainFrameId !== null) {
      cancelAnimationFrame(sidechainFrameId);
      sidechainFrameId = null;
    }

    tracks.forEach((track) => {
      if (track.source) {
        try {
          track.source.stop();
        } catch {
          // already stopped.
        }
        track.source.disconnect();
      }
      track.gain.disconnect();
      track.output.disconnect();
    });
    tracks = [];
  };

  const refreshSidechainRouting = () => {
    if (!sidechainTap) {
      return;
    }

    tracks.forEach((track, index) => {
      try {
        track.gain.disconnect(sidechainTap);
      } catch {
        // no existing sidechain tap connection.
      }

      if (sidechainTriggerSet.has(index)) {
        track.gain.connect(sidechainTap);
      }
    });
  };

  const applySidechainDucking = (ducking: number, duration = 0.02) => {
    tracks.forEach((track, index) => {
      const next = sidechainTargetSet.has(index) && activeState[index] ? ducking : 1;
      fadeTo(track.output, next, duration);
    });
    sidechainCurrentDucking = ducking;
  };

  const runSidechain = () => {
    if (!sidechainAnalyser || !sidechainData || !audioContext || !isPlaying) {
      sidechainFrameId = null;
      return;
    }

    if (!sidechainEnabled || !sidechainTriggerSet.size || !sidechainTargetSet.size || sidechainStrength <= 0) {
      sidechainEnvelope = 0;
      sidechainFloorHoldTime = 0;
      applySidechainDucking(1, 0.05);
      sidechainFrameId = requestAnimationFrame(runSidechain);
      return;
    }

    sidechainAnalyser.getByteTimeDomainData(sidechainData);

    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < sidechainData.length; i++) {
      const centered = Math.abs(sidechainData[i] - 128) / 128;
      if (centered > peak) {
        peak = centered;
      }
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / sidechainData.length);
    const detector = Math.max(peak * 0.85, rms * 1.4);

    const now = audioContext.currentTime;
    const dt = sidechainLastTime > 0 ? Math.max(1 / 240, now - sidechainLastTime) : 1 / 60;
    sidechainLastTime = now;

    const threshold = 0.04;
    const drive = clamp01((detector - threshold) / (1 - threshold));
    const strengthCurve = Math.pow(sidechainStrength, 0.65);
    const attackMs = 8;
    const releaseMs = 55 + sidechainStrength * 240;
    const floorHoldSeconds = 0.01 + strengthCurve * 0.22;
    const holdTriggerDrive = 0.5 - strengthCurve * 0.2;
    const holdMaintainEnvelope = 0.58 - strengthCurve * 0.18;
    const attackCoeff = Math.exp(-dt / (attackMs / 1000));
    const releaseCoeff = Math.exp(-dt / (releaseMs / 1000));

    if (drive > sidechainEnvelope) {
      sidechainEnvelope = attackCoeff * sidechainEnvelope + (1 - attackCoeff) * drive;
      if (drive > holdTriggerDrive && sidechainStrength > 0.02) {
        sidechainFloorHoldTime = floorHoldSeconds;
      }
    } else {
      if (sidechainFloorHoldTime > 0 && sidechainEnvelope > holdMaintainEnvelope) {
        sidechainFloorHoldTime = Math.max(0, sidechainFloorHoldTime - dt);
        sidechainEnvelope = Math.max(sidechainEnvelope, drive);
      } else {
        sidechainEnvelope = releaseCoeff * sidechainEnvelope + (1 - releaseCoeff) * drive;
      }
    }

    const depth = 0.3 + sidechainStrength * 0.7;
    const rawDucking = 1 - sidechainEnvelope * depth;
    const floorPinThreshold = 0.22 - strengthCurve * 0.14;
    const shouldHoldAtFloor = sidechainFloorHoldTime > 0 && rawDucking < floorPinThreshold;
    const ducking = shouldHoldAtFloor ? 0 : Math.max(0, rawDucking);
    const isReleasing = ducking > sidechainCurrentDucking;
    const attackDuration = 0.006;
    const releaseDuration = 0.018 + sidechainStrength * 0.2;
    applySidechainDucking(ducking, isReleasing ? releaseDuration : attackDuration);

    sidechainFrameId = requestAnimationFrame(runSidechain);
  };

  const ensureSidechainLoop = () => {
    if (!isPlaying || sidechainFrameId !== null) {
      return;
    }
    sidechainFrameId = requestAnimationFrame(runSidechain);
  };

  const setSidechainConfig = (config: SidechainConfig | null | undefined) => {
    sidechainConfig = config ?? null;
    sidechainTriggerSet = new Set((sidechainConfig?.triggerIndices ?? []).filter((index) => index >= 0 && index < TARGET_LOOP_COUNT));
    sidechainTargetSet = new Set((sidechainConfig?.targetIndices ?? []).filter((index) => index >= 0 && index < TARGET_LOOP_COUNT));
    refreshSidechainRouting();
    if (!sidechainTargetSet.size || !sidechainTriggerSet.size) {
      applySidechainDucking(1);
    }
  };

  const setSidechainEnabled = (enabled: boolean) => {
    sidechainEnabled = Boolean(enabled);
    if (!sidechainEnabled) {
      sidechainEnvelope = 0;
      sidechainLastTime = 0;
      sidechainFloorHoldTime = 0;
      applySidechainDucking(1, 0.06);
      return;
    }
    sidechainLastTime = 0;
    sidechainFloorHoldTime = 0;
    ensureSidechainLoop();
  };

  const setSidechainStrength = (strength: number) => {
    sidechainStrength = clamp01(strength);
    if (sidechainStrength <= 0) {
      sidechainEnvelope = 0;
      sidechainFloorHoldTime = 0;
      applySidechainDucking(1, 0.05);
    }
  };

  const destroy = () => {
    stopTrackAudio();
    if (silentAudio && !silentAudio.paused) {
      silentAudio.pause();
    }
    activeState = new Array(TARGET_LOOP_COUNT).fill(false);
    isPlaying = false;
    hasStartedTransport = false;
    sidechainConfig = null;
    sidechainTriggerSet = new Set();
    sidechainTargetSet = new Set();
    sidechainEnvelope = 0;
    sidechainLastTime = 0;
    sidechainCurrentDucking = 1;
    sidechainFloorHoldTime = 0;
  };

  const loadPreset = async (preset: AlbumPreset, onProgress?: (loaded: number, total: number) => void) => {
    await ensureContext();
    if (!audioContext || !masterGain) {
      return;
    }

    destroy();
    const loopUrls = preset.loops.slice(0, TARGET_LOOP_COUNT);
    while (loopUrls.length < TARGET_LOOP_COUNT) {
      loopUrls.push("");
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: preset.title,
        artist: "BeatBuild",
        album: "Loop Player",
        artwork: [
          { src: preset.coverFront, sizes: '512x512', type: 'image/png' }
        ]
      });
    }

    let loadedCount = 0;
    const fetchWithProgress = async (url: string | null) => {
      const buffer = await fetchAndDecode(url);
      loadedCount++;
      if (onProgress) {
        onProgress(loadedCount, TARGET_LOOP_COUNT);
      }
      return buffer;
    };

    const buffers = await Promise.all(loopUrls.map(fetchWithProgress));
    tracks = buffers.map((buffer) => {
      const gain = audioContext!.createGain();
      const output = audioContext!.createGain();
      gain.gain.value = 0;
      output.gain.value = 1;
      gain.connect(output);
      output.connect(masterGain!);
      return { buffer, source: null, gain, output, started: false };
    });

    activeState = new Array(TARGET_LOOP_COUNT).fill(false);
    isPlaying = false;
    hasStartedTransport = false;
    setSidechainConfig(preset.sidechain);
    applySidechainDucking(1);
  };

  const start = async () => {
    if (!tracks.length) {
      return;
    }

    await ensureContext();
    if (!audioContext) {
      return;
    }

    if (!hasStartedTransport) {
      const startAt = audioContext.currentTime + 0.03;
      tracks.forEach((track, index) => {
        createSourceForTrack(track, startAt);
        fadeTo(track.gain, activeState[index] ? 1 : 0, 0.02);
      });
      hasStartedTransport = true;
    } else if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (silentAudio && silentAudio.paused) {
      silentAudio.play().catch(() => {});
    }

    isPlaying = true;
    ensureSidechainLoop();
  };

  const setPlaying = async (nextPlaying: boolean) => {
    if (!tracks.length || !audioContext) {
      return;
    }

    if (nextPlaying) {
      if (!hasStartedTransport) {
        await start();
        return;
      }
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      if (silentAudio && silentAudio.paused) {
        silentAudio.play().catch(() => {});
      }
      isPlaying = true;
      ensureSidechainLoop();
      return;
    }

    if (silentAudio && !silentAudio.paused) {
      silentAudio.pause();
    }
    if (audioContext.state === "running") {
      await audioContext.suspend();
    }
    isPlaying = false;
    if (sidechainFrameId !== null) {
      cancelAnimationFrame(sidechainFrameId);
      sidechainFrameId = null;
    }
    applySidechainDucking(1);
  };

  const setActive = (index: number, isActive: boolean) => {
    if (!tracks[index]) {
      return;
    }
    activeState[index] = isActive;
    fadeTo(tracks[index].gain, isActive ? 1 : 0);
  };

  const getActive = () => [...activeState];
  const getIsPlaying = () => isPlaying;
  const getAnalyser = () => analyser;

  const setMasterVolume = (value: number) => {
    if (!masterGain || !audioContext) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, Number(value)));
    const t = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(clamped, t);
  };

  return {
    loadPreset,
    start,
    setPlaying,
    setActive,
    setMasterVolume,
    setSidechainConfig,
    setSidechainEnabled,
    setSidechainStrength,
    getActive,
    getIsPlaying,
    getAnalyser,
    destroy
  };
}


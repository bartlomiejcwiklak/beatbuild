const TARGET_LOOP_COUNT = 16;

export function createLoopEngine() {
  let audioContext = null;
  let masterGain = null;
  let tracks = [];
  let activeState = new Array(TARGET_LOOP_COUNT).fill(false);
  let isPlaying = false;
  let hasStartedTransport = false;

  const fadeTo = (gainNode, value, duration = 0.04) => {
    if (!audioContext || !gainNode) {
      return;
    }

    const now = audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(value, now + duration);
  };

  const ensureContext = async () => {
    if (!audioContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextCtor();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.95;
      masterGain.connect(audioContext.destination);
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  };

  const fetchAndDecode = async (url) => {
    if (!url) {
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load loop file: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
  };

  const createSourceForTrack = (track, offset = 0) => {
    if (!track?.buffer) {
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
    tracks.forEach((track) => {
      if (track.source) {
        try {
          track.source.stop();
        } catch (_error) {
          // Source may already be stopped.
        }
        track.source.disconnect();
      }
      track.gain.disconnect();
    });
    tracks = [];
  };

  const destroy = () => {
    stopTrackAudio();
    activeState = new Array(TARGET_LOOP_COUNT).fill(false);
    isPlaying = false;
    hasStartedTransport = false;
  };

  const loadPreset = async (preset) => {
    await ensureContext();
    destroy();

    const loopUrls = preset.loops.slice(0, TARGET_LOOP_COUNT);
    while (loopUrls.length < TARGET_LOOP_COUNT) {
      loopUrls.push(null);
    }

    const buffers = await Promise.all(loopUrls.map((url) => fetchAndDecode(url)));
    tracks = buffers.map((buffer) => {
      const gain = audioContext.createGain();
      gain.gain.value = 0;

      gain.connect(masterGain);

      return { buffer, source: null, gain, started: false };
    });

    activeState = new Array(TARGET_LOOP_COUNT).fill(false);
    isPlaying = false;
    hasStartedTransport = false;
  };

  const start = async () => {
    if (!tracks.length) {
      return;
    }

    await ensureContext();
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

    isPlaying = true;
  };

  const setPlaying = async (nextPlaying) => {
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
      isPlaying = true;
      return;
    }

    if (audioContext.state === "running") {
      await audioContext.suspend();
    }
    isPlaying = false;
  };

  const setActive = (index, isActive) => {
    if (!tracks[index]) {
      return;
    }
    activeState[index] = isActive;

    fadeTo(tracks[index].gain, isActive ? 1 : 0);
  };

  const getActive = () => [...activeState];
  const getIsPlaying = () => isPlaying;

  const setMasterVolume = (value) => {
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
    getActive,
    getIsPlaying,
    destroy
  };
}

const TARGET_LOOP_COUNT = 16;

export function createLoopEngine() {
  let audioContext = null;
  let masterGain = null;
  let tracks = [];
  let activeState = new Array(TARGET_LOOP_COUNT).fill(false);
  let isPlaying = false;
  let unlocked = false;

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

  const stopTrackAudio = () => {
    tracks.forEach((track) => {
      track.audio.pause();
      track.audio.currentTime = 0;
      track.audio.src = "";
      track.source.disconnect();
      track.gain.disconnect();
    });
    tracks = [];
  };

  const destroy = () => {
    stopTrackAudio();
    activeState = new Array(TARGET_LOOP_COUNT).fill(false);
    isPlaying = false;
  };

  const loadPreset = async (preset) => {
    await ensureContext();
    destroy();

    const loopUrls = preset.loops.slice(0, TARGET_LOOP_COUNT);
    while (loopUrls.length < TARGET_LOOP_COUNT) {
      loopUrls.push(null);
    }

    tracks = loopUrls.map((url) => {
      const audio = new Audio(url ?? "");
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";

      const source = audioContext.createMediaElementSource(audio);
      const gain = audioContext.createGain();
      gain.gain.value = 0;

      source.connect(gain);
      gain.connect(masterGain);

      return { audio, source, gain };
    });

    activeState = new Array(TARGET_LOOP_COUNT).fill(false);
    isPlaying = false;
    unlocked = false;
  };

  const start = async () => {
    if (!tracks.length) {
      return;
    }

    await ensureContext();

    const starts = tracks.map((track) => {
      track.audio.currentTime = 0;
      return track.audio.play();
    });

    await Promise.all(starts);
    unlocked = true;
    isPlaying = true;

    tracks.forEach((track, index) => {
      fadeTo(track.gain, activeState[index] ? 1 : 0);
    });
  };

  const setPlaying = async (nextPlaying) => {
    if (!tracks.length) {
      return;
    }

    if (nextPlaying) {
      if (!unlocked) {
        await start();
        return;
      }

      await ensureContext();
      await Promise.all(tracks.map((track) => track.audio.play()));
      isPlaying = true;
      return;
    }

    tracks.forEach((track) => track.audio.pause());
    isPlaying = false;
  };

  const setActive = (index, isActive) => {
    if (!tracks[index]) {
      return;
    }
    activeState[index] = isActive;

    if (isPlaying) {
      fadeTo(tracks[index].gain, isActive ? 1 : 0);
    }
  };

  const getActive = () => [...activeState];
  const getIsPlaying = () => isPlaying;

  return {
    loadPreset,
    start,
    setPlaying,
    setActive,
    getActive,
    getIsPlaying,
    destroy
  };
}

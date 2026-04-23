import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  themeHue: number;
  themeSaturation: number;
  intensity: number;
}

interface Particle {
  x: number;
  y: number;
  baseRadius: number;
  vx: number;
  vy: number;
  hue: number;
  alpha: number;
}

export default function AudioVisualizer({ analyser, isPlaying, themeHue, themeSaturation, intensity }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // initialize particles
    const initParticles = () => {
      const count = 75;
      particlesRef.current = [];
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          baseRadius: Math.random() * 4 + 1,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6 - 0.3, // drift upwards slightly
          hue: Math.random() * 60 + themeHue - 30, // variation around the base hue
          alpha: Math.random() * 0.2 + 0.1
        });
      }
    };
    initParticles();

    let dataArray = new Uint8Array(0);
    if (analyser) {
      dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    const render = () => {
      if (!canvas || !ctx) return;

      let bassFreq = 0;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);

        let bassSum = 0;
        // check the first few bins for bass
        for (let i = 0; i < 8; i++) {
          bassSum += dataArray[i];
        }
        bassFreq = bassSum / 8;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      const beatIntensity = bassFreq / 255; // 0 to 1
      // smooth out the intensity a bit, minimum idle movement
      const activeIntensity = (isPlaying ? Math.max(0.05, beatIntensity) : 0.05) * intensityRef.current;

      // use additive blending for neon look
      ctx.globalCompositeOperation = "screen";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // update position
        p.x += p.vx + (p.vx * activeIntensity * 3);
        p.y += p.vy - (activeIntensity * 2.5); // float up faster on beat

        // wrap around screen smoothly
        if (p.x < -p.baseRadius * 5) p.x = canvas.width + p.baseRadius * 5;
        if (p.x > canvas.width + p.baseRadius * 5) p.x = -p.baseRadius * 5;
        if (p.y < -p.baseRadius * 5) p.y = canvas.height + p.baseRadius * 5;
        if (p.y > canvas.height + p.baseRadius * 5) p.y = -p.baseRadius * 5;

        // draw particle
        const radius = p.baseRadius + (p.baseRadius * activeIntensity * 5);
        const alpha = Math.min(1, p.alpha + activeIntensity * 0.6);

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        gradient.addColorStop(0, `hsla(${p.hue}, ${themeSaturation}%, 75%, ${alpha})`);
        gradient.addColorStop(1, `hsla(${p.hue}, ${themeSaturation}%, 75%, 0)`);

        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // reset to default
      ctx.globalCompositeOperation = "source-over";

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, isPlaying, themeHue, themeSaturation]);

  return (
    <canvas
      ref={canvasRef}
      className="audio-visualizer-canvas"
      aria-hidden="true"
    />
  );
}

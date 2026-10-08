import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Confetti fisika ringan berbasis canvas — gravitasi, drag udara,
 * dan rotasi 3-sumbu per partikel. Meledak saat mode "event" aktif.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  /** sumbu rotasi 3D (dinormalisasi) */
  rx: number;
  ry: number;
  rz: number;
  angle: number;
  spin: number;
  life: number;
  ttl: number;
}

const COLORS = [
  "#d92d20", // merah brand
  "#f0bb0d", // kuning festival
  "#f97028", // oranye
  "#f489a3", // pink
  "#57534e", // beton
];

const GRAVITY = 0.11;
const DRAG = 0.992;
const COUNT = 140;

interface ConfettiCanvasProps {
  /** Naikkan angka ini untuk memicu ledakan baru */
  burstKey: number;
  className?: string;
}

export function ConfettiCanvas({ burstKey, className }: ConfettiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const raf = useRef<number>(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || burstKey === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    // Titik ledakan: area papan (kanan-tengah kanvas)
    const ox = canvas.offsetWidth * 0.72;
    const oy = canvas.offsetHeight * 0.38;

    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 9;
      const axis = Math.random() * Math.PI * 2;
      particles.current.push({
        x: ox,
        y: oy,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed - 4.5,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        rx: Math.cos(axis),
        ry: Math.sin(axis),
        rz: Math.random() - 0.5,
        angle: Math.random() * 360,
        spin: (Math.random() - 0.5) * 18,
        life: 0,
        ttl: 130 + Math.random() * 70,
      });
    }

    const tick = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      particles.current = particles.current.filter((p) => p.life < p.ttl);

      for (const p of particles.current) {
        p.life += 1;
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;

        const fade = 1 - p.life / p.ttl;
        // rotasi 3-sumbu disederhanakan: skew + scale mensimulasikan flip kertas
        const flip = Math.abs(Math.cos((p.angle * Math.PI) / 180) * p.ry);

        ctx.save();
        ctx.globalAlpha = Math.max(fade, 0);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.angle * Math.PI) / 180);
        ctx.transform(1, p.rz * 0.35, p.rx * 0.35, Math.max(flip, 0.15), 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (particles.current.length > 0) {
        raf.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [burstKey, reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? "pointer-events-none absolute inset-0 h-full w-full"}
    />
  );
}

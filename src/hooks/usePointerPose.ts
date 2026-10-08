import { useEffect, useRef, useState, useCallback } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface PointerPose {
  /** Posisi pointer ternormalisasi: -0.5 … 0.5 (0 = tengah stage) */
  x: number;
  y: number;
  /** Tilt 3D untuk panggung (derajat) */
  rotateX: number;
  rotateY: number;
}

const MAX_TILT = 7; // derajat maksimum rotasi panggung
const DAMPING = 11; // kecepatan damping eksponensial (1/detik)

/**
 * usePointerPose: Pelacak kursor & pose 3D ultra-halus (anti patah-patah).
 *
 * Kunci Perbaikan Animasi:
 * 1. Delta-time exponential damping: `factor = 1 - Math.exp(-damping * dt)`.
 *    Menghilangkan ketergantungan frame-rate (identik di 60Hz, 120Hz, atau fluktuasi FPS).
 * 2. Menghilangkan snap mendadak di tepi elemen dengan radius pelacakan viewport yang mulus.
 * 3. Menghilangkan threshold cutoff kasar yang menghentikan animasi secara tiba-tiba.
 * 4. Kompatibel dengan pointerleave & blur: kembali ke tengah secara perlahan dan halus.
 */
export function usePointerPose<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();

  const [pose, setPose] = useState<PointerPose>({
    x: 0,
    y: 0,
    rotateX: 0,
    rotateY: 0,
  });

  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(performance.now());
  const rafId = useRef<number>(0);

  // Perhitungan posisi kursor relatif terhadap tengah panggung
  const updateTargetFromEvent = useCallback((clientX: number, clientY: number) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) {
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      targetRef.current = {
        x: Math.max(-0.5, Math.min(0.5, clientX / vw - 0.5)),
        y: Math.max(-0.5, Math.min(0.5, clientY / vh - 0.5)),
      };
      return;
    }

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Radius pelacakan halus: di dalam elemen = -0.5 .. 0.5,
    // di luar elemen melandai halus dan dibatasi -0.5 .. 0.5 tanpa snapping
    const spanX = Math.max(rect.width * 1.2, 350);
    const spanY = Math.max(rect.height * 1.2, 350);

    const nx = (clientX - centerX) / spanX;
    const ny = (clientY - centerY) / spanY;

    targetRef.current = {
      x: Math.max(-0.5, Math.min(0.5, nx)),
      y: Math.max(-0.5, Math.min(0.5, ny)),
    };
  }, [reduced]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      updateTargetFromEvent(e.clientX, e.clientY);
    },
    [updateTargetFromEvent]
  );

  const onPointerLeave = useCallback(() => {
    // Glide lembut kembali ke tengah, jangan snap mendadak
    targetRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    if (reduced) return;

    // Pelacakan global di jendela agar kursor tidak patah saat melintasi tepi elemen
    const handleGlobalPointerMove = (e: PointerEvent) => {
      // Hanya aktif bila mouse berada dalam jangkauan masuk akal dari panggung
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const padding = 200; // buffer 200px di luar batas elemen
      if (
        e.clientX >= rect.left - padding &&
        e.clientX <= rect.right + padding &&
        e.clientY >= rect.top - padding &&
        e.clientY <= rect.bottom + padding
      ) {
        updateTargetFromEvent(e.clientX, e.clientY);
      }
    };

    const handleWindowLeave = () => {
      targetRef.current = { x: 0, y: 0 };
    };

    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: true });
    window.addEventListener("pointerleave", handleWindowLeave);
    window.addEventListener("blur", handleWindowLeave);

    lastTimeRef.current = performance.now();

    const loop = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = timestamp;

      const target = targetRef.current;
      const cur = currentRef.current;

      // Exponential damping berbasis delta-time:
      const factor = 1 - Math.exp(-DAMPING * dt);
      cur.x += (target.x - cur.x) * factor;
      cur.y += (target.y - cur.y) * factor;

      // Hitung rotasi panggung 3D:
      const rx = -cur.y * 2 * MAX_TILT;
      const ry = cur.x * 2 * MAX_TILT;

      setPose({
        x: cur.x,
        y: cur.y,
        rotateX: rx,
        rotateY: ry,
      });

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerleave", handleWindowLeave);
      window.removeEventListener("blur", handleWindowLeave);
      cancelAnimationFrame(rafId.current);
    };
  }, [reduced, updateTargetFromEvent]);

  return { ref, pose, onPointerMove, onPointerLeave };
}

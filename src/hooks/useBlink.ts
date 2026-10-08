import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const BLINK_MS = 150; // durasi mata tertutup
const MIN_GAP = 2200;
const MAX_GAP = 5600;
const DOUBLE_BLINK_CHANCE = 0.25;

/**
 * Kedipan mata acak — interval 2.2–5.6 detik dengan peluang
 * kedip ganda agar terasa natural (manusia jarang berkedip
 * dengan ritme konstan). Nonaktif saat reduced motion.
 */
export function useBlink(): boolean {
  const reduced = useReducedMotion();
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (reduced) return;

    let timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const blinkOnce = () => {
      setBlinking(true);
      timers.push(setTimeout(() => setBlinking(false), BLINK_MS));
    };

    const schedule = () => {
      if (cancelled) return;
      const gap = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
      timers.push(
        setTimeout(() => {
          blinkOnce();
          if (Math.random() < DOUBLE_BLINK_CHANCE) {
            timers.push(setTimeout(blinkOnce, BLINK_MS + 190));
          }
          schedule();
        }, gap),
      );
    };

    schedule();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduced]);

  return blinking;
}

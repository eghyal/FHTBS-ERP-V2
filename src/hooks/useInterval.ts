import { useEffect, useRef } from "react";

let lastActivityTime = Date.now();

if (typeof window !== "undefined") {
  let lastRecorded = 0;
  const updateActivity = () => {
    const now = Date.now();
    if (now - lastRecorded > 5000) {
      lastRecorded = now;
      lastActivityTime = now;
    }
  };
  window.addEventListener("mousemove", updateActivity, { passive: true });
  window.addEventListener("keydown", updateActivity, { passive: true });
  window.addEventListener("scroll", updateActivity, { passive: true });
  window.addEventListener("click", updateActivity, { passive: true });
}

export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // Remember the latest callback if it changes.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    // Don't schedule if no delay is specified.
    if (delay === null) {
      return;
    }
    
    let skippedTicks = 0;

    const id = setInterval(() => {
      // Pause polling if the document is hidden to save API resources and reduce load
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      
      // Idle Decay: Slow down polling when user is inactive
      const idleTime = Date.now() - lastActivityTime;
      if (idleTime > 10 * 60 * 1000) { // 10 minutes idle -> slow down 10x
         skippedTicks++;
         if (skippedTicks < 10) return;
         skippedTicks = 0;
      } else if (idleTime > 3 * 60 * 1000) { // 3 minutes idle -> slow down 5x
         skippedTicks++;
         if (skippedTicks < 5) return;
         skippedTicks = 0;
      } else {
         skippedTicks = 0;
      }

      if (typeof savedCallback.current === "function") {
        savedCallback.current();
      }
    }, delay);

    return () => clearInterval(id);
  }, [delay]);
}

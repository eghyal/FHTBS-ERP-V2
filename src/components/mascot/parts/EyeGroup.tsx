import { EYE_CENTER, PUPIL_RANGE } from "@/lib/mascotGeometry";
import eyeLeftUrl from "@/assets/mascot/mascot-eye-left.webp";
import eyeRightUrl from "@/assets/mascot/mascot-eye-right.webp";
import pupilLeftUrl from "@/assets/mascot/mascot-pupil-left.webp";
import pupilRightUrl from "@/assets/mascot/mascot-pupil-right.webp";

/**
 * Satu mata lengkap: putih mata + pupil sebagai layer terpisah.
 *
 * - Kedip: seluruh grup di-scaleY collapse ke garis di titik tengah
 *   mata, memperlihatkan kelopak (kulit) yang sudah disiapkan di
 *   layer kepala di bawahnya.
 * - Pupil bergeser mengikuti pointer (dibatasi agar tetap di dalam
 *   putih mata) — inilah yang membuat mascot terasa "menatap".
 *
 * Semua layer full-kanvas; transform-origin memakai fraksi kanvas
 * dari mascotGeometry sehingga presisi di segala ukuran.
 */
interface EyeGroupProps {
  side: "left" | "right";
  /** true saat mata sedang berkedip (dari useBlink) */
  blinking: boolean;
  /** Posisi pointer ternormalisasi (-0.5 … 0.5) */
  pointer: { x: number; y: number };
}

export function EyeGroup({ side, blinking, pointer }: EyeGroupProps) {
  const center = EYE_CENTER[side];
  const whiteUrl = side === "left" ? eyeLeftUrl : eyeRightUrl;
  const pupilUrl = side === "left" ? pupilLeftUrl : pupilRightUrl;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 will-change-transform pointer-events-none"
      style={{
        transformOrigin: `${center.x * 100}% ${center.y * 100}%`,
        transform: blinking ? "scaleY(0.04)" : "scaleY(1)",
        transitionProperty: "transform",
        transitionDuration: blinking ? "75ms" : "130ms",
        transitionTimingFunction: blinking
          ? "cubic-bezier(0.4, 0, 0.2, 1)"
          : "cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      <img
        src={whiteUrl}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
      />
      <img
        src={pupilUrl}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none will-change-transform"
        style={{
          transform: `translate3d(${pointer.x * PUPIL_RANGE.x}%, ${
            pointer.y * PUPIL_RANGE.y
          }%, 0)`,
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />
    </div>
  );
}

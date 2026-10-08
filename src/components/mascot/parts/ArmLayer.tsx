import { ARM_PIVOT } from "@/lib/mascotGeometry";
import armUrl from "@/assets/mascot/mascot-arm.webp";

/**
 * Lengan penunjuk mascot — dipotong sebagai layer terpisah dari
 * gambar referensi dengan pivot di bahu.
 *
 * - sway (keyframes): ayunan idle sangat halus agar lengan tidak kaku
 * - point (keyframes, re-mount saat pesan berganti): gestur "menunjuk"
 *   ke arah papan, seolah mascot menekankan pesan baru yang tampil
 */
interface ArmLayerProps {
  /** Berubah saat pesan papan berganti → memicu gestur menunjuk */
  messageKey: string;
}

const ORIGIN = `${ARM_PIVOT.x * 100}% ${ARM_PIVOT.y * 100}%`;

export function ArmLayer({ messageKey }: ArmLayerProps) {
  return (
    <div
      aria-hidden="true"
      className="animate-arm-sway absolute inset-0 will-change-transform pointer-events-none"
      style={{ transformOrigin: ORIGIN, backfaceVisibility: "hidden" }}
    >
      <div
        key={messageKey}
        className="animate-arm-point absolute inset-0 will-change-transform"
        style={{ transformOrigin: ORIGIN, backfaceVisibility: "hidden" }}
      >
        <img
          src={armUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
        />
      </div>
    </div>
  );
}

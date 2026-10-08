import { HEAD_PIVOT } from "@/lib/mascotGeometry";
import { EyeGroup } from "@/components/mascot/parts/EyeGroup";
import headUrl from "@/assets/mascot/mascot-head.webp";

/**
 * Kepala mascot (versi perbaikan dari gambar referensi baru —
 * proporsi lebih besar & ramah dibanding aset lama).
 *
 * Tiga gerak digabung lewat wrapper bertingkat supaya tidak bentrok:
 * 1. look-at (inline, dari pointer): kepala menoleh halus ke kursor
 * 2. sway (keyframes CSS): ayunan idle pelan di sekitar pivot dagu
 * 3. nod (keyframes, re-mount saat pesan berganti): anggukan singkat
 *    saat mascot "menyampaikan" pesan baru
 *
 * Mata (putih + pupil) adalah anak dari grup ini, sehingga ikut
 * bergerak bersama kepala secara alami.
 */
interface HeadLayerProps {
  pointer: { x: number; y: number };
  blinking: boolean;
  /** Berubah saat pesan papan berganti → memicu anggukan */
  messageKey: string;
}

export function HeadLayer({ pointer, blinking, messageKey }: HeadLayerProps) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 will-change-transform pointer-events-none"
      style={{
        transform: `rotate(${pointer.x * 3.2}deg) translate3d(${pointer.x * 0.7}%, ${pointer.y * 0.5}%, 0)`,
        transformOrigin: `${HEAD_PIVOT.x * 100}% ${HEAD_PIVOT.y * 100}%`,
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      <div className="animate-head-sway absolute inset-0">
        {/* key me-remount node → animasi angguk berjalan sekali per pesan */}
        <div key={messageKey} className="animate-head-nod absolute inset-0">
          <img
            src={headUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
          />
          <EyeGroup side="left" blinking={blinking} pointer={pointer} />
          <EyeGroup side="right" blinking={blinking} pointer={pointer} />
        </div>
      </div>
    </div>
  );
}

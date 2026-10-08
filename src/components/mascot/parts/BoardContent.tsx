import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMascotStore } from "@/stores/mascotStore";
import { BOARD_QUAD } from "@/lib/mascotGeometry";
import { homography, toMatrix3d, type Point } from "@/lib/homography";

/**
 * Isi papan mascot — dipetakan ke bidang papan yang sesungguhnya.
 *
 * Papan pada gambar tidak menghadap kamera secara frontal: ia sedikit
 * miring dan berperspektif. Alih-alih menaruh konten sebagai persegi
 * datar (yang terlihat "nempel" dan salah orientasi), konten dipetakan
 * dengan homografi penuh (matrix3d) ke empat sudut area putih papan —
 * rotasi, skew, dan perspektifnya mengikuti papan secara persis.
 * Berlaku untuk teks pesan maupun gambar yang diunggah pengguna.
 */

/** Teks pesan di atas papan — dipecah per kata untuk stagger reveal */
function BoardText({ messageKey }: { messageKey: string }) {
  const message = useMascotStore((s) => s.current());
  const words = message.title.split(" ");

  return (
    <div
      key={messageKey}
      className="flex h-full flex-col items-center justify-center gap-[1.2cqi] px-[2cqi] text-center"
    >
      <span className="animate-board-pop inline-flex items-center gap-[0.6cqi] rounded-full bg-red-50 px-[1.8cqi] py-[0.7cqi] text-[1.5cqi] font-bold tracking-[0.14em] text-brand uppercase">
        <span className="animate-badge-blink inline-block size-[0.9cqi] rounded-full bg-brand" />
        {message.badge}
      </span>
      <h2 className="text-[3cqi] leading-[1.15] font-extrabold tracking-tight text-stone-900">
        {words.map((word, i) => (
          <span key={`${messageKey}-${i}`}>
            <span className="inline-block overflow-hidden pb-[0.3cqi] align-bottom">
              <span
                className="animate-word-in inline-block will-change-transform"
                style={{ animationDelay: `${120 + i * 70}ms` }}
              >
                {word}
              </span>
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </h2>
      <p
        className="animate-word-in max-w-[26cqi] text-[1.6cqi] leading-snug font-medium text-stone-600"
        style={{ animationDelay: `${180 + words.length * 70}ms` }}
      >
        {message.subtitle}
      </p>
    </div>
  );
}

interface BoardContentProps {
  /** Data URL gambar kustom untuk isi papan (null = teks pesan) */
  boardImage: string | null;
  messageKey: string;
}

export function BoardContent({ boardImage, messageKey }: BoardContentProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  // Ukur stage (wrapper memenuhi stage) — homografi butuh piksel riil
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { transform, boxW, boxH } = useMemo(() => {
    if (!stage.w || !stage.h) return { transform: "none", boxW: 0, boxH: 0 };

    // Sudut papan dalam piksel stage, sedikit diperkecil ke pusat
    // agar konten tidak menyentuh bayangan tepi bingkai
    const cx = BOARD_QUAD.reduce((s, p) => s + p.x, 0) / 4;
    const cy = BOARD_QUAD.reduce((s, p) => s + p.y, 0) / 4;
    const dst: Point[] = BOARD_QUAD.map((p) => ({
      x: (cx + (p.x - cx) * 0.97) * stage.w,
      y: (cy + (p.y - cy) * 0.97) * stage.h,
    }));

    // Ukuran kotak konten ≈ rata-rata sisi quad (fraksi → piksel),
    // supaya ukuran font cqi mendekati benar sebelum ditransformasi
    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const w = (dist(dst[0], dst[1]) + dist(dst[3], dst[2])) / 2;
    const h = (dist(dst[0], dst[3]) + dist(dst[1], dst[2])) / 2;

    const src: Point[] = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];

    return { transform: toMatrix3d(homography(src, dst)), boxW: w, boxH: h };
  }, [stage]);

  return (
    <div
      ref={wrapRef}
      className="board-overlay pointer-events-none absolute inset-0"
      aria-hidden={boardImage ? undefined : true}
    >
      {boxW > 0 && (
        <div
          className={`absolute top-0 left-0 overflow-hidden will-change-transform ${
            boardImage ? "bg-white" : "bg-transparent"
          }`}
          style={{
            width: boxW,
            height: boxH,
            transform,
            transformOrigin: "0 0",
            borderRadius: "4.5% / 7%",
            boxShadow: boardImage ? "inset 0 0 1.2cqi rgb(0 0 0 / 0.08)" : undefined,
            backfaceVisibility: "hidden",
            willChange: "transform",
          }}
        >
          {boardImage ? (
            <img
              src={boardImage}
              alt="Gambar kustom di papan mascot"
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <BoardText messageKey={messageKey} />
          )}
        </div>
      )}
    </div>
  );
}

/** Fallback isi papan untuk panggung sangat sempit (ponsel kecil) */
export function BoardFallback({
  boardImage,
  messageKey,
}: BoardContentProps) {
  return (
    <div className="board-fallback relative z-10 mt-4 rounded-2xl border border-stone-200 bg-white p-5 text-center shadow-sm">
      {boardImage ? (
        <img
          src={boardImage}
          alt="Gambar kustom di papan mascot"
          draggable={false}
          className="mx-auto max-h-48 w-auto rounded-xl"
        />
      ) : (
        <BoardText messageKey={messageKey} />
      )}
    </div>
  );
}

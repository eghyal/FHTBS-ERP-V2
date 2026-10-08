import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMascotStore } from "@/stores/mascotStore";
import { usePointerPose } from "@/hooks/usePointerPose";
import { useBlink } from "@/hooks/useBlink";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ConfettiCanvas } from "@/components/mascot/ConfettiCanvas";
import { BaseLayer } from "@/components/mascot/parts/BaseLayer";
import { ArmLayer } from "@/components/mascot/parts/ArmLayer";
import { HeadLayer } from "@/components/mascot/parts/HeadLayer";
import {
  BoardContent,
  BoardFallback,
} from "@/components/mascot/parts/BoardContent";
import { MASCOT_CANVAS } from "@/lib/mascotGeometry";
import {
  X,
  Sparkles,
  ArrowRight,
  Phone,
  ShieldCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";

const ROTATE_MS = 6000;

interface MascotBoardProps {
  className?: string;
  /** Opsional: jika true, izinkan klik membuka modal detail (default: true) */
  enableDetailModal?: boolean;
}

export function MascotBoard({
  className = "",
  enableDetailModal = true,
}: MascotBoardProps) {
  const {
    messages,
    index,
    playing,
    boardImage,
    shirtPattern,
    next,
    goTo,
    current,
  } = useMascotStore();

  const { ref, pose, onPointerMove, onPointerLeave } =
    usePointerPose<HTMLDivElement>();
  const blinking = useBlink();
  const reduced = useReducedMotion();
  const [burstKey, setBurstKey] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const activeMessage = current();
  const messageKey = `msg-${index}-${messages.length}`;
  const pointer = { x: pose.x, y: pose.y };

  // Rotasi pesan otomatis di papan
  useEffect(() => {
    if (!playing || reduced || messages.length <= 1) return;
    const id = setInterval(next, ROTATE_MS);
    return () => clearInterval(id);
  }, [playing, reduced, next, messages.length]);

  const handleStageClick = () => {
    // Ledakan konfeti halus saat diklik
    setBurstKey((k) => k + 1);
    if (enableDetailModal) {
      setIsDetailModalOpen(true);
    } else {
      next();
    }
  };

  return (
    <div className={`relative w-full ${className}`}>
      <ConfettiCanvas
        burstKey={burstKey}
        className="pointer-events-none absolute -inset-8 z-20 h-[calc(100%+4rem)] w-[calc(100%+4rem)]"
      />

      {/* Panggung mascot 3D interaktif — bersih tanpa tombol kontrol atau badge teks */}
      <div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={handleStageClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleStageClick()}
        aria-label="Maskot Si Paving Joss CV Batu Emas — Klik untuk melihat detail pengumuman"
        className="mascot-stage group relative mx-auto w-full max-w-3xl cursor-pointer outline-none select-none transition-transform duration-300 hover:scale-[1.02]"
      >
        <div
          className="preserve-3d will-change-transform"
          style={{
            transform: `rotateX(${pose.rotateX}deg) rotateY(${pose.rotateY}deg)`,
            transformStyle: "preserve-3d",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          {/* Bayangan bernapas */}
          <div className="animate-shadow-breathe absolute bottom-[2%] left-1/2 h-[4%] w-[62%] -translate-x-1/2 rounded-[50%] bg-stone-900/30 blur-md" />

          {/* Perakitan mascot — semua layer full-kanvas, float bersama */}
          <div
            className="animate-mascot-float relative w-full"
            style={{
              aspectRatio: `${MASCOT_CANVAS.width} / ${MASCOT_CANVAS.height}`,
            }}
          >
            {/* Pola baju dikontrol manual oleh user via upload/reset */}
            <BaseLayer shirtPattern={shirtPattern} />
            <BoardContent boardImage={boardImage} messageKey={messageKey} />
            <ArmLayer messageKey={messageKey} />
            <HeadLayer
              pointer={pointer}
              blinking={blinking}
              messageKey={messageKey}
            />
          </div>
        </div>

        {/* Fallback teks untuk layar perangkat sangat kecil */}
        <BoardFallback boardImage={boardImage} messageKey={messageKey} />
      </div>

      {/* Modal Detail Papan Ucapan & Pengumuman Maskot (55% Window Width, Window Center Pop-up, Glassy Blur) */}
      {isDetailModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 md:p-8 bg-stone-950/45 backdrop-blur-2xl animate-fadeIn transition-all duration-300"
            onClick={() => setIsDetailModalOpen(false)}
          >
            <div
              className="relative w-full max-w-[92vw] sm:max-w-[70vw] md:max-w-[58vw] lg:max-w-[55vw] xl:max-w-[55vw] max-h-[85vh] flex flex-col bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-[0_30px_90px_-15px_rgba(0,0,0,0.4)] border border-white/80 overflow-hidden transform transition-all animate-scaleUp"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal Glassy */}
              <div className="flex items-center justify-between px-6 sm:px-8 py-4 border-b border-stone-200/60 bg-white/60 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-red-50 text-brand border border-red-100/60 shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                      Pengumuman &amp; Pesan Maskot
                    </h3>
                    <p className="text-xs text-stone-500 font-medium">
                      CV Batu Emas • Pabrik Paving Blok Mutu K-300 &amp; K-400
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="p-2 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-all cursor-pointer"
                  aria-label="Tutup modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Isi Konten Papan (Scrollable if content is long) */}
              <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
                {boardImage ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-stone-200/80 shadow-inner bg-stone-100/80 max-h-80 flex items-center justify-center">
                      <img
                        src={boardImage}
                        alt="Banner Pengumuman Maskot"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-brand rounded-full text-xs font-bold border border-red-100/60">
                        <Sparkles className="w-3.5 h-3.5" /> Banner Khusus Terpasang
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-red-50 text-brand border border-red-200/70 rounded-full text-xs font-bold tracking-wider uppercase shadow-xs">
                      <span className="size-2 rounded-full bg-brand animate-pulse" />
                      {activeMessage.badge}
                    </span>

                    <h2 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight leading-snug">
                      {activeMessage.title}
                    </h2>

                    <p className="text-base sm:text-lg text-stone-600 font-medium max-w-xl mx-auto leading-relaxed">
                      {activeMessage.subtitle}
                    </p>
                  </div>
                )}

                {/* Navigasi pesan jika ada lebih dari 1 pesan (dan bukan gambar custom) */}
                {!boardImage && messages.length > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-stone-200/60">
                    <button
                      onClick={() => {
                        const prevIdx = (index - 1 + messages.length) % messages.length;
                        goTo(prevIdx);
                      }}
                      className="px-3.5 py-1.5 rounded-xl border border-stone-200 bg-white/90 hover:bg-stone-50 text-xs font-bold text-stone-700 flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                    >
                      <ChevronLeft className="w-4 h-4" /> Pesan Sebelumnya
                    </button>

                    <div className="flex items-center gap-1.5">
                      {messages.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goTo(i)}
                          className={`size-2 rounded-full transition-all cursor-pointer ${
                            i === index ? "w-6 bg-brand" : "bg-stone-300 hover:bg-stone-400"
                          }`}
                          aria-label={`Ke pesan ${i + 1}`}
                        />
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        const nextIdx = (index + 1) % messages.length;
                        goTo(nextIdx);
                      }}
                      className="px-3.5 py-1.5 rounded-xl border border-stone-200 bg-white/90 hover:bg-stone-50 text-xs font-bold text-stone-700 flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                    >
                      Pesan Berikutnya <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Nilai Utama Pabrik */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/60 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-stone-900">Uji Kuat Tekan K300-K400</h4>
                      <p className="text-[11px] text-stone-500">Standar SNI beton hidrolik presisi tinggi.</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/60 flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-stone-900">Armada &amp; Pabrik Sendiri</h4>
                      <p className="text-[11px] text-stone-500">Pengiriman langsung Banyuwangi &amp; sekitarnya.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Aksi Glassy */}
              <div className="px-6 sm:px-8 py-4 bg-stone-50/90 backdrop-blur-md border-t border-stone-200/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <a
                  href="https://wa.me/6281111113993?text=Halo%20CV%20Batu%20Emas,%20saya%20tertarik%20konsultasi%20pesanan%20paving%20blok."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-md cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Konsultasi via WhatsApp</span>
                </a>

                <div className="flex items-center gap-2">
                  <Link
                    to="/shop"
                    onClick={() => setIsDetailModalOpen(false)}
                    className="px-5 py-2.5 bg-brand hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <span>Lihat Katalog Produk</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

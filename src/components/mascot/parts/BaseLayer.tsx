import baseUrl from "@/assets/mascot/mascot-base.webp";
import baseBlankUrl from "@/assets/mascot/mascot-base-shirt-blank.webp";
import shirtMaskUrl from "@/assets/mascot/mascot-shirt-mask.png";
import shirtCreaseUrl from "@/assets/mascot/mascot-shirt-crease.png";

/**
 * Tubuh dasar mascot (tanpa kepala & lengan penunjuk).
 * Termasuk papan pengumuman & tangan penggenggam atas.
 *
 * Kustomisasi Baju Komprehensif:
 * Saat pengguna mengunggah motif kustom, base otomatis beralih ke
 * varian kain netral 3D (baseBlankUrl). Pola kustom kemudian di-overlay
 * dengan mask presisi anti-aliased (alpha mask), diblend multiply
 * terhadap lipatan kain asli, dan disempurnakan dengan layer crease &
 * specular highlights (shirtCreaseUrl) untuk efek bahan pakaian 3D yang
 * fotorealistis dan berdimensi tinggi.
 */
interface BaseLayerProps {
  /** Data URL / URL motif kustom baju (null = motif bunga bawaan pabrik) */
  shirtPattern: string | null;
}

export function BaseLayer({ shirtPattern }: BaseLayerProps) {
  return (
    <div className="absolute inset-0 h-full w-full pointer-events-none select-none">
      {/* 1. Base Mesh Layer: Baju polos netral 3D atau motif bawaan */}
      <img
        src={shirtPattern ? baseBlankUrl : baseUrl}
        alt="Si Paving Joss — mascot blok paving"
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
      />

      {/* 2. Custom Pattern Overlay Layer (Multiplied into 3D cloth base) */}
      {shirtPattern && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 mix-blend-multiply"
            style={{
              backgroundImage: `url(${shirtPattern})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              opacity: 0.94,
              WebkitMaskImage: `url(${shirtMaskUrl})`,
              maskImage: `url(${shirtMaskUrl})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
            }}
          />

          {/* 3. 3D Crease, Seam Shadow & Specular Highlight Layer (Overlay blend) */}
          <img
            src={shirtCreaseUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain mix-blend-overlay opacity-90"
            style={{
              WebkitMaskImage: `url(${shirtMaskUrl})`,
              maskImage: `url(${shirtMaskUrl})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
            }}
          />
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";

export interface CatalogProductItem {
  id: string;
  name: string;
  dimension?: string;
  category?: string;
  spec?: string;
  badge?: string;
  image_url: string;
  gallery_urls?: string[];
  shop_gallery_urls?: string[] | string;
  uom?: string;
}

interface TileSlotConfig {
  id: string;
  label: string;
  sizeType: "large" | "wide" | "tall" | "medium";
  className: string;
  intervalMs: number;
  animType: "flip" | "slide-up" | "slide-down" | "crossfade";
}

// 9 Windows Phone Metro Live Tile slots arranged seamlessly with gap-0
// Desktop: 4 columns x 4 rows matrix (completely filled, no gaps)
// Mobile: 2 columns x 8 rows matrix (completely filled, no gaps)
const TILE_SLOTS: TileSlotConfig[] = [
  {
    id: "slot-0",
    label: "Hero Live Tile (2x2)",
    sizeType: "large",
    className:
      "col-span-2 row-span-2 md:col-span-2 md:row-span-2 min-h-[360px] md:min-h-[440px]",
    intervalMs: 5400,
    animType: "flip",
  },
  {
    id: "slot-1",
    label: "Medium Tile A (1x1)",
    sizeType: "medium",
    className:
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1 min-h-[180px] md:min-h-[220px]",
    intervalMs: 4200,
    animType: "slide-up",
  },
  {
    id: "slot-2",
    label: "Medium Tile B (1x1)",
    sizeType: "medium",
    className:
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1 min-h-[180px] md:min-h-[220px]",
    intervalMs: 6500,
    animType: "crossfade",
  },
  {
    id: "slot-3",
    label: "Wide Tile A (2x1)",
    sizeType: "wide",
    className:
      "col-span-2 row-span-1 md:col-span-2 md:row-span-1 min-h-[180px] md:min-h-[220px]",
    intervalMs: 4800,
    animType: "slide-down",
  },
  {
    id: "slot-4",
    label: "Tall Live Tile (1x2)",
    sizeType: "tall",
    className:
      "col-span-1 row-span-2 md:col-span-1 md:row-span-2 min-h-[360px] md:min-h-[440px]",
    intervalMs: 7200,
    animType: "flip",
  },
  {
    id: "slot-5",
    label: "Wide Tile B (2x1 on desktop, 1x1 on mobile)",
    sizeType: "wide",
    className:
      "col-span-1 row-span-1 md:col-span-2 md:row-span-1 min-h-[180px] md:min-h-[220px]",
    intervalMs: 5100,
    animType: "slide-up",
  },
  {
    id: "slot-6",
    label: "Medium Tile C (1x1 on desktop, 2x1 on mobile)",
    sizeType: "medium",
    className:
      "col-span-2 row-span-1 md:col-span-1 md:row-span-1 min-h-[180px] md:min-h-[220px]",
    intervalMs: 6100,
    animType: "crossfade",
  },
  {
    id: "slot-7",
    label: "Medium Tile D (1x1)",
    sizeType: "medium",
    className:
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1 min-h-[180px] md:min-h-[220px]",
    intervalMs: 4600,
    animType: "slide-down",
  },
  {
    id: "slot-8",
    label: "Wide Tile C (2x1)",
    sizeType: "wide",
    className:
      "col-span-2 row-span-1 md:col-span-2 md:row-span-1 min-h-[180px] md:min-h-[220px]",
    intervalMs: 7600,
    animType: "flip",
  },
];

interface LiveTileCellProps {
  slot: TileSlotConfig;
  pool: CatalogProductItem[];
  slotIndex: number;
}

const LiveTileCell: React.FC<LiveTileCellProps> = ({ slot, pool, slotIndex }) => {
  const [index, setIndex] = useState(0);

  // Rotate items within this slot based on its own staggered timer
  useEffect(() => {
    if (pool.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % pool.length);
    }, slot.intervalMs);

    return () => clearInterval(timer);
  }, [pool.length, slot.intervalMs]);

  const currentItem = pool[index % pool.length];

  if (!currentItem) return null;

  // Animation variants inspired by Windows Phone Live Tiles
  const getVariants = () => {
    switch (slot.animType) {
      case "flip":
        return {
          initial: { rotateX: 90, opacity: 0 },
          animate: { rotateX: 0, opacity: 1 },
          exit: { rotateX: -90, opacity: 0 },
          transition: { duration: 0.65, ease: "easeOut" as const },
        };
      case "slide-up":
        return {
          initial: { y: "100%", opacity: 0.8 },
          animate: { y: "0%", opacity: 1 },
          exit: { y: "-100%", opacity: 0.8 },
          transition: { duration: 0.7, ease: "easeInOut" as const },
        };
      case "slide-down":
        return {
          initial: { y: "-100%", opacity: 0.8 },
          animate: { y: "0%", opacity: 1 },
          exit: { y: "100%", opacity: 0.8 },
          transition: { duration: 0.7, ease: "easeInOut" as const },
        };
      case "crossfade":
      default:
        return {
          initial: { scale: 1.08, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          exit: { scale: 0.95, opacity: 0 },
          transition: { duration: 0.75, ease: "easeInOut" as const },
        };
    }
  };

  const variants = getVariants();

  return (
    <div
      id={`live-tile-${slot.id}`}
      className={`relative overflow-hidden bg-stone-950 border border-white/20 ${slot.className} select-none cursor-default group`}
      style={{ perspective: 1000 }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${currentItem.id}-${index}`}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={variants.transition}
          className="absolute inset-0 w-full h-full"
          style={{ transformStyle: "preserve-3d", willChange: "transform, opacity" }}
        >
          {/* Product Photograph */}
          <img
            src={currentItem.image_url}
            alt={currentItem.name}
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (!target.src.includes("1528698827591")) {
                target.src = "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800&auto=format&fit=crop&q=80";
              }
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />

          {/* Clean Dark Scrim Overlay for Title Contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent group-hover:from-black/90 transition-all duration-300" />

          {/* Bottom Title & Specs */}
          <div className="absolute bottom-0 left-0 right-0 p-3.5 md:p-5 z-10 flex flex-col justify-end text-left pointer-events-none">
            <h3
              className={`font-extrabold text-white leading-snug tracking-tight drop-shadow-md ${
                slot.sizeType === "large"
                  ? "text-base sm:text-xl md:text-2xl line-clamp-2"
                  : slot.sizeType === "wide"
                  ? "text-sm sm:text-base md:text-lg truncate"
                  : slot.sizeType === "tall"
                  ? "text-sm sm:text-base md:text-lg line-clamp-3"
                  : "text-xs sm:text-sm line-clamp-2"
              }`}
            >
              {currentItem.name}
            </h3>
            {currentItem.dimension && (
              <span className="text-[11px] text-stone-300 font-mono mt-0.5 opacity-90 drop-shadow-sm">
                {currentItem.dimension}
              </span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

interface LiveTileCollageProps {
  products: CatalogProductItem[];
  activeCategory: string;
}

export const LiveTileCollage: React.FC<LiveTileCollageProps> = ({
  products,
  activeCategory,
}) => {
  // Flatten all photos per item so each uploaded reference photo gets a spot in the Live Tile pool
  const flattenedPool = useMemo(() => {
    if (!products || products.length === 0) return [];
    const list: CatalogProductItem[] = [];

    products.forEach((p) => {
      let g: string[] = [];
      if (Array.isArray(p.gallery_urls) && p.gallery_urls.length > 0) {
        g = p.gallery_urls;
      } else if (typeof p.shop_gallery_urls === "string") {
        try {
          g = JSON.parse(p.shop_gallery_urls);
        } catch {
          g = [];
        }
      } else if (Array.isArray(p.shop_gallery_urls) && p.shop_gallery_urls.length > 0) {
        g = p.shop_gallery_urls;
      }

      if (Array.isArray(g) && g.length > 0) {
        g.forEach((url, photoIdx) => {
          if (url && typeof url === "string" && url.trim()) {
            list.push({
              ...p,
              id: `${p.id}-p${photoIdx}`,
              image_url: url.trim(),
            });
          }
        });
      } else if (p.image_url) {
        list.push(p);
      }
    });

    return list;
  }, [products]);

  const filteredProducts =
    activeCategory === "ALL"
      ? flattenedPool
      : flattenedPool.filter((p) => p.category === activeCategory);

  const totalPool = filteredProducts.length > 0 ? filteredProducts : flattenedPool;

  if (totalPool.length === 0) {
    return null;
  }

  // Partition the total product pool across the 9 tile slots
  const getSlotPool = (slotIndex: number): CatalogProductItem[] => {
    if (totalPool.length <= TILE_SLOTS.length) {
      // If pool is small, distribute with offsets so slots don't show identical items
      return [
        totalPool[slotIndex % totalPool.length],
        totalPool[(slotIndex + 3) % totalPool.length],
        totalPool[(slotIndex + 7) % totalPool.length],
      ].filter(Boolean);
    }

    // When we have a rich catalog, assign rotating items per slot
    const items: CatalogProductItem[] = [];
    for (let i = 0; i < totalPool.length; i++) {
      if (i % TILE_SLOTS.length === slotIndex) {
        items.push(totalPool[i]);
      }
    }
    // Also include a secondary item to ensure every slot always rotates
    if (items.length <= 1) {
      const extra = totalPool[(slotIndex + TILE_SLOTS.length) % totalPool.length];
      if (extra && !items.some((it) => it.id === extra.id)) {
        items.push(extra);
      }
    }
    return items.length > 0 ? items : [totalPool[0]];
  };

  return (
    <div className="w-full">
      {/* Mosaic Container with gap-0 (seamless touching tiles like Windows Phone Live Tiles) */}
      <div className="w-full rounded-[2rem] overflow-hidden border-2 border-white shadow-2xl bg-stone-950">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 p-0 m-0">
          {TILE_SLOTS.map((slot, idx) => (
            <LiveTileCell
              key={slot.id}
              slot={slot}
              pool={getSlotPool(idx)}
              slotIndex={idx}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

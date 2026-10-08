import React, { useRef, useEffect, useState } from "react";

export const PdfPreviewWrapper = ({ children }: { children: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - 32;
        const targetWidth = 794;
        
        if (availableWidth < targetWidth && availableWidth > 0) {
          setScale(availableWidth / targetWidth);
        } else {
          setScale(1);
        }
      }
    };

    updateScale();
    setMounted(true);
    
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    
    window.addEventListener("resize", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      observer.disconnect();
    };
  }, []);

  const scaledHeight = 1123 * scale;

  return (
    <div 
      ref={containerRef} 
      className="w-full bg-stone-200/50 rounded-xl border border-stone-200 overflow-hidden relative"
      style={{ 
        minHeight: `${scaledHeight + 32}px`,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.2s"
      }}
    >
      <div 
        className="absolute top-4 left-1/2 origin-top transition-transform duration-200 ease-out"
        style={{ 
          transform: `translateX(-50%) scale(${scale})` 
        }}
      >
        {children}
      </div>
    </div>
  );
};

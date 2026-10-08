import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  text?: string;
  className?: string;
  fullScreen?: boolean;
}

export const Loader = React.memo(function Loader({
  text = "Loading...",
  className,
  fullScreen = false,
}: LoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center bg-stone-50/60 backdrop-blur-md z-50",
        fullScreen
          ? "fixed inset-0"
          : "flex-1 w-full h-[calc(100vh-12rem)] min-h-[400px]",
        className,
      )}
    >
      <div className="flex items-center justify-center gap-3 mb-6">
        {[0, 1, 2].map((i) => {
          const widths = [
            ["16px", "16px", "16px", "64px", "16px"],
            ["16px", "16px", "64px", "16px", "16px"],
            ["16px", "64px", "16px", "16px", "16px"],
          ];

          return (
            <motion.div
              key={i}
              initial={{ width: "16px" }}
              animate={{ width: widths[i] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                times: [0, 0.25, 0.5, 0.75, 1],
              }}
              className="h-[6px] bg-stone-500 rounded-full"
            />
          );
        })}
      </div>

      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        className="flex flex-col items-center"
      >
        <span className="text-xs font-bold tracking-[0.25em] text-stone-500 uppercase">
          {text}
        </span>
      </motion.div>
    </div>
  );
});

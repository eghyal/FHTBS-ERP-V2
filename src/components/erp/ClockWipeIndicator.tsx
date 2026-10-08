import React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClockWipeIndicatorProps {
  remainingSeconds?: number;
  totalSeconds?: number;
  progressPercent?: number;
  isRunning?: boolean;
  isPaused?: boolean;
  isCompleted?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export const ClockWipeIndicator: React.FC<ClockWipeIndicatorProps> = ({
  remainingSeconds,
  totalSeconds,
  progressPercent: explicitProgress,
  isRunning = true,
  isPaused = false,
  isCompleted = false,
  size = "md",
  showLabel = true,
  className,
}) => {
  let progress = 0;
  if (explicitProgress !== undefined) {
    progress = Math.min(100, Math.max(0, explicitProgress));
  } else if (totalSeconds !== undefined && remainingSeconds !== undefined) {
    const safeTotal = Math.max(0.1, totalSeconds);
    const safeRemaining = Math.max(0, remainingSeconds);
    const elapsed = Math.max(0, safeTotal - safeRemaining);
    progress = Math.min(100, Math.max(0, (elapsed / safeTotal) * 100));
  }

  if (isCompleted) {
    progress = 100;
  }

  const prevProgressRef = React.useRef(progress);
  const isResetting = progress < prevProgressRef.current - 5;

  React.useEffect(() => {
    prevProgressRef.current = progress;
  }, [progress]);

  // Diameter and stroke width based on size
  const dim = size === "xs" ? 20 : size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const stroke = size === "xs" ? 2 : size === "sm" ? 2.5 : size === "lg" ? 4 : 3;
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Degrees for the clock wipe pointer (0° is top / -90deg in standard cartesian)
  const rotationDegrees = (progress / 100) * 360;

  const secondsLeft = remainingSeconds !== undefined ? Math.max(0, Math.ceil(remainingSeconds)) : 0;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div 
        className="relative shrink-0 flex items-center justify-center select-none"
        style={{ width: dim, height: dim }}
      >
        {/* Smooth Conic Wipe Sweep Background when running */}
        {isRunning && !isPaused && !isCompleted && (
          <div 
            className="absolute inset-0 rounded-full opacity-25"
            style={{
              background: `conic-gradient(from -90deg, #3b82f6 0%, #3b82f6 ${progress}%, transparent ${progress}% 100%)`,
              transition: isResetting ? "none" : "background 0.05s linear"
            }}
          />
        )}

        <svg
          width={dim}
          height={dim}
          className="-rotate-90 transform block"
        >
          {/* Background circle track */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="transparent"
            className={cn(
              isCompleted ? "text-emerald-100" : isPaused ? "text-amber-100" : "text-stone-200/80"
            )}
          />

          {/* Clock Wipe Sweeping Progress Circle */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: isResetting ? "none" : "stroke-dashoffset 0.05s linear"
            }}
            className={cn(
              isCompleted 
                ? "text-emerald-600" 
                : isPaused 
                ? "text-amber-500" 
                : isRunning 
                ? "text-blue-600" 
                : "text-stone-300"
            )}
          />
        </svg>

        {/* Center Clock Sweep Needle / Indicator */}
        {isRunning && !isPaused && !isCompleted ? (
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ 
              transform: `rotate(${rotationDegrees}deg)`,
              transition: isResetting ? "none" : "transform 0.05s linear"
            }}
          >
            <div 
              className={cn(
                "rounded-full bg-blue-600 shadow-2xs",
                size === "xs" ? "w-0.5" : "w-1"
              )}
              style={{ 
                height: radius * 0.9, 
                transform: "translateY(-50%)" 
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {isCompleted ? (
              <div className={cn("rounded-full bg-emerald-600", size === "xs" ? "w-1.5 h-1.5" : "w-2 h-2")} />
            ) : isPaused ? (
              <div className={cn("rounded-full bg-amber-500", size === "xs" ? "w-1.5 h-1.5" : "w-2 h-2")} />
            ) : (
              <Clock className={cn(
                size === "xs" ? "w-2.5 h-2.5" : size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5", 
                "text-stone-400"
              )} />
            )}
          </div>
        )}
      </div>

      {showLabel && (
        <div className="flex flex-col select-none">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold leading-none">
            <span className={cn(
              isCompleted ? "text-emerald-700" : isPaused ? "text-amber-700" : isRunning ? "text-blue-700" : "text-stone-600"
            )}>
              {isCompleted 
                ? "Completed" 
                : isPaused 
                ? "Paused" 
                : remainingSeconds !== undefined
                ? `${Math.floor(secondsLeft / 60)}:${(secondsLeft % 60).toString().padStart(2, "0")}`
                : `${Math.round(progress)}%`}
            </span>
            {isRunning && !isPaused && !isCompleted && (
              <span className="text-[10px] text-stone-400 font-sans font-normal">
                ({Math.round(progress)}%)
              </span>
            )}
          </div>
          <span className="text-[10px] text-stone-400 font-medium leading-tight mt-0.5">
            {isCompleted ? "Cycle Finished" : isPaused ? "Downtime / Paused" : isRunning ? "Cycle Time Clock Wipe" : "Ready"}
          </span>
        </div>
      )}
    </div>
  );
};

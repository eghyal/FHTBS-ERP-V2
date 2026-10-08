import React, { memo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string; // For additional styling on the modal container
  contentClassName?: string; // For styling the content wrapper (e.g. to remove default padding)
  maxWidth?:
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl"
    | "7xl"
    | "full";
}

export const Modal = memo(function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  contentClassName,
  maxWidth = "lg",
}: ModalProps) {
  const maxWidthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-full m-4",
  }[maxWidth];

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[200]"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 sm:p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: "100%" }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: "100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "bg-white w-full flex flex-col pointer-events-auto",
                "max-h-[90vh] md:max-h-[85vh]",
                "rounded-t-[1.5rem] md:rounded-[2rem]",
                "mt-auto md:mt-0", // Bottom sheet effect on mobile
                "shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] md:shadow-2xl", // Shadow up for bottom sheet
                maxWidthClass,
                className,
              )}
            >
              {title && (
                <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-4 md:p-8 border-b border-stone-100 shrink-0 rounded-t-[1.5rem] md:rounded-[2rem]">
                  <div className="flex-1">
                    {typeof title === "string" ? (
                      <h3 className="text-lg md:text-xl font-bold tracking-tight text-stone-900">
                        {title}
                      </h3>
                    ) : (
                      title
                    )}
                    {description && (
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-1.5">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 ml-4 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
              <div
                className={cn(
                  "overflow-y-auto p-4 md:p-8 custom-scrollbar",
                  contentClassName,
                )}
              >
                {children}
              </div>
            </motion.div>
          </div>
        </React.Fragment>
      )}
    </AnimatePresence>,
    document.body,
  );
});

import React, { useState } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "warning" | "info" | "positive";
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmModal = React.memo(function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "warning",
  isDestructive,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const finalVariant = isDestructive ? "destructive" : variant;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  const iconConfig = {
    destructive: {
      bg: "bg-rose-50 border-rose-100 text-rose-600",
      btn: "danger" as const,
    },
    warning: {
      bg: "bg-amber-50 border-amber-100 text-amber-600",
      btn: "primary" as const,
    },
    positive: {
      bg: "bg-emerald-50 border-emerald-100 text-emerald-600",
      btn: "primary" as const,
    },
    info: {
      bg: "bg-blue-50 border-blue-100 text-blue-500",
      btn: "primary" as const,
    },
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="sm" className="p-0">
      <div className="text-center">
        <div
          className={cn(
            "w-16 h-16 rounded-[1.5rem] mx-auto flex items-center justify-center mb-6 border",
            iconConfig[finalVariant].bg,
          )}
        >
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold tracking-tight text-stone-900 mb-2">
          {title}
        </h3>
        {typeof message === "string" ? (
          <p className="text-sm font-medium leading-relaxed text-stone-500 mb-8">
            {message}
          </p>
        ) : (
          <div className="mb-8">{message}</div>
        )}

        {children && <div className="mb-8">{children}</div>}

        <div className="flex gap-3 w-full">
          <Button
            variant="secondary"
            onClick={onCancel}
            className="flex-1"
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={iconConfig[finalVariant].btn}
            onClick={handleConfirm}
            className="flex-1"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
});

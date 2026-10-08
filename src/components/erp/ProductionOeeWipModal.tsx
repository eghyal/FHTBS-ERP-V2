import React from "react";
import { Modal } from "@/components/ui/Modal";
import { ProductionOeeWipView } from "./ProductionOeeWipView";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  targetQty?: number;
  uom?: string;
}

export function ProductionOeeWipModal({ isOpen, onClose, projectId, projectName, targetQty, uom }: Props) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="7xl" title={`Production Intelligence • ${projectName || "Project Analytics"}`}>
      <div className="p-1">
        <ProductionOeeWipView
          projectId={projectId}
          projectName={projectName}
          targetQty={targetQty}
          uom={uom}
        />
      </div>
    </Modal>
  );
}

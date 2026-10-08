import React from "react";
import { 
  ProductionCapacityOptimizerModal, 
  ProductionCapacityOptimizerModalProps 
} from "./ProductionCapacityOptimizerModal";

export interface WotSizeOptimizerModalProps extends Partial<ProductionCapacityOptimizerModalProps> {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentLotSize?: number;
}

export const WotSizeOptimizerModal: React.FC<WotSizeOptimizerModalProps> = ({
  isOpen,
  onClose,
  projectId,
  currentLotSize = 50,
  ...rest
}) => {
  return (
    <ProductionCapacityOptimizerModal
      isOpen={isOpen}
      onClose={onClose}
      projectId={projectId}
      initialLotSize={currentLotSize}
      currentLotSize={currentLotSize}
      {...rest}
    />
  );
};

export { ProductionCapacityOptimizerModal };
export default WotSizeOptimizerModal;

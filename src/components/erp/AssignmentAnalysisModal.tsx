import React from "react";
import { 
  ProductionCapacityOptimizerModal, 
  ProductionCapacityOptimizerModalProps 
} from "./ProductionCapacityOptimizerModal";

export const AssignmentAnalysisModal: React.FC<ProductionCapacityOptimizerModalProps> = (props) => {
  return <ProductionCapacityOptimizerModal {...props} />;
};

export { ProductionCapacityOptimizerModal };
export default ProductionCapacityOptimizerModal;

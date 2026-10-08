import { create } from 'zustand';

interface ProductionState {
  bopData: any[];
  setBopData: (data: any[]) => void;
  updateBopStatus: (bopId: string, status: string, progress?: number, completedQty?: number) => void;
}

export const useProductionStore = create<ProductionState>((set) => ({
  bopData: [],
  setBopData: (data) => set({ 
    bopData: Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray((data as any).bop) ? (data as any).bop : [])
  }),
  updateBopStatus: (bopId, status, progress, completedQty) => set((state) => ({
    bopData: (Array.isArray(state.bopData) ? state.bopData : []).map((bop) => {
      if (bop.id === bopId) {
        return {
          ...bop,
          status,
          ...(progress !== undefined ? { progress } : {}),
          ...(completedQty !== undefined ? { completed_qty: completedQty } : {})
        };
      }
      return bop;
    })
  }))
}));

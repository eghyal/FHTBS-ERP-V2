import { create } from 'zustand';

interface ProductionHubState {
  currentPhase: 'SETUP' | 'PLANNING' | 'LOGGER' | 'CLOSING';
  setCurrentPhase: (phase: 'SETUP' | 'PLANNING' | 'LOGGER' | 'CLOSING') => void;
  factoryFactor: number;
  setFactoryFactor: (val: number) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  isGeneratingLots: boolean;
  setIsGeneratingLots: (val: boolean) => void;
  stations: any[];
  setStations: (val: any[]) => void;
  isSettingMaster: boolean;
  setIsSettingMaster: (val: boolean) => void;
  showAnalysisModal: boolean;
  setShowAnalysisModal: (val: boolean) => void;
  sidePanelAssignStep: any;
  setSidePanelAssignStep: (val: any) => void;
  showBatchStartPreview: boolean;
  setShowBatchStartPreview: (val: boolean) => void;
  showProcurementDrawer: boolean;
  setShowProcurementDrawer: (val: boolean) => void;
  inlineNdpStepId: string | null;
  setInlineNdpStepId: (val: string | null) => void;
  showLotsLabelsModal: boolean;
  setShowLotsLabelsModal: (val: boolean) => void;
  isExportingLabels: boolean;
  setIsExportingLabels: (val: boolean) => void;
  customLotSize: number;
  setCustomLotSize: (val: number) => void;
  project: any;
  setProject: (val: any) => void;
  spkData: any;
  setSpkData: (val: any) => void;
  bom: any[];
  setBom: (val: any[]) => void;
  shortageAnalysis: any[];
  setShortageAnalysis: (val: any[]) => void;
  lots: any[];
  setLots: (val: any[]) => void;
  machines: any[];
  setMachines: (val: any[]) => void;
  activeNdps: any[];
  setActiveNdps: (val: any[]) => void;
  itemsCatalog: any[];
  setItemsCatalog: (val: any[]) => void;
  stationTimers: Record<string, { remainingSecs: number; totalSecs: number; progressPercent: number }>;
  setStationTimers: (val: any | ((prev: any) => any)) => void;
  selectedBop: any;
  setSelectedBop: (val: any) => void;
  showFgrModal: boolean;
  setShowFgrModal: (val: boolean) => void;
  fgrData: any;
  setFgrData: (val: any) => void;
  isFinishing: boolean;
  setIsFinishing: (val: boolean) => void;
  confirmModal: {isOpen: boolean; title?: string; message?: string; action?: () => void};
  setConfirmModal: (val: {isOpen: boolean; title?: string; message?: string; action?: () => void}) => void;
  selectedTagForView: any;
  setSelectedTagForView: (val: any) => void;
  selectedNdpForView: any;
  setSelectedNdpForView: (val: any) => void;
  showQrScannerModal: boolean;
  setShowQrScannerModal: (val: boolean) => void;
  ndpForm: { category: string; description: string; urgency: string; reported_by: string };
  setNdpForm: (val: { category: string; description: string; urgency: string; reported_by: string }) => void;
  bopSearchQuery: string;
  setBopSearchQuery: (val: string) => void;
  editingCtStepId: string | null;
  setEditingCtStepId: (val: string | null) => void;
  editingCtValue: number;
  setEditingCtValue: (val: number) => void;
  stationEtas: any[];
  setStationEtas: (val: any[]) => void;
  wots: any[];
  setWots: (val: any[]) => void;
  cpmData: any;
  setCpmData: (val: any) => void;
  gapAnalysis: any;
  setGapAnalysis: (val: any) => void;
  cpmAnalysis: any;
  setCpmAnalysis: (val: any) => void;
  stationOeeMap: Record<string, { availability: number; performance: number; quality: number; oee: number }>;
  setStationOeeMap: (val: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  selectedWotForTrace: any;
  setSelectedWotForTrace: (val: any) => void;
  activeViewMode: 'KANBAN' | 'CONVEYOR' | 'MATRIX';
  setActiveViewMode: (val: 'KANBAN' | 'CONVEYOR' | 'MATRIX') => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
}

const ensureArray = (val: any, propertyKey?: string): any[] => {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    if (propertyKey && Array.isArray(val[propertyKey])) return val[propertyKey];
    if (Array.isArray(val.data)) return val.data;
    if (Array.isArray(val.stations)) return val.stations;
    if (Array.isArray(val.items)) return val.items;
    if (Array.isArray(val.lots)) return val.lots;
    if (Array.isArray(val.machines)) return val.machines;
    if (Array.isArray(val.ndps)) return val.ndps;
    if (Array.isArray(val.ndp)) return val.ndp;
    if (Array.isArray(val.bom)) return val.bom;
    if (Array.isArray(val.shortages)) return val.shortages;
  }
  return [];
};

export const useProductionHubStore = create<ProductionHubState>((set) => ({
  currentPhase: 'SETUP',
  setCurrentPhase: (phase) => set({ currentPhase: phase }),
  factoryFactor: 85,
  setFactoryFactor: (val) => set({ factoryFactor: val }),
  isLoading: true,
  setIsLoading: (val) => set({ isLoading: val }),
  isGeneratingLots: false,
  setIsGeneratingLots: (val) => set({ isGeneratingLots: val }),
  stations: [],
  setStations: (val) => set({ stations: ensureArray(val, 'stations') }),
  isSettingMaster: false,
  setIsSettingMaster: (val) => set({ isSettingMaster: val }),
  showAnalysisModal: false,
  setShowAnalysisModal: (val) => set({ showAnalysisModal: val }),
  sidePanelAssignStep: null,
  setSidePanelAssignStep: (val) => set({ sidePanelAssignStep: val }),
  showBatchStartPreview: false,
  setShowBatchStartPreview: (val) => set({ showBatchStartPreview: val }),
  showProcurementDrawer: false,
  setShowProcurementDrawer: (val) => set({ showProcurementDrawer: val }),
  inlineNdpStepId: null,
  setInlineNdpStepId: (val) => set({ inlineNdpStepId: val }),
  showLotsLabelsModal: false,
  setShowLotsLabelsModal: (val) => set({ showLotsLabelsModal: val }),
  isExportingLabels: false,
  setIsExportingLabels: (val) => set({ isExportingLabels: val }),
  customLotSize: 100,
  setCustomLotSize: (val) => set({ customLotSize: val }),
  project: null,
  setProject: (val) => set({ project: val }),
  spkData: null,
  setSpkData: (val) => set({ spkData: val }),
  bom: [],
  setBom: (val) => set({ bom: ensureArray(val, 'bom') }),
  shortageAnalysis: [],
  setShortageAnalysis: (val) => set({ shortageAnalysis: ensureArray(val, 'shortages') }),
  lots: [],
  setLots: (val) => set({ lots: ensureArray(val, 'lots') }),
  machines: [],
  setMachines: (val) => set({ machines: ensureArray(val, 'machines') }),
  activeNdps: [],
  setActiveNdps: (val) => set({ activeNdps: ensureArray(val, 'ndps') }),
  itemsCatalog: [],
  setItemsCatalog: (val) => set({ itemsCatalog: ensureArray(val, 'items') }),
  stationTimers: {},
  setStationTimers: (val) => set((state) => ({ 
    stationTimers: typeof val === 'function' ? val(state.stationTimers) : val 
  })),
  selectedBop: null,
  setSelectedBop: (val) => set({ selectedBop: val }),
  showFgrModal: false,
  setShowFgrModal: (val) => set({ showFgrModal: val }),
  fgrData: null,
  setFgrData: (val) => set({ fgrData: val }),
  isFinishing: false,
  setIsFinishing: (val) => set({ isFinishing: val }),
  confirmModal: { isOpen: false },
  setConfirmModal: (val) => set({ confirmModal: val }),
  selectedTagForView: null,
  setSelectedTagForView: (val) => set({ selectedTagForView: val }),
  selectedNdpForView: null,
  setSelectedNdpForView: (val) => set({ selectedNdpForView: val }),
  showQrScannerModal: false,
  setShowQrScannerModal: (val) => set({ showQrScannerModal: val }),
  ndpForm: { category: "MACHINE_BREAKDOWN", description: "", urgency: "HIGH", reported_by: "" },
  setNdpForm: (val) => set({ ndpForm: val }),
  bopSearchQuery: "",
  setBopSearchQuery: (val) => set({ bopSearchQuery: val }),
  editingCtStepId: null,
  setEditingCtStepId: (val) => set({ editingCtStepId: val }),
  editingCtValue: 0,
  setEditingCtValue: (val) => set({ editingCtValue: val }),
  stationEtas: [],
  setStationEtas: (val) => set({ stationEtas: ensureArray(val) }),
  wots: [],
  setWots: (val) => set({ wots: ensureArray(val) }),
  cpmData: null,
  setCpmData: (val) => set({ cpmData: val }),
  gapAnalysis: null,
  setGapAnalysis: (val) => set({ gapAnalysis: val }),
  cpmAnalysis: null,
  setCpmAnalysis: (val) => set({ cpmAnalysis: val }),
  stationOeeMap: {},
  setStationOeeMap: (val) => set((state) => ({
    stationOeeMap: typeof val === 'function' ? val(state.stationOeeMap) : val
  })),
  selectedWotForTrace: null,
  setSelectedWotForTrace: (val) => set({ selectedWotForTrace: val }),
  activeViewMode: 'KANBAN',
  setActiveViewMode: (val) => set({ activeViewMode: val }),
  isProcessing: false,
  setIsProcessing: (val) => set({ isProcessing: val }),
}));

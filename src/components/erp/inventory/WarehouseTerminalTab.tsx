import React from "react";
import { 
  ScanLine, Search, Package, ArrowRight, ArrowLeft,
  CheckCircle2, AlertTriangle, AlertCircle, FileText, Upload, Printer,
  Camera, ShieldCheck, Truck, QrCode, TrendingUp, TrendingDown
} from "lucide-react";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";

interface WarehouseTerminalTabProps {
  terminalMenu: "CONSUMPTION" | "DISPATCH";
  setTerminalMenu: (v: "CONSUMPTION" | "DISPATCH") => void;
  consumeStep: "IDLE" | "SELECT_ITEM" | "CONSUME" | "SUCCESS";
  setConsumeStep: (v: "IDLE" | "SELECT_ITEM" | "CONSUME" | "SUCCESS") => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  handleScanSuccess: (val: string) => void;
  setIsScannerOpen: (v: boolean) => void;
  selectedItem: any;
  consumeQty: string;
  setConsumeQty: (v: string) => void;
  recordedBy: string;
  setRecordedBy: (v: string) => void;
  transactionDirection: "WITHDRAW" | "RETURN";
  setTransactionDirection: (v: "WITHDRAW" | "RETURN") => void;
  projects: any[];
  selectedProject: string;
  setSelectedProject: (v: string) => void;
  activeProjectBOM: any[];
  isSubmitting: boolean;
  handleConsume: () => void;
  draftDeliveries: any[];
  setSelectedDn: (v: any) => void;
  setShowUploadDnModal: (v: boolean) => void;
  setConfirmModal: (v: any) => void;
  movements: any[];
  inventory: any[];
  setSelectedItem: (v: any) => void;
}

export const WarehouseTerminalTab: React.FC<WarehouseTerminalTabProps> = ({
  terminalMenu, setTerminalMenu,
  consumeStep, setConsumeStep,
  searchQuery, setSearchQuery,
  handleScanSuccess, setIsScannerOpen,
  selectedItem, consumeQty, setConsumeQty,
  recordedBy, setRecordedBy,
  transactionDirection, setTransactionDirection,
  projects, selectedProject, setSelectedProject,
  activeProjectBOM, isSubmitting, handleConsume,
  draftDeliveries, setSelectedDn, setShowUploadDnModal,
  setConfirmModal,
  movements, inventory, setSelectedItem
}) => {
  return (
            <div className="flex flex-col lg:flex-row min-h-[700px] bg-white grow pattern-grid-lg">
              {/* Left Panel: Entry Terminal (70%) */}
              <div className="lg:w-[70%] p-8 lg:p-14 border-b lg:border-b-0 lg:border-r border-stone-100 bg-white/80 backdrop-blur-3xl overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-12">
                  <header className="flex items-center justify-between text-left border-b border-stone-100 pb-10">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-stone-100 border border-stone-200 text-stone-900 rounded-2xl flex items-center justify-center shadow-2xs">
                        <ScanLine className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-stone-900 tracking-tighter uppercase">
                          Physical Terminal
                        </h3>
                        <p className="text-[10px] text-stone-400 font-bold mt-2 uppercase tracking-[0.2em] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-stone-900" />
                          Unified OPS Gatekeeper
                        </p>
                      </div>
                    </div>
                  </header>

                  <div className="flex justify-center gap-2 border-b border-stone-100 pb-8">
                    <button
                      onClick={() => setTerminalMenu("CONSUMPTION")}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                        terminalMenu === "CONSUMPTION"
                          ? "bg-stone-900 text-white shadow-xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 border border-stone-200",
                      )}
                    >
                      Part Consumption
                    </button>
                    <button
                      onClick={() => setTerminalMenu("DISPATCH")}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all relative flex items-center gap-2",
                        terminalMenu === "DISPATCH"
                          ? "bg-stone-900 text-white shadow-xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 border border-stone-200",
                      )}
                    >
                      <span>Dispatch Sign-Off</span>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {terminalMenu === "CONSUMPTION" ? (
                      <div className="space-y-8">
                        {consumeStep === "IDLE" ? (
                          <div className="space-y-6 text-center max-w-xl mx-auto mt-12">
                            <div className="p-12 border border-dashed border-stone-200 rounded-3xl bg-stone-50/50 space-y-6 hover:bg-stone-50 hover:border-stone-300 transition-all group">
                              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mx-auto group-hover:scale-105 transition-transform duration-500">
                                <Package className="w-8 h-8 text-stone-400 group-hover:text-stone-900 transition-colors" />
                              </div>
                              <div className="space-y-2">
                                <div className="text-lg font-bold text-stone-900">
                                  Initiate Withdrawal
                                </div>
                                <div className="text-sm text-stone-400 font-medium">
                                  Select an item from the warehouse inventory to
                                  record physical consumption or project
                                  allocation.
                                </div>
                              </div>
                              <button
                                onClick={() => setConsumeStep("SELECT_ITEM")}
                                className="px-8 py-3.5 bg-stone-900 text-white text-xs font-bold rounded-2xl hover:bg-stone-800 transition-all tracking-wider uppercase shadow-xs active:scale-95"
                              >
                                Browse Directory
                              </button>
                            </div>
                          </div>
                        ) : consumeStep === "SELECT_ITEM" ? (
                          <div className="space-y-6 max-w-xl mx-auto">
                            <div className="flex gap-3">
                              <div className="relative group flex-1">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 group-focus-within:text-stone-900 transition-colors" />
                                <input
                                  type="text"
                                  placeholder="Type SKU or use USB scanner..."
                                  autoFocus
                                  value={searchQuery}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSearchQuery(val);
                                    if (
                                      val.includes("{") &&
                                      val.includes("}")
                                    ) {
                                      handleScanSuccess(val);
                                    }
                                  }}
                                  className="w-full pl-14 pr-6 py-4 bg-stone-50 border border-stone-200/50 hover:bg-white hover:border-stone-300 rounded-2xl text-sm font-bold text-stone-900 focus:bg-white focus:border-stone-300 focus:ring-4 focus:ring-stone-100 outline-none transition-all shadow-sm"
                                />
                              </div>
                              <button
                                onClick={() => {
                                  const hasPermission = localStorage.getItem(
                                    "CAMERA_PERMISSION_GRANTED",
                                  );
                                  if (hasPermission === "true") {
                                    setIsScannerOpen(true);
                                  } else {
                                    setConfirmModal({
                                      isOpen: true,
                                      title: "Camera Access Permission",
                                      message:
                                        "The system needs access to your device's camera to scan QR codes and Barcodes. Do you allow camera usage? This preference will be saved.",
                                      action: () => {
                                        localStorage.setItem(
                                          "CAMERA_PERMISSION_GRANTED",
                                          "true",
                                        );
                                        setIsScannerOpen(true);
                                        setConfirmModal((prev) => ({
                                          ...prev,
                                          isOpen: false,
                                        }));
                                      },
                                    });
                                  }
                                }}
                                className="px-6 py-4 bg-stone-900 text-white rounded-2xl flex items-center gap-2 hover:bg-stone-800 transition-colors shadow-xs active:scale-95"
                              >
                                <Camera className="w-5 h-5" />
                                <span className="font-bold text-xs uppercase tracking-widest hidden md:inline">
                                  Camera
                                </span>
                              </button>
                            </div>

                            <div className="max-h-[400px] overflow-y-auto border border-stone-100 rounded-3xl divide-y divide-stone-100 bg-white shadow-xl shadow-stone-200/20">
                              {inventory
                                .filter(
                                  (i) =>
                                    i &&
                                    i.name &&
                                    (i.name
                                      .toLowerCase()
                                      .includes(searchQuery.toLowerCase()) ||
                                      i.item_code
                                        .toLowerCase()
                                        .includes(searchQuery.toLowerCase())),
                                )
                                .map((item) => (
                                  <button
                                    key={item.id}
                                    onClick={() => {
                                      setSelectedItem(item);
                                      setConsumeStep("CONSUME");
                                      setSearchQuery("");
                                    }}
                                    className="w-full p-5 text-left hover:bg-stone-50 transition-colors flex justify-between items-center group"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                                        <Package className="w-5 h-5 text-stone-400 group-hover:text-stone-900 transition-colors" />
                                      </div>
                                      <div>
                                        <div className="text-[10px] font-bold text-stone-400 font-mono tracking-widest">
                                          {item.item_code}
                                        </div>
                                        <div className="text-base font-bold text-stone-900">
                                          {item.name}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right flex flex-col justify-center items-end">
                                      <div className="text-xl font-semibold text-stone-900 tracking-tight">
                                        {item.free_stock}{" "}
                                        <span className="text-[10px] uppercase font-bold text-stone-400">
                                          {item.uom}
                                        </span>
                                      </div>
                                      <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest mt-0.5">
                                        Available
                                      </div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                            <button
                              onClick={() => setConsumeStep("IDLE")}
                              className="text-[10px] text-stone-400 hover:text-stone-900 font-bold uppercase tracking-wider w-full text-center py-4 transition-colors"
                            >
                              Abort Selection Sequence
                            </button>
                          </div>
                        ) : consumeStep === "CONSUME" && selectedItem ? (
                          <div className="space-y-10 max-w-2xl mx-auto mt-8">
                            <div className="p-8 bg-white border border-stone-100 rounded-[2rem] shadow-2xl shadow-stone-200/30 text-left relative overflow-hidden">
                              {/* Background Pattern */}
                              <div className="absolute top-0 right-0 p-8 opacity-5">
                                <ScanLine className="w-64 h-64 rotate-12 translate-x-1/4 -translate-y-1/4" />
                              </div>

                              <div className="relative">
                                <div className="flex justify-between items-start mb-8">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                                        Active Target Acquired
                                      </div>
                                    </div>
                                    <h4 className="text-xl font-semibold text-stone-900 tracking-tight mb-1">
                                      {selectedItem?.item_code}
                                    </h4>
                                    <p className="text-lg text-stone-500 font-medium">
                                      {selectedItem?.name}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() =>
                                      setConsumeStep("SELECT_ITEM")
                                    }
                                    className="p-3 border border-stone-200 hover:border-stone-400 hover:bg-stone-50 rounded-2xl transition-all shadow-sm group"
                                  >
                                    <Search className="w-5 h-5 text-stone-400 group-hover:text-stone-900" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-3 gap-4 border-t border-stone-100 pt-8">
                                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100/50">
                                    <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                                      Physical Stock
                                    </div>
                                    <div className="text-lg font-semibold text-stone-900 tracking-tighter hover:text-stone-700 transition-colors">
                                      {(
                                        (selectedItem?.free_stock || 0) +
                                        (selectedItem?.allocated_stock || 0)
                                      ).toLocaleString("id-ID")}{" "}
                                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                                        {selectedItem?.uom}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                                    <div className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-widest mb-1">
                                      Free/Avail.
                                    </div>
                                    <div className="text-lg font-semibold text-emerald-700 tracking-tighter">
                                      {selectedItem?.free_stock.toLocaleString(
                                        "id-ID",
                                      )}{" "}
                                      <span className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest">
                                        {selectedItem?.uom}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100/50">
                                    <div className="text-[9px] font-bold text-amber-600/70 uppercase tracking-widest mb-1">
                                      Allocated
                                    </div>
                                    <div className="text-lg font-semibold text-amber-700 tracking-tighter">
                                      {selectedItem?.allocated_stock.toLocaleString(
                                        "id-ID",
                                      )}{" "}
                                      <span className="text-[10px] font-bold text-amber-600/70 uppercase tracking-widest">
                                        {selectedItem?.uom}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-6 text-left p-2">
                              <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between ml-1">
                                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                                      Volume Required
                                    </label>
                                    {(() => {
                                      if (!selectedProject || !selectedItem || transactionDirection !== "WITHDRAW") return null;
                                      const currentProjectObj = projects.find((p) => p.id === selectedProject);
                                      const projectSpkQty = Math.max(1, Number(currentProjectObj?.qty) || 1);
                                      const matchedBoms = activeProjectBOM.filter(
                                        (b) => b.item_id === selectedItem?.id || b.item_id === selectedItem?.item_code
                                      );
                                      if (matchedBoms.length === 0) return null;
                                      const totalSpkRequired = matchedBoms.reduce((acc, b) => {
                                        const bomPerUnit = Number(b.required_qty) || 0;
                                        return acc + (Number(b.total_required_qty) || (bomPerUnit * projectSpkQty));
                                      }, 0);
                                      const alreadyConsumed = matchedBoms.reduce((acc, b) => acc + (Number(b.qty_consumed) || 0), 0);
                                      const remainingLimit = Math.max(0, totalSpkRequired - alreadyConsumed);
                                      if (remainingLimit <= 0) return null;
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => setConsumeQty(String(remainingLimit))}
                                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 transition-colors uppercase tracking-wider"
                                        >
                                          Set Max ({remainingLimit})
                                        </button>
                                      );
                                    })()}
                                  </div>
                                  <div className="relative group">
                                    <input
                                      type="number"
                                      value={consumeQty}
                                      onChange={(e) =>
                                        setConsumeQty(e.target.value)
                                      }
                                      className="w-full pl-6 pr-16 py-4 bg-stone-50 border border-stone-200/50 hover:bg-white hover:border-stone-300 rounded-2xl text-xl font-semibold text-stone-900 focus:bg-white focus:border-stone-300 focus:ring-4 focus:ring-stone-100 outline-none transition-all shadow-sm"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400 uppercase tracking-widest">
                                      {selectedItem?.uom}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider ml-1">
                                    Authorized Personnel
                                  </label>
                                  <input
                                    type="text"
                                    value={recordedBy}
                                    placeholder="ID or Name"
                                    onChange={(e) =>
                                      setRecordedBy(e.target.value)
                                    }
                                    className="w-full px-6 py-4 bg-stone-50 border border-stone-200/50 hover:bg-white hover:border-stone-300 rounded-2xl text-base font-bold text-stone-900 focus:bg-white focus:border-stone-300 focus:ring-4 focus:ring-stone-100 outline-none transition-all shadow-sm"
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider ml-1">
                                  Transaction Type
                                </label>
                                <div className="flex gap-4">
                                  <button
                                    onClick={() =>
                                      setTransactionDirection("WITHDRAW")
                                    }
                                    className={cn(
                                      "flex-1 py-4 px-6 rounded-2xl text-sm font-bold uppercase tracking-widest border transition-all text-center",
                                      transactionDirection === "WITHDRAW"
                                        ? "bg-white border-2 border-stone-900 text-stone-900 shadow-xl shadow-stone-900/10 ring-4 ring-stone-900/5"
                                        : "bg-white border-2 border-stone-100 text-stone-400 hover:border-stone-200 hover:text-stone-600",
                                    )}
                                  >
                                    Withdraw
                                  </button>
                                  <button
                                    onClick={() =>
                                      setTransactionDirection("RETURN")
                                    }
                                    className={cn(
                                      "flex-1 py-4 px-6 rounded-2xl text-sm font-bold uppercase tracking-widest border transition-all text-center",
                                      transactionDirection === "RETURN"
                                        ? "bg-white border-2 border-emerald-600 text-emerald-700 shadow-xl shadow-emerald-600/10 ring-4 ring-emerald-50"
                                        : "bg-white border-2 border-stone-100 text-stone-400 hover:border-stone-200 hover:text-stone-600",
                                    )}
                                  >
                                    Return
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider ml-1">
                                  Operational Attribution (Project)
                                </label>
                                <Select
                                  value={selectedProject}
                                  onChange={(e) =>
                                    setSelectedProject(e.target.value)
                                  }
                                  className="w-full px-6 py-4 bg-stone-50 border border-stone-200/50 hover:bg-white hover:border-stone-300 rounded-2xl text-base font-bold text-stone-900 focus:bg-white focus:border-stone-300 focus:ring-4 focus:ring-stone-100 outline-none transition-all appearance-none shadow-sm cursor-pointer"
                                >
                                  <option value="">
                                    -- Unassigned (General Protocol) --
                                  </option>
                                  {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.id} - {p?.name} (SPK: {p?.qty || 1} {p?.uom || "PCS"})
                                    </option>
                                  ))}
                                </Select>
                              </div>

                              {(() => {
                                if (!selectedProject || !selectedItem) return null;

                                const currentProjectObj = projects.find((p) => p.id === selectedProject);
                                const projectSpkQty = Math.max(1, Number(currentProjectObj?.qty) || 1);
                                const matchedBoms = activeProjectBOM.filter(
                                  (b) => b.item_id === selectedItem?.id || b.item_id === selectedItem?.item_code
                                );

                                const totalBomPerUnit = matchedBoms.reduce((acc, b) => acc + (Number(b.required_qty) || 0), 0);
                                const totalSpkRequired = matchedBoms.reduce((acc, b) => {
                                  const bomUnit = Number(b.required_qty) || 0;
                                  return acc + (Number(b.total_required_qty) || (bomUnit * projectSpkQty));
                                }, 0);
                                const alreadyConsumed = matchedBoms.reduce((acc, b) => acc + (Number(b.qty_consumed) || 0), 0);
                                const remainingLimit = matchedBoms.length > 0 ? Math.max(0, totalSpkRequired - alreadyConsumed) : 0;

                                const isWithdraw = transactionDirection === "WITHDRAW";
                                const numConsumeQty = Number(consumeQty) || 0;
                                const isItemInBom = matchedBoms.length > 0;
                                const isExceedingSpkLimit = isWithdraw && isItemInBom && numConsumeQty > remainingLimit;
                                const isSpkQuotaFulfilled = isWithdraw && isItemInBom && remainingLimit <= 0;

                                if (!isItemInBom) {
                                  return (
                                    <div className="p-6 rounded-3xl border bg-amber-50/60 border-amber-200 shadow-sm shadow-amber-100/50 text-left">
                                      <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                                          <AlertTriangle className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                                            <ShieldCheck className="w-3.5 h-3.5" /> Engineering Constraints Check
                                          </div>
                                          <p className="text-sm font-bold text-stone-900 leading-snug">
                                            Warning: Item explicitly missing from {currentProjectObj?.name || selectedProject} engineering parameters (BOM).
                                          </p>
                                          <p className="text-xs text-amber-800 font-medium">
                                            Checkout under this project is locked to prevent non-engineered inventory allocation.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    className={cn(
                                      "p-6 rounded-3xl border transition-all text-left space-y-4",
                                      isSpkQuotaFulfilled
                                        ? "bg-amber-50/60 border-amber-300 shadow-sm shadow-amber-100/50"
                                        : isExceedingSpkLimit
                                        ? "bg-rose-50/60 border-rose-300 shadow-sm shadow-rose-100/50"
                                        : "bg-emerald-50/60 border-emerald-200 shadow-sm shadow-emerald-100/50"
                                    )}
                                  >
                                    <div className="flex items-start gap-4">
                                      <div
                                        className={cn(
                                          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                                          isSpkQuotaFulfilled
                                            ? "bg-amber-500 text-white"
                                            : isExceedingSpkLimit
                                            ? "bg-rose-500 text-white"
                                            : "bg-emerald-600 text-white"
                                        )}
                                      >
                                        {isSpkQuotaFulfilled ? (
                                          <AlertTriangle className="w-6 h-6" />
                                        ) : isExceedingSpkLimit ? (
                                          <AlertCircle className="w-6 h-6" />
                                        ) : (
                                          <ShieldCheck className="w-6 h-6" />
                                        )}
                                      </div>
                                      <div className="flex-1 space-y-1">
                                        <div
                                          className={cn(
                                            "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                                            isSpkQuotaFulfilled
                                              ? "text-amber-700"
                                              : isExceedingSpkLimit
                                              ? "text-rose-700"
                                              : "text-emerald-700"
                                          )}
                                        >
                                          <ShieldCheck className="w-3.5 h-3.5" /> Engineering Constraints Check (SPK Scaled)
                                        </div>
                                        <p className="text-sm font-bold text-stone-900 leading-snug">
                                          Verified Match. Engineered SPK Requirement:{" "}
                                          <span className="font-mono text-emerald-800 font-extrabold">
                                            {totalSpkRequired.toLocaleString("id-ID")} {selectedItem?.uom}
                                          </span>
                                        </p>
                                        <div className="text-[11px] text-stone-600 font-medium">
                                          Formula: <span className="font-mono font-bold text-stone-800">{totalBomPerUnit.toLocaleString("id-ID")} {selectedItem?.uom}</span> / unit × <span className="font-mono font-bold text-stone-800">{projectSpkQty.toLocaleString("id-ID")} SPK Qty</span> = <span className="font-mono font-bold text-stone-900">{totalSpkRequired.toLocaleString("id-ID")} {selectedItem?.uom}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Breakdown Chips */}
                                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-200/60 text-center">
                                      <div className="p-2.5 bg-white/80 rounded-xl border border-stone-200/50">
                                        <div className="text-[9px] uppercase font-bold text-stone-400">Total SPK Required</div>
                                        <div className="text-sm font-extrabold text-stone-900 font-mono mt-0.5">
                                          {totalSpkRequired.toLocaleString("id-ID")} <span className="text-[10px] text-stone-400">{selectedItem?.uom}</span>
                                        </div>
                                      </div>
                                      <div className="p-2.5 bg-white/80 rounded-xl border border-stone-200/50">
                                        <div className="text-[9px] uppercase font-bold text-stone-400">Already Consumed</div>
                                        <div className="text-sm font-extrabold text-blue-700 font-mono mt-0.5">
                                          {alreadyConsumed.toLocaleString("id-ID")} <span className="text-[10px] text-stone-400">{selectedItem?.uom}</span>
                                        </div>
                                      </div>
                                      <div className={cn(
                                        "p-2.5 rounded-xl border",
                                        remainingLimit <= 0
                                          ? "bg-amber-100/70 border-amber-300"
                                          : "bg-emerald-100/70 border-emerald-300"
                                      )}>
                                        <div className="text-[9px] uppercase font-bold text-stone-600">Max Remaining Quota</div>
                                        <div className={cn(
                                          "text-sm font-extrabold font-mono mt-0.5",
                                          remainingLimit <= 0 ? "text-amber-900" : "text-emerald-900"
                                        )}>
                                          {remainingLimit.toLocaleString("id-ID")} <span className="text-[10px] opacity-70">{selectedItem?.uom}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {isSpkQuotaFulfilled && (
                                      <div className="p-3 bg-amber-100/80 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                                        <span>SPK Quota Completed (100%): All {totalSpkRequired} {selectedItem?.uom} have been checked out for this project. Additional checkout is locked.</span>
                                      </div>
                                    )}

                                    {isExceedingSpkLimit && (
                                      <div className="p-3 bg-rose-100/80 border border-rose-300 rounded-xl text-xs font-bold text-rose-900 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
                                        <span>Limit Exceeded: Input volume ({numConsumeQty} {selectedItem?.uom}) exceeds maximum allowed quota of {remainingLimit} {selectedItem?.uom}. Checkout is blocked.</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {(() => {
                                const currentProjectObj = projects.find((p) => p.id === selectedProject);
                                const projectSpkQty = Math.max(1, Number(currentProjectObj?.qty) || 1);
                                const matchedBoms = activeProjectBOM.filter(
                                  (b) => b.item_id === selectedItem?.id || b.item_id === selectedItem?.item_code
                                );
                                
                                const totalSpkRequired = matchedBoms.reduce((acc, b) => {
                                  const bomPerUnit = Number(b.required_qty) || 0;
                                  return acc + (Number(b.total_required_qty) || (bomPerUnit * projectSpkQty));
                                }, 0);
                                const alreadyConsumed = matchedBoms.reduce((acc, b) => acc + (Number(b.qty_consumed) || 0), 0);
                                const remainingLimit = matchedBoms.length > 0 ? Math.max(0, totalSpkRequired - alreadyConsumed) : 0;

                                const isWithdraw = transactionDirection === "WITHDRAW";
                                const numConsumeQty = Number(consumeQty) || 0;
                                const isItemInBom = matchedBoms.length > 0;
                                const isExceedingSpkLimit = isWithdraw && Boolean(selectedProject) && isItemInBom && numConsumeQty > remainingLimit;
                                const isSpkQuotaFulfilled = isWithdraw && Boolean(selectedProject) && isItemInBom && remainingLimit <= 0;
                                const isUnallocatedProjectItem = isWithdraw && Boolean(selectedProject) && !isItemInBom;

                                const isButtonDisabled =
                                  isSubmitting ||
                                  !consumeQty ||
                                  numConsumeQty <= 0 ||
                                  isNaN(numConsumeQty) ||
                                  !recordedBy.trim() ||
                                  (isWithdraw && Boolean(selectedProject) && (isUnallocatedProjectItem || isExceedingSpkLimit || isSpkQuotaFulfilled));

                                let buttonText = "Execute Checkout";
                                if (isSubmitting) {
                                  buttonText = "Processing Transaction...";
                                } else if (transactionDirection === "RETURN") {
                                  buttonText = "Execute Return";
                                } else if (isUnallocatedProjectItem) {
                                  buttonText = "Item Not in Project BOM (Blocked)";
                                } else if (isSpkQuotaFulfilled) {
                                  buttonText = "SPK Quota Completed (Locked)";
                                } else if (isExceedingSpkLimit) {
                                  buttonText = `Exceeds SPK Limit (Max: ${remainingLimit} ${selectedItem?.uom})`;
                                }

                                return (
                                  <div className="pt-4 space-y-2">
                                    <button
                                      onClick={handleConsume}
                                      disabled={isButtonDisabled}
                                      className="w-full py-5 bg-stone-900 border border-stone-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider hover:bg-stone-800 transition-all active:translate-y-0 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none disabled:transform-none shadow-xs"
                                    >
                                      {buttonText}
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        ) : (
                          consumeStep === "SUCCESS" && (
                            <div className="text-center py-20 max-w-md mx-auto">
                              <div className="w-28 h-28 bg-emerald-50 text-emerald-500 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-500/10 rotate-3">
                                <CheckCircle2 className="w-14 h-14" />
                              </div>
                              <h4 className="text-xl font-semibold text-stone-900 uppercase tracking-tight">
                                Checkout Cleared
                              </h4>
                              <p className="text-base text-stone-500 mt-3 font-medium">
                                Logistics network seamlessly updated.
                              </p>
                              <div className="mt-12 flex flex-col gap-4">
                                <button
                                  onClick={() => {
                                    setConsumeStep("IDLE");
                                    setSelectedItem(null);
                                    setConsumeQty("1");
                                  }}
                                  className="px-8 py-4 bg-stone-900 text-white rounded-2xl text-xs font-semibold uppercase tracking-wider shadow-xs hover:bg-stone-800 transition-all hover:-translate-y-0.5 active:translate-y-0"
                                >
                                  Process Next Entity
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : terminalMenu === "DISPATCH" ? (
                      <div className="space-y-8">
                        {draftDeliveries.length === 0 ? (
                          <div className="text-center py-20">
                            <div className="w-20 h-20 bg-stone-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                              <Truck className="w-8 h-8 text-stone-300" />
                            </div>
                            <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest">
                              No Authorized Outbound Notes
                            </h4>
                            <p className="text-xs text-stone-500 font-medium mt-2">
                              Finished Goods delivery notes authorized by Sales Manager will appear here for warehouse dispatch.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {draftDeliveries.map((d) => (
                              <div
                                key={d.id}
                                className="p-6 bg-amber-50/40 border-2 border-amber-300 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative overflow-hidden"
                              >
                                <div className="space-y-1 text-left">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 bg-amber-200 px-2.5 py-1 rounded-md border border-amber-300 flex items-center gap-1 shadow-2xs">
                                      <Truck className="w-3.5 h-3.5 text-amber-800" />
                                      SALES GENERATED - READY FOR DISPATCH
                                    </span>
                                    {d.status && (
                                      <span className="text-[9px] font-black text-stone-600 uppercase tracking-wider bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                                        Status: {d.status}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xl font-black text-stone-900 font-mono tracking-tight pt-1">
                                    {d.dn_number}
                                  </div>
                                  <div className="text-xs font-bold text-stone-700">
                                    Client / Destination: <span className="font-extrabold text-stone-900">{d.customer_name || "Valued Client"}</span>
                                  </div>
                                  {d.remarks && (
                                    <div className="text-[11px] text-stone-500 font-medium italic">
                                      Sales Remarks: {d.remarks}
                                    </div>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setSelectedDn(d);
                                      setShowUploadDnModal(true);
                                    }}
                                    className="w-full md:w-auto px-5 py-3 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
                                  >
                                    <Truck className="w-4 h-4 text-white" />
                                    <span>Process Outbound Dispatch</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Right Panel: Monitor & Intelligence (30%) */}
              <div className="lg:w-[30%] p-8 lg:p-12 overflow-y-auto bg-stone-50 border-l border-stone-100 relative">
                <div className="max-w-md mx-auto space-y-12">
                  <header className="text-left">
                    <h3 className="text-sm font-semibold text-stone-900 tracking-tight mb-4">
                      Operations Monitor
                    </h3>
                    <div className="h-[1px] w-full bg-stone-100" />
                  </header>{" "}
                  {/* Profile View (Contextual) */}
                  {consumeStep === "CONSUME" && selectedItem ? (
                    <div className="bg-white rounded-[2rem] p-8 shadow-xl shadow-stone-200/20 space-y-8 text-left border border-white">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-center shrink-0">
                          <Package className="w-8 h-8 text-stone-400" />
                        </div>{" "}
                        <div>
                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                            Asset Intelligence
                          </div>
                          <h4 className="text-xl font-semibold text-stone-900 tracking-tight leading-none">
                            {selectedItem?.name}
                          </h4>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-y-8 gap-x-4 pt-6 border-t border-stone-100/60">
                        <div>
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                            Specification
                          </div>
                          <div className="text-sm font-bold text-stone-700">
                            {selectedItem?.spec || "Variable"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                            Dimension
                          </div>
                          <div className="text-sm font-bold text-stone-700">
                            {selectedItem?.dimension || "N/A"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                            Handling Unit
                          </div>
                          <div className="text-xs font-bold text-stone-700 uppercase tracking-widest bg-stone-100 px-3 py-1 rounded-lg w-fit">
                            {selectedItem?.uom}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                            Logical Branch
                          </div>
                          <div className="text-xs font-bold text-stone-700 uppercase tracking-widest bg-stone-100 px-3 py-1 rounded-lg w-fit">
                            {selectedItem?.type}
                          </div>
                        </div>
                      </div>

                      {/* Systematic Traceability Notice */}
                      <div className="p-5 bg-emerald-50/80 rounded-3xl flex items-start gap-5">
                        <div className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center shrink-0">
                          <QrCode className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
                            Traceability Tracked
                          </div>
                          <div className="text-xs text-emerald-600/80 font-medium leading-relaxed">
                            Systematic lineage active. This unit is
                            mathematically cleared for processing and strictly
                            tied to its upstream origin.
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      {/* Productivity Stats (Visual context) */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 bg-white border border-stone-100/50 rounded-3xl text-left shadow-sm hover:border-stone-200 hover:shadow-md transition-all">
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                            Total Disposals
                          </div>
                          <div className="text-xl font-semibold text-stone-900 tracking-tighter">
                            {movements.filter((m) => Number(m.qty) < 0).length}
                          </div>
                        </div>
                        <div className="p-6 bg-white border border-stone-100/50 rounded-3xl text-left shadow-sm hover:border-stone-200 hover:shadow-md transition-all">
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                            Purchasing Received
                          </div>
                          <div className="text-xl font-semibold text-stone-900 tracking-tighter">
                            {movements.filter((m) => Number(m.qty) > 0).length}
                          </div>
                        </div>
                      </div>

                      {/* Recent Activity Feed */}
                      <div className="space-y-6 text-left">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                          Realtime Feed
                        </label>
                        <div className="space-y-4">
                          {movements.slice(0, 5).map((log, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-5 group p-3 bg-white rounded-2xl shadow-sm border border-stone-100/50 hover:border-stone-200 transition-all"
                            >
                              <div
                                className={cn(
                                  "w-12 h-12 rounded-xl flex items-center justify-center transition-all bg-stone-50 shrink-0",
                                  Number(log.qty) > 0
                                    ? "text-emerald-500"
                                    : "text-stone-400 group-hover:text-stone-900",
                                )}
                              >
                                {Number(log.qty) > 0 ? (
                                  <TrendingUp className="w-5 h-5" />
                                ) : (
                                  <TrendingDown className="w-5 h-5" />
                                )}
                              </div>
                              <div className="flex-1 pr-2 min-w-0">
                                <div className="flex justify-between items-center mb-1 gap-2">
                                  <div className="text-sm font-bold text-stone-900 tracking-tight truncate">
                                    {log.item_code || log.item_id}
                                  </div>
                                  <div
                                    className={cn(
                                      "text-xs font-semibold shrink-0",
                                      Number(log.qty) > 0
                                        ? "text-emerald-500"
                                        : "text-stone-900",
                                    )}
                                  >
                                    {Number(log.qty) > 0 ? "+" : ""}
                                    {log.qty}{" "}
                                    <span className="text-[9px] uppercase tracking-widest text-stone-400 font-bold">
                                      {log.uom}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center text-[9px] font-bold tracking-wider uppercase text-stone-400 mt-1.5">
                                  <span className="truncate pr-2">
                                    {log.type}
                                  </span>
                                  <span className="shrink-0">
                                    {new Date(
                                      log.created_at,
                                    ).toLocaleTimeString([], {
                                      timeZone: "Asia/Jakarta",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {movements.length === 0 && (
                            <div className="text-center py-12 border-2 border-stone-100 border-dashed rounded-3xl text-xs text-stone-400 font-medium">
                              No logistical history found.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
  );
};

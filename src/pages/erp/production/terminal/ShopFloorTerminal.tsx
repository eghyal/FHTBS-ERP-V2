import React, { useState, useEffect, useCallback } from "react";
import { 
  QrCode, AlertTriangle, Package, CheckCircle2, XCircle, ArrowRight, 
  Activity, Layers, Wrench, RefreshCw, Cpu, ShieldAlert, Send, FileText,
  Camera, Check, Clock, User, AlertOctagon, MapPin, WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { WotGenealogyModal } from "@/components/erp/production/WotGenealogyModal";
import { ScannerModal } from "@/components/shared/ScannerModal";
import { useOfflineSyncStore } from "@/stores/useOfflineSyncStore";

export function ShopFloorTerminal() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'SCAN' | 'FR' | 'NDP' | 'DASHBOARD'>('SCAN');

  // SCAN TAB STATE
  const [scanInput, setScanInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scannedWot, setScannedWot] = useState<any>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [goodQty, setGoodQty] = useState<number>(0);
  const [rejectQty, setRejectQty] = useState<number>(0);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [transferGateInfo, setTransferGateInfo] = useState<any>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [terminalStationId, setTerminalStationId] = useState<string>("");
  const [stations, setStations] = useState<any[]>([]);

  const [showGenealogyModal, setShowGenealogyModal] = useState(false);

  // FLOOR REQUEST STATE
  const [frType, setFrType] = useState<string>("MATERIAL");
  const [frCategory, setFrCategory] = useState<string>("URGENT");
  const [frTitle, setFrTitle] = useState("");
  const [frDesc, setFrDesc] = useState("");
  const [frQty, setFrQty] = useState("");
  const [frUnit, setFrUnit] = useState("PCS");
  const [frMachineId, setFrMachineId] = useState("");
  const [frPhotoUrl, setFrPhotoUrl] = useState("");
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [isSubmittingFr, setIsSubmittingFr] = useState(false);
  const [closingFrId, setClosingFrId] = useState<string | null>(null);

  // NDP STATE
  const [ndpCategory, setNdpCategory] = useState("MACHINE_BREAKDOWN");
  const [ndpMachineId, setNdpMachineId] = useState("");
  const [ndpSeverity, setNdpSeverity] = useState("HIGH");
  const [ndpDesc, setNdpDesc] = useState("");
  const [isSubmittingNdp, setIsSubmittingNdp] = useState(false);
  const [activeNdps, setActiveNdps] = useState<any[]>([]);

  // DASHBOARD STATE
  const [machines, setMachines] = useState<any[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // OFFLINE SYNC STORE
  const { isOffline, syncQueue, isSyncing, setOfflineStatus, loadQueue, queueRequest, syncPendingRequests } = useOfflineSyncStore();

  useEffect(() => {
    loadQueue();
    const handleOnline = () => {
      setOfflineStatus(false);
      showToast("Online: Syncing pending logs...", "success");
    };
    const handleOffline = () => {
      setOfflineStatus(true);
      showToast("Offline Mode Active. Logs will be queued.", "error");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOfflineStatus, showToast, loadQueue]);

  // Load My Requests & Dashboard data
  const loadTerminalData = useCallback(async () => {
    if (isOffline) return;
    try {
      setLoadingDashboard(true);
      const [frRes, ndpRes, machRes, stationRes]: any = await Promise.all([
        apiFetch("/api/floor-requests?limit=10"),
        apiFetch("/api/production/ndp/active"),
        apiFetch("/api/setup-master/machines/availability"),
        apiFetch("/api/production/stations/list")
      ]);
      if (frRes.ok) setMyRequests(frRes.data || []);
      if (ndpRes.ok) setActiveNdps(ndpRes.data || ndpRes.ndps || []);
      if (machRes.ok) setMachines(machRes.data || []);
      if (stationRes.ok) setStations(stationRes.data || []);
    } catch (e) {
      console.error("Error loading terminal data", e);
    } finally {
      setLoadingDashboard(false);
    }
  }, [isOffline]);

  useEffect(() => {
    loadTerminalData();
  }, [loadTerminalData]);

  // Execute Scan
  const executeScan = async (codeToScan: string) => {
    if (!codeToScan.trim()) return;

    if (isOffline) {
      showToast("Offline Mode: Validating scan locally (mock mode)...", "success");
      setScannedWot({
        id: "offline-" + Date.now(),
        lot_number: codeToScan.trim(),
        qty: 1,
        process_name: "Offline Process",
        machine_code: "N/A"
      });
      setGoodQty(1);
      setRejectQty(0);
      setScanError(null);
      return;
    }

    try {
      setIsScanning(true);
      setTransferGateInfo(null);
      setScanError(null);

      const res: any = await apiFetch("/api/wots/scan", {
        method: "POST",
        body: JSON.stringify({
          qr_payload: codeToScan.trim(),
          device_info: "ShopFloorTerminal Kiosk",
          station_id: terminalStationId || undefined
        })
      });
      
      if (res.ok && res.is_valid && res.wot) {
        setScannedWot(res.wot);
        setGoodQty(res.wot.qty || 1);
        setRejectQty(0);
        setScanError(null);
        showToast(res.message || `WOT [${res.wot.lot_number}] scanned & verified!`, "success");
      } else if (res.wot && !res.is_valid) {
        const blockReason = res.message || "WOT validation blocked by machine lockdown or station constraint.";
        setScanError(blockReason);
        setScannedWot(null);
        showToast(blockReason, "error");
      } else {
        const errorMsg = res.message || res.error || "WOT tidak ditemukan atau format QR tidak sah";
        setScanError(errorMsg);
        setScannedWot(null);
        showToast(errorMsg, "error");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to scan QR code";
      setScanError(msg);
      showToast(msg, "error");
      setScannedWot(null);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Form Submit
  const handleProcessScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeScan(scanInput);
  };

  // Handle Camera Scan Result
  const handleCameraScan = (code: string) => {
    setShowCameraScanner(false);
    setScanInput(code);
    executeScan(code);
  };

  // Confirm WOT Completion
  const handleConfirmCompletion = async () => {
    if (!scannedWot) return;
    try {
      setIsSubmittingCompletion(true);
      const payload = {
        wot_id: scannedWot.id,
        good_units: goodQty,
        reject_units: rejectQty,
        reject_reason: rejectReason,
        user_name: "Shop Floor Operator",
        device_info: "ShopFloorTerminal Kiosk"
      };

      if (isOffline) {
        await queueRequest("/api/wots/confirm-completion", "POST", payload);
        showToast("Offline Mode: WOT Completion queued for sync.", "success");
        setScannedWot(null);
        setScanInput("");
        return;
      }

      const res: any = await apiFetch("/api/wots/confirm-completion", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (res.ok || res.success) {
        showToast("WOT Process marked as COMPLETED & Logged!", "success");
        setTransferGateInfo({
          success: true,
          next_station: res.wot?.station_name || "Next Workstation",
          gate_status: res.gate_status || "TRANSFER_GATE_OPEN",
          completed_lot: scannedWot.lot_number
        });
        setScannedWot(null);
        setScanInput("");
        loadTerminalData();
      } else {
        throw new Error(res.error || "Failed to complete process");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingCompletion(false);
    }
  };

  // Submit Floor Request
  const handleSubmitFloorRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frTitle.trim()) {
      showToast("Please enter a title for the request", "error");
      return;
    }

    try {
      setIsSubmittingFr(true);
      const payload = {
        type: frType,
        category: frCategory,
        title: frTitle.trim(),
        description: frDesc.trim(),
        qty_required: frQty ? Number(frQty) : null,
        unit: frUnit,
        machine_id: frMachineId || undefined,
        photo_urls: frPhotoUrl.trim() ? [frPhotoUrl.trim()] : [],
        requested_by: "Operator Terminal",
        auto_pr: frType === "MATERIAL"
      };

      if (isOffline) {
        await queueRequest("/api/floor-requests", "POST", payload);
        showToast("Offline Mode: Floor Request queued for sync.", "success");
        setFrTitle("");
        setFrDesc("");
        setFrQty("");
        setFrPhotoUrl("");
        return;
      }

      const res: any = await apiFetch("/api/floor-requests", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (res.ok || res.success) {
        showToast(res.message || `Floor Request [${res.request_code}] submitted!`, "success");
        setFrTitle("");
        setFrDesc("");
        setFrQty("");
        setFrPhotoUrl("");
        loadTerminalData();
      } else {
        throw new Error(res.error || "Failed to submit request");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingFr(false);
    }
  };

  // Close / Confirm Receipt of Floor Request
  const handleCloseFloorRequest = async (requestId: string) => {
    try {
      setClosingFrId(requestId);
      const payload = { closed_by: "Operator Terminal" };

      if (isOffline) {
        await queueRequest(`/api/floor-requests/${requestId}/close`, "POST", payload);
        showToast("Offline Mode: Floor Request close queued for sync.", "success");
        return;
      }

      const res: any = await apiFetch(`/api/floor-requests/${requestId}/close`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (res.ok || res.success) {
        showToast(res.message || "Material receipt verified and request closed!", "success");
        loadTerminalData();
      } else {
        throw new Error(res.error || "Failed to close request");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setClosingFrId(null);
    }
  };

  // Submit NDP / Incident
  const handleSubmitNDP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ndpDesc.trim()) {
      showToast("Please provide breakdown / incident details", "error");
      return;
    }

    try {
      setIsSubmittingNdp(true);
      const payload = {
        machine_id: ndpMachineId || undefined,
        reason_category: ndpCategory,
        reason_detail: ndpDesc,
        severity: ndpSeverity,
        reported_by: "Operator Terminal"
      };

      if (isOffline) {
        await queueRequest("/api/production/ndp", "POST", payload);
        showToast("Offline Mode: NDP Trigger queued for sync.", "success");
        setNdpDesc("");
        setNdpMachineId("");
        return;
      }

      const res: any = await apiFetch("/api/production/ndp", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (res.ok || res.success) {
        showToast(`NDP Triggered! Asset & workstation locked down.`, "success");
        setNdpDesc("");
        setNdpMachineId("");
        loadTerminalData();
      } else {
        throw new Error(res.error || "Failed to trigger NDP");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingNdp(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-900 text-stone-100 min-h-[850px]">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 sm:p-6 bg-stone-950 border-b border-stone-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-white">SHOP FLOOR TERMINAL</h1>
              <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                LIVE KIOSK
              </span>
            </div>
            <p className="text-xs text-stone-400">Operator interface • Scan-first event-driven execution</p>
          </div>
        </div>

        {/* 4 Navigation Tabs */}
        <div className="flex items-center bg-stone-900 p-1 rounded-2xl border border-stone-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('SCAN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'SCAN' ? 'bg-emerald-600 text-white shadow-lg' : 'text-stone-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" /> 1. Scan WOT
          </button>
          <button
            onClick={() => setActiveTab('FR')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'FR' ? 'bg-amber-600 text-white shadow-lg' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" /> 2. Floor Request
          </button>
          <button
            onClick={() => setActiveTab('NDP')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'NDP' ? 'bg-rose-600 text-white shadow-lg' : 'text-stone-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> 3. Report NDP
          </button>
          <button
            onClick={() => setActiveTab('DASHBOARD')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'DASHBOARD' ? 'bg-blue-600 text-white shadow-lg' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" /> 4. Fleet Status
          </button>
        </div>
        
        {/* Sync Status Banner */}
        <div className="flex items-center gap-3">
          {isOffline ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 text-xs font-bold animate-pulse">
              <WifiOff className="w-4 h-4" /> Offline Mode
            </div>
          ) : syncQueue.length > 0 ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 text-xs font-bold">
              {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {syncQueue.length} Pending
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/20 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" /> Synced
            </div>
          )}
        </div>
      </div>

      {/* Main Terminal Workspace */}
      <div className="flex-1 p-4 sm:p-8 overflow-auto bg-stone-900 flex items-center justify-center">
        {/* TAB 1: SCAN WOT */}
        {activeTab === 'SCAN' && (
          <div className="max-w-2xl w-full bg-stone-950 p-6 sm:p-8 rounded-3xl border border-stone-800 shadow-2xl space-y-6">
            <div className="text-center space-y-1">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl mx-auto flex items-center justify-center border border-emerald-500/20 mb-3">
                <QrCode className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-white">Scan Work Order Ticket (WOT)</h2>
              <p className="text-xs text-stone-400">Scan physical barcode/QR or input lot number to complete step</p>
            </div>

            {/* Workstation Location / Gate Filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-stone-900 border border-stone-800 rounded-2xl">
              <div className="flex items-center gap-2 text-xs text-stone-300 font-bold">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Active Workstation:</span>
              </div>
              <select
                value={terminalStationId}
                onChange={(e) => setTerminalStationId(e.target.value)}
                className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs text-stone-200 font-medium focus:border-emerald-500 max-w-full sm:max-w-[320px]"
              >
                <option value="">All Stations (Global Floor Kiosk)</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.station_code ? `[${st.station_code}] ` : ''}{st.station_name} {st.project_name ? `• ${st.project_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Input Form with Camera Scan Button */}
            <form onSubmit={handleProcessScan} className="flex gap-2">
              <Input
                autoFocus
                placeholder="Scan QR or paste Lot Number (e.g. WOT-PRJ...)"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="bg-stone-900 border-stone-700 text-white font-mono text-sm h-12 rounded-xl focus:border-emerald-500"
              />
              <Button
                type="button"
                onClick={() => setShowCameraScanner(true)}
                variant="secondary"
                className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold h-12 px-4 rounded-xl shrink-0 flex items-center gap-2 border-stone-700"
                title="Scan with Camera / Webcam"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline text-xs">Camera</span>
              </Button>
              <Button
                type="submit"
                disabled={isScanning || !scanInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 px-5 rounded-xl shrink-0 text-xs"
              >
                {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Verify Scan"}
              </Button>
            </form>

            {/* Scan Error Alert Banner */}
            {scanError && (
              <div className="p-4 bg-rose-950/70 border border-rose-500/50 rounded-2xl flex items-start gap-3 animate-in fade-in">
                <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-black text-rose-300 uppercase tracking-wide">
                    Scan Verification Blocked
                  </div>
                  <p className="text-xs text-rose-200 leading-relaxed">
                    {scanError}
                  </p>
                </div>
              </div>
            )}

            {/* Transfer Gate Success Notification */}
            {transferGateInfo && (
              <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-black text-emerald-300 uppercase tracking-wide">
                    {transferGateInfo.gate_status === 'FINAL_PRODUCT_READY' ? 'Final Product Assembled & Transferred' : 'Transfer Gate Unlocked'}
                  </div>
                  <p className="text-xs text-emerald-400/90">
                    Lot <span className="font-mono font-bold text-white">{transferGateInfo.completed_lot}</span> is cleared for <span className="font-bold text-white">{transferGateInfo.next_station}</span>.
                  </p>
                </div>
              </div>
            )}

            {/* Scanned WOT Detail Card */}
            {scannedWot && (
              <div className="p-5 bg-stone-900 border border-stone-800 rounded-2xl space-y-4">
                <div className="flex items-start justify-between border-b border-stone-800 pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-black">
                      Active Ticket
                    </span>
                    <h3 className="text-lg font-black text-white font-mono">{scannedWot.lot_number}</h3>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-stone-800 text-stone-300">
                    Qty: {scannedWot.qty} {scannedWot.uom || 'Unit'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-stone-950 rounded-xl border border-stone-800/80">
                    <span className="text-stone-500 block text-[10px] uppercase font-bold">Process Step</span>
                    <span className="font-bold text-white text-sm">{scannedWot.process_name || 'Standard Step'}</span>
                  </div>
                  <div className="p-3 bg-stone-950 rounded-xl border border-stone-800/80">
                    <span className="text-stone-500 block text-[10px] uppercase font-bold">Assigned Machine</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {scannedWot.machine_code || scannedWot.effective_machine_id ? `[${scannedWot.machine_code || 'MCH'}] ${scannedWot.machine_name || ''}` : 'Station Bench'}
                    </span>
                  </div>
                </div>

                {/* Yield & Quality Counter */}
                <div className="p-4 bg-stone-950 rounded-xl border border-stone-800 space-y-3">
                  <span className="text-xs font-bold text-stone-300 block">Yield & Quality Verification:</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-emerald-400 block mb-1">Good Units (OK)</label>
                      <Input
                        type="number"
                        min="0"
                        max={scannedWot.qty}
                        value={goodQty}
                        onChange={(e) => setGoodQty(Number(e.target.value))}
                        className="bg-stone-900 border-emerald-500/30 text-emerald-400 font-bold text-center text-lg h-11"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-rose-400 block mb-1">Reject Units (NG)</label>
                      <Input
                        type="number"
                        min="0"
                        value={rejectQty}
                        onChange={(e) => setRejectQty(Number(e.target.value))}
                        className="bg-stone-900 border-rose-500/30 text-rose-400 font-bold text-center text-lg h-11"
                      />
                    </div>
                  </div>
                  {rejectQty > 0 && (
                    <Input
                      placeholder="Specify Reject Reason (e.g. dimensional scratch)..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="bg-stone-900 border-rose-500/40 text-xs text-stone-200"
                    />
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowGenealogyModal(true)}
                    className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 h-12 font-bold rounded-xl border-none"
                  >
                    <Layers className="w-4 h-4 mr-2" />
                    Travel Log
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setScannedWot(null)}
                    className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 h-12 font-bold rounded-xl border-none"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isSubmittingCompletion}
                    onClick={handleConfirmCompletion}
                    className="flex-2 bg-emerald-600 hover:bg-emerald-700 text-white h-12 font-black rounded-xl text-sm"
                  >
                    {isSubmittingCompletion ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    Confirm & Release Gate
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FLOOR REQUEST */}
        {activeTab === 'FR' && (
          <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create Form */}
            <div className="bg-stone-950 p-6 sm:p-8 rounded-3xl border border-stone-800 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 border-b border-stone-800 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Create Floor Request</h2>
                  <p className="text-xs text-stone-400">Request material, tools, or machine assistance</p>
                </div>
              </div>

              <form onSubmit={handleSubmitFloorRequest} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Request Type</label>
                    <select
                      value={frType}
                      onChange={(e) => setFrType(e.target.value)}
                      className="w-full h-10 bg-stone-900 border border-stone-700 rounded-xl px-3 text-xs text-white"
                    >
                      <option value="MATERIAL">Material Shortage</option>
                      <option value="TOOL">Tool / Fixture</option>
                      <option value="MACHINE">Machine Assistance</option>
                      <option value="QC_CHECK">QC Inspection</option>
                      <option value="SAFETY">Safety Equipment</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="DOCUMENT">Drawing / Revision</option>
                      <option value="OTHER">Other Issue</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Urgency</label>
                    <select
                      value={frCategory}
                      onChange={(e) => setFrCategory(e.target.value)}
                      className="w-full h-10 bg-stone-900 border border-stone-700 rounded-xl px-3 text-xs text-white"
                    >
                      <option value="URGENT">🔴 Urgent (Line Blocker)</option>
                      <option value="NORMAL">🟡 Normal</option>
                      <option value="LOW">🟢 Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Request Title</label>
                  <Input
                    placeholder="e.g. Need 20 pcs Steel Sheet 5mm"
                    value={frTitle}
                    onChange={(e) => setFrTitle(e.target.value)}
                    className="bg-stone-900 border-stone-700 text-white text-xs h-10 rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Qty Needed</label>
                    <Input
                      type="number"
                      placeholder="e.g. 20"
                      value={frQty}
                      onChange={(e) => setFrQty(e.target.value)}
                      className="bg-stone-900 border-stone-700 text-white text-xs h-10 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Unit (UOM)</label>
                    <Input
                      placeholder="PCS / KG / MTR"
                      value={frUnit}
                      onChange={(e) => setFrUnit(e.target.value)}
                      className="bg-stone-900 border-stone-700 text-white text-xs h-10 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Description & Reason</label>
                  <textarea
                    rows={2}
                    placeholder="Provide specific details, lot context, or reason..."
                    value={frDesc}
                    onChange={(e) => setFrDesc(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl p-3 text-xs text-white resize-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Photo Evidence URL (Optional)</label>
                  <Input
                    placeholder="https://... photo URL"
                    value={frPhotoUrl}
                    onChange={(e) => setFrPhotoUrl(e.target.value)}
                    className="bg-stone-900 border-stone-700 text-white text-xs h-9 rounded-xl"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmittingFr}
                  className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-lg"
                >
                  {isSubmittingFr ? "Submitting..." : "Submit Floor Request"}
                </Button>
              </form>
            </div>

            {/* Request History */}
            <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Floor Requests</h3>
                <Button variant="ghost" size="sm" onClick={loadTerminalData} className="text-stone-400 text-xs h-7">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                </Button>
              </div>

              <div className="flex-1 overflow-auto space-y-3 max-h-[440px] custom-scrollbar">
                {myRequests.length === 0 ? (
                  <div className="text-center py-12 text-stone-500 text-xs">No active requests logged</div>
                ) : (
                  myRequests.map((r) => {
                    const isFulfilled = r.status === 'FULFILLED' || r.status === 'RESOLVED';
                    const isClosed = r.status === 'CLOSED';

                    return (
                      <div key={r.id} className="p-3.5 bg-stone-900 border border-stone-800 rounded-2xl space-y-2">
                        <div className="flex items-start justify-between">
                          <span className="text-[10px] font-mono font-bold text-amber-400">{r.request_code}</span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            isClosed ? 'bg-stone-700/50 text-stone-400' :
                            isFulfilled ? 'bg-emerald-500/20 text-emerald-400' :
                            r.status === 'ACKNOWLEDGED' || r.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white">{r.title}</h4>
                        {r.description && <p className="text-[11px] text-stone-400">{r.description}</p>}
                        
                        {/* Auto PR tag */}
                        {(r.pr_number || r.auto_pr || r.pr_id) && (
                          <div className="text-[10px] text-purple-400 font-mono bg-purple-950/50 border border-purple-900/50 px-2 py-0.5 rounded">
                            Auto-PR: {r.pr_number || "PR-AUTO"} (Procurement Notified)
                          </div>
                        )}

                        {/* Fulfillment notes if completed */}
                        {r.fulfillment_notes && (
                          <div className="p-2 bg-emerald-950/40 border border-emerald-900/40 rounded-xl text-[10px] text-emerald-300">
                            <strong>Fulfillment:</strong> {r.fulfillment_notes}
                          </div>
                        )}

                        {/* Receipt Confirmation Button for Operator */}
                        {isFulfilled && !isClosed && (
                          <Button
                            size="sm"
                            disabled={closingFrId === r.id}
                            onClick={() => handleCloseFloorRequest(r.id)}
                            className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl mt-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            {closingFrId === r.id ? "Confirming..." : "Confirm Receipt & Close Request"}
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REPORT NDP */}
        {activeTab === 'NDP' && (
          <div className="max-w-xl w-full bg-stone-950 p-6 sm:p-8 rounded-3xl border border-rose-900/60 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-stone-800 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Notice to Down Process (NDP)</h2>
                <p className="text-xs text-rose-400 font-semibold">Immediate Asset Lockdown & Station Halt</p>
              </div>
            </div>

            <form onSubmit={handleSubmitNDP} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Incident Category</label>
                <select
                  value={ndpCategory}
                  onChange={(e) => setNdpCategory(e.target.value)}
                  className="w-full h-11 bg-stone-900 border border-stone-700 rounded-xl px-3 text-xs text-white"
                >
                  <option value="MACHINE_BREAKDOWN">🚨 Machine Breakdown (Tool/Motor Failure)</option>
                  <option value="MATERIAL_SHORTAGE">📦 Critical Material Depletion</option>
                  <option value="QUALITY_DEFECT">❌ Major Quality Defect / Scrap Surge</option>
                  <option value="POWER_OUTAGE">⚡ Power / Facility Interruption</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Select Broken Machine (Asset)</label>
                <select
                  value={ndpMachineId}
                  onChange={(e) => setNdpMachineId(e.target.value)}
                  className="w-full h-11 bg-stone-900 border border-stone-700 rounded-xl px-3 text-xs text-white font-mono"
                >
                  <option value="">-- General Station (No specific machine) --</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.item_code}] {m.name} ({m.machine_category || 'MACHINE'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Severity Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {['CRITICAL', 'HIGH', 'MEDIUM'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setNdpSeverity(lvl)}
                      className={`h-9 rounded-xl text-xs font-black uppercase transition-all ${
                        ndpSeverity === lvl
                          ? 'bg-rose-600 text-white shadow-lg'
                          : 'bg-stone-900 text-stone-400 border border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Failure Detail & Symptoms</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe failure symptoms (e.g. spindle overheating, noise, hydraulic leak)..."
                  value={ndpDesc}
                  onChange={(e) => setNdpDesc(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl p-3 text-xs text-white resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmittingNdp}
                className="w-full h-12 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-lg"
              >
                {isSubmittingNdp ? "Broadcasting Lockdown..." : "Trigger NDP & Halt Line"}
              </Button>
            </form>
          </div>
        )}

        {/* TAB 4: FLEET STATUS */}
        {activeTab === 'DASHBOARD' && (
          <div className="max-w-4xl w-full bg-stone-950 p-6 sm:p-8 rounded-3xl border border-stone-800 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-stone-800 pb-4">
              <div>
                <h2 className="text-lg font-black text-white">Machine Fleet & Workstation Matrix</h2>
                <p className="text-xs text-stone-400">Real-time status of shop floor equipment and active locks</p>
              </div>
              <Button variant="ghost" size="sm" onClick={loadTerminalData} className="text-stone-400 text-xs">
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingDashboard ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[480px] overflow-auto custom-scrollbar">
              {machines.map((m) => {
                const isBroken = m.operational_status === 'BROKEN';
                const isInUse = m.operational_status === 'IN_USE';
                return (
                  <div
                    key={m.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isBroken
                        ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                        : isInUse
                        ? 'bg-blue-950/40 border-blue-800/80 text-blue-300'
                        : 'bg-stone-900 border-stone-800 text-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-xs font-bold text-white">{m.item_code}</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        isBroken ? 'bg-rose-500 text-white' :
                        isInUse ? 'bg-blue-500 text-white' :
                        'bg-emerald-500 text-white'
                      }`}>
                        {m.operational_status}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white mt-1 line-clamp-1">{m.name}</h4>
                    <div className="text-[10px] text-stone-400 mt-2 space-y-0.5">
                      <div>Category: {m.machine_category || 'GENERAL'}</div>
                      <div>Capacity: {m.capacity_per_hour || 10} u/hr</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {/* WOT Genealogy Travel Log Modal */}
      {showGenealogyModal && scannedWot && (
        <WotGenealogyModal
          isOpen={showGenealogyModal}
          onClose={() => setShowGenealogyModal(false)}
          wot={scannedWot}
        />
      )}

      {/* Live Camera QR Scanner Modal */}
      {showCameraScanner && (
        <ScannerModal
          isOpen={showCameraScanner}
          onClose={() => setShowCameraScanner(false)}
          onScan={handleCameraScan}
        />
      )}

    </div>
  );
}

export default ShopFloorTerminal;


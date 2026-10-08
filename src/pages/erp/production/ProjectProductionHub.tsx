import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProductionPhaseSetup } from "./hub/ProductionPhaseSetup";
import { useInterval } from "@/hooks/useInterval";
import { ProductionPhasePlanning } from "./hub/ProductionPhasePlanning";
import { ProductionLogger } from "./hub/logger/ProductionLogger";
import { ProductionPhaseClosing } from "./hub/ProductionPhaseClosing";
import { io } from "socket.io-client";
import { useProductionStore } from "@/stores/productionStore";
import { useProductionHubStore } from "@/stores/productionHubStore";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import { 
  ArrowLeft, Layers, Play, Pause, CheckCircle2, AlertTriangle, 
  PackageCheck, PackageOpen, Clock, RefreshCw, Lock, Unlock, Users, Activity, 
  Trash2, Package, QrCode, Settings2, X, Plus, Printer, Download,
  Sparkles, ShieldCheck, BarChart3, ChevronRight, Factory, Wand2, Sliders, Search, Edit3, Save,
  ChevronDown, ExternalLink, ShieldAlert, Check
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { NdpPreviewModal } from "@/components/erp/NdpPreviewModal";
import { TravelTagModal } from "@/components/erp/TravelTagModal";
import { BopRoutingPreviewModal } from "@/components/erp/BopRoutingPreviewModal";
import { AssignmentAnalysisModal } from "@/components/erp/AssignmentAnalysisModal";
import { ProcurementWavesModal } from "@/components/erp/ProcurementWavesModal";
import { FgrPreviewModal } from "@/components/erp/FgrPreviewModal";
import { ClockWipeIndicator } from "@/components/erp/ClockWipeIndicator";
import { WotQrScannerModal } from "@/components/erp/WotQrScannerModal";
import { ProductionOeeWipModal } from "@/components/erp/ProductionOeeWipModal";
import { WotCycleEstimatorModal } from "@/components/erp/production/WotCycleEstimatorModal";
import { BatchStartPreviewPanel } from "@/components/erp/BatchStartPreviewPanel";
import { WipLedgerStrip } from "@/components/erp/WipLedgerStrip";
import { Loader } from "@/components/shared/Loader";
import { cn } from "@/lib/utils";

const isNonMfgProject = (project: any) => {
  if (!project) return false;
  const cats = ['GENERAL_PURCHASE', 'SOFTWARE_LICENSE', 'OFFICE_SUPPLIES', 'MARKETING_EVENT', 'CONSULTING_SERVICE', 'INFRASTRUCTURE'];
  return cats.includes(project.project_category) || cats.includes(project.type);
};

export default function ProjectProductionHub() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const {
    currentPhase, setCurrentPhase,
    factoryFactor, setFactoryFactor,
    isLoading, setIsLoading,
    isGeneratingLots, setIsGeneratingLots,
    stations, setStations,
    isSettingMaster, setIsSettingMaster,
    showAnalysisModal, setShowAnalysisModal,
    sidePanelAssignStep, setSidePanelAssignStep,
    showBatchStartPreview, setShowBatchStartPreview,
    showProcurementDrawer, setShowProcurementDrawer,
    inlineNdpStepId, setInlineNdpStepId,
    showLotsLabelsModal, setShowLotsLabelsModal,
    isExportingLabels, setIsExportingLabels,
    customLotSize, setCustomLotSize,
    project, setProject,
    spkData, setSpkData,
    bom, setBom,
    shortageAnalysis, setShortageAnalysis,
    lots, setLots,
    machines, setMachines,
    activeNdps, setActiveNdps,
    itemsCatalog, setItemsCatalog,
    stationTimers, setStationTimers,
    selectedBop, setSelectedBop,
    showFgrModal, setShowFgrModal,
    fgrData, setFgrData,
    isFinishing, setIsFinishing,
    confirmModal, setConfirmModal,
    selectedTagForView, setSelectedTagForView,
    selectedNdpForView, setSelectedNdpForView,
    showQrScannerModal, setShowQrScannerModal,
    ndpForm, setNdpForm,
    bopSearchQuery, setBopSearchQuery,
    editingCtStepId, setEditingCtStepId,
    editingCtValue, setEditingCtValue
  } = useProductionHubStore();

  const [showOeeWipModal, setShowOeeWipModal] = useState(false);
  const [showWotCycleModal, setShowWotCycleModal] = useState(false);

  const bopSteps = useProductionStore(state => state.bopData);
  const setBopSteps = useProductionStore(state => state.setBopData);

  const fetchDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isIncrementingRef = useRef<boolean>(false);

  const safeBopSteps = useMemo(() => Array.isArray(bopSteps) ? bopSteps : [], [bopSteps]);
  const safeStations = useMemo(() => Array.isArray(stations) ? stations : [], [stations]);
  const safeNdps = useMemo(() => Array.isArray(activeNdps) ? activeNdps : [], [activeNdps]);
  const safeShortageAnalysis = useMemo(() => Array.isArray(shortageAnalysis) ? shortageAnalysis : [], [shortageAnalysis]);

  const calculateCPM = (steps: any[], qty: number, assignments: any[], ff: number) => {
    const nodes = steps.map(s => {
      const mp = assignments.filter(a => a.bop_id === s.id).length || 1;
      const ct = s.cycle_time_minutes || 60;
      const durationDays = (qty * ct) / (mp * (ff / 100) * 8 * 60); 
      return { ...s, duration: Math.max(0.01, durationDays), mp };
    });

    const es: Record<string, number> = {}, ef: Record<string, number> = {};
    nodes.forEach(n => {
      let preds: string[] = [];
      try {
        preds = typeof n.predecessor_ids === 'string' ? JSON.parse(n.predecessor_ids) : n.predecessor_ids || [];
      } catch (e) {}
      es[n.id] = preds.length > 0 ? Math.max(...preds.map((pId: string) => ef[pId] || 0)) : 0;
      ef[n.id] = es[n.id] + n.duration;
    });

    const projectEF = Math.max(...Object.values(ef), 0);
    const ls: Record<string, number> = {}, lf: Record<string, number> = {};
    [...nodes].reverse().forEach(n => {
      const succs = nodes.filter(s => {
        let sPreds: string[] = [];
        try { sPreds = typeof s.predecessor_ids === 'string' ? JSON.parse(s.predecessor_ids) : s.predecessor_ids || []; } catch (e) {}
        return sPreds.includes(n.id);
      });
      lf[n.id] = succs.length > 0 ? Math.min(...succs.map((s: any) => ls[s.id] || projectEF)) : projectEF;
      ls[n.id] = lf[n.id] - n.duration;
    });

    return nodes.map(n => ({
      ...n,
      es_days: es[n.id], ef_days: ef[n.id],
      ls_days: ls[n.id], lf_days: lf[n.id],
      float_days: ls[n.id] - es[n.id],
      is_critical_path: Math.abs(ls[n.id] - es[n.id]) < 0.001
    }));
  };

  const processSteps = useMemo(() => {
    return safeBopSteps
      .filter((s: any) => {
        if (!s) return false;
        const nodeType = String(s.node_type || "").toUpperCase();
        if (nodeType === "PRODUCT" || nodeType === "START" || nodeType === "END") return false;
        const name = s.process_name || s.step_name || s.name || s.task_name;
        return Boolean(name && String(name).trim() !== "");
      })
      .map((s: any, idx: number) => ({
        ...s,
        id: s.id || `bop_${idx}`,
        process_name: s.process_name || s.step_name || s.name || s.task_name || `Process ${idx + 1}`,
        step_sequence: s.step_sequence ?? (idx + 1),
        cycle_time_minutes: s.cycle_time_minutes || (s.cycle_time_seconds ? Math.round(s.cycle_time_seconds / 60) : 0) || Math.round((Number(s.standard_hours) || 1) * 60) || 60,
        standard_hours: s.standard_hours || (s.cycle_time_minutes ? Number((s.cycle_time_minutes / 60).toFixed(2)) : 1.0),
        node_type: s.node_type || "PROCESS"
      }));
  }, [safeBopSteps]);

  const cpmSchedule = useMemo(() => {
    return calculateCPM(processSteps, project?.qty || 1, [], factoryFactor);
  }, [processSteps, project, factoryFactor]);

  const filteredProcessSteps = useMemo(() => {
    if (!bopSearchQuery.trim()) return processSteps;
    const q = bopSearchQuery.toLowerCase();
    return processSteps.filter(s => {
      const st = safeStations.find(station => station && station.id === s.station_id);
      return (s.process_name && s.process_name.toLowerCase().includes(q)) ||
             (st && ((st.station_code && st.station_code.toLowerCase().includes(q)) || (st.station_name && st.station_name.toLowerCase().includes(q))));
    });
  }, [processSteps, safeStations, bopSearchQuery]);

  const completedCount = processSteps.filter(s => s.status === "COMPLETED").length;
  const allBopCompleted = processSteps.length > 0 && completedCount === processSteps.length;
  const isMasterSet = Boolean(project?.is_master_set);

  // Synchronize 1 WOT Root-to-Finish Mathematical CPM Analysis (Point 2 & 7)
  useEffect(() => {
    if (processSteps.length === 0) return;
    const wotSize = customLotSize || 10;
    const ff = (factoryFactor || 85) / 100;
    const wh = 8.0;

    const nodes = processSteps.map(s => {
      const station = safeStations.find(st => st.id === s.station_id);
      const stMp = station?.max_manpower || 1;
      const ct = s.cycle_time_minutes || 15;
      const ect = ct / (stMp * ff);
      const hours = (wotSize * ect) / 60;
      const days = hours / wh;
      return {
        ...s,
        station_name: station?.station_name || "Station",
        mp: stMp,
        hours,
        durationDays: Math.max(0.01, days)
      };
    });

    const es: Record<string, number> = {}, ef: Record<string, number> = {};
    nodes.forEach(n => {
      let preds: string[] = [];
      try { preds = typeof n.predecessor_ids === 'string' ? JSON.parse(n.predecessor_ids) : n.predecessor_ids || []; } catch (e) {}
      es[n.id] = preds.length > 0 ? Math.max(...preds.map((pId: string) => ef[pId] || 0)) : 0;
      ef[n.id] = es[n.id] + n.durationDays;
    });

    const maxDays = Math.max(...Object.values(ef), 0);
    const totalCriticalHours = maxDays * wh;

    const criticalPath = nodes
      .filter(n => Math.abs(ef[n.id] - maxDays) < 0.2 || es[n.id] === 0 || nodes.length <= 4)
      .map(n => ({ id: n.id, name: n.process_name, hours: n.hours }));

    const stationLoads: Record<string, { name: string; hours: number }> = {};
    nodes.forEach(n => {
      const stKey = n.station_id || 'st_default';
      if (!stationLoads[stKey]) stationLoads[stKey] = { name: n.station_name, hours: 0 };
      stationLoads[stKey].hours += n.hours;
    });
    const bottleneckStation = Object.values(stationLoads).sort((a, b) => b.hours - a.hours)[0] || null;

    // Delivery Gap Analysis (Flow 2)
    const targetQty = Number(project?.qty) || 100;
    const wotQty = Math.max(1, customLotSize || project?.lot_size || 10);
    const wotsNeeded = Math.max(1, Math.ceil(targetQty / wotQty));
    
    // Estimate total days: from CPM critical lead time per WOT or process steps fallback
    const fallbackDaysPerWot = Math.max(0.5, (processSteps.reduce((acc, s) => acc + (Number(s.cycle_time_minutes) || 10), 0) * wotQty) / (8 * 60));
    const effectiveDaysPerWot = maxDays > 0 ? maxDays : fallbackDaysPerWot;
    const estimatedTotalDays = Math.max(1, Math.ceil(effectiveDaysPerWot * wotsNeeded));
    
    // Available calendar days until SPK / Project due date
    const now = new Date();
    const deadlineStr = project?.due_date || project?.end_date || project?.deadline || spkData?.due_date || spkData?.target_completion_date;
    let availableCalendarDays = 0;
    if (deadlineStr) {
      const targetDate = new Date(deadlineStr);
      const startDate = project?.start_date ? new Date(project.start_date) : now;
      const ms = targetDate.getTime() - startDate.getTime();
      availableCalendarDays = Math.max(1, Math.ceil(ms / (1000 * 3600 * 24)));
    } else {
      // Default to standard 14 days or estimatedTotalDays + 4 buffer if no dates specified
      availableCalendarDays = Math.max(14, estimatedTotalDays + 4);
    }

    const gapDays = availableCalendarDays - estimatedTotalDays;
    const isDelayed = gapDays < 0;
    const gapAnalysis = {
      estimatedTotalDays,
      availableCalendarDays,
      gapDays,
      isDelayed
    };

    useProductionHubStore.getState().setGapAnalysis(gapAnalysis);
    useProductionHubStore.getState().setCpmAnalysis({
      totalCriticalHours,
      totalDays: maxDays,
      criticalPath,
      bottleneckStation: bottleneckStation?.name || "N/A",
      nodes,
      gapAnalysis
    });
  }, [processSteps, safeStations, factoryFactor, customLotSize, project, spkData]);

  const hasLoadedRef = useRef<boolean>(false);

  const fetchData = (silent = true) => {
    if (fetchDataTimeoutRef.current) clearTimeout(fetchDataTimeoutRef.current);
    fetchDataTimeoutRef.current = setTimeout(() => {
      fetchRawData(silent);
    }, 150);
  };

  const fetchRawData = async (silent = false) => {
    try {
      if (!silent && !hasLoadedRef.current) {
        setIsLoading(true);
      }
      const [projRes, bopRes, ndpRes, itemsRes, lotRes, stationsRes, shortageRes, wotsRes, etaRes] = await Promise.all([
        apiFetch(`/api/projects/${id}`, {}, user?.username),
        apiFetch(`/api/production/bop?project_id=${id}`, {}, user?.username),
        apiFetch(`/api/production/ndp?project_id=${id}`, {}, user?.username),
        apiFetch(`/api/items`, {}, user?.username),
        apiFetch(`/api/production/projects/${id}/lots`),
        apiFetch(`/api/production/projects/${id}/stations`, {}, user?.username),
        apiFetch(`/api/projects/${id}/shortage-analysis`, {}, user?.username),
        apiFetch(`/api/production/projects/${id}/wots`, {}, user?.username),
        apiFetch(`/api/production/projects/${id}/wot-eta`, {}, user?.username)
      ]);

      if (projRes.ok && projRes.data) {
        if (isNonMfgProject(projRes.data.project)) {
          showToast("Internal procurement categories cannot be assigned to Production Hub.", "info");
          navigate("/production");
          return;
        }
        setProject(projRes.data.project);
        setFactoryFactor(projRes.data.project.factory_factor ?? 85);
        setSpkData(projRes.data.spk || null);
        setBom(Array.isArray(projRes.data.bom) ? projRes.data.bom : []);

        if (!hasLoadedRef.current) {
          const pStatus = projRes.data.project.status;
          const lotList = Array.isArray(lotRes.data) ? lotRes.data : (lotRes.data?.lots || []);
          if (pStatus === 'COMPLETED' || pStatus === 'FINISHED') {
            setCurrentPhase('CLOSING');
          } else if (projRes.data.project.is_master_set && lotList.length > 0) {
            setCurrentPhase('LOGGER');
          } else if (projRes.data.project.is_master_set) {
            setCurrentPhase('PLANNING');
          } else {
            setCurrentPhase('SETUP');
          }
        }
      }

      if (bopRes.ok && bopRes.data) {
        const rawSteps = Array.isArray(bopRes.data) 
          ? bopRes.data 
          : (bopRes.data?.bop || bopRes.data?.steps || bopRes.data?.data || bopRes.data?.bill_of_processes || projRes?.data?.bop || projRes?.data?.processes || projRes?.data?.bopSteps || []);
        setBopSteps(rawSteps);
      } else if (projRes?.ok && projRes.data) {
        const rawSteps = projRes.data.bop || projRes.data.processes || projRes.data.bopSteps || [];
        if (rawSteps.length > 0) setBopSteps(rawSteps);
      }
      if (ndpRes.ok && ndpRes.data) setActiveNdps(Array.isArray(ndpRes.data) ? ndpRes.data : (ndpRes.data?.ndps || ndpRes.data?.ndp || []));
      if (itemsRes.ok && itemsRes.data) setItemsCatalog(Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data?.items || []));
      if (lotRes.ok && lotRes.data) setLots(Array.isArray(lotRes.data) ? lotRes.data : (lotRes.data?.lots || []));
      if (stationsRes.ok && stationsRes.data) setStations(Array.isArray(stationsRes.data) ? stationsRes.data : (stationsRes.data?.stations || []));
      if (wotsRes && wotsRes.ok && wotsRes.data) useProductionHubStore.getState().setWots(wotsRes.data.wots || []);
      if (etaRes && etaRes.ok && etaRes.data) useProductionHubStore.getState().setStationEtas(etaRes.data.station_etas || []);
      if (shortageRes?.ok && shortageRes?.data) setShortageAnalysis(Array.isArray(shortageRes.data) ? shortageRes.data : (shortageRes.data?.shortages || shortageRes.data?.shortage || []));
      
      hasLoadedRef.current = true;
    } catch (err) {
      console.error("Error loading project hub:", err);
      showToast("Failed to load project details", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchRawData(false);
    }
    return () => {
      if (fetchDataTimeoutRef.current) clearTimeout(fetchDataTimeoutRef.current);
    };
  }, [id]);

  useEffect(() => {
    const socket = io();
    socket.on('connect', () => {
      socket.emit('subscribe_project', { project_id: id });
    });
    socket.on('bop_updated', () => fetchData(true));
    socket.on('production_update', () => fetchData(true));
    socket.on('bop_status_changed', () => fetchData(true));
    socket.on('ndp_updated', () => fetchData(true));
    socket.on('manpower_assigned', () => fetchData(true));
    socket.on('lot_updated', () => fetchData(true));
    socket.on('project_updated', () => fetchData(true));

    return () => {
      socket.disconnect();
    };
  }, [id]);

  useEffect(() => {
    const ff = Number(project?.factory_factor || factoryFactor || 85);
    setStationTimers(prev => {
      const next = { ...prev };
      safeBopSteps.forEach(step => {
        if (!step) return;
        const stdMins = step.cycle_time_minutes || Math.round((step.standard_hours || 1) * 60) || 1;
        const adjMins = stdMins * (100 / (ff > 0 ? ff : 85));
        const cycleSecs = Math.max(1, adjMins * 60);

        if (!next[step.id]) {
          next[step.id] = { remainingSecs: cycleSecs, totalSecs: cycleSecs, progressPercent: 0 };
        } else {
          next[step.id].totalSecs = cycleSecs;
        }
      });
      return next;
    });
  }, [safeBopSteps, project, factoryFactor]);

  // Scan-based MES Execution: Units progress exclusively via physical/digital WOT scans on the shopfloor.

  const getDirectProcessPredecessors = (stepId: string): any[] => {
    const step = safeBopSteps.find((s: any) => s && s.id === stepId);
    if (!step) return [];
    let preds: string[] = [];
    try {
      preds = typeof step.predecessor_ids === 'string' ? JSON.parse(step.predecessor_ids) : step.predecessor_ids || [];
    } catch (e) {
      preds = [];
    }
    const processPreds: any[] = [];
    preds.forEach(pId => {
      const pStep = safeBopSteps.find((s: any) => s && s.id === pId);
      if (pStep && pStep.node_type !== 'START') {
        processPreds.push(pStep);
      }
    });
    return processPreds;
  };

  const getBomAllocationsForStep = (stepId: string) => {
    const step = safeBopSteps.find((s: any) => s.id === stepId);
    if (!step) return [];
    try {
      const allocs = typeof step.bom_allocations === 'string' ? JSON.parse(step.bom_allocations) : (step.bom_allocations || []);
      return allocs.map((a: any) => {
        const bomItem = safeShortageAnalysis.find((sa: any) => sa.bom_id === a.bom_id);
        return {
          ...a,
          item_code: bomItem?.item_code || '',
          required_qty: (a.fraction || 1) * (bomItem?.required_qty || 0),
          received_qty: bomItem?.received_by_production || 0,
          consumed_qty: bomItem?.consumed || 0
        };
      });
    } catch(e) {
      return [];
    }
  };

  const getStationWipLedger = (step: any) => {
    if (!step) return {
      producedByUpstream: 0,
      consumedByThisStation: 0,
      availableQty: 0,
      availableWip: 0,
      inTransitQty: 0,
      isStarved: false,
      bottleneckProcess: "",
      materialStatus: "MATERIAL_READY",
      isInterStationGate: false,
      requiredLotSize: 1,
      lotProgress: { completedLots: 0, unitsInCurrentLot: 0, lotSize: 10 }
    };

    const targetQty = project?.qty || 1;
    const consumedByThisStation = Number(step.completed_qty || 0);
    const lotSize = Math.max(1, Number(customLotSize || (lots && lots[0]?.target_qty) || 10));

    const processPreds = getDirectProcessPredecessors(step.id);
    const materialAllocations = getBomAllocationsForStep(step.id);

    let minUpstreamQty = Infinity;
    let bottleneck = "";
    let isInterStationGate = false;
    let lotProgress = { completedLots: 0, unitsInCurrentLot: 0, lotSize };

    if (processPreds.length > 0) {
      processPreds.forEach(p => {
        let rawQty = 0;
        if (p.node_type === 'PRODUCT') {
          const status = (p.lifecycle_status || "").toUpperCase();
          if (status === 'AVAILABLE' || status === 'PRODUCED') {
            rawQty = Number(p.qty_on_hand || p.completed_qty || 0);
          } else if (status === 'CONSUMED') {
            rawQty = 0;
          } else {
            rawQty = Number(p.completed_qty || 0);
          }
        } else {
          rawQty = Number(p.completed_qty || 0);
        }

        // Check if predecessor is in the same station
        const isSameStation = Boolean(
          (p.station_id && step.station_id && p.station_id === step.station_id) ||
          (!p.station_id && !step.station_id)
        );

        let effectiveQty = rawQty;
        if (!isSameStation && p.node_type !== 'PRODUCT') {
          isInterStationGate = true;
          // Rule 2: Inter-station requires minimum 1 lot WOT
          const fullLots = Math.floor(rawQty / lotSize);
          effectiveQty = fullLots * lotSize;
          if (targetQty <= lotSize && rawQty >= targetQty) {
            effectiveQty = targetQty;
          }
          lotProgress = {
            completedLots: fullLots,
            unitsInCurrentLot: rawQty % lotSize,
            lotSize
          };
        }

        if (effectiveQty < minUpstreamQty) {
          minUpstreamQty = effectiveQty;
          if (!isSameStation && rawQty < lotSize) {
            bottleneck = `${p.process_name || `Step ${p.step_sequence}`} (Menunggu 1 Lot WOT: ${rawQty}/${lotSize} unit)`;
          } else if (!isSameStation && rawQty % lotSize > 0) {
            bottleneck = `${p.process_name || `Step ${p.step_sequence}`} (Menunggu lot selesai: butuh ${lotSize - (rawQty % lotSize)} unit lagi)`;
          } else {
            bottleneck = p.process_name || `Step ${p.step_sequence}`;
          }
        }
      });
    } else {
      minUpstreamQty = targetQty;
    }

    if (minUpstreamQty === Infinity) minUpstreamQty = 0;

    let minMaterialWip = Infinity;
    let materialInTransit = 0;
    
    if (materialAllocations.length > 0) {
      for (const material of materialAllocations) {
        const availableWipFromMaterial = Math.max(0, material.received_qty - material.consumed_qty);
        if (availableWipFromMaterial < minMaterialWip) {
          minMaterialWip = availableWipFromMaterial;
          if (availableWipFromMaterial < minUpstreamQty) {
            bottleneck = material.item_code || "Material";
          }
        }
        materialInTransit += material.in_transit_qty;
      }
    } else {
      minMaterialWip = Infinity;
    }

    let effectiveAvailableWip = Math.min(minUpstreamQty, minMaterialWip);
    if (effectiveAvailableWip === Infinity) effectiveAvailableWip = targetQty;
    
    const availableWip = Math.max(0, effectiveAvailableWip - consumedByThisStation);
    const isStarved = availableWip <= 0 && step.status !== 'COMPLETED' && materialInTransit === 0;

    let materialStatus = "MATERIAL_READY";
    if (materialAllocations.length > 0) {
      if (availableWip <= 0) {
        materialStatus = materialInTransit > 0 ? "IN_TRANSIT" : "WAITING_MATERIAL";
      }
    }

    return {
      producedByUpstream: effectiveAvailableWip,
      consumedByThisStation,
      availableQty: availableWip,
      availableWip,
      inTransitQty: materialInTransit,
      isStarved,
      bottleneckProcess: bottleneck,
      materialStatus,
      isInterStationGate,
      requiredLotSize: isInterStationGate ? lotSize : 1,
      lotProgress
    };
  };

  const getCanonicalStationStatus = (step: any): 'IDLE' | 'SETUP' | 'RUNNING' | 'STARVED' | 'PAUSED_MANUAL' | 'PAUSED_NDP' | 'COMPLETED' => {
    if (!step) return 'IDLE';
    if (step.status === 'COMPLETED' || (step.completed_qty && step.completed_qty >= (project?.qty || 1))) {
      return 'COMPLETED';
    }
    const hasActiveNdp = safeNdps.some(n => n && n.bop_id === step.id && n.status === "ACTIVE");
    if (hasActiveNdp) {
      return 'PAUSED_NDP';
    }
    if (step.status === 'PAUSED') {
      return 'PAUSED_MANUAL';
    }
    const wipLedger = getStationWipLedger(step);
    if (wipLedger.isStarved) {
      return 'STARVED';
    }
    const stepAssignments: any[] = [];
    const hasOperator = stepAssignments.length > 0;
    if (step.status === 'RUNNING' && hasOperator) {
      return 'RUNNING';
    }
    if (hasOperator) {
      return 'SETUP';
    }
    return 'IDLE';
  };

  const getIncompletePredecessors = (step: any) => {
    const processPreds = getDirectProcessPredecessors(step.id);
    const incomplete: string[] = [];
    processPreds.forEach(p => {
      const isReady = (p.node_type === 'PRODUCT' 
        ? (p.status === 'COMPLETED' || p.lifecycle_status?.toUpperCase() === 'PRODUCED' || p.lifecycle_status?.toUpperCase() === 'AVAILABLE' || (p.completed_qty && p.completed_qty > 0))
        : (p.status === 'COMPLETED' || (p.completed_qty && p.completed_qty > 0)));
      if (!isReady) {
        incomplete.push(p.process_name || `Step ${p.step_sequence}`);
      }
    });
    return [...new Set(incomplete)];
  };

  const isLotUnlocked = (lot: any, stepId: string) => {
    if (!lot) return false;
    const processPreds = getDirectProcessPredecessors(stepId);
    if (processPreds.length === 0) return true;
    return processPreds.every(p => Number(p.completed_qty || 0) >= (lot.target_qty || 100));
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const handleIncrementUnit = async (stepId: string, qty = 1) => {
    if (isIncrementingRef.current) return;
    try {
      isIncrementingRef.current = true;
      const res = await apiFetch(`/api/production/bop/${stepId}/increment`, {
        method: "POST",
        body: JSON.stringify({ increment: qty })
      }, user?.username);
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      isIncrementingRef.current = false;
    }
  };

  const handleStartStation = async (step: any, isManual: boolean = true) => {
    const incompletePreds = getIncompletePredecessors(step);
    if (incompletePreds.length > 0) {
      if (isManual) showToast(`Cannot start "${step.process_name}"! Waiting for prerequisites: ${incompletePreds.join(", ")}`, "error");
      return;
    }
    const stepAssignments: any[] = [];
    if (stepAssignments.length === 0) {
      if (isManual) {
        setSidePanelAssignStep(step);
        showToast("Assign an operator before starting this process.", "info");
      }
      return;
    }
    try {
      const res = await apiFetch(`/api/production/bop/${step.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "RUNNING" })
      }, user?.username);
      if (res.ok) {
        if (isManual) showToast(`Station "${step.process_name}" started`, "success");
        fetchData();
      } else {
        if (isManual) showToast(res.data?.error || res.error || "Failed to start station", "error");
      }
    } catch (e: any) {
      if (isManual) showToast(e.message, "error");
    }
  };

  const handlePauseStation = async (stepId: string, isManual: boolean = true) => {
    try {
      const res = await apiFetch(`/api/production/bop/${stepId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "PAUSED", pause_type: isManual ? "MANUAL" : "AUTO", is_manual_pause: isManual ? 1 : 0 })
      }, user?.username);
      if (res.ok) {
        if (isManual) showToast("Station paused", "info");
        fetchData();
      } else {
        if (isManual) showToast(res.data?.error || res.error || "Failed to pause station", "error");
      }
    } catch (e: any) {
      if (isManual) showToast(e.message, "error");
    }
  };

  const handleResumeStation = async (stepId: string, isManual: boolean = true) => {
    try {
      const res = await apiFetch(`/api/production/bop/${stepId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "RUNNING", is_manual_pause: 0 })
      }, user?.username);
      if (res.ok) {
        if (isManual) showToast("Station resumed", "success");
        fetchData();
      } else {
        if (isManual) showToast(res.data?.error || res.error || "Failed to resume station", "error");
      }
    } catch (e: any) {
      if (isManual) showToast(e.message, "error");
    }
  };

  const handleGenerateLots = async (lotSize: number) => {
    try {
      setIsGeneratingLots(true);
      const res = await apiFetch(`/api/production/projects/${id}/wots/generate`, {
        method: 'POST',
        body: JSON.stringify({ lot_size: lotSize })
      }, user?.username);
      if (res.ok) {
        showToast("Production Lots generated successfully", "success");
        useProductionHubStore.getState().setWots(res.data?.wots || []);
        setShowLotsLabelsModal(true);
        fetchData();
      } else {
        showToast(res.data?.error || "Failed to generate lots", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsGeneratingLots(false);
    }
  };

  const handleSaveFactoryFactor = async () => {
    try {
      const res = await apiFetch(`/api/projects/${id}/factory-factor`, {
        method: "PUT",
        body: JSON.stringify({ factory_factor: Number(factoryFactor) })
      }, user?.username);
      if (res.ok) {
        showToast("Factory Factor updated", "success");
        fetchData(true);
      } else {
        showToast(res.data?.error || "Failed to update factory factor", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleUpdateCycleTimeInline = async (stepId: string, newCtMins: number) => {
    try {
      const standardHours = Number((newCtMins * (project?.qty || 1) / 60).toFixed(2));
      // Optimistically update local state so UI is instant and doesn't flicker
      setBopSteps(safeBopSteps.map((s: any) => s.id === stepId ? { ...s, cycle_time_minutes: newCtMins, standard_hours: standardHours } : s));
      setEditingCtStepId(null);

      const res = await apiFetch(`/api/production/bop/${stepId}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          standard_hours: standardHours,
          cycle_time_minutes: newCtMins
        })
      }, user?.username);
      if (res.ok) {
        showToast("Cycle time updated inline", "success");
        fetchData(true);
      } else {
        showToast(res.data?.error || "Failed to update cycle time", "error");
        fetchData(true);
      }
    } catch (err: any) {
      showToast(err.message, "error");
      fetchData(true);
    }
  };

  const handleLockMaster = async () => {
    const pSteps = safeBopSteps.filter((s: any) => s && s.node_type !== "PRODUCT" && s.node_type !== "START" && s.node_type !== "END");
    if (pSteps.length === 0) {
      showToast("No BoP routing process found for this project.", "error");
      return;
    }
    const missingCt = pSteps.some(s => !s.cycle_time_minutes || s.cycle_time_minutes <= 0);
    if (missingCt) {
      showToast("Please ensure all workstations have Cycle Time > 0 minutes.", "error");
      return;
    }
    try {
      setIsSettingMaster(true);
      const res = await apiFetch(`/api/production/projects/${id}/set-master`, {
        method: "POST"
      }, user?.username);
      if (res.ok) {
        showToast("Master Data locked! Proceeding to Production Planning.", "success");
        await fetchData(true);
        setCurrentPhase('PLANNING');
      } else {
        showToast(res.data?.error || "Failed to lock Master Data", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSettingMaster(false);
    }
  };

  const handleUnlockMaster = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Unlock Master Data",
      message: "Are you sure you want to unlock Master Data for reconfiguration?",
      action: async () => {
        try {
          const res = await apiFetch(`/api/production/projects/${id}/unlock-master`, {
            method: "POST"
          }, user?.username);
          if (res.ok) {
            showToast("Master Data unlocked for editing", "info");
            await fetchData(true);
            setCurrentPhase('SETUP');
          }
        } catch (err: any) {
          showToast(err.message, "error");
        }
      }
    });
  };

  const handleConfirmBatchStart = async (selectedStepIds: string[]) => {
    try {
      for (const stepId of selectedStepIds) {
        await apiFetch(`/api/production/bop/${stepId}/status`, {
          method: "POST",
          body: JSON.stringify({ status: "RUNNING" })
        }, user?.username);
      }
      showToast(`Activated ${selectedStepIds.length} workstation(s) successfully!`, "success");
      fetchData(true);
    } catch (err: any) {
      showToast(err.message || "Failed to batch start workstations", "error");
    }
  };

  const handleIssueInlineNdp = async (e: React.FormEvent, bopId: string) => {
    e.preventDefault();
    try {
      const res = await apiFetch("/api/production/ndp", {
        method: "POST",
        body: JSON.stringify({
          project_id: id,
          bop_id: bopId,
          ...ndpForm
        })
      }, user?.username);
      if (res.ok) {
        showToast("NDP Issued Successfully", "success");
        setInlineNdpStepId(null);
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  
  const handleFinishProject = async () => {
    try {
      const currentWots = useProductionHubStore.getState().wots || [];
      const completedWots = currentWots.filter((w: any) => w.status === 'COMPLETED');
      const actualOutputQty = completedWots.length > 0 ? completedWots.reduce((sum: number, w: any) => sum + (w.qty || 0), 0) : (project?.qty || 1);

      setIsFinishing(true);
      const res = await apiFetch(`/api/production/projects/${id}/finish-and-inbound`, {
        method: "POST",
        body: JSON.stringify({
          total_fg_qty: actualOutputQty,
          fg_location: "Warehouse FG-01",
          serial_number: `SN-${Date.now().toString().slice(-6)}`
        })

      }, user?.username);
      if (res.ok && res.data?.success) {
        showToast("Project finished & stock inbounded!", "success");
        setFgrData(res.data.fgr || {
          fgr_number: res.data.fgr_number,
          item_code: res.data.fg_code,
          item_id: res.data.item_id,
          quantity: project?.qty || 1,
          uom: project?.uom || "UNIT",
          serial_number: res.data.fgr?.serial_number || `SN-${Date.now().toString().slice(-6)}`
        });
        setShowFgrModal(true);
        fetchData();
      } else {
        showToast(res.error || res.data?.error || "Failed to finish project", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to finish project", "error");
    } finally {
      setIsFinishing(false);
    }
  };

  const exportLotsLabelsPng = async () => {
    const el = document.getElementById("lots-labels-container");
    if (!el) return;
    try {
      setIsExportingLabels(true);
      const dataUrl = await toPng(el, { quality: 0.95 });
      const link = document.createElement("a");
      link.download = `Lots_Labels_${project?.name || "Project"}.png`;
      link.href = dataUrl;
      link.click();
      showToast("Labels exported successfully", "success");
    } catch (err) {
      showToast("Failed to export labels image", "error");
    } finally {
      setIsExportingLabels(false);
    }
  };

  const actions = {
    fetchData,
    loadData: fetchData,
    handleIncrementUnit,
    handleStartStation,
    handlePauseStation,
    handleResumeStation,
    handleGenerateLots,
    handleSaveFactoryFactor,
    handleUpdateCycleTimeInline,
    handleLockMaster,
    handleUnlockMaster,
    handleConfirmBatchStart,
    setSidePanelAssignStep,
    openAssignModal: (target: any) => setSidePanelAssignStep(target),
    handleIssueInlineNdp,
    handleFinishProject,
    exportLotsLabelsPng,
    getStationWipLedger,
    getIncompletePredecessors,
    getCanonicalStationStatus,
    formatDuration,
    isLotUnlocked,
    cpmSchedule,
    processSteps,
    completedCount,
    allBopCompleted,
    isMasterSet
  };

  if (isLoading && !project) {
    return <Loader text="Loading Production Hub..." fullScreen />;
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header Section */}
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-stone-200 flex flex-col items-start gap-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
            <div className="flex items-start gap-4">
              <button onClick={() => navigate("/production")} className="p-2 hover:bg-stone-100 rounded-xl transition-colors shrink-0 border border-stone-200">
                <ArrowLeft className="w-5 h-5 text-stone-600" />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-stone-100 border border-stone-200 text-stone-600 uppercase tracking-wider">
                    SPK: {spkData?.spk_number || "Draft"}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-stone-50 border border-stone-200 text-stone-700 uppercase tracking-wider">
                    QTY: {project?.qty || 0} {project?.uom || "UNIT"}
                  </span>
                  {isMasterSet ? (
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-300 uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-3.3 h-3.3 text-emerald-600" /> Master Locked
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-300 uppercase tracking-wider flex items-center gap-1">
                      <Lock className="w-3.3 h-3.3 text-amber-600" /> Master Setup Required
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-black tracking-tight text-stone-900 mb-1">{project?.name}</h1>
                <p className="text-stone-500 text-xs font-medium">Production Control Center & MES Pipeline</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                onClick={() => setShowWotCycleModal(true)} 
                variant="secondary" 
                size="sm" 
                className="h-8 border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-900 rounded-lg font-bold text-xs"
              >
                <Clock className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> WOT Cycle & Station Flow
              </Button>
              <Button 
                onClick={() => setShowOeeWipModal(true)} 
                variant="secondary" 
                size="sm" 
                className="h-8 border-stone-200 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-800 rounded-lg font-bold text-xs"
              >
                <Activity className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> OEE & WIP Analytics
              </Button>
              <Button 
                onClick={() => setShowQrScannerModal(true)} 
                variant="secondary" 
                size="sm" 
                className="h-8 border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 rounded-lg font-bold text-xs"
              >
                <QrCode className="w-3.5 h-3.5 mr-1.5 text-stone-600" /> Scan WOT
              </Button>
              <Button 
                onClick={() => setShowAnalysisModal(true)} 
                variant="secondary" 
                size="sm" 
                className="h-8 border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 rounded-lg font-bold text-xs"
              >
                <Sliders className="w-3.5 h-3.5 mr-1.5 text-stone-600" /> Capacity & Lot Optimizer
              </Button>
              {isMasterSet && (
                <Button 
                  onClick={handleUnlockMaster} 
                  variant="secondary" 
                  size="sm" 
                  className="h-8 border-stone-200 text-stone-700 hover:bg-stone-100 rounded-lg font-bold text-xs"
                >
                  <Unlock className="w-3.5 h-3.5 mr-1.5 text-stone-600" /> Reconfig Master
                </Button>
              )}
            </div>
          </div>

          {/* 4-STEP WIZARD NAVIGATION INDICATOR */}
          <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-stone-200">
            <button
              onClick={() => setCurrentPhase('SETUP')}
              className={cn(
                "p-3 rounded-2xl text-left border transition-all flex items-center justify-between",
                currentPhase === 'SETUP'
                  ? "bg-white text-stone-900 border-stone-300 shadow-sm ring-1 ring-stone-100"
                  : "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100"
              )}
            >
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider block opacity-70">Phase 1</span>
                <span className="text-xs font-black">1. Setup & Master</span>
              </div>
              {isMasterSet ? (
                <CheckCircle2 className={`w-4 h-4 ${currentPhase === 'SETUP' ? 'text-emerald-500' : 'text-emerald-600'}`} />
              ) : (
                <Settings2 className="w-4 h-4 opacity-50" />
              )}
            </button>
            <button
              onClick={() => isMasterSet && setCurrentPhase('PLANNING')}
              disabled={!isMasterSet}
              className={cn(
                "p-3 rounded-2xl text-left border transition-all flex items-center justify-between",
                currentPhase === 'PLANNING'
                  ? "bg-white text-stone-900 border-stone-300 shadow-sm ring-1 ring-stone-100"
                  : isMasterSet
                  ? "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100"
                  : "bg-stone-50/50 text-stone-400 border-stone-200 cursor-not-allowed opacity-60"
              )}
            >
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider block opacity-70">Phase 2</span>
                <span className="text-xs font-black">2. Production Planning</span>
              </div>
              {Array.isArray(lots) && lots.length > 0 ? (
                <CheckCircle2 className={`w-4 h-4 ${currentPhase === 'PLANNING' ? 'text-emerald-500' : 'text-emerald-600'}`} />
              ) : (
                <Package className="w-4 h-4 opacity-50" />
              )}
            </button>
            <button
              onClick={() => isMasterSet && setCurrentPhase('LOGGER')}
              disabled={!isMasterSet}
              className={cn(
                "p-3 rounded-2xl text-left border transition-all flex items-center justify-between",
                currentPhase === 'LOGGER'
                  ? "bg-white text-stone-900 border-stone-300 shadow-sm ring-1 ring-stone-100"
                  : isMasterSet
                  ? "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100"
                  : "bg-stone-50/50 text-stone-400 border-stone-200 cursor-not-allowed opacity-60"
              )}
            >
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider block opacity-70">Phase 3</span>
                <span className="text-xs font-black">3. Production Logger</span>
              </div>
              <Activity className="w-4 h-4 opacity-50" />
            </button>
            <button
              onClick={() => (allBopCompleted || project?.status === 'COMPLETED') && setCurrentPhase('CLOSING')}
              className={cn(
                "p-3 rounded-2xl text-left border transition-all flex items-center justify-between",
                currentPhase === 'CLOSING'
                  ? "bg-white text-stone-900 border-stone-300 shadow-sm ring-1 ring-stone-100"
                  : (allBopCompleted || project?.status === 'COMPLETED')
                  ? "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100"
                  : "bg-stone-50/50 text-stone-400 border-stone-200 cursor-not-allowed opacity-60"
              )}
            >
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider block opacity-70">Phase 4</span>
                <span className="text-xs font-black">4. Closing & Inbound</span>
              </div>
              <PackageCheck className="w-4 h-4 opacity-50" />
            </button>
          </div>
        </div>

        {/* PHASE VIEWS */}
        {currentPhase === 'SETUP' && <ProductionPhaseSetup actions={actions} user={user} />}
        {currentPhase === 'PLANNING' && <ProductionPhasePlanning actions={actions} user={user} />}
        {currentPhase === 'LOGGER' && <ProductionLogger />}
        {currentPhase === 'CLOSING' && <ProductionPhaseClosing actions={actions} user={user} />}
      </div>

      {/* GLOBAL MODALS & SIDE PANELS */}
      <BatchStartPreviewPanel
        isOpen={showBatchStartPreview}
        onClose={() => setShowBatchStartPreview(false)}
        stations={processSteps}
        activeNdps={safeNdps}
        assignments={[]}
        onConfirmStart={handleConfirmBatchStart}
        getIncompletePredecessors={getIncompletePredecessors}
        getAvailableInputWip={getStationWipLedger}
      />

      {showProcurementDrawer && (
        <ProcurementWavesModal
          isOpen={showProcurementDrawer}
          onClose={() => setShowProcurementDrawer(false)}
          project={project}
          spkData={spkData}
          bom={Array.isArray(bom) ? bom : []}
          processSteps={processSteps}
          shortageAnalysis={Array.isArray(shortageAnalysis) ? shortageAnalysis : []}
        />
      )}

      {showAnalysisModal && (
        <AssignmentAnalysisModal
          isOpen={showAnalysisModal}
          onClose={() => setShowAnalysisModal(false)}
          project={project}
          processSteps={processSteps}
          manpowerAssignments={[]}
          factoryFactor={factoryFactor}
          initialLotSize={customLotSize || 50}
          onApplyLotSize={(newSize) => setCustomLotSize(newSize)}
        />
      )}

      {showQrScannerModal && (
        <WotQrScannerModal
          isOpen={showQrScannerModal}
          onClose={() => setShowQrScannerModal(false)}
        />
      )}

      {showFgrModal && (
        <FgrPreviewModal
          isOpen={showFgrModal}
          onClose={() => setShowFgrModal(false)}
          fgr={fgrData}
          project={project}
        />
      )}

      {selectedTagForView && (
        <TravelTagModal
          isOpen={!!selectedTagForView}
          onClose={() => setSelectedTagForView(null)}
          tag={selectedTagForView}
          project={project}
        />
      )}

      {selectedNdpForView && (
        <NdpPreviewModal
          isOpen={!!selectedNdpForView}
          onClose={() => setSelectedNdpForView(null)}
          ndp={selectedNdpForView}
        />
      )}

      {showOeeWipModal && id && (
        <ProductionOeeWipModal
          isOpen={showOeeWipModal}
          onClose={() => setShowOeeWipModal(false)}
          projectId={id}
          projectName={project?.name}
          targetQty={project?.qty}
          uom={project?.uom}
        />
      )}

      {showWotCycleModal && id && (
        <WotCycleEstimatorModal
          isOpen={showWotCycleModal}
          onClose={() => setShowWotCycleModal(false)}
          projectId={id}
          projectName={project?.name}
          wotQty={project?.lot_size || customLotSize || 10}
          onRefreshProject={() => fetchData(true)}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title || "Confirm Action"}
        message={confirmModal.message || "Are you sure?"}
        onConfirm={() => {
          if (confirmModal.action) confirmModal.action();
          setConfirmModal({ isOpen: false });
        }}
        onCancel={() => setConfirmModal({ isOpen: false })}
      />
    </div>
  );
}

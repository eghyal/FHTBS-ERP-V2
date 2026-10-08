import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  Position,
  BackgroundVariant
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus,
  Trash2,
  Copy,
  Save,
  Printer,
  Sparkles,
  Download,
  Upload,
  Layers,
  Clock,
  Users,
  ShieldCheck,
  Building2,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  Sliders,
  ExternalLink,
  Info,
  Check,
  GitBranch,
  ArrowRight,
  Network,
  Workflow,
  LayoutGrid,
  PlayCircle,
  HelpCircle,
  X,
  Wrench,
  Package,
  QrCode,
  ChevronDown,
  Send,
  Share2,
  Maximize,
  Minimize,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiFetch } from "@/utils/api";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { StationManagementModal } from "./StationManagementModal";
import { StationGroupOverlays } from "./StationGroupOverlays";
import { BopFlowNode, BopNodeData } from "@/components/erp/BopFlowNode";
import { BopRoutingPreviewModal } from "@/components/erp/BopRoutingPreviewModal";
import { cn } from "@/lib/utils";

export interface BoPStepRow {
  id: string;
  step_sequence: number;
  process_name: string;
  node_type?: "PROCESS" | "PRODUCT";
  work_center_id?: string;
  work_center_name?: string;
  execution_type: "SERIAL" | "PARALLEL";
  shift_mode?: number;
  manpower_allocated?: number;
  standard_hours?: number;
  cycle_time_minutes?: number;
  assigned_machine_id?: string;
  alternative_machine_ids?: string[];
  setup_time_minutes?: number;
  teardown_time_minutes?: number;
  predecessor_ids: string[];
  sop_instruction?: string;
  qc_criteria?: string;
  notes?: string;
  status?: string;
  progress?: number;
  bom_allocations?: { bom_id: string; fraction: number; qty?: number; uom?: string; bom_name?: string }[];
  lifecycle_status?: string;
  expected_yield_rate?: number;
  station_id?: string;
  lot_size?: number;
  transfer_mode?: string;
}

interface BopEngineeringEditorProps {
  projectId: string;
  project: any;
  onRefreshProject?: () => void;
  showPrintModal?: boolean;
  onPrintModalClose?: () => void;
}

const nodeTypes = {
  bopStep: BopFlowNode
};

// Preset Templates
const PRESET_TEMPLATES: Record<
  string,
  { title: string; category: string; desc: string; steps: Partial<BoPStepRow & { temp_predecessor_indices?: number[] }>[] }
> = {
  noodle_demo: {
    title: "Fundamental Concept: Making Instant Noodles (Serial vs Parallel)",
    category: "Core Concepts",
    desc: "Real-world demonstration of Serial flow (must wait 100% for water to boil) and Parallel flow (preparing the bowl & seasoning concurrently without waiting).",
    steps: [
      {
        process_name: "Boil Water in Pot until Boiling",
        qc_criteria: "Water boiled completely (100°C)",
        temp_predecessor_indices: [] // Parallel Start
      },
      {
        process_name: "Prepare a Clean Bowl",
        qc_criteria: "Bowl is dry & clean",
        temp_predecessor_indices: [] // Independent Parallel
      },
      {
        process_name: "Open Packaging & Pour Seasoning",
        qc_criteria: "Oil and dry seasoning spread evenly",
        temp_predecessor_indices: [1] // Series after Preparing Bowl
      },
      {
        process_name: "Chop Fresh Chili & Fried Shallots",
        qc_criteria: "Finely sliced and hygienic",
        temp_predecessor_indices: [] // Independent Parallel
      },
      {
        process_name: "Add Noodles to Boiling Water & Cook for 3 Mins",
        qc_criteria: "Optimal noodle texture (al dente)",
        temp_predecessor_indices: [0] // SERIAL: Must wait for water to boil (Step 0)
      },
      {
        process_name: "Drain & Mix Noodles in Seasoning Bowl",
        qc_criteria: "Thoroughly mixed noodles and toppings",
        temp_predecessor_indices: [2, 3, 4] // JOIN CONVERGENCE: Needs Noodles (4), Seasoning (2), Chili (3)
      },
      {
        process_name: "Stir Well & Serve Warm",
        qc_criteria: "Warm serving temperature & plated neatly",
        temp_predecessor_indices: [5] // Final Series step
      }
    ]
  },
  sheet_metal: {
    title: "Sheet Metal Fabrication & Enclosure",
    category: "Fabrication Industry",
    desc: "Parallel branches (Box Frame & Panel Components) converging into Assembly & Powder Coating.",
    steps: [
      {
        process_name: "Raw Material Prep & Sheet Shearing",
        qc_criteria: "Verify sheet thickness & grade",
        temp_predecessor_indices: []
      },
      {
        process_name: "CNC Laser Cutting Enclosure Parts",
        qc_criteria: "Check cut edge squareness & piercing",
        temp_predecessor_indices: [0]
      },
      {
        process_name: "CNC Press Brake Bending (Box Body)",
        qc_criteria: "Flange angle 90° ± 0.5°",
        temp_predecessor_indices: [1]
      },
      {
        process_name: "Internal Bracket Stamping & Stud Welds",
        qc_criteria: "Stud pull torque check",
        temp_predecessor_indices: [0] // Parallel Branch B
      },
      {
        process_name: "TIG Welded Assembly & Seam Grinding",
        qc_criteria: "Continuous seamless weld, no pinholes",
        temp_predecessor_indices: [2, 3] // Join Box + Brackets
      },
      {
        process_name: "Chemical Degreasing & Pre-treatment",
        qc_criteria: "Water-break free test",
        temp_predecessor_indices: [4]
      },
      {
        process_name: "Electrostatic Powder Coating (RAL 7035)",
        qc_criteria: "DFT 70-90 microns",
        temp_predecessor_indices: [5]
      },
      {
        process_name: "Final QC Audit & Crating",
        qc_criteria: "Full dimensional & aesthetic check",
        temp_predecessor_indices: [6]
      }
    ]
  },
  cnc_machining: {
    title: "Precision CNC Machining & Assembly",
    category: "Precision Machining",
    desc: "Parallel Machining (Lathe Shaft & Milling Base components) converging at Assembly & CMM Quality Control.",
    steps: [
      {
        process_name: "Billet Material Sawing & Facing",
        qc_criteria: "Material cert & size check",
        temp_predecessor_indices: []
      },
      {
        process_name: "CNC 3-Axis / 5-Axis Base Milling",
        qc_criteria: "Flatness within 0.02mm",
        temp_predecessor_indices: [0]
      },
      {
        process_name: "CNC Precision Lathe Turning (Shaft)",
        qc_criteria: "Diameter tolerance h6",
        temp_predecessor_indices: [0] // Parallel with Milling
      },
      {
        process_name: "Manual Deburring & Ultra Cleaning",
        qc_criteria: "Zero burrs under 10x magnification",
        temp_predecessor_indices: [1, 2] // Join
      },
      {
        process_name: "CMM Coordinate Dimensional Inspection",
        qc_criteria: "GD&T inspection report passed",
        temp_predecessor_indices: [3]
      },
      {
        process_name: "VCI Anti-rust Vacuum Packaging",
        qc_criteria: "Desiccant packet included",
        temp_predecessor_indices: [4]
      }
    ]
  }
};

// Helper to check for cycles in Directed Acyclic Graph (DAG)
export const checkHasCycle = (
  stepIdToUpdate: string,
  candidatePredIds: string[],
  currentSteps: BoPStepRow[]
): boolean => {
  if (candidatePredIds.includes(stepIdToUpdate)) return true;

  const predMap = new Map<string, string[]>();
  currentSteps.forEach((s) => {
    let p: string[] = [];
    if (s.id === stepIdToUpdate) {
      p = candidatePredIds;
    } else {
      p = Array.isArray(s.predecessor_ids)
        ? s.predecessor_ids
        : typeof s.predecessor_ids === "string"
        ? JSON.parse(s.predecessor_ids || "[]")
        : [];
    }
    predMap.set(s.id, p);
  });

  for (const startPredId of candidatePredIds) {
    const queue = [startPredId];
    const visited = new Set<string>();
    let bfsGuard = 0;

    while (queue.length > 0 && bfsGuard < 1000) {
      bfsGuard++;
      const curr = queue.shift()!;
      if (curr === stepIdToUpdate) return true;

      if (!visited.has(curr)) {
        visited.add(curr);
        const currPreds = predMap.get(curr) || [];
        for (const p of currPreds) {
          if (!visited.has(p)) {
            queue.push(p);
          }
        }
      }
    }
  }

  return false;
};

export const BopEngineeringEditor: React.FC<BopEngineeringEditorProps> = ({
  projectId,
  project,
  onRefreshProject,
  showPrintModal,
  onPrintModalClose
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { language } = useLanguage();
  
  const [currentProjectData, setCurrentProjectData] = useState<any>(project || null);

  useEffect(() => {
    if (project) {
      setCurrentProjectData(project);
    }
  }, [project]);

  const effectiveProject = currentProjectData || project;
  const bomStatus = ((effectiveProject?.bom_status || "DRAFT") as string).toUpperCase();
  const isBomAuthorized = bomStatus === "AUTHORIZED";

  const isEngineering =
    hasPermission(user, Action.MANAGE_BOM) ||
    user?.role === "ENGINEERING" ||
    user?.role === "FC" ||
    user?.role === "PRODUCTION" ||
    user?.level === "MANAGER" ||
    hasGodMode(user);

  const [steps, setSteps] = useState<BoPStepRow[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [projectBoms, setProjectBoms] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  // ECO & Auth Modal States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEcoModal, setShowEcoModal] = useState(false);
  const [showReviseBopModal, setShowReviseBopModal] = useState(false);
  const [showConfirmSubmitBopModal, setShowConfirmSubmitBopModal] = useState(false);
  const [ecoReason, setEcoReason] = useState("");
  const [reviseReason, setReviseReason] = useState("");
  const [isManufacturing, setIsManufacturing] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Effect to trigger print preview modal from parent container
  useEffect(() => {
    if (showPrintModal) {
      setShowPreviewModal(true);
      if (onPrintModalClose) {
        onPrintModalClose();
      }
    }
  }, [showPrintModal, onPrintModalClose]);

  // View Mode: Flowchart vs Matrix Table
  const [viewMode, setViewMode] = useState<"FLOWCHART" | "MATRIX">("FLOWCHART");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle escape key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Selected Step for Side Inspector
  const selectedStepIdsRef = useRef<string[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const updateSelection = useCallback((ids: string[]) => {
    setSelectedStepIds((prev) => {
      // Bail out if arrays are identical
      if (prev.length === ids.length && prev.every((v) => ids.includes(v))) {
        return prev;
      }
      selectedStepIdsRef.current = ids;
      return ids;
    });
  }, []);

  const handleSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    updateSelection(nodes.map(n => n.id));
  }, [updateSelection]);



  // Modals
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showLoadPresetModal, setShowLoadPresetModal] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [showStationModal, setShowStationModal] = useState(false);
  const [presetFile, setPresetFile] = useState<File | null>(null);
  const [presetFileName, setPresetFileName] = useState<string>("");

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Add Root Node Dropdown state
  const [showAddRootDropdown, setShowAddRootDropdown] = useState(false);
  const addRootDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addRootDropdownRef.current && !addRootDropdownRef.current.contains(event.target as any)) {
        setShowAddRootDropdown(false);
      }
    };
    if (showAddRootDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAddRootDropdown]);

  // Calculate layout coordinates for nodes (DAG Topological + Barycentric Crossing Minimization + Non-overlapping Lanes)
  const calculateAutoLayout = useCallback(
    (stepsList: BoPStepRow[]): { nodes: Node[]; edges: Edge[] } => {
      if (!stepsList || stepsList.length === 0) {
        return { nodes: [], edges: [] };
      }

      const validIds = new Set(stepsList.map((s) => s.id));
      const stepMap = new Map<string, BoPStepRow>();
      stepsList.forEach((s) => stepMap.set(s.id, s));

      // 1. Calculate incoming edges & predecessors
      const edgeList: Edge[] = [];
      const incomingMap: Record<string, string[]> = {};
      const outgoingMap: Record<string, string[]> = {};

      stepsList.forEach((s) => {
        incomingMap[s.id] = (s.predecessor_ids || []).filter((pid) => validIds.has(pid));
        outgoingMap[s.id] = [];
      });

      stepsList.forEach((s) => {
        incomingMap[s.id].forEach((predId) => {
          outgoingMap[predId].push(s.id);
          const isTargetProduct = stepMap.get(s.id)?.node_type === "PRODUCT";
          const isSourceProduct = stepMap.get(predId)?.node_type === "PRODUCT";
          
          const sourceStep = stepMap.get(predId);
          const targetStep = stepMap.get(s.id);
          const isSameStation = Boolean(
            sourceStep?.station_id && 
            targetStep?.station_id && 
            sourceStep.station_id === targetStep.station_id
          );

          let edgeLabel = undefined;
          let strokeColor = isTargetProduct ? "#d97706" : "#475569";
          let strokeDasharray = "none";
          let labelBgStyle: any = { fill: '#fef3c7', color: '#b45309', fillOpacity: 0.9 };
          let labelStyle: any = { fill: '#92400e', fontWeight: 'bold', fontSize: 10 };

          if (isSourceProduct && !isTargetProduct) {
            if (sourceStep && sourceStep.bom_allocations) {
              let allocs: any[] = [];
              try { allocs = typeof sourceStep.bom_allocations === 'string' ? JSON.parse(sourceStep.bom_allocations) : sourceStep.bom_allocations; } catch(e){}
              if (allocs && allocs.length > 0) {
                 edgeLabel = "WIP / Sub-Assy";
              }
            }
          } else if (!isSourceProduct && !isTargetProduct) {
            if (isSameStation) {
              edgeLabel = "1-Piece Flow (Intra-Stn)";
              strokeColor = "#059669";
              labelBgStyle = { fill: '#ecfdf5', color: '#065f46', fillOpacity: 0.95 };
              labelStyle = { fill: '#047857', fontWeight: 'bold', fontSize: 10 };
            } else {
              edgeLabel = `Lot Gate (${targetStep?.lot_size || 50} pcs)`;
              strokeColor = "#2563eb";
              strokeDasharray = "6 3";
              labelBgStyle = { fill: '#eff6ff', color: '#1e40af', fillOpacity: 0.95 };
              labelStyle = { fill: '#1d4ed8', fontWeight: 'bold', fontSize: 10 };
            }
          }

          edgeList.push({
            id: `edge_${predId}_to_${s.id}`,
            source: predId,
            target: s.id,
            type: "smoothstep",
            animated: true,
            label: edgeLabel,
            labelBgPadding: [8, 4],
            labelBgBorderRadius: 4,
            labelBgStyle,
            labelStyle,
            style: { stroke: strokeColor, strokeWidth: 2.5, strokeDasharray },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
              width: 18,
              height: 18
            }
          });
        });
      });

      // 2. Identify Weakly Connected Components (Independent Assemblies / Trees)
      const visited = new Set<string>();
      const components: string[][] = [];

      stepsList.forEach((s) => {
        if (!visited.has(s.id)) {
          const comp: string[] = [];
          const queue = [s.id];
          visited.add(s.id);

          let compGuard = 0;
          while (queue.length > 0 && compGuard < 1000) {
            compGuard++;
            const curr = queue.shift()!;
            comp.push(curr);

            const neighbors = [...(incomingMap[curr] || []), ...(outgoingMap[curr] || [])];
            neighbors.forEach((nbr) => {
              if (!visited.has(nbr)) {
                visited.add(nbr);
                queue.push(nbr);
              }
            });
          }
          components.push(comp);
        }
      });

      // Sort components by sequence order of their starting nodes
      components.sort((a, b) => {
        const minA = Math.min(...a.map((id) => stepMap.get(id)?.step_sequence || 0));
        const minB = Math.min(...b.map((id) => stepMap.get(id)?.step_sequence || 0));
        return minA - minB;
      });

      const nodePositions: Record<string, { x: number; y: number }> = {};
      let currentCompYOffset = 60;
      const HORIZONTAL_STEP = 380; // 290px card + 90px arrow clearance
      const MIN_NODE_GAP_Y = 240;   // 150px card + 90px vertical clearance

      components.forEach((compIds) => {
        const compIncoming: Record<string, string[]> = {};
        const compOutgoing: Record<string, string[]> = {};
        compIds.forEach((id) => {
          compIncoming[id] = incomingMap[id].filter((pid) => compIds.includes(pid));
          compOutgoing[id] = outgoingMap[id].filter((sid) => compIds.includes(sid));
        });

        // 3. Assign topological levels (Longest Path DAG Ranking)
        const levelMap: Record<string, number> = {};
        const inDegrees: Record<string, number> = {};
        compIds.forEach((id) => {
          inDegrees[id] = compIncoming[id].length;
        });

        const roots = compIds.filter((id) => inDegrees[id] === 0);
        if (roots.length === 0 && compIds.length > 0) {
          roots.push(compIds[0]);
        }

        roots.forEach((rId) => {
          levelMap[rId] = 0;
        });

        // Bellman-Ford relaxation to ensure longest path ranking
        for (let iter = 0; iter < compIds.length; iter++) {
          let changed = false;
          compIds.forEach((u) => {
            const uLevel = levelMap[u] ?? 0;
            compOutgoing[u].forEach((v) => {
              const vLevel = levelMap[v] ?? 0;
              if (uLevel + 1 > vLevel) {
                levelMap[v] = uLevel + 1;
                changed = true;
              }
            });
          });
          if (!changed) break;
        }

        // Group into layers
        const layers: Record<number, string[]> = {};
        let maxLayer = 0;
        compIds.forEach((id) => {
          const lvl = levelMap[id] || 0;
          if (lvl > maxLayer) maxLayer = lvl;
          if (!layers[lvl]) layers[lvl] = [];
          layers[lvl].push(id);
        });

        // 4. Vertical layout with Barycentric heuristic + Non-overlapping relaxation
        const localY: Record<string, number> = {};

        // Layer 0 (roots)
        const rootLayer = layers[0] || [];
        rootLayer.sort((a, b) => {
          const stepA = stepMap.get(a);
          const stepB = stepMap.get(b);
          return (stepA?.step_sequence || 0) - (stepB?.step_sequence || 0);
        });
        rootLayer.forEach((id, idx) => {
          localY[id] = idx * MIN_NODE_GAP_Y;
        });

        // Forward sweep (Layer 1 to maxLayer): place node at barycentric average of predecessors
        for (let l = 1; l <= maxLayer; l++) {
          const layer = layers[l] || [];
          layer.forEach((id) => {
            const preds = compIncoming[id];
            if (preds.length > 0) {
              const sumY = preds.reduce((acc, pId) => acc + (localY[pId] ?? 0), 0);
              localY[id] = sumY / preds.length;
            } else {
              localY[id] = 0;
            }
          });

          // Sort layer by desired Y
          layer.sort((a, b) => (localY[a] ?? 0) - (localY[b] ?? 0));

          // Resolve collisions with minimum spacing
          for (let i = 1; i < layer.length; i++) {
            const prevId = layer[i - 1];
            const currId = layer[i];
            if (localY[currId] < localY[prevId] + MIN_NODE_GAP_Y) {
              localY[currId] = localY[prevId] + MIN_NODE_GAP_Y;
            }
          }
        }

        // Backward sweep (Layer maxLayer - 1 down to 0): softly center parents to successors
        for (let l = maxLayer - 1; l >= 0; l--) {
          const layer = layers[l] || [];
          layer.forEach((id) => {
            const succs = compOutgoing[id];
            if (succs.length > 0) {
              const sumY = succs.reduce((acc, sId) => acc + (localY[sId] ?? 0), 0);
              const desiredY = sumY / succs.length;
              localY[id] = (localY[id] + desiredY) / 2;
            }
          });

          layer.sort((a, b) => (localY[a] ?? 0) - (localY[b] ?? 0));
          for (let i = 1; i < layer.length; i++) {
            const prevId = layer[i - 1];
            const currId = layer[i];
            if (localY[currId] < localY[prevId] + MIN_NODE_GAP_Y) {
              localY[currId] = localY[prevId] + MIN_NODE_GAP_Y;
            }
          }
        }

        // Normalize component bounds
        let compMinY = Infinity;
        let compMaxY = -Infinity;
        compIds.forEach((id) => {
          const y = localY[id] ?? 0;
          if (y < compMinY) compMinY = y;
          if (y > compMaxY) compMaxY = y;
        });
        if (compMinY === Infinity) compMinY = 0;
        if (compMaxY === -Infinity) compMaxY = 0;

        compIds.forEach((id) => {
          const lvl = levelMap[id] || 0;
          const normalizedY = (localY[id] ?? 0) - compMinY;
          nodePositions[id] = {
            x: 60 + lvl * HORIZONTAL_STEP,
            y: currentCompYOffset + normalizedY
          };
        });

        currentCompYOffset += (compMaxY - compMinY) + MIN_NODE_GAP_Y + 60;
      });

      // 5. Construct React Flow Nodes
      const nodeList: Node[] = stepsList.map((step, idx) => {
        const pos = nodePositions[step.id] || { x: 60 + idx * 300, y: 60 + idx * 150 };
        const assignedStation = stations.find((st) => st.id === step.station_id);
        const assignedMachine = machines.find((m) => m.id === step.assigned_machine_id);
        const isProcess = (step.node_type || "PROCESS") === "PROCESS";
        const isUnassignedStation = isProcess && (!step.station_id || !assignedStation);

        const nodeData: BopNodeData = {
          id: step.id,
          step_sequence: step.step_sequence || idx + 1,
          process_name: step.process_name,
          node_type: step.node_type || "PROCESS",
          work_center_id: step.work_center_id,
          work_center_name: step.work_center_name,
          station_id: step.station_id,
          station_name: assignedStation ? (assignedStation.station_name || assignedStation.station_code) : undefined,
          assigned_machine_id: step.assigned_machine_id,
          machine_code: assignedMachine?.item_code,
          machine_name: assignedMachine?.name,
          machine_category: assignedMachine?.machine_category,
          cycle_time_minutes: step.cycle_time_minutes,
          is_unassigned_station: isUnassignedStation,
          sop_instruction: step.sop_instruction,
          qc_criteria: step.qc_criteria,
          notes: step.notes,
          expected_yield_rate: step.expected_yield_rate,
          bom_allocations: step.bom_allocations?.map(a => {
            const bomRef = projectBoms.find(b => b.id === a.bom_id);
            return { ...a, bom_name: bomRef?.item_name || a.bom_id };
          }),
          stock_status: (() => {
            if (step.node_type !== "PRODUCT" || !step.bom_allocations || step.bom_allocations.length === 0) return undefined;
            let allGreen = true;
            let anyRed = false;
            
            step.bom_allocations.forEach(a => {
               const bomRef = projectBoms.find(b => b.id === a.bom_id);
               if (bomRef && bomRef.item_id) {
                 const inv = inventoryItems.find(i => i.id === bomRef.item_id || i.item_id === bomRef.item_id);
                 const requiredQty = (Number(bomRef.required_qty || bomRef.qty) || 0) * (a.fraction || 1);
                 const freeStock = inv ? (inv.free_stock || 0) : 0;
                 if (freeStock < requiredQty) {
                   allGreen = false;
                   if (freeStock <= 0) {
                     anyRed = true;
                   }
                 }
               } else {
                 allGreen = false;
                 anyRed = true;
               }
            });
            
            if (allGreen) return "GREEN";
            if (anyRed) return "RED";
            return "YELLOW";
          })(),
          incomingCount: (incomingMap[step.id] || []).length,
          outgoingCount: (outgoingMap[step.id] || []).length,
          isRoot: (incomingMap[step.id] || []).length === 0,
          onAddChild: (pId, type) => handleAddConnectedChild(pId, type),
          onAddParallel: (sId, type) => handleAddParallelBranch(sId, type),
          onDelete: (delId) => handleDeleteStep(delId),
          
        };

        return {
          id: step.id,
          type: "bopStep",
          position: { x: pos.x, y: pos.y },
          data: nodeData,
          selected: selectedStepIdsRef.current.includes(step.id)
        };
      });

      return { nodes: nodeList, edges: edgeList };
    },
    [projectBoms, inventoryItems, stations]
  );

  // Sync React Flow whenever `steps` changes
  useEffect(() => {
    if (steps.length > 0) {
      const { nodes: newNodes, edges: newEdges } = calculateAutoLayout(steps);
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [steps, calculateAutoLayout]);

  // Load Work Centers & BoP data from backend
  const loadBoPData = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [bopRes, wcRes, projRes, invRes, stationRes, machineRes] = await Promise.all([
        apiFetch(`/api/production/bop?project_id=${projectId}`, {}, user?.username),
        apiFetch("/api/work-centers", {}, user?.username),
        apiFetch(`/api/projects/${projectId}`, {}, user?.username),
        apiFetch("/api/inventory", {}, user?.username),
        apiFetch(`/api/production/projects/${projectId}/stations`, {}, user?.username),
        apiFetch("/api/setup-master/machines/availability", {}, user?.username)
      ]);

      if (wcRes.ok && Array.isArray(wcRes.data)) {
        setWorkCenters(wcRes.data);
      }
      
      if (stationRes.ok && Array.isArray(stationRes.data?.stations)) {
        setStations(stationRes.data.stations);
      }

      if (machineRes.ok && Array.isArray(machineRes.data?.machines)) {
        setMachines(machineRes.data.machines);
      }
      
      if (invRes.ok && Array.isArray(invRes.data)) {
        setInventoryItems(invRes.data);
      }
      
      if (projRes.ok && projRes.data) {
        const data = projRes.data;
        if (data.project) {
          setCurrentProjectData(data.project);
        }
        const hasActiveWorkOrders = data.work_orders?.length > 0;
        const hasStartedTasks = data.tasks?.some((t: any) => t.progress > 0);
        setIsManufacturing(hasActiveWorkOrders || hasStartedTasks || data.project?.status === "MANUFACTURING");
        
        if (data.bom && Array.isArray(data.bom)) {
          setProjectBoms(data.bom);
        }
      }

      if (bopRes.ok && Array.isArray(bopRes.data) && bopRes.data.length > 0) {
        // Check if there are unsaved local draft changes (e.g. from JSON import) before overwriting with server data
        const isUnsaved = localStorage.getItem(`bop_unsaved_${projectId}`) === "true";
        const savedDraft = localStorage.getItem(`bop_draft_${projectId}`);
        if (isUnsaved && savedDraft) {
          try {
            const parsedDraft = JSON.parse(savedDraft);
            if (Array.isArray(parsedDraft) && parsedDraft.length > 0) {
              setSteps(parsedDraft);
              setHasUnsavedChanges(true);
              
              return;
            }
          } catch (e) {}
        }

        const loadedSteps = bopRes.data.map((s: any, idx: number) => {
          let parsedBomAllocations = [];
          try {
             parsedBomAllocations = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : (s.bom_allocations || []);
          } catch (e) {}

          return {
            id: s.id || `step_${Date.now()}_${idx}`,
            step_sequence: s.step_sequence || idx + 1,
            process_name: s.process_name || "",
            node_type: s.node_type || "PROCESS",
            work_center_id: s.work_center_id || "",
            work_center_name: s.work_center_name || "",
            execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : (s.execution_type || "PARALLEL"),
            predecessor_ids: Array.isArray(s.predecessor_ids)
              ? s.predecessor_ids
              : typeof s.predecessor_ids === "string"
              ? JSON.parse(s.predecessor_ids || "[]")
              : [],
            sop_instruction: s.sop_instruction || s.notes || "",
            qc_criteria: s.qc_criteria || "",
            notes: s.notes || "",
            bom_allocations: parsedBomAllocations,
            lifecycle_status: s.lifecycle_status || "Planned",
            status: s.status || "PENDING",
            progress: s.progress || 0,
            station_id: s.station_id || ""
          };
        });
        setSteps(loadedSteps);
        setHasUnsavedChanges(false);
        try {
          localStorage.setItem(`bop_draft_${projectId}`, JSON.stringify(loadedSteps));
          localStorage.setItem(`bop_unsaved_${projectId}`, "false");
        } catch (e) {}
      } else {
        // Fallback: Check local storage draft backup if server returned empty
        const savedDraft = localStorage.getItem(`bop_draft_${projectId}`);
        if (savedDraft) {
          try {
            const parsedDraft = JSON.parse(savedDraft);
            if (Array.isArray(parsedDraft) && parsedDraft.length > 0) {
              setSteps(parsedDraft);
              setHasUnsavedChanges(true);
              
              return;
            }
          } catch (e) {}
        }
        setSteps([]);
        setNodes([]);
        setEdges([]);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error("Error loading BoP:", err);
      showToast("Failed to load BoP data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoPData();
  }, [projectId]);

  // Window unload protection for unsaved BOP changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Connect two nodes (Add Predecessor / Dependency edge)
  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;

      const targetStep = steps.find((s) => s.id === target);
      const sourceStep = steps.find((s) => s.id === source);
      if (!targetStep || !sourceStep) return;

      const currentPreds = targetStep.predecessor_ids || [];
      if (currentPreds.includes(source)) {
        showToast("Nodes are already connected.", "info");
        return;
      }

      const candidatePreds = [...currentPreds, source];
      if (checkHasCycle(target, candidatePreds, steps)) {
        showToast("Connection rejected: Circular dependency detected.", "error");
        return;
      }

      setSteps((prev) =>
        prev.map((s) => {
          if (s.id === target) {
            return {
              ...s,
              predecessor_ids: candidatePreds,
              execution_type: "SERIAL"
            };
          }
          return s;
        })
      );
      setHasUnsavedChanges(true);
      showToast(`Linked "${sourceStep.process_name || 'Node'}" to "${targetStep.process_name || 'Node'}" successfully!`, "success");
    },
    [steps, showToast]
  );

  // Click on Edge to Remove Connection
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const { source, target } = edge;
      setSteps((prev) =>
        prev.map((s) => {
          if (s.id === target) {
            const remainingPreds = (s.predecessor_ids || []).filter((id) => id !== source);
            return {
              ...s,
              predecessor_ids: remainingPreds,
              execution_type: remainingPreds.length > 0 ? "SERIAL" : "PARALLEL"
            };
          }
          return s;
        })
      );
      setHasUnsavedChanges(true);
      showToast("Dependency line removed. Process is now independent.", "info");
    },
    [showToast]
  );

  // Add a new Independent (Root / Parallel) Node
  const handleAddNewRootNode = (type: "PROCESS" | "PRODUCT" = "PROCESS") => {
    const newSeq = steps.length + 1;
    const newId = `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newStep: BoPStepRow = {
      id: newId,
      step_sequence: newSeq,
      process_name: type === "PRODUCT" ? `Output Product Component ${newSeq}` : `New Process Operation ${newSeq}`,
      node_type: type,
      execution_type: "PARALLEL",
      predecessor_ids: [],
      qc_criteria: "",
      notes: "",
      expected_yield_rate: 100,
    };

    setSteps((prev) => [...prev, newStep]);
    updateSelection([newId]);
    setHasUnsavedChanges(true);
    showToast(type === "PRODUCT" ? "New Product Output node added to canvas!" : "New independent process node added to canvas!", "success");
  };

  // Add Connected Child Node (+ Seri: Menunggu parent selesai 100%)
  const handleAddConnectedChild = (parentId: string, type: "PROCESS" | "PRODUCT" = "PROCESS") => {
    const parentStep = steps.find((s) => s.id === parentId);
    const newSeq = steps.length + 1;
    const newId = `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newStep: BoPStepRow = {
      id: newId,
      step_sequence: newSeq,
      process_name: type === "PRODUCT"
        ? `Output Product from ${parentStep?.process_name || "Process"}`
        : `Next Step After ${parentStep?.process_name || "Process"}`,
      node_type: type,
      execution_type: "SERIAL",
      predecessor_ids: [parentId],
      qc_criteria: "",
      notes: "",
      expected_yield_rate: 100,
    };

    setSteps((prev) => [...prev, newStep]);
    updateSelection([newId]);
    setHasUnsavedChanges(true);
    showToast(type === "PRODUCT" ? "Connected Product Output node added!" : "Connected sequential step added successfully!", "success");
  };

  // Add Parallel Sibling Node (+ Paralel: Berjalan mandiri bersamaan)
  const handleAddParallelBranch = (siblingId: string, type: "PROCESS" | "PRODUCT" = "PROCESS") => {
    const siblingStep = steps.find((s) => s.id === siblingId);
    const newSeq = steps.length + 1;
    const newId = `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newStep: BoPStepRow = {
      id: newId,
      step_sequence: newSeq,
      process_name: type === "PRODUCT"
        ? `Parallel Product Output ${newSeq}`
        : `Independent Parallel Branch ${newSeq}`,
      node_type: type,
      execution_type: "PARALLEL",
      predecessor_ids: siblingStep?.predecessor_ids ? [...siblingStep.predecessor_ids] : [],
      qc_criteria: "",
      notes: "",
      expected_yield_rate: 100,
    };

    setSteps((prev) => [...prev, newStep]);
    updateSelection([newId]);
    setHasUnsavedChanges(true);
    showToast(type === "PRODUCT" ? "Parallel product output created!" : "Parallel process branch created successfully!", "success");
  };

  // Delete Step
  
  const handleDeleteSteps = (ids: string[]) => {
    if (steps.length <= ids.length) {
      showToast("BoP must contain at least one process step.", "error");
      return;
    }

    const filtered = steps
      .filter((s) => !ids.includes(s.id))
      .map((s) => ({
        ...s,
        predecessor_ids: (s.predecessor_ids || []).filter((predId) => !ids.includes(predId))
      }));

    const resequenced = filtered.map((s, i) => ({
      ...s,
      step_sequence: i + 1,
      execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? ("SERIAL" as const) : ("PARALLEL" as const)
    }));

    setSteps(resequenced);
    updateSelection([]);
    setHasUnsavedChanges(true);
    showToast(`${ids.length} process step(s) removed.`, "info");
  };

  const handleDeleteStep = (id: string) => {
    if (steps.length <= 1) {
      showToast("BoP must contain at least one process step.", "error");
      return;
    }

    // Remove this step and clean up all predecessor references pointing to it
    const filtered = steps
      .filter((s) => s.id !== id)
      .map((s) => ({
        ...s,
        predecessor_ids: (s.predecessor_ids || []).filter((predId) => predId !== id)
      }));

    // Resequence
    const resequenced = filtered.map((s, i) => ({
      ...s,
      step_sequence: i + 1,
      execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? ("SERIAL" as const) : ("PARALLEL" as const)
    }));

    setSteps(resequenced);
    if (selectedStepIds.includes(id)) updateSelection([]);
    setHasUnsavedChanges(true);
    showToast("Process step node removed.", "info");
  };



  // Update specific step field
  
  const handleBulkUpdateStep = (ids: string[], field: keyof BoPStepRow, val: any) => {
    if (field === "predecessor_ids" || field === "id") return;
    
    setSteps((prev) =>
      prev.map((s) => {
        if (!ids.includes(s.id)) return s;
        const updated = { ...s, [field]: val };
        if (field === "work_center_id") {
          const foundWc = workCenters.find((w) => w.id === val);
          if (foundWc) {
            updated.work_center_name = foundWc.name || foundWc.code;
          }
        }
        return updated;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleUpdateStep = (id: string, field: keyof BoPStepRow, val: any) => {
    if (field === "predecessor_ids") {
      const candidatePreds = Array.isArray(val) ? val : [];
      if (checkHasCycle(id, candidatePreds, steps)) {
        showToast("Cannot update dependencies: Circular dependency detected.", "error");
        return;
      }
    }

    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, [field]: val };
        if (field === "work_center_id") {
          const foundWc = workCenters.find((w) => w.id === val);
          if (foundWc) {
            updated.work_center_name = foundWc.name || foundWc.code;
          }
        }
        return updated;
      })
    );
    setHasUnsavedChanges(true);
  };

  // Apply Preset Template
  const handleApplyPreset = (presetKey: string, toast = true) => {
    const template = PRESET_TEMPLATES[presetKey];
    if (!template) return;

    const baseId = Date.now();
    const idMap: string[] = template.steps.map((_, idx) => `step_${baseId}_${idx}`);

    const newSteps: BoPStepRow[] = template.steps.map((s, idx) => {
      const predIds = (s.temp_predecessor_indices || [])
        .map((pIdx) => idMap[pIdx])
        .filter(Boolean);

      return {
        id: idMap[idx],
        step_sequence: idx + 1,
        process_name: s.process_name || "",
        execution_type: predIds.length > 0 ? "SERIAL" : "PARALLEL",
        predecessor_ids: predIds,
        qc_criteria: s.qc_criteria || "Standard QC criteria",
        notes: s.notes || "",
        expected_yield_rate: 100,
      };
    });

    setSteps(newSteps);
    updateSelection(newSteps[0]?.id || null ? [newSteps[0]?.id || null] : []);
    setHasUnsavedChanges(true);
    setShowPresetModal(false);
    if (toast) {
      showToast(`Template "${template.title}" loaded to flowchart canvas successfully!`, "success");
    }
  };

  // Save / Sync BoP to Database
  const handleSyncBoP = async (pin?: string, reason?: string, isDraft?: boolean) => {
    // Enforce: Cannot submit BOP for approval if BOM is not authorized yet
    if (!isDraft && !isBomAuthorized) {
      showToast(
        language === "id"
          ? `Pengajuan persetujuan (Submit Approval) ditolak: Bill of Materials (BOM/BOQ) proyek ini belum ter-otorisasi (Status BOM saat ini: ${bomStatus}). Anda dapat menggunakan tombol "SAVE DRAFT" untuk menyimpan progres desain sampai BOM diotorisasi.`
          : `Submit approval rejected: Bill of Materials (BOM) is not yet authorized (Current BOM Status: ${bomStatus}). Please use "SAVE DRAFT" to save your progress until BOM is approved.`,
        "error"
      );
      return false;
    }

    // Enforce: Station requirement (>= 1) and all processes assigned when submitting for approval
    if (!isDraft) {
      if (stations.length < 1) {
        showToast(
          "Submit Approval Failed: At least 1 workstation must be registered (>= 1) before submitting BOP for approval. Please register a workstation first.",
          "error"
        );
        setShowStationModal(true);
        return false;
      }

      const procSteps = steps.filter((s) => (s.node_type || "PROCESS") === "PROCESS");
      if (procSteps.length === 0) {
        showToast(
          "Submit Approval Failed: At least 1 manufacturing process step is required before submitting BOP for approval.",
          "error"
        );
        return false;
      }

      const unassigned = procSteps.filter(
        (s) => !s.station_id || !stations.some((st) => st.id === s.station_id)
      );
      if (unassigned.length > 0) {
        const unassignedNames = unassigned.map((s) => s.process_name || "Unnamed").join(", ");
        showToast(
          `Submit Approval Failed: All processes must be assigned to a station before submitting for approval. Found ${unassigned.length} unassigned process(es): ${unassignedNames}.`,
          "error"
        );
        if (unassigned[0]?.id) {
          updateSelection([unassigned[0].id]);
        }
        return false;
      }
    }

    const invalidSteps = steps.filter((s) => !s.process_name.trim());
    if (invalidSteps.length > 0) {
      showToast("Please fill in the process name for all nodes before saving.", "error");
      return false;
    }

    // Validation: Product Node cannot be dangling (must have at least one incoming or outgoing edge)
    const danglingProducts = steps.filter(s => {
      if (s.node_type !== "PRODUCT") return false;
      const isTarget = steps.some(other => {
        let p = [];
        try { p = typeof other.predecessor_ids === 'string' ? JSON.parse(other.predecessor_ids) : other.predecessor_ids || []; } catch(e){}
        return p.includes(s.id);
      });
      let hasSource = false;
      try {
        const myP = typeof s.predecessor_ids === 'string' ? JSON.parse(s.predecessor_ids) : s.predecessor_ids || [];
        hasSource = myP.length > 0;
      } catch (e) {}
      
      return !isTarget && !hasSource;
    });

    if (danglingProducts.length > 0) {
      showToast(`Validation Failed: Product Node "${danglingProducts[0].process_name || 'Unknown'}" is dangling without any connections.`, "error");
      updateSelection(danglingProducts[0].id ? [danglingProducts[0].id] : []);
      return false;
    }

    // Validation: 100% BOM Allocation requirement when Publishing (Not Draft)
    if (!isDraft && projectBoms.length > 0) {
      const allocatedMap = new Map<string, number>();
      projectBoms.forEach(b => allocatedMap.set(b.id, 0));
      
      steps.forEach(s => {
        if (s.node_type === "PRODUCT" && s.bom_allocations) {
           let allocs: any[] = [];
           try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations; } catch(e){}
           allocs.forEach((a: any) => {
             const curr = allocatedMap.get(a.bom_id) || 0;
             allocatedMap.set(a.bom_id, curr + (a.fraction || 1));
           });
        }
      });
      
      for (const b of projectBoms) {
        const totalAlloc = allocatedMap.get(b.id) || 0;
        if (totalAlloc < 0.99) {
           showToast(`Validation Failed: Material ${b.item_name} is not fully allocated (only ${Math.round(totalAlloc*100)}%). All materials must be 100% allocated before publishing.`, "error");
           return false;
        }
        if (totalAlloc > 1.01) {
           showToast(`Validation Failed: Material ${b.item_name} is over-allocated (${Math.round(totalAlloc*100)}%). Max is 100%.`, "error");
           return false;
        }
      }
    }

    setIsSaving(true);
    try {
      const payload: any = { is_draft: !!isDraft,
        project_id: projectId,
        steps: steps.map((s, idx) => ({
          ...s,
          step_sequence: idx + 1,
          execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : "PARALLEL",
          }))
      };
      
      if (pin) payload.auth_pin = pin;
      if (reason) payload.eco_reason = reason;

      const res = await apiFetch(
        "/api/production/bop/sync",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        user?.username
      );

      if (res.ok && res.data?.success) {
        showToast("Bill of Process saved and synchronized to Shop Floor!", "success");
        setHasUnsavedChanges(false);
        try {
          localStorage.setItem(`bop_draft_${projectId}`, JSON.stringify(steps));
        } catch (e) {}
        if (onRefreshProject) onRefreshProject();
        return true;
      } else {
        if (res.data?.require_eco || res.data?.error?.includes("ECO") || res.error?.includes("ECO") || res.data?.error?.includes("PIN") || res.error?.includes("PIN")) {
          setShowEcoModal(true);
        }
        showToast(res.data?.error || res.error || "Failed to save Bill of Process", "error");
        return false;
      }
    } catch (err: any) {
      console.error("Save BoP error:", err);
      if (err.message && (err.message.includes("ECO") || err.message.includes("PIN"))) {
        setShowEcoModal(true);
      }
      showToast(err.message || "Error communicating with server", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSaveDraft = () => {
    handleSyncBoP(undefined, undefined, true);
  };

  const handlePublishVersion = async () => {
    // Validate stations before publishing
    if (stations.length < 1) {
      showToast("Validation Failed: At least 1 workstation must be registered (>= 1) before publishing.", "error");
      setShowStationModal(true);
      return;
    }
    const missingStations = steps.filter(
      (s) => (s.node_type || "PROCESS") === "PROCESS" && (!s.station_id || !stations.some((st) => st.id === s.station_id))
    );
    if (missingStations.length > 0) {
      showToast(
        language === "id"
          ? "Semua Process / Operation Node BOP harus memiliki Assigned Station sebelum dipublish."
          : "All Process nodes must be assigned to an active workstation before publishing.",
        "error"
      );
      return;
    }

    // Save draft first
    const saved = await handleSyncBoP(undefined, undefined, true);
    if (!saved) return;
    
    const versionNumber = prompt("Enter version number (e.g., v1.0, v1.1):", "v1.0");
    if (!versionNumber) return;

    try {
      setIsSaving(true);
      const res = await apiFetch(`/api/production/bop/publish-version`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          version_number: versionNumber,
        })
      }, user?.username);

      if (res.ok) {
        showToast(res.data.message || `Version ${versionNumber} published`, "success");
        if (onRefreshProject) onRefreshProject();
      } else {
        showToast(res.data?.error || res.error || "Failed to publish version", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error publishing version", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAuthorizeBoP = async (pin: string) => {
    setIsAuthorizing(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/bop/authorize`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }, user?.username);
      if (res.ok && res.data?.success) {
        setShowAuthModal(false);
        showToast("Bill of Process has been authorized for production.", "success");
        if (onRefreshProject) onRefreshProject();
      } else {
        showToast(res.data?.error || res.error || "Failed to authorize BOP", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing BOP", "error");
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Export BoP JSON
  const handleReviseBoP = async () => {
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/bop/revise`, {
        method: "POST",
        body: JSON.stringify({ note: reviseReason }),
      }, user?.username);
      if (res.ok && res.data?.success) {
        setShowReviseBopModal(false);
        setReviseReason("");
        showToast("Bill of Process marked for revision.", "success");
        if (onRefreshProject) onRefreshProject();
      } else {
        showToast(res.data?.error || res.error || "Failed to mark BOP for revision", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error requesting BOP revision", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJson = () => {
    try {
      const dataStr = JSON.stringify(
        {
          project_spk: project?.spk_number || project?.id,
          project_name: project?.name,
          exported_at: new Date().toISOString(),
          steps: steps.map((s) => ({
            id: s.id,
            step_sequence: s.step_sequence,
            process_name: s.process_name,
            node_type: s.node_type || "PROCESS",
            work_center_id: s.work_center_id || "",
            work_center_name: s.work_center_name || "",
            execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : (s.execution_type || "PARALLEL"),
            shift_mode: s.shift_mode || 1,
            manpower_allocated: s.manpower_allocated || 1,
            standard_hours: s.standard_hours || 0,
            cycle_time_minutes: s.cycle_time_minutes || 0,
            predecessor_ids: s.predecessor_ids || [],
            sop_instruction: s.sop_instruction || "",
            qc_criteria: s.qc_criteria || "",
            notes: s.notes || "",
            expected_yield_rate: s.expected_yield_rate ?? 100,
            station_id: s.station_id || "",
            bom_allocations: s.bom_allocations || [],
            lifecycle_status: s.lifecycle_status || "Planned",
            status: s.status || "PENDING",
            progress: s.progress || 0
          }))
        },
        null,
        2
      );

      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BOP_Flowchart_${project?.spk_number || project?.id || "export"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(
        language === "id"
          ? "Flowchart BoP berhasil diekspor sebagai berkas JSON"
          : "BoP Flowchart successfully exported as a JSON file",
        "success"
      );
    } catch (err) {
      console.error(err);
      showToast(
        language === "id"
          ? "Gagal mengekspor berkas JSON"
          : "Failed to export JSON",
        "error"
      );
    }
  };

  // Import BoP JSON
  const handleImportJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetFile) {
      showToast(
        language === "id"
          ? "Silakan pilih berkas JSON untuk diimpor"
          : "Please select a JSON file to import",
        "error"
      );
      return;
    }

    setIsSaving(true);
    try {
      const text = await presetFile.text();
      const data = JSON.parse(text);

      let rawSteps: any[] = [];
      if (Array.isArray(data)) {
        rawSteps = data;
      } else if (Array.isArray(data.steps)) {
        rawSteps = data.steps;
      } else if (Array.isArray(data.bill_of_processes)) {
        rawSteps = data.bill_of_processes;
      } else if (Array.isArray(data.bop_steps)) {
        rawSteps = data.bop_steps;
      } else if (Array.isArray(data.nodes)) {
        rawSteps = data.nodes;
      }

      if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
        showToast(
          language === "id"
            ? "Format berkas JSON tidak valid atau tidak memiliki daftar alur proses."
            : "Invalid JSON format or empty process steps list.",
          "error"
        );
        setIsSaving(false);
        return;
      }

      const idMap = new Map<string, string>();
      const nowMs = Date.now();
      rawSteps.forEach((s: any, idx: number) => {
        const origId = s.id ? String(s.id).trim() : "";
        const targetId = origId.length > 0 ? origId : `step_${nowMs}_${idx}`;
        if (origId) {
          idMap.set(origId, targetId);
        }
      });

      const loadedSteps: BoPStepRow[] = rawSteps.map((s: any, idx: number) => {
        const origId = s.id ? String(s.id).trim() : "";
        const newId = origId.length > 0 ? (idMap.get(origId) || origId) : `step_${nowMs}_${idx}`;

        let predList: string[] = [];
        if (Array.isArray(s.predecessor_ids)) {
          predList = s.predecessor_ids.map((pid: any) => idMap.get(String(pid)) || String(pid));
        } else if (typeof s.predecessor_ids === "string") {
          try {
            const parsed = JSON.parse(s.predecessor_ids);
            if (Array.isArray(parsed)) {
              predList = parsed.map((pid: any) => idMap.get(String(pid)) || String(pid));
            }
          } catch (e) {}
        }

        let bomAllocs: any[] = [];
        if (Array.isArray(s.bom_allocations)) {
          bomAllocs = s.bom_allocations;
        } else if (typeof s.bom_allocations === "string") {
          try {
            bomAllocs = JSON.parse(s.bom_allocations);
          } catch (e) {}
        }

        return {
          id: newId,
          step_sequence: Number(s.step_sequence) || idx + 1,
          process_name: s.process_name || `Step ${idx + 1}`,
          node_type: s.node_type || "PROCESS",
          work_center_id: s.work_center_id || "",
          work_center_name: s.work_center_name || "",
          execution_type: (predList.length > 0) ? "SERIAL" : (s.execution_type || "PARALLEL"),
          shift_mode: Number(s.shift_mode) || 1,
          manpower_allocated: Number(s.manpower_allocated) || 1,
          standard_hours: Number(s.standard_hours) || 0,
          cycle_time_minutes: Number(s.cycle_time_minutes) || 0,
          predecessor_ids: predList,
          sop_instruction: s.sop_instruction || s.notes || "",
          qc_criteria: s.qc_criteria || "",
          notes: s.notes || "",
          expected_yield_rate: s.expected_yield_rate ?? 100,
          station_id: s.station_id || "",
          bom_allocations: bomAllocs,
          lifecycle_status: s.lifecycle_status || "Planned",
          status: s.status || "PENDING",
          progress: Number(s.progress) || 0
        };
      });

      setSteps(loadedSteps);
      updateSelection(loadedSteps[0]?.id || null ? [loadedSteps[0]?.id || null] : []);
      setShowLoadPresetModal(false);
      setPresetFile(null);
      setPresetFileName("");

      // Write to localStorage draft immediately
      try {
        localStorage.setItem(`bop_draft_${projectId}`, JSON.stringify(loadedSteps));
        localStorage.setItem(`bop_unsaved_${projectId}`, "true");
      } catch (e) {}

      // Automatically sync draft to backend database (SQLite + Firestore) immediately
      try {
        const payload: any = {
          is_draft: true,
          project_id: projectId,
          steps: loadedSteps.map((s, idx) => ({
            ...s,
            step_sequence: idx + 1,
            execution_type: (s.predecessor_ids && s.predecessor_ids.length > 0) ? "SERIAL" : "PARALLEL",
          }))
        };

        const res = await apiFetch(
          "/api/production/bop/sync",
          {
            method: "POST",
            body: JSON.stringify(payload)
          },
          user?.username
        );

        if (res.ok && res.data?.success) {
          setHasUnsavedChanges(false);
          try {
            localStorage.setItem(`bop_unsaved_${projectId}`, "false");
          } catch (e) {}
          showToast(
            language === "id"
              ? "Flowchart BoP berhasil diimpor dan disimpan ke database!"
              : "BoP Flowchart successfully imported and saved to database!",
            "success"
          );
          if (onRefreshProject) onRefreshProject();
        } else {
          setHasUnsavedChanges(true);
          showToast(
            language === "id"
              ? "Flowchart BoP diimpor ke draf. Klik SAVE DRAFT untuk konfirmasi."
              : "BoP Flowchart imported to draft. Click SAVE DRAFT to confirm.",
            "info"
          );
        }
      } catch (syncErr) {
        console.warn("Auto-sync imported BOP draft warning:", syncErr);
        setHasUnsavedChanges(true);
        showToast(
          language === "id"
            ? "Flowchart BoP diimpor secara lokal. Klik SAVE DRAFT untuk menyimpan."
            : "BoP Flowchart imported locally. Click SAVE DRAFT to save.",
          "info"
        );
      }
    } catch (err) {
      console.error("Error processing JSON import:", err);
      showToast(
        language === "id"
          ? "Gagal memproses berkas JSON"
          : "Failed to process JSON file",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Currently Selected Step
  
  const selectedSteps = useMemo(() => {
    return steps.filter((s) => selectedStepIds.includes(s.id));
  }, [steps, selectedStepIds]);
  
  const selectedStep = selectedSteps.length === 1 ? selectedSteps[0] : null;


  // Overall Statistics
  const qcCheckpointsCount = useMemo(() => {
    return steps.filter((s) => s.qc_criteria && s.qc_criteria.trim()).length;
  }, [steps]);

  const parallelCount = useMemo(() => {
    return steps.filter((s) => !s.predecessor_ids || s.predecessor_ids.length === 0).length;
  }, [steps]);

  const serialCount = useMemo(() => {
    return steps.filter((s) => s.predecessor_ids && s.predecessor_ids.length > 0).length;
  }, [steps]);

  // BOM Material Absorption Summary on BOP
  const bopAbsorptionSummary = useMemo(() => {
    if (!projectBoms || projectBoms.length === 0) {
      return {
        totalValid: 0,
        fullyAssignedCount: 0,
        unassignedCount: 0,
        partiallyAssignedCount: 0,
        hasUnassigned: false,
        absorptionRate: 100,
        unabsorbedItems: [] as any[],
      };
    }

    const allocatedMap = new Map<string, number>();
    projectBoms.forEach((b) => allocatedMap.set(b.id, 0));

    steps.forEach((s) => {
      if (s.node_type === "PRODUCT" && s.bom_allocations) {
        let allocs: any[] = [];
        try {
          allocs =
            typeof s.bom_allocations === "string"
              ? JSON.parse(s.bom_allocations)
              : s.bom_allocations || [];
        } catch (e) {
          allocs = [];
        }
        allocs.forEach((a: any) => {
          const bomRef = projectBoms.find(b => b.id === a.bom_id);
          const totalBomQty = Number((bomRef?.required_qty || bomRef?.qty) || 0);
          const frac = a.qty !== undefined && totalBomQty > 0 ? Number(a.qty) / totalBomQty : Number(a.fraction || 0);
          const curr = allocatedMap.get(a.bom_id) || 0;
          allocatedMap.set(a.bom_id, curr + frac);
        });
      }
    });

    let fully = 0;
    let partial = 0;
    let unassigned = 0;
    const unabsorbedItems: any[] = [];

    projectBoms.forEach((b) => {
      const totalAlloc = allocatedMap.get(b.id) || 0;
      if (totalAlloc >= 0.99) {
        fully++;
      } else if (totalAlloc > 0) {
        partial++;
        unassigned++;
        unabsorbedItems.push({ ...b, allocatedFraction: totalAlloc, status: "PARTIAL" });
      } else {
        unassigned++;
        unabsorbedItems.push({ ...b, allocatedFraction: 0, status: "UNASSIGNED" });
      }
    });

    const absorptionRate = Math.round((fully / projectBoms.length) * 100);

    return {
      totalValid: projectBoms.length,
      fullyAssignedCount: fully,
      partiallyAssignedCount: partial,
      unassignedCount: unassigned,
      hasUnassigned: unassigned > 0,
      absorptionRate,
      unabsorbedItems,
    };
  }, [projectBoms, steps]);

  // Station requirement (>= 1) and Process assignment validations
  const hasNoStations = stations.length === 0;
  const processSteps = useMemo(() => steps.filter((s) => (s.node_type || "PROCESS") === "PROCESS"), [steps]);
  const unassignedProcessSteps = useMemo(() => {
    return processSteps.filter(
      (s) => !s.station_id || !stations.some((st) => st.id === s.station_id)
    );
  }, [processSteps, stations]);
  const hasUnassignedProcesses = unassignedProcessSteps.length > 0;
  const isSubmitBopBlocked = !isBomAuthorized || hasNoStations || hasUnassignedProcesses || processSteps.length === 0;

  return (
    <div className={cn("transition-all", isFullscreen ? "fixed inset-0 z-[9999] bg-stone-50 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6" : "space-y-6")}>
      {/* KPI & Flow Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
            Total Operation Steps
          </span>
          <div className="text-xl font-black text-stone-900 font-mono flex items-center gap-2">
            <Layers className="w-5 h-5 text-stone-400" />
            <span>{steps.length} Nodes</span>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
            Parallel Processes (Independent)
          </span>
          <div className="text-xl font-black text-emerald-700 font-mono flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-500" />
            <span>{parallelCount} Nodes</span>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
            Serial Processes (Dependent)
          </span>
          <div className="text-xl font-black text-blue-700 font-mono flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-blue-500" />
            <span>{serialCount} Nodes</span>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
            Active QC Checkpoints
          </span>
          <div className="text-xl font-black text-stone-900 font-mono flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span>{qcCheckpointsCount} Checkpoint{qcCheckpointsCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      {effectiveProject?.bop_status === "REVISION" && effectiveProject?.bop_revision_note && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700">
          <div className="font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Revision Note:</div>
          <div className="italic font-medium">"{effectiveProject.bop_revision_note}"</div>
        </div>
      )}

      {hasNoStations && (
        <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950 shadow-3xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-900 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-4 h-4 text-amber-700 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-xs text-stone-900">
                  Workstation Prerequisite: No Work Station Registered
                </span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                  {"0 Stations (>= 1 Required)"}
                </span>
              </div>
              <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                At least 1 workstation must be registered in the project before submitting BOP for approval. Create your manufacturing workstations first.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowStationModal(true)}
            className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold tracking-tight transition-all shadow-3xs flex items-center gap-1.5 shrink-0 self-end sm:self-center cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Manage Stations</span>
          </button>
        </div>
      )}

      {!hasNoStations && hasUnassignedProcesses && (
        <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-amber-950 shadow-3xs">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-900 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-extrabold text-xs text-stone-900">
                  Process Assignment Warning: {unassignedProcessSteps.length} Process(es) Not Assigned to Any Station
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400">
                  {unassignedProcessSteps.length} Unassigned
                </span>
              </div>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                All manufacturing processes must be assigned to an active workstation before submitting BOP for approval. Click any unassigned process below to configure its station in the properties inspector.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-stone-500">Unassigned processes:</span>
                {unassignedProcessSteps.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => updateSelection([step.id])}
                    className="bg-white/90 hover:bg-amber-100 border border-amber-300 hover:border-amber-400 px-2 py-0.5 rounded text-[10px] font-semibold text-stone-800 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>Step {step.step_sequence}: {step.process_name || "Untitled"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isBomAuthorized && (
        <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950 shadow-3xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-900 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-xs text-stone-900">
                  {language === "id"
                    ? "Prasyarat Otorisasi: BOM / BOQ Belum Ter-otorisasi"
                    : "Prerequisite: BOM / BOQ Not Authorized Yet"}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                  Status BOM: {bomStatus}
                </span>
              </div>
              <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                {language === "id"
                  ? "Anda dapat merancang alur proses dan menyimpan sebagai Draft (SAVE DRAFT). Namun pengajuan persetujuan (SUBMIT APPROVAL) terkunci sampai Bill of Materials (BOM/BOQ) disetujui & diotorisasi."
                  : "You can design and SAVE DRAFT. However, submitting for approval (SUBMIT APPROVAL) is locked until the Bill of Materials (BOM) is authorized."}
              </p>
            </div>
          </div>
          <Link
            to={`/engineering?projectId=${projectId}`}
            className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold tracking-tight transition-all shadow-3xs flex items-center gap-1.5 shrink-0 self-end sm:self-center"
          >
            <span>{language === "id" ? "Buka BOQ / BOM" : "Open BOQ / BOM"}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {bopAbsorptionSummary.hasUnassigned && (
        <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-amber-950 shadow-3xs">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-900 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-extrabold text-xs text-stone-900">
                  {language === "id"
                    ? `Peringatan Penyerapan Material BOP: ${bopAbsorptionSummary.unassignedCount} dari ${bopAbsorptionSummary.totalValid} Material BOM Belum Terserap Penuh`
                    : `BOP Material Absorption Warning: ${bopAbsorptionSummary.unassignedCount} of ${bopAbsorptionSummary.totalValid} BOM Materials Not Fully Absorbed`}
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400">
                  {bopAbsorptionSummary.absorptionRate}% Absorbed
                </span>
              </div>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                {language === "id"
                  ? "Terdapat komponen material BOM yang belum atau baru terserap sebagian pada Node Produk di Alur Proses (BOP). Alokasikan seluruh material BOM pada Node Produk (100% terserap) agar penyerapan material sempurna."
                  : "Some BOM material components are unassigned or only partially absorbed in BOP Product Nodes. Allocate all BOM materials to Product Nodes (100% absorbed) for complete material tracking."}
              </p>
              {bopAbsorptionSummary.unabsorbedItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-stone-500">
                    {language === "id" ? "Material belum terserap:" : "Unabsorbed materials:"}
                  </span>
                  {bopAbsorptionSummary.unabsorbedItems.map((item) => (
                    <span
                      key={item.id}
                      className="bg-white/90 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-semibold text-stone-800"
                    >
                      {item.item_code || item.item_name} ({Math.round((item.allocatedFraction || 0) * 100)}%)
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode View Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("FLOWCHART")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                viewMode === "FLOWCHART"
                  ? "bg-stone-100 text-stone-900 border border-stone-300 shadow-xs"
                  : "bg-white text-stone-600 hover:text-stone-900 border border-stone-200"
              )}
            >
              <Workflow className={cn("w-4 h-4", viewMode === "FLOWCHART" ? "text-stone-800" : "text-stone-500")} />
              <span>Flowchart Canvas View</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("MATRIX")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                viewMode === "MATRIX"
                  ? "bg-stone-100 text-stone-900 border border-stone-300 shadow-xs"
                  : "bg-white text-stone-600 hover:text-stone-900 border border-stone-200"
              )}
            >
              <LayoutGrid className={cn("w-4 h-4", viewMode === "MATRIX" ? "text-stone-800" : "text-stone-500")} />
              <span>Process Matrix Table</span>
            </button>
          </div>

          {hasUnsavedChanges && (
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
              Unsaved Changes
            </span>
          )}
        </div>

        {/* Proportional, Icon-Only Action Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {/* Merged Add Node Dropdown Button */}
          <div className="relative" ref={addRootDropdownRef}>
            <button
              type="button"
              onClick={() => setShowAddRootDropdown((prev) => !prev)}
              className="h-9 px-3 flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 hover:text-stone-900 transition-all shrink-0 cursor-pointer shadow-xs text-xs font-bold gap-1.5"
              title="Add Node (Process or Product)"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Add Node</span>
              <ChevronDown className={cn("w-3.5 h-3.5 text-stone-400 transition-transform", showAddRootDropdown && "rotate-180")} />
            </button>

            {showAddRootDropdown && (
              <div className="absolute top-full left-0 mt-1.5 w-44 bg-white border border-stone-200 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 text-left">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddRootDropdown(false);
                    handleAddNewRootNode("PROCESS");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-stone-800 hover:bg-blue-50 hover:text-blue-900 rounded-xl transition-colors text-left"
                >
                  <Workflow className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Process</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddRootDropdown(false);
                    handleAddNewRootNode("PRODUCT");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-stone-800 hover:bg-amber-50 hover:text-amber-950 rounded-xl transition-colors text-left mt-0.5"
                >
                  <Package className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Product</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              const { nodes: newNodes, edges: newEdges } = calculateAutoLayout(steps);
              setNodes(newNodes);
              setEdges(newEdges);
              showToast("Flowchart layout auto-arranged successfully!", "info");
            }}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Auto Tidy / Re-arrange Layout"
          >
            <Network className="w-4 h-4 text-stone-600" />
          </button>

          <button
            type="button"
            onClick={() => setShowSimulationModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Simulation Run"
          >
            <PlayCircle className="w-4 h-4 text-blue-600" />
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Export JSON File"
          >
            <Download className="w-4 h-4 text-stone-600" />
          </button>

          <button
            type="button"
            onClick={() => setShowLoadPresetModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Import JSON File"
          >
            <Upload className="w-4 h-4 text-stone-600" />
          </button>
          <div className="w-px h-6 bg-stone-200 mx-1"></div>
          <button
            type="button"
            onClick={() => setIsFullscreen(prev => !prev)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all shrink-0 cursor-pointer shadow-xs"
            title="Toggle Zen Mode (Fullscreen)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4 text-stone-600" /> : <Maximize className="w-4 h-4 text-stone-600" />}
          </button>

          <div className="flex items-center gap-2 pl-3 border-l border-stone-200">
            <button
              type="button"
              onClick={() => setShowStationModal(true)}
              className={cn(
                "h-9 px-3.5 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer border",
                hasNoStations
                  ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                  : "bg-white hover:bg-stone-50 text-stone-700 border-stone-300"
              )}
              title={hasNoStations ? "No workstations registered (>= 1 required). Click to manage stations." : "Manage Master Stations"}
            >
              <Layers className={cn("w-4 h-4", hasNoStations ? "text-amber-600 animate-pulse" : "text-emerald-600")} />
              <span>STATIONS</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono font-black",
                  hasNoStations ? "bg-amber-200 text-amber-900 border border-amber-300" : "bg-stone-100 text-stone-600"
                )}
              >
                {stations.length}{hasNoStations ? " (Req)" : ""}
              </span>
            </button>
            <button
              type="button"
              onClick={handleManualSaveDraft}
              disabled={!isEngineering || isSaving}
              className="w-9 h-9 p-0 bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 rounded-xl flex items-center justify-center transition-all shadow-xs disabled:opacity-50 active:scale-95 cursor-pointer"
              title="Save draft without submitting for authorization"
            >
              <Save className="w-4 h-4 text-amber-600" />
            </button>
            <button
              type="button"
              onClick={handlePublishVersion}
              disabled={!isEngineering || isSaving}
              className="w-9 h-9 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center transition-all shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
              title="Publish a snapshot version for production"
            >
              <Share2 className="w-4 h-4 text-blue-100" />
            </button>
            
            {(() => {
              const rawStatus = (effectiveProject?.bop_status || "DRAFT").toUpperCase();
              const isPending = rawStatus === "PENDING" || rawStatus === "SUBMITTED" || rawStatus === "PENDING_APPROVAL" || rawStatus === "IN_REVIEW";
              const isAuthorized = rawStatus === "AUTHORIZED" || rawStatus === "APPROVED";

              if (isPending) {
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isBomAuthorized) {
                          showToast(
                            language === "id"
                              ? `Otorisasi BOP ditolak: Bill of Materials (BOM/BOQ) proyek ini belum ter-otorisasi (Status BOM saat ini: ${bomStatus}). Otorisasi BOM terlebih dahulu.`
                              : `BOP Authorization blocked: Bill of Materials (BOM) is not authorized yet (Current BOM Status: ${bomStatus}).`,
                            "error"
                          );
                          return;
                        }
                        if (hasNoStations) {
                          showToast("Cannot authorize BOP: At least 1 workstation must be registered (>= 1).", "error");
                          setShowStationModal(true);
                          return;
                        }
                        if (hasUnassignedProcesses) {
                          showToast(`Cannot authorize BOP: All processes must be assigned to a station. Found ${unassignedProcessSteps.length} unassigned process(es).`, "error");
                          return;
                        }
                        setShowAuthModal(true);
                      }}
                      disabled={isSaving || !isBomAuthorized || isSubmitBopBlocked}
                      className={cn(
                        "h-9 px-4 rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95 cursor-pointer",
                        !isBomAuthorized || isSubmitBopBlocked
                          ? "bg-stone-300 text-stone-500 cursor-not-allowed opacity-75"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      )}
                      title={
                        !isBomAuthorized
                          ? `Authorize BOM first (Current status: ${bomStatus})`
                          : hasNoStations
                          ? "At least 1 workstation is required (0 registered)"
                          : hasUnassignedProcesses
                          ? `${unassignedProcessSteps.length} process(es) not assigned to any station`
                          : "Authorize Bill of Process"
                      }
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-100" />
                      <span>AUTHORIZE BOP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReviseBopModal(true)}
                      disabled={isSaving || !isEngineering}
                      className="h-9 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>REVISION REQUEST</span>
                    </button>
                  </>
                );
              }

              if (isAuthorized) {
                return (
                  <button
                    type="button"
                    onClick={() => setShowEcoModal(true)}
                    disabled={isSaving || !isEngineering}
                    className="h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <Wrench className="w-4 h-4 text-amber-100" />
                    <span>ECO REVISION</span>
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (!isBomAuthorized) {
                      showToast(
                        language === "id"
                          ? `BOM belum terotorisasi (Status BOM saat ini: ${bomStatus}). Anda dapat menggunakan tombol "SAVE DRAFT" untuk menyimpan alur proses. Pengajuan persetujuan (Submit Approval) memerlukan BOM yang telah terotorisasi.`
                          : `BOM is not authorized yet (Current status: ${bomStatus}). You can use "SAVE DRAFT" to save your routing. Submit Approval requires an authorized BOM.`,
                        "info"
                      );
                      return;
                    }

                    if (hasNoStations) {
                      showToast("Cannot submit BOP for approval: At least 1 workstation must be registered (>= 1). Register a workstation first.", "error");
                      setShowStationModal(true);
                      return;
                    }

                    if (processSteps.length === 0) {
                      showToast("Cannot submit BOP for approval: At least 1 manufacturing process is required before submitting.", "error");
                      return;
                    }

                    if (hasUnassignedProcesses) {
                      showToast(`Cannot submit BOP for approval: All processes must be assigned to a station. Found ${unassignedProcessSteps.length} unassigned process(es).`, "error");
                      if (unassignedProcessSteps[0]?.id) {
                        updateSelection([unassignedProcessSteps[0].id]);
                      }
                      return;
                    }

                    setShowConfirmSubmitBopModal(true);
                  }}
                  disabled={isSaving || !isEngineering || isSubmitBopBlocked}
                  className={cn(
                    "w-9 h-9 p-0 rounded-xl flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer",
                    isSubmitBopBlocked
                      ? "bg-stone-200 hover:bg-stone-300 text-stone-500 border border-stone-300 cursor-not-allowed opacity-80"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  )}
                  title={
                    !isBomAuthorized
                      ? `BOM is not authorized yet (${bomStatus}). Authorize BOM first before submitting BOP.`
                      : hasNoStations
                      ? "At least 1 workstation is required (0 registered). Register a station first."
                      : hasUnassignedProcesses
                      ? `${unassignedProcessSteps.length} process(es) not assigned to any station. All processes must be assigned before submitting.`
                      : processSteps.length === 0
                      ? "At least 1 manufacturing process is required before submitting."
                      : "Submit BoP document for manager authorization"
                  }
                >
                  {isSaving ? (
                    <Clock className="w-4 h-4 animate-spin text-stone-400" />
                  ) : (
                    <Send className={cn("w-4 h-4", !isSubmitBopBlocked ? "text-blue-100" : "text-stone-400")} />
                  )}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE REACT FLOW FLOWCHART CANVAS */}
      {viewMode === "FLOWCHART" && (
        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Flowchart Canvas (8 cols) */}
          <div className={cn(isFullscreen ? "lg:col-span-9" : "lg:col-span-8", "bg-stone-100/60 rounded-3xl border border-stone-200 overflow-hidden shadow-inner relative transition-all duration-300", isFullscreen ? "h-[calc(100vh-220px)]" : "h-[680px]")}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgeClick={onEdgeClick}
              onNodesDelete={(deletedNodes) => {
                const ids = deletedNodes.map(n => n.id);
                handleDeleteSteps(ids);
              }}
              onEdgesDelete={(deletedEdges) => {
                deletedEdges.forEach(edge => {
                  const { source, target } = edge;
                  setSteps(prev => prev.map(s => {
                    if (s.id === target) {
                      const remainingPreds = (s.predecessor_ids || []).filter(id => id !== source);
                      return {
                        ...s,
                        predecessor_ids: remainingPreds,
                        execution_type: remainingPreds.length > 0 ? "SERIAL" : "PARALLEL"
                      };
                    }
                    return s;
                  }));
                });
                setHasUnsavedChanges(true);
              }}
              onSelectionChange={handleSelectionChange}
              nodeTypes={nodeTypes}
              selectionOnDrag={true}
              panOnDrag={[1, 2]}
              panOnScroll={true}
              selectionMode={"partial" as any}
              multiSelectionKeyCode="Shift"
              selectionKeyCode="Shift"
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              defaultEdgeOptions={{
                type: "smoothstep",
                animated: true,
                style: { stroke: "#1c1917", strokeWidth: 2.5 }
              }}
            >
              <StationGroupOverlays stations={stations} bopSteps={steps} />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#d6d3d1" />
              <Controls className="!bg-white !border-stone-200 !rounded-2xl !shadow-md" />
              <MiniMap
                className="!bg-white !border-stone-200 !rounded-2xl !shadow-md overflow-hidden"
                nodeColor={(n) => {
                  const d = n.data as any;
                  if (d?.incomingCount === 0) return "#10b981"; // Emerald for parallel
                  if (d?.incomingCount > 1) return "#a855f7"; // Purple for join
                  return "#3b82f6"; // Blue for serial
                }}
              />

              {/* Instructions Panel */}
              <Panel position="top-left" className="pointer-events-auto">
                {showInstructions ? (
                  <div className="bg-white/95 backdrop-blur-xs p-4 rounded-2xl border border-stone-200 shadow-lg text-xs space-y-2 max-w-xs relative transition-all duration-200">
                    <button
                      type="button"
                      onClick={() => setShowInstructions(false)}
                      className="absolute top-3 right-3 text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                      title="Hide Help Guide"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="font-bold text-stone-900 flex items-center gap-1.5 pr-6">
                      <HelpCircle className="w-4 h-4 text-amber-500" />
                      <span>How to Build the Flowchart</span>
                    </div>
                    <div className="text-[11px] text-stone-600 leading-relaxed space-y-1">
                      <p>• <strong>Connect nodes</strong> to define serial dependencies.</p>
                      <p>• <strong>Click connection lines</strong> to delete/remove a dependency.</p>
                      <p>• <strong>Click any Node</strong> to configure processes, work centers, and notes.</p>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowInstructions(true)}
                    className="bg-white hover:bg-stone-50 border border-stone-200 p-2.5 rounded-xl shadow-sm text-stone-700 hover:text-stone-900 flex items-center justify-center transition-all cursor-pointer"
                    title="Show Guide"
                  >
                    <HelpCircle className="w-4.5 h-4.5 text-amber-500" />
                  </button>
                )}
              </Panel>
            </ReactFlow>
          </div>

          {/* Side Node Inspector (4 cols) */}
          <div className={cn(isFullscreen ? "lg:col-span-3" : "lg:col-span-4", "bg-white rounded-3xl border border-stone-200 p-6 shadow-xs overflow-y-auto space-y-5 transition-all duration-300", isFullscreen ? "h-[calc(100vh-220px)]" : "h-[680px]")}>
            
            {selectedSteps.length > 1 ? (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-mono font-bold text-xs">
                      {selectedSteps.length}
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-stone-900">Bulk Node Inspector</h4>
                      <span className="text-[10px] text-stone-400 font-mono">Multiple Nodes Selected</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteSteps(selectedSteps.map(s => s.id))}
                    className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete selected nodes"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-xs text-purple-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Workflow className="w-4 h-4 text-purple-600" />
                    <span>Bulk Operations Active</span>
                  </div>
                  <p className="text-[11px] leading-tight text-purple-800">
                    Changes made here will apply to all {selectedSteps.length} selected nodes simultaneously.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                      Select Station
                    </label>
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkUpdateStep(selectedSteps.map(s => s.id), "station_id", e.target.value);
                          showToast(`Updated Station for ${selectedSteps.length} nodes`, "success");
                        }
                      }}
                      className="w-full text-xs"
                    >
                      <option value="" disabled>-- Select Station --</option>
                      {stations.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.station_code} - {st.station_name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                      Bulk Select Machine Asset
                    </label>
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          const mId = e.target.value;
                          const selM = machines.find(m => m.id === mId);
                          const procSteps = selectedSteps.filter(s => (s.node_type || "PROCESS") === "PROCESS");
                          handleBulkUpdateStep(procSteps.map(s => s.id), "assigned_machine_id", mId);
                          if (selM && selM.capacity_per_hour > 0) {
                            const calcCt = Number((60 / selM.capacity_per_hour).toFixed(2));
                            handleBulkUpdateStep(procSteps.map(s => s.id), "cycle_time_minutes", calcCt);
                          }
                          showToast(`Assigned ${selM?.name || "Machine"} to ${procSteps.length} process nodes`, "success");
                        }
                      }}
                      className="w-full text-xs"
                    >
                      <option value="" disabled>-- Select Machine Asset --</option>
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          [{m.item_code}] {m.name} ({m.machine_category || "General"})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                      Alokasi Material
                    </label>
                    <Select
                      value=""
                      onChange={(e) => {
                        const bomId = e.target.value;
                        if (bomId) {
                          const bom = projectBoms.find(b => b.id === bomId);
                          if (!bom) return;
                          
                          const targetSteps = selectedSteps.filter(s => s.node_type === "PRODUCT");
                          if (targetSteps.length === 0) {
                            showToast("Pilih setidaknya 1 node Product untuk alokasi material.", "error");
                            return;
                          }

                          const totalBomQty = Number((bom.required_qty || bom.qty) || 0);
                          const uom = bom.uom || 'qty';
                          let totalUsedQty = 0;
                          
                          steps.forEach(s => {
                            if (s.node_type === 'PRODUCT' && s.bom_allocations) {
                              let allocs: any[] = [];
                              try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations || []; } catch(err){}
                              const a = allocs.find((x: any) => x.bom_id === bomId);
                              if (a && !selectedSteps.find(ss => ss.id === s.id)) {
                                const q = a.qty !== undefined ? Number(a.qty) : Number(a.fraction || 0) * totalBomQty;
                                totalUsedQty += q;
                              }
                            }
                          });
                          
                          const remainingQty = Math.max(0, totalBomQty - totalUsedQty);
                          const qtyPerStep = remainingQty / targetSteps.length;
                          const fractionPerStep = totalBomQty > 0 ? qtyPerStep / totalBomQty : 1.0;
                          
                          setSteps(prev => prev.map(s => {
                            if (!targetSteps.find(ts => ts.id === s.id)) return s;
                            let allocs: any[] = [];
                            try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations || []; } catch(err){}
                            const existing = allocs.find((a: any) => a.bom_id === bomId);
                            if (!existing) {
                               allocs.push({
                                 bom_id: bomId,
                                 qty: qtyPerStep,
                                 fraction: fractionPerStep,
                                 bom_name: bom.item_name,
                                 uom: uom
                               });
                            } else {
                               existing.qty = qtyPerStep;
                               existing.fraction = fractionPerStep;
                            }
                            return { ...s, bom_allocations: allocs };
                          }));
                          showToast(`Dialokasikan ${bom.item_name} ke ${targetSteps.length} node`, "success");
                        }
                      }}
                      className="w-full text-xs"
                    >
                      <option value="" disabled>-- Pilih Material dari BOM --</option>
                      {projectBoms.map(bom => {
                        const totalBomQty = Number((bom.required_qty || bom.qty) || 0);
                        const uom = bom.uom || 'qty';
                        let totalUsedQty = 0;
                        steps.forEach(s => {
                          if (s.node_type === 'PRODUCT' && s.bom_allocations) {
                            let allocs: any[] = [];
                            try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations || []; } catch(e){}
                            const a = allocs.find((x: any) => x.bom_id === bom.id);
                            if (a) {
                              const q = a.qty !== undefined ? Number(a.qty) : Number(a.fraction || 0) * totalBomQty;
                              totalUsedQty += q;
                            }
                          }
                        });
                        const remainingQty = Math.max(0, totalBomQty - totalUsedQty);
                        const isFullyAllocated = totalBomQty > 0 ? remainingQty <= 0.001 : false;
                        return (
                          <option key={bom.id} value={bom.id} disabled={isFullyAllocated}>
                            {bom.item_name} ({bom.item_code}) - {!isFullyAllocated ? `Sisa: ${remainingQty % 1 === 0 ? remainingQty : remainingQty.toFixed(2)} / ${totalBomQty} ${uom}` : `Ter-alokasi`}
                          </option>
                        );
                      })}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                      Bulk Set Card Type
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-2xl border border-stone-200">
                      <button
                        type="button"
                        onClick={() => handleBulkUpdateStep(selectedSteps.map(s => s.id), "node_type", "PROCESS")}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-stone-500 hover:text-stone-900 hover:bg-white border border-transparent hover:border-stone-200"
                      >
                        <Workflow className="w-3.5 h-3.5 text-blue-600" />
                        <span>Process</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkUpdateStep(selectedSteps.map(s => s.id), "node_type", "PRODUCT")}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-amber-800 hover:text-amber-950 hover:bg-amber-100 border border-transparent"
                      >
                        <Package className="w-3.5 h-3.5 text-amber-600" />
                        <span>Product</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedStep ? (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-stone-200 text-stone-800 flex items-center justify-center font-mono font-bold text-xs">
                      {String(selectedStep.step_sequence).padStart(2, "0")}
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-stone-900">Node Inspector</h4>
                      <span className="text-[10px] text-stone-400 font-mono">ID: {selectedStep.id}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteStep(selectedStep.id)}
                    className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    title="Delete this node"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Status Indicator */}
                <div className={cn(
                  "p-3 rounded-2xl border text-xs space-y-1",
                  (!selectedStep.predecessor_ids || selectedStep.predecessor_ids.length === 0)
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : (selectedStep.predecessor_ids.length === 1
                      ? "bg-blue-50 border-blue-200 text-blue-900"
                      : "bg-purple-50 border-purple-200 text-purple-900")
                )}>
                  <div className="font-bold flex items-center gap-1.5">
                    {(!selectedStep.predecessor_ids || selectedStep.predecessor_ids.length === 0) && (
                      <>
                        <GitBranch className="w-4 h-4 text-emerald-600" />
                        <span>Parallel Mode (Start Instantly)</span>
                      </>
                    )}
                    {selectedStep.predecessor_ids && selectedStep.predecessor_ids.length === 1 && (
                      <>
                        <ArrowRight className="w-4 h-4 text-blue-600" />
                        <span>Serial Mode (Waits for 1 Predecessor)</span>
                      </>
                    )}
                    {selectedStep.predecessor_ids && selectedStep.predecessor_ids.length > 1 && (
                      <>
                        <Workflow className="w-4 h-4 text-purple-600" />
                        <span>Join Convergence ({selectedStep.predecessor_ids.length} Branches)</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] leading-tight">
                    {(!selectedStep.predecessor_ids || selectedStep.predecessor_ids.length === 0)
                      ? "This process runs independently and can be started immediately without waiting."
                      : `Must wait for ${selectedStep.predecessor_ids.length} preceding processes to reach 100% completion before starting on the Shop Floor.`}
                  </p>
                </div>

                {/* Node Type Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                    Card Node Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-2xl border border-stone-200">
                    <button
                      type="button"
                      onClick={() => handleUpdateStep(selectedStep.id, "node_type", "PROCESS")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer",
                        (selectedStep.node_type || "PROCESS") === "PROCESS"
                          ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                          : "text-stone-500 hover:text-stone-900"
                      )}
                    >
                      <Workflow className="w-3.5 h-3.5 text-blue-600" />
                      <span>Process</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStep(selectedStep.id, "node_type", "PRODUCT")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer",
                        selectedStep.node_type === "PRODUCT"
                          ? "bg-amber-500 text-white shadow-xs"
                          : "text-amber-800 hover:text-amber-950"
                      )}
                    >
                      <Package className="w-3.5 h-3.5 text-amber-100" />
                      <span>Product</span>
                    </button>
                  </div>
                </div>

                {selectedStep.node_type === "PRODUCT" && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-amber-700" />
                      <span>Product Output Milestone</span>
                    </div>
                    <p className="text-[11px] leading-tight text-amber-800">
                      Product card type represents the output component/part from preceding process steps. This card bypasses machine assignment & cycle time planning, and generates a dedicated tracking QR Code upon process completion.
                    </p>
                  </div>
                )}

                {/* Process / Product Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                    {selectedStep.node_type === "PRODUCT" ? "Product / Component Name *" : "Process / Operation Name *"}
                  </label>
                  <input
                    type="text"
                    value={selectedStep.process_name}
                    onChange={(e) => handleUpdateStep(selectedStep.id, "process_name", e.target.value)}
                    placeholder={selectedStep.node_type === "PRODUCT" ? "e.g. Cut Sheet Component, Enclosure Body Box" : "e.g. Boil Water, CNC Laser Cut, TIG Welding"}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 focus:bg-white focus:outline-stone-900"
                  />
                </div>

                {selectedStep.node_type === "PROCESS" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block flex items-center gap-1.5">
                        <Layers className="w-3 h-3" /> Assigned Station *
                      </label>
                      {(!selectedStep.station_id || !stations.some((st) => st.id === selectedStep.station_id)) && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                          Unassigned (Required)
                        </span>
                      )}
                    </div>
                    {stations.length === 0 ? (
                      <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5">
                        <p className="text-[11px] text-amber-900 font-medium leading-tight">
                          No workstations registered. At least 1 workstation must be created before assigning.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowStationModal(true)}
                          className="px-2.5 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold tracking-tight transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Register Workstation</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={selectedStep.station_id || ""}
                          onChange={(e) => handleUpdateStep(selectedStep.id, "station_id", e.target.value)}
                          className={cn(
                            "w-full rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:outline-emerald-500",
                            !selectedStep.station_id || !stations.some((st) => st.id === selectedStep.station_id)
                              ? "bg-amber-50/90 border border-amber-300 text-amber-950"
                              : "bg-stone-50 border border-stone-200 text-emerald-900"
                          )}
                        >
                          <option value="">-- Select Workstation (Required) --</option>
                          {stations.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.station_code} - {st.station_name}
                            </option>
                          ))}
                        </select>
                        {(!selectedStep.station_id || !stations.some((st) => st.id === selectedStep.station_id)) && (
                          <p className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Station assignment is mandatory for approval submission.</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Machine Asset Assignment & Timing */}
                {selectedStep.node_type === "PROCESS" && (
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-stone-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-blue-600" /> Assigned Machine Asset
                      </label>
                      {selectedStep.assigned_machine_id && (
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateStep(selectedStep.id, "assigned_machine_id", "");
                          }}
                          className="text-[10px] font-bold text-red-600 hover:underline cursor-pointer"
                        >
                          Unassign
                        </button>
                      )}
                    </div>

                    <select
                      value={selectedStep.assigned_machine_id || ""}
                      onChange={(e) => {
                        const mId = e.target.value;
                        const selMachine = machines.find((m) => m.id === mId);
                        handleUpdateStep(selectedStep.id, "assigned_machine_id", mId);
                        if (selMachine && selMachine.capacity_per_hour > 0 && (!selectedStep.cycle_time_minutes || selectedStep.cycle_time_minutes === 0)) {
                          const calcCt = Number((60 / selMachine.capacity_per_hour).toFixed(2));
                          handleUpdateStep(selectedStep.id, "cycle_time_minutes", calcCt);
                        }
                      }}
                      className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 focus:outline-blue-500"
                    >
                      <option value="">-- No Machine Bound (Manual / General) --</option>
                      {machines.map((m) => {
                        const isConflict = m.current_assignment && m.current_assignment.process_id !== selectedStep.id;
                        const conflictText = isConflict 
                          ? ` [In Use: ${m.current_assignment.project_name}]`
                          : "";
                        return (
                          <option key={m.id} value={m.id} disabled={isConflict}>
                            [{m.item_code}] {m.name} ({m.machine_category || "General"}){conflictText}
                          </option>
                        );
                      })}
                    </select>

                    {/* Show Conflict or Shared Warning */}
                    {(() => {
                      const selMachine = machines.find((m) => m.id === selectedStep.assigned_machine_id);
                      if (selMachine?.current_assignment && selMachine.current_assignment.process_id !== selectedStep.id) {
                        return (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-amber-900 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block">Shared Machine Resource</strong>
                              Mesin ini juga ter-assign ke project <em>{selMachine.current_assignment.project_name}</em>. Mode bypass aktif.
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Cycle Time & Setup / Teardown Times */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">
                          Cycle Time (m)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={selectedStep.cycle_time_minutes ?? 0}
                          onChange={(e) => handleUpdateStep(selectedStep.id, "cycle_time_minutes", parseFloat(e.target.value) || 0)}
                          placeholder="e.g. 5"
                          className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-stone-900"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">
                          Setup (m)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={selectedStep.setup_time_minutes ?? 0}
                          onChange={(e) => handleUpdateStep(selectedStep.id, "setup_time_minutes", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-stone-900"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">
                          Teardown (m)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={selectedStep.teardown_time_minutes ?? 0}
                          onChange={(e) => handleUpdateStep(selectedStep.id, "teardown_time_minutes", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-stone-900"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {selectedStep.node_type === "PRODUCT" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                      Expected Yield (%)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={selectedStep.expected_yield_rate ?? 100}
                      onChange={(e) => handleUpdateStep(selectedStep.id, "expected_yield_rate", parseFloat(e.target.value))}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-amber-900 focus:bg-white focus:outline-amber-500"
                    />
                  </div>
                )}



                {selectedStep.node_type === "PRODUCT" && (
                  <div className="space-y-1.5 pt-2 border-t border-stone-100">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                      <span>BOM Material Allocation</span>
                    </label>
                    
                    <div className="space-y-2">
                      {selectedStep.bom_allocations && selectedStep.bom_allocations.length > 0 ? (
                        selectedStep.bom_allocations.map((alloc, idx) => {
                          const bomRef = projectBoms.find(b => b.id === alloc.bom_id);
                          const totalBomQty = Number((bomRef?.required_qty || bomRef?.qty) || 0);
                          const uom = bomRef?.uom || alloc.uom || 'qty';

                          // Calculate quantity allocated in other steps for this BOM item
                          let usedInOtherStepsQty = 0;
                          steps.forEach(s => {
                            if (s.node_type === 'PRODUCT' && s.bom_allocations && s.id !== selectedStep.id) {
                              let allocs: any[] = [];
                              try {
                                allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations || [];
                              } catch(e){}
                              const found = allocs.find((x: any) => x.bom_id === alloc.bom_id);
                              if (found) {
                                const q = found.qty !== undefined ? Number(found.qty) : Number(found.fraction || 0) * totalBomQty;
                                usedInOtherStepsQty += q;
                              }
                            }
                          });

                          const maxAllocatableQty = Math.max(0, totalBomQty - usedInOtherStepsQty);
                          const currentQty = alloc.qty !== undefined ? Number(alloc.qty) : Number(alloc.fraction || 0) * totalBomQty;
                          const currentFraction = totalBomQty > 0 ? currentQty / totalBomQty : 0;

                          return (
                            <div key={idx} className="flex flex-col gap-1.5 bg-white border border-stone-200 p-2.5 rounded-xl shadow-3xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-stone-900 truncate pr-2" title={bomRef ? `${bomRef.item_name} (${bomRef.item_code})` : "Unknown Material"}>
                                  {bomRef ? `${bomRef.item_name} (${bomRef.item_code})` : "Unknown Material"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newAllocs = [...(selectedStep.bom_allocations || [])];
                                    newAllocs.splice(idx, 1);
                                    handleUpdateStep(selectedStep.id, "bom_allocations", newAllocs);
                                  }}
                                  className="text-stone-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                                  title="Hapus alokasi"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 flex-1 focus-within:bg-white focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500">
                                  <input
                                    type="number"
                                    min="0"
                                    max={maxAllocatableQty > 0 ? maxAllocatableQty : undefined}
                                    step="any"
                                    value={currentQty}
                                    onChange={(e) => {
                                      let val = parseFloat(e.target.value);
                                      if (isNaN(val) || val < 0) val = 0;
                                      if (totalBomQty > 0 && val > maxAllocatableQty) {
                                        val = maxAllocatableQty;
                                      }
                                      const calcFraction = totalBomQty > 0 ? val / totalBomQty : 0;

                                      const newAllocs = [...(selectedStep.bom_allocations || [])];
                                      newAllocs[idx] = {
                                        ...newAllocs[idx],
                                        qty: val,
                                        fraction: calcFraction,
                                        uom: uom,
                                        bom_name: bomRef?.item_name || newAllocs[idx].bom_name
                                      };
                                      handleUpdateStep(selectedStep.id, "bom_allocations", newAllocs);
                                    }}
                                    className="w-full bg-transparent text-xs font-bold text-stone-900 focus:outline-none"
                                    placeholder="0"
                                  />
                                  <span className="text-xs font-bold text-stone-500 shrink-0">
                                    / {totalBomQty} {uom}
                                  </span>
                                </div>

                                <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0">
                                  {Math.round(currentFraction * 100)}%
                                </span>
                              </div>

                              {totalBomQty > 0 && (
                                <div className="flex items-center justify-between text-[10px] text-stone-500 px-0.5">
                                  <span>Max allocatable: <strong className="text-stone-700">{maxAllocatableQty % 1 === 0 ? maxAllocatableQty : maxAllocatableQty.toFixed(2)} {uom}</strong></span>
                                  {usedInOtherStepsQty > 0 && (
                                    <span className="text-stone-400">({usedInOtherStepsQty % 1 === 0 ? usedInOtherStepsQty : usedInOtherStepsQty.toFixed(2)} {uom} in other steps)</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-3 border border-dashed border-stone-300 rounded-xl">
                          <span className="text-[10px] text-stone-500">No BOM material allocated yet</span>
                        </div>
                      )}
                      
                      <div className="pt-2">
                        <select
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2 py-1.5 text-xs text-stone-700 font-bold focus:bg-white cursor-pointer"
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const bomId = e.target.value;
                            const bom = projectBoms.find(b => b.id === bomId);
                            if (!bom) return;

                            const totalBomQty = Number((bom.required_qty || bom.qty) || 0);
                            const uom = bom.uom || 'qty';

                            let totalUsedQty = 0;
                            steps.forEach(s => {
                              if (s.node_type === 'PRODUCT' && s.bom_allocations) {
                                let allocs: any[] = [];
                                try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations || []; } catch(e){}
                                const a = allocs.find((x: any) => x.bom_id === bomId);
                                if (a && s.id !== selectedStep.id) {
                                  const q = a.qty !== undefined ? Number(a.qty) : Number(a.fraction || 0) * totalBomQty;
                                  totalUsedQty += q;
                                }
                              }
                            });

                            const remainingQty = Math.max(0, totalBomQty - totalUsedQty);
                            const newAllocs = [...(selectedStep.bom_allocations || [])];
                            if (!newAllocs.find(a => a.bom_id === bomId)) {
                              newAllocs.push({
                                bom_id: bomId,
                                qty: remainingQty,
                                fraction: totalBomQty > 0 ? remainingQty / totalBomQty : 1.0,
                                bom_name: bom.item_name,
                                uom: uom
                              });
                              handleUpdateStep(selectedStep.id, "bom_allocations", newAllocs);
                            }
                          }}
                        >
                          <option value="">+ Add Material from BOM</option>
                          {projectBoms.map(bom => {
                            const totalBomQty = Number((bom.required_qty || bom.qty) || 0);
                            const uom = bom.uom || 'qty';
                            let totalUsedQty = 0;
                            steps.forEach(s => {
                              if (s.node_type === 'PRODUCT' && s.bom_allocations) {
                                let allocs: any[] = [];
                                try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations || []; } catch(e){}
                                const a = allocs.find((x: any) => x.bom_id === bom.id);
                                if (a && s.id !== selectedStep.id) {
                                  const q = a.qty !== undefined ? Number(a.qty) : Number(a.fraction || 0) * totalBomQty;
                                  totalUsedQty += q;
                                }
                              }
                            });
                            const remainingQty = Math.max(0, totalBomQty - totalUsedQty);
                            const isFullyAllocated = totalBomQty > 0 ? remainingQty <= 0.001 : false;

                            return (
                              <option key={bom.id} value={bom.id} disabled={isFullyAllocated}>
                                {bom.item_name} ({bom.item_code}) - {!isFullyAllocated ? `Sisa: ${remainingQty % 1 === 0 ? remainingQty : remainingQty.toFixed(2)} / ${totalBomQty} ${uom}` : `Ter-alokasi Penuh (${totalBomQty} ${uom})`}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {selectedStep.node_type === "PROCESS" && (
                  <div className="space-y-1.5 pt-2 border-t border-stone-100">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                      <span>Aggregated Material Requirements</span>
                    </label>
                    <div className="space-y-2">
                      {(() => {
                        // Recursive function to find all upstream PRODUCT nodes
                        const getUpstreamProducts = (stepId: string, visited = new Set<string>()): any[] => {
                          if (visited.has(stepId)) return [];
                          visited.add(stepId);
                          
                          const step = steps.find((s) => s.id === stepId);
                          if (!step) return [];
                          
                          let preds: string[] = [];
                          try {
                            preds = typeof step.predecessor_ids === 'string' ? JSON.parse(step.predecessor_ids) : step.predecessor_ids || [];
                          } catch(e) { preds = []; }
                          
                          const productsFound: any[] = [];
                          preds.forEach(pId => {
                            const pStep = steps.find(s => s.id === pId);
                            if (pStep) {
                              if (pStep.node_type === "PRODUCT") {
                                productsFound.push(pStep);
                              } else {
                                productsFound.push(...getUpstreamProducts(pId, visited));
                              }
                            }
                          });
                          return productsFound;
                        };
                        
                        const upstreamProducts = getUpstreamProducts(selectedStep.id);
                        const materialMap = new Map<string, { fraction: number, bomRef: any }>();
                        
                        upstreamProducts.forEach(prod => {
                           let allocs = [];
                           try { allocs = typeof prod.bom_allocations === 'string' ? JSON.parse(prod.bom_allocations) : prod.bom_allocations || []; } catch(e){}
                           
                           allocs.forEach((a: any) => {
                             const bomRef = projectBoms.find(b => b.id === a.bom_id);
                             if (bomRef) {
                               const existing = materialMap.get(a.bom_id);
                               if (existing) {
                                 existing.fraction += Number(a.fraction || 0);
                               } else {
                                 materialMap.set(a.bom_id, { fraction: Number(a.fraction || 0), bomRef });
                               }
                             }
                           });
                        });
                        
                        const aggregatedMaterials = Array.from(materialMap.values());
                        
                        if (aggregatedMaterials.length === 0) {
                          return (
                            <div className="text-center py-3 border border-dashed border-stone-300 rounded-xl">
                              <span className="text-[10px] text-stone-500">No BOM materials connected upstream</span>
                            </div>
                          );
                        }
                        
                        return (
                          <div className="flex flex-col gap-1.5">
                            {aggregatedMaterials.map((mat, idx) => (
                               <div key={idx} className="flex items-center justify-between bg-stone-50 border border-stone-200 p-2 rounded-lg shadow-2xs">
                                 <div className="flex flex-col">
                                   <span className="text-[11px] font-bold text-stone-900 truncate pr-2">
                                     {mat.bomRef.item_name} ({mat.bomRef.item_code})
                                   </span>
                                   <span className="text-[10px] text-stone-500 font-mono">
                                     Qty: {(mat.fraction * Number(mat.bomRef.required_qty || mat.bomRef.qty || 0)).toFixed(2)} {mat.bomRef.uom || 'qty'}
                                   </span>
                                 </div>
                                 <span className="font-mono font-black text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded text-xs">
                                   {Math.round(mat.fraction * 100)}%
                                 </span>
                               </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* QC Criteria */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                    QC Inspection Checkpoint Criteria
                  </label>
                  <textarea
                    rows={2}
                    value={selectedStep.qc_criteria || ""}
                    onChange={(e) => handleUpdateStep(selectedStep.id, "qc_criteria", e.target.value)}
                    placeholder="e.g. Verify thickness ±0.1mm, visual inspect for micro-burrs..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:bg-white focus:outline-stone-900"
                  />
                </div>



                {/* SOP Instructions */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                    Technical SOP Instructions / Work Notes
                  </label>
                  <textarea
                    rows={2}
                    value={selectedStep.sop_instruction || selectedStep.notes || ""}
                    onChange={(e) => handleUpdateStep(selectedStep.id, "sop_instruction", e.target.value)}
                    placeholder="Provide specific parameters, safety measures, or tool settings..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:bg-white focus:outline-stone-900"
                  />
                </div>

                {/* Dependency Links Manager (Upstream & Downstream) */}
                <div className="space-y-4 pt-3 border-t border-stone-100">
                  {/* Section 1: Predecessors (Inputs) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                        Predecessors (Inputs / Feeds From)
                      </label>
                      <span className="text-[10px] font-mono text-stone-400">
                        {(selectedStep.predecessor_ids || []).length} connected
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {steps
                        .filter((s) => s.id !== selectedStep.id)
                        .map((otherStep) => {
                          const isConnected = (selectedStep.predecessor_ids || []).includes(otherStep.id);
                          return (
                            <label
                              key={otherStep.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all",
                                isConnected
                                  ? "bg-emerald-500 text-white border-emerald-600 shadow-xs"
                                  : "bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700"
                              )}
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[9px] font-mono font-black",
                                  otherStep.node_type === "PRODUCT" ? "bg-amber-500 text-white" : "bg-stone-200 text-stone-800"
                                )}>
                                  {otherStep.node_type === "PRODUCT" ? "PROD" : "PROC"}
                                </span>
                                <span className="font-bold truncate">
                                  {String(otherStep.step_sequence).padStart(2, "0")}. {otherStep.process_name || "Untitled"}
                                </span>
                              </div>
                              <input
                                type="checkbox"
                                checked={isConnected}
                                onChange={(e) => {
                                  const current = selectedStep.predecessor_ids || [];
                                  const updated = e.target.checked
                                    ? [...current, otherStep.id]
                                    : current.filter((id) => id !== otherStep.id);
                                  handleUpdateStep(selectedStep.id, "predecessor_ids", updated);
                                }}
                                className="rounded text-stone-900 focus:ring-stone-900"
                              />
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  {/* Section 2: Feeds Into (Outputs / Downstream Targets) */}
                  <div className="space-y-2 pt-2 border-t border-dashed border-stone-200">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                      Feeds Into (Downstream Operations)
                    </label>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {steps
                        .filter((s) => s.id !== selectedStep.id)
                        .map((otherStep) => {
                          const otherPreds = otherStep.predecessor_ids || [];
                          const isFeedsInto = otherPreds.includes(selectedStep.id);
                          return (
                            <label
                              key={otherStep.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all",
                                isFeedsInto
                                  ? "bg-blue-900 text-white border-blue-900 shadow-xs"
                                  : "bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700"
                              )}
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[9px] font-mono font-black",
                                  otherStep.node_type === "PRODUCT" ? "bg-amber-500 text-white" : "bg-blue-600 text-white"
                                )}>
                                  {otherStep.node_type === "PRODUCT" ? "PROD" : "PROC"}
                                </span>
                                <span className="font-bold truncate">
                                  {String(otherStep.step_sequence).padStart(2, "0")}. {otherStep.process_name || "Untitled"}
                                </span>
                              </div>
                              <input
                                type="checkbox"
                                checked={isFeedsInto}
                                onChange={(e) => {
                                  const currentOtherPreds = otherStep.predecessor_ids || [];
                                  const updatedOtherPreds = e.target.checked
                                    ? [...currentOtherPreds, selectedStep.id]
                                    : currentOtherPreds.filter((id) => id !== selectedStep.id);
                                  handleUpdateStep(otherStep.id, "predecessor_ids", updatedOtherPreds);
                                }}
                                className="rounded text-blue-600 focus:ring-blue-600"
                              />
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
    <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-4 pt-20">
      <div className="p-4 bg-stone-50 border border-stone-200 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="w-6 h-6 text-stone-400"><rect width="8" height="8" x="8" y="8" rx="2"/><path d="M12 2v6"/><path d="M12 16v6"/><path d="M2 12h6"/><path d="M16 12h6"/></svg>
      </div>
      <div className="text-center">
        <h4 className="text-xs font-bold text-stone-700">No Node Selected</h4>
        <p className="text-[10px] max-w-[200px] mt-1">Select a process or product node from the canvas to inspect and configure its properties.</p>
      </div>
    </div>
  )}
          </div>
        </div>
      )}

      {/* VIEW 2: STRUCTURED MATRIX TABLE VIEW */}
      {viewMode === "MATRIX" && (
        <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-16 text-center">Seq</th>
                  <th className="py-3.5 px-4">Manufacturing Process Name</th>
                  <th className="py-3.5 px-4 text-center">Flow Mode</th>
                  <th className="py-3.5 px-4">Workstation *</th>
                  <th className="py-3.5 px-4">Predecessors (Serial Constraints)</th>
                  <th className="py-3.5 px-4">QC Criteria</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {steps.map((step, idx) => {
                  const preds = steps.filter((s) => (step.predecessor_ids || []).includes(s.id));
                  const isParallel = preds.length === 0;
                  const isProcess = (step.node_type || "PROCESS") === "PROCESS";
                  const isUnassignedStation = isProcess && (!step.station_id || !stations.some((st) => st.id === step.station_id));

                  return (
                    <tr key={step.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-center font-mono font-black text-stone-800">
                        {String(step.step_sequence || idx + 1).padStart(2, "0")}
                      </td>

                      <td className="py-3.5 px-4">
                        <input
                          type="text"
                          value={step.process_name}
                          onChange={(e) => handleUpdateStep(step.id, "process_name", e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-900 focus:bg-white"
                          placeholder="Process Name..."
                        />
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={cn(
                            "inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                            isParallel
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-blue-100 text-blue-800 border border-blue-300"
                          )}
                        >
                          {isParallel ? "PARALLEL" : "SERIAL"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 min-w-[210px]">
                        {isProcess ? (
                          <div className="space-y-1">
                            <select
                              value={step.station_id || ""}
                              onChange={(e) => handleUpdateStep(step.id, "station_id", e.target.value)}
                              className={cn(
                                "w-full rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all focus:bg-white",
                                isUnassignedStation
                                  ? "bg-amber-50 border border-amber-300 text-amber-950 focus:outline-amber-500"
                                  : "bg-stone-50 border border-stone-200 text-stone-900 focus:outline-stone-900"
                              )}
                            >
                              <option value="">-- Select Workstation (Req) --</option>
                              {stations.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.station_code} - {st.station_name}
                                </option>
                              ))}
                            </select>
                            {isUnassignedStation && (
                              <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>Unassigned Station</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-semibold">
                            Output Node
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {preds.length === 0 ? (
                          <span className="text-[11px] text-emerald-700 font-bold">
                            None (Starts Immediately)
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {preds.map((p) => (
                              <span
                                key={p.id}
                                className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[10px] font-mono font-bold text-stone-800"
                              >
                                Step {p.step_sequence}: {p.process_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <input
                          type="text"
                          value={step.qc_criteria || ""}
                          onChange={(e) => handleUpdateStep(step.id, "qc_criteria", e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2 py-1.5 text-xs text-stone-800"
                          placeholder="QC Criteria..."
                        />
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteStep(step.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: EXPLANATION MODAL (KONSEP SERI VS PARALEL) */}
      <Modal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
        title="Workflow Logic Concept: Serial vs Parallel"
        maxWidth="2xl"
      >
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seri Card */}
            <div className="p-5 rounded-3xl bg-blue-50/70 border border-blue-200 space-y-3">
              <div className="flex items-center gap-2 text-blue-900 font-black text-sm">
                <ArrowRight className="w-5 h-5 text-blue-600" />
                <span>Serial Process (Sequential & Ordered)</span>
              </div>
              <p className="text-xs text-blue-950 leading-relaxed">
                A new process can only start after its preceding process is <strong>100% completed</strong>. Tasks must wait in sequence, with zero concurrent overlap.
              </p>
              <div className="p-3 bg-white rounded-2xl border border-blue-100 text-[11px] text-stone-700 space-y-1">
                <strong>Real-World Example:</strong>
                <p>
                  Cooking instant noodles: You must wait for the water to boil completely (Process 1) before you can add the noodles to the pot (Process 2). Process 2 is locked until Process 1 finishes.
                </p>
              </div>
            </div>

            {/* Paralel Card */}
            <div className="p-5 rounded-3xl bg-emerald-50/70 border border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                <GitBranch className="w-5 h-5 text-emerald-600" />
                <span>Parallel Process (Concurrent & Independent)</span>
              </div>
              <p className="text-xs text-emerald-950 leading-relaxed">
                Tasks are executed <strong>concurrently in the same timeframe</strong>. An independent process does not wait on any other task to begin.
              </p>
              <div className="p-3 bg-white rounded-2xl border border-emerald-100 text-[11px] text-stone-700 space-y-1">
                <strong>Real-World Example:</strong>
                <p>
                  While waiting for water to boil, you can simultaneously prepare the bowl, slice chili, and open seasoning packets (Processes 2, 3, and 4). These run together without waiting.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-stone-200 text-stone-800 rounded-2xl text-xs space-y-2">
            <h5 className="font-bold text-amber-400 flex items-center gap-1.5">
              <Workflow className="w-4 h-4" />
              How Does This Work on the Flowchart Canvas?
            </h5>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              • Nodes without incoming connections automatically run as <strong>PARALLEL (Independent)</strong>.<br />
              • Nodes with incoming connections automatically run as <strong>SERIAL (Locked until predecessor finishes)</strong>.<br />
              • On the Shop Floor, the <em>"Start Task"</em> button is automatically disabled for Serial tasks until all predecessor steps are <strong>COMPLETED (100%)</strong>.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setShowExplanationModal(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
            >
              Understood & Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: PRESET TEMPLATES MODAL */}
      <Modal
        isOpen={showPresetModal}
        onClose={() => setShowPresetModal(false)}
        title="Load Process Routing Preset Templates (BoP)"
        maxWidth="2xl"
      >
        <div className="p-6 space-y-4">
          <p className="text-xs text-stone-500">
            Select an industrial standard template to immediately generate a structured process flowchart:
          </p>

          <div className="grid grid-cols-1 gap-3">
            {Object.entries(PRESET_TEMPLATES).map(([key, t]) => (
              <div
                key={key}
                className="bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-2xl p-4 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-stone-200 text-stone-800">
                      {t.category}
                    </span>
                    <h4 className="text-xs font-black text-stone-900">{t.title}</h4>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-snug">{t.desc}</p>
                  <div className="text-[10px] text-stone-400 font-mono">
                    {t.steps.length} Operation Steps
                  </div>
                </div>

                <Button
                  onClick={() => handleApplyPreset(key)}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0 h-9"
                >
                  Apply Template
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <StationManagementModal 
        isOpen={showStationModal} 
        onClose={() => setShowStationModal(false)} 
        projectId={projectId} 
        stations={stations}
        onRefresh={() => {
          // Re-fetch stations
          apiFetch(`/api/production/projects/${projectId}/stations`, {}, user?.username).then(res => {
            if (res.ok && Array.isArray(res.data?.stations)) {
              setStations(res.data.stations);
            }
          });
        }}
      />

      {/* MODAL 3: SIMULATION RUN MODAL */}
      <Modal
        isOpen={showSimulationModal}
        onClose={() => setShowSimulationModal(false)}
        title="Process Routing Simulation (Execution Path Validator)"
        maxWidth="2xl"
      >
        <div className="p-6 space-y-5">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-950 flex items-start gap-2.5">
            <PlayCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-black">Shop Floor Readiness Simulation:</strong>
              <span>
                This simulation demonstrates how the live shop floor system will automatically lock and unlock tasks based on the dependency rules configured in your flowchart.
              </span>
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {(() => {
              if (steps.length === 0) return <p className="text-sm text-stone-500 italic">No process steps defined yet.</p>;

              const parallelSteps = steps.filter(s => (s.predecessor_ids || []).length === 0);
              const serialSteps = steps.filter(s => (s.predecessor_ids || []).length > 0);
              
              const startNames = parallelSteps.map(s => `"${s.process_name}"`).join(", ");

              return (
                <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 shadow-sm">
                  <p className="text-sm text-stone-700 leading-relaxed">
                    Based on your configured process routing, production will <strong>start concurrently (in parallel)</strong> on step(s) <strong>{startNames}</strong>. Because these steps have no predecessor constraints, shop floor operators can begin work immediately.
                  </p>
                  
                  {serialSteps.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-sm text-stone-700 leading-relaxed">
                        Once initial processes are completed, the Shop Floor system will automatically <strong>unlock</strong> subsequent operations in the defined sequence:
                      </p>
                      <ul className="list-disc pl-5 text-sm text-stone-600 space-y-2">
                        {serialSteps.map(step => {
                           const preds = steps.filter(s => (step.predecessor_ids || []).includes(s.id));
                           const predNames = preds.map(p => `"${p.process_name}"`).join(" and ");
                           return (
                             <li key={step.id}>
                               Step <strong>"{step.process_name}"</strong> can only start after <strong>{predNames}</strong> is 100% completed.
                             </li>
                           );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mt-4">
                     <p className="text-sm text-emerald-800 font-medium leading-relaxed flex items-start gap-2">
                       <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                       <span>A total of <strong>{steps.length} process steps</strong> configured. The system enforces strict dependency sequencing.</span>
                     </p>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setShowSimulationModal(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
            >
              Close Simulation
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: IMPORT JSON MODAL */}
      <Modal
        isOpen={showLoadPresetModal}
        onClose={() => {
          setShowLoadPresetModal(false);
          setPresetFile(null);
          setPresetFileName("");
        }}
        title="Load BOP Preset"
        maxWidth="md"
        contentClassName="p-0 border-t border-stone-100"
      >
        <form onSubmit={handleImportJson} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">
              Upload BOP Preset File (.json)
            </label>
            <div className="relative group">
              <input
                required
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPresetFile(file);
                    setPresetFileName(file.name);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="w-full border-2 border-dashed border-stone-200 rounded-3xl px-4 py-8 flex flex-col items-center justify-center bg-stone-50/50 group-hover:border-stone-300 transition-all">
                <div className="w-10 h-10 bg-white rounded-2xl shadow-sm border border-stone-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5 text-stone-400" />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold tracking-widest uppercase text-center break-all px-2",
                    presetFileName ? "text-stone-900" : "text-stone-400",
                  )}
                >
                  {presetFileName || "Click or drag preset file..."}
                </span>
              </div>
            </div>
            <p className="text-[8px] text-stone-400 font-medium tracking-wide text-center uppercase mt-2">
              * Hanya menerima format .json yang di-generate dari fitur Save Preset
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setShowLoadPresetModal(false);
                setPresetFile(null);
                setPresetFileName("");
              }}
              className="px-6 py-2.5 rounded-2xl border border-stone-200 text-stone-700 font-bold text-xs hover:bg-stone-50 transition-colors uppercase"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!presetFile}
              className="px-6 py-2.5 rounded-2xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50 transition-colors uppercase shadow-sm shadow-emerald-500/20"
            >
              Load Preset
            </button>
          </div>
        </form>
      </Modal>

      <AuthorizeDocModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        docType="Bill of Process (BOP)"
        docNumber={project?.id || "BOP-0001"}
        subtitle="OFFICIAL BOP AUTHORIZATION & LOCK"
        status={project?.bop_status || "PENDING"}
        partnerLabel="Project Name"
        partnerName={project?.name || project?.id || "Project BOP"}
        amount={0}
        isSubmitting={isAuthorizing}
        submitLabel="Authorize BOP"
        submitVariant="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
        themeVariant="emerald"
        approvalTitle="Authorize Bill of Process (BOP)"
        approvalDescription="Enter your Daily Internal Auth Key (available in the header activity & notification panel) to authorize and publish this Bill of Process to production."
        onAuthorize={async (pin) => {
          await handleAuthorizeBoP(pin);
        }}
      />

      <AuthorizeDocModal
        isOpen={showEcoModal}
        onClose={() => {
          setShowEcoModal(false);
          setEcoReason("");
        }}
        docType="Engineering Change Order (ECO)"
        docNumber={project?.id || "BOP-0001"}
        subtitle="BOP TECHNICAL REVISION & RE-COMMITMENT"
        status="MANUFACTURING PHASE"
        partnerLabel="Project Name"
        partnerName={project?.name || project?.id || "Project BOP"}
        amount={0}
        isSubmitting={isSaving}
        submitLabel="Authorize & Commit ECO"
        submitVariant="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs"
        submitDisabled={!ecoReason.trim()}
        themeVariant="amber"
        icon={<Wrench className="w-5 h-5 text-amber-600" />}
        approvalTitle="Authorize Engineering Change Order (ECO)"
        approvalDescription="This project has entered the Manufacturing phase. Enter your Daily Internal Auth Key to authorize technical revisions (ECO) to this Bill of Process."
        onAuthorize={async (pin) => {
          const success = await handleSyncBoP(pin, ecoReason);
          if (success) {
            setShowEcoModal(false);
            setEcoReason("");
          }
        }}
      >
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2 mt-4">
          <label className="text-xs font-bold text-stone-700">Reason for Technical Revision / ECO</label>
          <textarea
            value={ecoReason}
            onChange={(e) => setEcoReason(e.target.value)}
            className="w-full bg-white border border-stone-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            rows={3}
            placeholder="e.g. Updating standard hours for CNC milling based on actual test runs..."
          />
        </div>
      </AuthorizeDocModal>

      <Modal
        isOpen={showReviseBopModal}
        onClose={() => {
          setShowReviseBopModal(false);
          setReviseReason("");
        }}
        title="BOP Revision Request"
        maxWidth="md"
      >
        <div className="p-6 space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 text-rose-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <strong>Request Revision:</strong> Mark this BOP as needing revision. It will be returned to the engineering stream for corrections.
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-700">Revision Note / Correction Instructions</label>
            <textarea
              value={reviseReason}
              onChange={(e) => setReviseReason(e.target.value)}
              rows={4}
              placeholder="Explain what needs to be changed..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-rose-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <Button
              variant="secondary"
              onClick={() => {
                setShowReviseBopModal(false);
                setReviseReason("");
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-rose-600 hover:bg-rose-700"
              disabled={!reviseReason.trim() || isSaving}
              onClick={handleReviseBoP}
            >
              {isSaving ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: PRINT ROUTE TRAVELER SHEET MODAL */}
      <BopRoutingPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        steps={steps}
        project={project}
        projectBoms={projectBoms}
      />

      <ConfirmModal
        isOpen={showConfirmSubmitBopModal}
        onCancel={() => setShowConfirmSubmitBopModal(false)}
        onConfirm={async () => {
          setShowConfirmSubmitBopModal(false);
          await handleSyncBoP();
        }}
        title={
          language === "id"
            ? "Konfirmasi Pengajuan Bill of Process (BOP)"
            : "Confirm Bill of Process (BOP) Submission"
        }
        message={
          <div className="space-y-3 text-left">
            <p className="text-xs text-stone-600 leading-relaxed">
              {language === "id"
                ? `Apakah Anda yakin ingin mengajukan Bill of Process (BOP) proyek ${project?.spk_number || project?.name || ""} ini untuk persetujuan Manajer Teknik? Data yang diajukan akan dikunci untuk otorisasi.`
                : `Are you sure you want to submit this Bill of Process (BOP) for project ${project?.spk_number || project?.name || ""} for Manager approval? Submitted data will be queued for authorization.`}
            </p>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5 text-[11px]">
              <div className="font-bold text-stone-800">Pre-submission Prerequisites Checklist:</div>
              <div className="flex items-center justify-between text-stone-600">
                <span>Registered Workstations:</span>
                <span className="font-bold text-emerald-700 font-mono">{stations.length} Registered (&ge; 1 Required)</span>
              </div>
              <div className="flex items-center justify-between text-stone-600">
                <span>Process Step Assignments:</span>
                <span className="font-bold text-emerald-700 font-mono">{processSteps.length} of {processSteps.length} Assigned (100%)</span>
              </div>
              <div className="flex items-center justify-between text-stone-600">
                <span>BOM Authorization:</span>
                <span className="font-bold text-emerald-700 font-mono">{bomStatus} (Authorized)</span>
              </div>
            </div>
          </div>
        }
        confirmText={language === "id" ? "Ya, Ajukan BOP" : "Yes, Submit BOP"}
        cancelText={language === "id" ? "Batal" : "Cancel"}
        variant="info"
      />
    </div>
  );
};

import React, { useEffect, useState, useMemo, useRef, lazy, Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import {
  Package,
  Search,
  Filter,
  Plus,
  ArrowUpRight,
  AlertCircle,
  ArrowDownRight,
  History,
  Settings2,
  X,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Pencil,
  Sliders,
  Info,
  QrCode,
  Download,
  ClipboardCheck,
  Printer,
  ScanLine,
  ArrowRight,
  Clock,
  TrendingUp,
  TrendingDown,
  Camera,
  ChevronDown,
  ShieldCheck,
  Truck,
  Upload,
  Cpu,
  Boxes,
  Wrench,
  Check,
  Tag,
} from "lucide-react";
import { MachineQrModal } from "@/components/erp/inventory/MachineQrModal";
import { cn, formatCurrency, parseCurrency, formatIDR } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Loader } from "@/components/shared/Loader";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { WarehouseLabelModal } from "@/components/erp/inventory/WarehouseLabelModal";
import { WarehouseIntakeLabelsModal } from "@/components/erp/inventory/WarehouseIntakeLabelsModal";
import { WarehousePendingGrnTab } from "@/components/erp/inventory/WarehousePendingGrnTab";
import { WarehouseReservationsTab } from "@/components/erp/inventory/WarehouseReservationsTab";
import { WarehouseHistoryTab } from "@/components/erp/inventory/WarehouseHistoryTab";
import { WarehouseTerminalTab } from "@/components/erp/inventory/WarehouseTerminalTab";
import { getDailyAuthKey, isValidDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { useInventoryLocal } from "@/hooks/useInventoryLocal";
import { AddItemModal } from "@/components/erp/inventory/AddItemModal";
import { EditItemModal } from "@/components/erp/inventory/EditItemModal";
import { StockAdjustModal } from "@/components/erp/inventory/StockAdjustModal";

const ScannerModal = lazy(() =>
  import("@/components/shared/ScannerModal").then((m) => ({
    default: m.ScannerModal,
  }))
);

interface InventoryItem {
  id: string;
  item_code: string;
  name: string;
  dimension: string;
  spec: string;
  uom: string;
  type: string;
  unit_price: number;
  free_stock: number;
  allocated_stock: number;
  reserved_stock?: number;
  reserved_qty?: number;
  physical_qty?: number;
  available_qty?: number;
  min_stock?: number;
  max_stock?: number;
  location?: string;
  item_type?: string;
  machine_category?: string;
  capacity_per_hour?: number;
  machine_status?: string;
  operational_status?: string;
  serial_number?: string;
  manufacturer?: string;
  machine_specifications?: any;
  bypass_multi_station?: number | boolean;
}

export default function Warehouse() {
  const [activeTab, setActiveTab] = useState<
    "STOCK" | "HISTORY" | "TERMINAL" | "PENDING" | "RESERVATIONS"
  >("STOCK");
  const [terminalMenu, setTerminalMenu] = useState<"CONSUMPTION" | "DISPATCH">(
    "CONSUMPTION"
  );
  const [draftDeliveries, setDraftDeliveries] = useState<any[]>([]);
  const [showUploadDnModal, setShowUploadDnModal] = useState(false);
  const [selectedDn, setSelectedDn] = useState<any>(null);
  const [dnUploadFile, setDnUploadFile] = useState<File | null>(null);

  const {
    inventory: localInventory,
    isLoading,
    refreshCloud,
  } = useInventoryLocal(useAuth().user);
  const inventory = (localInventory || []) as unknown as InventoryItem[];

  const [movements, setMovements] = useState<any[]>([]);
  const [movementPage, setMovementPage] = useState(0);
  const [totalMovements, setTotalMovements] = useState(0);
  const [pendingGrns, setPendingGrns] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [reservations, setReservations] = useState<any[]>([]);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [itemToEdit, setItemToEdit] = useState<any>(null);

  // Confirm Modal States
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: () => {},
  });

  // Consumption State (Merged from Operations)
  const [consumeStep, setConsumeStep] = useState<
    "IDLE" | "SELECT_ITEM" | "CONSUME" | "SUCCESS"
  >("IDLE");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [consumeQty, setConsumeQty] = useState("1");
  const [transactionDirection, setTransactionDirection] = useState<
    "WITHDRAW" | "RETURN"
  >("WITHDRAW");
  const [scanInput, setScanInput] = useState("");
  const [scannedInfo, setScannedInfo] = useState<any>(null);
  const [recordedBy, setRecordedBy] = useState("");
  const [activeProjectBOM, setActiveProjectBOM] = useState<any[]>([]);

  // GRN State
  const [pos, setPos] = useState<any[]>([]);
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [selectedPoDetails, setSelectedPoDetails] = useState<any>(null);
  const [grnItems, setGrnItems] = useState<any[]>([]);
  const [grnForm, setGrnForm] = useState({
    received_date: new Date().toISOString().split("T")[0],
    engineering_user: "",
    qc_user: "",
    qc_status: "PASSED",
    remarks: "",
  });

  // Labels State
  const [showItemLabelsModal, setShowItemLabelsModal] = useState(false);
  const [newItem, setNewItem] = useState({
    item_code: "",
    name: "",
    uom: "PCS",
    type: "RAW",
    dimension: "",
    spec: "",
    item_type: "MATERIAL",
    machine_category: "",
    capacity_per_hour: 0,
    serial_number: "",
    manufacturer: "",
    bypass_multi_station: false,
  });

  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("STOCK_TAKE");
  const [adjustName, setAdjustName] = useState("");
  const [adjustUom, setAdjustUom] = useState("");
  const { showToast } = useToast();
  const { user } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [selectedLabelItem, setSelectedLabelItem] = useState<any>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showMachineQrModal, setShowMachineQrModal] = useState(false);
  const [selectedMachineForQr, setSelectedMachineForQr] = useState<any>(null);

  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target as Node)
      ) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleScanSuccess = async (val: string) => {
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(val);
      } catch (e) {
        const found = inventory.find(
          (i) =>
            i.item_code === val.trim().toUpperCase() || i.id === val.trim()
        );
        if (found) {
          parsed = { id: found.id, code: found.item_code };
        } else {
          showToast(`Unknown code: ${val.trim()}`, "error");
          return;
        }
      }

      if (parsed && (parsed.id || parsed.code)) {
        const item = inventory.find(
          (i) => i.id === parsed.id || i.item_code === parsed.code
        );
        if (item) {
          setSelectedItem(item);
          setConsumeStep("CONSUME");
          setConsumeQty(parsed.qty ? parsed.qty.toString() : "1");
          setSearchQuery("");
          setIsScannerOpen(false);
          if (parsed.po) {
            try {
              const response = await apiFetch(
                `/api/warehouse/item-allocation-info?po_number=${encodeURIComponent(
                  parsed.po
                )}&item_id=${item.id}`,
                {},
                user?.username
              );
              const data = response.data;
              if (data?.projects?.length > 0)
                setSelectedProject(data.projects[0]);
            } catch (err) {
              console.error(err);
            }
          }
        } else {
          showToast("Item not found in inventory.", "error");
        }
      }
    } catch (err) {
      showToast("Scan error.", "error");
    }
  };

  const fetchInventory = async () => {
    try {
      refreshCloud(); // Updates localInventory in background

      const [movData, posData, projData, pendingData, draftDnData] =
        await Promise.all([
          apiFetch(
            `/api/inventory/movements?limit=100&offset=${movementPage * 100}`,
            {},
            user?.username
          ),
          apiFetch("/api/purchasing/pos", {}, user?.username),
          apiFetch("/api/projects", {}, user?.username),
          apiFetch("/api/warehouse/pending-incoming", {}, user?.username),
          apiFetch("/api/sales/deliveries", {}, user?.username),
        ]);

      if (movData.ok) {
        if (movData.data?.movements) {
          setMovements(movData.data.movements);
          setTotalMovements(movData.data.total || 0);
        } else if (Array.isArray(movData.data)) {
          setMovements(movData.data);
          setTotalMovements(movData.data.length);
        }
      }
      if (posData.ok)
        setPos(
          Array.isArray(posData.data)
            ? posData.data.filter(
                (p: any) => p.status === "ISSUED" || p.status === "PARTIAL"
              )
            : []
        );
      if (projData.ok)
        setProjects(Array.isArray(projData.data) ? projData.data : []);
      if (pendingData.ok)
        setPendingGrns(Array.isArray(pendingData.data) ? pendingData.data : []);
      if (draftDnData.ok) {
        const allDns = Array.isArray(draftDnData.data) ? draftDnData.data : [];
        const activeDispatches = allDns.filter(
          (d: any) => d.status === "AUTHORIZED"
        );
        setDraftDeliveries(activeDispatches);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      apiFetch(`/api/projects/${selectedProject}`, {}, user?.username).then(
        (res) => {
          if (res.ok) setActiveProjectBOM(res.data.bom || []);
        }
      );
    } else {
      setActiveProjectBOM([]);
    }
  }, [selectedProject]);

  const [intakeLabels, setIntakeLabels] = useState<any[]>([]);
  const [intakePoNumber, setIntakePoNumber] = useState("");
  const [intakeSupplierName, setIntakeSupplierName] = useState("");
  const [intakeGrnId, setIntakeGrnId] = useState("");
  const [intakeReceivedDate, setIntakeReceivedDate] = useState("");

  const handleOpenPoLabelFromHistory = (mov: any) => {
    setIntakeLabels([
      {
        id: mov.id || `LBL-${Date.now().toString(36).toUpperCase()}`,
        item_id: mov.item_id,
        item_code: mov.item_code,
        name: mov.item_name,
        qty: Math.abs(mov.qty || 0),
        uom: mov.uom || "PCS",
        project_id: mov.project_id,
        po_number: mov.po_number,
        supplier_name: mov.supplier_name,
        grn_id: mov.reference_id,
      },
    ]);
    setIntakePoNumber(mov.po_number || "PO-REF");
    setIntakeSupplierName(mov.supplier_name || "Supplier Mitra");
    setIntakeGrnId(mov.reference_id || "-");
    setIntakeReceivedDate(mov.created_at || new Date().toISOString());
    setShowItemLabelsModal(true);
  };

  const handleReturnGrn = async (grnId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/warehouse/return-grn",
        {
          method: "POST",
          body: JSON.stringify({
            grn_id: grnId,
            recorded_by: user?.username || "SYSTEM",
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast("GRN items successfully marked as returned / rejected", "info");
        fetchInventory();
      } else {
        showToast(res.error || "Failed to return GRN", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error returning GRN items", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIntakeGrn = async (grnId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/warehouse/intake-grn",
        {
          method: "POST",
          body: JSON.stringify({
            grn_id: grnId,
            recorded_by: user?.username || "SYSTEM",
          }),
        },
        user?.username
      );
      if (res.ok) {
        const data = res.data;
        showToast("GRN items successfully intaken into inventory!", "success");
        fetchInventory();
        if (data.labels && data.labels.length > 0) {
          setIntakeLabels(data.labels);
          setIntakePoNumber(data.po_number || "");
          setIntakeSupplierName(data.supplier_name || "");
          setIntakeGrnId(data.grn_id || grnId);
          setIntakeReceivedDate(data.received_date || new Date().toISOString());
          setShowItemLabelsModal(true);
        }
      } else {
        showToast(res.error || "Failed to intake GRN", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error processing intake", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [movementPage]);

  useEffect(() => {
    if (user?.username) setRecordedBy(user.username);
  }, [user]);

  const [isUploadingDn, setIsUploadingDn] = useState(false);

  const handleUploadDispatch = async (submittedPin: string) => {
    if (!selectedDn) return showToast("Select a delivery note first", "error");
    if (!isValidDailyAuthKey(user?.username, submittedPin)) {
      showToast("Validation Failed: Invalid Authorization PIN.", "error");
      return;
    }
    setIsUploadingDn(true);
    try {
      const digitalSignature = `Digitally Authorized for Dispatch by ${
        user?.name || user?.username
      } (${user?.role}) on ${new Date().toISOString()}`;

      const res = await apiFetch(
        `/api/sales/deliveries/${selectedDn.id}/upload-dispatch`,
        {
          method: "POST",
          body: JSON.stringify({ file_url: digitalSignature }),
        },
        user?.username
      );

      if (res.ok) {
        showToast(
          "Dispatch confirmed. Digital authorization complete.",
          "success"
        );
        setShowUploadDnModal(false);
        setDnUploadFile(null);
        setSelectedDn(null);
        fetchInventory();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error processing digital authorization", "error");
    } finally {
      setIsUploadingDn(false);
    }
  };

  const handleConsume = async () => {
    if (!selectedItem || !consumeQty) return;
    setIsSubmitting(true);
    try {
      const endpoint =
        transactionDirection === "RETURN"
          ? "/api/inventory/return"
          : "/api/inventory/consume";
      const res = await apiFetch(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({
            item_id: selectedItem.id,
            qty: Number(consumeQty),
            project_id: selectedProject || null,
            recorded_by: recordedBy || user?.username || "WAREHOUSE_STAFF",
          }),
        },
        user?.username
      );
      if (res.ok) {
        setConsumeStep("SUCCESS");
        fetchInventory();
        if (selectedProject) {
          apiFetch(`/api/projects/${selectedProject}`, {}, user?.username).then(
            (projRes) => {
              if (projRes.ok) setActiveProjectBOM(projRes.data.bom || []);
            }
          );
        }
        showToast(
          `Item ${
            transactionDirection === "RETURN" ? "returned" : "consumed"
          } successfully`,
          "success"
        );
      } else {
        showToast(
          res.error ||
            `Failed to ${
              transactionDirection === "RETURN" ? "return" : "consume"
            } item. Check stock level.`,
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      showToast(
        `Error ${
          transactionDirection === "RETURN" ? "returning" : "consuming"
        } item`,
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && consumeStep === "SUCCESS") {
        setConsumeStep("IDLE");
        setSelectedItem(null);
        setScanInput("");
        setConsumeQty("1");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [consumeStep]);

  const handleDeleteItem = (id: string, itemCode: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete SKU: ${itemCode}?`,
      message: `Are you sure you want to permanently delete item ${itemCode} from the master inventory? This action cannot be undone.`,
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/items/${id}`,
            { method: "DELETE" },
            user?.username
          );
          if (res.ok) {
            showToast(`Item ${itemCode} deleted successfully`, "success");
            fetchInventory();
          } else {
            showToast(res.error || "Failed to delete item", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error deleting item", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleOpenEditItem = (item: InventoryItem) => {
    setItemToEdit({
      ...item,
      bypass_multi_station:
        item.bypass_multi_station === 1 || item.bypass_multi_station === true,
    });
    setShowEditModal(true);
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToEdit) return;
    setIsSubmitting(true);
    try {
      const price =
        typeof itemToEdit.unit_price === "string"
          ? parseCurrency(itemToEdit.unit_price)
          : itemToEdit.unit_price;

      const payload = {
        ...itemToEdit,
        unit_price: price || 0,
        bypass_multi_station: itemToEdit.bypass_multi_station ? 1 : 0,
      };

      const res = await apiFetch(
        `/api/items/${itemToEdit.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        user?.username
      );

      if (res.ok) {
        showToast(
          `Item ${itemToEdit.item_code} updated successfully`,
          "success"
        );
        setShowEditModal(false);
        setItemToEdit(null);
        fetchInventory();
      } else {
        showToast(res.error || "Failed to update item", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating item", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddItem = async (e?: React.FormEvent | any) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    const itemToSubmit = (e && typeof e === "object" && e.item_code) ? e : newItem;

    if (!itemToSubmit.item_code || !itemToSubmit.name || !itemToSubmit.uom) {
      showToast("Kode SKU, Nama Barang, dan Satuan (UOM) wajib diisi", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const bypass_reason = itemToSubmit.bypass_reason;
      const defaultCategory =
        itemToSubmit.type === "FINISH_GOOD" || itemToSubmit.type === "FINISHED"
          ? "Paving & Precast"
          : "General";

      const payload = {
        ...itemToSubmit,
        unit_price: 0,
        selling_price: 0,
        category: defaultCategory,
      };
      delete payload.bypass_reason;

      const res = await apiFetch(
        "/api/items",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        user?.username
      );

      if (res.ok) {
        showToast(`Item ${payload.item_code} added successfully`, "success");
        setShowAddModal(false);
        setNewItem({
          item_code: "",
          name: "",
          uom: "PCS",
          type: "RAW",
          dimension: "",
          spec: "",
          item_type: "MATERIAL",
          machine_category: "",
          capacity_per_hour: 0,
          serial_number: "",
          manufacturer: "",
          bypass_multi_station: false,
        });

        if (
          payload.type === "MACHINE" &&
          payload.bypass_multi_station &&
          bypass_reason
        ) {
          apiFetch("/api/production-logger/logs", {
            method: "POST",
            body: JSON.stringify({
              log_type: "BYPASS_AUDIT",
              machine_id: (res.data as any)?.id || (res as any).id,
              details: {
                action: "MACHINE_REGISTERED_WITH_BYPASS",
                reason: bypass_reason,
              },
              user_id: user?.username,
              user_role: "SUPERVISOR",
            }),
          });
        }

        fetchInventory();
      } else {
        showToast(res.error || "Failed to add item", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error adding item", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/inventory/adjust-v2",
        {
          method: "POST",
          body: JSON.stringify({
            item_id: selectedItem.id,
            new_free_stock: Number(adjustQty),
            reason: adjustReason,
            username: user?.username || "Warehouse Staff",
            item_name: adjustName || undefined,
            uom: adjustUom || undefined,
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast("Stock & master data updated successfully", "success");
        setShowAdjustModal(false);
        setAdjustQty("");
        setAdjustReason("STOCK_TAKE");
        setAdjustName("");
        setAdjustUom("");
        setSelectedItem(null);
        fetchInventory();
      } else {
        showToast(res.error || "Failed to adjust stock", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error adjusting stock", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAdjustModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setAdjustQty((item.free_stock ?? 0).toString());
    setAdjustName(item.name || "");
    setAdjustUom(item.uom || "");
    setAdjustReason("STOCK_TAKE");
    setShowAdjustModal(true);
  };

  const ASSET_FILTER_OPTIONS = [
    { id: "ALL", label: "All Items / SKUs", icon: Package },
    { id: "RAW", label: "Raw Materials", icon: Boxes },
    { id: "FINISH_GOOD", label: "Finished Goods", icon: ShieldCheck },
    { id: "MACHINE", label: "Machines", icon: Cpu },
    { id: "TOOL", label: "Tools", icon: Wrench },
    { id: "CONSUMABLE", label: "Consumables", icon: CheckCircle2 },
    { id: "SPAREPART", label: "Spareparts", icon: Settings2 },
  ];

  const filteredInventory = useMemo(
    () =>
      inventory.filter((item) => {
        const query = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !query ||
          (item.item_code && item.item_code.toLowerCase().includes(query)) ||
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.spec && item.spec.toLowerCase().includes(query)) ||
          (item.dimension && item.dimension.toLowerCase().includes(query)) ||
          (item.machine_category &&
            item.machine_category.toLowerCase().includes(query));

        const isMachine =
          item.type === "MACHINE" || item.item_type === "MACHINE";
        const matchesType =
          selectedTypeFilter === "ALL"
            ? true
            : selectedTypeFilter === "MACHINE"
            ? isMachine
            : item.type === selectedTypeFilter;

        return matchesQuery && matchesType;
      }),
    [inventory, searchQuery, selectedTypeFilter]
  );

  const lowStockCount = useMemo(
    () => inventory.filter((i) => (i.free_stock ?? 0) < 5 && i.type !== "MACHINE").length,
    [inventory]
  );

  const zeroStockCount = useMemo(
    () => inventory.filter((i) => (i.free_stock ?? 0) === 0 && i.type !== "MACHINE").length,
    [inventory]
  );

  return (
    <div className="space-y-12 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Warehouse & Inventory Ledger"
        subtitle="Item inventory and stock balances"
        icon={<Package className="w-6 h-6" />}
        actions={
          <div className="flex gap-2">
            <button
              disabled={!hasPermission(user, Action.WAREHOUSE_ACTION)}
              onClick={() => setShowAddModal(true)}
              className="px-8 py-3 bg-stone-900 text-white text-sm font-bold rounded-2xl hover:bg-stone-800 transition-all active:scale-95 flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              <Plus className="w-5 h-5" /> Register Item / SKU
            </button>
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-elegant p-8 rounded-[2rem]">
          <div className="flex items-start justify-between mb-6">
            <div className="p-3 bg-stone-50 rounded-2xl flex items-center justify-center">
              <Package className="w-5 h-5 text-stone-600" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 tracking-[0.2em] font-mono">
              01
            </span>
          </div>
          <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
            Total Master SKUs
          </div>
          <div className="text-2xl font-light text-stone-900 tracking-tighter leading-none">
            {inventory.length}
            <span className="text-sm font-bold text-stone-400 ml-3 uppercase tracking-widest">
              registered items
            </span>
          </div>
        </div>

        <div className="card-elegant p-8 rounded-[2rem]">
          <div className="flex items-start justify-between mb-6">
            <div
              className={cn(
                "p-3 rounded-2xl flex items-center justify-center",
                lowStockCount > 0 ? "bg-rose-50" : "bg-stone-50"
              )}
            >
              <AlertTriangle
                className={cn(
                  "w-5 h-5",
                  lowStockCount > 0 ? "text-rose-600" : "text-stone-400"
                )}
              />
            </div>
            <span className="text-[10px] font-bold text-stone-400 tracking-[0.2em] font-mono">
              02
            </span>
          </div>
          <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
            Critical Stock Alerts
          </div>
          <div className="flex items-baseline gap-3">
            <div
              className={cn(
                "text-2xl font-light tracking-tighter leading-none",
                lowStockCount > 0 ? "text-rose-600" : "text-stone-900"
              )}
            >
              {lowStockCount}
            </div>
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest leading-none mt-2">
              items &lt; 5 units
            </span>
          </div>
        </div>

        <div className="card-elegant p-8 rounded-[2rem]">
          <div className="flex items-start justify-between mb-6">
            <div className="p-3 bg-stone-50 rounded-2xl flex items-center justify-center">
              <Boxes className="w-5 h-5 text-stone-600" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 tracking-[0.2em] font-mono">
              03
            </span>
          </div>
          <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
            Zero Stock / Out of Stock
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-light text-stone-900 tracking-tighter leading-none">
              {zeroStockCount}
            </div>
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest leading-none mt-2">
              awaiting intake / PO
            </span>
          </div>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="card-elegant rounded-[2rem] overflow-hidden">
        <div className="px-8 py-8 flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white">
          <div className="flex gap-2">
            {[
              { id: "STOCK", label: "Inventory Master & Balances" },
              { id: "PENDING", label: "QC & Intake" },
              { id: "TERMINAL", label: "Terminal OPS" },
              { id: "HISTORY", label: "Movement Logs" },
              { id: "RESERVATIONS", label: "Project Allocations" },
            ]
              .filter((tab) => {
                if (
                  !hasGodMode(user) &&
                  !hasPermission(user, Action.WAREHOUSE_ACTION)
                ) {
                  return tab.id === "STOCK";
                }
                return true;
              })
              .map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "px-5 py-3 text-[10px] font-bold transition-all rounded-xl relative tracking-[0.2em] uppercase",
                    activeTab === tab.id
                      ? "bg-white shadow-sm border-stone-200 text-stone-900 ring-1 ring-stone-900/5"
                      : "text-stone-500 hover:bg-stone-100 border-transparent"
                  )}
                >
                  {tab.label}
                  {tab.id === "PENDING" && pendingGrns.length > 0 && (
                    <span className="ml-2 bg-stone-900 text-white rounded-lg px-2 py-0.5 text-[8px] font-bold">
                      {pendingGrns.length}
                    </span>
                  )}
                  {tab.id === "TERMINAL" && draftDeliveries.length > 0 && (
                    <span className="ml-2 bg-stone-900 text-white rounded-lg px-2 py-0.5 text-[8px] font-bold">
                      {draftDeliveries.length}
                    </span>
                  )}
                </button>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 relative max-w-lg w-full justify-end">
            {activeTab === "STOCK" && (
              <div className="relative" ref={filterDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                  className={cn(
                    "flex items-center gap-2.5 bg-white px-3.5 py-2.5 border rounded-xl shrink-0 shadow-xs transition-all text-xs font-bold uppercase tracking-wider cursor-pointer active:scale-95",
                    isFilterDropdownOpen
                      ? "border-stone-900 text-stone-900 ring-2 ring-stone-900/5"
                      : "border-stone-200 hover:border-stone-300 text-stone-700"
                  )}
                >
                  <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span className="font-bold tracking-wide">
                    {ASSET_FILTER_OPTIONS.find(
                      (o) => o.id === selectedTypeFilter
                    )?.label || "All Items"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 text-stone-400 transition-transform duration-200 shrink-0",
                      isFilterDropdownOpen && "rotate-180 text-stone-900"
                    )}
                  />
                </button>

                {isFilterDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-stone-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3.5 py-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 mb-1">
                      Filter Category
                    </div>
                    {ASSET_FILTER_OPTIONS.map((opt) => {
                      const isSelected = selectedTypeFilter === opt.id;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSelectedTypeFilter(opt.id);
                            setIsFilterDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors",
                            isSelected
                              ? "bg-stone-900 text-white font-bold"
                              : "text-stone-700 hover:bg-stone-100 font-medium"
                          )}
                        >
                          <span className="flex items-center gap-2.5">
                            <Icon
                              className={cn(
                                "w-3.5 h-3.5",
                                isSelected ? "text-white" : "text-stone-400"
                              )}
                            />
                            <span>{opt.label}</span>
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-white shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="relative flex-1 min-w-[180px] group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search code, name, spec..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-stone-50 border border-stone-100 rounded-xl text-[12px] font-bold text-stone-900 focus:bg-white focus:border-stone-900/20 outline-none transition-all"
              />
            </div>
            <button
              onClick={fetchInventory}
              className="w-10 h-10 bg-stone-50 border border-stone-100 flex items-center justify-center rounded-xl text-stone-400 hover:text-stone-900 transition-all active:scale-95 shrink-0"
              title="Refresh"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          {activeTab === "STOCK" ? (
            <div className="px-10 pb-12 space-y-6">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100">
                      <th className="py-6 pr-6 text-[9px] text-stone-400 font-bold uppercase tracking-[0.2em]">
                        Item & SKU Details
                      </th>
                      <th className="py-6 px-6 text-[9px] text-stone-400 font-bold uppercase tracking-[0.2em]">
                        Asset Class
                      </th>
                      <th className="py-6 px-6 text-[9px] text-stone-400 font-bold uppercase tracking-[0.2em] text-right">
                        Unit Price
                      </th>
                      <th className="py-6 px-6 text-[9px] text-stone-400 font-bold uppercase tracking-[0.2em] text-right">
                        Stock Balances
                      </th>
                      <th className="py-6 pl-6 text-[9px] text-stone-400 font-bold uppercase tracking-[0.2em] text-center">
                        Action Protocol
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100/60">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5}>
                          <Loader
                            text="Syncing inventory ledger..."
                            className="py-32"
                          />
                        </td>
                      </tr>
                    ) : filteredInventory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-32 text-center text-stone-400 font-bold uppercase tracking-[0.2em]"
                          style={{ fontSize: "10px" }}
                        >
                          No items or SKUs found. Click &quot;Register Item&quot; to add.
                        </td>
                      </tr>
                    ) : (
                      filteredInventory.map((item) => {
                        const isMachine =
                          item.type === "MACHINE" || item.item_type === "MACHINE";
                        const freeStock = item.free_stock ?? 0;
                        const allocatedStock = item.allocated_stock ?? item.reserved_qty ?? 0;
                        const physicalStock = item.physical_qty ?? (freeStock + allocatedStock);

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-stone-50/50 transition-colors group"
                          >
                            {/* Item & SKU Details */}
                            <td className="py-6 pr-6">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="px-2 py-0.5 rounded-md bg-stone-100 text-[10px] font-bold font-mono text-stone-800 tracking-[0.1em] border border-stone-200">
                                  {item.item_code}
                                </span>
                                {isMachine && item.bypass_multi_station ? (
                                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                    Bypass Multi-Station
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-base font-bold text-stone-950 uppercase tracking-tight">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-stone-400 mt-1.5 tracking-wide font-medium flex flex-wrap items-center gap-2">
                                {isMachine ? (
                                  <>
                                    <span className="text-blue-700 font-bold">
                                      {item.machine_category || "GENERAL MACHINE"}
                                    </span>
                                    <div className="w-1 h-1 rounded-full bg-stone-300" />
                                    <span>Cap: {item.capacity_per_hour || 0} pcs/hr</span>
                                    {item.serial_number && (
                                      <>
                                        <div className="w-1 h-1 rounded-full bg-stone-300" />
                                        <span>SN: {item.serial_number}</span>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {item.dimension && (
                                      <>
                                        <span>{item.dimension}</span>
                                        <div className="w-1 h-1 rounded-full bg-stone-300" />
                                      </>
                                    )}
                                    <span>{item.spec || "Standard Spec"}</span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Asset Class & Status */}
                            <td className="py-6 px-6">
                              {isMachine ? (
                                <div className="flex flex-col gap-1.5 items-start">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-blue-50 ring-1 ring-blue-200 text-blue-900 tracking-[0.1em] uppercase">
                                    <Cpu className="w-3 h-3 text-blue-700" /> MACHINE
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[8px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider",
                                      item.machine_status === "ASSIGNED"
                                        ? "bg-indigo-100 text-indigo-800"
                                        : item.machine_status === "RUNNING"
                                        ? "bg-purple-100 text-purple-800"
                                        : item.machine_status === "MAINTENANCE"
                                        ? "bg-amber-100 text-amber-800"
                                        : item.machine_status === "BROKEN"
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-emerald-100 text-emerald-800"
                                    )}
                                  >
                                    {item.machine_status || item.operational_status || "AVAILABLE"}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5 items-start">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[9px] font-bold bg-white ring-1 ring-stone-200 text-stone-700 tracking-[0.1em] uppercase">
                                    {item.type || "RAW"}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[8px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider",
                                      freeStock <= 0
                                        ? "bg-stone-100 text-stone-600 border border-stone-200"
                                        : freeStock < 5
                                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    )}
                                  >
                                    {freeStock <= 0
                                      ? "Out of Stock"
                                      : freeStock < 5
                                      ? "Low Stock"
                                      : "In Stock"}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Unit Price */}
                            <td className="py-6 px-6 text-right">
                              <div className="font-mono text-sm font-bold text-stone-900">
                                {formatIDR(item.unit_price || 0)}
                              </div>
                              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider block mt-1">
                                Per {item.uom || "UNIT"}
                              </span>
                            </td>

                            {/* Stock Balances */}
                            <td className="py-6 px-6 text-right">
                              <div className="flex flex-col items-end">
                                <div
                                  className={cn(
                                    "text-xl font-bold font-mono tabular-nums leading-none",
                                    freeStock <= 0 && !isMachine
                                      ? "text-stone-400"
                                      : freeStock < 5 && !isMachine
                                      ? "text-amber-600"
                                      : "text-stone-950"
                                  )}
                                >
                                  {isMachine
                                    ? `${item.capacity_per_hour || 0} / hr`
                                    : freeStock.toLocaleString("id-ID")}
                                </div>
                                <span className="text-[9px] text-stone-400 font-bold uppercase tracking-[0.2em] mt-1.5 leading-none">
                                  {isMachine ? "CAPACITY" : `FREE ${item.uom}`}
                                </span>
                                {!isMachine && (
                                  <div className="text-[9px] text-stone-400 mt-1 font-mono">
                                    Total Phys: {physicalStock.toLocaleString("id-ID")} | Res: {allocatedStock.toLocaleString("id-ID")}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Action Protocol */}
                            <td className="py-6 pl-6 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {/* Print QR Tag */}
                                {isMachine ? (
                                  <Button
                                    size="icon"
                                    variant="secondary"
                                    onClick={() => {
                                      setSelectedMachineForQr(item);
                                      setShowMachineQrModal(true);
                                    }}
                                    title="Print Machine QR Tag"
                                    className="text-stone-700 hover:text-stone-950"
                                  >
                                    <QrCode className="w-4 h-4 text-blue-600" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="icon"
                                    variant="secondary"
                                    onClick={() => {
                                      setSelectedLabelItem(item);
                                      setShowLabelModal(true);
                                    }}
                                    title="Print Barcode / QR Label"
                                    className="text-stone-700 hover:text-stone-950"
                                  >
                                    <QrCode className="w-4 h-4" />
                                  </Button>
                                )}

                                {/* Stock Adjustment Action */}
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  disabled={
                                    !hasPermission(user, Action.WAREHOUSE_ACTION)
                                  }
                                  onClick={() => handleOpenAdjustModal(item)}
                                  title="Adjust Physical Stock Count"
                                  className="text-stone-700 hover:text-stone-950"
                                >
                                  <Sliders className="w-4 h-4 text-stone-800" />
                                </Button>

                                {/* Edit Item Master Data */}
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  disabled={
                                    !hasPermission(user, Action.WAREHOUSE_ACTION)
                                  }
                                  onClick={() => handleOpenEditItem(item)}
                                  title="Edit Item Master Specifications"
                                  className="text-stone-700 hover:text-stone-950"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>

                                {/* Delete Item / SKU Action */}
                                <Button
                                  size="icon"
                                  variant="danger_soft"
                                  disabled={
                                    !hasPermission(user, Action.WAREHOUSE_ACTION)
                                  }
                                  onClick={() =>
                                    handleDeleteItem(item.id, item.item_code)
                                  }
                                  title="Delete Item / SKU"
                                >
                                  <Trash2 className="w-4 h-4 text-rose-600" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === "HISTORY" ? (
            <WarehouseHistoryTab
              movements={movements}
              movementPage={movementPage}
              totalMovements={totalMovements}
              setMovementPage={setMovementPage}
              setSelectedLabelItem={setSelectedLabelItem}
              setShowLabelModal={setShowLabelModal}
              onOpenPoLabel={handleOpenPoLabelFromHistory}
            />
          ) : activeTab === "TERMINAL" ? (
            <WarehouseTerminalTab
              terminalMenu={terminalMenu}
              setTerminalMenu={setTerminalMenu}
              consumeStep={consumeStep}
              setConsumeStep={setConsumeStep}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              handleScanSuccess={handleScanSuccess}
              setIsScannerOpen={setIsScannerOpen}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              consumeQty={consumeQty}
              setConsumeQty={setConsumeQty}
              recordedBy={recordedBy}
              setRecordedBy={setRecordedBy}
              transactionDirection={transactionDirection}
              setTransactionDirection={setTransactionDirection}
              projects={projects}
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
              activeProjectBOM={activeProjectBOM}
              isSubmitting={isSubmitting}
              handleConsume={handleConsume}
              draftDeliveries={draftDeliveries}
              setSelectedDn={setSelectedDn}
              setShowUploadDnModal={setShowUploadDnModal}
              setConfirmModal={setConfirmModal}
              movements={movements}
              inventory={inventory}
            />
          ) : activeTab === "RESERVATIONS" ? (
            <WarehouseReservationsTab reservations={reservations} />
          ) : activeTab === "PENDING" ? (
            <WarehousePendingGrnTab
              pendingGrns={pendingGrns}
              handleReturnGrn={handleReturnGrn}
              handleIntakeGrn={handleIntakeGrn}
            />
          ) : null}
        </div>
      </div>

      {/* PO Intake Labels Modal (Tanpa QR) */}
      <WarehouseIntakeLabelsModal
        isOpen={showItemLabelsModal}
        onClose={() => setShowItemLabelsModal(false)}
        intakeLabels={intakeLabels}
        intakePoNumber={intakePoNumber}
        intakeSupplierName={intakeSupplierName}
        intakeGrnId={intakeGrnId}
        intakeReceivedDate={intakeReceivedDate}
      />

      {/* Register Item Modal */}
      <AddItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        newItem={newItem}
        setNewItem={setNewItem}
        onSubmit={handleAddItem}
        isSubmitting={isSubmitting}
      />

      {/* Edit Item Modal */}
      <EditItemModal
        isOpen={showEditModal && !!itemToEdit}
        onClose={() => {
          setShowEditModal(false);
          setItemToEdit(null);
        }}
        editItem={itemToEdit}
        setEditItem={setItemToEdit}
        onSubmit={handleUpdateItem}
        isSubmitting={isSubmitting}
      />

      {/* Stock Adjustment Modal */}
      <StockAdjustModal
        isOpen={showAdjustModal}
        onClose={() => {
          setShowAdjustModal(false);
          setSelectedItem(null);
        }}
        selectedItem={selectedItem}
        adjustName={adjustName}
        setAdjustName={setAdjustName}
        adjustUom={adjustUom}
        setAdjustUom={setAdjustUom}
        adjustQty={adjustQty}
        setAdjustQty={setAdjustQty}
        adjustReason={adjustReason}
        setAdjustReason={setAdjustReason}
        onSubmit={handleAdjustStock}
        isSubmitting={isSubmitting}
      />

      {/* Item QR Label Modal */}
      <WarehouseLabelModal
        isOpen={showLabelModal}
        onClose={() => setShowLabelModal(false)}
        selectedLabelItem={selectedLabelItem}
      />

      {/* Machine QR Identity Tag Modal */}
      <MachineQrModal
        isOpen={showMachineQrModal}
        onClose={() => setShowMachineQrModal(false)}
        machine={selectedMachineForQr}
      />

      {/* Upload DN Modal */}
      <AuthorizeDocModal
        isOpen={showUploadDnModal && !!selectedDn}
        onClose={() => setShowUploadDnModal(false)}
        docType="Dispatch Logistics Note"
        subtitle="Terminal OPS Dispatch Validation"
        docNumber={selectedDn?.dn_number || ""}
        partnerName={selectedDn?.customer_name}
        projectName={selectedDn?.project_name || "Non-Project"}
        isSubmitting={isUploadingDn}
        onAuthorize={handleUploadDispatch}
      />

      {/* ConfirmModal rendering */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() =>
          setConfirmModal((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {isScannerOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          }
        >
          <ScannerModal
            isOpen={isScannerOpen}
            onScan={(text) => {
              handleScanSuccess(text);
            }}
            onClose={() => setIsScannerOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

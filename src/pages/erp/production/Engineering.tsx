import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn, formatIDR, formatNumberWithDots } from "@/lib/utils";
import { BomRegistrySearchModal } from "@/components/erp/production/modals/BomRegistrySearchModal";
import { ReviseBomModal } from "@/components/erp/production/modals/ReviseBomModal";
import { LoadPresetModal } from "@/components/erp/production/modals/LoadPresetModal";
import { SavePresetModal } from "@/components/erp/production/modals/SavePresetModal";
import {
  Plus,
  X,
  AlertCircle,
  Maximize2,
  Info,
  Wrench,
  Download,
  FileText,
  RotateCcw,
  Package,
  AlertTriangle,
  Search,
  Zap,
  Sparkles,
  BookmarkPlus,
  FolderDown,
  Save,
  Trash2,
  Upload,
  ShieldCheck,
  Clock,
  Eye,
  Send,
  FileEdit,
  Layers,
  Factory,
  Workflow,
  GitBranch,
  ArrowRight,
  CheckCircle2,
  Filter,
  Check,
  ExternalLink,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAutoSave } from "@/hooks/useAutoSave";
import { safeFetchJson, apiFetch } from "@/utils/api";
import { BomPreviewModal } from "@/components/erp/BomPreviewModal";
import { BomMergeDuplicatesModal } from "@/components/erp/BomMergeDuplicatesModal";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { EcoHistoryModal } from "@/components/erp/EcoHistoryModal";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { BomItemRowEditor, BomRow } from "@/components/erp/production/BomItemRowEditor";

export default function Engineering() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramProjectId = searchParams.get("projectId");

  const [projects, setProjects] = useState<any[]>([]);
  const { data: selectedProject, setData: setSelectedProject } =
    useAutoSave<string>("engineering_selected_project", "");

  useEffect(() => {
    if (paramProjectId) {
      setSelectedProject(paramProjectId);
    }
  }, [paramProjectId]);

  const draftKey = selectedProject
    ? `engineering_bom_rows_${selectedProject}`
    : "engineering_bom_rows";
  const {
    data: rows,
    setData: setRows,
    clearDraft,
    isLoaded,
  } = useAutoSave<BomRow[]>(draftKey, [
    {
      id: "1",
      item_code: "",
      name: "",
      dimension: "",
      spec: "",
      qty: "",
      unit: "",
      unit_price: "",
      reference: "",
target_project_id: "",
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT" | "CRITICAL">(
    "NORMAL",
  );
  const { showToast } = useToast();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [projectBomUpdatedAt, setProjectBomUpdatedAt] = useState<string | null>(
    null,
  );
  const [showBomPreview, setShowBomPreview] = useState(false);
  const [quotationItems, setQuotationItems] = useState<any[]>([]);

  // ECO & Auth Modal States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEcoModal, setShowEcoModal] = useState(false);
  const [showConfirmSubmitBomModal, setShowConfirmSubmitBomModal] = useState(false);

  const [showReviseBomModal, setShowReviseBomModal] = useState(false);
  const [reviseNote, setReviseNote] = useState("");

  const handleAuthorizeBom = async (pin: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProject}/boms/authorize`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }, user?.username);
      if (res.ok && res.data?.success) {
        setShowAuthModal(false);
        showToast(
          language === "id"
            ? "BOM berhasil diotorisasi secara sah!"
            : "BOM Authorized successfully!",
          "success"
        );
        fetchProjects();
        apiFetch(`/api/projects/${selectedProject}`, {}, user?.username).then((r) => {
          if (r.ok && r.data?.project) {
            setProjectBomUpdatedAt(r.data.project?.bq_updated_at || null);
            setProjects((prev) =>
              prev.map((p) =>
                p.id === selectedProject ? { ...p, ...r.data.project } : p
              )
            );
            if (r.data.bom && r.data.bom.length > 0) {
              setInitialBom(r.data.bom);
            }
          }
        });
      } else {
        showToast(res.data?.error || res.error || "Failed to authorize BOM", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing BOM", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviseBom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviseNote.trim()) {
      showToast("Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/projects/${selectedProject}/boms/revise`, {
        method: "POST",
        body: JSON.stringify({ note: reviseNote }),
      }, user?.username);
      if (res.ok && res.data?.success) {
        setShowReviseBomModal(false);
        setReviseNote("");
        showToast("BOM marked for revision", "success");
        fetchProjects();
        apiFetch(`/api/projects/${selectedProject}`, {}, user?.username).then((r) => {
          if (r.ok && r.data?.project) {
            setProjects((prev) => prev.map(p => p.id === selectedProject ? {...p, ...r.data.project} : p));
          }
        });
      } else {
        showToast(res.data?.error || res.error || "Failed to revise BOM", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error revising BOM", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [ecoReason, setEcoReason] = useState("");
  const [isManufacturing, setIsManufacturing] = useState(false);

  // Master Warehouse Items & Lookup Cache
  const [warehouseItems, setWarehouseItems] = useState<any[]>([]);
  const searchTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  const fetchWarehouseItems = async () => {
    try {
      const res = await apiFetch("/api/items", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        setWarehouseItems(res.data);
      }
    } catch (err) {
      console.error("Engineering: Failed to fetch warehouse items", err);
    }
  };

  // Historical Development (ECO Log) States
  const [initialBom, setInitialBom] = useState<any[]>([]);
  const [showEcoHistoryModal, setShowEcoHistoryModal] = useState(false);
  const [lastEcoReason, setLastEcoReason] = useState("");
  const [lastEcoAuthorizedAt, setLastEcoAuthorizedAt] = useState("");

  // BOM Presets State
  const [savePresetModal, setSavePresetModal] = useState<{
    isOpen: boolean;
    name: string;
    description: string;
  }>({
    isOpen: false,
    name: "",
    description: "",
  });

  const [showLoadPresetModal, setShowLoadPresetModal] = useState(false);
  const [loadPresetFile, setLoadPresetFile] = useState<File | null>(null);
  const [loadPresetFileName, setLoadPresetFileName] = useState("");

  const handleLoadPresetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadPresetFile) {
      showToast("Please select a preset file", "error");
      return;
    }
    try {
      const text = await loadPresetFile.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.items) && data.items.length > 0) {
        setRows(
          data.items.map((b: any) => ({
            id: Math.random().toString(),
            item_id: b.item_id,
            item_code: b.item_code || "",
            name: b.item_name || b.name || "",
            dimension: b.dimension || "",
            spec: b.spec || "",
            qty: (b.required_qty || b.qty || 1).toString(),
            unit: b.uom || b.unit || "PCS",
            unit_price: (b.unit_price || 0).toString(),
            matrix_unit_price: (b.unit_price || 0).toString(),
            reference: `Preset: ${data.name || "Loaded"}`,
            target_project_id: "",
          }))
        );
        showToast(`BOM Preset loaded successfully!`, "success");
        setShowLoadPresetModal(false);
        setLoadPresetFile(null);
        setLoadPresetFileName("");
      } else {
        showToast("Preset item list is empty or invalid", "info");
      }
    } catch (err) {
      console.error("Failed to load preset:", err);
      showToast("Failed to parse BOM preset file", "error");
    }
  };

  const handleSavePresetConfirm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!savePresetModal.name.trim()) {
      showToast("Preset name is required", "error");
      return;
    }
    const itemsToSave = rows
      .filter((r) => r.item_code || r.name)
      .map((r) => ({
        item_id: r.item_id,
        item_code: r.item_code,
        name: r.name,
        dimension: r.dimension,
        spec: r.spec,
        qty: Number(r.qty) || 1,
        unit: r.unit || "PCS",
        unit_price: Number(r.unit_price) || 0,
        reference: r.reference || "",
        target_project_id: r.target_project_id || "",
      }));

    if (itemsToSave.length === 0) {
      showToast("Cannot save empty BOM as preset", "error");
      return;
    }

    try {
      const dataStr = JSON.stringify({
        name: savePresetModal.name.trim(),
        description: savePresetModal.description.trim(),
        items: itemsToSave,
      }, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${savePresetModal.name.trim().replace(/\s+/g, '_')}_Preset.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`BOM Preset "${savePresetModal.name}" downloaded!`, "success");
      setSavePresetModal({ isOpen: false, name: "", description: "" });
    } catch (err) {
      console.error("Failed to save preset", err);
      showToast("Failed to save BOM preset", "error");
    }
  };

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

  const [showMergeModal, setShowMergeModal] = useState(false);

  const isEngineering =
    hasPermission(user, Action.MANAGE_BOM) ||
    user?.role === "ENGINEERING" ||
    user?.role === "FC" ||
    user?.role === "PRODUCTION" ||
    user?.level === "MANAGER" ||
    hasGodMode(user);

  const loadFromQuotation = () => {
    if (quotationItems.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: language === "id" ? "Impor dr Penawaran" : "Import from Quotation",
      message:
        language === "id"
          ? "Mekanisme ini akan menggantikan rancangan BOM saat ini dengan item deliverables dari Quotation."
          : "This will replace your current BOM draft with the approved deliverables and quantities from the referenced Customer Quotation. Proceed?",
      action: () => {
        setRows(
          quotationItems.map((itm: any) => ({
            id: Math.random().toString(),
            item_id: "",
            item_code: `COMP-${itm.id.slice(-5).toUpperCase()}`,
            name: itm.title || "",
            dimension: "",
            spec: itm.remarks || "",
            qty: (itm.qty || 1).toString(),
            unit: itm.uom || "PCS",
            unit_price: (itm.unit_price || 0).toString(),
            matrix_unit_price: (itm.unit_price || 0).toString(),
            reference: "Quotation Ref",
          })),
        );
        showToast(
          language === "id"
            ? "Deliverables berhasil diimpor"
            : "Successfully imported quotation lines into BOM",
          "success",
        );
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const fetchProjects = async () => {
    try {
      const res = await apiFetch("/api/projects", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        setProjects(res.data);
      }
    } catch (err) {
      console.error("Engineering: Failed to fetch projects", err);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchWarehouseItems();
  }, []);

  // Auto-enrich rows with warehouse item details whenever warehouseItems are available or updated
  useEffect(() => {
    if (warehouseItems.length === 0 || rows.length === 0) return;
    setRows((prevRows) => {
      let hasChanges = false;
      const updated = prevRows.map((r) => {
        if (!r.item_code || r.item_code.trim() === "") return r;
        const cleanCode = r.item_code.trim().toUpperCase();
        const matched = warehouseItems.find(
          (i) => i.item_code && i.item_code.trim().toUpperCase() === cleanCode
        );
        if (matched) {
          const newName = r.name || matched.name || "";
          const newDim = r.dimension || matched.dimension || "";
          const newSpec = r.spec || matched.spec || "";
          const newUnit = r.unit || matched.uom || "PCS";
          const newPrice = r.unit_price && r.unit_price !== "0" ? r.unit_price : (matched.unit_price || 0).toString();

          if (
            r.item_id !== matched.id ||
            r.name !== newName ||
            r.dimension !== newDim ||
            r.spec !== newSpec ||
            r.notFound
          ) {
            hasChanges = true;
            return {
              ...r,
              item_id: matched.id,
              name: newName,
              dimension: newDim,
              spec: newSpec,
              unit: newUnit,
              unit_price: newPrice,
              matrix_unit_price: (matched.unit_price || 0).toString(),
              free_stock: matched.free_stock || 0,
              notFound: false,
            };
          }
        }
        return r;
      });
      return hasChanges ? updated : prevRows;
    });
  }, [warehouseItems]);

  useEffect(() => {
    if (!isLoaded) return;
    setQuotationItems([]);

    if (selectedProject) {
      // Check if current rows are just the default empty state
      const isDefault =
        rows.length === 1 && !rows[0].item_code && !rows[0].item_id;

      apiFetch(`/api/projects/${selectedProject}`, {}, user?.username)
        .then((res) => {
          const data = res.data;
          if (data) {
            setProjectBomUpdatedAt(data.project?.bq_updated_at || null);
            setQuotationItems(data.quotation_items || []);
            if (data.project) {
              setProjects((prev) =>
                prev.map((p) =>
                  p.id === selectedProject ? { ...p, ...data.project } : p
                )
              );
            }
            if (data.bom && data.bom.length > 0) {
              setInitialBom(data.bom);
            }
            
            const hasActiveWorkOrders = data.work_orders?.length > 0;
            const hasStartedTasks = data.tasks?.some((t: any) => t.progress > 0);
            setIsManufacturing(hasActiveWorkOrders || hasStartedTasks);

            // Only overwrite rows if they are the default empty state
            // This preserves unsaved drafts in local storage
            if (isDefault) {
              if (data.bom && data.bom.length > 0) {
                setRows(
                  data.bom.map((b: any) => ({
                    id: Math.random().toString(),
                    item_id: b.item_id,
                    item_code: b.item_code,
                    name: b.name || b.item_name,
                    dimension: b.dimension || "",
                    spec: b.spec || "",
                    qty: b.required_qty.toString(),
                    unit: b.uom || "",
                    unit_price: (b.unit_price || 0).toString(),
                    matrix_unit_price: (
                      b.matrix_unit_price ||
                      b.unit_price ||
                      0
                    ).toString(),
                    reference: b.reference || "",
target_project_id: b.target_project_id || "",

                    pr_numbers: b.pr_numbers,
                    total_pr_qty: b.total_pr_qty,
                    free_stock: b.free_stock || 0,
                  })),
                );
              } else {
                setRows([
                  {
                    id: "1",
                    item_code: "",
                    name: "",
                    dimension: "",
                    spec: "",
                    qty: "",
                    unit: "",
                    unit_price: "",
                    reference: "",
target_project_id: "",
                  },
                ]);
              }
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load project BOM", err);
          showToast("Failed to load project BOM", "error");
        });
    } else {
      // If no project selected, check if we need to reset to default or keep generic draft
      const isDefault =
        rows.length === 1 && !rows[0].item_code && !rows[0].item_id;
      if (isDefault) {
        setRows([
          {
            id: "1",
            item_code: "",
            name: "",
            dimension: "",
            spec: "",
            qty: "",
            unit: "",
            unit_price: "",
            reference: "",
target_project_id: "",
          },
        ]);
      }
    }
  }, [selectedProject, isLoaded]);

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: Math.random().toString(),
        item_code: "",
        name: "",
        dimension: "",
        spec: "",
        qty: "",
        unit: "",
        unit_price: "",
        reference: "",
target_project_id: "",
      },
    ]);
  };

  const removeRow = useCallback((id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Remove BOM Item?",
      message: "Are you sure you want to remove this item from the BOM?",
      action: () => {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, [setRows]);

  const hasDuplicateItems = React.useMemo(() => {
    const codes = rows.map((r) => r.item_code?.trim().toUpperCase()).filter((c) => !!c);
    return new Set(codes).size !== codes.length;
  }, [rows]);

  const handleMergeItems = () => {
    setShowMergeModal(true);
  };

  const updateRow = useCallback((id: string, field: keyof BomRow, value: string) => {
    const val = field === "item_code" ? value.toUpperCase() : value;

    if (field !== "item_code") {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
      return;
    }

    const cleanCode = val.trim().toUpperCase();

    // Clear any pending timer for this row
    if (searchTimerRef.current[id]) {
      clearTimeout(searchTimerRef.current[id]);
      delete searchTimerRef.current[id];
    }

    // 1. Instant local match against preloaded warehouse items
    const matchedItem = warehouseItems.find(
      (i) => i.item_code && i.item_code.trim().toUpperCase() === cleanCode
    );

    if (matchedItem) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                item_code: val,
                item_id: matchedItem.id,
                name: matchedItem.name,
                dimension: matchedItem.dimension || "",
                spec: matchedItem.spec || "",
                unit: matchedItem.uom || "PCS",
                unit_price: (matchedItem.unit_price || 0).toString(),
                matrix_unit_price: (matchedItem.unit_price || 0).toString(),
                free_stock: matchedItem.free_stock || 0,
                notFound: false,
              }
            : r
        )
      );
      return;
    }

    // 2. If no instant match, set typed item_code with reset item_id
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              item_code: val,
              item_id: undefined,
              notFound: false,
            }
          : r
      )
    );

    if (cleanCode.length < 2) return;

    // 3. Debounced network fallback query
    searchTimerRef.current[id] = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/api/items/code/${encodeURIComponent(cleanCode)}`,
          {},
          user?.username,
        );
        if (res.ok && res.data?.id) {
          const item = res.data;
          setWarehouseItems((prev) => {
            if (!prev.some((x) => x.id === item.id)) return [...prev, item];
            return prev;
          });

          setRows((prev) =>
            prev.map((r) => {
              if (r.id === id && r.item_code.trim().toUpperCase() === cleanCode) {
                return {
                  ...r,
                  item_id: item.id,
                  name: item.name,
                  dimension: item.dimension || "",
                  spec: item.spec || "",
                  unit: item.uom || "PCS",
                  unit_price: (item.unit_price || 0).toString(),
                  matrix_unit_price: (item.unit_price || 0).toString(),
                  free_stock: item.free_stock || 0,
                  notFound: false,
                };
              }
              return r;
            })
          );
        } else {
          setRows((prev) =>
            prev.map((r) => {
              if (r.id === id && r.item_code.trim().toUpperCase() === cleanCode) {
                return { ...r, notFound: true };
              }
              return r;
            })
          );
        }
      } catch (err) {
        console.error(err);
      }
    }, 300);
  }, [warehouseItems, user?.username, setRows]);

  const handleSyncBom = async (pin?: string, reason?: string, isDraft?: boolean): Promise<boolean> => {
    if (!selectedProject) {
      showToast("Please select a project first.", "error");
      return false;
    }
    const validRows = rows.filter((r) => r.item_code && r.qty);
    if (validRows.length === 0) {
      showToast(
        "Please enter at least one valid item code and quantity.",
        "error",
      );
      return false;
    }

    setIsSubmitting(true);
    try {
      const payload = { is_draft: !!isDraft,
        urgency,
        auth_pin: pin,
        eco_reason: reason,
        items: validRows.map((r) => ({
          item_id: r.item_id || null,
          item_code: r.item_code,
          name: r.name,
          dimension: r.dimension,
          spec: r.spec,
          uom: r.unit || r.uom || "pcs",
          required_qty: Number(r.qty),
          unit_price: Number(r.unit_price || 0),
          reference: r.reference,
          target_project_id: r.target_project_id,

          is_new: !r.item_id,
        })),
      };
      const res = await apiFetch(
        `/api/projects/${selectedProject}/boms/sync`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        user?.username,
      );

      if (res.ok && res.data?.success) {
        clearDraft(false); // Clear draft without resetting data from UI

        if (res.data.is_eco || reason) {
          const ecoNum = res.data.eco_number || `ECO-${selectedProject}`;
          showToast(
            language === "id"
              ? `Revisi ECO (${ecoNum}) berhasil diotorisasi & disimpan!`
              : `ECO Revision (${ecoNum}) successfully authorized & committed!`,
            "success"
          );
          setLastEcoReason(reason || "BOM Technical Revision & Material Re-allocation");
          setLastEcoAuthorizedAt(new Date().toISOString());
          setShowEcoHistoryModal(true);
        } else if (res.data.bom_status === "PENDING") {
          showToast(
            language === "id"
              ? "BOM berhasil diajukan untuk otorisasi!"
              : "BOM submitted for approval successfully!",
            "success"
          );
        } else if (isDraft) {
          showToast(
            language === "id"
              ? "Draft BOM berhasil disimpan."
              : "BOM draft saved successfully.",
            "success"
          );
        } else {
          showToast("BOM successfully saved/updated!", "success");
        }

        // Refresh project data and latest committed BOM
        fetchProjects();
        fetchBopSteps(selectedProject);
        apiFetch(`/api/projects/${selectedProject}`, {}, user?.username).then(
          (r) => {
            if (r.ok && r.data?.project) {
              setProjectBomUpdatedAt(r.data.project?.bq_updated_at || null);
              setProjects((prev) =>
                prev.map((p) =>
                  p.id === selectedProject ? { ...p, ...r.data.project } : p
                )
              );
              if (r.data.bom && r.data.bom.length > 0) {
                setInitialBom(r.data.bom);
              }
            }
          },
        );
        return true;
      } else {
        if (res.data?.require_eco) {
          setShowEcoModal(true);
        }
        showToast(res.data?.error || res.error || "Failed to save BOM", "error");
        return false;
      }
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes("ECO requires a valid PIN")) {
        setShowEcoModal(true);
      } else {
        showToast(err.message || "Failed to save BOM", "error");
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // BoP Steps & Material Absorption States
  const [bopSteps, setBopSteps] = useState<any[]>([]);
  const [isLoadingBop, setIsLoadingBop] = useState(false);
  const [filterUnassignedOnly, setFilterUnassignedOnly] = useState(false);

  const fetchBopSteps = useCallback(async (projId: string) => {
    if (!projId || ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"].includes(projId.toUpperCase())) {
      setBopSteps([]);
      return;
    }
    try {
      setIsLoadingBop(true);
      const res = await apiFetch(`/api/production/bop?project_id=${projId}`, {}, user?.username);
      const rawData = res.ok ? (res.data || res) : (Array.isArray(res) ? res : []);
      const steps = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.data) ? rawData.data : []);
      setBopSteps(steps);
    } catch (err) {
      console.error("Failed to fetch BOP steps for BOQ absorption analysis", err);
      setBopSteps([]);
    } finally {
      setIsLoadingBop(false);
    }
  }, [user?.username]);

  useEffect(() => {
    if (selectedProject) {
      fetchBopSteps(selectedProject);
    } else {
      setBopSteps([]);
    }
  }, [selectedProject, fetchBopSteps]);

  // Compute Product Node Allocation Info for a BOM Row
  const getRowBopAllocationInfo = useCallback((row: BomRow) => {
    if (!bopSteps || bopSteps.length === 0) {
      return {
        isAssigned: false,
        isFullyAssigned: false,
        isPartiallyAssigned: false,
        allocatedFraction: 0,
        allocatedPercentage: 0,
        assignedNodes: [] as {
          stepId: string;
          stepSeq: number;
          processName: string;
          fraction: number;
          workCenterName?: string;
        }[],
      };
    }

    const assignedNodes: {
      stepId: string;
      stepSeq: number;
      processName: string;
      fraction: number;
      workCenterName?: string;
    }[] = [];

    let totalFraction = 0;

    bopSteps.forEach((step) => {
      if (step.node_type === "PRODUCT" && step.bom_allocations) {
        let allocs: any[] = [];
        try {
          allocs = typeof step.bom_allocations === "string" ? JSON.parse(step.bom_allocations) : (step.bom_allocations || []);
        } catch (e) {
          allocs = [];
        }

        allocs.forEach((alloc) => {
          let isMatch = false;

          if (alloc.bom_id && (alloc.bom_id === row.id || alloc.bom_id === row.item_id)) {
            isMatch = true;
          }

          if (!isMatch && initialBom && initialBom.length > 0) {
            const matchedInitial = initialBom.find((b: any) => b.id === alloc.bom_id);
            if (matchedInitial) {
              if (
                (row.item_code && matchedInitial.item_code && row.item_code.toUpperCase() === matchedInitial.item_code.toUpperCase()) ||
                (row.item_id && matchedInitial.item_id && row.item_id === matchedInitial.item_id) ||
                (row.name && (matchedInitial.name || matchedInitial.item_name) && row.name.toLowerCase() === (matchedInitial.name || matchedInitial.item_name).toLowerCase())
              ) {
                isMatch = true;
              }
            }
          }

          if (!isMatch && alloc.bom_name && row.name) {
            if (alloc.bom_name.toLowerCase().trim() === row.name.toLowerCase().trim()) {
              isMatch = true;
            }
          }

          if (!isMatch && alloc.bom_id && row.item_code) {
            if (alloc.bom_id.toUpperCase() === row.item_code.toUpperCase()) {
              isMatch = true;
            }
          }

          if (isMatch) {
            const totalRowQty = Number(row.qty || (row as any).required_qty || 0);
            const frac = alloc.qty !== undefined && totalRowQty > 0 ? Number(alloc.qty) / totalRowQty : (Number(alloc.fraction) || 1.0);
            totalFraction += frac;
            assignedNodes.push({
              stepId: step.id,
              stepSeq: step.step_sequence || 0,
              processName: step.process_name || "Product Node",
              fraction: frac,
              workCenterName: step.work_center_name || step.work_center_id,
            });
          }
        });
      }
    });

    const clampedFraction = Math.min(1, Math.max(0, totalFraction));
    const allocatedPercentage = Math.round(clampedFraction * 100);
    const isAssigned = assignedNodes.length > 0 && clampedFraction > 0;
    const isFullyAssigned = clampedFraction >= 0.99;
    const isPartiallyAssigned = isAssigned && !isFullyAssigned;

    return {
      isAssigned,
      isFullyAssigned,
      isPartiallyAssigned,
      allocatedFraction: clampedFraction,
      allocatedPercentage,
      assignedNodes,
    };
  }, [bopSteps, initialBom]);

  // Overall BOQ Absorption Summary across all BOM Rows
  const absorptionSummary = useMemo(() => {
    const validRows = rows.filter((r) => r.item_code && r.item_code.trim() !== "");
    let unassignedCount = 0;
    let partialCount = 0;
    let fullyAssignedCount = 0;

    validRows.forEach((r) => {
      const info = getRowBopAllocationInfo(r);
      if (!info.isAssigned) {
        unassignedCount++;
      } else if (info.isPartiallyAssigned) {
        partialCount++;
      } else {
        fullyAssignedCount++;
      }
    });

    const totalValid = validRows.length;
    const absorptionRate = totalValid > 0 ? Math.round(((totalValid - unassignedCount) / totalValid) * 100) : 100;
    const productNodesCount = bopSteps.filter((s) => s.node_type === "PRODUCT").length;

    return {
      totalValid,
      unassignedCount,
      partialCount,
      fullyAssignedCount,
      absorptionRate,
      productNodesCount,
      hasUnassigned: unassignedCount > 0,
    };
  }, [rows, getRowBopAllocationInfo, bopSteps]);

  const displayRows = rows;

  const summary = useMemo(() => {
    let stocked = 0;
    let pending = 0;
    let critical = 0;
    let totalItems = 0;
    let totalCost = 0;

    rows.forEach((r) => {
      const itemCode = r.item_code?.trim();
      if (!itemCode) return;

      totalItems++;
      const needed = Number(r.qty) || 0;
      const onHand = r.free_stock || 0;
      const inPR = r.total_pr_qty || 0;
      const cost = needed * (Number(r.unit_price) || 0);
      totalCost += cost;

      if (r.notFound) {
        critical++;
      } else if (onHand >= needed) {
        stocked++;
      } else if (onHand + inPR >= needed) {
        pending++;
      } else {
        critical++;
      }
    });

    const readiness =
      totalItems > 0 ? Math.round((stocked / totalItems) * 100) : 0;
    return { stocked, pending, critical, totalItems, totalCost, readiness };
  }, [rows]);

  const currentProject = projects.find((p) => p.id === selectedProject);

  const [searchModal, setSearchModal] = useState<{
    isOpen: boolean;
    rowId: string | null;
  }>({ isOpen: false, rowId: null });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch(
          `/api/items/search?q=${encodeURIComponent(searchTerm)}`,
          {},
          user?.username,
        );
        if (Array.isArray(res)) setSearchResults(res);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const selectItemFromSearch = (item: any) => {
    if (!searchModal.rowId) return;
    setRows(
      rows.map((r) =>
        r.id === searchModal.rowId
          ? {
              ...r,
              item_id: item.id,
              item_code: item.item_code,
              name: item.name,
              dimension: item.dimension || "",
              spec: item.spec || "",
              unit: item.uom || "",
              unit_price: (item.unit_price || 0).toString(),
              matrix_unit_price: (item.unit_price || 0).toString(),
              free_stock: item.free_stock || 0,
              notFound: false,
            }
          : r,
      ),
    );
    setSearchModal({ isOpen: false, rowId: null });
    setSearchTerm("");
  };

  const syncAllPricesWithMatrix = () => {
    const outOfSyncCount = rows.filter(
      (r) =>
        r.item_id &&
        r.matrix_unit_price &&
        r.unit_price !== r.matrix_unit_price,
    ).length;
    if (outOfSyncCount === 0) {
      showToast(
        "All prices are already synchronized with the pricing matrix.",
        "info",
      );
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Sync with Pricing Matrix?",
      message: `Syncing will update ${outOfSyncCount} items to their latest market prices. This will refresh your total cost estimate. Proceed?`,
      action: async () => {
        const updated = rows.map((r) =>
          r.matrix_unit_price ? { ...r, unit_price: r.matrix_unit_price } : r,
        );
        setRows(updated);
        
        if (selectedProject) {
          try {
            await apiFetch(
              `/api/projects/${selectedProject}/boms/sync-matrix`,
              { method: "POST" },
              user?.username,
            );
          } catch (e) {
            console.error("Error syncing BOM matrix prices to database", e);
          }
        }

        showToast("BOM prices updated & saved to latest matrix rates.", "success");
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleManualSaveDraft = () => {
    // useAutoSave handles persistence automatically
    setRows([...rows]);
    handleSyncBom(undefined, undefined, true);
  };

  const resetFromServer = () => {
    if (!selectedProject) return;
    setConfirmModal({
      isOpen: true,
      title: "Discard Draft?",
      message:
        "This will discard your current unsaved changes and reload the official BOM from the server. Proceed?",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/projects/${selectedProject}`,
            {},
            user?.username,
          );
          const data = res.data;
          if (data && data.bom) {
            setRows(
              data.bom.map((b: any) => ({
                id: Math.random().toString(),
                item_id: b.item_id,
                item_code: b.item_code,
                name: b.name || b.item_name,
                dimension: b.dimension || "",
                spec: b.spec || "",
                qty: b.required_qty.toString(),
                unit: b.uom || "",
                unit_price: (b.unit_price || 0).toString(),
                matrix_unit_price: (
                  b.matrix_unit_price ||
                  b.unit_price ||
                  0
                ).toString(),
                reference: b.reference || "",
target_project_id: b.target_project_id || "",
                pr_numbers: b.pr_numbers,
                total_pr_qty: b.total_pr_qty,
                free_stock: b.free_stock || 0,
              })),
            );
            showToast("Reloaded from server.", "info");
          }
        } catch (err) {
          showToast("Failed to reload", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const isCategoryProject = ["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(selectedProject);

  return (
    <div className="space-y-8 pb-20">
      <PageHeader
        title={language === "id" ? "Daftar Material (BOM)" : "Bill of Materials (BOM)"}
        subtitle={
          language === "id"
            ? "Formula produk dan komponen material"
            : "Product formulas and material components"
        }
        icon={<Layers className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            {projectBomUpdatedAt && (
              <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider px-2">
                {language === "id" ? "Update Terakhir:" : "Last Sync:"}{" "}
                {new Date(projectBomUpdatedAt).toLocaleString(
                  language === "id" ? "id-ID" : "en-US",
                  { timeZone: "Asia/Jakarta" },
                )}
              </div>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-12 relative">
        <div className="xl:col-span-3 space-y-8">
          {/* Primary Controls */}
          <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm flex items-center justify-between gap-8 transition-all">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-3">
                Active Project Engineering Instance
              </label>
              <Select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full border border-stone-200 bg-stone-50/30 rounded-2xl pr-6 py-3.5 text-sm font-bold text-stone-950 focus:ring-4 focus:ring-stone-900/5 focus:border-stone-900 focus:bg-white outline-none transition-all cursor-pointer appearance-none uppercase tracking-tight shadow-sm group-hover:bg-stone-50"
                icon={<Wrench className="w-4 h-4" />}
              >
                <option value="">-- UNASSIGNED --</option>
                {projects
                  .filter(
                    (p) =>
                      p.status === "ACTIVE" ||
                      p.status === "HOLD" ||
                      p.status === "FINISHED",
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} - {p.name}
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          {selectedProject &&
            currentProject &&
            !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(currentProject.id) && (
              <div className="space-y-4">
                <div className="bg-white border border-stone-200 rounded-3xl p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 divide-y xl:divide-y-0 xl:divide-x divide-stone-100 shadow-2xs">
                  {/* SYSTEM IDENTITY */}
                  <div className="flex flex-col justify-between pb-6 md:pb-8 xl:pb-0 xl:pr-6">
                    <div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-stone-400" />
                        System Identity
                      </div>
                      <div className="text-xl font-bold tracking-tight text-stone-900 leading-none">
                        {currentProject.id}
                      </div>
                      <div className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider mt-2 leading-relaxed">
                        {currentProject.name}
                      </div>
                    </div>
                  </div>

                  {/* CONTROL PHASE */}
                  <div className="flex flex-col justify-start pt-6 md:pt-0 md:pl-6 pb-6 md:pb-8 xl:pb-0 xl:px-6">
                    <div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-4">
                        Phase Control
                      </div>
                      <div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 px-3.5 py-1.5 text-[9px] font-bold rounded-full uppercase tracking-widest border",
                            currentProject.status === "DRAFT"
                              ? "border-amber-200 text-amber-700 bg-amber-50/40"
                              : currentProject.status === "CLOSED"
                                ? "border-stone-200 text-stone-500 bg-stone-50"
                                : "border-emerald-250 text-emerald-700 bg-emerald-50/20",
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              currentProject.status === "DRAFT"
                                ? "bg-amber-400"
                                : currentProject.status === "CLOSED"
                                  ? "bg-stone-400"
                                  : "bg-emerald-500",
                            )}
                          />
                          {currentProject.status} CONTROL
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* REAL-TIME BUDGET */}
                  <div className="flex flex-col justify-start pt-6 xl:pt-0 pb-6 md:pb-0 xl:px-6">
                    <div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-3">
                        Real-time Budget
                      </div>
                      <div className="text-xl font-bold text-stone-900 tracking-tight">
                        {formatIDR(summary.totalCost)}
                      </div>
                      <div className="text-[10px] text-stone-500 font-medium mt-2 uppercase tracking-wider">
                        Total Sourced Cost
                      </div>
                    </div>
                  </div>

                  {/* MATERIAL READINESS */}
                  <div className="flex flex-col justify-start pt-6 xl:pt-0 xl:px-6">
                    <div>
                      <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-3">
                        Material Readiness
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-stone-900">
                          {summary.readiness}%
                        </span>
                        <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                          Stocked
                        </span>
                      </div>
                      <div className="w-full h-2 bg-stone-100 border border-stone-200/55 rounded-full mt-3 overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all duration-1000 ease-out",
                            summary.readiness === 100
                              ? "bg-emerald-500"
                              : "bg-stone-800",
                          )}
                          style={{ width: `${summary.readiness}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          <div className="border border-stone-200 rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-stone-100/50 px-6 py-3.5 border-b border-stone-200 gap-3">
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-stone-500" />
                <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Material Components ({rows.length})
                </h3>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {hasDuplicateItems && (
                  <Button
                    onClick={handleMergeItems}
                    disabled={!isEngineering}
                    variant="secondary"
                    className="text-[10px] uppercase font-extrabold py-1.5 px-3 rounded-lg gap-1.5 shrink-0 border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 tracking-wider shadow-sm"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Merge Duplicates
                  </Button>
                )}
                
                <Button
                  onClick={() => setShowLoadPresetModal(true)}
                  disabled={!isEngineering}
                  variant="secondary"
                  className="text-xs font-bold py-1.5 px-3 rounded-lg gap-1.5 shrink-0"
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  Load Preset
                </Button>

                {/* Save Preset Button */}
                <Button
                  onClick={() =>
                    setSavePresetModal({
                      isOpen: true,
                      name: selectedProject
                        ? `Preset Proyek ${selectedProject}`
                        : "Preset Standard Final BOM",
                      description: "",
                    })
                  }
                  disabled={!isEngineering || rows.length === 0}
                  className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold py-1.5 px-3 rounded-lg gap-1.5 shrink-0 shadow-3xs"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  Save Preset
                </Button>
              </div>
            </div>

            <datalist id="warehouse-item-codes-datalist">
              {warehouseItems.map((item) => (
                <option key={item.id} value={item.item_code}>
                  {item.name} {item.dimension ? `(${item.dimension})` : ""} {item.spec ? `[${item.spec}]` : ""}
                </option>
              ))}
            </datalist>

            <div className="divide-y divide-stone-100">
              {displayRows.map((row, index) => (
                <BomItemRowEditor
                  key={row.id}
                  row={row}
                  index={index}
                  isEngineering={isEngineering}
                  isCategoryProject={isCategoryProject}
                  projects={projects}
                  updateRow={updateRow}
                  removeRow={removeRow}
                  onOpenSearchModal={(rowId) => setSearchModal({ isOpen: true, rowId })}
                />
              ))}
            </div>

            <div className="px-6 py-4 bg-stone-50 border-t border-stone-200">
              <Button
                disabled={!isEngineering}
                onClick={addRow}
                variant="secondary"
                className="w-full flex items-center justify-center gap-2 py-3 text-xs uppercase"
              >
                <Plus className="w-4 h-4" /> Add Component
              </Button>
            </div>
          </div>
        </div>

        {/* Global Summary Column (Desktop Sticky) */}
        <div className="space-y-6">
          <div className="xl:sticky xl:top-6 space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">
                  BOM Authorization & Status
                </h4>
                
                {/* Simplified Status Badge matching Quotation Style */}
                <div className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Status</span>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border",
                    currentProject?.bom_status === "AUTHORIZED"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : currentProject?.bom_status === "PENDING"
                        ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                        : currentProject?.bom_status === "REVISION"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-stone-50 text-stone-600 border-stone-200"
                  )}>
                    {currentProject?.bom_status || "DRAFT"}
                  </span>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                    Readiness
                  </span>
                  <span className="text-xl font-bold text-stone-900">
                    {summary.readiness}%
                  </span>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-2">
                  Budget
                </label>
                <div className="text-lg font-bold text-stone-900">
                  {formatIDR(summary.totalCost)}
                </div>
              </div>

              
              <div className="pt-6 border-t border-stone-100 space-y-3">
                {currentProject?.bom_status === "REVISION" && currentProject?.bom_revision_note && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700">
                    <div className="font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Revision Note:</div>
                    <div className="italic font-medium">"{currentProject.bom_revision_note}"</div>
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={handleManualSaveDraft}
                  disabled={!isEngineering}
                  className="w-full h-11 px-4 mb-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  <Save className="w-4 h-4 text-stone-500" />
                  <span>SAVE DRAFT</span>
                </button>
                
                {(() => {
                  const rawStatus = (currentProject?.bom_status || "DRAFT").toUpperCase();
                  const isPending = rawStatus === "PENDING" || rawStatus === "SUBMITTED" || rawStatus === "PENDING_APPROVAL" || rawStatus === "IN_REVIEW";
                  const isAuthorized = rawStatus === "AUTHORIZED" || rawStatus === "APPROVED";

                  if (isPending) {
                    return (
                      <div className="space-y-2 w-full">
                        <button
                          type="button"
                          onClick={() => setShowAuthModal(true)}
                          disabled={isSubmitting}
                          className="w-full h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                        >
                          <ShieldCheck className="w-4 h-4 text-emerald-100" />
                          <span>AUTHORIZE BOM</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReviseBomModal(true)}
                          disabled={isSubmitting}
                          className="w-full h-11 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                        >
                          <FileEdit className="w-4 h-4 text-rose-600" />
                          <span>REVISION REQUEST</span>
                        </button>
                      </div>
                    );
                  }

                  if (isAuthorized) {
                    return (
                      <button
                        type="button"
                        onClick={() => setShowEcoModal(true)}
                        disabled={
                          isSubmitting ||
                          rows.some(
                            (r) =>
                              r.notFound ||
                              (r.item_code && r.item_code.trim() === ""),
                          ) ||
                          !isEngineering
                        }
                        className="w-full h-11 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4 text-amber-100" />
                        <span>REVISE (ECO)</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => setShowConfirmSubmitBomModal(true)}
                      disabled={isSubmitting || rows.some(r => r.notFound || (r.item_code && r.item_code.trim() === "")) || !isEngineering}
                      className="w-full h-11 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <Clock className="w-4 h-4 animate-spin text-stone-400" />
                      ) : (
                        <Send className="w-4 h-4 text-stone-300" />
                      )}
                      <span>{isSubmitting ? "SUBMITTING..." : "SUBMIT APPROVAL"}</span>
                    </button>
                  );
                })()}

                <div className="flex flex-col gap-2 pt-2">

                  <button
                    onClick={() => setShowBomPreview(true)}
                    className="text-[10px] text-stone-500 font-bold uppercase tracking-widest hover:text-stone-900 transition-colors flex items-center justify-center gap-2 py-2 border border-stone-200 bg-stone-50 hover:bg-stone-100 rounded-lg"
                  >
                    <FileText className="w-3.5 h-3.5 text-stone-500" /> Export PDF
                  </button>

                  <button
                    onClick={() => setShowEcoHistoryModal(true)}
                    className="text-[10px] text-amber-800 font-bold uppercase tracking-widest hover:text-amber-950 transition-colors flex items-center justify-center gap-2 py-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-600" /> ECO History
                  </button>

                  {selectedProject &&
                    rows.length > 0 &&
                    rows.some((r) => r.item_code) && (
                      <button
                        onClick={resetFromServer}
                        className="text-[9px] text-stone-400 font-bold uppercase tracking-widest hover:text-rose-600 transition-colors flex items-center justify-center gap-2 py-1.5 opacity-60 hover:opacity-100"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset Server
                      </button>
                    )}
                </div>

                {rows.some(
                  (r) =>
                    r.item_id &&
                    r.matrix_unit_price &&
                    r.unit_price !== r.matrix_unit_price,
                ) && (
                  <Button
                    onClick={syncAllPricesWithMatrix}
                    variant="secondary"
                    className="w-full border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 uppercase text-[10px] tracking-widest font-bold flex items-center justify-center gap-2 py-3"
                  >
                    Sync Pricing Matrix
                  </Button>
                )}
                {rows.some((r) => r.notFound) && (
                  <p className="mt-3 text-center text-[10px] text-rose-500 font-bold uppercase">
                    UNRESOLVED SKU DETECTED
                  </p>
                )}
              </div>
            </div>

            <div className="bg-stone-100 text-stone-600 rounded-2xl p-6 flex items-start gap-4 border border-stone-200">
              <div className="w-10 h-10 bg-stone-200 rounded-xl flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-stone-500" />
              </div>
              <p className="text-xs font-medium leading-relaxed uppercase tracking-tight">
                Engineering master data is synchronized upon{" "}
                <span className="text-stone-900 font-semibold">COMMIT</span>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Merge Duplicate BOM Items Modal */}
      <BomMergeDuplicatesModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        rows={rows}
        onApply={(mergedRows) => {
          setRows(mergedRows);
          showToast("Duplicate items merged successfully.", "success");
        }}
      />

      {/* Item Search Modal */}
      <BomRegistrySearchModal
        isOpen={searchModal.isOpen}
        onClose={() => setSearchModal({ isOpen: false, rowId: null })}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isSearching={isSearching}
        searchResults={searchResults}
        selectItemFromSearch={selectItemFromSearch}
      />
      {/* Initial BOM Commit Auth Modal */}
      <AuthorizeDocModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        docType="Bill of Materials (BOM)"
        docNumber={selectedProject || "PRJ-0001"}
        subtitle="OFFICIAL BOM AUTHORIZATION & LOCK"
        status={currentProject?.bom_status || "PENDING"}
        partnerLabel="Project Name"
        partnerName={currentProject?.name || selectedProject || "Project BOM"}
        amount={summary.totalCost}
        isSubmitting={isSubmitting}
        submitLabel="Authorize BOM"
        submitVariant="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
        themeVariant="emerald"
        approvalTitle="Otorisasi Bill of Materials (BOM)"
        approvalDescription="Masukkan Daily Internal Auth Key akun anda (dapat dilihat pada panel aktivitas & notifikasi di header) untuk menyetujui penerbitan sah Bill of Materials ini ke dalam sistem produksi."
        onAuthorize={async (pin) => {
          await handleAuthorizeBom(pin);
        }}
      />

      {/* ECO Modal */}
      <AuthorizeDocModal
        isOpen={showEcoModal}
        onClose={() => {
          setShowEcoModal(false);
          setEcoReason("");
        }}
        docType="Engineering Change Order (ECO)"
        docNumber={selectedProject || "PRJ-0001"}
        subtitle="BOM TECHNICAL REVISION & RE-COMMITMENT"
        status="MANUFACTURING PHASE"
        partnerLabel="Project Name"
        partnerName={currentProject?.name || selectedProject || "Project BOM"}
        amount={summary.totalCost}
        isSubmitting={isSubmitting}
        submitLabel="Authorize & Commit ECO"
        submitVariant="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs"
        submitDisabled={!ecoReason.trim()}
        themeVariant="amber"
        icon={<Wrench className="w-5 h-5 text-amber-600" />}
        approvalTitle="Otorisasi Engineering Change Order (ECO)"
        approvalDescription="Proyek ini telah masuk ke tahap Manufaktur. Masukkan Daily Internal Auth Key akun anda (dapat dilihat pada panel aktivitas & notifikasi di header) untuk menyetujui revisi teknis Bill of Materials (BOM)."
        onAuthorize={async (pin) => {
          const success = await handleSyncBom(pin, ecoReason);
          if (success) {
            setShowEcoModal(false);
            setEcoReason("");
          }
        }}
      >
        <div className="space-y-2 mb-3">
          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
            Reason for Engineering Change (ECO)
          </label>
          <textarea
            className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 outline-none transition-all placeholder:text-stone-400 placeholder:font-normal"
            rows={3}
            required
            placeholder="Explain why the Bill of Materials (BOM) needs to be revised..."
            value={ecoReason}
            onChange={(e) => setEcoReason(e.target.value)}
          />
        </div>
      </AuthorizeDocModal>

      {selectedProject && (
        <>
          <BomPreviewModal
            isOpen={showBomPreview}
            onClose={() => setShowBomPreview(false)}
            project={
              currentProject || {
                id: selectedProject,
                name: selectedProject,
                status: "ACTIVE",
              }
            }
            bomRows={rows}
            totalCost={summary.totalCost}
            bopSteps={bopSteps}
          />

          <EcoHistoryModal
            isOpen={showEcoHistoryModal}
            onClose={() => setShowEcoHistoryModal(false)}
            project={
              projects.find((p) => p.id === selectedProject) || {
                id: selectedProject,
                name: selectedProject,
                status: "ACTIVE",
              }
            }
            previousBom={initialBom}
            currentBom={rows}
            ecoReason={lastEcoReason || ecoReason || "BOM Technical Revision & Material Re-allocation"}
            authorizedBy={user?.username || "ENGINEERING_LEAD"}
            authorizedAt={lastEcoAuthorizedAt || new Date().toISOString()}
          />
        </>
      )}

      
      {/* Revise BOM Modal */}
      <ReviseBomModal
        isOpen={showReviseBomModal}
        onClose={() => setShowReviseBomModal(false)}
        handleReviseBom={handleReviseBom}
        reviseNote={reviseNote}
        setReviseNote={setReviseNote}
        isSubmitting={isSubmitting}
      />

      {/* Load Preset Modal */}
      <LoadPresetModal
        isOpen={showLoadPresetModal}
        onClose={() => {
          setShowLoadPresetModal(false);
          setLoadPresetFile(null);
          setLoadPresetFileName("");
        }}
        handleLoadPresetConfirm={handleLoadPresetConfirm}
        setLoadPresetFile={setLoadPresetFile}
        setLoadPresetFileName={setLoadPresetFileName}
        loadPresetFileName={loadPresetFileName}
        loadPresetFile={loadPresetFile}
      />

      {/* Save Preset Modal */}
      <SavePresetModal
        isOpen={savePresetModal.isOpen}
        onClose={() => setSavePresetModal({ isOpen: false, name: "", description: "" })}
        rowsLength={rows.length}
        name={savePresetModal.name}
        description={savePresetModal.description}
        setName={(name) => setSavePresetModal((p) => ({ ...p, name }))}
        setDescription={(desc) => setSavePresetModal((p) => ({ ...p, description: desc }))}
        handleSavePresetConfirm={handleSavePresetConfirm}
      />

      <ConfirmModal
        isOpen={showConfirmSubmitBomModal}
        onCancel={() => setShowConfirmSubmitBomModal(false)}
        onConfirm={async () => {
          setShowConfirmSubmitBomModal(false);
          await handleSyncBom();
        }}
        title={
          language === "id"
            ? "Konfirmasi Pengajuan Bill of Materials (BOM)"
            : "Confirm Bill of Materials (BOM) Submission"
        }
        message={
          language === "id" ? (
            <>
              Apakah Anda yakin ingin mengajukan <strong>Bill of Materials (BOM)</strong> proyek <strong>{currentProject?.spk_number || currentProject?.name || ""}</strong> ini untuk persetujuan Manajer Teknik? Data BOM yang diajukan akan dikunci untuk otorisasi.
            </>
          ) : (
            <>
              Are you sure you want to submit this <strong>Bill of Materials (BOM)</strong> for project <strong>{currentProject?.spk_number || currentProject?.name || ""}</strong> for Manager approval? Submitted BOM data will be queued for authorization.
            </>
          )
        }
        confirmText={language === "id" ? "Ya, Ajukan BOM" : "Yes, Submit BOM"}
        cancelText={language === "id" ? "Batal" : "Cancel"}
        variant="info"
      />
    </div>
  );
}

import {
   safeFetchJson, apiFetch } from "@/utils/api";
import React, { useState, useEffect, useRef } from "react";
import {
  
  Search,
  CheckCircle2,
  X,
  Download,
  FileText,
  Upload,
  Trash2,
  Archive,
  Plus,
  AlertCircle,
  FilePlus2,
  Share2,
  ClipboardList,
  ChevronUp,
  AlertTriangle,
  Clock,
  QrCode,
  Lock,
  ShieldCheck,
  Layers,
  Package,
  Boxes,
} from "lucide-react";
import {
   generatePDF } from "@/lib/pdfGenerator";
import {
   QRCodeSVG } from "qrcode.react";
import {
   cn } from "@/lib/utils";
import {
   useAuth } from "@/contexts/AuthContext";
import {
   useLanguage } from "@/contexts/LanguageContext";
import {
   useToast } from "@/contexts/ToastContext";
import {
   useShare } from "@/contexts/ShareContext";
import {
   ConfirmModal } from "@/components/shared/ConfirmModal";
import {
   Modal } from "@/components/ui/Modal";
import {
   Select } from "@/components/ui/Select";
import {
   Button } from "@/components/ui/Button";
import {
   AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import {
   ReviseDocModal } from "@/components/erp/ReviseDocModal";
import {
   Action, hasPermission } from "@/utils/pbac";
import {
   PageHeader } from "@/components/shared/PageHeader";
import {
   PrintTemplate } from "@/components/erp/PrintTemplate";
import {
   useAutoSave } from "@/hooks/useAutoSave";
import {
   getDailyAuthKey } from "@/utils/auth";
import {
   PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import {
   ProcurementWavesModal } from "@/components/erp/ProcurementWavesModal";

interface BomRow {
  id: string;
  item_id?: string;
  item_code: string;
  name: string;
  qty: string;
  uom?: string;
  unit?: string;
  unit_price?: string;
  free_stock?: number;
  shortage_qty?: number;
  qty_to_order?: number;
  notFound?: boolean;
}

export default function Requests() {
  const printRef = useRef<HTMLDivElement>(null);
  const [prs, setPrs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // New Request States
  const {
    data: selectedProject,
    setData: setSelectedProject,
    clearDraft: clearSelectedProject,
  } = useAutoSave<string>("requests_selected_project", "");
  const {
    data: drawingReference,
    setData: setDrawingReference,
    clearDraft: clearDrawingReference,
  } = useAutoSave<string>("requests_drawing_reference", "");
  const {
    data: bomRows,
    setData: setBomRows,
    clearDraft: clearBomDraft,
  } = useAutoSave<BomRow[]>("requests_bom_rows", []);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT" | "CRITICAL">(
    "NORMAL",
  );
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [showPrModal, setShowPrModal] = useState(false);

  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [selectedPrToAuth, setSelectedPrToAuth] = useState<any>(null);
  const [revisingPr, setRevisingPr] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [previewPrData, setPreviewPrData] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { showToast } = useToast();
  const { shareToForum } = useShare();

  const fetchPrs = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/purchasing/prs", {}, user?.username);
      if (res.ok) {
        setPrs(Array.isArray(res.data) ? res.data : []);
      } else {
        showToast(res.error || "Failed to fetch PRs", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching PRs", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await apiFetch("/api/projects", {}, user?.username);
      if (res.ok) {
        setProjects(Array.isArray(res.data) ? res.data.filter((p: any) => !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(p.id)) : []);
      } else {
        showToast(res.error || "Failed to fetch projects", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching projects", "error");
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await apiFetch("/api/inventory", {}, user?.username);
      if (res.ok) {
        setInventoryItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchPrs();
    fetchProjects();
    fetchInventory();
  }, []);

// Add state for bopSteps

  const [bopSteps, setBopSteps] = useState<any[]>([]);
  const [showWavesModal, setShowWavesModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'PURCHASE' | 'FLOOR'>('PURCHASE');
  const [floorRequests, setFloorRequests] = useState<any[]>([]);
  const [isFloorLoading, setIsFloorLoading] = useState(false);


// Modify loadProjectShortage to fetch bopSteps too
  const loadProjectShortage = async (projectId: string) => {
    if (!projectId) {
      setBomRows([]);
      setBopSteps([]);
      setHasChecked(false);
      return;
    }
    setIsChecking(true);
    try {
      const [res, bopRes] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/shortage-analysis`, {}, user?.username),
        apiFetch(`/api/production/project/${projectId}/bop-steps`, {}, user?.username)
      ]);
      
      if (bopRes.ok && Array.isArray(bopRes.data)) {
        setBopSteps(bopRes.data);
      } else {
        setBopSteps([]);
      }

      if (res.ok && Array.isArray(res.data)) {
        setBomRows(
          res.data.map((b: any) => ({
            id: b.bom_id || b.item_id,
            item_id: b.item_id,
            item_code: b.item_code,
            name: b.item_name || b.name,
            dimension: b.dimension,
            spec: b.spec,
            qty: (b.required_qty ?? 0).toString(),
            uom: b.uom || "Unit",
            unit_price: (b.unit_price || 0).toString(),
            expected_date: b.expected_date || "",
            shortage_qty: b.shortage ?? 0,
            free_stock: b.free_stock ?? 0,
            allocated_stock: b.allocated ?? 0,
            qty_to_order: b.shortage ?? 0,
            fraction_allocated: b.fraction_allocated || 0,
            lead_time_days: b.lead_time_days || 7,
          })),
        );
      } else {
        setBomRows([]);
      }
    } catch (err) {
      console.error(err);
      setBomRows([]);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      loadProjectShortage(selectedProject);
      setHasChecked(false);
    } else {
      setBomRows([]);
      setHasChecked(false);
    }
  }, [selectedProject]);

  const handleCheckStock = async () => {
    if (!selectedProject) {
      showToast("Please select a project first.", "error");
      return;
    }
    setIsChecking(true);
    await loadProjectShortage(selectedProject);
    setHasChecked(true);
    setIsChecking(false);
    showToast("Project stock check completed", "success");
  };

  const handleSubmitPr = async () => {
    setIsSubmitting(true);
    try {
      if (revisingPr) {
        // Revision Mode
        const customItems = bomRows
          .filter(
            (r) =>
              ((r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0) > 0,
          )
          .map((r) => ({
            id: r.id,
            item_id: r.item_id,
            dimension: (r as any).dimension,
            spec: (r as any).spec,
            unit_price: (r as any).unit_price,
            qty_to_order:
              (r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0,
            expected_delivery_date: (r as any).expected_date,
          }));

        if (
          customItems.length > 0 &&
          customItems.some((item) => !item.expected_delivery_date)
        ) {
          showToast("Please specify an expected delivery date for all items.", "error");
          setIsSubmitting(false);
          return;
        }

        const payload = {
          urgency,
          expected_delivery_date:
            (bomRows[0] as any)?.expected_date ||
            revisingPr.expected_delivery_date,
          remarks: drawingReference,
          items: customItems,
        };
        const res = await apiFetch(
          `/api/purchasing/pr/${revisingPr.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          user?.username,
        );

        if (res.ok) {
          showToast(`PR Revised successfully`, "success");
          setShowPrModal(false);
          setRevisingPr(null);
          clearBomDraft();
          fetchPrs();
        } else {
          showToast(res.error || "Failed to revise PR", "error");
        }
      } else {
        // Direct Project PR Generation Mode
        if (!selectedProject) {
          showToast("Please select a project.", "error");
          setIsSubmitting(false);
          return;
        }

        const customItems = bomRows
          .filter(
            (r) =>
              ((r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0) > 0,
          )
          .map((r) => ({
            item_id: r.item_id,
            dimension: (r as any).dimension,
            spec: (r as any).spec,
            unit_price: (r as any).unit_price,
            qty_to_order:
              (r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0,
            expected_delivery_date: (r as any).expected_date,
          }));

        // Validate all items have delivery date
        if (
          customItems.length > 0 &&
          customItems.some((item) => !item.expected_delivery_date)
        ) {
          showToast("Please specify an expected delivery date for all items.", "error");
          setIsSubmitting(false);
          return;
        }

        const itemExpectedDates: Record<string, string> = {};
        customItems.forEach((it) => {
          if (it.item_id && it.expected_delivery_date) {
            itemExpectedDates[it.item_id] = it.expected_delivery_date;
          }
        });

        const payload = {
          expected_delivery_date:
            (bomRows[0] as any)?.expected_date ||
            new Date().toISOString().split("T")[0],
          drawing_reference: drawingReference,
          items: customItems,
          item_expected_dates: itemExpectedDates,
          urgency,
          category: "PROJECT",
        };

        const res = await apiFetch(
          `/api/projects/${selectedProject}/generate-prs`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          user?.username,
        );
        if (res.ok) {
          const data = res.data;
          showToast(
            data && data.pr_created
              ? `PR Created: ${data.pr_number}`
              : "No PR needed (Stock fulfilled)",
            "success",
          );
          setShowPrModal(false);
          fetchPrs();
          fetchProjects();
          clearSelectedProject();
          clearDrawingReference();
          clearBomDraft();
          setHasChecked(false);
          if (data && data.pr_created && data.pr_id) {
            handleViewPr(data.pr_id);
          }
        } else {
          showToast(res.error || "Failed to generate PR", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast(
        revisingPr ? "Failed to revise PR" : "Failed to generate PR",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthorizePr = async (pin: string) => {
    setIsSubmitting(true);
    try {
      const digitalSignature = `Digitally Authorized by ${user?.name || user?.username} (${user?.role}) on ${new Date().toISOString()}`;
      const res = await apiFetch(
        "/api/purchasing/authorize-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: selectedPrToAuth.id,
            authorized_doc: digitalSignature,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAuthorizeModal(false);
        setAuthPin("");
        // Optimistic UI Update
        setPrs((prev) =>
          prev.map((pr) =>
            pr.id === selectedPrToAuth.id
              ? { ...pr, status: "AUTHORIZED", auth_doc: digitalSignature }
              : pr,
          ),
        );
        showToast("PR digitally authorized successfully", "success");
      } else {
        showToast(res.error || "Failed to authorize PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing PR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevisePr = async (note: string) => {
    if (!note.trim()) {
      showToast("Validation Failed: Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/revise-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: selectedPrToAuth.id,
            revision_note: note,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowReviseModal(false);
        setRevisionNote("");
        fetchPrs();
        showToast("PR marked for revision", "success");
      } else {
        showToast(res.error || "Failed to mark PR for revision", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error revising PR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPr = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Cancel Purchase Request?",
      message:
        "Are you sure you want to cancel this PR? This will revert items inside to unauthorized state.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/pr/${id}/cancel`,
            {
              method: "POST",
            },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast("PR cancelled successfully", "success");
          } else {
            showToast(res.error || "Failed to cancel PR", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error cancelling PR", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeletePr = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Purchase Request?",
      message:
        "Are you sure you want to delete this PR? This will permanently remove it from the system.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/pr/${id}`,
            {
              method: "DELETE",
            },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast("PR deleted successfully", "success");
          } else {
            showToast(res.error || "Failed to delete PR", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error deleting PR", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleArchiveFinishedPrs = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Finished Purchase Requests?",
      message:
        "This will archive all ORDERED and CANCELLED Purchase Requests from your active queue. Archived items remain safely stored in the database for comprehensive audits.",
      action: async () => {
        try {
          const res = await apiFetch(
            "/api/purchasing/clear-prs",
            {
              method: "POST",
            },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast(
              "Requests successfully archived and removed from active view.",
              "success",
            );
          } else {
            showToast(res.error || "Failed to archive requests", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error archiving requests", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;

    setIsSubmitting(true);
    try {
      const fileName = previewPrData
        ? `PR_${previewPrData.pr_number}.pdf`
        : "Document.pdf";
      await generatePDF(printRef.current, fileName);
    } catch (error) {
      console.error("PDF Generation failed", error);
      showToast("Failed to generate PDF. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewPr = async (prId: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/pr/${prId}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setPreviewPrData({
          id: data.id,
          pr_number: data.pr_number,
          project_id: data.project_id,
          project_name: data.project_name,
          drawing_reference: data.drawing_reference,
          created_at: data.created_at,
          status: data.status,
          authorized_doc: data.authorized_doc,
          created_by: data.created_by,
          urgency: data.urgency,
          expected_delivery_date: data.expected_delivery_date,
          items: data.items.map((item: any) => ({
            item_code: item.item_code,
            name: item.item_name,
            dimension: item.dimension,
            spec: item.spec,
            shortage_qty: item.qty, // Fixed from qty_requested to qty
            uom: item.uom,
            unit_price: item.unit_price,
            expected_delivery_date: item.expected_delivery_date || data.expected_delivery_date || "",
          })),
        });
        setShowPreviewModal(true);
      } else {
        showToast(res.error || "Failed to view PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error viewing PR", "error");
    }
  };

  const handleRevisePrSetup = async (prId: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/pr/${prId}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setRevisingPr(data);
        setUrgency(data.urgency);
        setBomRows(
          data.items.map((item: any) => ({
            id: item.id || Math.random().toString(),
            item_id: item.item_id,
            item_code: item.item_code,
            name: item.item_name,
            dimension: item.dimension,
            spec: item.spec,
            uom: item.uom,
            shortage_qty: Number(item.qty),
            qty_to_order: Number(item.qty),
            expected_date:
              item.expected_delivery_date || data.expected_delivery_date || "",
          })),
        );
        setShowPrModal(true);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch PR details for revision", "error");
    }
  };

  const filteredPrs = React.useMemo(() => {
    return prs.filter(
      (pr) =>
        pr.pr_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pr.project_name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [prs, searchQuery]);


  return (
    <div className="space-y-12 pb-20">
      <PageHeader
        title="Design Requests"
        subtitle="Internal material requisitions and approvals"
        icon={<ClipboardList className="w-6 h-6" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8">
        {/* Left Panel: PR List (40% -> 5/12 grid span) */}
        <div className="lg:col-span-5 xl:col-span-5 space-y-6 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              Ongoing Requests
            </h3>
            <span className="text-[10px] bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-widest leading-none">
              {filteredPrs.length}
            </span>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search PR, Project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-6 py-3 bg-stone-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-200 outline-none transition-all placeholder:text-stone-400"
              />
            </div>
            <button
              onClick={handleArchiveFinishedPrs}
              className="px-4 py-3 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 rounded-2xl text-amber-800 transition-all active:scale-95 flex items-center gap-2 shadow-sm"
              title="Archive Finished Requests"
            >
              <Archive className="w-4 h-4 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest hidden xl:inline">
                Archive Finished
              </span>
            </button>
            <button
              onClick={fetchPrs}
              className="px-4 py-3 bg-stone-50 hover:bg-stone-100 rounded-2xl text-stone-400 hover:text-stone-600 transition-all active:scale-95"
              title="Refresh List"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>

          <div className="bg-white border border-stone-100 rounded-2xl overflow-x-auto shadow-sm min-w-0">
            {isLoading ? (
              <div className="p-16 text-center text-xs text-stone-400 font-medium tracking-widest italic uppercase">
                Synchronizing...
              </div>
            ) : filteredPrs.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-12 h-12 bg-stone-50 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="w-5 h-5 opacity-40" />
                </div>
                <div className="text-sm font-bold text-stone-900 tracking-tighter uppercase">
                  All Caught Up
                </div>
                <div className="text-[10px] text-stone-400 mt-1 font-bold tracking-widest uppercase">
                  No pending submissions found.
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[360px]">
                <thead>
                  <tr className="border-b border-stone-100 bg-white">
                    <th className="px-4 py-3.5 text-[10px] font-bold text-stone-400 tracking-widest uppercase whitespace-nowrap">
                      Document
                    </th>
                    <th className="px-3 py-3.5 text-[10px] font-bold text-stone-400 tracking-widest uppercase whitespace-nowrap">
                      Items
                    </th>
                    <th className="px-4 py-3.5 text-[10px] font-bold text-stone-400 tracking-widest uppercase text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100/60">
                  {filteredPrs.map((pr) => {
                    const isCancelled = pr.status === "CANCELLED";
                    return (
                      <tr
                        key={pr.id}
                        className={cn(
                          "group hover:bg-stone-50 transition-all cursor-pointer border-l-4",
                          pr.status === "AUTHORIZED"
                            ? "border-emerald-500"
                            : pr.status === "CANCELLED"
                              ? "border-stone-200"
                              : "border-stone-900",
                          isCancelled && "opacity-60",
                        )}
                        onClick={() => handleViewPr(pr.id)}
                      >
                        <td className="px-4 py-3.5">
                          <div
                            className={cn(
                              "text-xs font-medium tracking-tight",
                              isCancelled
                                ? "line-through text-stone-400"
                                : "text-stone-900",
                            )}
                          >
                            {pr.pr_number}
                          </div>
                          <div
                            className="text-[10px] text-stone-500 mt-1 truncate max-w-[160px]"
                            title={pr.project_name}
                          >
                            {pr.spk_number ? (
                              <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[8px] font-bold rounded bg-indigo-50 text-indigo-700 uppercase border border-indigo-200">
                                SPK: {pr.spk_number}
                              </span>
                            ) : null}
                            {pr.category && pr.category !== 'PROJECT' ? (
                               <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[8px] font-bold rounded bg-amber-50 text-amber-600 uppercase border border-amber-100">{pr.category}</span>
                            ) : null}
                            {pr.project_name}
                          </div>
                          <div className="mt-1.5 lg:hidden xl:block flex gap-1 flex-wrap">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 text-[8px] font-medium rounded-full tracking-wider uppercase",
                                pr.status === "DRAFTED"
                                  ? "bg-stone-100 text-stone-700 border border-stone-200"
                                  : pr.status === "REVISION"
                                    ? "bg-rose-50 text-rose-700 border border-rose-100"
                                    : pr.status === "AUTHORIZED"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                      : pr.status === "PARTIAL_ORDERED"
                                        ? "bg-cyan-50 text-cyan-700 border border-cyan-100"
                                        : pr.status === "ORDERED"
                                          ? "bg-stone-100 text-stone-900 border border-stone-200"
                                          : pr.status === "PARTIAL"
                                            ? "bg-amber-50 text-amber-700 border border-amber-100"
                                            : pr.status === "RECEIVED"
                                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                              : pr.status === "CANCELLED"
                                                ? "bg-stone-100 text-stone-500"
                                                : "bg-blue-50 text-blue-700 border border-blue-100",
                              )}
                            >
                              {pr.status}
                            </span>
                            {(pr.status === "DRAFTED" ||
                              pr.status === "PENDING") &&
                              pr.escalated_to && (
                                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded-full tracking-wider uppercase bg-rose-500 text-white flex items-center gap-1 shadow-sm">
                                  <AlertTriangle className="w-2 h-2" />{" "}
                                  ESCALATED TO {pr.escalated_to}
                                </span>
                              )}
                            {(pr.urgency === "URGENT" ||
                              pr.urgency === "CRITICAL") && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 text-[8px] font-medium rounded-full tracking-wider uppercase",
                                  pr.urgency === "CRITICAL"
                                    ? "bg-rose-500 text-white"
                                    : "bg-amber-500 text-amber-50",
                                )}
                              >
                                {pr.urgency}
                              </span>
                            )}
                          </div>
                          {pr.status === "REVISION" && pr.revision_note && (
                            <div className="mt-1.5 flex items-start gap-1 p-2 bg-rose-50 border border-rose-100 rounded text-[10px] text-rose-700 max-w-[200px]">
                              <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                              <span className="italic leading-snug break-words">
                                "{pr.revision_note}"
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <div className="text-[10px] font-medium text-stone-900">
                            {pr.item_count} Items
                          </div>
                          <div className="text-[9px] text-stone-400 font-medium tracking-widest mt-0.5 uppercase">
                            Sourcing Req
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1.5 items-center shrink-0">
                            <Button
                              size="xs"
                              action="view"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewPr(pr.id);
                              }}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                shareToForum(
                                  "PR",
                                  pr.id,
                                  `Purchase Request: ${pr.pr_number}`,
                                  `Check out this purchase request for project ${pr.project_name}. Status: ${pr.status}`,
                                );
                              }}
                              className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-white hover:shadow-sm rounded transition-all"
                              title="Share"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            {pr.status === "DRAFTED" &&
                              (hasPermission(user, Action.AUTH_PR) ||
                                pr.escalated_to === user?.role) && (
                                <>
                                  <Button
                                    size="xs"
                                    action="authorize"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPrToAuth(pr);
                                      setShowAuthorizeModal(true);
                                    }}
                                  />
                                  <Button
                                    size="xs"
                                    action="revise"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPrToAuth(pr);
                                      setShowReviseModal(true);
                                    }}
                                  />
                                </>
                              )}
                            {pr.status === "REVISION" &&
                              (hasPermission(
                                user,
                                Action.CREATE_PR_ENGINEERING,
                              ) ||
                                hasPermission(
                                  user,
                                  Action.CREATE_PR_PRODUCTION,
                                )) && (
                                <Button
                                  size="xs"
                                  action="revise"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRevisePrSetup(pr.id);
                                  }}
                                />
                              )}
                            {(pr.status === "DRAFTED" ||
                              pr.status === "AUTHORIZED") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelPr(pr.id);
                                }}
                                className="p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-all"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(pr.status === "CANCELLED" ||
                              pr.status === "DRAFTED") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePr(pr.id);
                                }}
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Panel: New Request (60%) */}
        <div className="lg:col-span-7 xl:col-span-7 space-y-6 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              Form Generation
            </h3>
          </div>

          <div className="bg-white border border-stone-100 rounded-2xl p-8 shadow-sm relative overflow-hidden">
            <div className="mb-8 pb-8 border-b border-stone-100/60 space-y-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-stone-400 tracking-widest uppercase">
                  Target Project
                </label>
                <Select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-stone-200 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">{language === "id" ? "-- Pilih Proyek --" : "-- Select Project --"}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`[${p.spk_number || p.id}] ${p.name} (${p.bom_status === 'AUTHORIZED' ? 'BOM Authorized' : 'BOM ' + (p.bom_status || 'Draft')})`}
                    </option>
                  ))}
                </Select>
              </div>

              {(() => {
                const currentProject = projects.find((p) => p.id === selectedProject);
                if (!currentProject) return null;
                return (
                  <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-stone-100 text-stone-700 border border-stone-200 flex items-center justify-center font-black text-xs">
                        {currentProject.id.slice(0, 3)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-900">
                          {currentProject.name}
                        </div>
                        <div className="text-[10px] font-medium text-stone-500 flex items-center gap-2 mt-0.5">
                          <span>
                            Batch Qty: <strong className="text-stone-800">{currentProject.qty || 1} {currentProject.uom || "Unit"}</strong>
                          </span>
                          {currentProject.customer_name && (
                            <>
                              <span>•</span>
                              <span>
                                Customer: <strong className="text-stone-800">{currentProject.customer_name}</strong>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {currentProject.spk_number && (
                        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold font-mono">
                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                          <span>SPK: {currentProject.spk_number}</span>
                        </div>
                      )}
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        currentProject.bom_status === 'AUTHORIZED'
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border border-amber-200 text-amber-700'
                      }`}>
                        <span>BOM: {currentProject.bom_status || 'DRAFT'}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {selectedProject && (
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  {language === "id" ? "Daftar Item Kebutuhan" : "Material Requirements List"} ({bomRows.length})
                </div>
                <div className="text-[10px] font-semibold text-stone-600 tracking-wider uppercase">
                  {language === "id" ? "Sumber: BOM Proyek" : "Source: Project BOM"}
                </div>
              </div>
            )}

            {bomRows.length > 0 ? (
              <div className="space-y-4">
                {bomRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="group bg-white border border-stone-200 rounded-3xl p-6 hover:shadow-md transition-all"
                  >
                    <div className="flex gap-8">
                      <div className="flex flex-col items-center gap-2 mt-1 shrink-0">
                        <div className="text-[10px] font-bold text-stone-400 font-mono">
                          {(index + 1).toString().padStart(2, "0")}
                        </div>
                        {(row as any).is_custom && (
                          <button
                            onClick={() =>
                              setBomRows(bomRows.filter((_, i) => i !== index))
                            }
                            className="p-1 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 space-y-6">
                        {/* Header Info */}
                        <div className="grid grid-cols-2 gap-8">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center px-1">
                              <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                                Item Identifier
                              </label>
                              {hasChecked && (
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                                      (row.free_stock || 0) > 0
                                        ? "bg-emerald-50 text-emerald-600"
                                        : "bg-stone-100 text-stone-400",
                                    )}
                                  >
                                    Free Stock: {row.free_stock || 0}
                                  </span>
                                  {(row as any).allocated_stock > 0 && (
                                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                      Allocated: {(row as any).allocated_stock}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {(row as any).is_custom ? (
                              <select
                                value={row.item_id || ""}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  const invItem = inventoryItems.find(
                                    (i: any) => i.item_id === selectedId,
                                  );
                                  const updated = [...bomRows];
                                  if (invItem) {
                                    (updated[index] as any).item_id =
                                      invItem.item_id;
                                    (updated[index] as any).item_code =
                                      invItem.item_code;
                                    (updated[index] as any).name =
                                      invItem.item_name;
                                    (updated[index] as any).uom = invItem.uom;
                                    (updated[index] as any).unit_price =
                                      invItem.unit_price;
                                    (updated[index] as any).free_stock =
                                      invItem.free_stock;
                                    (updated[index] as any).spec = invItem.spec;
                                  } else {
                                    (updated[index] as any).item_id = "";
                                    (updated[index] as any).item_code = "";
                                    (updated[index] as any).name = "";
                                    (updated[index] as any).uom = "";
                                    (updated[index] as any).unit_price = "0";
                                    (updated[index] as any).free_stock = 0;
                                    (updated[index] as any).spec = "";
                                  }
                                  setBomRows(updated);
                                }}
                                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-[10px] font-bold text-stone-900 uppercase focus:ring-2 focus:ring-stone-200 outline-none transition-all cursor-pointer"
                              >
                                <option value="">Select Item</option>
                                {inventoryItems.map((inv: any) => (
                                  <option key={inv.item_id} value={inv.item_id}>
                                    {inv.item_code} - {inv.item_name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-bold text-stone-900 uppercase">
                                {row.item_code}
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest px-1">
                              Material Specification
                            </label>
                            <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 truncate">
                              {(row as any).spec || row.name || "N/A"}
                            </div>
                          </div>
                        </div>

                        {/* Transactional Logic Card */}
                        <div className="bg-stone-50/50 border border-stone-200 rounded-2xl p-5">
                          <div className="grid grid-cols-12 gap-6">
                            <div className="col-span-3 space-y-1.5">
                              <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest px-1">
                                Project Need
                              </label>
                              {(row as any).is_custom ? (
                                <input
                                  type="number"
                                  min="1"
                                  value={row.qty}
                                  onChange={(e) => {
                                    const updated = [...bomRows];
                                    updated[index].qty = e.target.value;
                                    (updated[index] as any).shortage_qty =
                                      Number(e.target.value);
                                    (updated[index] as any).qty_to_order =
                                      Number(e.target.value);
                                    setBomRows(updated);
                                  }}
                                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold text-stone-900 text-center focus:ring-2 focus:ring-stone-200 outline-none transition-all"
                                />
                              ) : (
                                <div className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold text-stone-900 text-center">
                                  {row.qty}{" "}
                                  <span className="text-[10px] text-stone-400">
                                    {row.uom}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="col-span-6 flex flex-col justify-center px-6 border-x border-stone-200">
                              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1">
                                Stock Position
                              </div>
                              <div className="text-xs font-bold text-stone-900 truncate flex items-center gap-2">
                                {hasChecked ? (
                                  (row.free_stock || 0) +
                                    ((row as any).allocated_stock || 0) >=
                                  Number(row.qty) ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{" "}
                                      Inventory Covered
                                    </>
                                  ) : (
                                    <div className="flex flex-col gap-1 w-full">
                                      <div className="flex items-center gap-1.5 text-rose-500">
                                        <AlertTriangle className="w-3.5 h-3.5" />{" "}
                                        Shortage: {row.shortage_qty} {row.uom}
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <>
                                    <Clock className="w-3.5 h-3.5 text-stone-400" />{" "}
                                    Availability Pending...
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="col-span-3 flex flex-col items-end justify-center gap-1">
                              <div className="w-full flex items-center justify-between text-[10px] font-bold">
                                <span className="text-stone-400 uppercase tracking-widest">BOM Allocated</span>
                                <span className={((row as any).fraction_allocated || 0) > 1 ? "text-rose-500" : "text-emerald-600"}>{((row as any).fraction_allocated * 100).toFixed(0)}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden mb-1">
                                <div 
                                  className={((row as any).fraction_allocated || 0) > 1 ? "h-full bg-rose-500" : "h-full bg-emerald-500"} 
                                  style={{ width: `${Math.min(((row as any).fraction_allocated || 0) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-1">
                                Net Sourcing
                              </div>
                              <div
                                className={cn(
                                  "text-lg font-bold tracking-tighter",
                                  (row.shortage_qty || 0) > 0
                                    ? "text-rose-500"
                                    : "text-emerald-500",
                                )}
                              >
                                {row.shortage_qty || 0}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expected Arrival Input (only if sourcing needed) */}
                        {(row.shortage_qty || 0) > 0 && hasChecked && (
                          <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-3">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest p-1">
                              Item Expected Arrival
                            </label>
                            <input
                              type="date"
                              value={(row as any).expected_date || ""}
                              onChange={(e) => {
                                const updated = [...bomRows];
                                (updated[index] as any).expected_date =
                                  e.target.value;
                                setBomRows(updated);
                              }}
                              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-stone-200 outline-none transition-all"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed border-stone-200 rounded-3xl bg-stone-50/30 group hover:border-stone-300 transition-all">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-110 transition-transform border border-stone-100">
                  <ClipboardList className="w-6 h-6 text-stone-400" />
                </div>
                <h4 className="text-sm font-bold text-stone-900 flex items-center justify-center gap-2 uppercase tracking-tight">
                  <AlertCircle className="w-4 h-4 text-amber-500" />{" "}
                  {selectedProject
                    ? (projects.find((p) => p.id === selectedProject)?.bom_status !== 'AUTHORIZED'
                        ? (language === "id" ? "BOM Belum Terotorisasi" : "BOM Not Authorized")
                        : (language === "id" ? "Belum Ada Item Kebutuhan" : "No Requirement Items"))
                    : (language === "id" ? "Pilih Proyek Terlebih Dahulu" : "Select a Project First")}
                </h4>
                <p className="text-[10px] text-stone-500 mt-1 font-medium tracking-widest max-w-[380px] mx-auto leading-relaxed uppercase">
                  {selectedProject
                    ? (projects.find((p) => p.id === selectedProject)?.bom_status !== 'AUTHORIZED'
                        ? (language === "id"
                            ? "Proyek ini belum memiliki BOM yang terotorisasi. Silakan lakukan otorisasi BOM di modul Engineering terlebih dahulu."
                            : "This project does not have an authorized BOM yet. Please authorize the BOM in the Engineering module first.")
                        : (language === "id"
                            ? "BOM proyek ini telah terotorisasi namun belum memiliki item material aktif."
                            : "This project BOM is authorized but has no active material items."))
                    : (language === "id"
                        ? "Pilih Proyek untuk memuat daftar kebutuhan material dari BOM"
                        : "Select a Project to ingest material requirements from BOM")}
                </p>
              </div>
            )}

            <div className="mt-8 flex justify-end items-center bg-stone-50/50 p-6 rounded-3xl border border-stone-100/60 shadow-sm">
              <div className="flex justify-end gap-4">
                {bopSteps.length > 0 && hasChecked && (
                  <button
                    onClick={() => setShowWavesModal(true)}
                    className="px-10 py-3.5 bg-blue-50 border border-blue-200/50 text-blue-700 shadow-sm rounded-2xl text-[10px] font-bold tracking-[0.2em] hover:bg-blue-100 disabled:opacity-30 transition-all flex items-center gap-2 active:scale-[0.98] uppercase"
                  >
                    <Layers className="w-3.5 h-3.5" /> Analyze Waves
                  </button>
                )}
                <button
                  onClick={handleCheckStock}
                  disabled={isChecking || !selectedProject || bomRows.length === 0}
                  className="px-10 py-3.5 bg-white border border-stone-200/50 text-stone-600 shadow-sm rounded-2xl text-[10px] font-bold tracking-[0.2em] hover:bg-stone-50 hover:text-stone-900 disabled:opacity-30 transition-all flex items-center gap-2 active:scale-[0.98] uppercase"
                >
                  {isChecking ? (
                    "Processing stock..."
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" /> Validate stock
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowPrModal(true);
                  }}
                  disabled={bomRows.length === 0 || (!hasChecked && !bomRows.some((r: any) => r.is_custom))}
                  className="px-12 py-3.5 bg-stone-100 text-stone-700 border border-stone-200 rounded-2xl text-[10px] font-bold tracking-[0.2em] hover:bg-stone-200 disabled:opacity-30 transition-all shadow-xl shadow-stone-200/50 active:scale-[0.98] uppercase"
                >
                  Generate document
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWavesModal && selectedProject && (
        <ProcurementWavesModal
          isOpen={showWavesModal}
          onClose={() => setShowWavesModal(false)}
          project={projects.find((p) => p.id === selectedProject)}
          bom={bomRows}
          processSteps={bopSteps}
          shortageAnalysis={bomRows}
          itemsCatalog={inventoryItems}
          onPrGenerated={() => {
             setShowWavesModal(false);
             fetchPrs();
             loadProjectShortage(selectedProject);
          }}
        />
      )}

      {/* Authorize Modal */}
      <AuthorizeDocModal
        isOpen={showAuthorizeModal && !!selectedPrToAuth}
        onClose={() => setShowAuthorizeModal(false)}
        docType="Purchase Request"
        docNumber={selectedPrToAuth?.pr_number || ""}
        status={selectedPrToAuth?.status || "DRAFT"}
        projectName={selectedPrToAuth?.project_name}
        isSubmitting={isSubmitting}
        onAuthorize={handleAuthorizePr}
      />

      {/* Revise Modal */}
      <ReviseDocModal
        isOpen={showReviseModal && !!selectedPrToAuth}
        onClose={() => setShowReviseModal(false)}
        docType="Purchase Request"
        docNumber={selectedPrToAuth?.pr_number || ""}
        status={selectedPrToAuth?.status || "DRAFT"}
        projectName={selectedPrToAuth?.project_name}
        isSubmitting={isSubmitting}
        onRevise={handleRevisePr}
      />

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal && !!previewPrData}
        onClose={() => setShowPreviewModal(false)}
        title="Purchase Request Document"
        maxWidth="5xl"
        contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
      >
        {previewPrData && (
          <>
            <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
              <PdfPreviewWrapper>
<PrintTemplate
                ref={printRef}
                documentTitleId="PERMINTAAN PEMBELIAN"
                documentTitleEn="PURCHASE REQUEST"
                documentNameId="permintaan pembelian"
                documentNameEn="purchase request"
                date={
                  previewPrData.created_at
                    ? new Date(previewPrData.created_at).toLocaleDateString(
                        "id-ID",
                        {
                          timeZone: "Asia/Jakarta",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )
                    : ""
                }
                referenceNumber={previewPrData.pr_number}
                documentId={previewPrData.pr_number || previewPrData.id}
                isDraft={previewPrData.status === "DRAFTED"}
              >
                {/* Redesigned PR Document Content matching Quotation style */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                      Penugasan Proyek <span className="text-stone-400 font-normal">/ Project Assignment</span>
                    </div>
                    <div className="text-xl font-black text-stone-900 uppercase flex items-center gap-2">
                      {previewPrData.category && previewPrData.category !== 'PROJECT' && (
                        <span className="px-2.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded-md border border-amber-200 font-bold uppercase">{previewPrData.category}</span>
                      )}
                      {previewPrData.project_name}
                    </div>
                    <div className="text-xs text-stone-600 mt-2 font-bold">
                      Corporate Project Intake • Material Request
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                      Referensi Dokumen <span className="text-stone-400 font-normal">/ References</span>
                    </div>
                    <div className="text-base font-black text-stone-900 font-mono">
                      Ref: {previewPrData.project_id && !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(previewPrData.project_id) ? previewPrData.project_id : previewPrData.project_name}
                    </div>
                    {previewPrData.spk_number && (
                      <div className="text-xs font-bold text-indigo-700 font-mono mt-0.5">
                        SPK: {previewPrData.spk_number}
                      </div>
                    )}
                    {previewPrData.urgency && previewPrData.urgency !== "NORMAL" && (
                      <div className="text-xs font-extrabold text-rose-600 uppercase tracking-wider mt-1">
                        {previewPrData.urgency} PRIORITY REQUEST
                      </div>
                    )}
                  </div>
                </div>

                {/* Drawing / Specification Reference Area */}
                <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200">
                  <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-1">
                    Spesifikasi & Gambar Referensi <span className="text-stone-400 font-normal">/ Specification & Reference Drawing</span>
                  </div>
                  <div className="text-sm font-black text-stone-900 tracking-tight leading-tight uppercase">
                    <span className="text-stone-500 font-normal text-xs mr-2">
                      Gambar Referensi <span className="text-stone-400 font-normal">/ Reference Drawing:</span>
                    </span>
                    <span className="font-mono text-stone-900">
                      {previewPrData.drawing_reference &&
                      previewPrData.drawing_reference !== "Terlampir dalam sistem" &&
                      previewPrData.drawing_reference !== "TERLAMPIR DALAM SISTEM" ? (
                        previewPrData.drawing_reference
                      ) : (
                        <span>
                          Terlampir <span className="text-stone-400 font-normal font-sans">/ Attached</span>
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Material Items Table */}
                <div className="flex-1 w-full">
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-3 ml-1">
                    Daftar Kebutuhan Material <span className="text-xs text-stone-400 font-normal">/ Requested Material Specifications</span>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-stone-300 bg-white">
                        <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs">
                          Kode & Deskripsi Material
                          <div className="text-[10px] font-bold text-stone-400 tracking-widest mt-0.5">ITEM CODE & DESCRIPTION</div>
                        </th>
                        <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-28">
                          Jml
                          <div className="text-[10px] font-bold text-stone-400 tracking-widest mt-0.5">QUANTITY</div>
                        </th>
                        <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-24">
                          Satuan
                          <div className="text-[10px] font-bold text-stone-400 tracking-widest mt-0.5">UOM</div>
                        </th>
                        <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-36">
                          Target Pengiriman
                          <div className="text-[10px] font-bold text-stone-400 tracking-widest mt-0.5">EXPECTED DELIVERY</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      {previewPrData.items &&
                        previewPrData.items.map((row: any, i: number) => (
                          <tr key={i}>
                            <td className="py-4 px-3">
                              <div className="font-mono font-bold text-stone-900 text-xs">
                                {row.item_code}
                              </div>
                              <div className="text-sm font-black text-stone-900 uppercase tracking-tight mt-0.5">
                                {row.name}
                              </div>
                              {(row.dimension || row.spec) && (
                                <div className="text-[10px] text-stone-500 mt-0.5 font-medium">
                                  {[row.dimension, row.spec]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                              {Number(row.shortage_qty) || 0}
                            </td>
                            <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                              {row.uom}
                            </td>
                            <td className="py-4 px-3 text-center text-stone-700 font-mono text-xs whitespace-nowrap">
                              {(() => {
                                const rawDate =
                                  row.expected_delivery_date ||
                                  row.expected_date ||
                                  previewPrData.expected_delivery_date;
                                if (!rawDate) return "-";
                                try {
                                  const d = new Date(rawDate);
                                  if (isNaN(d.getTime())) return rawDate;
                                  return d.toLocaleDateString("id-ID", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  });
                                } catch {
                                  return rawDate;
                                }
                              })()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Authorized Signatures for PR */}
                <div className="mt-8 pt-6 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                      Diajukan Oleh <span className="text-stone-500 font-normal">/ Requested By</span>
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">Production Team</div>
                    <div className="h-14 flex items-center justify-center">
                      <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                        <QrCode className="w-6 h-6 text-emerald-600" />
                        <div className="text-left">
                          <div className="text-[9px] font-black text-emerald-800 uppercase">Validated Production</div>
                          <div className="text-[8px] font-mono text-emerald-700">{new Date(previewPrData.created_at || Date.now()).toLocaleDateString("id-ID")}</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                      Production Supervisor
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                      Disetujui Oleh <span className="text-stone-500 font-normal">/ Approved By</span>
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">Production Manager</div>
                    <div className="h-14 flex items-center justify-center">
                      {previewPrData.status === "AUTHORIZED" ||
                      previewPrData.status === "PARTIAL_ORDERED" ||
                      previewPrData.status === "ORDERED" ||
                      !!previewPrData.authorized_doc ? (
                        <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                          <QrCode className="w-6 h-6 text-emerald-600" />
                          <div className="text-left">
                            <div className="text-[9px] font-black text-emerald-800 uppercase">Digitally Authorized</div>
                            <div className="text-[8px] font-mono text-emerald-700">Validated Securely</div>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-stone-300 rounded-lg px-4 py-2 bg-stone-50">
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Awaiting PIN Authorization</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                      Production Manager
                    </div>
                  </div>
                </div>
              </PrintTemplate>
</PdfPreviewWrapper>
            </div>
            <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4">
              <Button
                variant="secondary"
                onClick={() => setShowPreviewModal(false)}
                className="px-6 py-2.5 rounded-xl text-sm"
              >
                {language === "id" ? "Tutup" : "Close"}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleExportPDF()}
                isLoading={isSubmitting}
                className="px-6 py-2.5 rounded-xl text-sm shadow-md"
              >
                {!isSubmitting && <Download className="w-4 h-4" />}
                {language === "id"
                  ? isSubmitting
                    ? "Mengekspor..."
                    : "Ekspor PDF (A4)"
                  : isSubmitting
                    ? "Generating..."
                    : "Export PDF (A4)"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        isOpen={showPrModal}
        onClose={() => {
          setShowPrModal(false);
          setRevisingPr(null);
        }}
        title={
          revisingPr
            ? `Revise Purchase Request: ${revisingPr.pr_number}`
            : "Purchase Request Preview"
        }
        maxWidth="2xl"
        contentClassName="p-0 border-t border-stone-100"
      >
        <div className="w-full">
          <div className="p-6 bg-[#F9F9F8]">
            {revisingPr && revisingPr.revision_note && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 shadow-sm mb-6 w-full">
                <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-rose-800 uppercase tracking-widest mb-1.5">
                    Revision Requested
                  </div>
                  <div className="text-sm font-medium text-rose-700 leading-relaxed max-w-3xl">
                    "{revisingPr.revision_note}"
                  </div>
                </div>
              </div>
            )}
            {bomRows.filter((r) => (r.shortage_qty || 0) > 0).length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <div className="text-stone-900 font-medium">
                  Sufficient Stock Available
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {!revisingPr && (
                  <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Shortage Detected</div>
                      <div>Items will be added to the PR.</div>
                    </div>
                  </div>
                )}
                <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-stone-100 bg-stone-50 flex items-center justify-end gap-4">
                    <div className="text-right">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
                        PR Urgency Level
                      </label>
                      <Select
                        value={urgency}
                        onChange={(e) => setUrgency(e.target.value as any)}
                        className={cn(
                          "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border border-stone-200 outline-none cursor-pointer transition-all shadow-sm h-auto",
                          urgency === "NORMAL" && "bg-blue-50 text-blue-600",
                          urgency === "URGENT" &&
                            "bg-orange-50 text-orange-600",
                          urgency === "CRITICAL" &&
                            "bg-rose-50 text-rose-600 animate-pulse",
                        )}
                      >
                        <option value="NORMAL">Normal</option>
                        <option value="URGENT">Urgent</option>
                        <option value="CRITICAL">Critical</option>
                      </Select>
                    </div>
                  </div>
                  <table className="w-full text-sm text-left">
                    <thead className="bg-stone-50 border-b border-stone-200">
                      <tr>
                        <th className="py-2 px-4 font-medium text-stone-600">
                          Item
                        </th>
                        <th className="py-2 px-4 font-medium text-stone-600 text-center">
                          Shortage
                        </th>
                        <th className="py-2 px-4 font-medium text-stone-600 text-center">
                          Exp. Delivery Date
                        </th>
                        <th className="py-2 px-4 font-medium text-stone-600 text-right">
                          Req Qty
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {bomRows
                        .filter((r) => (r.shortage_qty || 0) > 0)
                        .map((row, idx) => (
                          <tr key={row.id}>
                            <td className="py-3 px-4">
                              <div className="font-medium text-stone-900">
                                {row.item_code}
                              </div>
                              <div className="text-xs text-stone-500">
                                {row.name}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center text-stone-500 font-bold">
                              {row.shortage_qty} {row.uom}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="date"
                                value={(row as any).expected_date || ""}
                                onChange={(e) => {
                                  setBomRows((rows) =>
                                    rows.map((r) =>
                                      r.id === row.id
                                        ? {
                                            ...r,
                                            expected_date: e.target.value,
                                          }
                                        : r,
                                    ),
                                  );
                                }}
                                className="border border-stone-200 rounded px-2 py-1 text-xs outline-none focus:border-stone-400 text-stone-900 bg-white"
                              />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <input
                                type="number"
                                min="0"
                                value={
                                  (row as any).qty_to_order !== undefined
                                    ? (row as any).qty_to_order
                                    : row.shortage_qty
                                }
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setBomRows((rows) => {
                                    const newRows = [...rows];
                                    const rowIdx = newRows.findIndex(
                                      (r) => r.id === row.id,
                                    );
                                    if (rowIdx > -1) {
                                      newRows[rowIdx] = {
                                        ...newRows[rowIdx],
                                        qty_to_order: val,
                                      };
                                    }
                                    return newRows;
                                  });
                                }}
                                className="w-24 text-right border border-stone-200 rounded px-2 py-1 text-sm outline-none focus:border-stone-400 font-bold text-stone-900 bg-stone-50"
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div className="p-6 border-t border-stone-100 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowPrModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitPr} disabled={isSubmitting}>
              {isSubmitting
                ? "Processing..."
                : revisingPr
                  ? "Submit Revision"
                  : "Finalize & Print PR"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

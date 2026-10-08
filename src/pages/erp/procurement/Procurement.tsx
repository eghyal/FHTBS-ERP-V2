import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { cn, useEscapeKey, formatIDR, formatIDRWithDecimals } from "@/lib/utils";
import {
  CheckSquare,
  Square,
  Truck,
  FileText,
  ChevronRight,
  X,
  Plus,
  Download,
  Printer,
  ClipboardCheck,
  Share2,
  Trash2,
  Archive,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Upload,
  QrCode,
  Lock,
  ShieldCheck,
  Percent,
  Zap,
  RotateCcw,
  CreditCard,
  Info,
  Landmark,
  Calendar,
  ShoppingCart,
  Send,
} from "lucide-react";
import { generatePDF } from "@/lib/pdfGenerator";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { useShare } from "@/contexts/ShareContext";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Select } from "@/components/ui/Select";
import { Loader } from "@/components/shared/Loader";
import { PageHeader } from "@/components/shared/PageHeader";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ReviseDocModal } from "@/components/erp/ReviseDocModal";
import { SendEmailModal } from "@/components/erp/SendEmailModal";
import { PoDocumentModal } from "@/components/erp/procurement/PoDocumentModal";
import { PrDetailsModal } from "@/components/erp/procurement/PrDetailsModal";
import { CreatePoModal } from "@/components/erp/procurement/CreatePoModal";
import { GrnModal } from "@/components/erp/procurement/GrnModal";
import { ReissueGrnModal } from "@/components/erp/procurement/ReissueGrnModal";
import { GrnReportModal } from "@/components/erp/procurement/GrnReportModal";
import { getDailyAuthKey } from "@/utils/auth";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { CloudFileUploader } from "@/components/shared/CloudFileUploader";
import {
  calculateFinancialBreakdown,
  TaxScheme,
} from "@/lib/financialEngine";

interface PendingPR {
  pr_item_id: string;
  pr_id: string;
  item_id: string;
  pr_number: string;
  project_id: string;
  project_name: string;
  item_code: string;
  item_name: string;
  item_type: string;
  dimension: string;
  spec: string;
  qty: number;
  uom: string;
  unit_price: number | null;
  created_at: string;
  expected_delivery_date?: string;
  drawing_reference?: string;
  status: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL";
}

interface PO {
  id: string;
  po_number: string;
  supplier_name: string;
  expected_date: string;
  auth_doc_name?: string;
  status: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL";
  created_at: string;
  item_count: number;
  pr_numbers: string;
  pending_qty: number;
  has_cancelled_pr?: number;
  has_rejected_grn?: number;
  revision_note?: string;
  escalated_to?: string;
}

export default function Procurement() {
  const [pendingPrs, setPendingPrs] = useState<PendingPR[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { showToast } = useToast();
  const { shareToForum } = useShare();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPrItems, setSelectedPrItems] = useState<Set<string>>(
    new Set(),
  );

  const selectablePrs = useMemo(
    () => pendingPrs.filter((p) => p.status !== "CANCELLED"),
    [pendingPrs],
  );
  const selectedItemsDetails = useMemo(
    () => pendingPrs.filter((p) => selectedPrItems.has(p.pr_item_id)),
    [pendingPrs, selectedPrItems],
  );

  const [validSuppliers, setValidSuppliers] = useState<any[]>([]);
  const [isFetchingSuppliers, setIsFetchingSuppliers] = useState(false);

  const getSupplierTotalAndPrices = (supplier: any, selectedItems: any[]) => {
    let total = 0;
    const breakdown: { [itemId: string]: number } = {};

    supplier.item_prices?.forEach((ip: any) => {
      breakdown[ip.item_id] = ip.unit_price;
    });

    selectedItems.forEach((p) => {
      const price = breakdown[p.item_id] ?? p.unit_price ?? 0;
      total += p.qty * price;
    });

    return { total, breakdown };
  };

  const sortedSuppliers = useMemo(() => {
    const selectedItems = selectedItemsDetails;
    const totalItemsInBatch = new Set(selectedItems.map((p) => p.item_id)).size;
    const globalEstimatedCost = selectedItems.reduce(
      (sum, p) => sum + p.qty * (p.unit_price || 0),
      0,
    );

    const scored = validSuppliers.map((supplier) => {
      const { total, breakdown } = getSupplierTotalAndPrices(
        supplier,
        selectedItems,
      );

      let fulfilledCount = 0;
      selectedItems.forEach((p) => {
        if (breakdown[p.item_id] !== undefined && breakdown[p.item_id] > 0) {
          fulfilledCount++;
        }
      });

      const matchPercent =
        totalItemsInBatch > 0 ? (fulfilledCount / totalItemsInBatch) * 100 : 0;

      const totalPast = supplier.total_orders || 0;
      const passedPast = supplier.passed_count || 0;
      const rejectedPast = supplier.rejected_count || 0;

      let deliveryRate = 0.95; // default rating for new vendors
      if (totalPast > 0) {
        const completedGrns = passedPast + rejectedPast;
        if (completedGrns > 0) {
          deliveryRate = passedPast / completedGrns;
        }
      }

      const onTimeScore = Math.round(deliveryRate * 100);
      const proximityKm = Math.floor(
        3 + (supplier.name.charCodeAt(0) % 25) * 3,
      );
      const leadTimeDays = Math.floor(1 + (supplier.name.charCodeAt(1) % 4));

      let costRatioModifier = total > 0 ? globalEstimatedCost / total : 1;
      if (costRatioModifier > 1.5) costRatioModifier = 1.5;
      if (costRatioModifier < 0.5) costRatioModifier = 0.5;
      const costSavingsScore = costRatioModifier * 100;

      const compositeScore = Math.round(
        matchPercent * 0.45 +
          costSavingsScore * 0.25 +
          onTimeScore * 0.2 +
          ((80 - proximityKm) / 80) * 100 * 0.1,
      );

      return {
        ...supplier,
        total,
        breakdown,
        matchPercent,
        fulfilledCount,
        totalItemsInBatch,
        onTimeScore,
        proximityKm,
        leadTimeDays,
        compositeScore: Math.max(15, Math.min(100, compositeScore)),
      };
    });

    return scored.sort((a, b) => b.compositeScore - a.compositeScore);
  }, [validSuppliers, pendingPrs, selectedPrItems]);

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

  const [showPoModal, setShowPoModal] = useState(false);
  const [revisingPo, setRevisingPo] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poForm, setPoForm] = useState({
    supplier_id: "",
    supplier_name: "",
    supplier_npwp: "",
    urgency: "NORMAL" as "NORMAL" | "URGENT" | "CRITICAL",
    tax_category: "GOODS_DPP_LAIN",
    tax_scheme: "DPP_NILAI_LAIN" as TaxScheme,
    ppn_rate: "12",
    pph_rate: "0",
    service_amount: "",
    payment_terms: "Net 30 Days",
    custom_payment_terms: "",
    rounding_factor: 0,
  });

  const handleSelectSupplierInModal = (rec: any) => {
    const supScheme = (rec.tax_scheme || "DPP_NILAI_LAIN") as TaxScheme;
    let defaultCat = "GOODS_DPP_LAIN";
    let defaultPpn = "12";
    let defaultPph = "0";

    if (supScheme === "NON_PKP") {
      defaultCat = "NON_PKP";
      defaultPpn = "0";
      defaultPph = "0";
    } else {
      defaultCat = "GOODS_DPP_LAIN";
      defaultPpn = "12";
      defaultPph = "0";
    }

    setPoForm((prev) => ({
      ...prev,
      supplier_id: rec.id,
      supplier_name: rec.name,
      supplier_npwp: rec.npwp || prev.supplier_npwp || "",
      tax_scheme: supScheme,
      tax_category: defaultCat,
      ppn_rate: defaultPpn,
      pph_rate: defaultPph,
      payment_terms: rec.payment_terms || prev.payment_terms || "Net 30 Days",
    }));
  };

  const handlePoTaxCategoryChange = (val: string) => {
    if (val === "GOODS_DPP_LAIN") {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
        tax_scheme: "DPP_NILAI_LAIN",
        ppn_rate: "12",
        pph_rate: "0",
      }));
    } else if (val === "SERVICES_DPP_LAIN") {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
        tax_scheme: "DPP_NILAI_LAIN",
        ppn_rate: "12",
        pph_rate: "2",
      }));
    } else if (val === "NON_PKP") {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
        tax_scheme: "NON_PKP",
        ppn_rate: "0",
        pph_rate: "0",
      }));
    } else {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
      }));
    }
  };

  const [selectedPoDetails, setSelectedPoDetails] = useState<any>(null);
  const [showPoDocModal, setShowPoDocModal] = useState(false);
  const [showPrDetailsModal, setShowPrDetailsModal] = useState(false);
  const [selectedPrDetails, setSelectedPrDetails] = useState<any>(null);
  const [showAuthorizePoModal, setShowAuthorizePoModal] = useState(false);
  const [showRevisePoModal, setShowRevisePoModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedDocForEmail, setSelectedDocForEmail] = useState<any>(null);

  const exportPdfRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    if (!exportPdfRef.current || !selectedDocForEmail) return;
    try {
      await generatePDF(
        exportPdfRef.current,
        `PO_${selectedDocForEmail.po_number}.pdf`
      );
      showToast("PDF Downloaded. Please attach it to your message.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to generate PDF", "error");
    }
  };

  const [poRevisionNote, setPoRevisionNote] = useState("");
  const [selectedPoToAuth, setSelectedPoToAuth] = useState<any>(null);
  // We will change poAuthDocName to be used for the PIN instead
  const [poAuthPin, setPoAuthPin] = useState("");

  // (Legacy intelligent batching states and hooks removed, integrated into Generation Modal)

  // GRN State
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnAuthPin, setGrnAuthPin] = useState("");
  const [grnItems, setGrnItems] = useState<any[]>([]);
  const [grnForm, setGrnForm] = useState({
    received_date: new Date().toISOString().split("T")[0],
    engineering_user: user?.name || user?.username || "Purchasing Team",
    qc_user: user?.name || user?.username || "Purchasing Team",
    qc_status: "PASSED",
    remarks: "",
  });

  // GRN Report State
  const [showGrnReportModal, setShowGrnReportModal] = useState(false);
  const [completedGrnData, setCompletedGrnData] = useState<any>(null);
  const grnReportRef = useRef<HTMLDivElement>(null);

  // Re-issue Rejected GRN State
  const [showReissueGrnModal, setShowReissueGrnModal] = useState(false);
  const [reissueGrnItems, setReissueGrnItems] = useState<any[]>([]);
  const [reissueGrnForm, setReissueGrnForm] = useState({
    received_date: new Date().toISOString().split("T")[0],
    engineering_user: user?.name || user?.username || "Purchasing Team",
    qc_user: user?.name || user?.username || "Purchasing Team",
    qc_status: "PASSED",
    remarks: "",
    rejected_grn_doc: "",
  });

  useEscapeKey(() => {
    setShowPoModal(false);
    setShowPoDocModal(false);
    setShowPrDetailsModal(false);
    setShowAuthorizePoModal(false);
    setShowGrnModal(false);
    setShowGrnReportModal(false);
    setShowReissueGrnModal(false);
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  });

  useEffect(() => {
    const fetchValidSuppliers = async () => {
      if (selectedPrItems.size === 0 || !showPoModal) return;

      setIsFetchingSuppliers(true);
      try {
        const selectedItems = selectedItemsDetails;
        const itemIds = Array.from(
          new Set(selectedItems.map((p) => p.item_id)),
        ).join(",");

        const res = await apiFetch(
          `/api/purchasing/suppliers-by-items?item_ids=${itemIds}`,
          {},
          user?.username,
        );
        if (res.ok) {
          setValidSuppliers(res.data);
        }
      } catch (err) {
        console.error("Error fetching valid suppliers:", err);
      } finally {
        setIsFetchingSuppliers(false);
      }
    };

    fetchValidSuppliers();
  }, [showPoModal, selectedPrItems, pendingPrs, user?.username]);

  const fetchPoDetailsForGrn = async (poid: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/po/${poid}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        if (!data?.items) return;
        const itemMap = new Map();
        data.items.forEach((item: any) => {
          if (!itemMap.has(item.item_id)) {
            const pending = Math.max(0, item.qty - (item.received_qty || 0));
            itemMap.set(item.item_id, {
              ...item,
              qty: item.qty,
              qty_received: pending, // Default intake to remaining
              received_qty: item.received_qty || 0, // Previously received
            });
          } else {
            const existing = itemMap.get(item.item_id);
            existing.qty += item.qty;
            const newPending = Math.max(
              0,
              existing.qty - existing.received_qty,
            );
            existing.qty_received = newPending;
          }
        });
        setGrnItems(Array.from(itemMap.values()));
        const inspectorName = user?.name || user?.username || "Purchasing Team";
        setGrnForm({
          received_date: new Date().toISOString().split("T")[0],
          engineering_user: inspectorName,
          qc_user: inspectorName,
          qc_status: "PASSED",
          remarks: "",
        });
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch PO details", "error");
    }
  };

  const fetchPoDetailsForReissue = async (poid: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/po/${poid}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        if (!data?.items) return;
        const itemMap = new Map();
        data.items.forEach((item: any) => {
          if (!itemMap.has(item.item_id)) {
            itemMap.set(item.item_id, {
              ...item,
              qty: item.qty,
              qty_received: Math.max(0, item.qty - (item.received_qty || 0)), // Default to remaining
              received_qty: item.received_qty || 0,
            });
          } else {
            const existing = itemMap.get(item.item_id);
            existing.qty += item.qty;
            existing.qty_received = Math.max(0, existing.qty - (existing.received_qty || 0));
          }
        });
        setReissueGrnItems(Array.from(itemMap.values()));
        const inspectorName = user?.name || user?.username || "Purchasing Team";
        setReissueGrnForm({
          received_date: new Date().toISOString().split("T")[0],
          engineering_user: inspectorName,
          qc_user: inspectorName,
          qc_status: "PASSED",
          remarks: "",
          rejected_grn_doc: "",
        });
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch PO details", "error");
    }
  };

  const handleCompleteGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (grnAuthPin !== getDailyAuthKey(user?.username)) {
      showToast("Validation Failed: Invalid Authorization PIN.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/complete-grn",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoDetails.id,
            ...grnForm,
            items: grnItems,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setShowGrnModal(false);
        setGrnAuthPin("");
        // Show GRN Report
        setCompletedGrnData({
          po_number: selectedPoDetails.po_number,
          supplier_name: selectedPoDetails.supplier_name,
          pr_numbers: selectedPoDetails.pr_numbers,
          project_ids: selectedPoDetails.project_ids,
          ...grnForm,
          items: grnItems,
          grn_id: data.grn_id,
          created_at: new Date().toISOString(),
        });
        setShowGrnReportModal(true);
        fetchData();
        showToast(
          "GRN Complete. Item waiting for Warehouse Intake.",
          "success",
        );
      } else {
        showToast(res.error || "Failed to complete GRN", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReissueGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/complete-grn",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoDetails.id,
            received_date: reissueGrnForm.received_date,
            engineering_user: reissueGrnForm.engineering_user,
            qc_user: reissueGrnForm.qc_user,
            qc_status: reissueGrnForm.qc_status,
            remarks: reissueGrnForm.remarks,
            rejected_grn_doc: reissueGrnForm.rejected_grn_doc,
            items: reissueGrnItems,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setShowReissueGrnModal(false);
        // Show GRN Report for re-issue too
        setCompletedGrnData({
          po_number: selectedPoDetails.po_number,
          supplier_name: selectedPoDetails.supplier_name,
          pr_numbers: selectedPoDetails.pr_numbers,
          project_ids: selectedPoDetails.project_ids,
          ...reissueGrnForm,
          items: reissueGrnItems,
          grn_id: data.grn_id,
          created_at: new Date().toISOString(),
          is_reissue: true,
        });
        setShowGrnReportModal(true);
        fetchData();
        showToast(
          "Re-issue GRN Complete. Item waiting for Warehouse Intake.",
          "success",
        );
      } else {
        showToast(res.error || "Failed to re-issue GRN", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportGrnPdf = async () => {
    if (!grnReportRef.current) return;
    setIsSubmitting(true);
    try {
      await generatePDF(
        grnReportRef.current,
        `GRN-${completedGrnData?.grn_id || "Report"}.pdf`,
      );
      showToast(
        "Crisp A4 Portrait GRN document exported successfully",
        "success",
      );
    } catch (err) {
      console.error(err);
      showToast("Export failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const poDocRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [prsData, posData, supData] = await Promise.all([
        apiFetch("/api/purchasing/pending-prs", {}, user?.username),
        apiFetch("/api/purchasing/pos", {}, user?.username),
        apiFetch("/api/suppliers", {}, user?.username),
      ]);

      const sortedPrs = Array.isArray(prsData.data)
        ? prsData.data.sort((a: any, b: any) => {
            if (!a.expected_delivery_date && !b.expected_delivery_date)
              return 0;
            if (!a.expected_delivery_date) return 1;
            if (!b.expected_delivery_date) return -1;
            return (
              new Date(a.expected_delivery_date).getTime() -
              new Date(b.expected_delivery_date).getTime()
            );
          })
        : [];

      setPendingPrs(sortedPrs);
      setPos(Array.isArray(posData.data) ? posData.data : []);
      setSuppliers(Array.isArray(supData.data) ? supData.data : []);
    } catch (err) {
      console.error("Purchasing: Failed to fetch data", err);
      showToast("Error fetching purchasing data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPoDetails = async (poId: string, type: "DOC") => {
    try {
      const res = await apiFetch(
        `/api/purchasing/po/${poId}`,
        {},
        user?.username,
      );
      if (!res.ok || !res.data?.items) {
        throw new Error(res.error || "Failed to fetch PO details");
      }
      setSelectedPoDetails(res.data);
      if (type === "DOC") {
        setShowPoDocModal(true);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch PO details", "error");
    }
  };

  const fetchPrDetails = async (prNumber: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/pr/${prNumber}`,
        {},
        user?.username,
      );
      if (!res.ok || !res.data?.items) {
        throw new Error(res.error || "Failed to fetch PR details");
      }
      setSelectedPrDetails(res.data);
      setShowPrDetailsModal(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch PR details", "error");
    }
  };

  const handleAuthorizePo = async (pin: string) => {
    setIsSubmitting(true);
    try {
      const digitalSignature = `Digitally Authorized by ${user?.name || user?.username} (${user?.role}) on ${new Date().toISOString()}`;
      const res = await apiFetch(
        "/api/purchasing/authorize-po",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoToAuth.id,
            auth_doc_name: digitalSignature,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAuthorizePoModal(false);
        setPoAuthPin("");
        fetchData();
        showToast("PO digitally authorized successfully", "success");
        setSelectedDocForEmail(selectedPoToAuth);
        setShowEmailModal(true);
      } else {
        showToast(res.error || "Failed to authorize PO", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing PO", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevisePo = async (note: string) => {
    if (!note.trim()) {
      showToast("Validation Failed: Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/revise-po",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoToAuth.id,
            revision_note: note,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowRevisePoModal(false);
        setPoRevisionNote("");
        fetchData();
        showToast("PO marked for revision", "success");
      } else {
        showToast(res.error || "Failed to revise PO", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error revising PO", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPo = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Un-bulk / Cancel Purchase Order?",
      message:
        "Are you sure you want to un-bulk/cancel this PO? The internally linked Purchase Request items will be unlinked and returned to the Pending PR list so they can be generated separately.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/po/${id}/cancel`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            setShowPoModal(false);
            setRevisingPo(null);
            fetchData();
            showToast("PO un-bulked / cancelled. PR items returned to pending list.", "success");
          }
        } catch (err) {
          console.error(err);
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeletePo = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Purchase Order?",
      message:
        "Are you sure you want to delete this PO? This will permanently remove it from the system.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/po/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            fetchData();
            showToast("PO deleted successfully!", "success");
          } else {
            showToast(res.error || "Failed to delete PO", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error deleting PO", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleArchivePr = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Purchase Request?",
      message:
        "Are you sure you want to archive this Purchase Request? It will be safely moved to cold-storage and hidden from the active list, while remaining available in history for audits.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/archive-pr/${id}`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            showToast("Purchase Request successfully archived.", "success");
            fetchData();
          } else {
            showToast(
              res.error || "Failed to archive Purchase Request",
              "error",
            );
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to archive Purchase Request", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleArchivePo = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Purchase Order?",
      message:
        "Are you sure you want to archive this Purchase Order? Correct historical records remain intact and fully auditable in historic logs.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/archive-po/${id}`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            showToast("Purchase Order successfully archived.", "success");
            fetchData();
          } else {
            showToast(res.error || "Failed to archive Purchase Order", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Failed to archive Purchase Order", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleArchiveFinishedPos = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Finished Purchase Orders?",
      message:
        "This will archive all FINISHED, CANCELLED, and RECEIVED Purchase Orders from the active workspace. This keeps your queue clean while maintaining flawless audit capability.",
      action: async () => {
        try {
          const res = await apiFetch(
            "/api/purchasing/clear-pos",
            {
              method: "POST",
            },
            user?.username,
          );
          if (res.ok) {
            fetchData();
            showToast(
              "Finished Purchase Orders archived successfully.",
              "success",
            );
          } else {
            showToast(
              res.error || "Failed to archive purchase orders",
              "error",
            );
          }
        } catch (err) {
          console.error(err);
          showToast("Error archiving purchase orders", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const exportPoPdf = async () => {
    if (!poDocRef.current) return;
    setIsSubmitting(true);
    try {
      await generatePDF(
        poDocRef.current,
        `PO_${selectedPoDetails?.po_number || "Doc"}.pdf`,
      );
    } catch (err) {
      console.error(err);
      showToast("Export failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Support deep linking for shared resources
    const params = new URLSearchParams(window.location.search);
    const prParam = params.get("pr");
    const poParam = params.get("po");

    if (prParam) {
      fetchPrDetails(prParam);
    } else if (poParam) {
      fetchPoDetails(poParam, "DOC");
    }
  }, []);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedPrItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPrItems(newSet);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisingPo && selectedPrItems.size === 0) return;

    if (!revisingPo) {
      // Check if any selected item is missing a price
      const selectedItemsList = pendingPrs.filter((p) =>
        selectedPrItems.has(p.pr_item_id),
      );
      const missingPriceItems = selectedItemsList.filter(
        (p) => (!p.unit_price || p.unit_price <= 0) && p.item_type !== 'FINISHED',
      );

      if (missingPriceItems.length > 0) {
        showToast(
          `Cannot issue PO. ${missingPriceItems.length} items missing price. Please update via RFQ.`,
          "error",
        );
        return;
      }
    }

    setIsSubmitting(true);
    const effectivePaymentTerms =
      poForm.payment_terms === "Custom"
        ? (poForm.custom_payment_terms.trim() || "Net 30 Days")
        : (poForm.payment_terms || "Net 30 Days");

    try {
      if (revisingPo) {
        const res = await apiFetch(
          `/api/purchasing/po/${revisingPo.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              supplier_name: poForm.supplier_name,
              supplier_npwp: poForm.supplier_npwp,
              urgency: poForm.urgency,
              tax_category: poForm.tax_category,
              tax_scheme: poForm.tax_scheme,
              ppn_rate: parseFloat(poForm.ppn_rate) || 0,
              pph_rate: parseFloat(poForm.pph_rate) || 0,
              payment_terms: effectivePaymentTerms,
              rounding_factor: Number(poForm.rounding_factor) || 0,
            }),
          },
          user?.username,
        );
        if (res.ok) {
          setShowPoModal(false);
          setRevisingPo(null);
          setPoForm({
            supplier_id: "",
            supplier_name: "",
            supplier_npwp: "",
            urgency: "NORMAL",
            tax_category: "GOODS_DPP_LAIN",
            tax_scheme: "DPP_NILAI_LAIN",
            ppn_rate: "12",
            pph_rate: "0",
            service_amount: "",
            payment_terms: "Net 30 Days",
            custom_payment_terms: "",
            rounding_factor: 0,
          });
          fetchData();
          showToast("PO Revised successfully!", "success");
        } else {
          showToast(res.error || "Failed to revise PO", "error");
        }
      } else {
        const res = await apiFetch(
          "/api/purchasing/create-po",
          {
            method: "POST",
            body: JSON.stringify({
              supplier_id: poForm.supplier_id,
              supplier_name: poForm.supplier_name,
              supplier_npwp: poForm.supplier_npwp,
              urgency: poForm.urgency,
              tax_category: poForm.tax_category,
              tax_scheme: poForm.tax_scheme,
              ppn_rate: parseFloat(poForm.ppn_rate) || 0,
              pph_rate: parseFloat(poForm.pph_rate) || 0,
              payment_terms: effectivePaymentTerms,
              rounding_factor: Number(poForm.rounding_factor) || 0,
              service_amount: parseFloat(poForm.service_amount) || 0,
              pr_item_ids: Array.from(selectedPrItems),
            }),
          },
          user?.username,
        );

        if (res.ok) {
          const data = res.data;
          setShowPoModal(false);
          setSelectedPrItems(new Set());
          setPoForm({
            supplier_id: "",
            supplier_name: "",
            supplier_npwp: "",
            urgency: "NORMAL",
            tax_category: "GOODS_DPP_LAIN",
            tax_scheme: "DPP_NILAI_LAIN",
            ppn_rate: "12",
            pph_rate: "0",
            service_amount: "",
            payment_terms: "Net 30 Days",
            custom_payment_terms: "",
            rounding_factor: 0,
          });
          fetchData();

          // Automatically show the preview for the newly created PO
          if (data.id) {
            fetchPoDetails(data.id, "DOC");
          }
          showToast("PO created successfully!", "success");
        } else {
          showToast(res.error || "Failed to create PO", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast(
        revisingPo ? "Error revising PO" : "Error creating PO",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const suggestions = useMemo(() => {
    const suggestions: { [itemCode: string]: PendingPR[] } = {};
    pendingPrs
      .filter((p) => p.status !== "CANCELLED")
      .forEach((pr) => {
        if (!suggestions[pr.item_code]) suggestions[pr.item_code] = [];
        suggestions[pr.item_code].push(pr);
      });
    return Object.entries(suggestions)
      .filter(([_, group]) => group.length > 1)
      .map(([code, group]) => ({
        itemCode: code,
        name: group[0].item_name,
        count: group.length,
        totalQty: group.reduce((acc, curr) => acc + curr.qty, 0),
        ids: group.map((g) => g.pr_item_id),
      }));
  }, [pendingPrs]);

  const getPoEmailBody = (doc: any) => {
    if (!doc) return "";
    const issueDate = doc.created_at || doc.date || doc.po_date
      ? new Date(doc.created_at || doc.date || doc.po_date).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
    const totalVal = doc.total_amount || doc.grand_total || doc.amount;
    const deliveryDate = doc.expected_delivery_date
      ? new Date(doc.expected_delivery_date).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;
    const itemCount = Array.isArray(doc.items) && doc.items.length > 0 ? doc.items.length : null;

    return `Kepada Yth. Bapak/Ibu ${doc.supplier_name || "Supplier Partner"},

Dengan hormat,

Terima kasih atas kemitraan dan kerja sama yang terjalin baik dengan 𝗖𝗩 𝗕𝗮𝘁𝘂 𝗘𝗺𝗮𝘀 𝗚𝗿𝗼𝘂𝗽.

Bersama surel ini, kami menerbitkan dan melampirkan dokumen resmi 𝗣𝘂𝗿𝗰𝗵𝗮𝘀𝗲 𝗢𝗿𝗱𝗲𝗿 (𝗣𝗢) pengadaan barang/jasa kebutuhan operasional kami.

𝗥𝗶𝗻𝗰𝗶𝗮𝗻 𝗣𝗲𝘀𝗮𝗻𝗮𝗻:
• No. Referensi PO : ${doc.po_number}${issueDate ? `\n• Tanggal PO      : ${issueDate}` : ""}${totalVal ? `\n• Total Nilai PO  : ${formatIDR(totalVal)}` : ""}${itemCount ? `\n• Jumlah Item     : ${itemCount} jenis barang / jasa (spesifikasi terlampir)` : ""}${deliveryDate ? `\n• Target Kirim    : ${deliveryDate}` : ""}

𝗜𝗻𝘀𝘁𝗿𝘂𝗸𝘀𝗶 𝗣𝗲𝗺𝗿𝗼𝘀𝗲𝘀𝗮𝗻 & 𝗣𝗲𝗻𝗴𝗶𝗿𝗶𝗺𝗮𝗻:
Mohon agar pesanan diproses sesuai dengan rincian spesifikasi, kuantitas, serta ketentuan harga yang telah disepakati. Pastikan Surat Jalan (Delivery Order) mencantumkan nomor PO ini saat pengiriman tiba di fasilitas kami.

𝗧𝗶𝗻𝗱𝗮𝗸 𝗟𝗮𝗻𝗷𝘂𝘁:
Mohon konfirmasi penerimaan Purchase Order ini dan estimasi kesiapan pengiriman dengan membalas surel ini. Apabila terdapat kendala teknis atau kebutuhan koordinasi jadwal kirim, harap segera menghubungi tim Procurement kami.

Atas perhatian, waktu, dan kerja sama baiknya, kami ucapkan terima kasih.

Hormat kami,`;
  };

  return (
    <div className="space-y-12 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Purchase Orders"
        subtitle="Purchase orders and supplier requisitions"
        icon={<ShoppingCart className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                if (selectedPrItems.size === 0) return;
                setShowPoModal(true);
              }}
              disabled={
                selectedPrItems.size === 0 ||
                !hasPermission(user, Action.CREATE_PO)
              }
              className="flex items-center gap-2 bg-stone-800 hover:bg-stone-900 text-white shadow-sm"
              title={
                !hasPermission(user, Action.CREATE_PO)
                  ? "Only authorized personnel can generate POs"
                  : ""
              }
            >
              <FileText className="w-5 h-5" /> Generate PO ({selectedPrItems.size}
              )
            </Button>
          </div>
        }
      />

      <div className="flex flex-col lg:flex-row gap-12">
        {/* Left Panel: Pending PRs */}
        <div className="w-full lg:w-[calc(50%-1.5rem)] shrink-0 space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              Authorized PRs
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: "Archive Finished Requests?",
                    message:
                      "Are you sure you want to archive all ORDERED and CANCELLED Purchase Requests? Archived items remain fully traceable under historical logs.",
                    action: async () => {
                      try {
                        const res = await apiFetch(
                          "/api/purchasing/clear-prs",
                          { method: "POST" },
                          user?.username,
                        );
                        if (res.ok) {
                          showToast(
                            "Finished requests successfully archived.",
                            "success",
                          );
                          fetchData();
                        } else {
                          showToast(
                            res.error || "Failed to archive requests",
                            "error",
                          );
                        }
                      } catch (err) {
                        showToast("Action failed", "error");
                      }
                      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                    },
                  });
                }}
                className="p-1 px-2 flex items-center gap-1.5 hover:bg-amber-50 hover:text-amber-800 text-stone-500 rounded-lg border border-transparent hover:border-amber-100/60 transition"
                title="Archive Finished Requests"
              >
                <Archive className="w-3.5 h-3.5 text-amber-600" />
              </Button>
              <Button
                variant="ghost"
                onClick={fetchData}
                className="p-1"
                title="Refresh Data"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
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
              </Button>
            </div>
          </div>

          <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden">
            {isLoading ? (
              <Loader text="Loading data..." className="py-12" />
            ) : pendingPrs.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 bg-stone-50 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckSquare className="w-5 h-5 text-stone-400" />
                </div>
                <div className="text-sm font-bold text-stone-900 uppercase tracking-tighter">
                  All Caught Up
                </div>
                <div className="text-[10px] text-stone-400 mt-1 font-bold uppercase tracking-widest">
                  No pending purchase requests found.
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-100/60 bg-white">
                    <th className="w-12 px-5 py-4 text-center">
                      <button
                        onClick={() => {
                          if (
                            selectedPrItems.size === selectablePrs.length &&
                            selectablePrs.length > 0
                          ) {
                            setSelectedPrItems(new Set());
                          } else {
                            setSelectedPrItems(
                              new Set(selectablePrs.map((p) => p.pr_item_id)),
                            );
                          }
                        }}
                        className="text-stone-400 hover:text-stone-900"
                      >
                        {selectablePrs.length > 0 &&
                        selectedPrItems.size === selectablePrs.length ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-5 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                      Document
                    </th>
                    <th className="px-5 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                      Details
                    </th>
                    <th className="px-5 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">
                      Qty
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100/60">
                  {pendingPrs.map((pr) => {
                    const isSelected = selectedPrItems.has(pr.pr_item_id);
                    const isCancelled = pr.status === "CANCELLED";
                    return (
                      <tr
                        key={pr.pr_item_id}
                        className={cn(
                          "hover:bg-[#F9F9F8]/50 transition-colors",
                          isSelected && "bg-stone-50",
                          isCancelled
                            ? "opacity-60 cursor-not-allowed"
                            : "cursor-pointer",
                        )}
                        onClick={() =>
                          !isCancelled && toggleSelection(pr.pr_item_id)
                        }
                      >
                        <td className="px-4 py-4 text-center">
                          <div
                            className={cn(
                              "inline-flex",
                              isSelected ? "text-stone-900" : "text-stone-400",
                              isCancelled && "opacity-50",
                            )}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div
                                className={cn(
                                  "text-xs font-medium flex items-center gap-2 flex-wrap",
                                  isCancelled
                                    ? "line-through text-stone-400"
                                    : "text-stone-900",
                                )}
                              >
                                {pr.pr_number}
                                {Math.random() > -1 &&
                                  (pr.urgency === "URGENT" ||
                                    pr.urgency === "CRITICAL") && (
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 text-[8px] font-bold rounded uppercase tracking-wider no-underline",
                                        pr.urgency === "CRITICAL"
                                          ? "bg-rose-500 text-white"
                                          : "bg-amber-500 text-amber-50",
                                      )}
                                    >
                                      {pr.urgency}
                                    </span>
                                  )}
                                {isCancelled && (
                                  <span className="px-1.5 py-0.5 text-[8px] font-bold bg-stone-100 text-stone-500 border border-stone-200 rounded uppercase tracking-wider no-underline">
                                    Cancelled
                                  </span>
                                )}
                              </div>
                              <div
                                className="text-[10px] text-stone-500 mt-1"
                                title={pr.project_name}
                              >
                                {pr.project_id}
                              </div>
                              {pr.expected_delivery_date && (
                                <div className="text-[10px] text-emerald-600 font-medium mt-1">
                                  Exp: {pr.expected_delivery_date}
                                </div>
                              )}
                              {pr.drawing_reference && (
                                <a
                                  href={pr.drawing_reference}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 bg-stone-100 text-stone-900 hover:bg-stone-200 rounded text-[10px] font-medium transition-colors max-w-[150px]"
                                  title={pr.drawing_reference.split("/").pop()}
                                >
                                  <FileText className="w-3 h-3 shrink-0" />
                                  <span className="truncate">
                                    View Drawing Ref
                                  </span>
                                </a>
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  shareToForum(
                                    "PR",
                                    pr.pr_number,
                                    `Purchase Request: ${pr.pr_number}`,
                                    `New purchase request ${pr.pr_number} for project ${pr.project_name}. Item: ${pr.item_name} (${pr.qty} ${pr.uom}). Status: ${pr.status}`,
                                  );
                                }}
                                title="Share to Forum"
                              >
                                <Share2 className="w-3.5 h-3.5" /> Share
                              </Button>
                              <Button
                                size="xs"
                                action="view"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fetchPrDetails(pr.pr_id);
                                }}
                              />
                              {(pr.status === "ORDERED" ||
                                pr.status === "RECEIVED" ||
                                pr.status === "CANCELLED") && (
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArchivePr(pr.pr_id);
                                  }}
                                  title="Archive Purchase Request"
                                  className="flex items-center gap-1.5 border border-stone-200/80 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold"
                                >
                                  <Archive className="w-3 h-3 text-stone-500" />{" "}
                                  Archive
                                </Button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 min-w-[200px]">
                          <div className="text-sm font-medium text-stone-900">
                            {pr.item_code}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                            {pr.item_name}
                          </div>
                          {(pr.dimension || pr.spec) && (
                            <div className="text-[10px] text-stone-400 mt-1">
                              {pr.dimension} {pr.spec && `| ${pr.spec}`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="text-sm font-medium text-stone-900">
                            {pr.qty}
                          </div>
                          <div className="text-[10px] text-stone-400 mt-0.5">
                            {pr.uom}
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

        {/* Right Panel: Active POs */}
        <div className="w-full lg:w-[calc(50%-1.5rem)] shrink-0 space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              Active Purchase Orders
            </div>
            <button
              onClick={handleArchiveFinishedPos}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 rounded-xl text-amber-800 transition-all active:scale-95 flex items-center gap-2 shadow-sm"
              title="Archive Finished Purchase Orders"
            >
              <Archive className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest hidden xl:inline">
                Archive Finished
              </span>
            </button>
          </div>

          <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden">
            {isLoading ? (
              <Loader text="Loading..." className="py-12" />
            ) : pos.length === 0 ? (
              <div className="p-12 text-center text-sm text-stone-500">
                No active POs.
              </div>
            ) : (
              <div className="divide-y divide-stone-100/60">
                {pos.map((po) => {
                  const isCancelled = po.status === "CANCELLED";
                  const todayDate = new Date();
                  todayDate.setHours(0, 0, 0, 0);
                  const isLate =
                    po.expected_date &&
                    new Date(po.expected_date) < todayDate &&
                    (po.status === "ISSUED" || po.status === "PARTIAL");

                  return (
                    <div
                      key={po.id}
                      onClick={() => fetchPoDetails(po.id, "DOC")}
                      className={cn(
                        "p-6 transition-colors group cursor-pointer border-l-4",
                        isCancelled
                          ? "opacity-60 bg-stone-50/50 border-stone-200"
                          : "hover:bg-stone-50 border-transparent",
                      )}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div
                            className={cn(
                              "text-sm font-semibold uppercase tracking-widest",
                              isCancelled
                                ? "line-through text-stone-400"
                                : "text-stone-900",
                            )}
                          >
                            {po.po_number}
                          </div>
                          {po.has_cancelled_pr === 1 && !isCancelled && (
                            <span
                              className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest inline-flex items-center gap-1"
                              title="One or more associated PRs have been cancelled"
                            >
                              <AlertCircle className="w-3 h-3" /> PR Cancelled
                            </span>
                          )}
                          {(po.urgency === "URGENT" ||
                            po.urgency === "CRITICAL") && (
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest",
                                po.urgency === "CRITICAL"
                                  ? "bg-rose-500 text-white"
                                  : "bg-amber-500 text-amber-50",
                              )}
                            >
                              {po.urgency}
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            "text-[10px] tracking-wider px-2.5 py-1 rounded-full font-semibold uppercase shrink-0 ml-4",
                            po.status === "DRAFTED"
                              ? "bg-amber-50 text-amber-700"
                              : po.status === "REVISION"
                                ? "bg-rose-50 text-rose-700"
                                : po.status === "CANCELLED"
                                  ? "bg-stone-100 text-stone-500"
                                  : isLate
                                    ? "bg-red-50 text-red-700"
                                    : po.status === "REJECTED"
                                      ? "bg-red-50 text-red-700"
                                      : po.status === "ISSUED" ||
                                          po.status === "PARTIAL"
                                        ? "bg-blue-50 text-blue-700"
                                        : "bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {isLate
                            ? "LATE"
                            : po.status === "RECEIVED"
                              ? "PASSED"
                              : po.status === "ISSUED"
                                ? "ORDERS"
                                : po.status}
                        </div>
                        {(po.status === "DRAFTED" || po.status === "PENDING") &&
                          po.escalated_to && (
                            <div className="text-[10px] tracking-wider px-2.5 py-1 rounded-full font-bold uppercase bg-rose-500 text-white flex items-center gap-1 shadow-sm shrink-0 ml-2">
                              <AlertTriangle className="w-2.5 h-2.5" />{" "}
                              ESCALATED TO {po.escalated_to}
                            </div>
                          )}
                      </div>

                      {/* Visual Stepper Timeline */}
                      {!isCancelled && po.status !== "REJECTED" && (
                        <div className="flex items-center gap-1 mb-4 mt-2 max-w-[280px]">
                          {["DRAFTED", "AUTHORIZED", "ISSUED", "RECEIVED", "FINISHED"].map((step, i, arr) => {
                             let effectiveStatus = po.status;
                             if (effectiveStatus === "PENDING") effectiveStatus = "DRAFTED";
                             if (effectiveStatus === "PARTIAL") effectiveStatus = "ISSUED";
                             if (effectiveStatus === "PAID") effectiveStatus = "FINISHED";
                             
                             const currentIndex = arr.indexOf(effectiveStatus);
                             const stepIndex = i;
                             const isCompleted = stepIndex <= currentIndex && currentIndex !== -1;
                             const isCurrent = stepIndex === currentIndex;
                             return (
                               <div key={step} className="flex-1 flex flex-col gap-1" title={step}>
                                 <div 
                                    className={cn(
                                      "h-1.5 w-full rounded-full transition-all duration-300",
                                      isCompleted ? "bg-emerald-500" : "bg-stone-200",
                                      isCurrent ? "animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : ""
                                    )}
                                 />
                               </div>
                             );
                          })}
                        </div>
                      )}
                      {po.status === "REVISION" && po.revision_note && (
                        <div className="mt-1.5 flex items-start gap-1 p-2 bg-rose-50 border border-rose-100 rounded text-[10px] text-rose-700 max-w-[300px]">
                          <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="italic leading-snug break-words">
                            "{po.revision_note}"
                          </span>
                        </div>
                      )}
                      <div
                        className={cn(
                          "text-sm font-medium mb-1.5 mt-1 flex items-center gap-2",
                          isCancelled ? "text-stone-400" : "text-stone-600",
                        )}
                      >
                        <Truck className="w-4 h-4 text-stone-400" />{" "}
                        {po.supplier_name}
                      </div>
                      <div className="text-xs text-stone-500 mt-3 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> PR:{" "}
                        <span
                          className={cn(
                            "font-medium",
                            isCancelled ? "text-stone-400" : "text-stone-900",
                          )}
                        >
                          {po.pr_numbers || "-"}
                        </span>
                      </div>
                      {po.auth_doc_name && (
                        <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1.5 font-medium">
                          <CheckSquare className="w-3.5 h-3.5" /> PR Auth:{" "}
                          {po.auth_doc_name}
                        </div>
                      )}
                      <div className="flex justify-between items-end mt-4">
                        <div className="text-xs text-stone-500 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            ETA:{" "}
                            <span
                              className={cn(
                                "font-medium",
                                isCancelled
                                  ? "text-stone-400"
                                  : "text-stone-900",
                              )}
                            >
                              {po.expected_date || "TBD"}
                            </span>
                          </div>
                          {po.expected_date &&
                            !isCancelled &&
                            po.status !== "RECEIVED" &&
                            (() => {
                              const eta = new Date(po.expected_date);
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              if (eta < today) {
                                return (
                                  <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest inline-flex items-center gap-1 w-fit">
                                    <AlertCircle className="w-3 h-3" /> Overdue
                                  </span>
                                );
                              }
                              return null;
                            })()}
                        </div>
                        <div className="flex gap-2 text-right">
                          <Button
                            size="xs"
                            action="view"
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchPoDetails(po.id, "DOC");
                            }}
                          />
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              shareToForum(
                                "PO",
                                po.id,
                                `Purchase Order: ${po.po_number}`,
                                `New purchase order ${po.po_number} issued to ${po.supplier_name}. Expected delivery: ${po.expected_date || "TBD"}`,
                              );
                            }}
                            title="Share to Forum"
                          >
                            <Share2 className="w-3.5 h-3.5" /> Share
                          </Button>
                          {(po.status === "RECEIVED" ||
                            po.status === "PARTIAL") && (
                            <div className="px-3 py-1.5 bg-stone-50 text-stone-400 text-[10px] font-bold rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Materials at
                              Warehouse
                            </div>
                          )}
                          {(po.status === "REJECTED" || (po.status === "PARTIAL" && po.has_rejected_grn > 0)) && (
                            <Button
                              size="xs"
                              variant="danger_soft"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSelectedPoDetails(po);
                                await fetchPoDetailsForReissue(po.id);
                                setShowReissueGrnModal(true);
                              }}
                              disabled={!hasPermission(user, Action.RECEIVE_PO)}
                              title="Re-issue GRN for rejected delivery"
                            >
                              <AlertCircle className="w-3.5 h-3.5" /> Issue
                              Reject Status
                            </Button>
                          )}
                          {po.status === "REVISION" &&
                            hasPermission(user, Action.CREATE_PO) && (
                              <>
                                <Button
                                  size="xs"
                                  action="revise"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const res = await apiFetch(
                                      `/api/purchasing/po/${po.id}`,
                                      {},
                                      user?.username,
                                    );
                                    if (res.ok) {
                                      const supScheme = (res.data.tax_scheme || "DPP_NILAI_LAIN") as TaxScheme;
                                      const supTaxCat =
                                        res.data.tax_category ||
                                        (supScheme === "NON_PKP"
                                          ? "NON_PKP"
                                          : supScheme === "STANDARD"
                                            ? (Number(res.data.pph_rate) > 0 ? "SERVICES_DPP_LAIN" : "GOODS_DPP_LAIN")
                                            : (Number(res.data.pph_rate) > 0 ? "SERVICES_DPP_LAIN" : "GOODS_DPP_LAIN"));

                                      setRevisingPo(res.data);
                                      setPoForm({
                                        supplier_id: res.data.supplier_id || "",
                                        supplier_name:
                                          res.data.supplier_name || "",
                                        supplier_npwp: res.data.supplier_npwp || "",
                                        urgency: res.data.urgency || "NORMAL",
                                        tax_category: supTaxCat,
                                        tax_scheme: supScheme,
                                        ppn_rate: String(res.data.ppn_rate ?? 12),
                                        pph_rate: String(res.data.pph_rate ?? 0),
                                        service_amount: "",
                                        payment_terms: res.data.payment_terms || "Net 30 Days",
                                        custom_payment_terms: "",
                                        rounding_factor: res.data.rounding_factor || 0,
                                      });
                                      setShowPoModal(true);
                                    }
                                  }}
                                />
                                <Button
                                  size="xs"
                                  variant="danger_soft"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelPo(po.id);
                                  }}
                                  title="Un-bulk & Return items to Pending PR list"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" /> Un-bulk / Reset
                                </Button>
                              </>
                            )}
                          {po.status === "DRAFTED" && (
                            <>
                              <Button
                                size="xs"
                                action="authorize"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPoToAuth(po);
                                  setShowAuthorizePoModal(true);
                                }}
                                disabled={
                                  !(
                                    hasPermission(user, Action.CREATE_PO) ||
                                    po.escalated_to === user?.role
                                  )
                                }
                              />
                              <Button
                                size="xs"
                                action="revise"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPoToAuth(po);
                                  setShowRevisePoModal(true);
                                }}
                                disabled={
                                  !hasPermission(user, Action.CREATE_PO)
                                }
                              />
                            </>
                          )}
                          {(po.status === "ISSUED" || po.status === "PARTIAL" || po.status === "COMPLETED") && (
                            <button
                              title="Send to Partner"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDocForEmail(po);
                                setShowEmailModal(true);
                              }}
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all flex items-center justify-center border border-blue-200/50"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(po.status === "ISSUED" ||
                            (po.status === "PARTIAL" &&
                              po.pending_qty > 0)) && (
                            <Button
                              size="xs"
                              variant="success_soft"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSelectedPoDetails(po);
                                await fetchPoDetailsForGrn(po.id);
                                setShowGrnModal(true);
                              }}
                              disabled={!hasPermission(user, Action.RECEIVE_PO)}
                              title="Complete Goods Receipt Note"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                              GRN
                            </Button>
                          )}
                          {(po.status === "DRAFTED" ||
                            po.status === "REVISION" ||
                            po.status === "ISSUED") && (
                            <Button
                              size="xs"
                              action="cancel"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelPo(po.id);
                              }}
                              disabled={!hasPermission(user, Action.CREATE_PO)}
                            />
                          )}

                          {(po.status === "COMPLETED" ||
                            po.status === "CANCELLED") && (
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchivePo(po.id);
                              }}
                              title="Archive Purchase Order"
                              className="flex items-center gap-1.5 border border-stone-200/80 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold"
                            >
                              <Archive className="w-3 h-3 text-stone-500" />{" "}
                              Archive
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PO Document Modal */}
      <PoDocumentModal
        isOpen={showPoDocModal && selectedPoDetails !== null}
        onClose={() => setShowPoDocModal(false)}
        selectedPoDetails={selectedPoDetails}
        poDocRef={poDocRef}
        isSubmitting={isSubmitting}
        exportPoPdf={exportPoPdf}
        language={language}
      />

      {/* PR Details Modal */}
      <PrDetailsModal
        isOpen={showPrDetailsModal && selectedPrDetails !== null}
        onClose={() => setShowPrDetailsModal(false)}
        selectedPrDetails={selectedPrDetails}
      />

      {/* Authorize PO Modal */}
      <AuthorizeDocModal
        isOpen={showAuthorizePoModal && selectedPoToAuth !== null}
        onClose={() => setShowAuthorizePoModal(false)}
        docType="Purchase Order"
        docNumber={selectedPoToAuth?.po_number || ""}
        status={selectedPoToAuth?.status || "DRAFT"}
        partnerLabel="Supplier"
        partnerName={selectedPoToAuth?.supplier_name}
        amount={selectedPoToAuth?.total_amount || selectedPoToAuth?.amount}
        isSubmitting={isSubmitting}
        onAuthorize={handleAuthorizePo}
      />

      {/* Revise PO Modal */}
      <ReviseDocModal
        isOpen={showRevisePoModal && selectedPoToAuth !== null}
        onClose={() => setShowRevisePoModal(false)}
        docType="Purchase Order"
        docNumber={selectedPoToAuth?.po_number || ""}
        status={selectedPoToAuth?.status || "DRAFT"}
        partnerLabel="Supplier"
        partnerName={selectedPoToAuth?.supplier_name}
        amount={selectedPoToAuth?.total_amount || selectedPoToAuth?.amount}
        isSubmitting={isSubmitting}
        onRevise={handleRevisePo}
      />

      {/* Send Email Modal */}
      <SendEmailModal
        isOpen={showEmailModal && selectedDocForEmail !== null}
        onClose={() => setShowEmailModal(false)}
        docType="Purchase Order"
        docNumber={selectedDocForEmail?.po_number || ""}
        defaultRecipientEmail={selectedDocForEmail?.supplier_email || ""}
        defaultRecipientPhone={selectedDocForEmail?.supplier_phone || ""}
        defaultRecipientName={selectedDocForEmail?.supplier_name || ""}
        defaultSubject={`Purchase Order (PO) - ${selectedDocForEmail?.po_number}`}
        defaultBody={getPoEmailBody(selectedDocForEmail)}
        onDownloadPdf={handleDownloadPdf}
        onSend={async (data) => {
          let logoSrc = `${window.location.origin}/logo.png`;
          try {
            const response = await fetch('/logo.png');
            const blob = await response.blob();
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            if (base64) logoSrc = base64 as string;
          } catch (err) {
            console.warn("Failed to convert logo to base64", err);
          }

          const htmlSignature = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; background-color: #ffffff; margin-top: 24px; border-top: 2px solid #b02524; padding-top: 16px;">
  <tr>
    <td colspan="3" style="padding-bottom: 15px;">
      <strong style="font-size: 18px; color: #b02524; letter-spacing: 0.5px;">
        <span style="color: #b02524;"><font color="#b02524">ADMIN PURCHASING</font></span>
      </strong>
      <br/>
      <span style="font-size: 13px; color: #666666;">
        <span style="color: #666666;"><font color="#666666">Procurement Division</font></span>
      </span>
    </td>
  </tr>
  <tr>
    <td style="vertical-align: middle; padding-right: 20px; width: 80px;">
      <img src="${logoSrc}" alt="CV Batu Emas Group Logo" width="80" style="display: block; width: 80px; max-width: 80px; height: auto; border: 0;" />
    </td>
    <td style="vertical-align: middle; padding: 0 20px; border-left: 2px solid #e0e0e0; width: 220px; font-size: 12px; color: #555555; line-height: 1.5;">
      <span style="color: #555555;">
        <font color="#555555">Dusun Petahunan, Gambiran,<br/>Banyuwangi, Jawa Timur<br/>Indonesia</font>
      </span>
    </td>
    <td style="vertical-align: middle; padding-left: 20px; border-left: 2px solid #e0e0e0;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/mail.png" width="14" height="14" alt="email" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <a href="mailto:pavingjoss@gmail.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">pavingjoss@gmail.com</font></span>
            </a>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/phone.png" width="14" height="14" alt="phone" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <span style="color: #555555;"><font color="#555555">(+62) 811 1111 3993</font></span>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/domain.png" width="14" height="14" alt="web" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555;">
            <a href="https://www.pavingjoss.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">www.pavingjoss.com</font></span>
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding-top: 20px; font-size: 9px; color: #999999; line-height: 1.4; text-align: justify;">
      <span style="color: #999999;">
        <font color="#999999">The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.</font>
      </span>
    </td>
  </tr>
</table>
          `;

          const plainSignature = `\n\nAdmin Purchasing\nProcurement Division\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCV. Batu Emas Group\nDusun Petahunan, Gambiran, Banyuwangi,\nJawa Timur, Indonesia\nm: (+62) 811 1111 3993\ne: pavingjoss@gmail.com\n\nwww.pavingjoss.com`;

          let copied = false;
          try {
            if (typeof window !== 'undefined' && window.ClipboardItem) {
              const htmlBlob = new Blob([htmlSignature], { type: "text/html" });
              const textBlob = new Blob([plainSignature], { type: "text/plain" });
              const item = new window.ClipboardItem({
                "text/html": htmlBlob,
                "text/plain": textBlob,
              });
              await navigator.clipboard.write([item]);
              copied = true;
            }
          } catch (err) {
            console.warn("Failed to copy rich signature", err);
          }

          const bodyWithPrompt = data.body + (copied ? "\n\n[PASTE (CTRL+V) SIGNATURE ANDA DI SINI]" : plainSignature);

          const mailtoUrl = `mailto:${data.to}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(bodyWithPrompt)}`;
          const a = document.createElement("a");
          a.href = mailtoUrl;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          if (copied) {
            showToast("Tanda tangan disalin! Tekan Ctrl+V di email Anda.", "success");
          } else {
            showToast("Membuka aplikasi email...", "success");
          }
        }}
      />

      {/* Hidden PDF Renderer for List View */}
      {selectedDocForEmail && (
        <PoDocumentModal
          isOpen={true}
          onClose={() => {}}
          selectedPoDetails={selectedDocForEmail}
          poDocRef={exportPdfRef}
          isSubmitting={false}
          exportPoPdf={() => {}}
          language={language}
          isPrintModeHidden={true}
        />
      )}

      {/* Create PO Modal */}
      <CreatePoModal
        isOpen={showPoModal}
        onClose={() => {
          setShowPoModal(false);
          setRevisingPo(null);
        }}
        revisingPo={revisingPo}
        handleCancelPo={handleCancelPo}
        selectedPrItems={selectedPrItems}
        pendingPrs={pendingPrs}
        handleCreatePo={handleCreatePo}
        isFetchingSuppliers={isFetchingSuppliers}
        sortedSuppliers={sortedSuppliers}
        poForm={poForm}
        setPoForm={setPoForm}
        handleSelectSupplierInModal={handleSelectSupplierInModal}
        getSupplierTotalAndPrices={getSupplierTotalAndPrices}
        selectedItemsDetails={selectedItemsDetails}
        validSuppliers={validSuppliers}
        handlePoTaxCategoryChange={handlePoTaxCategoryChange}
        isSubmitting={isSubmitting}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* GRN Modal (Engineering Confirmation) */}
      <GrnModal
        isOpen={showGrnModal && selectedPoDetails !== null}
        onClose={() => setShowGrnModal(false)}
        selectedPoDetails={selectedPoDetails}
        grnForm={grnForm}
        setGrnForm={setGrnForm}
        user={user}
        grnItems={grnItems}
        setGrnItems={setGrnItems}
        grnAuthPin={grnAuthPin}
        setGrnAuthPin={setGrnAuthPin}
        handleCompleteGrn={handleCompleteGrn}
        isSubmitting={isSubmitting}
      />
      {/* Re-issue Rejected GRN Modal */}
      <ReissueGrnModal
        isOpen={showReissueGrnModal && selectedPoDetails !== null}
        onClose={() => setShowReissueGrnModal(false)}
        selectedPoDetails={selectedPoDetails}
        reissueGrnForm={reissueGrnForm}
        setReissueGrnForm={setReissueGrnForm}
        user={user}
        reissueGrnItems={reissueGrnItems}
        setReissueGrnItems={setReissueGrnItems}
        handleReissueGrn={handleReissueGrn}
        isSubmitting={isSubmitting}
      />

      {/* GRN Report Modal */}
      <GrnReportModal
        isOpen={showGrnReportModal && completedGrnData !== null}
        onClose={() => setShowGrnReportModal(false)}
        completedGrnData={completedGrnData}
        grnReportRef={grnReportRef}
        isSubmitting={isSubmitting}
        exportGrnPdf={exportGrnPdf}
        language={language}
      />
    </div>
  );
}

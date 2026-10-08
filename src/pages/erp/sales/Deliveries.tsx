import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiFetch, safeFetchJson } from "@/utils/api";
import {
  PackageOpen,
  Truck,
  X,
  FileText,
  FileCheck,
  Download,
  Plus,
  ArrowUpRight,
  Upload,
  QrCode,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generatePDF } from "@/lib/pdfGenerator";
import { getDailyAuthKey } from "@/utils/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { QRCodeSVG } from "qrcode.react";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { A5LandscapePrintTemplate } from "@/components/erp/A5LandscapePrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { CloudFileUploader } from "@/components/shared/CloudFileUploader";

export default function Deliveries() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t, language } = useLanguage();

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [fgItems, setFgItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showItemSelectModal, setShowItemSelectModal] = useState(false);
  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [selectedDnToAuth, setSelectedDnToAuth] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [deliveryForm, setDeliveryForm] = useState({
    customer_id: "",
    quotation_id: "",
    project_id: "",
    remarks: "",
    items: [] as any[],
    police_number: "",
    delivery_type: "FULL",
    is_partial: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [revisingDn, setRevisingDn] = useState<any>(null);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [selectedDnToRevise, setSelectedDnToRevise] = useState<any>(null);

  const printDocRef = useRef<HTMLDivElement>(null);
  const [previewDn, setPreviewDn] = useState<any>(null);

  // Receipt Modal state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptDn, setSelectedReceiptDn] = useState<any>(null);
  const [receiptForm, setReceiptForm] = useState({
    received_by: "",
    delivered_by: "",
    authorized_by: "",
    receipt_date: new Date().toISOString().split("T")[0],
    notes: "Goods received in complete count and good condition.",
  });
  const receiptDocRef = useRef<HTMLDivElement>(null);

  const handleOpenReceiptModal = async (dn?: any) => {
    const targetDn = dn || (deliveries.length > 0 ? deliveries[0] : null);
    if (targetDn) {
      try {
        const res = await apiFetch(
          `/api/sales/deliveries/${targetDn.id}`,
          {},
          user?.username,
        );
        if (res.ok) {
          setSelectedReceiptDn(res.data);
          setReceiptForm((prev) => ({
            ...prev,
            received_by: res.data.customer_name || "",
            delivered_by: res.data.police_number
              ? `Driver (${res.data.police_number})`
              : "Driver",
            authorized_by: user?.username || "QC Supervisor",
          }));
        } else {
          setSelectedReceiptDn(targetDn);
        }
      } catch {
        setSelectedReceiptDn(targetDn);
      }
    } else {
      setSelectedReceiptDn(null);
    }
    setShowReceiptModal(true);
  };

  const handleExportReceiptPdf = async () => {
    if (!receiptDocRef.current) return;
    setIsSubmitting(true);
    try {
      const docNum = selectedReceiptDn?.dn_number || selectedReceiptDn?.id || "FORM";
      await generatePDF(receiptDocRef.current, `RECEIPT_${docNum}.pdf`, {
        orientation: "landscape",
        format: "a5",
      });
      showToast("Receipt PDF exported successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to export Receipt PDF", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  useEffect(() => {
    fetchDeliveries();
    fetchSupportData();
  }, [user]);

  const fetchDeliveries = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/sales/deliveries`, {}, user?.username);
      if (res.ok) setDeliveries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {}
    setIsLoading(false);
  };

  const fetchSupportData = async () => {
    try {
      const cRes = await apiFetch(`/api/sales/customers`, {}, user?.username);
      if (cRes.ok) setCustomers(Array.isArray(cRes.data) ? cRes.data : []);

      const qRes = await apiFetch(`/api/quotations`, {}, user?.username);
      if (qRes.ok) {
        const rawQuos = Array.isArray(qRes.data) ? qRes.data : Array.isArray(qRes.data?.data) ? qRes.data.data : [];
        setQuotations(rawQuos);
      }

      const pRes = await apiFetch(
        `/api/projects?archived=all`,
        {},
        user?.username,
      );
      if (pRes.ok) setProjects(Array.isArray(pRes.data) ? pRes.data : []);

      const itemsRes = await apiFetch(`/api/items`, {}, user?.username);
      if (itemsRes.ok) {
        const itemsList = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        // Filter for finished goods by category, prefix, or type
        const allFgs = itemsList.filter(
          (i: any) =>
            i.category === "FINISHED_GOODS" ||
            i.item_code?.startsWith("FG-") ||
            i.type === "FINISHED",
        );
        setFgItems(allFgs);
      }
    } catch (err) {}
  };

  const addItemToDelivery = (item: any) => {
    const qid = deliveryForm.quotation_id;
    let autoQty = 1;
    if (qid) {
      const selectedQuo = (Array.isArray(quotations) ? quotations : []).find(
        (q) => q.id === qid,
      );
      if (selectedQuo && Array.isArray(selectedQuo.items) && selectedQuo.items.length > 0) {
        const matchingQuoItem = selectedQuo.items.find(
          (qi: any) =>
            (qi.title &&
              qi.title.toLowerCase().trim() === item.name?.toLowerCase().trim()) ||
            qi.id === item.id,
        );
        if (matchingQuoItem && Number(matchingQuoItem.qty) > 0) {
          autoQty = Number(matchingQuoItem.qty);
        }
      } else {
        const relatedProjects = (Array.isArray(projects) ? projects : []).filter(
          (p) => p.quotation_id === qid,
        );
        const matchingProj = relatedProjects.find(
          (p) =>
            item.item_code === `FG-${p.id}` ||
            item.item_code === `FG-${p.id}-SUB` ||
            p.id === item.id,
        );
        if (matchingProj) {
          autoQty = Number(matchingProj.qty) > 0 ? Number(matchingProj.qty) : 1;
        }
      }
    }
    setDeliveryForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          item_id: item.id,
          item_code: item.item_code,
          item_name: item.name,
          qty: autoQty,
          uom: item.uom,
        },
      ],
    }));
    setShowItemSelectModal(false);
  };

  const handleCreateDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (deliveryForm.items.length === 0)
      return showToast("Add at least one item", "error");

    if (!deliveryForm.is_partial) {
      if (deliveryForm.quotation_id) {
        const selectedQuo = quotations.find((q) => q.id === deliveryForm.quotation_id);
        const relatedProjects = projects.filter(
          (p) =>
            p.quotation_id === deliveryForm.quotation_id ||
            (selectedQuo && p.quotation_number === selectedQuo.quotation_number),
        );
        const unfinished = relatedProjects.filter(
          (p) =>
            p.status !== "FINISHED" &&
            p.status !== "COMPLETED" &&
            p.status !== "CLOSED",
        );
        if (unfinished.length > 0) {
          const unfinishedList = unfinished
            .map((p) => `'${p.name}' (${p.status})`)
            .join(", ");
          return showToast(
            `Cannot issue Full Delivery Note: Quotation '${selectedQuo?.quotation_number || deliveryForm.quotation_id}' has unfinished project(s): ${unfinishedList}. Switch to 'Partial Delivery' if you wish to ship completed lots now.`,
            "error",
          );
        }
      } else if (deliveryForm.project_id) {
        const selectedProj = projects.find(
          (p) => p.id === deliveryForm.project_id,
        );
        if (
          selectedProj &&
          selectedProj.status !== "FINISHED" &&
          selectedProj.status !== "COMPLETED" &&
          selectedProj.status !== "CLOSED"
        ) {
          return showToast(
            `Cannot issue Full Delivery Note: Project '${selectedProj.name}' status is '${selectedProj.status}'. Switch to 'Partial Delivery' for completed lots.`,
            "error",
          );
        }
      }
    }

    setIsSubmitting(true);
    try {
      const url = revisingDn
        ? `/api/sales/deliveries/${revisingDn.id}`
        : "/api/sales/deliveries";
      const method = revisingDn ? "PUT" : "POST";
      const res = await apiFetch(
        url,
        {
          method,
          body: JSON.stringify(deliveryForm),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(
          revisingDn ? "Delivery Note Revised" : "Delivery Note Created",
          "success",
        );
        setDeliveryForm({
          customer_id: "",
          quotation_id: "",
          project_id: "",
          remarks: "",
          items: [],
          police_number: "",
          delivery_type: "FULL",
          is_partial: false,
        });
        setShowDeliveryModal(false);
        setRevisingDn(null);
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviseDn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionNote.trim())
      return showToast("Revision note is required", "error");
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/sales/deliveries/revise-dn",
        {
          method: "POST",
          body: JSON.stringify({
            dn_id: selectedDnToRevise.id,
            revision_note: revisionNote,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Delivery marked for revision", "success");
        setShowReviseModal(false);
        setRevisionNote("");
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed to revise delivery", "error");
      }
    } catch {
      showToast("Error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthorizeDn = (dn: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedDnToAuth(dn);
    setShowAuthorizeModal(true);
  };

  const submitAuthorizeDn = async (submittedPin: string) => {
    if (!selectedDnToAuth) return;
    if (submittedPin !== getDailyAuthKey(user?.username)) {
      showToast("Validation Failed: Invalid Authorization PIN.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/deliveries/${selectedDnToAuth.id}/authorize`,
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast("Delivery Note Authorized and sent to Warehouse", "success");
        setShowAuthorizeModal(false);
        setAuthPin("");
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed to authorize delivery note", "error");
      }
    } catch (err) {
      showToast("Authorization error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartDelivery = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Start Delivery Process",
      message:
        "Are you sure you want to transition this outbound delivery to 'IN_DELIVERY' status? This signifies materials are physically departing.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/sales/deliveries/${id}/start-delivery`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            showToast("Delivery Started", "success");
            fetchDeliveries();
          } else {
            showToast(res.error || "Failed", "error");
          }
        } catch (err) {}
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedFinishDn, setSelectedFinishDn] = useState<any>(null);
  const [finishCloudUrl, setFinishCloudUrl] = useState("");
  const [finishDnFile, setFinishDnFile] = useState<File | null>(null);
  const [authDocName, setAuthDocName] = useState("");

  const handleFinishDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinishDn || (!finishCloudUrl && !finishDnFile))
      return showToast("Select or upload a scanned manifest document first", "error");
    setIsSubmitting(true);
    try {
      let finalUrl = finishCloudUrl;
      if (!finalUrl && finishDnFile) {
        const formData = new FormData();
        formData.append("file", finishDnFile);
        const upRes = await apiFetch(
          "/api/upload",
          { method: "POST", body: formData },
          user?.username,
        );
        if (!upRes.ok) throw new Error(upRes.error || "Upload failed");
        finalUrl = upRes.data.url || upRes.data.fileUrl;
      }

      const res = await apiFetch(
        `/api/sales/deliveries/${selectedFinishDn.id}/finish-delivery`,
        {
          method: "POST",
          body: JSON.stringify({
            file_url: finalUrl,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Delivery Completed Successfully", "success");
        setShowFinishModal(false);
        setFinishCloudUrl("");
        setFinishDnFile(null);
        setAuthDocName("");
        setSelectedFinishDn(null);
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error processing delivery signature", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewDeliveryDoc = async (id: string) => {
    try {
      const res = await apiFetch(
        `/api/sales/deliveries/${id}`,
        {},
        user?.username,
      );
      if (res.ok) {
        setPreviewDn(res.data);
      }
    } catch (e) {}
  };

  const exportPdf = async () => {
    if (!printDocRef.current || !previewDn) return;
    setIsSubmitting(true);
    try {
      await generatePDF(printDocRef.current, `${previewDn.dn_number}.pdf`);
      showToast("PDF exported successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to generate PDF", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCustomer = customers.find(
    (c) => c.id === deliveryForm.customer_id,
  );

  return (
    <div className="space-y-12 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Delivery Manifests"
        subtitle="Outbound shipments and delivery notes"
        icon={<Truck className="w-6 h-6" />}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedReceiptDn(null);
                setShowReceiptModal(true);
              }}
              className="h-10 px-4 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors border border-amber-200 shadow-3xs active:scale-95"
              title="Download A5 Blank Receipt Template PDF"
            >
              <FileCheck className="w-4 h-4 text-amber-600" />
              <span>Receipt Template (A5 PDF)</span>
            </button>
            {hasPermission(user, Action.CREATE_DELIVERY) && (
              <Button
                onClick={() => {
                  setRevisingDn(null);
                  setDeliveryForm({
                    customer_id: "",
                    quotation_id: "",
                    project_id: "",
                    remarks: "",
                    items: [],
                    police_number: "",
                    delivery_type: "FULL",
                    is_partial: false,
                  });
                  setShowDeliveryModal(true);
                }}
                className="flex items-center gap-2"
              >
                <ArrowUpRight className="w-4 h-4" /> Initiate Delivery
              </Button>
            )}
          </div>
        }
      />

      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm relative">
        <div className="border-b border-stone-100 bg-stone-50/50 p-6 flex justify-between items-center">
          <h3 className="text-sm font-bold text-stone-900 uppercase tracking-widest">
            Active DN
          </h3>
          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
            Pending & In-Delivery
          </div>
        </div>
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-stone-500 w-[120px]">
                  DN Ref
                </th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-stone-500">
                  Destination
                </th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-stone-500 w-[140px]">
                  Status
                </th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-stone-500 w-[200px] text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && deliveries.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-sm font-medium text-stone-400"
                  >
                    No deliveries registered in the system.
                  </td>
                </tr>
              )}
              {deliveries.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-stone-100 hover:bg-stone-50/50 transition-colors last:border-0 group cursor-pointer"
                  onClick={() => viewDeliveryDoc(d.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-stone-900">
                        {d.dn_number}
                      </span>
                      {d.is_partial || d.delivery_type === "PARTIAL" ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded border border-amber-300 uppercase tracking-wider">
                          Partial
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 rounded border border-emerald-300 uppercase tracking-wider">
                          Full
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-stone-800">
                      {d.customer_name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {d.quotation_number ? (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold rounded-md flex items-center gap-1">
                          <FileText className="w-3 h-3 text-indigo-500" />
                          {d.quotation_number}
                        </span>
                      ) : d.project_name ? (
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-mono font-bold rounded-md">
                          {d.project_name}
                        </span>
                      ) : null}

                      {d.project_names && (
                        <span
                          className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-bold rounded-md tracking-wider uppercase"
                          title={`Scope Projects: ${d.project_names}`}
                        >
                          {d.project_names.includes(",")
                            ? `Bulk (${d.project_names.split(",").length} Projects)`
                            : d.project_names}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-lg border inline-block",
                        d.status === "DRAFT"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : d.status === "AUTHORIZED"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : d.status === "REVISION"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : d.status === "PENDING_DELIVERY"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : d.status === "IN_DELIVERY"
                                  ? "bg-sky-50 text-sky-700 border-sky-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200",
                      )}
                    >
                      {d.status === "DRAFT"
                        ? "Awaiting Sales Auth"
                        : d.status === "AUTHORIZED"
                          ? "Authorized (Warehouse Pending)"
                          : d.status === "PENDING_DELIVERY"
                            ? "Dispatched"
                            : d.status.replace("_", " ")}
                    </span>
                    {d.status === "REVISION" && d.revision_note && (
                      <div className="mt-1.5 flex items-start gap-1 p-1.5 bg-rose-50 border border-rose-100 rounded text-[10px] text-rose-700 max-w-[200px]">
                        <span className="italic leading-snug break-words">
                          "{d.revision_note}"
                        </span>
                      </div>
                    )}
                    {d.authorized_by && (
                      <div className="text-[9px] font-medium text-stone-400 mt-1">
                        Auth: {d.authorized_by}
                      </div>
                    )}
                  </td>
                  <td
                    className="px-6 py-4 text-right flex justify-end items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {d.status === "DRAFT" &&
                      hasPermission(user, Action.AUTH_DELIVERY) && (
                        <Button
                          size="xs"
                          action="authorize"
                          onClick={(e) => handleAuthorizeDn(d, e)}
                        />
                      )}
                    {(d.status === "DRAFT" || d.status === "AUTHORIZED") &&
                      (hasPermission(user, Action.AUTH_DELIVERY) ||
                        hasPermission(user, Action.DISPATCH_GOODS)) && (
                        <Button
                          size="xs"
                          action="revise"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDnToRevise(d);
                            setShowReviseModal(true);
                          }}
                        />
                      )}
                    {d.status === "REVISION" &&
                      hasPermission(user, Action.CREATE_DELIVERY) && (
                        <Button
                          size="xs"
                          action="revise"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const res = await apiFetch(
                              `/api/sales/deliveries/${d.id}`,
                              {},
                              user?.username,
                            );
                            if (res.ok) {
                              setRevisingDn(res.data);
                              setDeliveryForm({
                                customer_id: res.data.customer_id || "",
                                quotation_id: res.data.quotation_id || "",
                                project_id: res.data.project_id || "",
                                police_number: res.data.police_number || "",
                                remarks: res.data.remarks || "",
                                delivery_type: res.data.delivery_type || "FULL",
                                is_partial: !!res.data.is_partial,
                                items: res.data.items.map((i: any) => ({
                                  item_id: i.item_id,
                                  item_code: i.item_code,
                                  item_name: i.item_name,
                                  qty: i.qty,
                                  uom: i.uom || "Unit",
                                })),
                              });
                              setShowDeliveryModal(true);
                            }
                          }}
                        />
                      )}
                    {(d.status === "IN_DELIVERY" || d.status === "PENDING_DELIVERY") &&
                      (hasPermission(user, Action.CREATE_DELIVERY) ||
                        hasPermission(user, Action.DISPATCH_GOODS) ||
                        hasPermission(user, Action.SALES_ACTION)) && (
                        <Button
                          size="xs"
                          variant="success"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFinishDn(d);
                            setShowFinishModal(true);
                          }}
                        >
                          <PackageOpen className="w-3.5 h-3.5" /> Finish
                          Delivery
                        </Button>
                      )}
                    <Button
                      size="xs"
                      action="view"
                      onClick={(e) => {
                        e.stopPropagation();
                        viewDeliveryDoc(d.id);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Initiate Delivery Modal */}
      <Modal
        isOpen={showDeliveryModal}
        onClose={() => {
          setShowDeliveryModal(false);
          setRevisingDn(null);
        }}
        title={
          revisingDn
            ? `Revise Outbound Note: ${revisingDn.dn_number}`
            : "Initiate Outbound Note"
        }
        maxWidth="4xl"
        contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
      >
        <form onSubmit={handleCreateDelivery} className="flex flex-col h-full">
          <div className="p-8 overflow-y-auto space-y-8 bg-stone-50 flex-1">
            <div className="flex flex-col mb-6">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                Destination / Customer <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={deliveryForm.customer_id}
                onChange={(e) => {
                  const cid = e.target.value;
                  setDeliveryForm((prev) => ({
                    ...prev,
                    customer_id: cid,
                    quotation_id: "",
                    project_id: "",
                    items: [],
                  }));
                }}
                className="w-full px-4 py-3 bg-white border border-stone-200 text-sm font-bold text-stone-900 rounded-xl focus:border-stone-400 outline-none transition-all shadow-sm"
              >
                <option value="">-- Select Destination --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {deliveryForm.customer_id && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="flex flex-col">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                    Related Quotation (Penawaran Harga){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={deliveryForm.quotation_id}
                    onChange={(e) => {
                      const qid = e.target.value;
                      const selectedQuo = quotations.find((q) => q.id === qid);
                      const relatedProjects = projects.filter(
                        (p) =>
                          p.quotation_id === qid ||
                          (selectedQuo &&
                            p.quotation_number === selectedQuo.quotation_number),
                      );

                      let newItems: any[] = [];
                      if (relatedProjects.length > 0) {
                        for (const proj of relatedProjects) {
                          const matchingFg = fgItems.find(
                            (i) =>
                              i.item_code === `FG-${proj.id}` ||
                              i.item_code === `FG-${proj.id}-SUB`,
                          );
                          const pQty = Number(proj.qty) > 0 ? Number(proj.proj_qty || proj.qty) : 1;
                          if (matchingFg) {
                            newItems.push({
                              item_id: matchingFg.id,
                              item_code: matchingFg.item_code,
                              item_name: `${matchingFg.name} (${proj.name})`,
                              qty: pQty,
                              uom: matchingFg.uom || proj.uom || "Unit",
                            });
                          } else {
                            newItems.push({
                              item_id: proj.id,
                              item_code: `FG-${proj.id}`,
                              item_name: `Finish Good - ${proj.name}`,
                              qty: pQty,
                              uom: proj.uom || "Unit",
                            });
                          }
                        }
                      } else if (
                        selectedQuo &&
                        selectedQuo.items &&
                        selectedQuo.items.length > 0
                      ) {
                        newItems = selectedQuo.items.map((it: any) => {
                          return {
                            item_id: it.id,
                            item_code: it.item_code || `QI-${it.id.slice(0, 8)}`,
                            item_name: it.title || it.description || it.item_name || "Commercial Product",
                            qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
                            uom: it.uom || "Unit",
                          };
                        });
                      }

                      setDeliveryForm((prev) => ({
                        ...prev,
                        quotation_id: qid,
                        project_id:
                          relatedProjects.length > 0 ? relatedProjects[0].id : "",
                        items: newItems,
                      }));
                    }}
                    className="w-full px-4 py-3 bg-white border border-stone-200 text-sm font-bold text-stone-900 rounded-xl focus:border-stone-400 outline-none transition-all shadow-sm"
                  >
                    <option value="">-- Select Related Quotation --</option>
                    {(Array.isArray(quotations) ? quotations : [])
                      .filter((q) => {
                        const selectedCustomerObj = (Array.isArray(customers) ? customers : []).find(
                          (c) => c.id === deliveryForm.customer_id,
                        );
                        return (
                          q.customer_id === deliveryForm.customer_id ||
                          (selectedCustomerObj &&
                            q.customer_name &&
                            q.customer_name.toLowerCase().trim() ===
                              selectedCustomerObj.name.toLowerCase().trim())
                        );
                      })
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.quotation_number || q.id} - {q.title || "Quotation"}{" "}
                          ({q.status})
                        </option>
                      ))}
                  </select>

                  {/* Bulk Order / Related Projects Status Card */}
                  {deliveryForm.quotation_id && (() => {
                    const selectedQuo = (Array.isArray(quotations) ? quotations : []).find(
                      (q) => q.id === deliveryForm.quotation_id,
                    );
                    const relatedProjects = (Array.isArray(projects) ? projects : []).filter(
                      (p) =>
                        p.quotation_id === deliveryForm.quotation_id ||
                        (selectedQuo &&
                          p.quotation_number === selectedQuo.quotation_number),
                    );
                    const unfinished = (Array.isArray(relatedProjects) ? relatedProjects : []).filter(
                      (p) =>
                        p.status !== "FINISHED" &&
                        p.status !== "COMPLETED" &&
                        p.status !== "CLOSED",
                    );

                    return (
                      <div className="mt-3 space-y-2">
                        {relatedProjects.length > 0 ? (
                          <div className="p-3 bg-stone-100/80 border border-stone-200 rounded-xl text-xs space-y-2">
                            <div className="flex items-center justify-between font-bold text-stone-800">
                              <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-stone-600">
                                <Layers className="w-3.5 h-3.5 text-stone-500" />{" "}
                                Bulk Order Scope ({relatedProjects.length} Proyek)
                              </span>
                              {unfinished.length === 0 ? (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-extrabold rounded uppercase tracking-wider">
                                  ✓ All Finished
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-extrabold rounded uppercase tracking-wider">
                                  {unfinished.length} Pending Unfinished
                                </span>
                              )}
                            </div>
                            <div className="space-y-1">
                              {relatedProjects.map((p) => {
                                const isDone =
                                  p.status === "FINISHED" ||
                                  p.status === "COMPLETED" ||
                                  p.status === "CLOSED";
                                return (
                                  <div
                                    key={p.id}
                                    className="flex items-center justify-between py-1 border-b border-stone-200/50 last:border-0 text-[11px]"
                                  >
                                    <span className="font-mono text-stone-700">
                                      {p.id} -{" "}
                                      <span className="font-sans font-bold text-stone-900">
                                        {p.name}
                                      </span>
                                    </span>
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider",
                                        isDone
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : "bg-amber-50 text-amber-700 border border-amber-200",
                                      )}
                                    >
                                      {p.status}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-600 font-medium italic">
                            Menggunakan item dari penawaran harga.
                          </div>
                        )}

                        {unfinished.length > 0 && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-extrabold uppercase tracking-wide text-[10px] text-amber-950">
                                Partial Lots Available
                              </div>
                              <div className="mt-0.5 text-[11px] leading-snug text-amber-800">
                                Beberapa proyek masih dalam proses ({unfinished.map((u) => u.name).join(", ")}). Anda dapat memilih <strong>Partial Lot Delivery</strong> di bawah untuk mengirim unit yang sudah selesai lebih awal.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Delivery Mode: Full vs Partial */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-600">
                    Shipment Type / Jenis Pengiriman
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryForm(prev => ({ ...prev, delivery_type: "FULL", is_partial: false }))}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        !deliveryForm.is_partial
                          ? "bg-white border-blue-600 shadow-sm ring-2 ring-blue-500/20"
                          : "bg-stone-100/50 border-stone-200 opacity-60 hover:opacity-100"
                      )}
                    >
                      <div className="text-xs font-bold text-stone-900">Full Delivery</div>
                      <div className="text-[10px] text-stone-500">Kirim seluruh pesanan secara utuh</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryForm(prev => ({ ...prev, delivery_type: "PARTIAL", is_partial: true }))}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        deliveryForm.is_partial
                          ? "bg-white border-amber-600 shadow-sm ring-2 ring-amber-500/20"
                          : "bg-stone-100/50 border-stone-200 opacity-60 hover:opacity-100"
                      )}
                    >
                      <div className="text-xs font-bold text-amber-900">Partial Lot Delivery</div>
                      <div className="text-[10px] text-amber-700">Kirim bertahap per lot/batch</div>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                    {language === "id"
                      ? "Nomor Polisi Kendaraan"
                      : "Vehicle Police Number"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      language === "id"
                        ? "Contoh: DK 1234 AB"
                        : "e.g., DK 1234 AB"
                    }
                    value={deliveryForm.police_number}
                    onChange={(e) =>
                      setDeliveryForm((prev) => ({
                        ...prev,
                        police_number: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-4 py-3 bg-white border border-stone-200 text-sm font-extrabold text-stone-900 rounded-xl focus:border-stone-400 outline-none transition-all shadow-sm"
                  />
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-stone-200">
              <div className="flex items-center justify-between mb-4 mt-6">
                <span className="text-sm font-bold text-stone-900 uppercase tracking-wide">
                  Delivery Payload
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!deliveryForm.quotation_id) {
                        showToast("Please select a Quotation first.", "error");
                        return;
                      }
                      const selectedQuo = quotations.find(q => q.id === deliveryForm.quotation_id);
                      if (selectedQuo && selectedQuo.items && selectedQuo.items.length > 0) {
                        const newItems = selectedQuo.items.map((qi: any) => ({
                          item_id: qi.id,
                          item_code: "SPK-ITEM",
                          item_name: qi.title,
                          qty: qi.qty,
                          uom: qi.uom || 'Unit'
                        }));
                        setDeliveryForm(prev => ({
                          ...prev,
                          items: [...prev.items, ...newItems]
                        }));
                        showToast("Deliverables loaded from SPK.", "success");
                      } else {
                        showToast("No items found in the selected Quotation.", "error");
                      }
                    }}
                    className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-[10px] text-blue-700 font-bold uppercase tracking-widest rounded-lg flex gap-1.5 items-center transition-colors border border-blue-200"
                  >
                    <Layers className="w-3.5 h-3.5" /> Load SPK Deliverables
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowItemSelectModal(true)}
                    className="px-4 py-2 bg-stone-200/50 hover:bg-stone-200 text-[10px] text-stone-900 font-bold uppercase tracking-widest rounded-lg flex gap-1.5 items-center transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Items
                  </button>
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold tracking-widest text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Item Spec</th>
                      <th className="px-4 py-3 w-32">Qty</th>
                      <th className="px-4 py-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryForm.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-6 text-center text-xs font-medium text-stone-400"
                        >
                          No products added.
                        </td>
                      </tr>
                    )}
                    {deliveryForm.items.map((it, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50"
                      >
                        <td className="px-4 py-3 font-medium text-stone-900">
                          <div className="font-mono text-[10px] text-stone-400 font-bold mb-1">
                            {it.item_code}
                          </div>
                          {it.item_name}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0.1}
                              step="0.1"
                              value={it.qty}
                              onChange={(e) => {
                                const newItems = [...deliveryForm.items];
                                newItems[idx].qty =
                                  parseFloat(e.target.value) || 0;
                                setDeliveryForm({
                                  ...deliveryForm,
                                  items: newItems,
                                });
                              }}
                              className="w-20 px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-md font-mono text-xs text-center outline-none"
                            />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                              {it.uom}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const n = [...deliveryForm.items];
                              n.splice(idx, 1);
                              setDeliveryForm({ ...deliveryForm, items: n });
                            }}
                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2 mt-4">
                Remarks
              </label>
              <textarea
                rows={2}
                value={deliveryForm.remarks}
                onChange={(e) =>
                  setDeliveryForm({ ...deliveryForm, remarks: e.target.value })
                }
                className="w-full px-4 py-3 bg-white border border-stone-200 text-sm font-medium text-stone-900 rounded-xl focus:border-stone-400 outline-none transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="p-6 border-t border-stone-100 flex justify-end gap-3 bg-white shrink-0">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDeliveryModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Processing..." : "Create Draft Manifest"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Item Select Modal */}
      <Modal
        isOpen={showItemSelectModal}
        onClose={() => setShowItemSelectModal(false)}
        title="Select Available SKUs (FG)"
        maxWidth="xl"
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-3">
          {fgItems.map((item) => {
            return (
              <div
                key={item.id}
                onClick={() => addItemToDelivery(item)}
                className={cn(
                  "p-4 border bg-white rounded-2xl hover:border-stone-400 cursor-pointer transition-all flex justify-between items-center group shadow-sm hover:shadow-md border-stone-200",
                )}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="text-[10px] font-bold font-mono text-stone-400">
                      {item.item_code}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-stone-900">
                    {item.name}
                  </div>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest bg-stone-100 text-stone-500 px-3 py-1 rounded-md group-hover:bg-stone-800 group-hover:text-white transition-colors">
                  Select
                </div>
              </div>
            );
          })}
          {fgItems.length === 0 && (
            <div className="py-12 text-center text-stone-500 text-sm font-medium">
              No Finish Good SKUs are available in inventory yet. Use the
              Production/Engineering module to create FINISH_GOODS.
            </div>
          )}
        </div>
      </Modal>

      {/* Revise Modal */}
      <Modal
        isOpen={showReviseModal && selectedDnToRevise !== null}
        onClose={() => setShowReviseModal(false)}
        maxWidth="2xl"
        title={
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Revise Delivery Note
            </h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
              Return to Sales for Changes
            </p>
          </div>
        }
      >
        <form onSubmit={handleReviseDn} className="space-y-6 pt-2">
          {selectedDnToRevise && (
            <div className="p-5 bg-stone-50 rounded-2xl border border-stone-100 mb-2">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1.5">
                Draft DN Reference
              </div>
              <div className="text-base font-bold text-stone-900">
                {selectedDnToRevise.dn_number}
              </div>
              <div className="text-xs text-stone-500 mt-1 font-medium italic">
                Customer: {selectedDnToRevise.customer_name}
              </div>
            </div>
          )}

          <div className="flex gap-4 p-5 bg-rose-50/50 rounded-2xl border border-rose-100/50">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 mt-1">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div className="w-full">
              <h4 className="text-xs font-bold text-stone-900 mb-1">
                Revision Note
              </h4>
              <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                Provide clear instructions on what needs to be changed exactly
                like adding a note on a field condition. This will be sent back
                to the sales team.
              </p>
              <textarea
                required
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="E.g., Incorrect finish good quantities or wrong project..."
                className="w-full h-24 bg-white border border-stone-200 text-stone-900 text-sm rounded-lg px-4 py-3 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all shadow-sm resize-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3 mt-6">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowReviseModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isSubmitting ? "Processing..." : "Submit Revision"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Finish Delivery Modal with standard file upload */}
      <Modal
        isOpen={showFinishModal}
        onClose={() => {
          setShowFinishModal(false);
          setFinishDnFile(null);
          setAuthDocName("");
        }}
        title="Finish Delivery"
        maxWidth="md"
        contentClassName="p-0 border-t border-stone-100"
      >
        {selectedFinishDn && (
          <form onSubmit={handleFinishDelivery} className="p-6 space-y-6">
            <div className="p-5 bg-stone-50 rounded-2xl border border-stone-100 mb-2">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1.5">
                Delivery Reference
              </div>
              <div className="text-base font-bold text-stone-900">
                {selectedFinishDn.dn_number}
              </div>
              <div className="text-xs text-stone-500 mt-1 font-medium italic">
                Customer: {selectedFinishDn.customer_name}
              </div>
            </div>

            <div className="space-y-2">
              <CloudFileUploader
                label="Customer Signed Manifest (Direct Cloud Storage)"
                accept=".pdf,.png,.jpg,.jpeg"
                maxSizeMb={20}
                value={finishCloudUrl}
                onChange={(url) => setFinishCloudUrl(url)}
                onUploadSuccess={(url, file) => {
                  setFinishCloudUrl(url);
                  setAuthDocName(file.name);
                }}
                pathPrefix="delivery_receipts"
              />
              <p className="text-[9px] text-rose-500 font-medium tracking-wide uppercase mt-1">
                * Manifest must be signed by the receiving party (Customer / Client).
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-3 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowFinishModal(false);
                  setFinishCloudUrl("");
                  setFinishDnFile(null);
                  setAuthDocName("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={isSubmitting || (!finishCloudUrl && !finishDnFile)}
                type="submit"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isSubmitting ? "Completing..." : "Confirm Completion"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Preview Delivery Note Document - standard layout and export styling */}
      <Modal
        isOpen={!!previewDn}
        onClose={() => setPreviewDn(null)}
        title="Delivery Note Document"
        maxWidth="5xl"
        contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
      >
        {previewDn && (
          <>
            <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
              <PdfPreviewWrapper>
<PrintTemplate
                ref={printDocRef}
                documentTitleId="SURAT JALAN"
                documentTitleEn="DELIVERY NOTE"
                documentNameId="surat jalan"
                documentNameEn="delivery note"
                date={new Date(previewDn.created_at).toLocaleDateString(
                  "id-ID",
                  {
                    timeZone: "Asia/Jakarta",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  },
                )}
                referenceNumber={previewDn.dn_number}
                documentId={previewDn.dn_number || previewDn.id}
                isDraft={previewDn.status === "DRAFT"}
                signatureStatus="signed"
              >
                {/* Grid Info */}
                <div className="grid grid-cols-2 gap-10 mb-8 pb-4 border-b border-stone-200">
                  <div>
                    <div className="text-[10px] font-extrabold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-150 pb-1">
                      Ditujukan Kepada{" "}
                      <span className="font-semibold text-stone-500">
                        / Destined To (Consignee)
                      </span>
                    </div>
                    <div className="text-lg font-black text-stone-950 uppercase tracking-tight mb-1.5">
                      {previewDn.customer_name}
                    </div>
                    <div className="text-xs font-semibold text-stone-800 leading-relaxed whitespace-pre-wrap">
                      {previewDn.customer_address}
                    </div>
                    {previewDn.customer_email && (
                      <div className="text-xs font-medium text-stone-600 mt-1">
                        {previewDn.customer_email}
                      </div>
                    )}
                    {previewDn.customer_phone && (
                      <div className="text-xs font-medium text-stone-600 mt-0.5">
                        {previewDn.customer_phone}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-extrabold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-150 pb-1">
                      Referensi Logistik{" "}
                      <span className="font-semibold text-stone-500">
                        / Logistics Reference
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-medium mb-2">
                      <span className="text-stone-900 uppercase tracking-wider font-bold text-[10px]">
                        No. Penawaran{" "}
                        <span className="font-semibold text-stone-500">
                          / Ref. Quotation:
                        </span>
                      </span>
                      <span className="font-black bg-stone-50 text-stone-950 px-3 py-1 rounded text-xs tracking-wider uppercase border border-stone-300 font-mono shadow-2xs">
                        {previewDn.quotation_number || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-medium mb-2">
                      <span className="text-stone-900 uppercase tracking-wider font-bold text-[10px]">
                        Status Produk{" "}
                        <span className="font-semibold text-stone-500">
                          / Product Status:
                        </span>
                      </span>
                      <span className="font-black bg-stone-50 text-stone-900 px-3 py-1 rounded text-xs tracking-wider uppercase border border-stone-300 shadow-2xs">
                        ASSEMBLED
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-medium mb-2">
                      <span className="text-stone-900 uppercase tracking-wider font-bold text-[10px]">
                        Nomor Polisi{" "}
                        <span className="font-semibold text-stone-500">
                          / Police Number:
                        </span>
                      </span>
                      <span className="font-black bg-stone-50 text-stone-950 px-3 py-1 rounded text-xs tracking-wider uppercase border border-stone-300 font-mono shadow-2xs">
                        {previewDn.police_number || "-"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="flex-1 relative">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-stone-900 bg-stone-50/50">
                        <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs w-12 text-center">
                          No
                        </th>
                        <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs w-36">
                          Kode Barang{" "}
                          <span className="font-semibold text-stone-500 text-[8.5px] block mt-0.5">
                            / ITEM CODE
                          </span>
                        </th>
                        <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs">
                          Deskripsi Produk{" "}
                          <span className="font-semibold text-stone-500 text-[8.5px] block mt-0.5">
                            / PRODUCT DESC
                          </span>
                        </th>
                        <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs text-center w-28">
                          Jumlah{" "}
                          <span className="font-semibold text-stone-500 text-[8.5px] block mt-0.5">
                            / QTY
                          </span>
                        </th>
                        <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs text-center w-24">
                          Sat{" "}
                          <span className="font-semibold text-stone-500 text-[8.5px] block mt-0.5">
                            / UOM
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDn.items?.map((it: any, i: number) => (
                        <tr key={i} className="border-b border-stone-200">
                          <td className="py-4 px-3 text-sm font-bold text-center text-stone-800">
                            {String(i + 1).padStart(2, "0")}
                          </td>
                          <td className="py-4 px-3 font-mono text-xs font-bold text-stone-700">
                            {it.item_code}
                          </td>
                          <td className="py-4 px-3 text-sm font-black text-stone-950 uppercase tracking-tight leading-snug">
                            {it.item_name}
                          </td>
                          <td className="py-4 px-3 text-base font-black text-center font-mono text-stone-950">
                            {it.qty}
                          </td>
                          <td className="py-4 px-3 text-xs font-black text-center text-stone-800 uppercase tracking-wider">
                            {it.uom}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {previewDn.remarks && (
                    <div className="mt-8 p-4 bg-stone-50/70 border border-stone-200 rounded-xl">
                      <div className="text-[9.5px] font-black uppercase tracking-wider text-stone-900 mb-1">
                        Info Pengiriman{" "}
                        <span className="font-semibold text-stone-500">
                          / Outbound Remarks
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-stone-800 leading-relaxed italic">
                        {previewDn.remarks}
                      </div>
                    </div>
                  )}
                </div>

                {/* Standardized multi-column logistics signatures for Delivery Note */}
                <div className="mt-auto grid grid-cols-4 gap-4 pt-8 border-t border-stone-200">
                  <div className="text-center font-sans">
                    <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                      Received by Customer
                    </div>
                    <div className="h-12 flex flex-col justify-end items-center mb-1">
                      {previewDn.signatures
                        ?.find((s: any) => s.role === "PARTY_2")
                        ?.file_url?.includes("Digitally") ? (
                        <div className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          <QrCode className="w-5 h-5 text-emerald-600" />
                          <div className="text-left">
                            <div className="text-[8px] font-black text-emerald-800 uppercase">Validated</div>
                            <div className="text-[7px] font-mono text-emerald-700">Digital Sign</div>
                          </div>
                        </div>
                      ) : previewDn.signatures
                          ?.find((s: any) => s.role === "PARTY_2")
                          ?.file_url?.startsWith("/uploads") ? (
                        <div className="text-[7px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded w-full uppercase tracking-widest text-center mt-auto">
                          [EXTERNAL SIG. ON FILE]
                        </div>
                      ) : (
                        <div className="text-[8px] opacity-0">.</div>
                      )}
                    </div>
                    <div className="pt-2 flex flex-col justify-center items-center">
                      <div className="w-28 border-b border-stone-400 mb-1"></div>
                      {previewDn.signatures
                        ?.find((s: any) => s.role === "PARTY_2")
                        ?.file_url?.includes("Digitally") ? (
                        <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider italic">
                          Auto-Assigned
                        </span>
                      ) : (
                        <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                          Date: ____/____/2026
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-center font-sans">
                    <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                      Driver
                    </div>
                    <div className="h-12 flex items-center justify-center">
                      <div className="text-[8px] opacity-0">.</div>
                    </div>
                    <div className="pt-2 flex flex-col justify-center items-center">
                      <div className="w-28 border-b border-stone-400 mb-1"></div>
                      <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                        Date: ____/____/2026
                      </span>
                    </div>
                  </div>
                  <div className="text-center font-sans">
                    <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                      Security
                    </div>
                    <div className="h-12 flex items-center justify-center">
                      <div className="text-[8px] opacity-0">.</div>
                    </div>
                    <div className="pt-2 flex flex-col justify-center items-center">
                      <div className="w-28 border-b border-stone-400 mb-1"></div>
                      <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                        Date: ____/____/2026
                      </span>
                    </div>
                  </div>
                  <div className="text-center font-sans flex flex-col items-center">
                    <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                      Approve by Warehouse Manager
                    </div>
                    <div className="h-14 flex items-center justify-center w-full mb-1">
                      {previewDn.signatures
                        ?.find((s: any) => s.role === "DISPATCH_PHASE")
                        ?.file_url?.includes("Digitally") ? (
                        <div className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          <QrCode className="w-5 h-5 text-emerald-600" />
                          <div className="text-left">
                            <div className="text-[8px] font-black text-emerald-800 uppercase">Validated</div>
                            <div className="text-[7px] font-mono text-emerald-700">Digital PIN</div>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-stone-300 rounded-lg px-2 py-1 bg-stone-50">
                          <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider">Awaiting PIN</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] font-black text-stone-900 uppercase">
                      Warehouse Manager
                    </p>
                    <div className="pt-2 flex flex-col justify-center items-center">
                      <div className="w-28 border-b border-stone-100 mb-1"></div>
                      {previewDn.signatures
                        ?.find((s: any) => s.role === "DISPATCH_PHASE")
                        ?.file_url?.includes("Digitally") ? (
                        <span className="text-[7.5px] text-emerald-600 font-bold tracking-widest uppercase flex items-center gap-1">
                          VALIDATED SECURELY
                        </span>
                      ) : (
                        <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                          AWAITING AUTHORIZATION
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </PrintTemplate>
</PdfPreviewWrapper>
            </div>
            <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4 shrink-0">
              <Button
                variant="secondary"
                onClick={() => setPreviewDn(null)}
                className="px-6 py-2.5 rounded-xl text-sm"
              >
                {language === "id" ? "Tutup" : "Close"}
              </Button>
              <Button
                variant="primary"
                onClick={() => exportPdf()}
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

      {/* Standard confirmation modal rendering */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Authorize Delivery Note Modal */}
      <AuthorizeDocModal
        isOpen={showAuthorizeModal && !!selectedDnToAuth}
        onClose={() => {
          setShowAuthorizeModal(false);
          setAuthPin("");
        }}
        docType="Delivery Note"
        docNumber={selectedDnToAuth?.dn_number || ""}
        status={selectedDnToAuth?.status}
        partnerName={
          customers.find((c) => c.id === selectedDnToAuth?.customer_id)?.name ||
          selectedDnToAuth?.customer_id
        }
        projectName={
          projects.find((p) => p.id === selectedDnToAuth?.project_id)?.name ||
          selectedDnToAuth?.project_id
        }
        isSubmitting={isSubmitting}
        onAuthorize={submitAuthorizeDn}
      />

      {/* Delivery Receipt Document Modal (A5 Landscape, Dual Language, Standard ERP Modal) */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title={
          language === "id"
            ? "Delivery Receipt Preview (A5 Landscape)"
            : "Delivery Receipt Note Preview (A5 Landscape)"
        }
        maxWidth="4xl"
        contentClassName="p-0 border-t border-stone-100 flex flex-col h-[85vh] overflow-hidden"
      >
        {showReceiptModal && (
          <>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-stone-100 flex justify-center items-start">
              <PdfPreviewWrapper>
                <A5LandscapePrintTemplate
                  ref={receiptDocRef}
                  documentTitleId="TANDA TERIMA PENGIRIMAN"
                  documentTitleEn="DELIVERY RECEIPT NOTE"
                  documentNameId="Receipt Document"
                  documentNameEn="Receipt Note"
                  date={
                    receiptForm.receipt_date ||
                    new Date().toISOString().split("T")[0]
                  }
                  referenceNumber={
                    selectedReceiptDn
                      ? `RCT-${selectedReceiptDn.dn_number || selectedReceiptDn.id}`
                      : `RCT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-FORM`
                  }
                  documentId={
                    selectedReceiptDn
                      ? `RCT-${selectedReceiptDn.dn_number || selectedReceiptDn.id}`
                      : `RCT-FORM-01`
                  }
                  isDraft={false}
                >
                  {/* HEADER SECTION (Consignee & Dispatch) */}
                  <div className="grid grid-cols-2 gap-6 mb-2">
                    {/* Penerima */}
                    <div>
                      <div className="grid grid-cols-[65px_1fr] gap-x-2 gap-y-1 text-[9px] text-stone-900">
                         <div className="font-medium text-stone-600">Nama <span className="font-normal text-[7px] text-stone-400">/ Name</span></div>
                         <div className="font-bold border-b border-dotted border-stone-300 min-h-[12px]">{selectedReceiptDn?.customer_name || ""}</div>
                         
                         <div className="font-medium text-stone-600">Alamat <span className="font-normal text-[7px] text-stone-400">/ Address</span></div>
                         <div className="border-b border-dotted border-stone-300 min-h-[12px]">{selectedReceiptDn?.customer_address || ""}</div>
                         
                         <div className="font-medium text-stone-600">Ref / Proyek <span className="font-normal text-[7px] text-stone-400">/ Order</span></div>
                         <div className="font-bold border-b border-dotted border-stone-300 min-h-[12px]">{selectedReceiptDn?.quotation_number ? `Quo: ${selectedReceiptDn.quotation_number}` : selectedReceiptDn?.project_names || selectedReceiptDn?.project_name || ""}</div>
                      </div>
                    </div>

                    {/* Info Pengiriman */}
                    <div>
                      <div className="grid grid-cols-[85px_1fr] gap-x-2 gap-y-1 text-[9px] text-stone-900">
                         <div className="font-medium text-stone-600">No. Polisi <span className="font-normal text-[7px] text-stone-400">/ Plate</span></div>
                         <div className="font-bold font-mono border-b border-dotted border-stone-300 min-h-[12px]">{selectedReceiptDn?.police_number || ""}</div>
                         
                         <div className="font-medium text-stone-600">Pengemudi <span className="font-normal text-[7px] text-stone-400">/ Driver</span></div>
                         <div className="border-b border-dotted border-stone-300 min-h-[12px]"></div>
                         
                         <div className="font-medium text-stone-600">No. Ref <span className="font-normal text-[7px] text-stone-400">/ Ref</span></div>
                         <div className="font-bold font-mono border-b border-dotted border-stone-300 min-h-[12px]">{selectedReceiptDn?.dn_number || ""}</div>
                      </div>
                    </div>
                  </div>

                  {/* STATEMENT */}
                  <div className="bg-stone-50 border border-stone-200 rounded p-1.5 mb-3 text-[9px] text-stone-800 leading-relaxed">
                    <div><span className="font-bold text-stone-900">Pernyataan:</span> Barang-barang yang tercantum di bawah ini telah diserahkan dan diterima dalam kondisi baik & jumlah sesuai.</div>
                    <div className="text-stone-500 text-[8px]"><span className="font-semibold">Acknowledgement:</span> Goods listed below have been physically delivered and received in good condition & complete quantity.</div>
                  </div>

                  {/* ITEMS TABLE */}
                  <div className="flex-1 relative mb-3 border border-stone-300 rounded overflow-hidden flex flex-col">
                    <table className="w-full text-left border-collapse border-spacing-0">
                      <thead>
                        <tr className="bg-stone-100 border-b border-stone-300 text-stone-900">
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[6%] text-center border-r border-stone-300">
                            No
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[18%] border-r border-stone-300">
                            Kode <span className="font-normal text-stone-500 block text-[7px]">CODE</span>
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[36%] border-r border-stone-300">
                            Deskripsi & Spesifikasi <span className="font-normal text-stone-500 block text-[7px]">DESCRIPTION & SPECIFICATION</span>
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[10%] text-center border-r border-stone-300">
                            Jumlah <span className="font-normal text-stone-500 block text-[7px]">QTY</span>
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[10%] text-center border-r border-stone-300">
                            Satuan <span className="font-normal text-stone-500 block text-[7px]">UNIT</span>
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[20%]">
                            Keterangan <span className="font-normal text-stone-500 block text-[7px]">REMARKS</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceiptDn?.items && selectedReceiptDn.items.length > 0 ? (
                          selectedReceiptDn.items.map((it: any, i: number) => (
                            <tr key={i} className="text-[9px] text-stone-900">
                              <td className="py-2 px-2 text-center border-r border-b border-stone-300 font-medium text-stone-400">
                                {String(i + 1).padStart(2, "0")}
                              </td>
                              <td className="py-2 px-2 font-mono font-bold text-stone-800 border-r border-b border-stone-300">
                                {it.item_code || "\u00A0"}
                              </td>
                              <td className="py-2 px-2 font-bold text-stone-900 border-r border-b border-stone-300">
                                {it.item_name || "\u00A0"}
                              </td>
                              <td className="py-2 px-2 text-center font-bold font-mono border-r border-b border-stone-300">
                                {it.qty || "\u00A0"}
                              </td>
                              <td className="py-2 px-2 text-center font-medium uppercase text-stone-600 border-r border-b border-stone-300">
                                {it.uom || "\u00A0"}
                              </td>
                              <td className="py-2 px-2 text-stone-600 border-b border-stone-300">
                                {it.remarks || "\u00A0"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          [1, 2, 3, 4, 5, 6, 7].map((num) => (
                            <tr key={num} className="text-[9px] h-7">
                              <td className="py-1.5 px-2 text-center border-r border-b border-stone-300 font-medium text-stone-400">
                                {String(num).padStart(2, "0")}
                              </td>
                              <td className="py-1.5 px-2 border-r border-b border-stone-300">&nbsp;</td>
                              <td className="py-1.5 px-2 border-r border-b border-stone-300">&nbsp;</td>
                              <td className="py-1.5 px-2 border-r border-b border-stone-300">&nbsp;</td>
                              <td className="py-1.5 px-2 border-r border-b border-stone-300">&nbsp;</td>
                              <td className="py-1.5 px-2 border-b border-stone-300">&nbsp;</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* HANDOVER REMARKS & SIGNATURES */}
                  <div className="mt-auto pt-2 border-t border-stone-200">
                    <div className="flex gap-2 items-baseline mb-4">
                      <div className="text-[9px] font-bold text-stone-900 uppercase tracking-widest shrink-0">
                        Catatan Khusus <span className="font-normal text-stone-500">/ Remarks:</span>
                      </div>
                      <div className="flex-1 border-b border-dotted border-stone-400 text-[9px] font-medium text-stone-800 px-1 pb-0.5 min-h-[16px]">
                        {selectedReceiptDn?.remarks || ""}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Pengirim <span className="block text-[7px] font-normal text-stone-500 mt-0.5">DELIVERED BY</span>
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Penerima <span className="block text-[7px] font-normal text-stone-500 mt-0.5">RECEIVED BY</span>
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Logistik <span className="block text-[7px] font-normal text-stone-500 mt-0.5">LOGISTICS OFFICER</span>
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Mengetahui <span className="block text-[7px] font-normal text-stone-500 mt-0.5">ACKNOWLEDGED BY</span>
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                    </div>
                  </div>
                </A5LandscapePrintTemplate>
              </PdfPreviewWrapper>
            </div>

            <div className="p-4 sm:p-6 border-t border-stone-100 bg-white flex justify-center gap-4 shrink-0">
              <Button
                variant="secondary"
                onClick={() => setShowReceiptModal(false)}
                className="px-6 py-2.5 rounded-xl text-sm"
              >
                {language === "id" ? "Tutup" : "Close"}
              </Button>
              <Button
                variant="primary"
                onClick={handleExportReceiptPdf}
                isLoading={isSubmitting}
                className="px-6 py-2.5 rounded-xl text-sm shadow-md flex items-center gap-2"
              >
                {!isSubmitting && <Download className="w-4 h-4" />}
                {language === "id"
                  ? isSubmitting
                    ? "Mengekspor..."
                    : "Ekspor PDF (A5 Landscape)"
                  : isSubmitting
                    ? "Generating..."
                    : "Export PDF (A5 Landscape)"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

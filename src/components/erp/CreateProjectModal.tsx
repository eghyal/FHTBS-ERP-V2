import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { formatIDR } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { FolderKanban, Trash2, ShieldCheck, AlertCircle } from "lucide-react";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (ntpData?: any, projectData?: any) => void;
  initialQuotationId?: string;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess,
  initialQuotationId,
}: CreateProjectModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [quotations, setQuotations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedQuoToAuth, setSelectedQuoToAuth] = useState<any>(null);
  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [pendingQuoWarning, setPendingQuoWarning] = useState<any>(null);

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    customer: "",
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    urgency: "NORMAL" as "NORMAL" | "URGENT" | "CRITICAL",
    parent_project_id: "",
    remarks: "",
    quotation_id: "",
    qty: 1,
    uom: "Unit",
    quotation_item_id: "",
  });

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkProjects, setBulkProjects] = useState<
    Array<{
      id: string;
      name: string;
      remarks: string;
      qty?: number;
      uom?: string;
      quotation_item_id?: string;
    }>
  >([{ id: "", name: "", remarks: "" }]);

  useEffect(() => {
    if (isOpen) {
      // Generate initial random Project ID
      const generatedId =
        "PRJ-" +
        new Date().getFullYear().toString().slice(-2) +
        "-" +
        Math.random().toString(36).substring(2, 7).toUpperCase();

      fetchData(generatedId);
    }
  }, [isOpen]);

  const fetchData = async (generatedId: string) => {
    setIsLoading(true);
    try {
      const [quoRes, prjRes] = await Promise.all([
        apiFetch("/api/quotations", {}, user?.username),
        apiFetch("/api/projects", {}, user?.username),
      ]);

      let quoList = [];
      if (quoRes.ok) {
        quoList = Array.isArray(quoRes.data)
          ? quoRes.data
          : quoRes.data?.data || [];
        setQuotations(quoList);
      }

      if (prjRes.ok) {
        setProjects(
          Array.isArray(prjRes.data) ? prjRes.data : prjRes.data?.data || [],
        );
      }

      // Handle default/initial quotation selection with strict authorization check
      const targetQuoId = initialQuotationId || "";
      const authorizedQuos = quoList.filter(
        (q: any) => q.status === "APPROVED" || q.status === "AUTHORIZED",
      );

      let initialQuo = authorizedQuos.find((q: any) => q.id === targetQuoId);
      const pendingInitialQuo = !initialQuo && targetQuoId
        ? quoList.find((q: any) => q.id === targetQuoId)
        : null;

      if (initialQuo) {
        setPendingQuoWarning(null);
        applyQuotationToForm(initialQuo, generatedId);
      } else if (pendingInitialQuo) {
        // If quotation exists but is not yet authorized, provide clear warning & direct authorization
        setPendingQuoWarning(pendingInitialQuo);
        setFormData((prev) => ({
          ...prev,
          id: generatedId,
          quotation_id: "",
          customer: pendingInitialQuo.customer_name || pendingInitialQuo.customer_id || "",
          name: pendingInitialQuo.title || "",
        }));
      } else if (authorizedQuos.length > 0 && !targetQuoId) {
        setPendingQuoWarning(null);
        applyQuotationToForm(authorizedQuos[0], generatedId);
      } else {
        setPendingQuoWarning(null);
        setFormData((prev) => ({
          ...prev,
          id: generatedId,
          quotation_id: "",
          customer: "",
          name: "",
        }));
        setBulkMode(false);
        setBulkProjects([{ id: "", name: "", remarks: "" }]);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load initial data for project setup", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const applyQuotationToForm = (selectedQuo: any, currentProjId?: string) => {
    const quoId = selectedQuo.id;
    const qItems = selectedQuo.items || [];
    const isBulk = qItems.length > 1;

    const baseProjId = currentProjId || formData.id || "PRJ-" + Math.random().toString(36).substring(2, 7).toUpperCase();

    if (isBulk) {
      setFormData((prev) => ({
        ...prev,
        id: baseProjId,
        quotation_id: quoId,
        customer: selectedQuo.customer_name || selectedQuo.customer_id,
        name: selectedQuo.title || "",
      }));
      setBulkMode(true);
      setBulkProjects(
        qItems.map((it: any, i: number) => ({
          id: `${baseProjId}-${i + 1}`,
          name: it.title || `${selectedQuo.title} - Item ${i + 1}`,
          remarks: `Derived from quotation item: ${it.title}`,
          qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
          uom: it.uom || "Unit",
          quotation_item_id: it.id,
        })),
      );
    } else {
      setBulkMode(false);
      const singleQty =
        qItems.length === 1 && Number(qItems[0].qty) > 0
          ? Number(qItems[0].qty)
          : Number(selectedQuo.qty) > 0
            ? Number(selectedQuo.qty)
            : 1;
      const singleUom =
        qItems.length === 1 ? qItems[0].uom || "Unit" : "Unit";
      const singleQuoItemId = qItems.length === 1 ? qItems[0].id : "";

      setFormData((prev) => ({
        ...prev,
        id: baseProjId,
        quotation_id: quoId,
        customer: selectedQuo.customer_name || selectedQuo.customer_id,
        name: selectedQuo.title || "",
        qty: singleQty,
        uom: singleUom,
        quotation_item_id: singleQuoItemId,
      }));
      setBulkProjects([
        {
          id: "",
          name: "",
          remarks: "",
          qty: singleQty,
          uom: singleUom,
          quotation_item_id: singleQuoItemId,
        },
      ]);
    }
  };

  const handleAuthorizeQuotation = async (pin: string) => {
    if (!selectedQuoToAuth) return;
    setIsAuthorizing(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${selectedQuoToAuth.id}/authorize`,
        {
          method: "POST",
          body: JSON.stringify({ pin }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Quotation berhasil diotorisasi!", "success");
        setShowAuthorizeModal(false);
        setPendingQuoWarning(null);
        // Refresh quotations list
        const quoRes = await apiFetch("/api/quotations", {}, user?.username);
        if (quoRes.ok) {
          const freshList = Array.isArray(quoRes.data)
            ? quoRes.data
            : quoRes.data?.data || [];
          setQuotations(freshList);
          const authorizedItem = freshList.find((q: any) => q.id === selectedQuoToAuth.id);
          if (authorizedItem) {
            applyQuotationToForm(authorizedItem);
          }
        }
        setSelectedQuoToAuth(null);
      } else {
        showToast(res.error || "Gagal mengotorisasi quotation", "error");
      }
    } catch (err: any) {
      showToast("Kesalahan jaringan saat otorisasi quotation", "error");
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.quotation_id) {
      showToast("Please select an approved sales quotation", "error");
      return;
    }
    setShowConfirmModal(true);
  };

  const submitCreateProject = async () => {
    setIsSubmitting(true);
    try {
      let res;
      if (bulkMode) {
        res = await apiFetch(
          "/api/projects/bulk",
          {
            method: "POST",
            body: JSON.stringify({
              common: {
                customer: formData.customer,
                due_date: formData.due_date,
                urgency: formData.urgency,
                parent_project_id: formData.parent_project_id,
                remarks: formData.remarks,
                quotation_id: formData.quotation_id,
              },
              projects: bulkProjects.filter((p) => p.name.trim() !== ""),
            }),
          },
          user?.username,
        );
      } else {
        res = await apiFetch(
          "/api/projects",
          {
            method: "POST",
            body: JSON.stringify(formData),
          },
          user?.username,
        );
      }

      if (res.ok) {
        showToast("Project created successfully.", "success");
        setShowConfirmModal(false);
        
        let ntpData = null;
        let projectData = null;
        if (res.data?.data?.ntp) {
          ntpData = res.data.data.ntp;
          projectData = {
            id: res.data.data.id || res.data.data.ntp.project_id,
            ...formData,
          };
        } else if (res.data?.ntp) {
          ntpData = res.data.ntp;
          projectData = {
            id: res.data.id || res.data.ntp?.project_id || formData.id,
            ...formData,
          };
        }
        
        onSuccess(ntpData, projectData);
        onClose();
      } else {
        const errorMsg = res.details
          ? `${res.error}: ${res.details}`
          : res.error || "Failed to create project";
        showToast(errorMsg, "error");
      }
    } catch (err: any) {
      showToast("Network or server error while creating project", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showConfirmModal}
        onClose={onClose}
        maxWidth="4xl"
        title={
          <div>
            <h3 className="text-xl font-bold text-stone-900 tracking-tighter uppercase leading-none">
              Initialize Project
            </h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-1.5">
              Sales Quotation to Project Conversion
            </p>
          </div>
        }
        contentClassName="p-0 flex flex-col h-[90vh]"
      >
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden min-h-0"
        >
          {/* Modal Body - Scrollable */}
          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8 custom-scrollbar bg-[#F9F9F8]/30">
            {/* Specific Fields Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Project ID *
                </label>
                <div className="relative group">
                  <FolderKanban className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-stone-900 transition-colors" />
                  <input
                    type="text"
                    required
                    value={formData.id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        id: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="PRJ-26-XXXX"
                    className="w-full pl-11 pr-4 py-4 bg-white border border-stone-200 rounded-2xl text-sm font-bold text-stone-900 focus:border-stone-900 focus:ring-4 focus:ring-stone-100 outline-none transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-3 md:col-span-2 bg-stone-50 p-6 rounded-3xl border border-stone-200">
                {pendingQuoWarning && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-black text-amber-900 uppercase tracking-wider">
                          Quotation Belum Terotorisasi (Status: PENDING)
                        </div>
                        <p className="text-xs text-amber-800 font-medium mt-0.5">
                          Quotation <strong>[{pendingQuoWarning.quotation_number}] {pendingQuoWarning.title}</strong> belum diotorisasi. Konversi ke Proyek & SPK mewajibkan Quotation yang berstatus <strong>APPROVED / AUTHORIZED</strong>.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedQuoToAuth(pendingQuoWarning);
                        setShowAuthorizeModal(true);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Otorisasi Sekarang
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                      Referenced Sales Quotation (Quotation Terotorisasi) *
                    </label>
                    {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length > 0 && (
                      <span className="text-[10px] text-emerald-700 font-black flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length} Quotation Terotorisasi Tersedia
                      </span>
                    )}
                  </div>
                  <select
                    required
                    value={formData.quotation_id || ""}
                    onChange={(e) => {
                      const quoId = e.target.value;
                      const selectedQuo = quotations.find((q) => q.id === quoId);
                      if (selectedQuo) {
                        if (selectedQuo.status === "APPROVED" || selectedQuo.status === "AUTHORIZED") {
                          setPendingQuoWarning(null);
                          applyQuotationToForm(selectedQuo);
                        } else {
                          setPendingQuoWarning(selectedQuo);
                          setFormData({
                            ...formData,
                            quotation_id: "",
                            customer: selectedQuo.customer_name || selectedQuo.customer_id || "",
                            name: selectedQuo.title || "",
                          });
                        }
                      } else {
                        setPendingQuoWarning(null);
                        setFormData({
                          ...formData,
                          quotation_id: "",
                          customer: "",
                          name: "",
                        });
                        setBulkMode(false);
                        setBulkProjects([{ id: "", name: "", remarks: "" }]);
                      }
                    }}
                    className="w-full px-5 py-4 bg-white border border-stone-200 rounded-2xl text-sm font-bold text-stone-900 focus:border-stone-900 focus:ring-4 focus:ring-stone-100 outline-none transition-all shadow-sm cursor-pointer"
                  >
                    <option value="">-- Pilih Quotation Terotorisasi (Select Authorized Quotation) --</option>
                    {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length > 0 && (
                      <optgroup label="Quotation Terotorisasi (Approved / Authorized)">
                        {quotations
                          .filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED")
                          .map((q) => (
                            <option key={q.id} value={q.id}>
                              [{q.quotation_number}] {q.title} - {q.customer_name} ({formatIDR(q.amount || 0)})
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {quotations.filter((q) => q.status === "PENDING").length > 0 && (
                      <optgroup label="Belum Terotorisasi (Perlu Otorisasi Terlebih Dahulu)">
                        {quotations
                          .filter((q) => q.status === "PENDING")
                          .map((q) => (
                            <option key={q.id} value={q.id}>
                              [{q.quotation_number}] {q.title} - {q.customer_name} (PENDING - Butuh Otorisasi)
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>

                  {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length === 0 && (
                    <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-600 flex items-center justify-between gap-2 mt-2">
                      <span>Belum ada Quotation yang berstatus Terotorisasi (APPROVED).</span>
                      {quotations.filter((q) => q.status === "PENDING").length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const pendingOne = quotations.find((q) => q.status === "PENDING");
                            if (pendingOne) {
                              setSelectedQuoToAuth(pendingOne);
                              setShowAuthorizeModal(true);
                            }
                          }}
                          className="text-xs font-bold text-blue-700 hover:text-blue-900 underline shrink-0"
                        >
                          Otorisasi Quotation ({quotations.filter((q) => q.status === "PENDING").length} Pending)
                        </button>
                      )}
                    </div>
                  )}

                  <p className="text-[9px] text-blue-700 font-bold mt-1.5 uppercase tracking-wider ml-1">
                    Memilih Quotation terotorisasi secara otomatis mengisi data pelanggan, subjek proyek, kuantitas resmi, dan rincian item SPK.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Project Title (Auto-derived)
                </label>
                <input
                  disabled
                  required={!bulkMode}
                  type="text"
                  value={formData.name}
                  placeholder="Inherited from selected Quotation"
                  className="w-full px-4 py-4 bg-stone-100 border border-stone-200 rounded-2xl text-sm font-bold text-stone-500 outline-none cursor-not-allowed shadow-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Client / Target Customer (Auto-derived)
                </label>
                <input
                  disabled
                  required={!bulkMode}
                  type="text"
                  value={formData.customer || ""}
                  placeholder="Inherited from selected Quotation"
                  className="w-full px-5 py-4 bg-stone-100 border border-stone-250 rounded-2xl text-sm font-bold text-stone-500 outline-none cursor-not-allowed shadow-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Reference Group (Optional)
                </label>
                <Select
                  value={formData.parent_project_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      parent_project_id: e.target.value,
                    })
                  }
                  className="w-full px-5 py-4 bg-white border border-stone-200 rounded-2xl text-sm font-bold text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm cursor-pointer"
                >
                  <option value="">No Parent Reference</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.id}] {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                    Delivery Deadline
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.due_date}
                    onChange={(e) =>
                      setFormData({ ...formData, due_date: e.target.value })
                    }
                    className="w-full px-5 py-4 bg-white border border-stone-200 rounded-2xl text-xs font-bold text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                    Urgency Level
                  </label>
                  <Select
                    value={formData.urgency}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        urgency: e.target.value as any,
                      })
                    }
                    className="w-full px-5 py-4 bg-white border border-stone-200 rounded-2xl text-xs font-bold text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm cursor-pointer"
                  >
                    <option value="NORMAL">Normal Priority</option>
                    <option value="URGENT">Urgent Priority</option>
                    <option value="CRITICAL">Critical Path</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Operational Remarks
                </label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  placeholder="Internal notes or project constraints..."
                  className="w-full px-5 py-4 bg-white border border-stone-200 rounded-2xl text-xs font-medium text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm resize-none min-h-[64px]"
                />
              </div>

              {bulkMode && (
                <div className="md:col-span-2 space-y-4 pt-6 border-t border-stone-200 mt-4">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1">
                    Bulk Project Setup (Derived from Quotation Items)
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {bulkProjects.map((p, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-4 rounded-xl border border-stone-200 flex flex-col md:flex-row gap-4"
                      >
                        <div className="w-full md:w-1/4">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            Project ID
                          </label>
                          <input
                            type="text"
                            value={p.id}
                            onChange={(e) => {
                              const nb = [...bulkProjects];
                              nb[idx].id = e.target.value;
                              setBulkProjects(nb);
                            }}
                            className="w-full text-xs font-bold border-b border-stone-200 focus:border-stone-900 outline-none py-1 bg-transparent"
                          />
                        </div>
                        <div className="w-full md:w-1/3">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            Title
                          </label>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => {
                              const nb = [...bulkProjects];
                              nb[idx].name = e.target.value;
                              setBulkProjects(nb);
                            }}
                            className="w-full text-xs font-bold border-b border-stone-200 focus:border-stone-900 outline-none py-1 bg-transparent"
                          />
                        </div>
                        <div className="w-full md:w-1/6">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            Qty
                          </label>
                          <input
                            type="number"
                            value={p.qty || 1}
                            onChange={(e) => {
                              const nb = [...bulkProjects];
                              nb[idx].qty = Number(e.target.value);
                              setBulkProjects(nb);
                            }}
                            className="w-full text-xs font-bold border-b border-stone-200 focus:border-stone-900 outline-none py-1 bg-transparent"
                            min="1"
                          />
                        </div>
                        <div className="w-full md:w-1/6">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            UOM
                          </label>
                          <input
                            type="text"
                            value={p.uom || "Unit"}
                            onChange={(e) => {
                              const nb = [...bulkProjects];
                              nb[idx].uom = e.target.value;
                              setBulkProjects(nb);
                            }}
                            className="w-full text-xs font-bold border-b border-stone-200 focus:border-stone-900 outline-none py-1 bg-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-8 py-6 border-t border-stone-100 bg-white flex justify-between items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  quotation_id: "",
                  customer: "",
                  name: "",
                  remarks: "",
                }));
                setBulkMode(false);
                setBulkProjects([{ id: "", name: "", remarks: "" }]);
              }}
              className="px-4 py-2 text-stone-400 hover:text-rose-600 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 group"
            >
              <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />{" "}
              Reset Form
            </button>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isLoading}>
                {isSubmitting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Creating Project...
                  </>
                ) : bulkMode ? (
                  `Create Batch (${bulkProjects.filter((p) => (p.name || "").trim() !== "").length} Projects)`
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={submitCreateProject}
        title="Confirm Project Initialization"
        message={
          <>
            Are you sure you want to initialize project(s) for quotation{" "}
            <strong>{formData.quotation_id}</strong>? This will create live project record(s) and allow Engineering to begin BOM creation.
          </>
        }
      />

      {selectedQuoToAuth && (
        <AuthorizeDocModal
          isOpen={showAuthorizeModal}
          onClose={() => {
            setShowAuthorizeModal(false);
            setSelectedQuoToAuth(null);
          }}
          docType="Quotation"
          docNumber={selectedQuoToAuth.quotation_number || selectedQuoToAuth.id}
          projectName={selectedQuoToAuth.title}
          partnerName={selectedQuoToAuth.customer_name || selectedQuoToAuth.customer_id}
          amount={selectedQuoToAuth.amount}
          status="PENDING"
          isSubmitting={isAuthorizing}
          onAuthorize={handleAuthorizeQuotation}
          submitLabel="Authorize & Approve Quotation"
        />
      )}
    </>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  Landmark,
  Plus,
  Trash2,
  FileText,
  Calendar,
  AlertTriangle,
  CreditCard,
  ShieldCheck,
  Search,
  Package,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  formatIDR,
  formatNumberWithDots,
  formatIDRWithDecimals,
  cn,
} from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { calculateFinancialBreakdown, TaxScheme } from "@/lib/financialEngine";

interface CreateQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (quotation: any) => void;
  revisingData?: any;
  initialCustomerId?: string;
  initialSettlementType?: "IMMEDIATE" | "CREDIT_TERM";
  onOpenReceipt?: (data: any) => void;
}

export const CreateQuotationModal: React.FC<CreateQuotationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  revisingData,
  initialCustomerId,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Form States - Strictly B2B Corporate Project Quotation
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [quotationTitle, setQuotationTitle] = useState("");
  const [validityDays, setValidityDays] = useState("20");
  const [paymentTerms, setPaymentTerms] = useState("Net 30 Days");
  const [customPaymentTerms, setCustomPaymentTerms] = useState("");
  const [remarks, setRemarks] = useState("");
  const [taxCategory, setTaxCategory] = useState("GOODS_DPP_LAIN");
  const [taxRate, setTaxRate] = useState("12");
  const [pphRate, setPphRate] = useState("0");
  const [taxScheme, setTaxScheme] = useState<TaxScheme>("DPP_NILAI_LAIN");
  const [discountRate, setDiscountRate] = useState("0");

  // Finished Goods Catalog for Warehouse Inventory Lookup (Strict BOM-Style Linkage)
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);

  // Line Items with registered warehouse Finished Good linkage
  const [items, setItems] = useState<
    {
      item_code: string;
      title: string;
      qty: string;
      uom: string;
      price: string;
      item_id?: string;
      available_qty?: number;
      material_cost?: number;
    }[]
  >([{ item_code: "", title: "", qty: "1", uom: "Unit", price: "", item_id: "" }]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Derive amounts directly using Centralized Financial Precision Engine
  const breakdown = calculateFinancialBreakdown({
    items: items.map((i) => ({
      qty: parseFloat(i.qty) || 0,
      unit_price: parseFloat(i.price) || 0,
    })),
    discountRate: parseFloat(discountRate) || 0,
    taxRate: parseFloat(taxRate) || 0,
    pphRate: parseFloat(pphRate) || 0,
    taxScheme: taxScheme,
  });

  const subtotalAmount = breakdown.grossAmount;
  const discountAmount = breakdown.discountAmount;
  const ppnTaxAmount = breakdown.ppnAmount;
  const netEarnings = breakdown.grandTotal;

  // Load Customers & Finished Goods Catalog on Open
  useEffect(() => {
    if (isOpen) {
      const fetchCustomers = async () => {
        try {
          const res = await apiFetch("/api/sales/customers", {}, user?.username);
          if (res.ok && Array.isArray(res.data)) {
            setCustomers(res.data);
          }
        } catch (e) {
          console.error("Failed to load customers for quotation", e);
        }
      };

      // Query finished goods strictly for warehouse inventory linkage
      const fetchCatalog = async () => {
        try {
          const res = await apiFetch("/api/sales/retail-catalog?type=FINISHED", {}, user?.username);
          if (res.ok && Array.isArray(res.data?.data)) {
            setCatalogItems(res.data.data);
          } else if (res.ok && Array.isArray(res.data)) {
            setCatalogItems(res.data);
          }
        } catch (e) {
          console.error("Failed to load finished goods catalog", e);
        }
      };

      fetchCustomers();
      fetchCatalog();

      if (revisingData) {
        setCustomerId(revisingData.customer_id || "");
        setQuotationTitle(revisingData.title || "");
        setValidityDays((revisingData.validity_days || 20).toString());
        setRemarks(revisingData.remarks || "");

        // Payment Terms
        const pt = revisingData.payment_terms || "Net 30 Days";
        if ([
          "Cash Before Delivery (CBD)",
          "Cash On Delivery (COD)",
          "Net 7 Days",
          "Net 14 Days",
          "Net 30 Days",
          "Net 45 Days",
          "Net 60 Days",
          "50% Down Payment, 50% Upon Delivery",
          "30% Down Payment, 70% Upon Delivery",
        ].includes(pt)) {
          setPaymentTerms(pt);
          setCustomPaymentTerms("");
        } else {
          setPaymentTerms("CUSTOM");
          setCustomPaymentTerms(pt);
        }

        const tr = revisingData.tax_rate ?? 12;
        const pr = revisingData.pph_rate ?? 0;
        const scheme = revisingData.tax_scheme || (tr === 0 ? "NON_PKP" : "DPP_NILAI_LAIN");

        setTaxRate(tr.toString());
        setPphRate(pr.toString());
        setTaxScheme(scheme);

        if (tr === 0 && pr === 0) setTaxCategory("NON_PKP");
        else if (pr === 2) setTaxCategory("SERVICES_DPP_LAIN");
        else setTaxCategory("GOODS_DPP_LAIN");

        setDiscountRate((revisingData.discount_rate || 0).toString());

        if (revisingData.items && revisingData.items.length > 0) {
          setItems(
            revisingData.items.map((i: any) => ({
              item_code: i.item_code || i.sku || "",
              title: i.title || i.item_name || "",
              qty: String(i.qty || 1),
              uom: i.uom || "Unit",
              price: String(i.unit_price || ""),
              item_id: i.item_id || "",
              material_cost: i.material_cost,
            })),
          );
        } else {
          setItems([{ item_code: "", title: "", qty: "1", uom: "Unit", price: "", item_id: "" }]);
        }
      } else {
        // Reset form on open
        setCustomerId(initialCustomerId || "");
        setQuotationTitle("");
        setTaxCategory("GOODS_DPP_LAIN");
        setTaxRate("12");
        setPphRate("0");
        setTaxScheme("DPP_NILAI_LAIN");
        setValidityDays("20");
        setPaymentTerms("Net 30 Days");
        setCustomPaymentTerms("");
        setRemarks("");
        setDiscountRate("0");
        setItems([{ item_code: "", title: "", qty: "1", uom: "Unit", price: "", item_id: "" }]);
      }
    }
  }, [isOpen, user?.username, revisingData, initialCustomerId]);

  const handleTaxCategoryChange = (val: string) => {
    setTaxCategory(val);
    if (val === "GOODS_DPP_LAIN") {
      setTaxRate("12");
      setPphRate("0");
      setTaxScheme("DPP_NILAI_LAIN");
    } else if (val === "SERVICES_DPP_LAIN") {
      setTaxRate("12");
      setPphRate("2");
      setTaxScheme("DPP_NILAI_LAIN");
    } else if (val === "NON_PKP") {
      setTaxRate("0");
      setPphRate("0");
      setTaxScheme("NON_PKP");
    }
  };

  // Handler for typing SKU / Item Code manually:
  // Dynamically filters the dropdown, and if an exact match is typed, auto-populates Product Description & UOM like BOM
  const handleItemCodeChange = (idx: number, inputCode: string) => {
    const updated = [...items];
    const cleanInput = inputCode.trim().toUpperCase();

    // Check if user input matches an exact registered finished good SKU
    const exactMatch = catalogItems.find(
      (c) => c.item_code && c.item_code.trim().toUpperCase() === cleanInput
    );

    if (exactMatch) {
      updated[idx] = {
        ...updated[idx],
        item_code: inputCode,
        item_id: exactMatch.id,
        title: exactMatch.name,
        uom: exactMatch.uom || "Unit",
        available_qty: exactMatch.available_qty,
        material_cost:
          exactMatch.material_cost !== undefined
            ? Number(exactMatch.material_cost)
            : Math.round((exactMatch.unit_price || 0) * 0.65),
      };
    } else {
      // If code changed without exact match, reset title & item_id
      updated[idx] = {
        ...updated[idx],
        item_code: inputCode,
        item_id: "",
        title: "",
        uom: "Unit",
      };
    }

    setItems(updated);
    setActiveDropdownIndex(idx);
  };

  // Handler for selecting an item from the live-filtered dropdown
  const handleSelectCatalogItem = (idx: number, catItem: any) => {
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      item_id: catItem.id,
      item_code: catItem.item_code || "",
      title: catItem.name,
      uom: catItem.uom || "Unit",
      available_qty: catItem.available_qty,
      material_cost:
        catItem.material_cost !== undefined
          ? Number(catItem.material_cost)
          : Math.round((catItem.unit_price || 0) * 0.65),
    };
    setItems(updated);
    setActiveDropdownIndex(null);
  };

  const finalPaymentTerms =
    paymentTerms === "CUSTOM" ? customPaymentTerms.trim() || "Custom Terms" : paymentTerms;

  // B2B Quotation Submission
  const submitAs = async (status: string) => {
    if (!customerId) {
      showToast("Please select a registered corporate client first", "error");
      return;
    }
    if (!quotationTitle.trim()) {
      showToast("Quotation project title is required", "error");
      return;
    }

    // Strict validation: every line item must be a registered Finished Good in warehouse
    const validItems = items.filter((i) => i.item_code.trim() !== "" || i.title.trim() !== "");

    if (validItems.length === 0) {
      showToast("Please add at least one registered Finished Good item", "error");
      return;
    }

    const unselectedItem = validItems.some((i) => !i.item_id || !i.title.trim());
    if (unselectedItem) {
      showToast(
        "All quotation items must be selected from registered Finished Goods in warehouse inventory.",
        "error"
      );
      return;
    }

    // Strict validation: Unit price must be entered and > 0 for all items
    const hasInvalidPrice = validItems.some(
      (i) => !i.price || isNaN(parseFloat(i.price)) || parseFloat(i.price) <= 0
    );
    if (hasInvalidPrice) {
      showToast("Please enter a valid unit price for all quotation items.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        customer_id: customerId,
        sales_channel: "B2B_PROJECT",
        settlement_type: "CREDIT_TERM",
        status, // 'DRAFT' or 'PENDING'
        title: quotationTitle.trim(),
        amount: breakdown.grandTotal,
        dpp: breakdown.dpp,
        dpp_nilai_lain: breakdown.dppNilaiLain,
        rounding_factor: breakdown.roundingFactor,
        grand_total: breakdown.grandTotal,
        validity_days: parseInt(validityDays) || 20,
        payment_terms: finalPaymentTerms,
        payment_method: finalPaymentTerms,
        remarks,
        tax_rate: parseFloat(taxRate) || 0,
        pph_rate: parseFloat(pphRate) || 0,
        tax_scheme: taxScheme,
        discount_rate: parseFloat(discountRate) || 0,
        items: validItems.map((i) => ({
          item_code: i.item_code || null,
          title: i.title.trim(),
          qty: Number(i.qty) || 1,
          uom: i.uom || "Unit",
          unit_price: Number(i.price) || 0,
          item_id: i.item_id || null,
          material_cost: i.material_cost || null,
        })),
      };

      const endpoint = revisingData
        ? `/api/quotations/${revisingData.id}`
        : "/api/quotations";
      const method = revisingData ? "PUT" : "POST";

      const res = await apiFetch(
        endpoint,
        {
          method,
          body: JSON.stringify(payload),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          revisingData
            ? "Quotation updated and resubmitted successfully"
            : "Commercial Quotation created successfully",
          "success",
        );
        onSuccess(res.data?.data || payload);
        onClose();
      } else {
        showToast(
          res.error ||
            `Failed to ${revisingData ? "update" : "create"} quotation`,
          "error",
        );
      }
    } catch (err: any) {
      console.error(err);
      showToast(
        `Error: ` + (err.message || "Unknown error"),
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title={
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white rounded-2xl">
            <FileText className="w-5 h-5 text-stone-800 dark:text-stone-200" />
          </div>
          <div>
            <h3 className="text-stone-900 dark:text-white font-bold text-lg uppercase tracking-tight">
              {revisingData
                ? `Revise Quotation: ${revisingData.quotation_number}`
                : "Create Commercial Quotation"}
            </h3>
            <p className="text-[10px] text-stone-500 font-semibold uppercase tracking-widest mt-0.5">
              Official commercial quotation with warehouse inventory linkage and payment terms
            </p>
          </div>
        </div>
      }
      contentClassName="p-0"
    >
      <div className="p-6 md:p-8 space-y-6">
        {revisingData && revisingData.revision_note && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 shadow-xs mb-4">
            <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-bold text-rose-800 uppercase tracking-widest mb-1">
                Management Revision Note
              </div>
              <div className="text-sm font-medium text-rose-700 leading-relaxed">
                "{revisingData.revision_note}"
              </div>
            </div>
          </div>
        )}

        {/* Corporate Client & Project Details */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {/* B2B Corporate Profile Selection */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1">
              Registered Corporate Client *
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none z-10">
                <Landmark className="w-4 h-4" />
              </div>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl text-xs font-bold text-stone-900 dark:text-white focus:border-stone-900 outline-none cursor-pointer appearance-none"
              >
                <option value="">-- Select Corporate Client --</option>
                {customers
                  .filter((c) => c.id !== "CUS-WALKIN")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </option>
                  ))}
              </select>
            </div>
            {selectedCustomer && (
              <div className="flex items-center gap-2 mt-1 px-1">
                {selectedCustomer.npwp ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    NPWP: {selectedCustomer.npwp}
                  </span>
                ) : (
                  <span className="text-[10px] text-stone-400 italic">
                    No registered Tax ID (NPWP)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Project Title */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1">
              Project Subject / Quotation Title *
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none z-10">
                <FileText className="w-4 h-4" />
              </div>
              <input
                required
                type="text"
                value={quotationTitle}
                onChange={(e) => setQuotationTitle(e.target.value)}
                placeholder="e.g. Supply of Concrete Paving Blocks K-300 for Grand Harmoni Project"
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl text-xs font-bold text-stone-900 dark:text-white focus:border-stone-900 outline-none"
              />
            </div>
          </div>

          {/* Payment Terms */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-stone-500" />
              Payment Terms & Schedule *
            </label>
            <div className="space-y-2">
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl text-xs font-bold text-stone-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="Net 30 Days">Net 30 Days (Standard B2B Terms)</option>
                <option value="Net 14 Days">Net 14 Days</option>
                <option value="Net 7 Days">Net 7 Days</option>
                <option value="Net 45 Days">Net 45 Days</option>
                <option value="Net 60 Days">Net 60 Days</option>
                <option value="Cash Before Delivery (CBD)">Cash Before Delivery (CBD)</option>
                <option value="Cash On Delivery (COD)">Cash On Delivery (COD)</option>
                <option value="50% Down Payment, 50% Upon Delivery">50% Down Payment, 50% Upon Delivery</option>
                <option value="30% Down Payment, 70% Upon Delivery">30% Down Payment, 70% Upon Delivery</option>
                <option value="CUSTOM">Other Custom Terms...</option>
              </select>
              {paymentTerms === "CUSTOM" && (
                <input
                  type="text"
                  required
                  value={customPaymentTerms}
                  onChange={(e) => setCustomPaymentTerms(e.target.value)}
                  placeholder="e.g. 25% DP, 50% Milestone 1, 25% Completion"
                  className="w-full px-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-bold text-stone-900 dark:text-white outline-none"
                />
              )}
            </div>
          </div>

          {/* Validity Period */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1">
              Quotation Validity Period
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none z-10">
                <Calendar className="w-4 h-4" />
              </div>
              <input
                required
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-full pl-11 pr-28 py-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl text-xs font-bold font-mono text-stone-900 dark:text-white outline-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
                Business Days
              </span>
            </div>
          </div>
        </div>

        {/* Finished Goods Line Items with Strict BOM-Style SKU Input & Dropdown Filtering */}
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h4 className="text-[11px] font-black text-stone-800 dark:text-stone-200 uppercase tracking-widest flex items-center gap-2">
              <Package className="w-4 h-4 text-stone-500" />
              <span>Finished Goods & Deliverables ({items.length} items)</span>
            </h4>

            <button
              type="button"
              onClick={() =>
                setItems([
                  ...items,
                  { item_code: "", title: "", qty: "1", uom: "Unit", price: "", item_id: "" },
                ])
              }
              className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-300 hover:text-stone-900 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="border border-stone-200 dark:border-stone-800 rounded-2xl bg-white dark:bg-stone-900 shadow-xs">
            {/* Table Headers */}
            <div className="flex gap-2.5 bg-stone-50 dark:bg-stone-800/80 border-b border-stone-200 dark:border-stone-800 px-4 py-3 text-[9px] font-black text-stone-500 uppercase tracking-widest select-none rounded-t-2xl">
              <div className="w-[170px]">Item Code *</div>
              <div className="flex-1">Product Description</div>
              <div className="w-[80px] text-center">Qty</div>
              <div className="w-[85px] text-center">UOM</div>
              <div className="w-[150px] text-right">Unit Price *</div>
              <div className="w-[125px] text-right pr-2">Subtotal</div>
              <div className="w-8"></div>
            </div>

            {/* List Row Elements */}
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {items.map((item, idx) => {
                // Filter catalog items strictly based on what is typed in this row's Item Code
                const query = item.item_code.trim().toLowerCase();
                const filteredMatches = catalogItems.filter((c) => {
                  if (!query) return true;
                  const cCode = (c.item_code || "").toLowerCase();
                  const cName = (c.name || "").toLowerCase();
                  return cCode.includes(query) || cName.includes(query);
                });

                const isDropdownOpen = activeDropdownIndex === idx;

                return (
                  <div
                    key={idx}
                    className="flex gap-2.5 items-center px-4 py-2.5 hover:bg-stone-50/50 dark:hover:bg-stone-800/40 transition-colors relative"
                  >
                    {/* Item Code Input with Live-Filtered Dropdown (BOM Mechanism) */}
                    <div className="w-[170px] relative">
                      <div className="relative flex items-center">
                        <input
                          required
                          type="text"
                          value={item.item_code}
                          onFocus={() => setActiveDropdownIndex(idx)}
                          onChange={(e) => handleItemCodeChange(idx, e.target.value)}
                          placeholder="Type SKU Code..."
                          className={cn(
                            "w-full pl-3 pr-7 py-2 bg-white dark:bg-stone-900 border rounded-xl text-xs font-mono font-bold uppercase outline-none transition-all placeholder:text-stone-300 placeholder:normal-case",
                            item.item_id
                              ? "border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:border-stone-900"
                              : item.item_code.trim()
                                ? "border-amber-400 text-amber-900 bg-amber-50/20"
                                : "border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:border-stone-900"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setActiveDropdownIndex(isDropdownOpen ? null : idx)
                          }
                          className="absolute right-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Live Dropdown List */}
                      {isDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setActiveDropdownIndex(null)}
                          />
                          <div className="absolute left-0 top-full mt-1.5 w-80 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl z-50 p-2 max-h-60 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
                            {filteredMatches.length === 0 ? (
                              <div className="p-3 text-center text-xs text-stone-400 font-medium">
                                No registered Finished Good found
                              </div>
                            ) : (
                              filteredMatches.map((cat) => {
                                const isSelected = item.item_id === cat.id;
                                return (
                                  <div
                                    key={cat.id}
                                    onClick={() => handleSelectCatalogItem(idx, cat)}
                                    className={cn(
                                      "p-2.5 rounded-xl cursor-pointer flex justify-between items-center text-xs transition-colors",
                                      isSelected
                                        ? "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white font-bold"
                                        : "hover:bg-stone-50 dark:hover:bg-stone-800/60 text-stone-800 dark:text-stone-200"
                                    )}
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="font-mono font-bold text-[11px] text-stone-900 dark:text-white uppercase truncate">
                                        {cat.item_code}
                                      </div>
                                      <div className="text-[11px] text-stone-600 dark:text-stone-400 truncate">
                                        {cat.name}
                                      </div>
                                      <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                                        UOM: {cat.uom || "Unit"} | Stock:{" "}
                                        <span
                                          className={
                                            cat.available_qty > 0
                                              ? "text-emerald-600 font-bold"
                                              : "text-stone-400"
                                          }
                                        >
                                          {cat.available_qty || 0}
                                        </span>
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Product Description (Auto-populated and Locked strictly from Finished Good) */}
                    <div className="flex-1">
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={item.title}
                        placeholder={
                          item.item_code.trim() && !item.item_id
                            ? "Select valid item from code dropdown"
                            : "Auto-populated from Item Code"
                        }
                        className={cn(
                          "w-full px-3 py-2 rounded-xl text-xs font-semibold outline-none cursor-not-allowed select-none transition-all",
                          item.item_id
                            ? "bg-stone-50/80 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
                            : "bg-stone-50/40 dark:bg-stone-800/20 border border-dashed border-stone-200 dark:border-stone-700 text-stone-400 placeholder:text-stone-400"
                        )}
                      />
                    </div>

                    {/* Quantity */}
                    <div className="w-[80px]">
                      <input
                        required
                        type="number"
                        min="0.1"
                        step="any"
                        value={item.qty}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx].qty = e.target.value;
                          setItems(newItems);
                        }}
                        placeholder="Qty"
                        className="w-full px-2 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-bold font-mono text-stone-900 dark:text-white text-center outline-none focus:border-stone-900"
                      />
                    </div>

                    {/* UOM Display (Auto-populated from Finished Good) */}
                    <div className="w-[85px]">
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={item.uom || "Unit"}
                        className="w-full px-2 py-2 bg-stone-50/80 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 text-center cursor-not-allowed outline-none select-none"
                      />
                    </div>

                    {/* Unit Price (Quotation Commercial Negotiation Value) */}
                    <div className="w-[150px] relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-stone-400 select-none">
                        Rp
                      </span>
                      <input
                        required
                        type="text"
                        value={item.price ? formatNumberWithDots(item.price) : ""}
                        onChange={(e) => {
                          const newItems = [...items];
                          const val = e.target.value.replace(/[^\d]/g, "");
                          newItems[idx].price = val;
                          setItems(newItems);
                        }}
                        placeholder="0"
                        className="w-full pl-7 pr-2.5 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-bold font-mono text-stone-900 dark:text-white text-right outline-none focus:border-stone-900 placeholder:text-stone-400"
                      />
                    </div>

                    {/* Cumulative Subtotal */}
                    <div className="w-[125px] text-right pr-2 text-xs font-mono font-bold text-stone-800 dark:text-stone-200 tracking-tight">
                      {formatIDR((Number(item.qty) || 0) * (Number(item.price) || 0))}
                    </div>

                    {/* Action Delete */}
                    <div className="w-8 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        disabled={items.length === 1}
                        className="p-1.5 text-stone-400 hover:text-rose-600 disabled:opacity-20 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Financial Breakdown & Remarks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Remarks & Operations Notes */}
          <div className="space-y-1.5 flex flex-col h-full">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1">
              Operational & Delivery Notes
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Delivery Franco to project site / Including quality inspection certification..."
              className="w-full flex-1 min-h-[140px] px-4 py-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl text-xs font-medium text-stone-850 dark:text-stone-200 outline-none resize-none"
            />
          </div>

          {/* Pricing Engine & Tax Calculation */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1">
              Pricing & Tax Calculation
            </label>
            <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 space-y-3 shadow-xs">
              {/* Tax scheme selection */}
              <div className="bg-white dark:bg-stone-800/80 p-3 rounded-xl border border-stone-200 dark:border-stone-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black text-stone-600 dark:text-stone-300 uppercase tracking-wider">
                    Transaction Tax Scheme
                  </label>
                </div>
                <select
                  value={taxCategory}
                  onChange={(e) => handleTaxCategoryChange(e.target.value)}
                  className="w-full bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-800 dark:text-stone-200 outline-none cursor-pointer"
                >
                  <option value="GOODS_DPP_LAIN">Goods: VAT 12% (Deemed Tax Base 11/12 PMK RI)</option>
                  <option value="SERVICES_DPP_LAIN">Services: VAT 12% (Deemed Tax Base) + WHT 23 (2%)</option>
                  <option value="NON_PKP">Non-PKP / Tax Exempt (VAT 0%, Income Tax 0%)</option>
                </select>
              </div>

              {/* Subtotal Gross */}
              <div className="flex justify-between items-center text-xs border-b border-stone-200/60 dark:border-stone-800 pb-2">
                <span className="font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wider text-[9px]">
                  Subtotal Gross
                </span>
                <span className="font-bold font-mono text-stone-700 dark:text-stone-300">
                  {formatIDRWithDecimals(subtotalAmount, 2)}
                </span>
              </div>

              {/* Discount */}
              <div className="flex justify-between items-center text-xs border-b border-stone-200/60 dark:border-stone-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wider text-[9px]">
                    Discount
                  </span>
                  <div className="relative w-16">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      placeholder="0"
                      value={discountRate}
                      onChange={(e) => setDiscountRate(e.target.value)}
                      className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-0.5 text-[11px] font-bold text-stone-800 dark:text-white text-center outline-none focus:ring-1 focus:ring-stone-400"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-400 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
                <span className={cn("font-bold font-mono", parseFloat(discountRate) > 0 ? "text-rose-600" : "text-stone-400")}>
                  {parseFloat(discountRate) > 0 ? `- ${formatIDRWithDecimals(discountAmount, 2)}` : formatIDRWithDecimals(0, 2)}
                </span>
              </div>

              {/* DPP (Dasar Pengenaan Pajak) */}
              <div className="flex justify-between items-center text-xs border-b border-stone-200/60 dark:border-stone-800 pb-2">
                <span className="font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider text-[9px]">
                  Tax Base (DPP)
                </span>
                <span className="font-black font-mono text-stone-900 dark:text-white">
                  {formatIDRWithDecimals(breakdown.dpp, 2)}
                </span>
              </div>

              {/* DPP Nilai Lain Basis (11/12) */}
              {breakdown.isDppNilaiLain && (
                <div className="flex justify-between items-center text-xs border-b border-stone-200/60 dark:border-stone-800 pb-1.5 bg-stone-100/60 dark:bg-stone-800/40 px-2 py-1 rounded">
                  <span className="font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wider text-[8.5px]">
                    Deemed Tax Base (11/12 PMK)
                  </span>
                  <span className="font-bold font-mono text-stone-800 dark:text-stone-200 text-[11px]">
                    {formatIDRWithDecimals(breakdown.dppNilaiLain, 2)}
                  </span>
                </div>
              )}

              {/* PPN */}
              {taxRate !== "0" && (
                <div className="flex justify-between items-center text-xs border-b border-stone-200/60 dark:border-stone-800 pb-2">
                  <span className="font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wider text-[9px]">
                    VAT {taxRate}% {breakdown.isDppNilaiLain ? "(PMK 11/12)" : ""}
                  </span>
                  <span className="font-bold font-mono text-stone-800 dark:text-stone-200">
                    + {formatIDRWithDecimals(ppnTaxAmount, 2)}
                  </span>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between items-center pt-1 border-t border-stone-300 dark:border-stone-700">
                <span className="font-black text-stone-950 dark:text-white uppercase tracking-widest text-[10px]">
                  GRAND TOTAL
                </span>
                <span className="text-base font-black font-mono text-stone-900 dark:text-white tracking-tight">
                  {formatIDRWithDecimals(netEarnings, 2)}
                </span>
              </div>

              {/* If PPh Withholding applies */}
              {breakdown.pphRate > 0 && (
                <div className="p-2.5 bg-amber-50/70 dark:bg-stone-800/60 border border-amber-200/80 dark:border-stone-700 rounded-xl space-y-1 mt-2">
                  <div className="flex justify-between text-xs text-stone-600 dark:text-stone-400">
                    <span>PPh 23 Withholding ({breakdown.pphRate}%):</span>
                    <span className="font-mono font-bold text-rose-600">
                      - {formatIDRWithDecimals(breakdown.pphAmount, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-black text-emerald-800 dark:text-emerald-400 pt-1 border-t border-amber-200/60 dark:border-stone-700">
                    <span>Estimated Net Receivable:</span>
                    <span className="font-mono text-sm">{formatIDRWithDecimals(breakdown.netPayable, 2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-5 border-t border-stone-200 dark:border-stone-800 shrink-0">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            variant="secondary"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => submitAs("DRAFT")}
              className="bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 border-none"
            >
              {isSubmitting ? "Saving..." : "Save Draft"}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => submitAs("PENDING")}
              className="bg-stone-900 text-white hover:bg-stone-800 font-bold shadow-md hover:shadow-lg"
            >
              {isSubmitting ? "Submitting..." : "Submit Official Quotation"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

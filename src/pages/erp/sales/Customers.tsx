import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { useEffect, useState } from "react";
import {
  Building2,
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  X,
  Award,
  TrendingUp,
  CheckCircle2,
  FileText,
  Eye,
  Edit2,
  Trash2,
  Receipt,
  DollarSign,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Action, hasPermission } from "@/utils/pbac";
import { useCustomersLocal } from "@/hooks/useCustomersLocal";
import { CreateQuotationModal } from "@/components/erp/CreateQuotationModal";
import { QuotationPreviewModal } from "@/components/erp/QuotationPreviewModal";

interface Customer {
  id: string;
  name: string;
  code: string;
  contact_person?: string;
  email: string;
  phone: string;
  address: string;
  npwp?: string;
  delivered_count?: number;
  pending_count?: number;
  total_deliveries?: number;
  total_quotations?: number;
  total_quotation_value?: number;
  pending_quotations_count?: number;
}

interface Lead {
  id: string;
  name: string;
  contact_info: string;
  intent: string;
  status: string;
  created_at: string;
}

export default function Customers() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    customers: localCustomers,
    isLoading,
    addCustomerLocal,
    updateCustomerLocal,
    deleteCustomerLocal,
    refreshCloud,
  } = useCustomersLocal(user);
  const customers = localCustomers as Customer[];

  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canModify = hasPermission(user, Action.MANAGE_CUSTOMERS);

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleteLeadConfirm, setDeleteLeadConfirm] = useState<{id: string; name: string} | null>(null);

  // Customer Profile Details & Quotations Integration State
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);
  const [customerDetails, setCustomerDetails] = useState<{
    customer: any;
    quotations: any[];
    deliveries: any[];
    invoices: any[];
    projects: any[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<"quotations" | "deliveries" | "invoices">("quotations");

  const [showCreateQuoModal, setShowCreateQuoModal] = useState(false);
  const [selectedQuoToPreview, setSelectedQuoToPreview] = useState<any | null>(null);

  const fetchCustomerDetails = async (customerId: string) => {
    setLoadingDetails(true);
    try {
      const res = await apiFetch(`/api/sales/customers/${customerId}/details`, {}, user?.username);
      if (res.ok && res.data) {
        setCustomerDetails({
          customer: res.data.customer,
          quotations: res.data.quotations || [],
          deliveries: res.data.deliveries || [],
          invoices: res.data.invoices || [],
          projects: res.data.projects || [],
        });
      } else {
        setCustomerDetails(null);
      }
    } catch (err) {
      console.error(err);
      setCustomerDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenCustomerProfile = (customer: Customer) => {
    setSelectedProfileCustomer(customer);
    fetchCustomerDetails(customer.id);
  };

  const fetchCustomersAndLeads = async () => {
    try {
      // Refresh cloud data
      refreshCloud();

      // Still fetch leads from API directly for now
      const resLeads = await apiFetch("/api/sales/leads", {}, user?.username);
      if (resLeads.ok)
        setLeads(Array.isArray(resLeads.data) ? resLeads.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCustomersAndLeads();
  }, [user]);

  const handleConvertLead = async (leadId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/leads/${leadId}/convert`,
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast("Lead successfully converted to Customer!", "success");
        fetchCustomersAndLeads();
      } else {
        showToast(res.error || "Failed to convert lead", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error converting lead", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteLead = async (leadId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/leads/${leadId}`,
        { method: "DELETE" },
        user?.username,
      );
      if (res.ok) {
        showToast("Lead deleted", "success");
        fetchCustomersAndLeads();
      } else {
        showToast(res.error || "Failed to delete lead", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error deleting lead", "error");
    } finally {
      setIsSubmitting(false);
      setDeleteLeadConfirm(null);
    }
  };

  const handleDeleteLead = (leadId: string, leadName: string) => {
    setDeleteLeadConfirm({ id: leadId, name: leadName });
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/customers/${editingCustomer.id}`,
        {
          method: "PUT",
          body: JSON.stringify(editingCustomer),
        },
        user?.username,
      );
      if (res.ok) {
        setShowEditModal(false);
        setEditingCustomer(null);
        fetchCustomersAndLeads();
        showToast("Customer profile updated successfully", "success");
      } else {
        showToast(res.error || "Failed to update customer", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating customer", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/customers/${id}`,
        {
          method: "DELETE",
        },
        user?.username,
      );
      if (res.ok) {
        setDeleteConfirm(null);
        fetchCustomersAndLeads();
        showToast("Customer profile deleted successfully", "success");
      } else {
        showToast(res.error || "Failed to delete customer", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error deleting customer", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    code: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    npwp: "",
  });

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/sales/customers",
        {
          method: "POST",
          body: JSON.stringify(newCustomer),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAddModal(false);
        setNewCustomer({
          name: "",
          code: "",
          contact_person: "",
          email: "",
          phone: "",
          address: "",
          npwp: "",
        });
        fetchCustomersAndLeads();
        showToast("Customer profile added successfully", "success");
      } else {
        showToast(res.error || "Failed to add customer", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error adding customer", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = React.useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.code && c.code.toLowerCase().includes(searchQuery.toLowerCase())),
    );
  }, [customers, searchQuery]);

  const [selectedFilter, setSelectedFilter] = useState<
    "ALL" | "VIP" | "ACTIVE" | "LEADS"
  >("ALL");

  const totalCust = customers.length;
  const tierACust = customers.filter((c) => {
    const del = c.delivered_count || 0;
    const tot = c.total_deliveries || 0;
    return tot > 0 && del / tot >= 0.95;
  }).length;
  const totalCompletedDeliveries = customers.reduce(
    (acc, c) => acc + (c.delivered_count || 0),
    0,
  );
  const activePipelines = customers.reduce(
    (acc, c) => acc + (c.pending_count || 0),
    0,
  );
  const totalLeads = leads.filter((l) => l.status !== "CONVERTED").length;

  const displayedCustomers = filteredCustomers.filter((c) => {
    if (selectedFilter === "VIP") {
      const del = c.delivered_count || 0;
      const tot = c.total_deliveries || 0;
      return tot > 0 && del / tot >= 0.95;
    }
    if (selectedFilter === "ACTIVE") {
      return (c.pending_count || 0) > 0;
    }
    return true;
  });

  const displayedLeads = leads.filter(
    (l) =>
      l.status !== "CONVERTED" &&
      l.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Customer Relations"
        subtitle="Customer accounts and contact directory"
        icon={<Building2 className="w-6 h-6" />}
        actions={
          canModify && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-8 py-3 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-stone-800 transition-all active:scale-95 flex items-center gap-2 shadow-sm pointer-events-auto"
            >
              <Plus className="w-4 h-4" /> Add Corporate Client
            </button>
          )
        }
      />

      {/* CRM Dashboard Intelligence Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 card-elegant rounded-3xl flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center text-stone-600 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
              Active Directory
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              {totalCust}
            </div>
            <div className="text-[10px] text-stone-500 font-semibold mt-0.5">
              Corporate Client Accounts
            </div>
          </div>
        </div>

        <div className="p-6 card-elegant rounded-3xl flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center text-stone-600 shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
              VIP Key Partners
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              {tierACust}
            </div>
            <div className="text-[10px] text-stone-500 font-semibold mt-0.5">
              &gt;95% Fulfillment Rating
            </div>
          </div>
        </div>

        <div className="p-6 card-elegant rounded-3xl flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center text-stone-600 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
              Total Deliveries
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              {totalCompletedDeliveries}
            </div>
            <div className="text-[10px] text-stone-500 font-semibold mt-0.5">
              Dispatched Lots
            </div>
          </div>
        </div>

        <div className="p-6 card-elegant rounded-3xl flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center text-stone-600 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
              Pipeline Lots
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              {activePipelines}
            </div>
            <div className="text-[10px] text-stone-500 font-semibold mt-0.5">
              Pending Deliveries Today
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Workspace Control */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Filter by customer name or lot reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200/60 rounded-2xl text-xs font-bold text-stone-900 focus:border-stone-400 focus:bg-white outline-none transition-all shadow-inner"
          />
        </div>

        <div className="flex gap-2 bg-stone-50 border border-stone-200/60 p-1.5 rounded-2xl overflow-x-auto">
          <button
            onClick={() => setSelectedFilter("LEADS")}
            className={cn(
              "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-1.5",
              selectedFilter === "LEADS"
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-400 hover:text-stone-900",
            )}
          >
            CRM Leads ({totalLeads})
          </button>
          <button
            onClick={() => setSelectedFilter("ALL")}
            className={cn(
              "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              selectedFilter === "ALL"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-400 hover:text-stone-900",
            )}
          >
            Clients
          </button>
          <button
            onClick={() => setSelectedFilter("VIP")}
            className={cn(
              "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-1.5",
              selectedFilter === "VIP"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-400 hover:text-stone-900",
            )}
          >
            <Award className="w-3.5 h-3.5" /> VIP ({tierACust})
          </button>
          <button
            onClick={() => setSelectedFilter("ACTIVE")}
            className={cn(
              "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 whitespace-nowrap",
              selectedFilter === "ACTIVE"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-400 hover:text-stone-900",
            )}
          >
            Pending ({activePipelines})
          </button>
        </div>
      </div>

      {/* CRM Customer List Layout (Table) */}
      <div className="card-elegant rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {selectedFilter === "LEADS" ? (
                <tr className="border-b border-stone-200 bg-stone-50/50">
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Lead Info
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Intent / Status
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Generated At
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Contact
                  </th>
                  {canModify && (
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right whitespace-nowrap">
                      Actions
                    </th>
                  )}
                </tr>
              ) : (
                <tr className="border-b border-stone-200 bg-stone-50/50">
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Customer Info
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Tier / Code
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Quotations & Offers
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Fulfillment Score
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest whitespace-nowrap">
                    Contact & Logistics
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-stone-100">
              {isLoading ? (
                <tr>
                  <td colSpan={canModify ? 5 : 4} className="py-20 text-center">
                    <Loader text="Loading global registry..." />
                  </td>
                </tr>
              ) : selectedFilter === "LEADS" ? (
                displayedLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canModify ? 5 : 4}
                      className="py-20 text-center text-stone-400"
                    >
                      <Building2 className="w-8 h-8 text-stone-200 mx-auto mb-3" />
                      <div className="text-[10px] font-bold uppercase tracking-widest">
                        No matching leads records
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-stone-50/50 transition-colors group"
                    >
                      <td className="px-6 py-5 align-top">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-400 shrink-0 mt-0.5 border border-orange-100">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-stone-900">
                              {lead.name}
                            </div>
                            <div className="text-[10px] text-stone-400 uppercase tracking-widest mt-1 font-bold">
                              Unconverted Lead
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 align-top">
                        <div className="text-xs font-semibold text-stone-800">
                          {lead.intent}
                        </div>
                      </td>
                      <td className="px-6 py-5 align-top text-xs text-stone-500">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-5 align-top text-xs text-stone-600 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span className="truncate max-w-[200px] font-semibold text-stone-800">
                            {lead.contact_info || "-"}
                          </span>
                        </div>
                      </td>
                      {canModify && (
                        <td className="px-6 py-5 align-top text-right">
                          <div className="flex flex-col items-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="xs"
                              variant="primary"
                              disabled={isSubmitting}
                              onClick={() => handleConvertLead(lead.id)}
                            >
                              Convert to Customer
                            </Button>
                            <Button
                              size="xs"
                              variant="danger_soft"
                              disabled={isSubmitting}
                              onClick={() => handleDeleteLead(lead.id, lead.name)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )
              ) : displayedCustomers.length === 0 ? (
                <tr>
                  <td
                    colSpan={canModify ? 5 : 4}
                    className="py-20 text-center text-stone-400"
                  >
                    <Building2 className="w-8 h-8 text-stone-200 mx-auto mb-3" />
                    <div className="text-[10px] font-bold uppercase tracking-widest">
                      No matching customer records
                    </div>
                  </td>
                </tr>
              ) : (
                displayedCustomers.map((cus) => {
                  const delivered = cus.delivered_count || 0;
                  const pending = cus.pending_count || 0;
                  const totalDeliveries = cus.total_deliveries || 0;

                  let grade = "NEW";
                  let gradeColor =
                    "bg-stone-50 text-stone-600 border-stone-200";
                  let rate = 0;

                  if (totalDeliveries > 0) {
                    rate = delivered / totalDeliveries;
                    if (rate >= 0.95) {
                      grade = "A";
                      gradeColor =
                        "bg-stone-800 text-stone-100 border-stone-700";
                    } else if (rate >= 0.8) {
                      grade = "B";
                      gradeColor =
                        "bg-stone-200 text-stone-800 border-stone-300";
                    } else if (rate >= 0.6) {
                      grade = "C";
                      gradeColor =
                        "bg-stone-100 text-stone-600 border-stone-200";
                    } else {
                      grade = "D";
                      gradeColor = "bg-red-50 text-red-700 border-red-200";
                    }
                  }

                  const percentFulfill =
                    totalDeliveries > 0
                      ? Math.round((delivered / totalDeliveries) * 100)
                      : 0;

                  return (
                    <tr
                      key={cus.id}
                      className="hover:bg-stone-50/50 transition-colors group"
                    >
                      <td className="px-6 py-5 align-top">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 shrink-0 mt-0.5">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <button
                              onClick={() => handleOpenCustomerProfile(cus)}
                              className="text-sm font-bold text-stone-900 hover:text-stone-600 transition-colors text-left flex items-center gap-1 group/title"
                            >
                              <span>{cus.name}</span>
                              <ExternalLink className="w-3 h-3 text-stone-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                            </button>
                            {cus.contact_person && (
                              <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-stone-300"></span>{" "}
                                {cus.contact_person} (Liaison)
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 align-top text-xs font-mono text-stone-500">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className="font-bold">
                            {cus.code || "NO-REF-GEN"}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[9px] tracking-widest font-black uppercase rounded border font-sans",
                              gradeColor,
                            )}
                          >
                            {grade === "NEW" ? "Lead" : `Tier ${grade}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 align-top">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleOpenCustomerProfile(cus)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-900 hover:text-stone-600 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5 text-stone-500" />
                            <span>{cus.total_quotations || 0} Quotes</span>
                          </button>
                          <span className="text-[10px] font-mono font-bold text-emerald-700">
                            {formatIDR(cus.total_quotation_value || 0)}
                          </span>
                          {cus.pending_quotations_count ? (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit">
                              {cus.pending_quotations_count} Pending
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-5 align-top">
                        <div className="w-40">
                          <div className="flex justify-between items-center text-[10px] font-bold text-stone-500 mb-1.5">
                            <span>{percentFulfill}% Achieved</span>
                            <span>{totalDeliveries} Total</span>
                          </div>
                          <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                percentFulfill >= 95
                                  ? "bg-stone-800"
                                  : percentFulfill >= 80
                                    ? "bg-stone-400"
                                    : percentFulfill >= 60
                                      ? "bg-stone-300"
                                      : "bg-red-400",
                              )}
                              style={{
                                width: `${totalDeliveries > 0 ? percentFulfill : 10}%`,
                              }}
                            ></div>
                          </div>
                          <div className="flex gap-3 text-[10px] font-bold mt-1.5">
                            <span className="text-stone-700">
                              {delivered} OK
                            </span>
                            <span className="text-stone-400">
                              {pending} Pend
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 align-top text-xs text-stone-600 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-stone-400" />
                          <span className="truncate max-w-[180px]">
                            {cus.email || "-"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-stone-400" />
                          <span>{cus.phone || "-"}</span>
                        </div>
                        {cus.npwp ? (
                          <div className="flex items-center gap-1.5 bg-stone-100/80 px-2 py-0.5 rounded text-[11px] font-mono text-stone-700 w-fit">
                            <span className="font-sans font-bold text-[9px] uppercase text-stone-400">NPWP</span>
                            <span className="font-bold">{cus.npwp}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-stone-400 italic">
                            No NPWP recorded
                          </div>
                        )}
                        <div className="flex items-start gap-2 max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5 text-stone-400 mt-0.5 shrink-0" />
                          <span className="truncate">{cus.address || "-"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={() => handleOpenCustomerProfile(cus)}
                            className="flex items-center gap-1.5 shadow-sm px-3"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Profile & Quotes</span>
                          </Button>
                          {canModify && (
                            <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-lg border border-stone-200/60">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCustomer(cus);
                                  setShowEditModal(true);
                                }}
                                title="Edit Customer"
                                className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-white rounded-md transition-all hover:shadow-sm"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(cus)}
                                title="Archive Customer"
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-white rounded-md transition-all hover:shadow-sm"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
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

      {/* Edit Customer Modal */}
      <Modal
        isOpen={showEditModal && editingCustomer !== null}
        onClose={() => setShowEditModal(false)}
        title="Edit Customer Profile"
        description="Update external recipient information"
      >
        {editingCustomer && (
          <form onSubmit={handleUpdateCustomer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Customer Name"
                required
                value={editingCustomer.name}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    name: e.target.value,
                  })
                }
              />
              <Input
                label="Customer Code"
                required
                value={editingCustomer.code || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    code: e.target.value.toUpperCase(),
                  })
                }
                className="font-mono font-bold"
              />
            </div>
            <Input
              label="Contact Person (Liaison)"
              value={editingCustomer.contact_person || ""}
              onChange={(e) =>
                setEditingCustomer({
                  ...editingCustomer,
                  contact_person: e.target.value,
                })
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                value={editingCustomer.email || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    email: e.target.value,
                  })
                }
              />
              <Input
                label="Phone"
                value={editingCustomer.phone || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    phone: e.target.value,
                  })
                }
              />
            </div>
            <Input
              label="NPWP / Tax ID (Nomor Pokok Wajib Pajak)"
              value={editingCustomer.npwp || ""}
              onChange={(e) =>
                setEditingCustomer({
                  ...editingCustomer,
                  npwp: e.target.value,
                })
              }
              placeholder="e.g. 01.234.567.8-901.000 / 16-digit NIK-NPWP"
              className="font-mono"
            />
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                Address
              </label>
              <textarea
                value={editingCustomer.address || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    address: e.target.value,
                  })
                }
                className="input-elegant min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-stone-100 font-sans">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() =>
          deleteConfirm && handleDeleteCustomer(deleteConfirm.id)
        }
        title="Delete Customer Profile?"
        message={`Are you sure you want to delete ${deleteConfirm?.name}? This action cannot be undone and will only succeed if the customer has no active delivery manifests or associated records.`}
        confirmText={isSubmitting ? "Deleting..." : "Confirm Delete"}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={deleteLeadConfirm !== null}
        onCancel={() => setDeleteLeadConfirm(null)}
        onConfirm={() =>
          deleteLeadConfirm && confirmDeleteLead(deleteLeadConfirm.id)
        }
        title="Delete Lead?"
        message={`Are you sure you want to delete the lead ${deleteLeadConfirm?.name}? This action cannot be undone.`}
        confirmText={isSubmitting ? "Deleting..." : "Confirm Delete"}
        isDestructive={true}
      />

      {/* Add Customer Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Customer Profile"
        description="Register a new external client in the master data"
      >
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Customer Name"
              required
              value={newCustomer.name}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, name: e.target.value })
              }
              placeholder="e.g. PT. Paving Nusantara"
            />
            <Input
              label="Customer Code"
              value={newCustomer.code}
              onChange={(e) =>
                setNewCustomer({
                  ...newCustomer,
                  code: e.target.value.toUpperCase(),
                })
              }
              className="font-mono"
              placeholder="e.g. CUS-001"
            />
          </div>
          <Input
            label="Contact Person"
            value={newCustomer.contact_person}
            onChange={(e) =>
              setNewCustomer({
                ...newCustomer,
                contact_person: e.target.value,
              })
            }
            placeholder="e.g. Bpk. Ahmad"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={newCustomer.email}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, email: e.target.value })
              }
              placeholder="procurement@client.com"
            />
            <Input
              label="Phone"
              value={newCustomer.phone}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, phone: e.target.value })
              }
              placeholder="0812-xxxx-xxxx"
            />
          </div>
          <Input
            label="NPWP / Tax ID (Nomor Pokok Wajib Pajak)"
            value={newCustomer.npwp}
            onChange={(e) =>
              setNewCustomer({ ...newCustomer, npwp: e.target.value })
            }
            className="font-mono"
            placeholder="e.g. 01.234.567.8-901.000 / 16-digit NIK-NPWP"
          />
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              Address
            </label>
            <textarea
              value={newCustomer.address}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, address: e.target.value })
              }
              className="input-elegant min-h-[80px]"
              placeholder="Jl. Pahlawan Karya No. 456..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-stone-100 font-sans">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Customer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CUSTOMER PROFILE & QUOTATIONS INTEGRATION MODAL */}
      <Modal
        isOpen={selectedProfileCustomer !== null}
        onClose={() => {
          setSelectedProfileCustomer(null);
          setCustomerDetails(null);
        }}
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold text-stone-900">
                {selectedProfileCustomer?.name}
              </div>
              <div className="text-xs font-mono font-bold text-stone-400">
                Customer Reference: {selectedProfileCustomer?.code || "N/A"}
              </div>
            </div>
          </div>
        }
        maxWidth="4xl"
      >
        {loadingDetails ? (
          <div className="py-16 text-center">
            <Loader text="Loading customer profile, quotations & operational history..." />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Customer Quick Profile Card */}
            <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs text-stone-600 flex flex-wrap items-center gap-4">
                  {selectedProfileCustomer?.contact_person && (
                    <span className="flex items-center gap-1 font-medium">
                      <strong>Liaison:</strong> {selectedProfileCustomer.contact_person}
                    </span>
                  )}
                  {selectedProfileCustomer?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-stone-400" /> {selectedProfileCustomer.email}
                    </span>
                  )}
                  {selectedProfileCustomer?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-stone-400" /> {selectedProfileCustomer.phone}
                    </span>
                  )}
                  {selectedProfileCustomer?.npwp && (
                    <span className="flex items-center gap-1 bg-stone-200/80 px-2 py-0.5 rounded font-mono text-stone-800 text-[11px]">
                      <span className="font-sans font-bold text-[9px] uppercase text-stone-500">NPWP:</span>
                      <strong>{selectedProfileCustomer.npwp}</strong>
                    </span>
                  )}
                </div>
                {selectedProfileCustomer?.address && (
                  <div className="text-xs text-stone-500 flex items-start gap-1 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                    <span>{selectedProfileCustomer.address}</span>
                  </div>
                )}
              </div>

              <Button
                size="sm"
                variant="primary"
                onClick={() => setShowCreateQuoModal(true)}
                className="flex items-center gap-2 shadow-xs"
              >
                <Plus className="w-4 h-4" /> Create Quotation for Client
              </Button>
            </div>

            {/* Metrics KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Quotations Offered</span>
                  <FileText className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {(Array.isArray(customerDetails?.quotations) ? customerDetails.quotations : []).length} <span className="text-xs font-normal text-stone-500">Quotes</span>
                </div>
                <div className="text-xs text-emerald-700 font-bold mt-1 font-mono">
                  {formatIDR(
                    (Array.isArray(customerDetails?.quotations) ? customerDetails.quotations : [])
                      .filter((q: any) => q.status === "APPROVED")
                      .reduce((sum: number, q: any) => sum + (q.amount || 0), 0) || 0
                  )}{" "}
                  <span className="text-[10px] font-sans text-stone-500 font-normal">(Approved)</span>
                </div>
              </div>

              <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Delivery Manifests</span>
                  <Receipt className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {(Array.isArray(customerDetails?.deliveries) ? customerDetails.deliveries : []).length} <span className="text-xs font-normal text-stone-500">Lots</span>
                </div>
                <div className="text-xs text-stone-500 font-medium mt-1">
                  {(Array.isArray(customerDetails?.deliveries) ? customerDetails.deliveries : []).filter((d: any) => d.status === "DELIVERED").length} Delivered
                </div>
              </div>

              <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Commercial Invoices</span>
                  <DollarSign className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {(Array.isArray(customerDetails?.invoices) ? customerDetails.invoices : []).length} <span className="text-xs font-normal text-stone-500">Invoices</span>
                </div>
                <div className="text-xs text-stone-500 font-medium mt-1">
                  {(Array.isArray(customerDetails?.projects) ? customerDetails.projects : []).length} Linked Active Projects
                </div>
              </div>
            </div>

            {/* Profile Tab Navigation */}
            <div className="flex border-b border-stone-200 gap-6">
              <button
                onClick={() => setActiveProfileTab("quotations")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2",
                  activeProfileTab === "quotations"
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                )}
              >
                <FileText className="w-4 h-4" />
                Commercial Quotations ({customerDetails?.quotations.length || 0})
              </button>
              <button
                onClick={() => setActiveProfileTab("deliveries")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2",
                  activeProfileTab === "deliveries"
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                )}
              >
                <Receipt className="w-4 h-4" />
                Delivery Records ({customerDetails?.deliveries.length || 0})
              </button>
              <button
                onClick={() => setActiveProfileTab("invoices")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2",
                  activeProfileTab === "invoices"
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                )}
              >
                <DollarSign className="w-4 h-4" />
                Invoices ({customerDetails?.invoices.length || 0})
              </button>
            </div>

            {/* TAB CONTENT: QUOTATIONS */}
            {activeProfileTab === "quotations" && (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {(!customerDetails?.quotations || customerDetails.quotations.length === 0) ? (
                  <div className="py-12 text-center text-stone-400 border border-dashed border-stone-200 rounded-2xl">
                    <FileText className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No commercial quotations created yet for this customer</p>
                    <p className="text-xs text-stone-400 mt-1">Start building proposals and track quotation statuses directly from this profile.</p>
                    <div className="flex justify-center mt-4">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setShowCreateQuoModal(true)}
                      >
                        + Create First Quotation
                      </Button>
                    </div>
                  </div>
                ) : (
                  customerDetails.quotations.map((q) => (
                    <div
                      key={q.id}
                      className="p-4 bg-white border border-stone-200/90 rounded-2xl hover:border-stone-300 transition-all flex items-center justify-between gap-4 shadow-2xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded">
                            {q.quotation_number}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded",
                              q.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-700"
                                : q.status === "PENDING"
                                ? "bg-amber-100 text-amber-700"
                                : q.status === "REVISION"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-stone-100 text-stone-600"
                            )}
                          >
                            {q.status}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-stone-900">{q.title}</div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-3">
                          <span>Items: {q.items?.length || 0} lines</span>
                          <span>•</span>
                          <span>Created: {new Date(q.created_at).toLocaleDateString("id-ID", { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-black font-mono text-stone-900">
                          {formatIDR(q.amount)}
                        </div>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => setSelectedQuoToPreview(q)}
                          className="mt-2 flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Preview Document
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: DELIVERIES */}
            {activeProfileTab === "deliveries" && (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {(!customerDetails?.deliveries || customerDetails.deliveries.length === 0) ? (
                  <div className="py-12 text-center text-stone-400 border border-dashed border-stone-200 rounded-2xl">
                    <Receipt className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No delivery notes recorded</p>
                  </div>
                ) : (
                  customerDetails.deliveries.map((dn) => (
                    <div
                      key={dn.id}
                      className="p-3.5 bg-white border border-stone-200 rounded-2xl flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-stone-900">{dn.dn_number}</div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          Date: {new Date(dn.created_at).toLocaleDateString("id-ID")}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full",
                          dn.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {dn.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: INVOICES */}
            {activeProfileTab === "invoices" && (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {(!customerDetails?.invoices || customerDetails.invoices.length === 0) ? (
                  <div className="py-12 text-center text-stone-400 border border-dashed border-stone-200 rounded-2xl">
                    <DollarSign className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No commercial invoices generated</p>
                  </div>
                ) : (
                  customerDetails.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3.5 bg-white border border-stone-200 rounded-2xl flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-stone-900">{inv.invoice_number}</div>
                        <div className="text-[11px] font-mono text-stone-600 font-bold mt-0.5">
                          {formatIDR(inv.total_amount)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full",
                          inv.status === "PAID"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {inv.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* CREATE QUOTATION MODAL FROM CUSTOMER PROFILE */}
      {selectedProfileCustomer && (
        <CreateQuotationModal
          isOpen={showCreateQuoModal}
          onClose={() => setShowCreateQuoModal(false)}
          initialCustomerId={selectedProfileCustomer.id}
          onSuccess={() => {
            setShowCreateQuoModal(false);
            showToast("Quotation successfully created for " + selectedProfileCustomer.name, "success");
            fetchCustomerDetails(selectedProfileCustomer.id);
            fetchCustomersAndLeads();
          }}
        />
      )}

      {/* PREVIEW QUOTATION MODAL */}
      {selectedQuoToPreview && (
        <QuotationPreviewModal
          isOpen={selectedQuoToPreview !== null}
          onClose={() => setSelectedQuoToPreview(null)}
          quotation={selectedQuoToPreview}
        />
      )}
    </div>
  );
}

import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  X,
  ShieldCheck,
  FileText,
  Handshake,
  Filter,
  ChevronDown,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Action, hasPermission } from "@/utils/pbac";

interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  npwp?: string;
  tax_scheme?: string;
  payment_terms?: string;
  passed_count?: number;
  rejected_count?: number;
  total_orders?: number;
}

export default function Vendors() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canModify = hasPermission(user, Action.MANAGE_VENDORS);

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Supplier | null>(null);

  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/suppliers", {}, user?.username);
      if (res.ok) {
        setSuppliers(Array.isArray(res.data) ? res.data : []);
      } else {
        showToast(res.error || "Failed to fetch suppliers", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching suppliers", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/suppliers/${editingSupplier.id}`,
        {
          method: "PUT",
          body: JSON.stringify(editingSupplier),
        },
        user?.username,
      );
      if (res.ok) {
        setShowEditModal(false);
        setEditingSupplier(null);
        fetchSuppliers();
        showToast("Supplier updated successfully", "success");
      } else {
        showToast(res.error || "Failed to update supplier", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating supplier", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/suppliers/${id}`,
        {
          method: "DELETE",
        },
        user?.username,
      );
      if (res.ok) {
        setDeleteConfirm(null);
        fetchSuppliers();
        showToast("Supplier deleted successfully", "success");
      } else {
        showToast(res.error || "Failed to delete supplier", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error deleting supplier", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [newSupplier, setNewSupplier] = useState({
    name: "",
    code: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    npwp: "",
  });

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/suppliers",
        {
          method: "POST",
          body: JSON.stringify(newSupplier),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAddModal(false);
        setNewSupplier({
          name: "",
          code: "",
          contact_person: "",
          email: "",
          phone: "",
          address: "",
          npwp: "",
        });
        fetchSuppliers();
        showToast("Supplier added successfully", "success");
      } else {
        showToast(res.error || "Failed to add supplier", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error adding supplier", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [gradeFilter, setGradeFilter] = useState<string>("ALL");

  const getSupplierGrade = (sup: Supplier) => {
    const passed = sup.passed_count || 0;
    const rejected = sup.rejected_count || 0;
    const totalOrders = sup.total_orders || 0;
    const totalGrns = passed + rejected;

    if (totalOrders > 0 && totalGrns === 0) {
      return "PEN";
    } else if (totalGrns > 0) {
      const healthScore = passed / totalGrns;
      if (healthScore >= 0.95) return "A";
      if (healthScore >= 0.8) return "B";
      if (healthScore >= 0.6) return "C";
      return "D";
    }
    return "NEW";
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.phone && s.phone.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (gradeFilter === "ALL") return true;
    const grade = getSupplierGrade(s);
    if (gradeFilter === "A") return grade === "A";
    if (gradeFilter === "B_C") return grade === "B" || grade === "C";
    if (gradeFilter === "NEW_PEN") return grade === "NEW" || grade === "PEN";
    return true;
  });

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Supplier Profiles"
        subtitle="Supplier directory, quality performance & contact records"
        icon={<Handshake className="w-5 h-5" />}
        actions={
          canModify && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-2.5 bg-stone-800 text-white text-xs font-bold rounded-xl hover:bg-stone-900 transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add New Supplier
            </button>
          )
        }
      />

      {/* Elegant Filter & Search Toolbar */}
      <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input with leading icon and clear button */}
        <div className="relative flex-1 max-w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search suppliers by name, code, contact person..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9.5 pr-8 bg-stone-50/70 hover:bg-stone-50 focus:bg-white text-stone-800 placeholder-stone-400 text-xs font-medium rounded-xl border border-stone-200/90 transition-all outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/15"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 rounded-md transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Integrated Filter Controls Row */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 justify-end">
          {/* Grade Performance Filter */}
          <div className="relative inline-flex items-center min-w-[155px] flex-1 sm:flex-initial">
            <Filter className="absolute left-3 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full h-10 pl-8 pr-8 bg-stone-50/70 hover:bg-stone-100/60 text-stone-700 text-xs font-semibold rounded-xl border border-stone-200/90 transition-all cursor-pointer outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/15 appearance-none"
            >
              <option value="ALL">All Grades ({suppliers.length})</option>
              <option value="A">Grade A (Optimal &gt;95%)</option>
              <option value="B_C">Grade B / C (Standard)</option>
              <option value="NEW_PEN">New / Pending QC</option>
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          </div>

          {/* Result Count Badge */}
          <div className="h-10 px-3.5 bg-stone-50/90 border border-stone-200/90 rounded-xl flex items-center gap-1.5 text-xs font-bold text-stone-600 whitespace-nowrap">
            <Building2 className="w-3.5 h-3.5 text-stone-400" />
            <span>
              {filteredSuppliers.length}{" "}
              <span className="font-normal text-stone-400">of</span>{" "}
              {suppliers.length} Total
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full">
            <Loader text="Loading suppliers..." className="py-20" />
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full empty-state my-8">
            <Users className="w-8 h-8 text-stone-300 mb-4" />
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.2em]">
              No Suppliers Found
            </div>
          </div>
        ) : (
          filteredSuppliers.map((sup) => {
            const passed = sup.passed_count || 0;
            const rejected = sup.rejected_count || 0;
            const totalOrders = sup.total_orders || 0;
            const totalGrns = passed + rejected;

            let grade = "NEW";
            let gradeColor = "bg-blue-50 text-blue-700 border-blue-200";
            let healthScore = 0;

            if (totalOrders > 0 && totalGrns === 0) {
              grade = "PEN";
              gradeColor = "bg-stone-50 text-stone-500 border-stone-200";
            } else if (totalGrns > 0) {
              healthScore = passed / totalGrns;
              if (healthScore >= 0.95) {
                grade = "A";
                gradeColor =
                  "bg-emerald-50 text-emerald-700 border-emerald-200";
              } else if (healthScore >= 0.8) {
                grade = "B";
                gradeColor = "bg-lime-50 text-lime-700 border-lime-200";
              } else if (healthScore >= 0.6) {
                grade = "C";
                gradeColor = "bg-amber-50 text-amber-700 border-amber-200";
              } else {
                grade = "D";
                gradeColor = "bg-red-50 text-red-700 border-red-200";
              }
            }

            return (
              <div
                key={sup.id}
                className="bg-white p-6 border border-stone-200 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                      {sup.name}
                    </h3>
                    <div className="text-[10px] text-stone-400 font-bold tracking-widest uppercase mt-1 flex items-center gap-2">
                      {sup.code || "NO CODE"}
                      <span
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] rounded-sm font-semibold border",
                          gradeColor,
                        )}
                      >
                        {grade === "NEW" || grade === "PEN"
                          ? grade
                          : `GRADE ${grade}`}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-full text-stone-400 group-hover:text-stone-900 group-hover:bg-stone-100 transition-colors">
                    <Users className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-stone-600">
                    <Mail className="w-4 h-4 text-stone-400" />
                    {sup.email || (
                      <span className="text-stone-400 italic">No email</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-stone-600">
                    <Phone className="w-4 h-4 text-stone-400" />
                    {sup.phone || (
                      <span className="text-stone-400 italic">No phone</span>
                    )}
                  </div>
                  <div className="flex items-start gap-3 text-sm text-stone-600">
                    <MapPin className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">
                      {sup.address || (
                        <span className="text-stone-400 italic">
                          No address
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-stone-50 grid grid-cols-3 gap-2 text-center items-center font-sans">
                  <div className="bg-stone-50/80 p-2 rounded-xl">
                    <div className="text-[9px] font-bold text-stone-400 tracking-widest uppercase">
                      Orders
                    </div>
                    <div className="text-sm font-bold text-stone-900 mt-0.5">
                      {totalOrders}
                    </div>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-100 p-2 rounded-xl">
                    <div className="text-[9px] font-bold text-emerald-600 tracking-widest uppercase">
                      Passed
                    </div>
                    <div className="text-sm font-bold text-emerald-700 mt-0.5">
                      {passed}
                    </div>
                  </div>
                  <div className="bg-rose-50/50 border border-rose-100 p-2 rounded-xl">
                    <div className="text-[9px] font-bold text-rose-600 tracking-widest uppercase">
                      Rejected
                    </div>
                    <div className="text-sm font-bold text-rose-700 mt-0.5">
                      {rejected}
                    </div>
                  </div>
                </div>

                {/* Tax ID / NPWP Badge */}
                <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap items-center gap-1.5">
                  {sup.npwp ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      NPWP: {sup.npwp}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-stone-400 bg-stone-50 border border-stone-200/60 px-2 py-0.5 rounded-md">
                      No NPWP
                    </span>
                  )}
                </div>

                {sup.contact_person && (
                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                    <div className="text-[10px] text-stone-400 font-bold tracking-widest uppercase">
                      Contact
                    </div>
                    <div className="text-sm font-bold text-stone-800">
                      {sup.contact_person}
                    </div>
                  </div>
                )}

                {canModify && (
                  <div className="mt-4 pt-4 border-t border-stone-50 flex justify-end gap-2">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        setEditingSupplier(sup);
                        setShowEditModal(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="danger_soft"
                      onClick={() => setDeleteConfirm(sup)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit Supplier Modal */}
      <Modal
        isOpen={showEditModal && editingSupplier !== null}
        onClose={() => setShowEditModal(false)}
        title="Edit Supplier"
        description="Update vendor information"
      >
        {editingSupplier && (
          <form onSubmit={handleUpdateSupplier} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Supplier Name"
                required
                value={editingSupplier.name}
                onChange={(e) =>
                  setEditingSupplier({
                    ...editingSupplier,
                    name: e.target.value,
                  })
                }
              />
              <Input
                label="Supplier Code"
                value={editingSupplier.code || ""}
                onChange={(e) =>
                  setEditingSupplier({
                    ...editingSupplier,
                    code: e.target.value.toUpperCase(),
                  })
                }
                className="font-mono font-bold"
              />
            </div>
            <Input
              label="Contact Person"
              value={editingSupplier.contact_person || ""}
              onChange={(e) =>
                setEditingSupplier({
                  ...editingSupplier,
                  contact_person: e.target.value,
                })
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                value={editingSupplier.email || ""}
                onChange={(e) =>
                  setEditingSupplier({
                    ...editingSupplier,
                    email: e.target.value,
                  })
                }
              />
              <Input
                label="Phone"
                value={editingSupplier.phone || ""}
                onChange={(e) =>
                  setEditingSupplier({
                    ...editingSupplier,
                    phone: e.target.value,
                  })
                }
              />
            </div>
            <Input
              label="Tax ID / NPWP (Nomor Pokok Wajib Pajak)"
              value={editingSupplier.npwp || ""}
              onChange={(e) =>
                setEditingSupplier({
                  ...editingSupplier,
                  npwp: e.target.value,
                })
              }
              className="font-mono"
              placeholder="e.g. 01.234.567.8-901.000"
            />
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                Address
              </label>
              <textarea
                value={editingSupplier.address || ""}
                onChange={(e) =>
                  setEditingSupplier({
                    ...editingSupplier,
                    address: e.target.value,
                  })
                }
                className="input-elegant min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
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
          deleteConfirm && handleDeleteSupplier(deleteConfirm.id)
        }
        title="Delete Supplier?"
        message={`Are you sure you want to delete ${deleteConfirm?.name}? This action cannot be undone and will only succeed if the supplier has no active orders.`}
        confirmText={isSubmitting ? "Deleting..." : "Confirm Delete"}
        isDestructive={true}
      />

      {/* Add Supplier Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Supplier"
        description="Register a new vendor in the master data"
      >
        <form onSubmit={handleAddSupplier} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Supplier Name"
              required
              value={newSupplier.name}
              onChange={(e) =>
                setNewSupplier({ ...newSupplier, name: e.target.value })
              }
              placeholder="e.g. PT. Steel Indonesia"
            />
            <Input
              label="Supplier Code"
              value={newSupplier.code}
              onChange={(e) =>
                setNewSupplier({
                  ...newSupplier,
                  code: e.target.value.toUpperCase(),
                })
              }
              className="font-mono font-bold"
              placeholder="e.g. SUP-001"
            />
          </div>
          <Input
            label="Contact Person"
            value={newSupplier.contact_person}
            onChange={(e) =>
              setNewSupplier({
                ...newSupplier,
                contact_person: e.target.value,
              })
            }
            placeholder="e.g. Bpk. Budi"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={newSupplier.email}
              onChange={(e) =>
                setNewSupplier({ ...newSupplier, email: e.target.value })
              }
              placeholder="sales@vendor.com"
            />
            <Input
              label="Phone"
              value={newSupplier.phone}
              onChange={(e) =>
                setNewSupplier({ ...newSupplier, phone: e.target.value })
              }
              placeholder="021-xxxxxx"
            />
          </div>
          <Input
            label="Tax ID / NPWP (Nomor Pokok Wajib Pajak)"
            value={newSupplier.npwp}
            onChange={(e) =>
              setNewSupplier({ ...newSupplier, npwp: e.target.value })
            }
            className="font-mono"
            placeholder="e.g. 01.234.567.8-901.000"
          />
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              Address
            </label>
            <textarea
              value={newSupplier.address}
              onChange={(e) =>
                setNewSupplier({ ...newSupplier, address: e.target.value })
              }
              className="input-elegant min-h-[80px]"
              placeholder="Jl. Raya Industri No. 123..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Supplier"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

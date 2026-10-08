import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Plus, Trash2, Edit2, Check, X, Layers } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

export function StationManagementModal({ isOpen, onClose, projectId, stations, onRefresh }: { isOpen: boolean; onClose: () => void; projectId: string; stations: any[]; onRefresh: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ station_code: "", station_name: "", station_type: "SERIAL", max_manpower: 5 });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async (id?: string) => {
    if (isSaving) return;
    try {
      if (!projectId) {
        showToast("Please select a valid manufacturing project first.", "error");
        return;
      }
      if (!formData.station_code.trim() || !formData.station_name.trim()) {
        showToast("Station code and station name are required.", "error");
        return;
      }

      setIsSaving(true);
      const isEdit = !!id;
      const url = isEdit ? `/api/production/projects/${projectId}/stations/${id}` : `/api/production/projects/${projectId}/stations`;
      const res = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify({
          ...formData,
          station_code: formData.station_code.trim(),
          station_name: formData.station_name.trim(),
          max_manpower: Math.max(1, Number(formData.max_manpower) || 5)
        })
      }, user?.username);

      if (res.ok) {
        showToast(`Station ${isEdit ? "updated" : "created"} successfully.`, "success");
        setEditingId(null);
        setFormData({ station_code: "", station_name: "", station_type: "SERIAL", max_manpower: 5 });
        onRefresh();
      } else {
        showToast(res.data?.error || res.error || "Failed to save station", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId || isDeleting) return;
    try {
      setIsDeleting(true);
      const res = await apiFetch(`/api/production/projects/${projectId}/stations/${deletingId}`, { method: "DELETE" }, user?.username);
      if (res.ok) {
        showToast("Station deleted successfully.", "success");
        onRefresh();
      } else {
        showToast(res.data?.error || res.error || "Failed to delete station", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Station Management" maxWidth="3xl">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-stone-900 uppercase">Master Stations</h3>
            <p className="text-xs text-stone-500">Define physical workstations for routing layout and manpower grouping.</p>
          </div>
          <Button 
            onClick={() => { setEditingId("NEW"); setFormData({ station_code: "", station_name: "", station_type: "SERIAL", max_manpower: 3 }); }} 
            size="sm" 
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold gap-2"
          >
            <Plus className="w-4 h-4" /> Add Station
          </Button>
        </div>

        <div className="overflow-x-auto border border-stone-200 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 font-bold">Code</th>
                <th className="p-3 font-bold">Name</th>
                <th className="p-3 font-bold">Capacity Limit (Ops)</th>
                <th className="p-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {editingId === "NEW" && (
                <tr className="bg-emerald-50/30">
                  <td className="p-2"><input type="text" placeholder="e.g. ST-01" className="w-full p-1.5 rounded-lg border border-stone-200 text-xs" value={formData.station_code} onChange={e => setFormData({...formData, station_code: e.target.value})} /></td>
                  <td className="p-2"><input type="text" placeholder="e.g. Assembly Line A" className="w-full p-1.5 rounded-lg border border-stone-200 text-xs" value={formData.station_name} onChange={e => setFormData({...formData, station_name: e.target.value})} /></td>
                  <td className="p-2"><input type="number" min={1} max={30} className="w-20 p-1.5 rounded-lg border border-stone-200 text-xs font-mono font-bold" value={formData.max_manpower} onChange={e => setFormData({...formData, max_manpower: Number(e.target.value) || 1})} /></td>
                  <td className="p-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleSave()} className="text-emerald-600 hover:text-emerald-800 p-1 cursor-pointer"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )}
              {stations.map(st => (
                <tr key={st.id} className="hover:bg-stone-50/50">
                  {editingId === st.id ? (
                    <>
                      <td className="p-2"><input type="text" className="w-full p-1.5 rounded-lg border border-stone-200 text-xs" value={formData.station_code} onChange={e => setFormData({...formData, station_code: e.target.value})} /></td>
                      <td className="p-2"><input type="text" className="w-full p-1.5 rounded-lg border border-stone-200 text-xs" value={formData.station_name} onChange={e => setFormData({...formData, station_name: e.target.value})} /></td>
                      <td className="p-2"><input type="number" min={1} max={30} className="w-20 p-1.5 rounded-lg border border-stone-200 text-xs font-mono font-bold" value={formData.max_manpower} onChange={e => setFormData({...formData, max_manpower: Number(e.target.value) || 1})} /></td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleSave(st.id)} className="text-emerald-600 hover:text-emerald-800 p-1 cursor-pointer"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingId(null)} className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-mono text-stone-600">{st.station_code}</td>
                      <td className="p-3 font-bold text-stone-900 flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-emerald-600" /> {st.station_name}</td>
                      <td className="p-3 font-mono text-stone-600">
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 font-bold text-stone-700 text-[11px]">
                          {st.max_manpower || 5} Ops (Soft Limit)
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => { setEditingId(st.id); setFormData({ station_code: st.station_code, station_name: st.station_name, station_type: st.station_type, max_manpower: st.max_manpower || 5 }); }} className="text-stone-400 hover:text-blue-600 transition-colors cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(st.id)} className="text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {stations.length === 0 && editingId !== "NEW" && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-stone-400 italic">No stations configured yet. Add one to get started.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <ConfirmModal
        isOpen={!!deletingId}
        title="Delete Station"
        message="Are you sure you want to delete this station? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </Modal>
  );
}

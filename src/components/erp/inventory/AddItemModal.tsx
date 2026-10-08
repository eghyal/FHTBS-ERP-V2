import React from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  newItem: any;
  setNewItem: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e?: React.FormEvent | any) => void;
  isSubmitting: boolean;
}

export function AddItemModal({
  isOpen,
  onClose,
  newItem,
  setNewItem,
  onSubmit,
  isSubmitting,
}: AddItemModalProps) {
  const [showBypassAudit, setShowBypassAudit] = React.useState(false);
  const [bypassReason, setBypassReason] = React.useState("");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Item"
      description="Add a new SKU to the master inventory list"
      maxWidth="2xl"
      contentClassName="p-0 border-t border-stone-100"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(e);
        }}
        className="p-6 space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Item Code (SKU)"
            required
            value={newItem.item_code}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                item_code: e.target.value.toUpperCase(),
              })
            }
            placeholder="e.g. RM-001 / FG-PAVING-01"
            className="font-mono uppercase"
          />
          <Input
            label="Unit (UOM)"
            required
            value={newItem.uom}
            onChange={(e) =>
              setNewItem({ ...newItem, uom: e.target.value.toUpperCase() })
            }
            placeholder="e.g. PCS, M2, KG"
            className="uppercase"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Item Name"
            required
            value={newItem.name}
            onChange={(e) =>
              setNewItem({ ...newItem, name: e.target.value })
            }
            placeholder="e.g. Paving Block Bata 20x10x6 cm"
          />
          <Select
            label="Type of item"
            required
            value={newItem.type}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                type: e.target.value,
              })
            }
          >
            <option value="RAW">Raw Material</option>
            <option value="FINISH_GOOD">Finish Good</option>
            <option value="CONSUMABLE">Consumable</option>
            <option value="TOOL">Tool / Equipment</option>
            <option value="MACHINE">Machine</option>
            <option value="GENERAL">General</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Dimension (Optional)"
            value={newItem.dimension || ""}
            onChange={(e) =>
              setNewItem({ ...newItem, dimension: e.target.value })
            }
            placeholder="e.g. 1200x2400mm"
          />
          <Input
            label="Specification (Optional)"
            value={newItem.spec || ""}
            onChange={(e) =>
              setNewItem({ ...newItem, spec: e.target.value })
            }
            placeholder="e.g. ASTM A36"
          />
        </div>
        
        {newItem.type === "MACHINE" && (
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-4">
            <h4 className="text-xs font-black text-stone-900 uppercase tracking-widest">Configuration</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Machine Category"
                value={newItem.machine_category || ""}
                onChange={(e) => setNewItem({ ...newItem, machine_category: e.target.value })}
              >
                <option value="">Select Category</option>
                <option value="CUTTING">Cutting</option>
                <option value="BENDING">Bending</option>
                <option value="WELDING">Welding</option>
                <option value="MILLING">Milling</option>
                <option value="DRILLING">Drilling</option>
                <option value="ASSEMBLY">Assembly</option>
                <option value="QC">QC</option>
                <option value="PACKING">Packing</option>
                <option value="CUSTOM">Custom</option>
              </Select>
              <Input
                label="Capacity (Units/Hour)"
                type="number"
                value={newItem.capacity_per_hour || ""}
                onChange={(e) => setNewItem({ ...newItem, capacity_per_hour: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Manufacturer"
                type="text"
                value={newItem.manufacturer || ""}
                onChange={(e) => setNewItem({ ...newItem, manufacturer: e.target.value })}
                placeholder="e.g. Haas"
              />
              <Input
                label="Serial Number"
                type="text"
                value={newItem.serial_number || ""}
                onChange={(e) => setNewItem({ ...newItem, serial_number: e.target.value })}
                placeholder="e.g. SN-12345"
              />
            </div>
            
            <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-stone-700">Allow Multi-Station Assignment (Bypass)</label>
                <p className="text-[10px] text-stone-500">Enable this if the machine/tool can be assigned to multiple stations concurrently.</p>
              </div>
              <input
                type="checkbox"
                checked={newItem.bypass_multi_station || false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setNewItem({ ...newItem, bypass_multi_station: checked });
                  setShowBypassAudit(checked);
                }}
                className="w-5 h-5 rounded text-stone-900 focus:ring-stone-500"
              />
            </div>
            
            {showBypassAudit && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl mt-3 space-y-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-rose-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Bypass Audit Required</span>
                </div>
                <p className="text-[10px] text-rose-600 font-medium">Bypassing multi-station locks breaks Planning Constraints. Provide an operational reason to log this in the Production Logger (Section 16.9).</p>
                <textarea 
                  value={bypassReason}
                  onChange={(e) => setBypassReason(e.target.value)}
                  placeholder="e.g. This is a portable hand-drill used across multiple stations"
                  className="w-full px-3 py-2 text-xs bg-white border border-rose-200 rounded-lg outline-none focus:ring-1 focus:ring-rose-500"
                  rows={2}
                  required
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-6 border-t border-stone-100">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            className="text-xs font-bold"
          >
            Register Item
          </Button>
        </div>
      </form>
    </Modal>
  );
}
        

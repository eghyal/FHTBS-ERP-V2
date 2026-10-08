import React from "react";
import { AlertTriangle, Edit } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  editItem: any;
  setEditItem: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}

export function EditItemModal({
  isOpen,
  onClose,
  editItem,
  setEditItem,
  onSubmit,
  isSubmitting,
}: EditItemModalProps) {
  if (!editItem) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Edit className="w-5 h-5 text-stone-700" />
          <span>Edit Item / SKU Master Data</span>
        </div>
      }
      description={`Update specifications and master record for ${editItem.item_code || "item"}`}
      maxWidth="2xl"
      contentClassName="p-0 border-t border-stone-100"
    >
      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Item Code"
            required
            value={editItem.item_code || ""}
            onChange={(e) =>
              setEditItem({
                ...editItem,
                item_code: e.target.value.toUpperCase(),
              })
            }
            placeholder="e.g. RM-001"
            className="font-mono uppercase"
          />
          <Input
            label="Unit (UOM)"
            required
            value={editItem.uom || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, uom: e.target.value.toUpperCase() })
            }
            placeholder="e.g. PCS, KG, M"
            className="uppercase"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Item Name"
            required
            value={editItem.name || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, name: e.target.value })
            }
            placeholder="e.g. Mild Steel Plate"
          />
          <Select
            label="Asset Class / Type"
            required
            value={editItem.type || "RAW"}
            onChange={(e) =>
              setEditItem({ ...editItem, type: e.target.value })
            }
          >
            <option value="RAW">Raw Material</option>
            <option value="FINISH_GOOD">Finished Good</option>
            <option value="CONSUMABLE">Consumable</option>
            <option value="TOOL">Tool / Equipment</option>
            <option value="MACHINE">Machine</option>
            <option value="SPAREPART">Sparepart</option>
            <option value="GENERAL">General</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Dimension"
            value={editItem.dimension || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, dimension: e.target.value })
            }
            placeholder="e.g. 1200x2400x10mm"
          />
          <Input
            label="Specification"
            value={editItem.spec || ""}
            onChange={(e) =>
              setEditItem({ ...editItem, spec: e.target.value })
            }
            placeholder="e.g. ASTM A36 / SS400"
          />
        </div>

        {editItem.type === "MACHINE" && (
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-4">
            <h4 className="text-xs font-black text-stone-900 uppercase tracking-widest">
              Machine Specifics
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Machine Category"
                value={editItem.machine_category || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, machine_category: e.target.value })
                }
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
                value={editItem.capacity_per_hour || ""}
                onChange={(e) =>
                  setEditItem({
                    ...editItem,
                    capacity_per_hour: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="e.g. 100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Manufacturer"
                type="text"
                value={editItem.manufacturer || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, manufacturer: e.target.value })
                }
                placeholder="e.g. Haas"
              />
              <Input
                label="Serial Number"
                type="text"
                value={editItem.serial_number || ""}
                onChange={(e) =>
                  setEditItem({ ...editItem, serial_number: e.target.value })
                }
                placeholder="e.g. SN-12345"
              />
            </div>

            <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-stone-700">
                  Allow Multi-Station Assignment (Bypass)
                </label>
                <p className="text-[10px] text-stone-500">
                  Enable this if the machine/tool can be assigned across multiple stations concurrently.
                </p>
              </div>
              <input
                type="checkbox"
                checked={!!editItem.bypass_multi_station}
                onChange={(e) =>
                  setEditItem({ ...editItem, bypass_multi_station: e.target.checked })
                }
                className="w-5 h-5 rounded text-stone-900 focus:ring-stone-500"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-6 border-t border-stone-100">
          <Button
            type="button"
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
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

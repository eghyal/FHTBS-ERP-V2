import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleLoadPresetConfirm: (e: React.FormEvent) => void;
  setLoadPresetFile: (file: File | null) => void;
  setLoadPresetFileName: (name: string) => void;
  loadPresetFileName: string;
  loadPresetFile: File | null;
}

export const LoadPresetModal: React.FC<LoadPresetModalProps> = ({
  isOpen,
  onClose,
  handleLoadPresetConfirm,
  setLoadPresetFile,
  setLoadPresetFileName,
  loadPresetFileName,
  loadPresetFile,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Load BOM Preset"
      maxWidth="md"
      contentClassName="p-0 border-t border-stone-100"
    >
      <form onSubmit={handleLoadPresetConfirm} className="p-6 space-y-6">
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest px-1">
            Upload BOM Preset File (.json)
          </label>
          <div className="relative group">
            <input
              required
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setLoadPresetFile(file);
                  setLoadPresetFileName(file.name);
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="w-full border-2 border-dashed border-stone-200 rounded-3xl px-4 py-8 flex flex-col items-center justify-center bg-stone-50/50 group-hover:border-stone-300 transition-all">
              <div className="w-10 h-10 bg-white rounded-2xl shadow-sm border border-stone-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-5 h-5 text-stone-400" />
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold tracking-widest uppercase text-center break-all px-2",
                  loadPresetFileName ? "text-stone-900" : "text-stone-400"
                )}
              >
                {loadPresetFileName || "Click or drag preset file..."}
              </span>
            </div>
          </div>
          <p className="text-[8px] text-stone-400 font-medium tracking-wide text-center uppercase mt-2">
            * Hanya menerima format .json yang di-generate dari fitur Save Preset
          </p>
        </div>

        <div className="pt-2 flex justify-end gap-3 border-t border-stone-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            disabled={!loadPresetFile}
            type="submit"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Load Preset
          </Button>
        </div>
      </form>
    </Modal>
  );
};

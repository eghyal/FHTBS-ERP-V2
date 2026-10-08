import React, { useState } from "react";
import { X, QrCode, Search, CheckCircle2, AlertCircle, Clock, ShieldCheck, Factory, User, Hash } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";

interface WotQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewTag?: (tag: any) => void;
}

export const WotQrScannerModal: React.FC<WotQrScannerModalProps> = ({
  isOpen,
  onClose,
  onViewTag,
}) => {
  const [scanInput, setScanInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedTag, setVerifiedTag] = useState<any | null>(null);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!scanInput.trim()) return;

    setIsLoading(true);
    setError(null);
    setVerifiedTag(null);

    try {
      const res = await apiFetch<{ valid: boolean; tag: any; error?: string }>("/api/production/travel-tags/verify", {
        method: "POST",
        body: JSON.stringify({ qr_payload: scanInput.trim(), tag_number: scanInput.trim() }),
      });

      if (res.ok && res.data?.valid && res.data?.tag) {
        setVerifiedTag(res.data.tag);
      } else {
        setError(res.data?.error || res.error || "QR Tag tidak valid atau tidak ditemukan di sistem.");
      }
    } catch (err: any) {
      setError(err.message || "Gagal memverifikasi QR Tag.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setScanInput("");
    setVerifiedTag(null);
    setError(null);
  };

  let payloadObj: any = {};
  if (verifiedTag) {
    try {
      payloadObj = typeof verifiedTag.qr_payload === "string" ? JSON.parse(verifiedTag.qr_payload) : verifiedTag.qr_payload;
    } catch (e) {
      payloadObj = {};
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      className="p-0"
      contentClassName="p-0"
      title={
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-stone-900">Verifikasi QR WOT / Travel Tag</h2>
            <p className="text-[10px] uppercase font-bold tracking-widest text-stone-400 mt-1">Scan atau masukkan kode QR</p>
          </div>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <form onSubmit={handleVerify} className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-500 block">
            Scan Barcode / QR Reader atau Paste Payload:
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              required
              placeholder="Contoh: TAG-SPK-01 atau paste QR code payload..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              icon={<Search className="w-4 h-4" />}
              className="font-mono"
              autoFocus
            />
            <Button
              type="submit"
              disabled={isLoading || !scanInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              {isLoading ? "Verifying..." : "Verifikasi"}
            </Button>
          </div>
        </form>

        {/* Error Banner */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold mb-0.5">Verifikasi Gagal</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Verified Tag Result */}
        {verifiedTag && (
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between border-b border-emerald-200/80 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    DIGITAL PASSPORT AUTHENTIC
                  </span>
                  <h4 className="text-sm font-bold text-stone-900 font-mono mt-1">{verifiedTag.tag_number}</h4>
                </div>
              </div>
              <span className="text-xs font-mono text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg font-bold border border-emerald-200">
                {verifiedTag.qc_status || "PASSED"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                <span className="text-[10px] text-stone-400 block font-bold uppercase">Project / SPK</span>
                <span className="font-bold text-stone-900 text-xs truncate block">{verifiedTag.project_name || payloadObj.project_name || "N/A"}</span>
                <span className="text-[10px] font-mono text-stone-500">{verifiedTag.spk_number || "SPK"}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                <span className="text-[10px] text-stone-400 block font-bold uppercase">Process Station</span>
                <span className="font-bold text-stone-900 text-xs truncate block">{verifiedTag.process_name || payloadObj.process_name || "Station"}</span>
                <span className="text-[10px] text-stone-500 font-mono">Step #{verifiedTag.step_sequence || payloadObj.step_sequence || 1}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                <span className="text-[10px] text-stone-400 block font-bold uppercase">Operator Penanggung Jawab</span>
                <span className="font-bold text-stone-900 text-xs">{verifiedTag.operator_name}</span>
                <span className="text-[10px] text-stone-500 block">{verifiedTag.operator_team || "Production Crew"}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                <span className="text-[10px] text-stone-400 block font-bold uppercase">Hasil QC & Quantity</span>
                <span className="font-bold text-emerald-700 text-xs">{verifiedTag.good_qty} Good Units</span>
                <span className="text-[10px] text-stone-500 block">Scrap: {verifiedTag.scrap_qty} | By {verifiedTag.qc_inspector || "QC"}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between text-[11px] text-stone-500">
              <span className="font-mono">Selesai: {new Date(verifiedTag.completed_at || verifiedTag.created_at).toLocaleString()}</span>
              {onViewTag && (
                <Button
                  size="sm"
                  onClick={() => {
                    onViewTag(verifiedTag);
                    onClose();
                  }}
                  className="bg-stone-900 hover:bg-stone-800 text-white h-8"
                >
                  Buka Detail Tag
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 px-6 bg-stone-50/50 border-t border-stone-100 flex justify-between items-center rounded-b-[2rem]">
        <Button variant="secondary" onClick={handleReset}>
          Reset Scanner
        </Button>
        <Button variant="primary" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </Modal>
  );
};

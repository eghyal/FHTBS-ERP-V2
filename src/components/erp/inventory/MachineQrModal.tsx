import React from "react";
import { Modal } from "@/components/ui/Modal";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Cpu, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface MachineQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: any | null;
}

export function MachineQrModal({ isOpen, onClose, machine }: MachineQrModalProps) {
  if (!isOpen || !machine) return null;

  const payload = JSON.stringify({
    id: machine.id,
    item_code: machine.item_code,
    name: machine.name,
    type: "MACHINE",
    machine_category: machine.machine_category || "CUSTOM",
    capacity_per_hour: machine.capacity_per_hour || 0,
    serial_number: machine.serial_number || "",
    bypass_multi_station: Boolean(machine.bypass_multi_station),
    timestamp: new Date().toISOString()
  });

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Machine Tag - ${machine.item_code}</title>
          <style>
            body { font-family: monospace; padding: 20px; text-align: center; }
            .card { border: 2px solid #000; padding: 16px; width: 300px; margin: 0 auto; border-radius: 8px; }
            h2 { margin: 4px 0; font-size: 18px; }
            p { margin: 4px 0; font-size: 12px; }
            .badge { display: inline-block; background: #eee; padding: 2px 8px; border-radius: 4px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">MACHINE ASSET TAG</div>
            <h2>${machine.name}</h2>
            <p><strong>Code:</strong> ${machine.item_code}</p>
            <p><strong>Category:</strong> ${machine.machine_category || 'CUSTOM'}</p>
            <p><strong>Capacity:</strong> ${machine.capacity_per_hour || 0} pcs/hr</p>
            <p><strong>S/N:</strong> ${machine.serial_number || '-'}</p>
            <div style="margin: 12px 0;">
              ${document.getElementById("machine-qr-svg-container")?.innerHTML || ""}
            </div>
            <p style="font-size: 9px; color: #666;">Scan at Shop Floor Terminal to verify assignment</p>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Machine Identity QR Tag"
      description="Scan this tag at Shop Floor Terminal to bind machine executions"
      maxWidth="md"
    >
      <div className="p-6 flex flex-col items-center space-y-6">
        <div id="machine-qr-svg-container" className="p-4 bg-white rounded-2xl border-2 border-stone-900 shadow-sm">
          <QRCodeSVG value={payload} size={200} level="H" includeMargin={true} />
        </div>

        <div className="w-full bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs space-y-2">
          <div className="flex justify-between items-center border-b border-stone-200 pb-2">
            <span className="font-bold text-stone-500 uppercase tracking-wider">Asset Code</span>
            <span className="font-mono font-black text-stone-900">{machine.item_code}</span>
          </div>
          <div className="flex justify-between items-center border-b border-stone-200 pb-2">
            <span className="font-bold text-stone-500 uppercase tracking-wider">Asset Name</span>
            <span className="font-bold text-stone-900 truncate max-w-[200px]">{machine.name}</span>
          </div>
          <div className="flex justify-between items-center border-b border-stone-200 pb-2">
            <span className="font-bold text-stone-500 uppercase tracking-wider">Category</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-900 font-black rounded text-[10px]">
              {machine.machine_category || "CUSTOM"}
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-stone-200 pb-2">
            <span className="font-bold text-stone-500 uppercase tracking-wider">Capacity</span>
            <span className="font-mono font-bold text-stone-900">{machine.capacity_per_hour || 0} units/hr</span>
          </div>
          <div className="flex justify-between items-center border-b border-stone-200 pb-2">
            <span className="font-bold text-stone-500 uppercase tracking-wider">Multi-Station</span>
            <span className={machine.bypass_multi_station ? "text-emerald-600 font-bold" : "text-stone-500 font-bold"}>
              {machine.bypass_multi_station ? "Allowed (Bypass)" : "Strict (Single Active)"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold text-stone-500 uppercase tracking-wider">Status</span>
            <span className="px-2 py-0.5 bg-stone-200 font-bold text-stone-800 rounded text-[10px]">
              {machine.machine_status || "AVAILABLE"}
            </span>
          </div>
        </div>

        <div className="w-full flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handlePrint} className="bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-2">
            <Printer className="w-4 h-4" /> Print Asset Tag
          </Button>
        </div>
      </div>
    </Modal>
  );
}

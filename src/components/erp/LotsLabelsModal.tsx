import React, { useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Printer, Package, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface LotsLabelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lots: any[];
  project: any;
}

export function LotsLabelsModal({ isOpen, onClose, lots, project }: LotsLabelsModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Print WOT QR Labels</title>
          <style>
            @media print {
              @page { margin: 10mm; size: A4 portrait; }
              body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; font-family: sans-serif; }
              .print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
              .print-card { border: 1px solid #000; padding: 15px; border-radius: 8px; page-break-inside: avoid; display: flex; align-items: center; gap: 15px; }
              .print-qr { border: 1px solid #000; padding: 5px; border-radius: 4px; }
              .print-info h3 { margin: 0 0 5px 0; font-size: 16px; font-weight: bold; color: #000; }
              .print-info p { margin: 2px 0; font-size: 12px; color: #333; }
            }
          </style>
        </head>
        <body>
          <div class="print-grid">${printContent}</div>
        </body>
      </html>
    `);
    doc.close();
    
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <span>WOT Travel Tags</span>
        </div>
      }
      description={`${lots.length} Work Order Tickets (WOT) siap untuk dicetak dan ditempelkan pada fisik material/container lot.`}
      maxWidth="3xl"
    >
      <div className="max-h-[60vh] overflow-y-auto p-4 bg-stone-50 dark:bg-stone-950/50 rounded-2xl border border-stone-200 dark:border-stone-800">
        <div ref={printRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {lots.map((lot, idx) => (
            <div key={lot.id || idx} className="print-card flex items-center gap-4 p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xs">
              <div className="print-qr bg-white p-2 rounded-lg border border-stone-100 dark:border-stone-800">
                <QRCodeSVG
                  value={lot.qr_payload || JSON.stringify({ wot_id: lot.id, lot: lot.lot_number, prj: project?.spk_number || project?.name })}
                  size={80}
                  level="Q"
                  includeMargin={false}
                />
              </div>
              <div className="print-info flex-1">
                <h3 className="font-black text-stone-900 dark:text-stone-100 text-lg mb-1">{lot.lot_number}</h3>
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1 mb-0.5">
                  <Package className="w-3.5 h-3.5" /> Qty: {lot.qty} {project?.uom || 'pcs'}
                </p>
                <p className="text-[10px] text-stone-400 dark:text-stone-500 truncate max-w-[120px]" title={project?.spk_number || project?.name}>
                  {project?.spk_number || project?.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} className="rounded-xl border-stone-200">
          Tutup
        </Button>
        <Button onClick={handlePrint} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
          <Printer className="w-4 h-4 mr-2" /> Cetak QR Labels
        </Button>
      </div>
    </Modal>
  );
}

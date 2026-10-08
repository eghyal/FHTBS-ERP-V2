import React from "react";
import { Printer, QrCode, CheckCircle2, User, Clock, Calendar, ShieldCheck, Factory } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface TravelTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  tag: any;
  project?: any;
}

export const TravelTagModal: React.FC<TravelTagModalProps> = ({
  isOpen,
  onClose,
  tag,
  project,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !tag) return null;

  let payloadObj: any = {};
  try {
    payloadObj = typeof tag.qr_payload === "string" ? JSON.parse(tag.qr_payload) : tag.qr_payload;
  } catch (e) {
    payloadObj = {};
  }

  const handlePrint = () => {
    const raw = typeof tag.qr_payload === "string" ? tag.qr_payload : JSON.stringify(tag.qr_payload);
    
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
          <title>Print WOT Travel Tag</title>
          <style>
            @media print {
              @page { margin: 10mm; size: A5 portrait; }
              body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; font-family: sans-serif; display: flex; justify-content: center; }
              .print-card { border: 2px dashed #000; padding: 20px; border-radius: 8px; width: 100%; max-width: 400px; text-align: center; }
              .header { font-size: 10px; font-weight: bold; text-transform: uppercase; border: 1px solid #000; padding: 4px; display: inline-block; margin-bottom: 10px; }
              h3 { margin: 0 0 15px 0; font-size: 18px; }
              .qr-container { margin: 15px auto; }
              .qr-code { width: 160px; height: 160px; }
              .metadata { text-align: left; margin-top: 20px; font-size: 12px; border-top: 1px solid #ccc; padding-top: 10px; }
              .meta-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; }
              .meta-label { color: #555; }
              .meta-val { font-weight: bold; }
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
        </head>
        <body>
          <div class="print-card">
            <div class="header">QC PASSED TRAVEL TAG</div>
            <h3>${tag.tag_number || lotNum || 'QR Code'}</h3>
            <div id="qr-container" class="qr-container"></div>
            <div class="metadata">
              ${lotNum ? `<div class="meta-row"><span class="meta-label">Lot Number:</span><span class="meta-val">${lotNum}</span></div>` : ''}
              <div class="meta-row"><span class="meta-label">Project:</span><span class="meta-val">${project?.name || payloadObj.project_name || "N/A"}</span></div>
              <div class="meta-row"><span class="meta-label">Process:</span><span class="meta-val">Step ${payloadObj.step_sequence || tag.step_sequence}: ${payloadObj.process_name || tag.process_name || "Process"}</span></div>
              <div class="meta-row"><span class="meta-label">Operator:</span><span class="meta-val">${tag.operator_name || payloadObj.operator}</span></div>
            </div>
          </div>
          <script>
            var typeNumber = 0;
            var errorCorrectionLevel = 'H';
            var qr = qrcode(typeNumber, errorCorrectionLevel);
            qr.addData('${raw.replace(/'/g, "\\'")}');
            qr.make();
            document.getElementById('qr-container').innerHTML = qr.createImgTag(5, 10);
            
            setTimeout(() => {
              window.print();
            }, 500);
          </script>
        </body>
      </html>
    `);
    doc.close();
    
    // We let the script inside iframe call print() after rendering QR
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  };

  const handleCopy = () => {
    const raw = typeof tag.qr_payload === "string" ? tag.qr_payload : JSON.stringify(tag.qr_payload, null, 2);
    navigator.clipboard?.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lotNum = tag.lot_number || payloadObj.lot_number;

  const modalTitle = (
    <div className="flex items-center justify-between w-full pr-2">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold tracking-tight text-stone-900">
            {lotNum ? `WOT Digital Travel Tag (${lotNum})` : "Digital Travel Tag & QR Code"}
          </h2>
          <p className="text-xs text-stone-500 font-mono">{tag.tag_number}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          className="text-xs h-8 font-bold"
        >
          {copied ? "Copied!" : "Copy QR"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handlePrint}
          className="text-xs h-8 font-bold"
        >
          <Printer className="w-3.5 h-3.5 mr-1 text-stone-500" /> Print
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      title={modalTitle}
      contentClassName="p-0"
    >
      <div className="flex flex-col">

        {/* Tag Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-50 flex justify-center">
          <div className="bg-white border-2 border-dashed border-stone-300 rounded-2xl p-6 w-full max-w-md shadow-sm print:border-solid print:shadow-none">
            {/* Tag Header */}
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <span className="text-[10px] font-black tracking-widest text-emerald-700 uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  QC PASSED TRAVEL TAG
                </span>
                <h3 className="text-sm font-bold text-stone-900 mt-1 font-mono">{tag.tag_number}</h3>
              </div>
              <Factory className="w-6 h-6 text-stone-400" />
            </div>

            {/* QR Code Center */}
            <div className="flex flex-col items-center justify-center p-4 bg-stone-50 rounded-2xl border border-stone-200 mb-4">
              <QRCodeSVG
                value={typeof tag.qr_payload === "string" ? tag.qr_payload : JSON.stringify(tag.qr_payload)}
                size={160}
                level="H"
                includeMargin={true}
                className="bg-white p-2 rounded-xl shadow-sm border border-stone-100"
              />
              <span className="text-[10px] text-stone-400 mt-2 font-mono">Scan for Instant Quality & Process Verification</span>
            </div>

            {/* Metadata */}
            <div className="space-y-2 text-xs">
              {lotNum && (
                <div className="flex justify-between py-1 border-b border-stone-100 bg-blue-50/50 px-2 rounded-lg">
                  <span className="text-blue-600 font-bold">WOT / Lot Number:</span>
                  <span className="font-mono font-bold text-blue-900">{lotNum}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">Project / SPK:</span>
                <span className="font-bold text-stone-800">{project?.name || payloadObj.project_name || "N/A"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">Process Step:</span>
                <span className="font-bold text-stone-800">
                  Step {payloadObj.step_sequence || tag.step_sequence}: {payloadObj.process_name || tag.process_name || "Process"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">Work Center:</span>
                <span className="font-medium text-stone-700">{payloadObj.work_center || "Factory Floor"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">Operator:</span>
                <span className="font-bold text-stone-800">{tag.operator_name || payloadObj.operator}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">Completed At:</span>
                <span className="font-mono text-stone-700">{new Date(tag.completed_at || tag.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-400">QC Status & Inspector:</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {tag.qc_status} ({tag.qc_inspector || "QC Department"})
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-stone-400">Quantity Passed:</span>
                <span className="font-bold text-stone-900">{tag.good_qty || payloadObj.good_qty || 1} Unit(s) (Scrap: {tag.scrap_qty || payloadObj.scrap_qty || 0})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 bg-white border-t border-stone-200 flex justify-end">
          <Button variant="secondary" onClick={onClose} size="sm" className="font-bold">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

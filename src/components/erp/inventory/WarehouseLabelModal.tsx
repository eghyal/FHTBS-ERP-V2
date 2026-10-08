import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { QRCodeSVG } from "qrcode.react";
import { Download, Printer, QrCode, Tag, Package, Box } from "lucide-react";
import { toPng } from "html-to-image";
import { useToast } from "@/contexts/ToastContext";

interface WarehouseLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLabelItem: any;
}

export const WarehouseLabelModal: React.FC<WarehouseLabelModalProps> = ({
  isOpen,
  onClose,
  selectedLabelItem,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const labelCardRef = useRef<HTMLDivElement>(null);

  const itemId = selectedLabelItem?.id || selectedLabelItem?.item_id || "";
  const itemCode = selectedLabelItem?.item_code || "ITEM-CODE";
  const itemName = selectedLabelItem?.item_name || selectedLabelItem?.name || "Material / Item Name";
  const uom = selectedLabelItem?.uom || "PCS";
  const category = (selectedLabelItem?.category || selectedLabelItem?.asset_class || "RAW").toUpperCase();
  const dimension = selectedLabelItem?.dimension || "";
  const spec = selectedLabelItem?.spec || "";

  // Pure item identity payload - PO, Supplier, and Qty are decoupled
  const qrPayload = JSON.stringify({
    id: itemId,
    code: itemCode,
    name: itemName,
    uom: uom,
  });

  const exportSingleLabelPng = async () => {
    if (!labelCardRef.current) return;
    setIsSubmitting(true);
    try {
      const element = labelCardRef.current;
      const imgData = await toPng(element, {
        pixelRatio: 4,
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
        },
      });
      const link = document.createElement("a");
      link.download = `QR_${itemCode}.png`;
      link.href = imgData;
      link.click();
      showToast("QR label downloaded successfully as PNG", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to download QR label", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!labelCardRef.current) return;
    const printContent = labelCardRef.current.innerHTML;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Label - ${itemCode}</title>
          <style>
            @media print {
              @page {
                size: 80mm 55mm;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 4mm;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                background: #fff;
              }
              .print-container {
                width: 72mm;
                box-sizing: border-box;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-container">${printContent}</div>
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
      isOpen={isOpen && !!selectedLabelItem}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900 leading-tight">
              Item QR Label
            </h3>
            <p className="text-[11px] text-stone-400 font-normal">
              Barcode &amp; QR identity tag for warehouse inventory movement
            </p>
          </div>
        </div>
      }
      maxWidth="md"
    >
      <div className="p-6 flex flex-col items-center">
        {/* Sleek, Simple & Elegant QR Card */}
        <div
          ref={labelCardRef}
          className="w-full max-w-[380px] bg-white rounded-2xl border border-stone-200/90 shadow-sm p-5 transition-all"
        >
          {/* Card Top Bar */}
          <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-stone-100">
            <div className="flex items-center gap-1.5 text-stone-400">
              <Box className="w-3.5 h-3.5 text-stone-500" />
              <span className="text-[10px] font-bold tracking-wider text-stone-500 uppercase">
                Warehouse Stock
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/60 uppercase">
                {uom}
              </span>
            </div>
          </div>

          {/* Main Content: QR Code & Details */}
          <div className="flex items-center gap-4">
            {/* High-Resolution QR SVG */}
            <div className="p-2.5 bg-stone-50/80 rounded-xl border border-stone-200/70 shrink-0 flex items-center justify-center">
              <QRCodeSVG
                value={qrPayload}
                size={110}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Item Details */}
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">
                SKU / Item Code
              </div>
              <div className="text-lg font-black text-stone-900 font-mono tracking-tight leading-tight break-all">
                {itemCode}
              </div>
              <div className="text-xs font-semibold text-stone-700 leading-snug mt-1 line-clamp-2">
                {itemName}
              </div>

              {(dimension || spec) && (
                <div className="mt-2 text-[10px] text-stone-500 space-y-0.5 font-mono">
                  {dimension && <div className="truncate">Dim: {dimension}</div>}
                  {spec && <div className="truncate">Spec: {spec}</div>}
                </div>
              )}
            </div>
          </div>

          {/* Card Footer Tag */}
          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[9px]">
            <span className="font-mono font-black text-stone-900 tracking-wider">
              {itemCode}
            </span>
            <span className="font-medium tracking-wide text-stone-400 uppercase">
              SCAN TO IN / OUT
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Label
          </button>
          <button
            type="button"
            onClick={exportSingleLabelPng}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-all shadow-xs active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {isSubmitting ? "Downloading..." : "Download PNG"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

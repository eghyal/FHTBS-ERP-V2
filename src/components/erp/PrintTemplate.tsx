import React, { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export interface PrintTemplateProps {
  documentTitleId: string;
  documentTitleEn: string;
  documentNameId: string;
  documentNameEn: string;
  date: string;
  referenceNumber: string;
  documentId: string;
  isDraft?: boolean;
  hideDefaultFooter?: boolean;
  signatureStatus?: "unsigned" | "signed";
  children: React.ReactNode;
}

export const PrintTemplate = forwardRef<HTMLDivElement, PrintTemplateProps>(
  (
    {
      documentTitleId,
      documentTitleEn,
      documentNameId,
      documentNameEn,
      date,
      referenceNumber,
      documentId,
      isDraft = false,
      hideDefaultFooter = false,
      signatureStatus = "unsigned",
      children,
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className="print-area bg-white relative p-[15mm] w-[794px] h-[1123px] overflow-hidden flex flex-col shadow-2xl shrink-0"
      >
        {isDraft && (
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none rotate-[-45deg] select-none text-[150px] font-black uppercase tracking-tighter text-stone-900 z-0">
            DRAFT
          </div>
        )}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
          .print-area {
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            color: #000000 !important;
            background-color: #ffffff !important;
            box-sizing: border-box !important;
            /* Normalize all text sizes to be smaller and denser to perfectly fit 1 page */
          }
          .print-area * {
            font-family: 'Plus Jakarta Sans', sans-serif;
            color: #000000; 
          }
          /* Enforce EN translation color (Gray/Abu-abu) strictly */
          .print-area .text-stone-400,
          .print-area .text-stone-500,
          .print-area .text-stone-600,
          .print-area .en-text { 
            color: #6b7280 !important; 
            font-weight: 500 !important;
          }
          .print-area .text-stone-900,
          .print-area .text-stone-800,
          .print-area .id-text {
            color: #000000 !important;
          }

          /* Standard, elegant, proportional typography scale for printable A4 documents */
          .print-area .text-3xl { font-size: 18px !important; line-height: 24px !important; }
          .print-area .text-2xl { font-size: 16px !important; line-height: 22px !important; }
          .print-area .text-xl  { font-size: 14.5px !important; line-height: 20px !important; }
          .print-area .text-lg  { font-size: 13.5px !important; line-height: 18px !important; }
          .print-area .text-base{ font-size: 12px !important; line-height: 16px !important; }
          .print-area .text-sm  { font-size: 11px !important; line-height: 15px !important; }
          .print-area .text-xs  { font-size: 10px !important; line-height: 14px !important; }
          .print-area .text-\[13px\] { font-size: 13px !important; line-height: 17px !important; }
          .print-area .text-\[12px\] { font-size: 12px !important; line-height: 16px !important; }
          .print-area .text-\[11px\] { font-size: 11px !important; line-height: 15px !important; }
          .print-area .text-\[10\.5px\] { font-size: 10.5px !important; line-height: 14.5px !important; }
          .print-area .text-\[10px\] { font-size: 10px !important; line-height: 14px !important; }
          .print-area .text-\[9\.5px\]  { font-size: 9.5px !important; line-height: 13px !important; }
          .print-area .text-\[9px\]  { font-size: 9px !important; line-height: 12px !important; }
          .print-area .text-\[8px\]  { font-size: 8px !important; line-height: 11px !important; }
          .print-area .text-\[7\.5px\] { font-size: 7.5px !important; line-height: 10px !important; }
          .print-area .text-\[7px\]  { font-size: 7px !important; line-height: 9.5px !important; }
          
          .print-area .font-mono { font-family: 'JetBrains Mono', monospace !important; }
          
          /* Colors for specifics */
          .print-area .text-emerald-600, .print-area .text-emerald-700 { color: #000000 !important; } /* Force to black to maintain clean B/W formal document look, except where strictly needed */
          .print-area .text-rose-600 { color: #000000 !important; }

          .print-area .border-stone-100, .print-area .border-stone-150, .print-area .border-stone-200, .print-area .border-stone-300 {
            border-color: #d1d5db !important;
          }

          /* Proportional margins and paddings for compact fit without inverting hierarchy */
          .print-area .mb-12 { margin-bottom: 16px !important; }
          .print-area .mb-10 { margin-bottom: 14px !important; }
          .print-area .mb-8 { margin-bottom: 12px !important; }
          .print-area .mb-6 { margin-bottom: 10px !important; }
          .print-area .mb-4 { margin-bottom: 8px !important; }
          .print-area .mb-3 { margin-bottom: 6px !important; }
          .print-area .mb-2 { margin-bottom: 4px !important; }
          .print-area .mt-12 { margin-top: 16px !important; }
          .print-area .mt-10 { margin-top: 14px !important; }
          .print-area .mt-8  { margin-top: 12px !important; }
          .print-area .mt-6  { margin-top: 10px !important; }
          .print-area .mt-4  { margin-top: 8px !important; }
          .print-area .mt-3  { margin-top: 6px !important; }
          .print-area .mt-2  { margin-top: 4px !important; }
          .print-area .pt-8  { padding-top: 12px !important; }
          .print-area .pt-6  { padding-top: 10px !important; }
          .print-area .pt-4  { padding-top: 8px !important; }
          .print-area .pt-3  { padding-top: 6px !important; }
          .print-area .py-4 { padding-top: 10px !important; padding-bottom: 10px !important; }
          .print-area .py-3 { padding-top: 7px !important; padding-bottom: 7px !important; }
          .print-area .py-2 { padding-top: 5px !important; padding-bottom: 5px !important; }
          .print-area .px-4 { padding-left: 12px !important; padding-right: 12px !important; }
          .print-area .px-3 { padding-left: 8px !important; padding-right: 8px !important; }
          .print-area .p-5 { padding: 14px !important; }
          .print-area .p-4 { padding: 12px !important; }
          .print-area .p-3\.5, .print-area .p-\[14px\] { padding: 10px !important; }
          .print-area .p-3 { padding: 8px !important; }
          .print-area .p-2\.5 { padding: 7px !important; }
          .print-area .p-2 { padding: 6px !important; }

          .print-area tr, .print-area table {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        `}</style>

        {/* --- HEADER --- */}
        <div className="w-full border-b-[2.5px] border-black pb-3 mb-4 bg-white relative z-10 flex items-center gap-4 shrink-0">
          {/* Minimal Logo */}
          <div className="w-13 h-13 shrink-0 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-black tracking-tight uppercase leading-none mb-1.5" style={{ fontSize: '16px', lineHeight: '18px' }}>
              CV. BATU EMAS GROUP
            </h1>
            <div className="font-semibold en-text leading-normal max-w-xl" style={{ fontSize: '10.5px', lineHeight: '15px', color: '#374151' }}>
              Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486
              <br />
              <span className="font-bold text-stone-900">Phone:</span> 0811-1111-3993 &nbsp;|&nbsp; <span className="font-bold text-stone-900">Email:</span> pavingjoss@gmail.com
            </div>
          </div>
          {/* Top Right: QR Code for Verification */}
          <div className="flex items-center gap-3 text-right">
            <div className="flex flex-col items-end">
              <div className="font-bold tracking-widest uppercase mb-0.5" style={{ fontSize: '9px', color: '#6b7280' }}>
                Valid Doc ID:
              </div>
              <div className="font-mono font-bold text-black border border-stone-300 px-2 py-0.5 bg-stone-50 rounded-xs" style={{ fontSize: '10px' }}>
                {documentId || referenceNumber}
              </div>
            </div>
            <div className="w-11 h-11 bg-white border border-stone-300 p-0.5 flex items-center justify-center shrink-0 rounded-xs shadow-2xs">
              <QRCodeSVG
                value={`https://fhtbs-erp.shared/doc/${documentId || referenceNumber}`}
                size={38}
                level="M"
                fgColor="#000000"
              />
            </div>
          </div>
        </div>

        {/* --- DOC TITLE & META --- */}
        <div className="flex justify-between items-end mb-3.5 w-full shrink-0 border-b border-gray-200 pb-2.5">
          <div className="flex-1 pr-4">
            <h2 className="text-xs font-black text-black uppercase tracking-widest leading-none mb-1">
              {documentTitleId}
            </h2>
            <p className="text-[8px] font-bold en-text uppercase tracking-widest leading-none">
              {documentTitleEn}
            </p>
          </div>

          <div className="flex gap-6 shrink-0 text-right">
            <div>
              <div className="text-[7.5px] font-bold en-text uppercase tracking-widest mb-0.5">
                TANGGAL / DATE
              </div>
              <div className="text-[9.5px] font-black text-black">{date}</div>
            </div>
            <div>
              <div className="text-[7.5px] font-bold en-text uppercase tracking-widest mb-0.5">
                REFERENSI / REF.
              </div>
              <div className="text-[9.5px] font-black text-black font-mono tracking-tight">
                {referenceNumber}
              </div>
            </div>
          </div>
        </div>

        {/* --- DYNAMIC BODY CONTENT --- */}
        {/* Uses flex-1 and min-h-0 so it expands to fill space, but doesn't blow out parents. */}
        <div className="flex-1 min-h-0 w-full z-10 relative flex flex-col text-sm overflow-hidden pb-4">
          {children}
        </div>

        {/* --- FOOTER --- */}
        {!hideDefaultFooter && (
          <div className="mt-auto pt-3 border-t-2 border-black z-20 bg-white shrink-0">
            <div className="flex justify-between items-end">
              <div className="max-w-[70%]">
                {signatureStatus === "signed" ? (
                  <>
                    <div className="text-[10px] text-black font-bold uppercase tracking-wide leading-tight mb-1">
                      Dokumen ini telah diotorisasi dan disahkan secara komputasi. Sah secara hukum dengan verifikasi sistem.
                    </div>
                    <div className="text-[9px] en-text uppercase tracking-wide leading-tight">
                      This document has been digitally authorized and verified. Legally valid under registry ref: {referenceNumber}.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] text-black font-bold uppercase tracking-wide leading-tight mb-1">
                      Dokumen ini diterbitkan dan divalidasi secara komputasi. Sah tanpa tanda tangan fisik.
                    </div>
                    <div className="text-[9px] en-text uppercase tracking-wide leading-tight">
                      This document is computationally validated. Valid without physical signature under registry ref: {referenceNumber}.
                    </div>
                  </>
                )}
              </div>

              <div className="text-right max-w-[30%]">
                <span className="text-[10px] text-black block font-bold uppercase tracking-wide">
                  {documentNameId}
                </span>
                <span className="text-[9px] en-text block uppercase tracking-wide">
                  {documentNameEn}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

PrintTemplate.displayName = "PrintTemplate";

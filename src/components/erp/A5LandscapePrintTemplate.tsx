import React, { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export interface A5LandscapePrintTemplateProps {
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

export const A5LandscapePrintTemplate = forwardRef<
  HTMLDivElement,
  A5LandscapePrintTemplateProps
>(
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
        className="print-area-a5 bg-white relative p-[5mm] w-[794px] h-[560px] overflow-hidden flex flex-col shadow-2xl shrink-0 rounded-sm"
      >
        {isDraft && (
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none rotate-[-25deg] select-none text-[90px] font-black uppercase tracking-tighter text-stone-900 z-0">
            DRAFT
          </div>
        )}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
          
          @page {
            size: A5 landscape;
            margin: 0;
          }

          .print-area-a5 {
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            color: #000000 !important;
            background-color: #ffffff !important;
            box-sizing: border-box !important;
          }
          .print-area-a5 * {
            font-family: 'Plus Jakarta Sans', sans-serif;
            color: #000000; 
          }
          .print-area-a5 .en-text { 
            color: #6b7280 !important; 
            font-weight: 500 !important;
          }
          .print-area-a5 .id-text {
            color: #000000 !important;
          }
          .print-area-a5 .font-mono { font-family: 'JetBrains Mono', monospace !important; }

          .print-area-a5 .border-stone-100, .print-area-a5 .border-stone-200, .print-area-a5 .border-stone-300 {
            border-color: #d1d5db !important;
          }

          .print-area-a5 tr, .print-area-a5 table {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        `}</style>

        {/* --- HEADER --- */}
        <div className="w-full border-b-[2px] border-black pb-1.5 mb-2 bg-white relative z-10 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 shrink-0 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-black tracking-tight uppercase leading-none mb-1" style={{ fontSize: '14px', lineHeight: '16px' }}>
              CV. BATU EMAS GROUP
            </h1>
            <div className="font-semibold en-text leading-tight max-w-xl" style={{ fontSize: '9.5px', lineHeight: '13px', color: '#374151' }}>
              Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486
              &nbsp;|&nbsp; <span className="font-bold text-stone-900">Phone:</span> 0811-1111-3993 &nbsp;|&nbsp; <span className="font-bold text-stone-900">Email:</span> pavingjoss@gmail.com
            </div>
          </div>
          {/* QR Code & Doc Ref */}
          <div className="flex items-center gap-2 text-right">
            <div className="flex flex-col items-end">
              <div className="font-bold tracking-widest uppercase mb-0.5" style={{ fontSize: '8px', color: '#6b7280' }}>
                Valid Doc ID:
              </div>
              <div className="font-mono font-bold text-black border border-stone-300 px-1.5 py-0.5 bg-stone-50 rounded-xs" style={{ fontSize: '9px' }}>
                {documentId || referenceNumber}
              </div>
            </div>
            <div className="w-9 h-9 bg-white border border-stone-300 p-0.5 flex items-center justify-center shrink-0 rounded-xs">
              <QRCodeSVG
                value={`https://fhtbs-erp.shared/doc/${documentId || referenceNumber}`}
                size={30}
                level="M"
                fgColor="#000000"
              />
            </div>
          </div>
        </div>

        {/* --- DOC TITLE & META --- */}
        <div className="flex justify-between items-end mb-1 w-full shrink-0 border-b border-gray-200 pb-1">
          <div className="flex-1 pr-4">
            <h2 className="text-xs font-black text-black uppercase tracking-widest leading-none mb-0.5">
              {documentTitleId}
            </h2>
            <p className="text-[7.5px] font-bold en-text uppercase tracking-widest leading-none">
              {documentTitleEn}
            </p>
          </div>

          <div className="flex gap-4 shrink-0 text-right">
            <div>
              <div className="text-[7px] font-bold en-text uppercase tracking-widest mb-0.5">
                TANGGAL / DATE
              </div>
              <div className="text-[9.5px] font-black text-black">{date}</div>
            </div>
            <div>
              <div className="text-[7px] font-bold en-text uppercase tracking-widest mb-0.5">
                REFERENSI / REF.
              </div>
              <div className="text-[9.5px] font-black text-black font-mono tracking-tight">
                {referenceNumber}
              </div>
            </div>
          </div>
        </div>

        {/* --- DYNAMIC BODY CONTENT --- */}
        <div className="flex-1 min-h-0 w-full z-10 relative flex flex-col text-xs overflow-hidden pb-0.5">
          {children}
        </div>

        {/* --- FOOTER --- */}
        {!hideDefaultFooter && (
          <div className="mt-auto pt-1 border-t border-black z-20 bg-white shrink-0">
            <div className="flex justify-between items-end">
              <div className="max-w-[70%]">
                {signatureStatus === "signed" ? (
                  <>
                    <div className="text-[7.5px] text-black font-bold uppercase tracking-wide leading-tight">
                      Dokumen ini telah diotorisasi dan disahkan secara komputasi. Sah secara hukum dengan verifikasi sistem.
                    </div>
                    <div className="text-[7px] en-text uppercase tracking-wide leading-tight">
                      This document has been digitally authorized and verified. Legally valid under registry ref: {referenceNumber}.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[7.5px] text-black font-bold uppercase tracking-wide leading-tight">
                      Dokumen ini diterbitkan dan divalidasi secara komputasi. Sah tanpa tanda tangan fisik.
                    </div>
                    <div className="text-[7px] en-text uppercase tracking-wide leading-tight">
                      This document is computationally validated. Valid without physical signature under registry ref: {referenceNumber}.
                    </div>
                  </>
                )}
              </div>

              <div className="text-right max-w-[30%]">
                <span className="text-[7.5px] text-black block font-bold uppercase tracking-wide">
                  {documentNameId}
                </span>
                <span className="text-[7px] en-text block uppercase tracking-wide">
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

A5LandscapePrintTemplate.displayName = "A5LandscapePrintTemplate";

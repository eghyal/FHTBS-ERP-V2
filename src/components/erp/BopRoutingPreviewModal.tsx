import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { generatePDF } from "@/lib/pdfGenerator";
import { Download, ShieldCheck, QrCode } from "lucide-react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { QRCodeSVG } from "qrcode.react";

interface BoPStep {
  id: string;
  step_sequence: number;
  process_name: string;
  node_type?: "PROCESS" | "PRODUCT";
  work_center_id?: string;
  work_center_name?: string;
  execution_type: "SERIAL" | "PARALLEL";
  predecessor_ids?: string[];
  standard_hours?: number;
  manpower_allocated?: number;
  shift_mode?: number;
  notes?: string;
  sop_instruction?: string;
  qc_criteria?: string;
  bom_allocations?: any[];
  expected_yield_rate?: number;
}

interface BopRoutingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  steps: BoPStep[];
  projectBoms?: any[];
}

export const BopRoutingPreviewModal: React.FC<BopRoutingPreviewModalProps> = ({
  isOpen,
  onClose,
  project,
  steps,
  projectBoms = [],
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!project) return null;

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(printDocRef.current, `BOP_Routing_Card_${project.spk_number || project.id}.pdf`);
      showToast("Process Routing Sheet exported as PDF", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`PDF generation failed: ${err.message || String(err)}`, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const issueDateStr = new Date().toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const verificationUrl = `${window.location.origin}/production/project/${project.id}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title="Engineering Process Route Sheet (BoP)"
      contentClassName="p-0 flex flex-col h-[88vh] bg-stone-100 border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="PROCESS ROUTING SHEET & BILL OF PROCESS (BOP)"
            documentTitleEn="PROCESS ROUTING SHEET & BILL OF PROCESS (BOP)"
            documentNameId="manufacturing route traveler & process sheet"
            documentNameEn="manufacturing route traveler & process sheet"
            date={issueDateStr}
            referenceNumber={`BOP-${project.spk_number || project.id}`}
            documentId={`BOP-${project.id}`}
            isDraft={false}
          >
            <div className="space-y-6 text-xs text-stone-800 font-sans">
              {/* Project Header Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">SPK Number</span>
                  <span className="font-bold text-stone-900 text-sm font-mono">{project.spk_number || "SPK-UNASSIGNED"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Project Name</span>
                  <span className="font-bold text-stone-900 text-sm truncate block">{project.name}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Customer</span>
                  <span className="font-bold text-stone-900 text-sm truncate block">{project.customer || "Internal / Stock"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Routing Strategy</span>
                  <span className="font-bold text-stone-900 text-sm font-mono">Hybrid DAG</span>
                </div>
              </div>

              {/* Process Routing Table */}
              <div className="border border-stone-300 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-100 text-stone-700 text-[10px] font-bold uppercase tracking-wider border-b border-stone-300">
                      <th className="py-2.5 px-3 w-12 text-center">Seq</th>
                      <th className="py-2.5 px-3">Process / Milestone</th>
                      <th className="py-2.5 px-3 w-48">Material Details</th>
                      <th className="py-2.5 px-3 w-20 text-center">Type/Mode</th>
                      <th className="py-2.5 px-3">SOP & QC Checkpoint</th>
                      <th className="py-2.5 px-3 w-24 text-center">Sign-off</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-xs">
                    {steps.map((step, idx) => {
                      const isProduct = step.node_type === "PRODUCT";
                      return (
                        <tr key={step.id || idx} className={isProduct ? "bg-amber-50/60 hover:bg-amber-100/50" : "hover:bg-stone-50/50"}>
                          <td className="py-2 px-3 text-center font-bold font-mono text-stone-600">
                            {String(step.step_sequence || idx + 1).padStart(2, "0")}
                          </td>
                          <td className="py-2 px-3 font-semibold text-stone-900">
                            <div className="flex items-center gap-2">
                              {isProduct && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                                  PRODUCT
                                </span>
                              )}
                              <span>{step.process_name}</span>
                            </div>
                            {step.notes && (
                              <div className="text-[10px] text-stone-500 font-normal italic mt-0.5">{step.notes}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[10px] text-stone-700">
                            {isProduct ? (
                              (() => {
                                let allocs: any[] = [];
                                try { allocs = typeof step.bom_allocations === 'string' ? JSON.parse(step.bom_allocations) : step.bom_allocations || []; } catch(e){}
                                if (allocs.length === 0) return <span className="italic text-stone-400">No specific BOM allocations</span>;
                                return (
                                  <ul className="list-disc pl-3">
                                    {allocs.map((a: any, i: number) => {
                                      const bomRef = projectBoms.find(b => b.id === a.bom_id);
                                      const totalBomQty = Number((bomRef?.required_qty || bomRef?.qty) || 0);
                                      const uom = bomRef?.uom || a.uom || 'qty';
                                      const qVal = a.qty !== undefined ? Number(a.qty) : (a.fraction || 0) * totalBomQty;
                                      return (
                                        <li key={i}>{bomRef ? bomRef.item_name : (a.bom_name || String(a.bom_id).substring(0,8))} <span className="font-mono text-amber-700 font-bold ml-1">{qVal % 1 === 0 ? qVal : qVal.toFixed(2)} {uom} ({Math.round((a.fraction || 0) * 100)}%)</span></li>
                                      );
                                    })}
                                  </ul>
                                )
                              })()
                            ) : (
                              (() => {
                                // Algebraic aggregation of materials from upstream PRODUCT nodes
                                let preds: string[] = [];
                                try { preds = typeof step.predecessor_ids === 'string' ? JSON.parse(step.predecessor_ids) : step.predecessor_ids || []; } catch(e){}
                                
                                const getUpstreamProducts = (nodeId: string, visited = new Set<string>()): any[] => {
                                   if (visited.has(nodeId)) return [];
                                   visited.add(nodeId);
                                   const node = steps.find(s => s.id === nodeId);
                                   if (!node) return [];
                                   
                                   let myP: string[] = [];
                                   try { myP = typeof node.predecessor_ids === 'string' ? JSON.parse(node.predecessor_ids) : node.predecessor_ids || []; } catch(e){}
                                   
                                   let result: any[] = [];
                                   for (const pid of myP) {
                                      const pNode = steps.find(s => s.id === pid);
                                      if (pNode && pNode.node_type === "PRODUCT") {
                                         result.push(pNode);
                                      } else if (pNode && pNode.node_type === "PROCESS") {
                                         result = result.concat(getUpstreamProducts(pid, visited));
                                      }
                                   }
                                   return result;
                                };

                                const upstreamProducts = getUpstreamProducts(step.id);
                                if (upstreamProducts.length === 0) return <span className="italic text-stone-400">Input requirement handled upstream</span>;
                                
                                const aggregated = new Map<string, number>();
                                upstreamProducts.forEach(prod => {
                                  let allocs: any[] = [];
                                  try { allocs = typeof prod.bom_allocations === 'string' ? JSON.parse(prod.bom_allocations) : prod.bom_allocations || []; } catch(e){}
                                  allocs.forEach(a => {
                                    const c = aggregated.get(a.bom_id) || 0;
                                    aggregated.set(a.bom_id, c + (a.fraction || 0));
                                  });
                                });

                                if (aggregated.size === 0) {
                                  return (
                                    <div className="flex flex-col gap-1">
                                      <span className="font-bold text-[9px] text-stone-500 uppercase">Input Material:</span>
                                      <ul className="list-disc pl-3">
                                        {upstreamProducts.map((p, i) => <li key={i}>{p?.process_name}</li>)}
                                      </ul>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="flex flex-col gap-1">
                                    <span className="font-bold text-[9px] text-blue-700 uppercase">Aggregated Material Requirements:</span>
                                    <ul className="list-disc pl-3">
                                      {Array.from(aggregated.entries()).map(([bomId, frac], i) => {
                                        const bomRef = projectBoms.find(b => b.id === bomId);
                                        return (
                                          <li key={i} className="text-stone-700">
                                            {bomRef ? `${bomRef.item_name} (${bomRef.item_code})` : String(bomId).substring(0,8)} 
                                            <span className="font-mono text-blue-700 font-bold ml-1">{Math.round(frac * 100)}%</span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                )
                              })()
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isProduct ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                                MILESTONE
                              </span>
                            ) : (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                  step.execution_type === "PARALLEL"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {step.execution_type || "SERIAL"}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-stone-600">
                            {isProduct ? (
                              <div className="flex flex-col gap-1">
                                {step.qc_criteria ? (
                                  <div className="flex items-start gap-1">
                                    <span className="font-bold text-stone-700">QC:</span>
                                    <span>{step.qc_criteria}</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-amber-800 font-medium italic">
                                    Auto QR Tag Output
                                  </span>
                                )}
                                {step.expected_yield_rate && (
                                  <div className="flex items-start gap-1">
                                    <span className="font-bold text-stone-700 text-[10px]">Yield:</span>
                                    <span className="text-[10px] font-mono text-stone-600">{step.expected_yield_rate}%</span>
                                  </div>
                                )}
                              </div>
                            ) : step.sop_instruction ? (
                              <div className="flex items-start gap-1">
                                <span className="font-bold text-stone-700">SOP:</span>
                                <span>{step.sop_instruction}</span>
                              </div>
                            ) : (
                              <span className="text-stone-400 italic">Standard execution</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center border-l border-stone-200">
                            <div className="h-6 border border-dashed border-stone-300 rounded bg-white"></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-stone-50 font-bold border-t border-stone-300 text-stone-900">
                      <td colSpan={3} className="py-2 px-3 text-right uppercase tracking-wider text-[10px]">
                        Total Operations:
                      </td>
                      <td colSpan={3} className="py-2 px-3 text-left text-[10px] text-stone-600 font-normal">
                        {steps.filter(s => s.node_type !== "PRODUCT").length} Processes, {steps.filter(s => s.node_type === "PRODUCT").length} Product Milestones
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Unallocated Materials Warning */}
              {(() => {
                if (!projectBoms || projectBoms.length === 0) return null;
                const allocatedMap = new Map<string, number>();
                projectBoms.forEach(b => allocatedMap.set(b.id, 0));
                
                steps.forEach(s => {
                  if (s.node_type === "PRODUCT" && s.bom_allocations) {
                     let allocs: any[] = [];
                     try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations; } catch(e){}
                     allocs.forEach((a: any) => {
                       const curr = allocatedMap.get(a.bom_id) || 0;
                       allocatedMap.set(a.bom_id, curr + (a.fraction || 1));
                     });
                  }
                });
                
                const unallocated = projectBoms.filter(b => {
                  const alloc = allocatedMap.get(b.id) || 0;
                  return alloc < 0.99; // Not fully allocated
                });

                if (unallocated.length === 0) return null;

                return (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800 font-bold text-xs mb-1">
                      <ShieldCheck className="w-4 h-4" />
                      Unallocated Material Warning
                    </div>
                    <p className="text-[10px] text-red-700 mb-2">
                      The following BOM items have not been fully allocated to any Product Milestone. These materials might be missing from the assembly floor:
                    </p>
                    <ul className="list-disc pl-4 text-[10px] text-red-700">
                      {unallocated.map(b => {
                         const alloc = allocatedMap.get(b.id) || 0;
                         return (
                           <li key={b.id}>
                             <span className="font-bold">{b.item_name} ({b.item_code})</span> 
                             — {Math.round(alloc * 100)}% allocated
                           </li>
                         );
                      })}
                    </ul>
                  </div>
                );
              })()}

              {/* Symmetrical Standard ERP Signatures & Traveler Verification */}
              <div className="mt-8 pt-4 border-t border-stone-200 grid grid-cols-2 gap-8 items-start">
                {/* Left Column: Traveler Verification & QR */}
                <div className="flex items-start gap-3 p-3 bg-stone-50 border border-stone-200 rounded-xl text-left">
                  <div className="shrink-0 bg-white p-1.5 border border-stone-200 rounded-lg">
                    <QRCodeSVG value={verificationUrl} size={54} level="M" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9.5px] font-bold text-stone-500 uppercase tracking-wider">
                      Engineering Release & Verification
                    </div>
                    <p className="text-[10.5px] text-stone-600 leading-snug">
                      Scan the QR-Code to verify real-time status and digital traveler logs on the shop floor.
                    </p>
                    <div className="text-[9px] font-mono text-stone-500">
                      <span className="font-bold text-stone-800 block">DIGITAL BOP: SPK-{project.spk_number || project.id}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Best Regards & Manager Engineering Digital Signature */}
                <div className="flex justify-end text-center">
                  <div className="w-64">
                    <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                      Hormat Kami <span className="text-stone-500 font-normal">/ Best Regards</span>
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">
                      Engineering Division
                    </div>
                    <div className="h-12 flex items-center justify-center my-0.5">
                      <div className="flex items-center gap-2.5 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg">
                        <QrCode className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="text-left">
                          <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                            Digitally Authorized
                          </div>
                          <div className="text-[8px] font-mono text-emerald-700 leading-none">
                            Validated via Auth Key
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                      Manager Engineering
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>

      {/* Centered Footer Controls with Black Export Button */}
      <div className="p-4 sm:px-6 sm:py-4 border-t border-stone-200 bg-white flex justify-center items-center gap-4 shrink-0">
        <Button
          variant="secondary"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-xs font-bold border border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
        >
          Close
        </Button>
        <Button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="px-7 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 bg-black hover:bg-stone-800 text-white cursor-pointer"
        >
          <Download className="w-4 h-4" />
          {isExporting ? "Exporting PDF..." : "Export PDF (A4)"}
        </Button>
      </div>
    </Modal>
  );
};

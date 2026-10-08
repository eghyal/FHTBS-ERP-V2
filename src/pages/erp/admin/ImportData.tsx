import React, { useState, useRef } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  FileUp,
  Download,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import {
  Button,
  Card,
  CardHeader,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
} from "@/components/ui";
import Papa from "papaparse";

export default function ImportData() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<
    "ITEMS" | "SUPPLIERS" | "CUSTOMERS"
  >("ITEMS");
  const [mappedData, setMappedData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CsvTemplates = {
    ITEMS:
      "item_code,name,dimension,spec,type(RAW/WIP/FINISHED),uom,unit_price,lead_time_days",
    SUPPLIERS: "code,name,contact_person,email,phone,address",
    CUSTOMERS: "code,name,email,phone,address",
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setMappedData(results.data);
      },
      error: (error) => {
        showToast(`Failed to parse CSV: ${error.message}`, "error");
      },
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const content = CsvTemplates[activeTab];
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${activeTab.toLowerCase()}.csv`;
    a.click();
  };

  const submitImport = async () => {
    if (!mappedData.length) return;
    setIsProcessing(true);
    try {
      const payload = {
        type: activeTab,
        data: mappedData,
      };
      const res = await apiFetch("/api/datacenter/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.data) {
        showToast(
          `Successfully imported ${mappedData.length} records.`,
          "success",
        );
        setMappedData([]);
      }
    } catch (e: any) {
      showToast(e.message || "Import failed.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Master Data Import"
        subtitle="Bulk CSV schema ingestion & validation"
        icon={<FileUp className="w-5 h-5" />}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/data-center")}
          >
            <ArrowLeft className="w-4 h-4" /> Back to Data Center
          </Button>
        }
      />

      <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl w-fit border border-stone-200/60">
        {(["ITEMS", "SUPPLIERS", "CUSTOMERS"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              setMappedData([]);
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader
              title="1. Download Template"
              subtitle={`Official schema structure for ${activeTab.toLowerCase()}`}
              icon={<FileText className="w-4 h-4" />}
            />
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">
              Ensure column headers match exactly to prevent import validation errors.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadTemplate}
              className="w-full"
            >
              <Download className="w-3.5 h-3.5" /> Download CSV Template
            </Button>
          </Card>

          <Card>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <CardHeader
              title="2. Upload CSV File"
              subtitle="Preview and inspect records before saving"
              icon={<Upload className="w-4 h-4" />}
            />
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">
              Select your populated CSV file. The system validates all required fields automatically.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="w-3.5 h-3.5" /> Select File
            </Button>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card padding="none" className="min-h-[480px] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Data Preview
                </h3>
                <p className="text-xs text-stone-500 font-medium">
                  {mappedData.length} records ready for processing
                </p>
              </div>
              {mappedData.length > 0 && (
                <Badge variant="info" dot>
                  {mappedData.length} Staged
                </Badge>
              )}
            </div>

            <div className="flex-1 p-4">
              {mappedData.length > 0 ? (
                <div className="space-y-4">
                  <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(mappedData[0]).map((k) => (
                            <TableHead key={k}>{k}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedData.slice(0, 50).map((row, i) => (
                          <TableRow key={i}>
                            {Object.values(row).map((val: any, j) => (
                              <TableCell key={j} className="text-xs text-stone-700">
                                {val}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {mappedData.length > 50 && (
                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest text-center">
                      Showing preview of first 50 rows
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="primary"
                      onClick={submitImport}
                      isLoading={isProcessing}
                      disabled={isProcessing}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Finalize Import
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<AlertCircle className="w-6 h-6" />}
                  title="No data staged"
                  description="Upload a CSV file using the panel on the left to preview records before committing them to the database."
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

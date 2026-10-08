import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { BopEngineeringEditor } from "@/components/erp/BopEngineeringEditor";
import { useAutoSave } from "@/hooks/useAutoSave";
import { apiFetch } from "@/utils/api";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Printer, GitFork, Layers } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function BopEngineeringPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const { data: selectedProject, setData: setSelectedProject } =
    useAutoSave<string>("engineering_bop_selected_project", "");

  const fetchProjects = async () => {
    try {
      setIsLoadingProjects(true);
      const res = await apiFetch("/api/projects", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
        const isNonMfg = (p: any) => {
          if (!p) return true;
          if (nonMfgIds.includes(p.id)) return true;
          const name = (p.name || "").toLowerCase();
          const spk = (p.spk_number || "").toLowerCase();
          const cust = (p.customer || "").toLowerCase();
          return (
            name.includes("consumable") ||
            name.includes("transportation") ||
            name.includes("other procurement") ||
            name.includes("general procurement") ||
            name.includes("konsumabel") ||
            name.includes("transportasi") ||
            spk.includes("consumable") ||
            spk.includes("transport") ||
            cust.includes("internal")
          );
        };

        const mfgProjects = res.data.filter((p: any) => !isNonMfg(p));
        setProjects(mfgProjects);
        // Default to first active project if none selected
        if (!selectedProject && mfgProjects.length > 0) {
          const firstProj = mfgProjects.find((p: any) => p.status !== "COMPLETED") || mfgProjects[0];
          setSelectedProject(firstProj?.id || "");
        }
      }
    } catch (err) {
      console.error("Failed to load projects", err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProject) || null;
  }, [projects, selectedProject]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={language === "id" ? "Alur Proses" : "Bill of Process"}
        subtitle={
          language === "id"
            ? "Alur proses dan urutan operasional"
            : "Process routing and operation sequences"
        }
        icon={<GitFork className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            {selectedProject && (
              <Button
                onClick={() => setShowPrintModal(true)}
                variant="secondary"
                size="sm"
                className="text-xs font-bold gap-1.5 h-9 rounded-xl border-stone-200 shadow-xs hover:bg-stone-50"
              >
                <Printer className="w-3.5 h-3.5 text-stone-700" />
                {language === "id" ? "Cetak Route Sheet (PDF)" : "Print Route Sheet (PDF)"}
              </Button>
            )}
          </div>
        }
      />

      {/* Project Selector Box */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
              {language === "id" ? "Pilih Proyek Manufaktur" : "Select Manufacturing Project"}
            </h3>
            <p className="text-xs text-stone-500">
              {language === "id"
                ? "Pilih proyek aktif untuk mendesain rute pengerjaan lantai kerja."
                : "Select an active production project to design its custom shop floor process routing."}
            </p>
          </div>

          <div className="w-full sm:w-80">
            <Select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="rounded-xl border-stone-200 focus:ring-stone-900 focus:border-stone-900 font-bold text-xs"
            >
              <option value="">{language === "id" ? "-- Pilih Proyek --" : "-- Select Project --"}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {`[${p.spk_number || p.id}] ${p.name}`}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
      {selectedProject ? (
        <BopEngineeringEditor
          projectId={selectedProject}
          project={currentProject}
          onRefreshProject={fetchProjects}
          showPrintModal={showPrintModal}
          onPrintModalClose={() => setShowPrintModal(false)}
        />
      ) : (
        <div className="bg-stone-50/60 rounded-3xl border border-stone-200/80 p-16 text-center space-y-4 max-w-xl mx-auto mt-8">
          <Layers className="w-12 h-12 text-stone-300 mx-auto" />
          <h3 className="text-sm font-black text-stone-800 uppercase tracking-wide">
            {language === "id" ? "Tidak Ada Proyek Terpilih" : "No Project Selected"}
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            {language === "id"
              ? "Silakan pilih proyek manufaktur aktif dari dropdown di atas untuk mulai membuat atau mengedit Bill of Process flowchart."
              : "Please select an active manufacturing project from the dropdown above to begin building or editing its Bill of Process flowchart."}
          </p>
        </div>
      )}
    </div>
  );
}

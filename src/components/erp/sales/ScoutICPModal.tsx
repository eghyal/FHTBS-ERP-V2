import React, { useState, useEffect } from "react";
import { X, Sliders, Check, Loader2, Save } from "lucide-react";
import { ICPConfig } from "@/types/scout";

interface ScoutICPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
}

export function ScoutICPModal({ isOpen, onClose, onSaveSuccess }: ScoutICPModalProps) {
  const [icp, setIcp] = useState<ICPConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch("/api/sales/scout/icp")
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            setIcp(json.data);
          }
        })
        .catch((err) => console.error("Failed to load ICP config:", err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!icp || isSaving) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/sales/scout/icp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          icp_config: {
            target_industries: icp.target_industries || [],
            target_buyer_personas: icp.target_buyer_personas || [],
            priority_products: icp.priority_products || [],
            scoring_weights: icp.scoring_weights || {},
            company_name: icp.company_name || "Enterprise Commerce & Operations",
          },
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
        if (onSaveSuccess) onSaveSuccess();
      }
    } catch (err) {
      console.error("Failed to update ICP config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Main Modal Window */}
      <div
        className="relative bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <Sliders className="w-4 h-4 text-slate-700" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-none">
                Ideal Customer Profile (ICP) Configuration
              </h2>
              <span className="text-[11px] text-slate-500 mt-1 inline-block">
                Reference benchmark for qualification matching and scoring
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-500" />
            <span className="text-xs">Loading ICP configuration...</span>
          </div>
        ) : !icp ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            Could not load ICP configuration. Please check your connection.
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Industries
              </label>
              <input
                type="text"
                value={icp.target_industries?.join(", ") || ""}
                onChange={(e) =>
                  setIcp({
                    ...icp,
                    target_industries: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="e.g. General Contractors, Property Developers, Commercial Facilities..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:border-slate-400 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Separate industry names with commas
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Buyer Personas & Decision Makers
              </label>
              <input
                type="text"
                value={icp.target_buyer_personas?.join(", ") || ""}
                onChange={(e) =>
                  setIcp({
                    ...icp,
                    target_buyer_personas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="e.g. Project Manager, Procurement Lead, Operations Director..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Priority Product Categories
              </label>
              <input
                type="text"
                value={icp.priority_products?.join(", ") || ""}
                onChange={(e) =>
                  setIcp({
                    ...icp,
                    priority_products: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="e.g. Heavy Duty Paving, Interlocking Pavers, Kerb Stones..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:border-slate-400 focus:outline-none"
              />
            </div>

            {/* Weights summary */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
              <span className="font-semibold text-slate-700 block">Scoring Weight Benchmark:</span>
              <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px]">
                <div className="flex justify-between">
                  <span>Behavioral Intent:</span>
                  <span className="font-mono font-semibold">35%</span>
                </div>
                <div className="flex justify-between">
                  <span>Profile Fit / ICP:</span>
                  <span className="font-mono font-semibold">30%</span>
                </div>
                <div className="flex justify-between">
                  <span>Engagement Track:</span>
                  <span className="font-mono font-semibold">20%</span>
                </div>
                <div className="flex justify-between">
                  <span>Freshness:</span>
                  <span className="font-mono font-semibold">15%</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              {savedSuccess ? (
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Configuration saved
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Applied to subsequent lead evaluations
                </span>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

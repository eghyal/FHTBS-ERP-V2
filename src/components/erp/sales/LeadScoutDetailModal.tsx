import React, { useState } from "react";
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Award,
  ShieldCheck,
  ShieldAlert,
  SendHorizontal,
  ThumbsUp,
  Flag,
  FileText,
  Loader2,
  Building2,
  Phone,
  Mail,
  UserCheck,
} from "lucide-react";
import { PotentialCustomer, PotentialCustomerStatus } from "@/types/scout";
import { formatIDR } from "@/lib/utils";

interface LeadScoutDetailModalProps {
  customer: PotentialCustomer | null;
  onClose: () => void;
  onScout: (id: string) => void;
  isScouting: boolean;
  onUpdateStatus: (id: string, status: PotentialCustomerStatus) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onSendOutreach: (id: string, note: string) => void;
  onConvertToQuotation: (customer: PotentialCustomer) => void;
  onFeedback: (reportId: string, flag: "HELPFUL" | "WRONG_INFO", note: string) => void;
}

export function LeadScoutDetailModal({
  customer,
  onClose,
  onScout,
  isScouting,
  onUpdateStatus,
  onSaveNotes,
  onSendOutreach,
  onConvertToQuotation,
  onFeedback,
}: LeadScoutDetailModalProps) {
  if (!customer) return null;

  const [activeTab, setActiveTab] = useState<"INTELLIGENCE" | "CART_ACTIVITY" | "OUTREACH">("INTELLIGENCE");
  const [copiedPointIndex, setCopiedPointIndex] = useState<number | null>(null);
  const [salesNoteInput, setSalesNoteInput] = useState(customer.sales_notes || "");
  const [outreachInput, setOutreachInput] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handleCopyTalkingPoint = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedPointIndex(idx);
    setTimeout(() => setCopiedPointIndex(null), 1500);
  };

  const handleOutreachSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outreachInput.trim()) return;
    onSendOutreach(customer.id, outreachInput.trim());
    setOutreachInput("");
  };

  const dimensions = customer.lead_score_breakdown?.dimensions || {
    behavioral_intent: 60,
    profile_fit: 50,
    engagement: 40,
    freshness: 70,
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
        className="relative bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm shrink-0">
              {customer.avatar_url ? (
                <img
                  src={customer.avatar_url}
                  alt={customer.customer_name}
                  className="w-full h-full rounded-xl object-cover"
                />
              ) : (
                customer.customer_name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 truncate">
                  {customer.customer_name}
                </h2>
                {customer.lead_grade && (
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      customer.lead_grade === "A"
                        ? "bg-rose-50 text-brand border border-rose-200"
                        : customer.lead_grade === "B"
                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    Grade {customer.lead_grade}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                {customer.company && (
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    {customer.company}
                  </span>
                )}
                {customer.phone && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Phone className="w-3 h-3 text-slate-400" />
                    {customer.phone}
                  </span>
                )}
                {customer.email && (
                  <span className="flex items-center gap-1 text-slate-500 truncate">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {customer.email}
                  </span>
                )}
              </div>
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-4 sm:px-6 pt-2 bg-slate-50/50 gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("INTELLIGENCE")}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "INTELLIGENCE"
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Intelligence Report
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CART_ACTIVITY")}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "CART_ACTIVITY"
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Cart & Activity ({customer.cart_snapshot?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("OUTREACH")}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "OUTREACH"
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Follow-Up & Notes
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {activeTab === "INTELLIGENCE" && (
            <div className="space-y-5">
              {/* Score & Dimensions Card */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 sm:p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  <div className="md:border-r border-slate-200 md:pr-4">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Potential Score
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl sm:text-4xl font-bold font-mono text-slate-900">
                        {customer.potential_score || 0}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">/ 100</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      {customer.profiling_consent ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-semibold border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" />
                          Consent Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 bg-white px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200">
                          <ShieldAlert className="w-3 h-3 text-slate-400" />
                          First-Party Data Only
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4 Dimension Progress Bars */}
                  <div className="md:col-span-2 space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-600 mb-1">
                        <span>Behavioral Intent (35%)</span>
                        <span className="font-mono font-semibold">{dimensions.behavioral_intent}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-brand h-full rounded-full transition-all"
                          style={{ width: `${dimensions.behavioral_intent}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-600 mb-1">
                        <span>Profile Fit / ICP (30%)</span>
                        <span className="font-mono font-semibold">{dimensions.profile_fit}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-600 h-full rounded-full transition-all"
                          style={{ width: `${dimensions.profile_fit}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-600 mb-1">
                        <span>Engagement Track (20%)</span>
                        <span className="font-mono font-semibold">{dimensions.engagement}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full rounded-full transition-all"
                          style={{ width: `${dimensions.engagement}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-600 mb-1">
                        <span>Freshness (15%)</span>
                        <span className="font-mono font-semibold">{dimensions.freshness}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-sky-600 h-full rounded-full transition-all"
                          style={{ width: `${dimensions.freshness}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                  Executive Summary
                </span>
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                  {customer.scout_summary ||
                    "No AI analysis generated yet. Click 'Run Scout Analysis' to profile this lead based on corporate data and catalog activity."}
                </p>

                {customer.scout_recommendations && (
                  <div className="mt-3.5 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                    <span className="font-semibold block mb-1 text-slate-900">Recommended Sales Approach:</span>
                    <p className="leading-relaxed">{customer.scout_recommendations}</p>
                  </div>
                )}
              </div>

              {/* Key Talking Points */}
              {customer.key_talking_points && customer.key_talking_points.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-3">
                    Key Negotiation Talking Points
                  </span>
                  <div className="space-y-2">
                    {customer.key_talking_points.map((tp, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-start justify-between gap-3 text-xs"
                      >
                        <span className="text-slate-800 leading-relaxed font-medium">
                          &bull; {tp}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyTalkingPoint(tp, idx)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors shrink-0 cursor-pointer"
                          title="Copy to clipboard"
                        >
                          {copiedPointIndex === idx ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verified Sources */}
              {customer.sources_json && customer.sources_json.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-3">
                    Verified Public Sources
                  </span>
                  <div className="space-y-2 text-xs">
                    {customer.sources_json.map((src, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start justify-between gap-3"
                      >
                        <div>
                          <span className="font-semibold text-slate-900 block">{src.title}</span>
                          <span className="text-slate-500 text-[11px] block mt-0.5">{src.claim}</span>
                        </div>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-brand hover:bg-rose-50 rounded transition-colors shrink-0"
                          title="Open public reference"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback Loop */}
              <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
                <span>Was this intelligence assessment accurate?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onFeedback(customer.id, "HELPFUL", "Accurate information");
                      setFeedbackSent(true);
                    }}
                    disabled={feedbackSent}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ThumbsUp className="w-3 h-3 text-emerald-600" />
                    <span>Accurate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onFeedback(customer.id, "WRONG_INFO", "Information needs correction");
                      setFeedbackSent(true);
                    }}
                    disabled={feedbackSent}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Flag className="w-3 h-3 text-rose-600" />
                    <span>Correction Needed</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "CART_ACTIVITY" && (
            <div className="space-y-5">
              {/* Cart Snapshot Items */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Cart Snapshot ({customer.cart_snapshot?.length || 0} Items)
                  </span>
                  <span className="font-mono font-semibold text-slate-900 text-sm">
                    Total: {formatIDR(customer.cart_total_value)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {(!customer.cart_snapshot || customer.cart_snapshot.length === 0) ? (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      No active items recorded in shopping cart.
                    </p>
                  ) : (
                    customer.cart_snapshot.map((item, idx) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-900 block">{item.name}</span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {item.item_code} &bull; {item.qty} {item.uom} x {formatIDR(item.price)}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatIDR(item.total)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Web Activity Tracking Timeline */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-3">
                  Recorded Web Activities (Catalog, Shop, Careers)
                </span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(!customer.activities || customer.activities.length === 0) ? (
                    <p className="text-xs text-slate-400 py-3 text-center">
                      No web session activity recorded for this customer.
                    </p>
                  ) : (
                    customer.activities.map((act) => (
                      <div
                        key={act.id}
                        className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-start justify-between text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-800 block">{act.title}</span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span className="font-semibold uppercase text-brand">{act.module}</span>
                            <span>&bull;</span>
                            <span>{new Date(act.created_at).toLocaleString("en-US")}</span>
                          </div>
                        </div>
                        {act.page_url && (
                          <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]">
                            {act.page_url}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "OUTREACH" && (
            <div className="space-y-5">
              {/* Status Selector */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                  Pipeline Status
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(["NEW_INTENT", "SCOUTED", "CONTACTED", "CONVERTED", "DROPPED"] as PotentialCustomerStatus[]).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onUpdateStatus(customer.id, st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          customer.status === st
                            ? "bg-brand text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {st === "NEW_INTENT"
                          ? "New Intent"
                          : st === "SCOUTED"
                          ? "Profiled"
                          : st === "CONTACTED"
                          ? "Contacted"
                          : st === "CONVERTED"
                          ? "Converted"
                          : "Dropped"}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Internal Sales Notes */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Internal Sales Notes
                </span>
                <textarea
                  rows={3}
                  value={salesNoteInput}
                  onChange={(e) => setSalesNoteInput(e.target.value)}
                  placeholder="Record project specifications, budgetary considerations, or meeting summaries..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:border-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onSaveNotes(customer.id, salesNoteInput)}
                  className="px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Sales Notes
                </button>
              </div>

              {/* Outreach Log Form */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Log Outreach Activity
                </span>
                <form onSubmit={handleOutreachSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={outreachInput}
                    onChange={(e) => setOutreachInput(e.target.value)}
                    placeholder="e.g. Sent introductory quotation and catalog via WhatsApp..."
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:border-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <SendHorizontal className="w-3.5 h-3.5" />
                    <span>Log</span>
                  </button>
                </form>

                {/* Outreach History List */}
                <div className="space-y-2 mt-3 max-h-40 overflow-y-auto pr-1">
                  {customer.outreach?.map((out) => (
                    <div
                      key={out.id}
                      className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-start justify-between text-xs"
                    >
                      <div>
                        <span className="text-slate-800 font-medium block">{out.custom_note}</span>
                        <span className="text-[10px] text-slate-400">
                          {out.channel} &bull; By {out.sent_by} &bull; {new Date(out.sent_at).toLocaleString("en-US")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            Registered: {new Date(customer.created_at).toLocaleDateString("en-US")}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onConvertToQuotation(customer)}
              className="px-3.5 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Convert to Quotation</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

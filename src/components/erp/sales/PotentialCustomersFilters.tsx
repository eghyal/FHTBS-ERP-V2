import React from "react";
import { Search, Loader2, UserCheck, Filter } from "lucide-react";

interface PotentialCustomersFiltersProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  gradeFilter: string;
  onGradeChange: (val: string) => void;
  statusFilter: string;
  onStatusChange: (val: string) => void;
  consentFilter: string;
  onConsentChange: (val: string) => void;
  selectedCount: number;
  onBulkScout: () => void;
  isBulkScouting: boolean;
}

export function PotentialCustomersFilters({
  searchQuery,
  onSearchChange,
  gradeFilter,
  onGradeChange,
  statusFilter,
  onStatusChange,
  consentFilter,
  onConsentChange,
  selectedCount,
  onBulkScout,
  isBulkScouting,
}: PotentialCustomersFiltersProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-stone-50 p-4 rounded-2xl border border-stone-200/80 mb-6">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[260px]">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by customer name, phone, email, or company..."
          className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:border-stone-400 focus:outline-none transition-all placeholder:text-stone-400 shadow-2xs"
        />
      </div>

      {/* Filter Dropdowns & Bulk Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Grade Filter */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-stone-200 rounded-xl shadow-2xs shrink-0">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">GRADE:</span>
          <select
            value={gradeFilter}
            onChange={(e) => onGradeChange(e.target.value)}
            aria-label="Filter by Grade"
            className="text-xs font-semibold text-stone-700 bg-transparent outline-none cursor-pointer border-none py-0.5"
          >
            <option value="ALL">All Grades</option>
            <option value="A">Grade A (High Priority)</option>
            <option value="B">Grade B (Medium)</option>
            <option value="C">Grade C (Standard)</option>
            <option value="D">Grade D (Unqualified)</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-stone-200 rounded-xl shadow-2xs shrink-0">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">STATUS:</span>
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            aria-label="Filter by Status"
            className="text-xs font-semibold text-stone-700 bg-transparent outline-none cursor-pointer border-none py-0.5"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW_INTENT">New Intent</option>
            <option value="SCOUTED">Profiled</option>
            <option value="CONTACTED">Contacted</option>
            <option value="CONVERTED">Converted</option>
            <option value="DROPPED">Dropped</option>
          </select>
        </div>

        {/* Consent Filter */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-stone-200 rounded-xl shadow-2xs shrink-0">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">CONSENT:</span>
          <select
            value={consentFilter}
            onChange={(e) => onConsentChange(e.target.value)}
            aria-label="Filter by Consent"
            className="text-xs font-semibold text-stone-700 bg-transparent outline-none cursor-pointer border-none py-0.5"
          >
            <option value="ALL">All Consent</option>
            <option value="CONSENTED">Consented</option>
            <option value="NO_CONSENT">First-Party Only</option>
          </select>
        </div>

        {/* Bulk Scout Action */}
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onBulkScout}
            disabled={isBulkScouting}
            className="px-3.5 py-2 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50 shrink-0"
          >
            {isBulkScouting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserCheck className="w-3.5 h-3.5" />
            )}
            <span>Profile Selected ({selectedCount})</span>
          </button>
        )}
      </div>
    </div>
  );
}

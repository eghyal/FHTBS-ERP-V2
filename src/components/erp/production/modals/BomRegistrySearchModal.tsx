import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Search, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface BomRegistrySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSearching: boolean;
  searchResults: any[];
  selectItemFromSearch: (item: any) => void;
}

export const BomRegistrySearchModal: React.FC<BomRegistrySearchModalProps> = ({
  isOpen,
  onClose,
  searchTerm,
  setSearchTerm,
  isSearching,
  searchResults,
  selectItemFromSearch,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registry Database Search"
      maxWidth="2xl"
      contentClassName="p-0 flex flex-col h-[75vh]"
    >
      <div className="p-6 border-b border-stone-100 shrink-0">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            autoFocus
            placeholder="Search items by code, name or dimensions..."
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-4 text-sm font-bold text-stone-900 outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-100 transition-all font-sans"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-50/50">
        {isSearching ? (
          <div className="text-center py-16 animate-pulse">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-stone-200 border-t-stone-900 animate-spin"></div>
              Scanning Registry...
            </div>
          </div>
        ) : searchResults.length > 0 ? (
          searchResults.map((item) => (
            <button
              key={item.id}
              onClick={() => selectItemFromSearch(item)}
              className="w-full text-left p-6 rounded-3xl border border-stone-200 hover:border-stone-900 bg-white hover:bg-stone-50 transition-all group flex justify-between items-center shadow-sm hover:shadow-md"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 bg-stone-100 rounded-lg text-[10px] font-bold text-stone-600 font-mono tracking-widest uppercase border border-stone-200/50">
                    {item.item_code}
                  </span>
                  <h5 className="text-base font-black text-stone-900 truncate tracking-tight">
                    {item.name}
                  </h5>
                </div>
                <div className="text-[10px] text-stone-500 font-bold uppercase tracking-widest flex gap-4">
                  {item.dimension && <span>DIM: {item.dimension}</span>}
                  {item.spec && <span>SPEC: {item.spec}</span>}
                </div>
              </div>
              <div className="text-right shrink-0 ml-8 border-l border-stone-100 pl-8 transition-all group-hover:border-stone-200">
                <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                  AVAIL_STOCK
                </div>
                <div
                  className={cn(
                    "text-xl font-black font-mono tracking-tighter",
                    item.free_stock > 0
                      ? "text-emerald-600"
                      : "text-stone-400",
                  )}
                >
                  {item.free_stock || 0}{" "}
                  <span className="text-[10px] text-stone-500 font-sans tracking-widest ml-1 uppercase">
                    {item.uom}
                  </span>
                </div>
              </div>
            </button>
          ))
        ) : searchTerm.trim().length > 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <div className="text-xs font-bold text-stone-400 uppercase tracking-widest">
              No matching specs found.
            </div>
          </div>
        ) : (
          <div className="text-center py-20 flex flex-col items-center">
            <Search className="w-12 h-12 text-stone-200 mb-4" />
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              Enter parameters to begin
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

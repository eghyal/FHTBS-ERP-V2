import React, { useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, Database, Users, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

export function PublicHeader() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOpOpen, setIsOpOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpOpen(false);
    }, 300); // 300ms robust delay
  };

  return (
    <>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50 flex-none h-[72px]">
        <div className="container mx-auto px-4 lg:px-8 h-full flex justify-between items-center max-w-[1400px]">
          <Link
            to="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <img
              src="/logo.png"
              alt="Paving Joss Logo"
              className="h-8 md:h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
            <span className="text-xl md:text-2xl font-extrabold text-stone-800 tracking-tight">
              Paving Joss
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className={`text-sm font-semibold transition-colors ${location.pathname === "/" ? "text-brand" : "text-stone-600 hover:text-brand"}`}
            >
              Beranda
            </Link>
            <Link
              to="/careers"
              className={`text-sm font-semibold transition-colors ${location.pathname === "/careers" ? "text-brand font-bold" : "text-stone-600 hover:text-brand"}`}
            >
              Karir
            </Link>
            <Link
              to="/shop"
              className={`text-sm font-semibold transition-colors flex items-center gap-1.5 ${location.pathname === "/shop" ? "text-brand font-bold" : "text-stone-600 hover:text-brand"}`}
            >
              <ShoppingBag className="w-4 h-4 text-brand" />
              <span>Shop</span>
            </Link>

            <div
              className="relative ml-2"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className={cn(
                  "flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                  isOpOpen
                    ? "bg-stone-100 border-stone-300 text-stone-900 shadow-inner"
                    : "bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800",
                )}
              >
                Operational
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-stone-400 transition-transform duration-200",
                    isOpOpen && "rotate-180",
                  )}
                />
              </button>

              {/* Invisible padding bridge so hover isn't lost */}
              <div
                className={cn(
                  "absolute top-full right-0 pt-2 w-64 transition-all duration-200 z-50",
                  isOpOpen
                    ? "opacity-100 pointer-events-auto translate-y-0"
                    : "opacity-0 pointer-events-none translate-y-2",
                )}
              >
                <div className="bg-white border border-stone-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex flex-col p-2 gap-1 relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-stone-200 to-stone-100" />
                  <Link
                    to="/login"
                    onClick={() => setIsOpOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-stone-50 rounded-xl transition-all group/link mt-1"
                  >
                    <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center group-hover/link:bg-white group-hover/link:shadow-sm transition-all group-hover/link:-translate-y-0.5">
                      <Database className="w-4.5 h-4.5 text-stone-700" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold uppercase tracking-widest text-stone-900">
                        Portal ERP
                      </span>
                      <span className="text-[10px] text-stone-500 font-medium">
                        Enterprise Resource Planning
                      </span>
                    </div>
                  </Link>
                  <div className="h-px bg-stone-50 mx-2" />
                  <Link
                    to="/hr-login"
                    onClick={() => setIsOpOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-emerald-50/50 rounded-xl transition-all group/link"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center group-hover/link:bg-white group-hover/link:shadow-sm transition-all group-hover/link:-translate-y-0.5">
                      <Users className="w-4.5 h-4.5 text-emerald-600" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold uppercase tracking-widest text-emerald-800">
                        Portal HR
                      </span>
                      <span className="text-[10px] text-emerald-600/80 font-medium">
                        Human Resources System
                      </span>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </nav>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden inline-flex items-center justify-center p-2 text-stone-600 hover:text-brand hover:bg-stone-100 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed top-[72px] left-0 w-full bg-white border-b border-stone-200 z-40 shadow-lg animate-in slide-in-from-top-2">
          <nav className="flex flex-col p-4 gap-4">
            <Link
              to="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition-colors ${location.pathname === "/" ? "bg-red-50 text-brand" : "text-stone-600 hover:bg-stone-50"}`}
            >
              Beranda
            </Link>
            <Link
              to="/careers"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition-colors ${location.pathname === "/careers" ? "bg-red-50 text-brand" : "text-stone-600 hover:bg-stone-50"}`}
            >
              Karir
            </Link>
            <Link
              to="/shop"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${location.pathname === "/shop" ? "bg-red-50 text-brand" : "text-stone-600 hover:bg-stone-50"}`}
            >
              <ShoppingBag className="w-4 h-4 text-brand" />
              <span>Shop</span>
            </Link>

            <div className="mt-2 pt-4 border-t border-stone-100">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-4 mb-2 block">
                Operational
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 flex flex-col items-center gap-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition-colors"
                >
                  <Database className="w-4 h-4 opacity-80" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Portal ERP
                  </span>
                </Link>
                <Link
                  to="/hr-login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 flex flex-col items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors"
                >
                  <Users className="w-4 h-4 opacity-80" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Portal HR
                  </span>
                </Link>
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

export function PublicFooter() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-white text-stone-800 flex-none h-[60px] md:h-[72px] flex items-center border-t border-stone-200 z-10 relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between items-center max-w-[1400px] w-full gap-2">
        <div className="flex flex-row gap-4 md:gap-8 items-center text-[11px] md:text-sm font-medium text-stone-600">
          <a
            href="mailto:pavingjoss@gmail.com"
            className="hover:text-brand transition-colors flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            <span className="hidden sm:inline">pavingjoss@gmail.com</span>
            <span className="sm:hidden">Email</span>
          </a>
          <a
            href="tel:081111113993"
            className="hover:text-brand transition-colors flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24c1.12.37 2.33.57 3.57.57c.55 0 1 .45 1 1V20c0 .55-.45 1-1 1c-9.39 0-17-7.61-17-17c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1c0 1.25.2 2.45.57 3.57c.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
            0811-1111-3993
          </a>
        </div>
        <p className="text-[10px] md:text-xs font-semibold text-stone-500 tracking-wider">
          &copy; {currentYear} Paving Joss - CV. Batu Emas Group
        </p>
      </div>
    </footer>
  );
}

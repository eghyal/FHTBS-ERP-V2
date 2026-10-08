import React, { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, Share, PlusSquare } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop prompt
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#901f1e] active:scale-95 transition-all"
        title="Install ERP as native app on your desktop/mobile"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 active:scale-95 transition-all shadow-2xs"
          title="Install app on iOS"
        >
          <Download className="w-3.5 h-3.5 text-brand" />
          <span className="hidden sm:inline">Install on iOS</span>
        </button>

        <Modal
          isOpen={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          maxWidth="sm"
          contentClassName="p-6"
          title="Install on iPhone / iPad"
        >
          <div className="space-y-3 text-xs text-stone-600">
            <div className="flex items-start gap-2.5 p-2.5 bg-stone-50 rounded-xl border border-stone-100">
              <Share className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>1. Tap tombol <strong>Share</strong> di toolbar browser Safari bawah.</span>
            </div>
            <div className="flex items-start gap-2.5 p-2.5 bg-stone-50 rounded-xl border border-stone-100">
              <PlusSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>2. Gulir ke bawah lalu pilih <strong>Add to Home Screen</strong> (Tambah ke Layar Utama).</span>
            </div>
          </div>
          <button
            onClick={() => setShowIOSGuide(false)}
            className="mt-5 w-full rounded-xl bg-stone-900 py-2.5 text-xs font-bold text-white hover:bg-stone-800 transition"
          >
            Mengerti
          </button>
        </Modal>
      </>
    );
  }

  return null;
};


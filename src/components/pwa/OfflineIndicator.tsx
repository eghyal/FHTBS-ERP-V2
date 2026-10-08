import React from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-amber-600/95 backdrop-blur-md px-3.5 py-2 text-xs font-bold text-white shadow-xl border border-amber-400/40 animate-pulse">
      <WifiOff className="w-4 h-4 text-amber-200 shrink-0" />
      <div className="flex flex-col">
        <span className="leading-tight">Offline Mode</span>
        <span className="text-[10px] font-medium text-amber-100">Local cache active. Data will sync automatically when back online.</span>
      </div>
    </div>
  );
};

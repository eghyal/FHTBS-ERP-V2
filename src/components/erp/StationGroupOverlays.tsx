import React from 'react';
import { useNodes, useViewport } from '@xyflow/react';
import { Layers } from 'lucide-react';

export function StationGroupOverlays({ stations, bopSteps }: { stations: any[], bopSteps: any[] }) {
  const nodes = useNodes();
  const { x, y, zoom } = useViewport();

  if (!stations || stations.length === 0 || !nodes || nodes.length === 0) return null;

  const stationBounds = new Map<string, { minX: number, minY: number, maxX: number, maxY: number }>();

  nodes.forEach(node => {
    if (node.type === 'bopStep') {
       const step = bopSteps.find(s => s.id === node.id);
       if (step && step.station_id) {
         const nx = node.position.x;
         const ny = node.position.y;
         const w = node.measured?.width || 280; 
         const h = node.measured?.height || 180;

         const bounds = stationBounds.get(step.station_id) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
         bounds.minX = Math.min(bounds.minX, nx);
         bounds.minY = Math.min(bounds.minY, ny);
         bounds.maxX = Math.max(bounds.maxX, nx + w);
         bounds.maxY = Math.max(bounds.maxY, ny + h);
         stationBounds.set(step.station_id, bounds);
       }
    }
  });

  const PADDING = 40;
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6', '#6366f1'];

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
      {Array.from(stationBounds.entries()).map(([stationId, bounds], idx) => {
         const station = stations.find(s => s.id === stationId);
         if (!station || bounds.minX === Infinity) return null;

         const left = bounds.minX - PADDING;
         const top = bounds.minY - PADDING;
         const width = (bounds.maxX - bounds.minX) + PADDING * 2;
         const height = (bounds.maxY - bounds.minY) + PADDING * 2;
         const color = colors[idx % colors.length];

         return (
           <div 
             key={stationId}
             style={{
               position: 'absolute',
               transform: `translate(${(left * zoom) + x}px, ${(top * zoom) + y}px) scale(${zoom})`,
               transformOrigin: '0 0',
               width: `${width}px`,
               height: `${height}px`,
               border: `3px dashed ${color}`,
               backgroundColor: `${color}15`,
               borderRadius: '24px',
             }}
           >
             <div style={{
               position: 'absolute',
               top: -16,
               left: 24,
               backgroundColor: 'white',
               border: `2px solid ${color}`,
               color: color,
               padding: '4px 12px',
               borderRadius: '12px',
               fontSize: '14px',
               fontWeight: 'bold',
               boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
               display: 'flex',
               alignItems: 'center',
               gap: '8px'
             }}>
                <Layers className="w-4 h-4" />
                {station.station_code} - {station.station_name}
             </div>
           </div>
         );
      })}
    </div>
  );
}

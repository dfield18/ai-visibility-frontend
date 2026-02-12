'use client';

import React from 'react';

interface PlaceholderChartProps {
  type?: 'bar' | 'heatmap' | 'donut' | 'scatter';
  height?: number;
}

export function PlaceholderChart({ type = 'bar', height = 200 }: PlaceholderChartProps) {
  return (
    <div
      className="bg-gray-50 rounded-xl border border-gray-100 flex items-end justify-center gap-3 px-8 pb-6 pt-8"
      style={{ height }}
    >
      {type === 'bar' && (
        <>
          <div className="w-10 bg-gray-200 rounded-t" style={{ height: '40%' }} />
          <div className="w-10 bg-gray-200 rounded-t" style={{ height: '65%' }} />
          <div className="w-10 bg-gray-200 rounded-t" style={{ height: '50%' }} />
          <div className="w-10 bg-gray-200 rounded-t" style={{ height: '80%' }} />
          <div className="w-10 bg-gray-200 rounded-t" style={{ height: '35%' }} />
          <div className="w-10 bg-gray-200 rounded-t" style={{ height: '55%' }} />
        </>
      )}
      {type === 'heatmap' && (
        <div className="w-full grid grid-cols-5 gap-2">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded bg-gray-200"
              style={{ opacity: 0.3 + Math.random() * 0.5 }}
            />
          ))}
        </div>
      )}
      {type === 'donut' && (
        <div className="flex items-center justify-center" style={{ height: '100%' }}>
          <div className="w-32 h-32 rounded-full border-[16px] border-gray-200 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-semibold text-gray-300">--</span>
            </div>
          </div>
        </div>
      )}
      {type === 'scatter' && (
        <div className="w-full h-full relative">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full bg-gray-200"
              style={{
                left: `${10 + Math.random() * 80}%`,
                bottom: `${10 + Math.random() * 80}%`,
                opacity: 0.4 + Math.random() * 0.4,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

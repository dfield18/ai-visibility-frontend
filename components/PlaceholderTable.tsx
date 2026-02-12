'use client';

import React from 'react';

interface PlaceholderTableProps {
  rows?: number;
  columns?: number;
}

export function PlaceholderTable({ rows = 5, columns = 4 }: PlaceholderTableProps) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="grid border-b border-gray-200 bg-gray-100" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="h-3 bg-gray-200 rounded w-3/4" />
          </div>
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid border-b border-gray-100 last:border-0"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div key={colIdx} className="px-4 py-3">
              <div
                className="h-3 bg-gray-200 rounded"
                style={{ width: `${40 + Math.random() * 40}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

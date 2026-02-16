'use client';

import React, { useState, useEffect } from 'react';
import { Minus, Check, RefreshCw } from 'lucide-react';

interface BrandFilterPanelProps {
  allBrands: string[];
  excludedBrands: Set<string>;
  setExcludedBrands: (brands: Set<string>) => void;
}

export function BrandFilterPanel({ allBrands, excludedBrands, setExcludedBrands }: BrandFilterPanelProps) {
  // Local pending state — only committed on "Update Report"
  const [pending, setPending] = useState<Set<string>>(() => new Set(excludedBrands));

  // Sync pending state when the committed excludedBrands changes externally
  useEffect(() => {
    setPending(new Set(excludedBrands));
  }, [excludedBrands]);

  const allChecked = pending.size === 0;
  const noneChecked = pending.size === allBrands.length;
  const indeterminate = !allChecked && !noneChecked;

  // Check if pending differs from committed
  const hasPendingChanges =
    pending.size !== excludedBrands.size ||
    [...pending].some(b => !excludedBrands.has(b));

  const toggleBrand = (brand: string) => {
    const next = new Set(pending);
    if (next.has(brand)) {
      next.delete(brand);
    } else {
      next.add(brand);
    }
    setPending(next);
  };

  const toggleAll = () => {
    if (allChecked) {
      setPending(new Set(allBrands));
    } else {
      setPending(new Set());
    }
  };

  const applyFilter = () => {
    setExcludedBrands(new Set(pending));
  };

  return (
    <div className="mt-[5vh]">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Filter Brands</p>

      {/* Select / Deselect all — larger, purple accent */}
      <label className="flex items-center gap-2.5 mb-3 cursor-pointer group">
        <button
          type="button"
          onClick={toggleAll}
          className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
          style={
            allChecked || indeterminate
              ? { backgroundColor: '#7c3aed', borderColor: '#7c3aed' }
              : { borderColor: '#d1d5db' }
          }
        >
          {allChecked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
          {indeterminate && <Minus className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
        </button>
        <span className="text-sm font-medium text-gray-600">Select all</span>
      </label>

      {/* Brand list */}
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {allBrands.map((brand) => {
          const checked = !pending.has(brand);
          return (
            <label key={brand} className="flex items-center gap-2 py-1 cursor-pointer group">
              <button
                type="button"
                onClick={() => toggleBrand(brand)}
                className="w-3.5 h-3.5 rounded-sm border border-gray-300 flex items-center justify-center flex-shrink-0 transition-colors group-hover:border-gray-400"
                style={checked ? { backgroundColor: '#111827', borderColor: '#111827' } : undefined}
              >
                {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </button>
              <span className="text-sm text-gray-600 truncate" title={brand}>{brand}</span>
            </label>
          );
        })}
      </div>

      {/* Update Report button */}
      <button
        type="button"
        onClick={applyFilter}
        disabled={!hasPendingChanges}
        className={`mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
          hasPendingChanges
            ? 'bg-gray-900 text-white hover:bg-gray-800'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        <RefreshCw className="w-3 h-3" />
        Update Report
      </button>
    </div>
  );
}

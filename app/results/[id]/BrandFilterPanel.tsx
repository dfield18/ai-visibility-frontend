'use client';

import React from 'react';
import { Minus, Check } from 'lucide-react';

interface BrandFilterPanelProps {
  allBrands: string[];
  excludedBrands: Set<string>;
  setExcludedBrands: (brands: Set<string>) => void;
}

export function BrandFilterPanel({ allBrands, excludedBrands, setExcludedBrands }: BrandFilterPanelProps) {
  const allChecked = excludedBrands.size === 0;
  const noneChecked = excludedBrands.size === allBrands.length;
  const indeterminate = !allChecked && !noneChecked;

  const toggleBrand = (brand: string) => {
    const next = new Set(excludedBrands);
    if (next.has(brand)) {
      next.delete(brand);
    } else {
      next.add(brand);
    }
    setExcludedBrands(next);
  };

  const toggleAll = () => {
    if (allChecked) {
      setExcludedBrands(new Set(allBrands));
    } else {
      setExcludedBrands(new Set());
    }
  };

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Filter Brands</p>

      {/* Select / Deselect all */}
      <label className="flex items-center gap-2 text-sm text-gray-600 mb-2 cursor-pointer group">
        <button
          type="button"
          onClick={toggleAll}
          className="w-3.5 h-3.5 rounded-sm border border-gray-300 flex items-center justify-center flex-shrink-0 transition-colors group-hover:border-gray-400"
          style={allChecked || indeterminate ? { backgroundColor: '#111827', borderColor: '#111827' } : undefined}
        >
          {allChecked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
          {indeterminate && <Minus className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
        </button>
        <span className="text-xs text-gray-500">{allChecked ? 'Deselect all' : 'Select all'}</span>
      </label>

      {/* Brand list */}
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {allBrands.map((brand) => {
          const checked = !excludedBrands.has(brand);
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
    </div>
  );
}

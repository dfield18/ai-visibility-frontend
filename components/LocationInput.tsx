'use client';

import React, { useState } from 'react';
import { MapPin, Crosshair, AlertCircle } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Spinner } from '@/components/ui/Spinner';

interface LocationInputProps {
  value: string;
  onChange: (location: string, coords?: { lat: number; lng: number }) => void;
  onContinue?: () => void;
  showContinueButton?: boolean;
  className?: string;
}

export function LocationInput({
  value,
  onChange,
  onContinue,
  showContinueButton = false,
  className = '',
}: LocationInputProps) {
  const { detectLocation, loading, error, clearError } = useGeolocation();
  const [manualInput, setManualInput] = useState(value);

  const handleDetectLocation = async () => {
    clearError();
    const result = await detectLocation();
    if (result) {
      setManualInput(result.city);
      onChange(result.city, result.coords);
    }
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setManualInput(newValue);
    onChange(newValue);
  };

  const handleContinue = () => {
    if (manualInput.trim() && onContinue) {
      onContinue();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && manualInput.trim() && onContinue) {
      onContinue();
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Detect Location Button */}
      <button
        type="button"
        onClick={handleDetectLocation}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#4A7C59] text-white rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {loading ? (
          <>
            <Spinner size="sm" />
            Detecting location...
          </>
        ) : (
          <>
            <Crosshair className="w-5 h-5" />
            Detect My Location
          </>
        )}
      </button>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">or enter manually</span>
        </div>
      </div>

      {/* Manual Input */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={manualInput}
          onChange={handleManualChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter city or neighborhood..."
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
        />
      </div>

      {/* Continue Button */}
      {showContinueButton && (
        <button
          type="button"
          onClick={handleContinue}
          disabled={!manualInput.trim()}
          className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Continue
        </button>
      )}
    </div>
  );
}

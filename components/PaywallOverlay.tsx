'use client';

import React from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PaywallOverlayProps {
  locked: boolean;
  children: React.ReactNode;
  message?: string;
}

export function PaywallOverlay({ locked, children, message }: PaywallOverlayProps) {
  const router = useRouter();

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="filter blur-sm pointer-events-none select-none" aria-hidden>
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-xl">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Unlock Full Analysis
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {message || 'Upgrade to Pro to access detailed insights, competitive analysis, and AI-powered recommendations.'}
          </p>
          <button
            onClick={() => router.push('/pricing')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Upgrade to Pro
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

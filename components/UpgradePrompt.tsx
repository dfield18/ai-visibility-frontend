'use client';

import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UpgradePromptProps {
  title?: string;
  description?: string;
  compact?: boolean;
}

export function UpgradePrompt({
  title = 'Upgrade to Pro',
  description = 'Get unlimited reports, all AI providers, and full analysis.',
  compact = false,
}: UpgradePromptProps) {
  const router = useRouter();

  if (compact) {
    return (
      <button
        onClick={() => router.push('/pricing')}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        Upgrade
      </button>
    );
  }

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500 mb-3">{description}</p>
          <button
            onClick={() => router.push('/pricing')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          >
            View Plans
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

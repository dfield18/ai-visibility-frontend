'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useBillingStatus } from '@/hooks/useBilling';
import { FREEMIUM_CONFIG } from '@/lib/billing';

export function FreeTierBanner() {
  const router = useRouter();
  const { data: billing } = useBillingStatus();

  if (!billing || billing.hasSubscription) return null;

  const remaining = Math.max(0, FREEMIUM_CONFIG.freeReportsPerUser - billing.reportsUsed);

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-700">
          {remaining > 0 ? (
            <>You have <span className="font-semibold">{remaining} free report{remaining !== 1 ? 's' : ''}</span> remaining</>
          ) : (
            <>You&apos;ve used your free report</>
          )}
        </span>
      </div>
      <button
        onClick={() => router.push('/pricing')}
        className="text-sm font-medium text-gray-900 hover:text-gray-700 underline underline-offset-2"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

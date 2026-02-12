'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { type BillingStatus, type SectionAccess, getSectionAccess } from '@/lib/billing';

async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await fetch('/api/billing/status');
  if (!res.ok) {
    // Default to free tier if billing service is unavailable
    return {
      hasSubscription: false,
      reportsUsed: 0,
      reportsLimit: 1,
      subscriptionStatus: 'none',
      currentPeriodEnd: null,
    };
  }
  return res.json();
}

export function useBillingStatus() {
  const { isSignedIn } = useAuth();

  return useQuery<BillingStatus>({
    queryKey: ['billing-status'],
    queryFn: fetchBillingStatus,
    enabled: !!isSignedIn,
    staleTime: 60_000, // 1 minute
    retry: 1,
    placeholderData: {
      hasSubscription: false,
      reportsUsed: 0,
      reportsLimit: 1,
      subscriptionStatus: 'none',
      currentPeriodEnd: null,
    },
  });
}

export function useSectionAccess(): Record<string, SectionAccess> {
  const { data: billing } = useBillingStatus();
  const hasSubscription = billing?.hasSubscription ?? false;

  const sections = [
    'overview', 'competitive', 'sentiment', 'sources',
    'recommendations', 'site-audit', 'reports', 'reference', 'chatgpt-ads',
  ];

  const access: Record<string, SectionAccess> = {};
  for (const section of sections) {
    access[section] = getSectionAccess(section, hasSubscription);
  }
  return access;
}

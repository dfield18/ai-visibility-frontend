export type SectionAccess = 'visible' | 'partial' | 'preview' | 'locked';

export const FREEMIUM_CONFIG = {
  freeReportsPerUser: 1,
  maxPromptsPerRun: 20,

  // Free tier provider restrictions
  freeProviders: ['openai', 'gemini'],

  // Which sections are visible for free reports
  freeSections: {
    overview: 'partial' as SectionAccess,
    competitive: 'locked' as SectionAccess,
    sentiment: 'locked' as SectionAccess,
    sources: 'locked' as SectionAccess,
    recommendations: 'locked' as SectionAccess,
    'site-audit': 'visible' as SectionAccess,
    reports: 'locked' as SectionAccess,
    reference: 'preview' as SectionAccess,
    'chatgpt-ads': 'locked' as SectionAccess,
  } as Record<string, SectionAccess>,

  overviewPreviewSections: 2,
  referencePreviewRows: 3,
};

export interface BillingStatus {
  hasSubscription: boolean;
  reportsUsed: number;
  reportsLimit: number;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'none';
  currentPeriodEnd: string | null;
}

export function getSectionAccess(
  sectionId: string,
  hasSubscription: boolean
): SectionAccess {
  if (hasSubscription) return 'visible';
  return FREEMIUM_CONFIG.freeSections[sectionId] ?? 'locked';
}

export function isProviderFree(providerKey: string): boolean {
  return FREEMIUM_CONFIG.freeProviders.includes(providerKey);
}

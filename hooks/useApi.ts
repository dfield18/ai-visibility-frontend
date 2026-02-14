'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';
import { RunConfig, RunResponse, RunStatusResponse, CancelResponse, AISummaryResponse, ExtendRunRequest, ExtendRunResponse, SiteAuditRequest, SiteAuditResponse, SiteAuditResult, SearchType, SuggestResponse } from '@/lib/types';

/**
 * Hook to sync Clerk auth token to the API client.
 * Call this in any page that makes authenticated API calls.
 */
export function useAuthSync() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      api.setAuthToken(null);
      return;
    }

    getToken().then((token) => {
      api.setAuthToken(token);
    });
  }, [isSignedIn, getToken]);
}

/**
 * Hook to fetch suggestions for a brand, category, or local business.
 */
export function useSuggestions(
  brand: string,
  searchType: SearchType = 'brand',
  location?: string,
  enabled = true
) {
  return useQuery<SuggestResponse>({
    queryKey: ['suggestions', brand, searchType, location],
    queryFn: () => api.getSuggestions(brand, searchType, location),
    // For local search type, also require location
    enabled: enabled && brand.length > 0 && (searchType !== 'local' || Boolean(location && location.length > 0)),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to start a new run.
 * Refreshes the auth token before each request to avoid stale tokens.
 */
export function useStartRun() {
  const queryClient = useQueryClient();
  const { getToken, isSignedIn } = useAuth();

  return useMutation({
    mutationFn: async (config: RunConfig) => {
      // Refresh token right before the API call to avoid stale tokens
      if (isSignedIn) {
        const token = await getToken();
        api.setAuthToken(token);
      }
      return api.startRun(config);
    },
    onSuccess: (data: RunResponse) => {
      // Invalidate any existing run queries
      queryClient.invalidateQueries({ queryKey: ['run'] });
    },
  });
}

/**
 * Hook to get run status with polling.
 */
export function useRunStatus(runId: string, enabled = true) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRunStatus(runId),
    enabled: enabled && runId.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as RunStatusResponse | undefined;
      // Stop polling if run is complete, failed, or cancelled
      if (data && ['complete', 'failed', 'cancelled'].includes(data.status)) {
        return false;
      }
      // Poll every 2 seconds while running
      return 2000;
    },
  });
}

/**
 * Hook to cancel a run.
 */
export function useCancelRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => api.cancelRun(runId),
    onSuccess: (data: CancelResponse) => {
      // Update the run status in cache
      queryClient.invalidateQueries({ queryKey: ['run', data.run_id] });
    },
  });
}

/**
 * Hook to prefetch run status.
 */
export function usePrefetchRunStatus() {
  const queryClient = useQueryClient();

  return (runId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['run', runId],
      queryFn: () => api.getRunStatus(runId),
    });
  };
}

/**
 * Hook to fetch AI-generated summary for a run.
 */
export function useAISummary(runId: string, enabled = true) {
  return useQuery({
    queryKey: ['ai-summary', runId],
    queryFn: () => api.getAISummary(runId),
    enabled: enabled && runId.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes - summary won't change
    retry: 1, // Only retry once on failure
  });
}

/**
 * Hook to extend a run with new prompts/competitors/providers.
 */
export function useExtendRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, request }: { runId: string; request: ExtendRunRequest }) =>
      api.extendRun(runId, request),
    onSuccess: (data: ExtendRunResponse, variables) => {
      // Invalidate the parent run query to refresh extension_info
      queryClient.invalidateQueries({ queryKey: ['run', variables.runId] });
    },
  });
}

/**
 * Hook to create a new site audit.
 */
export function useCreateSiteAudit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SiteAuditRequest) => api.createSiteAudit(request),
    onSuccess: (data: SiteAuditResponse) => {
      // Invalidate site audits list
      queryClient.invalidateQueries({ queryKey: ['site-audits'] });
    },
  });
}

/**
 * Hook to get site audit status with polling.
 */
export function useSiteAudit(auditId: string, enabled = true) {
  return useQuery({
    queryKey: ['site-audit', auditId],
    queryFn: () => api.getSiteAudit(auditId),
    enabled: enabled && auditId.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as SiteAuditResult | undefined;
      // Stop polling if audit is complete or failed
      if (data && ['complete', 'failed'].includes(data.status)) {
        return false;
      }
      // Poll every 2 seconds while running
      return 2000;
    },
  });
}

/**
 * Hook to list site audits for a session.
 */
export function useSiteAudits(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: ['site-audits', sessionId],
    queryFn: () => api.listSiteAudits(sessionId),
    enabled: enabled && sessionId.length > 0,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to filter brand quotes through GPT for quality and relevance.
 */
export type BrandQuote = { text: string; provider: string; prompt: string; summary?: string };
export function useFilteredQuotes(
  candidates: Record<string, BrandQuote[]>,
  enabled = true
) {
  const candidateKey = JSON.stringify(
    Object.entries(candidates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brand, quotes]) => [brand, quotes.map(q => q.text)])
  );

  return useQuery<{ quotes: Record<string, BrandQuote[]>; cost?: number }>({
    queryKey: ['filtered-quotes', candidateKey],
    queryFn: async () => {
      const res = await fetch('/api/filter-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates }),
      });
      if (!res.ok) throw new Error('Failed to filter quotes');
      return res.json();
    },
    enabled: enabled && Object.keys(candidates).length > 0,
    staleTime: Infinity,
    retry: 1,
  });
}

/**
 * Hook to fetch AI-generated brand characterization blurbs.
 */
export function useBrandBlurbs(brands: string[], context: string, enabled = true) {
  return useQuery<{ blurbs: Record<string, string>; cost?: number }>({
    queryKey: ['brand-blurbs', brands.join(','), context],
    queryFn: async () => {
      const res = await fetch('/api/brand-blurbs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands, context }),
      });
      if (!res.ok) throw new Error('Failed to fetch brand blurbs');
      return res.json();
    },
    enabled: enabled && brands.length > 0,
    staleTime: Infinity,
    retry: 1,
  });
}

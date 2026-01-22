'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RunConfig, RunResponse, RunStatusResponse, CancelResponse } from '@/lib/types';

/**
 * Hook to fetch suggestions for a brand or category.
 */
export function useSuggestions(brand: string, searchType: 'brand' | 'category' = 'brand', enabled = true) {
  return useQuery({
    queryKey: ['suggestions', brand, searchType],
    queryFn: () => api.getSuggestions(brand, searchType),
    enabled: enabled && brand.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to start a new run.
 */
export function useStartRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: RunConfig) => api.startRun(config),
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

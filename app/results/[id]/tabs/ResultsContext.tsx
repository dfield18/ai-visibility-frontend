'use client';

import React, { createContext, useContext } from 'react';
import type { Result, RunStatusResponse, AISummaryResponse, TabType } from './shared';
import type { BrandQuote } from '@/hooks/useApi';
import type { SearchType } from '@/lib/types';
import type { SearchTypeConfig } from '@/lib/searchTypeConfig';

// ---------------------------------------------------------------------------
// ResultsContext — stable / read-mostly data (run data, computed aggregations)
// ---------------------------------------------------------------------------

export interface ResultsContextValue {
  runStatus: RunStatusResponse | null;
  globallyFilteredResults: Result[];
  availableProviders: string[];
  availableBrands: string[];
  availablePrompts: string[];
  trackedBrands: Set<string>;
  isCategory: boolean;
  isIssue: boolean;
  searchType: SearchType;
  searchTypeConfig: SearchTypeConfig;
  brandMentionRate: number;
  aiSummary: AISummaryResponse | undefined;
  isSummaryLoading: boolean;
  brandBreakdownStats: any[];
  llmBreakdownStats: Record<string, any>;
  llmBreakdownBrands: string[];
  promptBreakdownStats: any[];
  shareOfVoiceData: any[];
  allBrandsAnalysisData: any[];
  brandQuotesMap: Record<string, BrandQuote[]>;
  overviewMetrics: any;
  scatterPlotData: any[];
  rangeChartData: any[];
  rangeViewDots: any[];
  scatterProviderOrder: string[];
  topCitedSources: any[];
  keyInfluencers: any[];
  sourcesInsights: string[];
  sentimentInsights: string[];
  hasAnySources: boolean;
  llmBreakdownBrandFilter: string;
  setLlmBreakdownBrandFilter: (val: string) => void;
  promptBreakdownLlmFilter: string;
  setPromptBreakdownLlmFilter: (val: string) => void;
}

const ResultsContext = createContext<ResultsContextValue | null>(null);

export function useResults(): ResultsContextValue {
  const ctx = useContext(ResultsContext);
  if (!ctx) throw new Error('useResults must be used within a <ResultsProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// ResultsUIContext — shared UI state that changes on user interaction
// ---------------------------------------------------------------------------

export interface ResultsUIContextValue {
  activeTab: string;
  setActiveTab: (tab: TabType) => void;
  copied: boolean;
  handleCopyLink: () => void;
  handleExportCSV: () => void;
  selectedResult: Result | null;
  setSelectedResult: (result: Result | null) => void;
  setSelectedResultHighlight: (val: { brand: string; domain?: string } | null) => void;
  setSnippetDetailModal: (val: { brand: string; responseText: string; provider: string; prompt: string } | null) => void;
}

const ResultsUIContext = createContext<ResultsUIContextValue | null>(null);

export function useResultsUI(): ResultsUIContextValue {
  const ctx = useContext(ResultsUIContext);
  if (!ctx) throw new Error('useResultsUI must be used within a <ResultsProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider — wraps both contexts
// ---------------------------------------------------------------------------

interface ResultsProviderProps {
  data: ResultsContextValue;
  ui: ResultsUIContextValue;
  children: React.ReactNode;
}

export function ResultsProvider({ data, ui, children }: ResultsProviderProps) {
  return (
    <ResultsContext.Provider value={data}>
      <ResultsUIContext.Provider value={ui}>
        {children}
      </ResultsUIContext.Provider>
    </ResultsContext.Provider>
  );
}

'use client';

import React, { createContext, useContext } from 'react';
import type { Result, RunStatusResponse, AISummaryResponse, TabType } from './shared';
import type { BrandQuote } from '@/hooks/useApi';
import type { SearchType } from '@/lib/types';
import type { SearchTypeConfig } from '@/lib/searchTypeConfig';
import type {
  // Overview
  OverviewMetrics,
  ScatterPlotPoint,
  RangeChartRow,
  RangeViewDot,
  LlmBreakdownRow,
  PromptBreakdownRow,
  ShareOfVoiceEntry,
  BrandMentionEntry,
  ProviderVisibilityScore,
  FramingEvidenceItem,
  PositionChartOption,
  PositionDot,
  // Competitive
  BrandBreakdownRow,
  BrandPositioningRow,
  PromptPerformanceMatrix,
  ModelPreferenceEntry,
  BrandCooccurrenceEntry,
  BrandSourceHeatmap,
  AllBrandsAnalysisRow,
  // Sentiment
  SentimentDataPoint,
  SentimentProviderBrandOption,
  SentimentByProviderRow,
  CompetitorSentimentRow,
  // Sources
  TopCitedSource,
  KeyInfluencer,
  SourcePositioningRow,
  SourcePositioningBrandOption,
  BrandWebsiteCitationsResult,
  BrandPresenceData,
  SourceCategoryEntry,
  DomainTableRow,
  SourceBrandHeatmapData,
  // Reference
  SourceGapRow,
  SourceSentimentGapRow,
  // Recommendations
  QuickWin,
  AdOpportunity,
  SourceOpportunity,
  ParsedRecommendation,
} from '../metrics/types';

// ---------------------------------------------------------------------------
// ResultsContext — stable / read-mostly data (run data, computed aggregations)
// ---------------------------------------------------------------------------

export interface ResultsContextValue {
  // =========================================================================
  // Base Data
  // =========================================================================
  runStatus: RunStatusResponse | null;
  correctedResults: Result[];
  globallyFilteredResults: Result[];
  availableProviders: string[];
  availableBrands: string[];
  availablePrompts: string[];
  trackedBrands: Set<string>;
  allAvailableBrands: string[];
  excludedBrands: Set<string>;
  setExcludedBrands: (brands: Set<string>) => void;
  isCategory: boolean;
  isIssue: boolean;
  isPublicFigure: boolean;
  searchType: SearchType;
  searchTypeConfig: SearchTypeConfig;
  brandMentionRate: number;
  aiSummary: AISummaryResponse | undefined;
  isSummaryLoading: boolean;
  brandQuotesMap: Record<string, BrandQuote[]>;
  promptCost: number;
  analysisCost: number;
  totalBackendCost: number;
  aiOverviewUnavailableCount: number;

  // =========================================================================
  // Overview Metrics
  // =========================================================================
  overviewMetrics: OverviewMetrics | null;
  scatterPlotData: ScatterPlotPoint[];
  scatterProviderOrder: string[];
  rangeChartData: RangeChartRow[];
  rangeProviderOrder: string[];
  rangeViewDots: RangeViewDot[];
  llmBreakdownStats: Record<string, LlmBreakdownRow>;
  llmBreakdownBrands: string[];
  promptBreakdownStats: PromptBreakdownRow[];
  shareOfVoiceData: ShareOfVoiceEntry[];
  filteredBrandMentions: Record<string, BrandMentionEntry>;
  llmBreakdownTakeaway: string | null;
  providerVisibilityScores: ProviderVisibilityScore[];
  filteredFramingByProvider: Record<string, Record<string, number>>;
  framingEvidenceGroups: Record<string, FramingEvidenceItem[]>;
  positionChartBrandOptions: PositionChartOption[];
  positionByPlatformData: Record<string, Record<string, PositionDot[]>> | [];
  overviewFilteredResults: Result[];
  overviewSortedResults: Result[];

  // Overview Filters
  llmBreakdownBrandFilter: string;
  setLlmBreakdownBrandFilter: (v: string) => void;
  promptBreakdownLlmFilter: string;
  setPromptBreakdownLlmFilter: (v: string) => void;
  brandMentionsProviderFilter: string;
  setBrandMentionsProviderFilter: (v: string) => void;
  brandMentionsTrackingFilter: 'all' | 'tracked';
  setBrandMentionsTrackingFilter: (v: 'all' | 'tracked') => void;
  shareOfVoiceFilter: 'all' | 'tracked';
  setShareOfVoiceFilter: (v: 'all' | 'tracked') => void;
  positionChartBrandFilter: string;
  setPositionChartBrandFilter: (v: string) => void;
  positionChartPromptFilter: string;
  setPositionChartPromptFilter: (v: string) => void;
  framingPromptFilter: string;
  setFramingPromptFilter: (v: string) => void;
  providerFilter: string;
  setProviderFilter: (v: string) => void;
  tableBrandFilter: string;
  setTableBrandFilter: (v: string) => void;
  tableSortColumn: 'default' | 'prompt' | 'llm' | 'position' | 'mentioned' | 'sentiment' | 'competitors';
  setTableSortColumn: (v: 'default' | 'prompt' | 'llm' | 'position' | 'mentioned' | 'sentiment' | 'competitors') => void;
  tableSortDirection: 'asc' | 'desc';
  setTableSortDirection: (v: 'asc' | 'desc') => void;

  // =========================================================================
  // Competitive Metrics
  // =========================================================================
  brandBreakdownStats: BrandBreakdownRow[];
  brandPositioningStats: BrandPositioningRow[];
  promptPerformanceMatrix: PromptPerformanceMatrix;
  modelPreferenceData: ModelPreferenceEntry[];
  brandCooccurrence: BrandCooccurrenceEntry[];
  competitiveInsights: string[];
  competitorComparisonRatio: number | null;
  allBrandsAnalysisData: AllBrandsAnalysisRow[];
  brandSourceHeatmap: BrandSourceHeatmap;

  // Competitive Filters
  brandBreakdownLlmFilter: string;
  setBrandBreakdownLlmFilter: (v: string) => void;
  brandBreakdownPromptFilter: string;
  setBrandBreakdownPromptFilter: (v: string) => void;
  brandPositioningLlmFilter: string;
  setBrandPositioningLlmFilter: (v: string) => void;
  brandPositioningPromptFilter: string;
  setBrandPositioningPromptFilter: (v: string) => void;
  promptMatrixLlmFilter: string;
  setPromptMatrixLlmFilter: (v: string) => void;
  cooccurrenceView: 'pairs' | 'venn';
  setCooccurrenceView: (v: 'pairs' | 'venn') => void;
  compHeatmapProviderFilter: string;
  setCompHeatmapProviderFilter: (v: string) => void;
  compHeatmapShowSentiment: boolean;
  setCompHeatmapShowSentiment: (v: boolean) => void;

  // =========================================================================
  // Sentiment Metrics
  // =========================================================================
  sentimentInsights: string[];
  brandSentimentData: SentimentDataPoint[];
  sentimentProviderBrandOptions: SentimentProviderBrandOption[];
  citationSourceOptions: string[];
  sentimentByProvider: SentimentByProviderRow[];
  competitorSentimentData: CompetitorSentimentRow[];

  // Sentiment Filters
  sentimentProviderBrandFilter: string;
  setSentimentProviderBrandFilter: (v: string) => void;
  sentimentProviderCitationFilter: string;
  setSentimentProviderCitationFilter: (v: string) => void;
  sentimentProviderModelFilter: string;
  setSentimentProviderModelFilter: (v: string) => void;

  // =========================================================================
  // Source Metrics
  // =========================================================================
  topCitedSources: TopCitedSource[];
  keyInfluencers: KeyInfluencer[];
  sourcesInsights: string[];
  hasAnySources: boolean;
  sourcePositioningData: SourcePositioningRow[];
  sourcePositioningBrandOptions: SourcePositioningBrandOption[];
  brandWebsiteCitations: BrandWebsiteCitationsResult;
  brandPresenceData: BrandPresenceData;
  sourceCategoryData: SourceCategoryEntry[];
  domainTableData: DomainTableRow[];
  publisherPromptOptions: string[];
  publisherBrandOptions: string[];
  sortedDomainTableData: DomainTableRow[];
  sourceBrandHeatmapData: SourceBrandHeatmapData;
  heatmapMaxValue: number;

  // Source Filters
  sourcesProviderFilter: string;
  setSourcesProviderFilter: (v: string) => void;
  sourcesBrandFilter: string;
  setSourcesBrandFilter: (v: string) => void;
  sourcePositioningBrandFilter: string;
  setSourcePositioningBrandFilter: (v: string) => void;
  brandCitationsBrandFilter: string;
  setBrandCitationsBrandFilter: (v: string) => void;
  brandCitationsProviderFilter: string;
  setBrandCitationsProviderFilter: (v: string) => void;
  publisherPromptFilter: string;
  setPublisherPromptFilter: (v: string) => void;
  publisherBrandFilter: string;
  setPublisherBrandFilter: (v: string) => void;
  domainSortColumn: 'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment';
  setDomainSortColumn: (v: 'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment') => void;
  domainSortDirection: 'asc' | 'desc';
  setDomainSortDirection: (v: 'asc' | 'desc') => void;
  sourceBrandHeatmapProviderFilter: string;
  setSourceBrandHeatmapProviderFilter: (v: string) => void;
  sourceBrandHeatmapSort: string;
  setSourceBrandHeatmapSort: (v: string) => void;
  sourceBrandHeatmapView: 'citations' | 'sentiment';
  setSourceBrandHeatmapView: (v: 'citations' | 'sentiment') => void;

  // =========================================================================
  // Reference Metrics
  // =========================================================================
  sourceGapAnalysis: SourceGapRow[];
  sourceSentimentGapAnalysis: SourceSentimentGapRow[];
  referenceFilteredResults: Result[];
  referenceAiOverviewUnavailableCount: number;

  // Reference Filters
  refFilter: 'all' | 'mentioned' | 'not_mentioned';
  setRefFilter: (v: 'all' | 'mentioned' | 'not_mentioned') => void;
  refProviderFilter: string;
  setRefProviderFilter: (v: string) => void;
  sourceGapProviderFilter: string;
  setSourceGapProviderFilter: (v: string) => void;
  sourceGapPromptFilter: string;
  setSourceGapPromptFilter: (v: string) => void;
  sourceSentimentGapProviderFilter: string;
  setSourceSentimentGapProviderFilter: (v: string) => void;
  sourceSentimentGapPromptFilter: string;
  setSourceSentimentGapPromptFilter: (v: string) => void;
  sentimentComparisonBrand: string;
  setSentimentComparisonBrand: (v: string) => void;

  // =========================================================================
  // Recommendation Metrics
  // =========================================================================
  quickWins: QuickWin[];
  adOpportunities: AdOpportunity[];
  sourceOpportunities: SourceOpportunity[];
  parsedAiRecommendations: ParsedRecommendation[];
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

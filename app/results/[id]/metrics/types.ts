/**
 * Centralized metric type definitions for the results page.
 * Every computed metric has a typed interface here — no `any` types in context.
 */

import type { Result, RunStatusResponse } from '../tabs/shared';

// ---------------------------------------------------------------------------
// Overview Metrics
// ---------------------------------------------------------------------------

export interface OverviewMetrics {
  overallVisibility: number;
  shareOfVoice: number;
  topPositionCount: number;
  totalResponses: number;
  avgRank: number | null;
  uniqueSourcesCount: number;
  totalCost: number;
  selectedBrand: string | null;
  mentionedCount: number;
  selectedBrandMentions: number;
  totalBrandMentions: number;
  responsesWhereMentioned: number;
  top1Rate: number;
  ranksCount: number;
  avgBrandsPerQuery: number;
  resultsWithBrands: number;
  fragmentationScore: number;
  fragmentationBrandCount: number;
  brandMentionCounts: Record<string, number>;
  // Issue-specific
  dominantFraming: string;
  framingDistribution: Record<string, number>;
  platformConsensus: number;
  relatedIssuesCount: number;
  topRelatedIssues: string[];
  // Public Figure-specific
  portrayalScore: number;
  sentimentSplit: Record<string, number>;
  figureProminence: Record<string, number>;
  platformAgreement: number;
  // Industry-specific framing by provider
  framingByProvider: Record<string, Record<string, number>>;
}

export interface ScatterPlotPoint {
  provider: string;
  label: string;
  prompt: string;
  rank: number;
  rankBand: string;
  rankBandIndex: number;
  xIndex: number;
  xIndexWithOffset: number;
  isMentioned: boolean;
  sentiment: string | null;
  originalResult: Result;
}

export interface RangeChartRow {
  provider: string;
  label: string;
  yIndex: number;
  bestBandIndex: number;
  worstBandIndex: number;
  bestRangeX: number;
  worstRangeX: number;
  avgBandIndex: number;
  avgBandLabel: string;
  avgPositionNumeric: number | null;
  avgRanking: number;
  avgRankingX: number;
  medianRanking: number;
  medianRankingX: number;
  promptsAnalyzed: number;
  mentions: number;
  rangeStart: number;
  rangeHeight: number;
}

export interface RangeViewDot {
  label: string;
  provider: string;
  yIndex: number;
  x: number;
  prompt: string;
  rank: number;
  isMentioned: boolean;
  sentiment: string | null;
  originalResult: Result;
}

export interface LlmBreakdownRow {
  mentioned: number;
  total: number;
  rate: number;
  topPosition: number | null;
  ranks: number[];
  avgRank: number | null;
}

export interface PromptBreakdownRow {
  prompt: string;
  total: number;
  mentioned: number;
  visibilityScore: number;
  shareOfVoice: number;
  firstPositionRate: number;
  avgRank: number | null;
  avgSentimentScore: number | null;
  // Issue-specific
  issueSupportivePct: number;
  issueCriticalPct: number;
  issueDominantFraming: string;
  issueConsensus: number;
  issueRelatedCount: number;
  // Public Figure-specific
  pfPortrayalScore: number;
  pfSentimentSplit: { positive: number; neutral: number; negative: number };
  pfFigureProminence: { figureRate: number; avgCompetitorRate: number };
  pfPlatformAgreement: number;
}

export interface ShareOfVoiceEntry {
  name: string;
  value: number;
  percentage: number;
  color: string;
  isSelected: boolean;
  isOther: boolean;
}

export interface BrandMentionEntry {
  count: number;
  rate: number;
  isTracked: boolean;
}

export interface ProviderVisibilityScore {
  provider: string;
  score: number;
}

// Issue-specific overview
export interface FramingByProvider {
  [provider: string]: Record<string, number>;
}

export interface FramingEvidenceItem {
  provider: string;
  prompt: string;
  excerpt: string;
  framing: string;
}

export interface PositionChartOption {
  value: string;
  label: string;
}

export type PositionByPlatformData = Record<
  string,
  Record<string, PositionDot[]>
>;

export interface PositionDot {
  sentiment: string | null;
  prompt: string;
  rank: number;
  label: string;
  originalResult: Result;
}

// ---------------------------------------------------------------------------
// Competitive Metrics
// ---------------------------------------------------------------------------

export interface BrandBreakdownRow {
  brand: string;
  isSearchedBrand: boolean;
  total: number;
  mentioned: number;
  visibilityScore: number;
  shareOfVoice: number;
  firstPositionRate: number;
  avgRank: number | null;
  avgSentimentScore: number | null;
  promptsWithStats: PromptStat[];
}

export interface PromptStat {
  prompt: string;
  mentioned: number;
  total: number;
  rate: number;
  sentiment: string | null;
}

export interface BrandPositioningRow {
  brand: string;
  isSearchedBrand: boolean;
  mentioned: number;
  visibilityScore: number;
  avgSentimentScore: number | null;
}

export interface PromptPerformanceMatrix {
  brands: string[];
  prompts: string[];
  matrix: number[][];
}

export interface ModelPreferenceEntry {
  provider: string;
  [brandName: string]: number | string; // dynamic brand keys are numbers, provider is string
}

export interface BrandCooccurrenceEntry {
  brand1: string;
  brand2: string;
  count: number;
  percentage: number;
}

export interface BrandSourceHeatmap {
  brands: string[];
  sources: string[];
  data: BrandSourceHeatmapRow[];
  brandTotals: Record<string, number>;
  searchedBrand: string;
  sentimentData: Record<string, Record<string, { total: number; sum: number; avg: number }>>;
}

export interface BrandSourceHeatmapRow {
  domain: string;
  total: number;
  [brandName: string]: string | number;
}

export interface AllBrandsAnalysisRow {
  brand: string;
  isSearchedBrand: boolean;
  visibilityScore: number;
  providerScores: ProviderVisibilityScore[];
  comparisonRatio: number;
  avgSentimentScore: number | null;
}

// ---------------------------------------------------------------------------
// Sentiment Metrics
// ---------------------------------------------------------------------------

export interface SentimentDataPoint {
  sentiment: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface SentimentProviderBrandOption {
  value: string;
  label: string;
  isSearched: boolean;
}

export interface SentimentByProviderRow {
  provider: string;
  label: string;
  strong_endorsement: number;
  positive_endorsement: number;
  neutral_mention: number;
  conditional: number;
  negative_comparison: number;
  not_mentioned: number;
  total: number;
  strongRate: number;
}

export interface CompetitorSentimentRow {
  competitor: string;
  strong_endorsement: number;
  positive_endorsement: number;
  neutral_mention: number;
  conditional: number;
  negative_comparison: number;
  not_mentioned: number;
  total: number;
  mentionedTotal: number;
  strongRate: number;
  positiveRate: number;
}

// ---------------------------------------------------------------------------
// Source Metrics
// ---------------------------------------------------------------------------

export interface TopCitedSource {
  domain: string;
  url: string;
  urlDetails: UrlDetail[];
  count: number;
  providers: string[];
  title: string;
  brands: string[];
}

export interface UrlDetail {
  url: string;
  title: string;
  count: number;
  providers?: string[];
}

export interface KeyInfluencer {
  domain: string;
  url: string;
  urlDetails: UrlDetail[];
  count: number;
  providers: string[];
  title: string;
}

export interface SourcePositioningRow {
  domain: string;
  citationCount: number;
  providerCount: number;
  providers: string[];
  importanceScore: number;
  avgSentiment: number;
  avgPosition: number | null;
  brandMentionRate: number;
}

export interface SourcePositioningBrandOption {
  value: string;
  label: string;
}

export interface BrandWebsiteCitationsResult {
  citations: BrandCitationRow[];
  totalResultsWithSources: number;
  totalBrandsWithCitations: number;
}

export interface BrandCitationRow {
  brand: string;
  count: number;
  urls: Array<{ url: string; title: string; provider: string; count: number }>;
  providers: string[];
  snippets: Array<{ provider: string; prompt: string; text: string }>;
  rate: number;
  isSearchedBrand: boolean;
}

export interface BrandPresenceData {
  brandCitations: number;
  brandCitationRate: number;
  totalResultsWithSources: number;
  competitorCitations: Array<{ name: string; count: number; rate: number }>;
}

export interface SourceCategoryEntry {
  name: string;
  value: number;
  percentage: number;
}

export interface DomainTableRow {
  domain: string;
  usedPercent: number;
  avgCitation: number;
  category: string;
  avgSentiment: number | null;
  totalCitations: number;
  responsesWithDomain: number;
  brands: string[];
  providers: string[];
  prompts: string[];
}

export interface SourceBrandHeatmapData {
  sources: string[];
  brands: string[];
  matrix: Record<string, Record<string, number>>;
  sentimentMatrix: Record<string, Record<string, { sum: number; count: number }>>;
  totals: {
    bySource: Record<string, number>;
    byBrand: Record<string, number>;
    grand: number;
  };
}

// ---------------------------------------------------------------------------
// Reference Metrics
// ---------------------------------------------------------------------------

export interface SourceGapRow {
  domain: string;
  totalCitations: number;
  brandRate: number;
  topCompetitor: string;
  topCompetitorRate: number;
  gap: number;
  opportunityScore: number;
  urls: UrlDetail[];
  snippets: SourceSnippet[];
}

export interface SourceSnippet {
  brand: string;
  snippet: string;
  isBrand: boolean;
  provider: string;
  prompt: string;
  responseText: string;
  resultId: string;
}

export interface SourceSentimentGapRow {
  domain: string;
  totalMentions: number;
  brandSentimentIndex: number;
  brandSentimentLabel: string;
  topCompetitor: string;
  topCompetitorIndex: number;
  competitorSentimentLabel: string;
  delta: number;
  direction: 'competitor' | 'brand' | 'tie';
  magnitudeLabel: string;
  labelText: string;
  shiftSummary: string;
  signedValue: number;
  snippets: SentimentSnippet[];
  providers: string[];
  comparisonBrand: string;
}

export interface SentimentSnippet {
  brand: string;
  snippet: string;
  sentiment: string;
  sentimentScore: number;
  isBrand: boolean;
  provider: string;
  prompt: string;
  responseText: string;
  resultId: string;
}

// ---------------------------------------------------------------------------
// Recommendation Metrics
// ---------------------------------------------------------------------------

export interface QuickWin {
  type: 'prompt_gap' | 'provider_gap' | 'source_gap';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  competitors?: string[];
  score: number;
  metrics: {
    brandVisibility: number;
    competitorVisibility: number;
    responseCount: number;
  };
}

export interface AdOpportunity {
  prompt: string;
  yourVisibility: number;
  competitorAvg: number;
  gap: number;
}

export interface SourceOpportunity {
  domain: string;
  competitorCount: number;
  competitors: string[];
}

export interface ParsedRecommendation {
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  impactReason: string;
  effortReason: string;
  tactics: string[];
}

// ---------------------------------------------------------------------------
// Candidate Quotes
// ---------------------------------------------------------------------------

export interface CandidateQuote {
  text: string;
  provider: string;
  prompt: string;
}

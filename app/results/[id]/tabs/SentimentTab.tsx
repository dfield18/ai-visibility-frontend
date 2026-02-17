'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Lightbulb,
  ExternalLink,
  Download,
  Link2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { truncate } from '@/lib/utils';
import {
  Result,
  PROVIDER_ORDER,
  getProviderLabel,
  getProviderBrandColor,
  getProviderIcon,
  getDomain,
  getTextForRanking,
  isCategoryName,
} from './shared';
import { stripDiacritics } from '../metrics/compute/normalization';
import { useResults, useResultsUI } from './ResultsContext';

// No props needed - all data comes from context

export interface SentimentTabProps {
  /** When provided, only render sections whose IDs are in this list. */
  visibleSections?: string[];
}

export const SentimentTab = ({ visibleSections }: SentimentTabProps = {}) => {
  // Section visibility helper — if visibleSections is not set, show all
  const showSection = (id: string) => !visibleSections || visibleSections.includes(id);
  const {
    runStatus,
    globallyFilteredResults,
    trackedBrands,
    availableProviders,
    availableBrands,
    excludedBrands,
    isCategory,
    // Sentiment metrics from context
    sentimentInsights,
    brandSentimentData,
    sentimentProviderBrandOptions,
    citationSourceOptions,
    sentimentByProvider,
    competitorSentimentData,
    // Sentiment filters from context
    sentimentProviderBrandFilter,
    setSentimentProviderBrandFilter,
    sentimentProviderCitationFilter,
    setSentimentProviderCitationFilter,
    sentimentProviderModelFilter,
    setSentimentProviderModelFilter,
    competitorSentimentModelFilter,
    setCompetitorSentimentModelFilter,
  } = useResults();
  const { copied, handleCopyLink, setSelectedResult, setSelectedResultHighlight } = useResultsUI();

  // UI-only state kept local
  const [hoveredSentimentBadge, setHoveredSentimentBadge] = useState<{ provider: string; sentiment: string } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredCompetitorBadge, setHoveredCompetitorBadge] = useState<{ competitor: string; sentiment: string } | null>(null);
  const competitorHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [responseSentimentFilter, setResponseSentimentFilter] = useState<string>('all');
  const [responseBrandFilter, setResponseBrandFilter] = useState<string>('all');
  const [responseLlmFilter, setResponseLlmFilter] = useState<string>('all');
  const [sentimentByPromptBrandFilter, setSentimentByPromptBrandFilter] = useState<string>('');
  const [sentimentByPromptSourceFilter, setSentimentByPromptSourceFilter] = useState<string>('all');
  const [expandedResponseRows, setExpandedResponseRows] = useState<Set<string>>(new Set());
    // Provider short labels for the details table
    const providerLabels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Claude',
      gemini: 'Gemini',
      perplexity: 'Perplexity',
      ai_overviews: 'Google AI Overviews',
      grok: 'Grok',
      llama: 'Llama',
    };

    // Helper function to get sentiment label
    const getSentimentLabel = (sentiment: string | null | undefined) => {
      const issueMode = runStatus?.search_type === 'issue';
      switch (sentiment) {
        case 'strong_endorsement': return issueMode ? 'Supportive' : 'Strong';
        case 'positive_endorsement': return issueMode ? 'Leaning Supportive' : 'Positive';
        case 'neutral_mention': return issueMode ? 'Balanced' : 'Neutral';
        case 'conditional': return issueMode ? 'Mixed' : 'Conditional';
        case 'negative_comparison': return issueMode ? 'Critical' : 'Negative';
        case 'not_mentioned': return issueMode ? 'Not Discussed' : 'Not Mentioned';
        default: return 'Unknown';
      }
    };

    // Helper function to get sentiment bar color
    const getSentimentBarColor = (sentiment: string) => {
      switch (sentiment) {
        case 'strong_endorsement': return '#047857'; // emerald-700
        case 'positive_endorsement': return '#10b981'; // emerald-500
        case 'neutral_mention': return '#3b82f6';
        case 'conditional': return '#fde68a'; // amber-200 (very light)
        case 'negative_comparison': return '#ef4444';
        case 'not_mentioned': return '#9ca3af';
        default: return '#9ca3af';
      }
    };

    // Helper to extract domain from URL
    const extractDomain = (url: string): string => {
      return getDomain(url);
    };

    // For industry (category) reports, compute sentiment as the average across
    // individual brand sentiments instead of using the category-level sentiment.
    const _sentScores: Record<string, number> = {
      strong_endorsement: 5, positive_endorsement: 4, neutral_mention: 3, conditional: 2, negative_comparison: 1,
    };
    const _scoreToSent: Record<number, string> = { 5: 'strong_endorsement', 4: 'positive_endorsement', 3: 'neutral_mention', 2: 'conditional', 1: 'negative_comparison' };
    const isIndustryReport = runStatus?.search_type === 'category';
    const isIssue = runStatus?.search_type === 'issue';

    const getEffectiveSentiment = (r: Result): string | null => {
      if (isIndustryReport && r.competitor_sentiments) {
        const searchedBrand = runStatus?.brand || '';
        const scores = Object.entries(r.competitor_sentiments)
          .filter(([brand, s]) => s in _sentScores && !excludedBrands.has(brand) && !isCategoryName(brand, searchedBrand))
          .map(([, s]) => _sentScores[s as keyof typeof _sentScores]);
        if (scores.length > 0) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const nearest = Object.keys(_scoreToSent).map(Number).reduce((prev, curr) => Math.abs(curr - avg) < Math.abs(prev - avg) ? curr : prev);
          return _scoreToSent[nearest];
        }
        return null;
      }
      return r.brand_sentiment || null;
    };

    const hasEffectiveSentiment = (r: Result): boolean => {
      if (r.error) return false;
      if (isIndustryReport) {
        if (!r.competitor_sentiments) return false;
        const searchedBrand = runStatus?.brand || '';
        return Object.keys(r.competitor_sentiments).some(b => !excludedBrands.has(b) && !isCategoryName(b, searchedBrand));
      }
      return !!r.brand_sentiment;
    };

    // Export sentiment CSV handler
    const handleExportSentimentCSV = () => {
      if (!runStatus) return;

      const headers = [
        'Prompt',
        'Provider',
        'Model',
        'Position',
        runStatus.search_type === 'category' ? 'Avg Brand Sentiment' : `${runStatus.brand} Sentiment`,
        'Competitor Sentiments',
        'All Brands Mentioned',
        'Response',
      ];

      const rows = globallyFilteredResults
        .filter((r: Result) => hasEffectiveSentiment(r))
        .map((r: Result) => {
          const compSentiments = r.competitor_sentiments
            ? Object.entries(r.competitor_sentiments)
                .filter(([comp, sentiment]) => sentiment !== 'not_mentioned' && !excludedBrands.has(comp) && !isCategoryName(comp, runStatus.brand))
                .map(([comp, sentiment]) => `${comp}: ${sentiment}`)
                .join('; ')
            : '';

          // Calculate position/rank
          let rank = 0;
          const brandLower = stripDiacritics(runStatus.brand).toLowerCase();
          if (r.brand_mentioned && r.response_text) {
            const allBrands: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
              ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
              : [runStatus.brand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

            const rankingText = getTextForRanking(r.response_text, r.provider).toLowerCase();
            const brandPos = rankingText.indexOf(brandLower);
            if (brandPos >= 0) {
              let brandsBeforeCount = 0;
              for (const b of allBrands) {
                const bLower = stripDiacritics(b).toLowerCase();
                if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
                const bPos = rankingText.indexOf(bLower);
                if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
              }
              rank = brandsBeforeCount + 1;
            } else {
              rank = allBrands.length + 1;
            }
          }

          return [
            `"${r.prompt.replace(/"/g, '""')}"`,
            r.provider,
            r.model,
            rank > 0 ? rank : '',
            getEffectiveSentiment(r) || '',
            `"${compSentiments}"`,
            `"${(r.all_brands_mentioned || []).filter(b => !excludedBrands.has(b) && !isCategoryName(b, runStatus.brand)).join(', ')}"`,
            `"${(r.response_text || '').replace(/\*?\*?\[People Also Ask\]\*?\*?/g, '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`,
          ];
        });

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentiment-results-${runStatus.brand}-${runStatus.run_id.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Get the effective brand filter
    // For industry reports, default to '__all__' (average across all brands)
    const effectiveSentimentBrand = sentimentProviderBrandFilter || (isIndustryReport ? '__all__' : runStatus?.brand || '');
    // Human-readable label for display (never shows '__all__')
    const sentimentBrandLabel = effectiveSentimentBrand === '__all__'
      ? (isIndustryReport ? `brands in ${runStatus?.brand}` : (isIssue ? 'this issue' : 'your brand'))
      : effectiveSentimentBrand || (isIssue ? 'this issue' : 'your brand');

    // Helper to get results for a specific provider and sentiment
    const getResultsForProviderSentiment = (provider: string, sentiment: string): Result[] => {
      const isAllBrands = effectiveSentimentBrand === '__all__';
      const isSearchedBrand = effectiveSentimentBrand === runStatus?.brand;
      return globallyFilteredResults.filter((r: Result) => {
        if (r.error) return false;
        if (r.provider !== provider) return false;

        // Apply model filter for issues, citation filter otherwise
        if (isIssue && sentimentProviderModelFilter !== 'all') {
          if (r.provider !== sentimentProviderModelFilter) return false;
        }
        if (!isIssue && sentimentProviderCitationFilter !== 'all') {
          if (!r.sources || r.sources.length === 0) return false;
          const hasCitationFromDomain = r.sources.some(
            (source) => source.url && extractDomain(source.url) === sentimentProviderCitationFilter
          );
          if (!hasCitationFromDomain) return false;
        }

        // Check sentiment match
        let resultSentiment: string;
        if (isAllBrands) {
          resultSentiment = getEffectiveSentiment(r) || 'not_mentioned';
        } else if (isSearchedBrand) {
          resultSentiment = getEffectiveSentiment(r) || 'not_mentioned';
        } else {
          resultSentiment = r.competitor_sentiments?.[effectiveSentimentBrand] || 'not_mentioned';
        }
        return resultSentiment === sentiment;
      });
    };

    // Helper to get results for a specific competitor and sentiment
    const getResultsForCompetitorSentiment = (competitor: string, sentiment: string): Result[] => {
      const searchedBrand = runStatus?.brand || '';
      const isSearchedBrand = competitor === searchedBrand;

      return globallyFilteredResults.filter((r: Result) => {
        if (r.error) return false;
        const resultSentiment = isSearchedBrand
          ? (getEffectiveSentiment(r) || 'not_mentioned')
          : (r.competitor_sentiments?.[competitor] || 'not_mentioned');
        return resultSentiment === sentiment;
      });
    };

    // Sentiment badge with hover preview component
    const SentimentBadgeWithPreview = ({
      provider,
      sentiment,
      count,
      popupPosition = 'bottom'
    }: {
      provider: string;
      sentiment: string;
      count: number;
      bgColor?: string;
      textColor?: string;
      popupPosition?: 'top' | 'bottom';
    }) => {
      // Show nothing for zero count
      if (count === 0) {
        return null;
      }

      const isHovered = hoveredSentimentBadge?.provider === provider && hoveredSentimentBadge?.sentiment === sentiment;
      const matchingResults = isHovered ? getResultsForProviderSentiment(provider, sentiment) : [];

      const handleMouseEnter = useCallback(() => {
        // Cancel any pending close
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        if (hoveredSentimentBadge?.provider === provider && hoveredSentimentBadge?.sentiment === sentiment) {
          return;
        }
        setHoveredSentimentBadge({ provider, sentiment });
      }, [provider, sentiment]);

      const handleMouseLeave = useCallback(() => {
        // Delay closing so the popup stays visible during scroll
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredSentimentBadge(null);
          hoverTimeoutRef.current = null;
        }, 300);
      }, []);

      // Get results for click handling
      const resultsForClick = getResultsForProviderSentiment(provider, sentiment);

      const handleClick = useCallback(() => {
        // If single result, open modal directly (same as clicking dots on All Answers)
        if (resultsForClick.length === 1) {
          setSelectedResult(resultsForClick[0]);
          setHoveredSentimentBadge(null);
        }
        // For multiple results, the hover popup is already showing
      }, [resultsForClick]);

      const hasMultipleResults = resultsForClick.length > 1;

      // Get badge style based on sentiment type
      const getBadgeStyle = () => {
        switch (sentiment) {
          case 'strong_endorsement':
            return 'bg-emerald-600 text-white'; // Filled green
          case 'positive_endorsement':
            return 'bg-white border-2 border-emerald-500 text-emerald-700'; // Outline green
          case 'neutral_mention':
            return 'bg-white border-2 border-gray-300 text-gray-600'; // Outline gray
          case 'conditional':
            return 'bg-amber-100 border-2 border-amber-300 text-amber-700'; // Filled amber/yellow
          case 'negative_comparison':
            return 'bg-white border-2 border-red-400 text-red-500'; // Outline red
          case 'not_mentioned':
            return 'bg-white border-2 border-gray-300 text-gray-500'; // Outline gray
          default:
            return 'bg-gray-100 text-gray-600';
        }
      };

      return (
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={`inline-flex items-center justify-center w-9 h-9 text-sm font-semibold rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all ${getBadgeStyle()}`}
            onClick={handleClick}
          >
            {count}
          </div>
          {hasMultipleResults && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gray-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
              +
            </div>
          )}

          {isHovered && matchingResults.length > 0 && (
            <div
              data-sentiment-popup
              className={`absolute z-50 bg-white border border-gray-200 rounded-lg p-3 shadow-xl min-w-[400px] max-w-[520px] text-left ${
                popupPosition === 'top'
                  ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
                  : 'top-full mt-2 left-1/2 -translate-x-1/2'
              }`}
              style={{ maxHeight: '500px' }}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }
              }}
              onMouseLeave={handleMouseLeave}
              onWheel={(e) => e.stopPropagation()}
            >
                <p className="text-xs font-medium text-gray-500 mb-2 pb-2 border-b border-gray-100">
                {matchingResults.length} {matchingResults.length === 1 ? 'response' : 'responses'} - Click to view details
              </p>
              <div className="overflow-y-auto space-y-0" style={{ maxHeight: '400px' }}>
                {matchingResults.map((result, idx) => {
                  // Calculate rank using same logic as All Answers chart
                  let rank = 0;
                  const brandLower = stripDiacritics(runStatus?.brand || '').toLowerCase();
                  const isMentioned = result.brand_mentioned;

                  if (isMentioned && result.response_text) {
                    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                    const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
                    const brandPos = rankingText.indexOf(brandLower);
                    if (brandPos >= 0) {
                      let brandsBeforeCount = 0;
                      for (const b of allBrands) {
                        const bLower = stripDiacritics(b).toLowerCase();
                        if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
                        const bPos = rankingText.indexOf(bLower);
                        if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
                      }
                      rank = brandsBeforeCount + 1;
                    } else {
                      rank = allBrands.length + 1;
                    }
                  }

                  const responsePreview = (result.response_text || '').length > 10000
                    ? (result.response_text || '').substring(0, 10000) + '...'
                    : (result.response_text || '');

                  return (
                    <div
                      key={result.id}
                      className={`p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${idx > 0 ? 'mt-2 border-t border-gray-100 pt-2' : ''}`}
                      onClick={() => {
                        setSelectedResult(result);
                        setHoveredSentimentBadge(null);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-gray-700">{result.prompt}</p>
                        <p className="text-xs text-gray-400 ml-2 flex-shrink-0">
                          {getProviderLabel(result.provider)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                        {responsePreview}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {rank === 0
                          ? 'Not shown'
                          : rank === 1
                            ? '#1 (Top result)'
                            : `#${rank}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    };

    // Competitor sentiment badge with hover preview — mirrors SentimentBadgeWithPreview but keyed by competitor
    const CompetitorSentimentBadge = ({
      competitor,
      sentiment,
      count,
      badgeClassName,
      popupPosition = 'bottom'
    }: {
      competitor: string;
      sentiment: string;
      count: number;
      badgeClassName: string;
      popupPosition?: 'top' | 'bottom';
    }) => {
      if (count === 0) return null;

      const isHovered = hoveredCompetitorBadge?.competitor === competitor
        && hoveredCompetitorBadge?.sentiment === sentiment;
      const matchingResults = isHovered
        ? getResultsForCompetitorSentiment(competitor, sentiment)
        : [];

      const handleMouseEnter = useCallback(() => {
        if (competitorHoverTimeoutRef.current) {
          clearTimeout(competitorHoverTimeoutRef.current);
          competitorHoverTimeoutRef.current = null;
        }
        setHoveredCompetitorBadge({ competitor, sentiment });
      }, [competitor, sentiment]);

      const handleMouseLeave = useCallback(() => {
        competitorHoverTimeoutRef.current = setTimeout(() => {
          setHoveredCompetitorBadge(null);
          competitorHoverTimeoutRef.current = null;
        }, 300);
      }, []);

      const handleClick = useCallback(() => {
        const results = getResultsForCompetitorSentiment(competitor, sentiment);
        if (results.length === 1) {
          setSelectedResult(results[0]);
          setSelectedResultHighlight({ brand: competitor });
          setHoveredCompetitorBadge(null);
        }
      }, [competitor, sentiment]);

      return (
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span
            className={`inline-flex items-center justify-center w-8 h-8 text-sm font-medium rounded-lg cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all ${badgeClassName}`}
            onClick={handleClick}
          >
            {count}
          </span>
          {count > 1 && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gray-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
              +
            </div>
          )}

          {isHovered && matchingResults.length > 1 && (
            <div
              data-sentiment-popup
              className={`absolute z-50 bg-white border border-gray-200 rounded-lg p-3 shadow-xl min-w-[400px] max-w-[520px] text-left ${
                popupPosition === 'top'
                  ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
                  : 'top-full mt-2 left-1/2 -translate-x-1/2'
              }`}
              style={{ maxHeight: '500px' }}
              onMouseEnter={() => {
                if (competitorHoverTimeoutRef.current) {
                  clearTimeout(competitorHoverTimeoutRef.current);
                  competitorHoverTimeoutRef.current = null;
                }
              }}
              onMouseLeave={handleMouseLeave}
              onWheel={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-gray-500 mb-2 pb-2 border-b border-gray-100">
                {matchingResults.length} responses — Click to view details
              </p>
              <div className="overflow-y-auto space-y-0" style={{ maxHeight: '400px' }}>
                {matchingResults.map((result, idx) => {
                  const responsePreview = (result.response_text || '').length > 10000
                    ? (result.response_text || '').substring(0, 10000) + '...'
                    : (result.response_text || '');
                  return (
                  <div
                    key={result.id}
                    className={`p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${idx > 0 ? 'mt-1 border-t border-gray-100 pt-2' : ''}`}
                    onClick={() => {
                      setSelectedResult(result);
                      setSelectedResultHighlight({ brand: competitor });
                      setHoveredCompetitorBadge(null);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-gray-700">{result.prompt}</p>
                      <p className="text-xs text-gray-400 ml-2 flex-shrink-0">
                        {getProviderLabel(result.provider)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                      {responsePreview}
                    </p>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    };

    // Check if we have any sentiment data
    const hasSentimentData = globallyFilteredResults.some(
      (r: Result) => hasEffectiveSentiment(r)
    );

    if (!hasSentimentData) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Sentiment Data Available</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Sentiment classification will be available for new runs. Run a new visibility check to see how AI models describe and frame your brand.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Brand Sentiment Overview */}
        {showSection('sentiment-distribution') && <div id="sentiment-distribution" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{isIssue ? `How AI Frames ${runStatus?.brand}` : `How AI Describes ${runStatus?.brand}`}</h3>
          <p className="text-sm text-gray-500 mb-6">
            {isIndustryReport
              ? 'Average sentiment across all brands within this industry'
              : isIssue
              ? 'Framing classification of how AI models discuss this issue'
              : 'Sentiment classification of how AI models mention your brand'}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6 items-start">
            {/* Sentiment Distribution */}
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-700">{isIssue ? 'Overall Framing Distribution' : 'Overall Sentiment Distribution'}</h4>
                <span className="text-xs text-gray-400">Bar length = number of citations</span>
              </div>
              <div className="space-y-3">
                {brandSentimentData.map((d) => (
                  <div key={d.sentiment} className="flex items-center gap-3">
                    <div className="w-36 text-sm text-gray-600 shrink-0">{d.label}</div>
                    <div className="flex-1 bg-gray-100 rounded-lg h-7 overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center"
                        style={{
                          width: `${Math.max(d.percentage, d.percentage > 0 ? 15 : 0)}%`,
                          backgroundColor: d.color,
                          minWidth: d.percentage > 0 ? '48px' : '0',
                        }}
                      >
                        {d.percentage > 0 && (
                          <span className="text-xs font-semibold text-white ml-2 whitespace-nowrap">
                            {d.percentage.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-20 text-right shrink-0">
                      <span className="text-sm font-semibold text-gray-900">{d.count}</span>
                      <span className="text-xs text-gray-500 ml-1">({d.percentage.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Insights */}
            <div className="bg-[#FAFAF8] rounded-lg p-4 self-start">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Key Insight</h4>
              {(() => {
                const total = brandSentimentData.reduce((sum, d) => sum + d.count, 0);
                const strongCount = brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.count || 0;
                const positiveEndorsementCount = brandSentimentData.find(d => d.sentiment === 'positive_endorsement')?.count || 0;
                const neutralCount = brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0;
                const conditionalCount = brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0;
                const negativeCount = brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0;
                const notMentionedCount = brandSentimentData.find(d => d.sentiment === 'not_mentioned')?.count || 0;

                // Endorsement rate = (strong + positive) / total — consistent with provider & competitor tables
                const strongRate = total > 0 ? ((strongCount + positiveEndorsementCount) / total) * 100 : 0;
                const positiveRate = total > 0 ? ((strongCount + positiveEndorsementCount + neutralCount) / total) * 100 : 0;
                const mentionRate = total > 0 ? ((total - notMentionedCount) / total) * 100 : 0;

                let insight = '';
                if (isIndustryReport) {
                  // Industry-specific insights about brands within the category
                  if (strongRate >= 50) {
                    insight = `Brands in ${runStatus?.brand} receive strong endorsements in ${strongRate.toFixed(0)}% of AI responses, indicating positive industry sentiment overall.`;
                  } else if (positiveRate >= 70) {
                    insight = `Brands in ${runStatus?.brand} are described positively or neutrally in ${positiveRate.toFixed(0)}% of AI responses.`;
                  } else if (conditionalCount > strongCount) {
                    insight = `AI models often describe brands in ${runStatus?.brand} with caveats or conditions, suggesting a competitive or nuanced market.`;
                  } else if (negativeCount > 0 && negativeCount >= strongCount) {
                    insight = `Brands in ${runStatus?.brand} appear in negative comparisons ${negativeCount} time${negativeCount !== 1 ? 's' : ''}, indicating competitive tension in AI recommendations.`;
                  } else {
                    insight = `Brands in ${runStatus?.brand} have mixed sentiment across AI responses. Average positive sentiment rate is ${strongRate.toFixed(0)}%.`;
                  }
                } else if (isIssue) {
                  if (strongRate >= 50) {
                    insight = `${runStatus?.brand} receives supportive framing in ${strongRate.toFixed(0)}% of AI responses, indicating a broadly favorable perspective across platforms.`;
                  } else if (positiveRate >= 70) {
                    insight = `${runStatus?.brand} is framed supportively or neutrally in ${positiveRate.toFixed(0)}% of responses, suggesting balanced AI coverage.`;
                  } else if (conditionalCount > strongCount) {
                    insight = `AI models often discuss ${runStatus?.brand} with mixed framing or qualifications, suggesting nuanced perspectives on the issue.`;
                  } else if (negativeCount > 0 && negativeCount >= strongCount) {
                    insight = `${runStatus?.brand} receives critical framing ${negativeCount} time${negativeCount !== 1 ? 's' : ''}, indicating skeptical AI perspectives on this issue.`;
                  } else {
                    insight = `${runStatus?.brand} has mixed framing across AI responses. Supportive framing rate is ${strongRate.toFixed(0)}% with ${mentionRate.toFixed(0)}% overall discussion rate.`;
                  }
                } else {
                  if (strongRate >= 50) {
                    insight = `${runStatus?.brand} receives strong endorsements in ${strongRate.toFixed(0)}% of AI responses, indicating excellent brand positioning in AI recommendations.`;
                  } else if (positiveRate >= 70) {
                    insight = `${runStatus?.brand} is mentioned positively or neutrally in ${positiveRate.toFixed(0)}% of responses where it appears, suggesting solid brand perception.`;
                  } else if (conditionalCount > strongCount) {
                    insight = `AI models often mention ${runStatus?.brand} with caveats or conditions. Consider strengthening your unique value proposition to earn stronger endorsements.`;
                  } else if (negativeCount > 0 && negativeCount >= strongCount) {
                    insight = `${runStatus?.brand} appears in negative comparisons ${negativeCount} time${negativeCount !== 1 ? 's' : ''}. Review competitor positioning and brand messaging.`;
                  } else if (notMentionedCount > total * 0.5) {
                    insight = `${runStatus?.brand} is not mentioned in ${((notMentionedCount / total) * 100).toFixed(0)}% of responses. Focus on increasing AI visibility through content optimization.`;
                  } else {
                    insight = `${runStatus?.brand} has mixed sentiment across AI responses. Positive sentiment rate is ${strongRate.toFixed(0)}% with ${mentionRate.toFixed(0)}% overall mention rate.`;
                  }
                }

                return <p className="text-sm text-gray-600">{insight}</p>;
              })()}
            </div>
          </div>
        </div>}

        {/* Key Sentiment & Tone Insights */}
        {showSection('sentiment-insights') && sentimentInsights.length > 0 && (
          <div id="sentiment-insights" className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl shadow-sm border border-teal-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">Key Sentiment & Tone Insights</h2>
            </div>
            <ul className="space-y-3">
              {sentimentInsights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-900 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sentiment by Prompt Chart */}
        {showSection('sentiment-by-question') && globallyFilteredResults.filter((r: Result) => hasEffectiveSentiment(r)).length > 0 && (() => {
          // Get effective brand filter
          // For industry reports, default to '__all__' (average across all brands)
          // For brand reports, default to the searched brand
          const effectiveBrand = sentimentByPromptBrandFilter || (isIndustryReport ? '__all__' : runStatus?.brand || '');

          // Build brand options for dropdown
          const brandOptions: { value: string; label: string }[] = [];
          if (isIndustryReport) {
            brandOptions.push({ value: '__all__', label: 'All Brands (average sentiment)' });
          } else if (runStatus?.brand) {
            brandOptions.push({ value: runStatus.brand, label: runStatus.brand });
          }
          const competitors = new Set<string>();
          const searchedBrandForPrompt = runStatus?.brand || '';
          globallyFilteredResults.forEach((r: Result) => {
            const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
            rBrands.forEach(c => {
              if (!excludedBrands.has(c) && !isCategoryName(c, searchedBrandForPrompt)) {
                competitors.add(c);
              }
            });
          });
          competitors.forEach(c => {
            if (c !== runStatus?.brand) {
              brandOptions.push({ value: c, label: c });
            }
          });

          // Build source options for dropdown
          const sourceOptions: string[] = [];
          const sourceDomains = new Set<string>();
          globallyFilteredResults.forEach((r: Result) => {
            r.sources?.forEach(s => {
              if (s.url) {
                const domain = extractDomain(s.url);
                sourceDomains.add(domain);
              }
            });
          });
          sourceDomains.forEach(d => sourceOptions.push(d));
          sourceOptions.sort();

          // Calculate sentiment by prompt with filters
          const sentimentScoreMap: Record<string, number> = {
            'strong_endorsement': 5,
            'positive_endorsement': 4,
            'neutral_mention': 3,
            'conditional': 2,
            'negative_comparison': 1,
          };

          // Filter results by source if selected
          let filteredResults = globallyFilteredResults.filter((r: Result) => !r.error);
          if (sentimentByPromptSourceFilter !== 'all') {
            filteredResults = filteredResults.filter((r: Result) =>
              r.sources?.some(s => s.url && extractDomain(s.url) === sentimentByPromptSourceFilter)
            );
          }

          // Group by prompt and calculate sentiment for selected brand
          const promptGroups: Record<string, Result[]> = {};
          filteredResults.forEach((r: Result) => {
            if (!promptGroups[r.prompt]) {
              promptGroups[r.prompt] = [];
            }
            promptGroups[r.prompt].push(r);
          });

          const promptsWithSentiment = Object.entries(promptGroups).map(([prompt, results]) => {
            let mentioned = 0;
            const sentimentScores: number[] = [];

            results.forEach(r => {
              // For "All Brands" mode, use average sentiment across all brands
              if (effectiveBrand === '__all__') {
                const eSent = getEffectiveSentiment(r);
                if (eSent && eSent !== 'not_mentioned') {
                  mentioned++;
                  if (sentimentScoreMap[eSent]) {
                    sentimentScores.push(sentimentScoreMap[eSent]);
                  }
                }
                return;
              }

              // Check if the selected brand is mentioned
              const isBrandMentioned = effectiveBrand === runStatus?.brand
                ? r.brand_mentioned
                : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(effectiveBrand) : r.competitors_mentioned?.includes(effectiveBrand));

              if (isBrandMentioned) {
                mentioned++;

                // Get sentiment for the selected brand
                let sentiment: string | null | undefined;
                if (effectiveBrand === runStatus?.brand) {
                  sentiment = getEffectiveSentiment(r);
                } else {
                  sentiment = r.competitor_sentiments?.[effectiveBrand];
                }

                if (sentiment && sentiment !== 'not_mentioned' && sentimentScoreMap[sentiment]) {
                  sentimentScores.push(sentimentScoreMap[sentiment]);
                }
              }
            });

            const avgSentimentScore = sentimentScores.length > 0
              ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
              : null;

            return {
              prompt,
              total: results.length,
              mentioned,
              avgSentimentScore,
              visibilityScore: results.length > 0 ? (mentioned / results.length) * 100 : 0,
            };
          }).filter(p => p.avgSentimentScore !== null && p.mentioned > 0);

          if (promptsWithSentiment.length === 0) {
            return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Sentiment by Question</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {isIndustryReport
                        ? 'Average sentiment across all brands per question. Use the filters to view sentiment for a specific brand or source.'
                        : 'Which questions lead to positive vs negative descriptions'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={sentimentByPromptSourceFilter}
                      onChange={(e) => setSentimentByPromptSourceFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      <option value="all">All Sources</option>
                      {sourceOptions.map((domain) => (
                        <option key={domain} value={domain}>{domain}</option>
                      ))}
                    </select>
                    <select
                      value={sentimentByPromptBrandFilter || (isIndustryReport ? '__all__' : runStatus?.brand || '')}
                      onChange={(e) => setSentimentByPromptBrandFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      {brandOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="text-center py-12 text-gray-500">
                  No sentiment data available for the selected filters.
                </div>
              </div>
            );
          }

          // Calculate dynamic axis ranges
          const sentimentValues = promptsWithSentiment.map(p => p.avgSentimentScore || 0);
          const minSentiment = Math.min(...sentimentValues);
          const maxSentiment = Math.max(...sentimentValues);
          const xMin = Math.max(0.5, Math.floor(minSentiment) - 0.5);
          const xMax = Math.min(5.5, Math.ceil(maxSentiment) + 0.5);
          const xTicks = [1, 2, 3, 4, 5].filter(t => t >= xMin && t <= xMax);

          const maxMentions = Math.max(...promptsWithSentiment.map(p => p.mentioned));
          const yMax = maxMentions + Math.max(1, Math.ceil(maxMentions * 0.15));

          // Process data for overlapping points
          const positionGroups: Record<string, typeof promptsWithSentiment> = {};
          promptsWithSentiment.forEach(point => {
            const key = `${point.mentioned}-${(point.avgSentimentScore || 0).toFixed(1)}`;
            if (!positionGroups[key]) {
              positionGroups[key] = [];
            }
            positionGroups[key].push(point);
          });

          const processedData = promptsWithSentiment.map(point => {
            const key = `${point.mentioned}-${(point.avgSentimentScore || 0).toFixed(1)}`;
            const group = positionGroups[key];
            const indexInGroup = group.findIndex(p => p.prompt === point.prompt);
            return {
              ...point,
              groupSize: group.length,
              indexInGroup,
            };
          });

          return (
            <div id="sentiment-by-question" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{isIssue ? 'Framing by Question' : 'Sentiment by Question'}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {isIndustryReport
                      ? <>Average sentiment across all brands per question.<br />Filter by brand or source to drill down.</>
                      : isIssue
                      ? `Which questions lead to supportive vs critical framing of ${effectiveBrand}`
                      : `Which questions lead to positive vs negative descriptions of ${effectiveBrand}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={sentimentByPromptSourceFilter}
                    onChange={(e) => setSentimentByPromptSourceFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="all">All Sources</option>
                    {sourceOptions.map((domain) => (
                      <option key={domain} value={domain}>{domain}</option>
                    ))}
                  </select>
                  <select
                    value={sentimentByPromptBrandFilter || (isIndustryReport ? '__all__' : runStatus?.brand || '')}
                    onChange={(e) => setSentimentByPromptBrandFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    {brandOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Sentiment/Framing Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
                <span className="text-xs text-gray-600 font-medium">{isIssue ? 'Framing:' : 'Sentiment:'}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#047857' }} />
                  <span className="text-xs text-gray-500">{isIssue ? 'Supportive' : 'Strong'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                  <span className="text-xs text-gray-500">{isIssue ? 'Leaning Supportive' : 'Positive'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                  <span className="text-xs text-gray-500">{isIssue ? 'Balanced' : 'Neutral'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                  <span className="text-xs text-gray-500">{isIssue ? 'Mixed' : 'Conditional'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                  <span className="text-xs text-gray-500">{isIssue ? 'Critical' : 'Negative'}</span>
                </div>
              </div>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 30, right: 40, bottom: 60, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="avgSentimentScore"
                      name="Avg. Sentiment"
                      domain={[xMin, xMax]}
                      ticks={xTicks}
                      tickFormatter={isIssue
                        ? ((value: number) => ['', 'Critical', 'Mixed', 'Balanced', 'Leaning Supportive', 'Supportive'][Math.round(value)] || '')
                        : ((value: number) => ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'][Math.round(value)] || '')
                      }
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      label={{ value: isIssue ? 'Average Framing' : 'Average Sentiment', position: 'bottom', offset: 25, style: { fill: '#374151', fontSize: 14, fontWeight: 500 } }}
                    />
                    <YAxis
                      type="number"
                      dataKey="mentioned"
                      name="Mentions"
                      domain={[0, yMax]}
                      allowDecimals={false}
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      label={{
                        value: 'Number of Mentions',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        style: { fill: '#374151', fontSize: 14, fontWeight: 500, textAnchor: 'middle' }
                      }}
                    />
                    <Tooltip
                      cursor={false}
                      isAnimationActive={false}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload;
                          const sentimentLabels = isIssue
                            ? ['', 'Critical', 'Mixed', 'Balanced', 'Leaning Supportive', 'Supportive']
                            : ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'];
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm max-w-[300px]">
                              <p className="font-medium text-gray-900 mb-2 line-clamp-2">{data.prompt}</p>
                              <div className="space-y-1 text-gray-600">
                                <p>{isIssue ? 'Framing' : 'Sentiment'}: <span className="font-medium">{sentimentLabels[Math.round(data.avgSentimentScore)] || 'N/A'}</span></p>
                                <p>Mentions: <span className="font-medium">{data.mentioned}</span> of {data.total} responses</p>
                                <p>{isIssue ? 'Coverage' : 'Visibility'}: <span className="font-medium">{data.visibilityScore.toFixed(0)}%</span></p>
                                {data.avgRank && (
                                  <p>Avg. Position: <span className="font-medium">#{data.avgRank.toFixed(1)}</span></p>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter
                      data={processedData}
                      shape={(props: any) => {
                        const { cx, cy, payload } = props;
                        const groupSize = payload.groupSize || 1;
                        const indexInGroup = payload.indexInGroup || 0;

                        // Color based on sentiment (green = good, red = bad)
                        const sentiment = payload.avgSentimentScore || 3;
                        const getColor = () => {
                          if (sentiment >= 4.5) return '#047857'; // Strong - emerald-700
                          if (sentiment >= 3.5) return '#10b981'; // Positive - emerald-500
                          if (sentiment >= 2.5) return '#9ca3af'; // Neutral - gray
                          if (sentiment >= 1.5) return '#f59e0b'; // Conditional - amber
                          return '#ef4444'; // Negative - red
                        };
                        const getStroke = () => {
                          if (sentiment >= 4.5) return '#065f46';
                          if (sentiment >= 3.5) return '#059669';
                          if (sentiment >= 2.5) return '#6b7280';
                          if (sentiment >= 1.5) return '#d97706';
                          return '#dc2626';
                        };

                        const circleRadius = 10;
                        const spacing = 22;
                        const totalWidth = (groupSize - 1) * spacing;
                        const xOffset = groupSize > 1 ? (indexInGroup * spacing) - (totalWidth / 2) : 0;

                        // Truncate prompt for label
                        const shortPrompt = payload.prompt.length > 20
                          ? payload.prompt.substring(0, 18) + '...'
                          : payload.prompt;

                        // Label positioning
                        let labelXOffset = 0;
                        let labelYOffset = -14;
                        let textAnchor: 'start' | 'middle' | 'end' = 'middle';

                        if (groupSize === 2) {
                          labelYOffset = indexInGroup === 0 ? -14 : 22;
                        } else if (groupSize >= 3) {
                          const angles = [-90, 150, 30, -45, -135, 90];
                          const angle = angles[indexInGroup % angles.length];
                          const radians = (angle * Math.PI) / 180;
                          labelXOffset = Math.cos(radians) * 18;
                          labelYOffset = Math.sin(radians) * 18;
                          if (labelXOffset < -5) textAnchor = 'end';
                          else if (labelXOffset > 5) textAnchor = 'start';
                        }

                        return (
                          <g>
                            <circle
                              cx={cx + xOffset}
                              cy={cy}
                              r={circleRadius}
                              fill={getColor()}
                              stroke={getStroke()}
                              strokeWidth={2}
                              opacity={0.85}
                              style={{ cursor: 'pointer' }}
                            />
                            <text
                              x={cx + xOffset + labelXOffset}
                              y={cy + labelYOffset}
                              textAnchor={textAnchor}
                              fill="#374151"
                              fontSize={10}
                              fontWeight={500}
                            >
                              {shortPrompt}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {/* Sentiment by Provider */}
        {showSection('sentiment-by-platform') && <div id="sentiment-by-platform" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-visible">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{isIssue ? 'Framing by AI Platform' : 'Sentiment by AI Platform'}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {isIndustryReport
                  ? <>Average sentiment across all brands by platform.<br />Filter by brand or source to see individual breakdowns.</>

                  : isIssue
                  ? `How each AI platform frames ${sentimentBrandLabel}`
                  : `How each AI platform describes ${sentimentBrandLabel}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isIssue ? (
                <select
                  value={sentimentProviderModelFilter}
                  onChange={(e) => setSentimentProviderModelFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="all">All Models</option>
                  {availableProviders.map((provider) => (
                    <option key={provider} value={provider}>{providerLabels[provider] || provider}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={sentimentProviderCitationFilter}
                  onChange={(e) => setSentimentProviderCitationFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="all">All Sources</option>
                  {citationSourceOptions.map((domain) => (
                    <option key={domain} value={domain}>{domain}</option>
                  ))}
                </select>
              )}
              <select
                value={sentimentProviderBrandFilter || (isIndustryReport ? '__all__' : runStatus?.brand || '')}
                onChange={(e) => setSentimentProviderBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                {sentimentProviderBrandOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary takeaway */}
          {sentimentByProvider.length > 0 && (() => {
            const highEndorsers = sentimentByProvider.filter(r => r.strongRate >= 75);
            const lowEndorsers = sentimentByProvider.filter(r => r.strongRate < 25 && r.total > 0);
            const totalProviders = sentimentByProvider.filter(r => r.total > 0).length;
            return (
              <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5 text-sm text-gray-700">
                {highEndorsers.length > 0 && (
                  <span><span className="font-semibold text-gray-900">{highEndorsers.length} of {totalProviders}</span> platforms {isIssue ? 'frame supportively' : 'endorse'} {sentimentBrandLabel}</span>
                )}
                {highEndorsers.length > 0 && lowEndorsers.length > 0 && <span className="mx-2 text-gray-300">·</span>}
                {lowEndorsers.length > 0 && (
                  <span><span className="font-semibold text-gray-900">{lowEndorsers.length}</span> {lowEndorsers.length === 1 ? 'platform has' : 'platforms have'} {isIssue ? 'critical framing' : 'low endorsement'}</span>
                )}
                {highEndorsers.length === 0 && lowEndorsers.length === 0 && (
                  <span>{isIssue ? 'Mixed framing across platforms' : 'Mixed sentiment across platforms'}</span>
                )}
              </div>
            );
          })()}

          <div className="overflow-visible pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-4">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</span>
                  </th>
                  <th className="text-left py-2.5 px-3" style={{ width: '22%' }}>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isIssue ? 'Supportive Rate' : 'Endorsement Rate'}</span>
                    <div className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">{isIssue ? '(% supportive or leaning)' : '(% positive or strong endorsement)'}</div>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isIssue ? 'Supportive' : 'Strong'}</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isIssue ? 'Leaning' : 'Positive'}</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isIssue ? 'Balanced' : 'Neutral'}</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isIssue ? 'Mixed' : 'Conditional'}</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isIssue ? 'Critical' : 'Negative'}</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{isIssue ? 'Not Discussed' : 'Not Mentioned'}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sentimentByProvider.map((row, rowIndex) => {
                  const isBottomRow = rowIndex >= sentimentByProvider.length - 2;
                  const popupPos = isBottomRow ? 'top' : 'bottom';
                  const providerColor = getProviderBrandColor(row.provider);
                  const endorsementRate = row.strongRate;
                  const rateColor = endorsementRate >= 75 ? 'text-emerald-600' : endorsementRate >= 40 ? 'text-amber-600' : endorsementRate > 0 ? 'text-red-500' : 'text-gray-400';
                  const barColor = endorsementRate >= 75 ? 'bg-emerald-500' : endorsementRate >= 40 ? 'bg-amber-400' : endorsementRate > 0 ? 'bg-red-400' : 'bg-gray-200';

                  // Stacked bar segments
                  const total = row.total || 1;
                  const segments = [
                    { key: 'strong', value: row.strong_endorsement, color: '#047857' },
                    { key: 'positive', value: row.positive_endorsement, color: '#10b981' },
                    { key: 'neutral', value: row.neutral_mention, color: '#9ca3af' },
                    { key: 'conditional', value: row.conditional, color: '#f59e0b' },
                    { key: 'negative', value: row.negative_comparison, color: '#ef4444' },
                    { key: 'not_mentioned', value: row.not_mentioned, color: '#e5e7eb' },
                  ].filter(s => s.value > 0);

                  return (
                    <tr key={row.provider} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0">{getProviderIcon(row.provider)}</span>
                          <span className="text-sm font-medium text-gray-900">{row.label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold w-10 ${rateColor}`}>
                            {endorsementRate.toFixed(0)}%
                          </span>
                          {/* Stacked bar */}
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                            {segments.map((seg) => (
                              <div
                                key={seg.key}
                                className="h-full first:rounded-l-full last:rounded-r-full"
                                style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
                              />
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="strong_endorsement"
                          count={row.strong_endorsement}
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="positive_endorsement"
                          count={row.positive_endorsement}
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="neutral_mention"
                          count={row.neutral_mention}
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="conditional"
                          count={row.conditional}
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="negative_comparison"
                          count={row.negative_comparison}
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="not_mentioned"
                          count={row.not_mentioned}
                          popupPosition={popupPos}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Stacked bar legend */}
          <div className="flex items-center justify-center gap-4 pt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#047857' }} />Strong</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />Positive</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />Neutral</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />Conditional</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />Negative</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#e5e7eb' }} />Not Mentioned</span>
          </div>
        </div>}

        {/* Competitor Sentiment Comparison */}
        {showSection('sentiment-competitor') && competitorSentimentData.length > 0 && (
          <div id="sentiment-competitor" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-900">Competitor Sentiment Comparison</h3>
              <select
                value={competitorSentimentModelFilter}
                onChange={(e) => setCompetitorSentimentModelFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Models</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
            <p className="text-sm text-gray-500 mb-6">How AI models describe competitors in the same responses</p>

            <div className="overflow-x-auto">
              {isCategory ? (
                /* Industry reports: single table (no "Your Brand" row) to avoid column misalignment */
                <div style={{ maxHeight: '540px' }} className="overflow-y-auto overscroll-contain">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Brand</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-gray-900">Strong</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-gray-600">Positive</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-gray-500">Neutral</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-amber-500">Conditional</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-red-500">Negative</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">
                          <div>Endorsement</div>
                          <div>Rate</div>
                          <div className="text-[10px] text-gray-400 font-normal">(% positive or strong endorsement)</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitorSentimentData.map((row, rowIndex) => {
                        const popupPos = rowIndex >= competitorSentimentData.length - 2 ? 'top' as const : 'bottom' as const;
                        return (
                        <tr key={row.competitor} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className="text-sm font-medium text-gray-900">{row.competitor}</span>
                          </td>
                          <td className="text-center py-3 px-2">
                            <CompetitorSentimentBadge
                              competitor={row.competitor}
                              sentiment="strong_endorsement"
                              count={row.strong_endorsement}
                              badgeClassName="bg-gray-100 text-gray-900"
                              popupPosition={popupPos}
                            />
                          </td>
                          <td className="text-center py-3 px-2">
                            <CompetitorSentimentBadge
                              competitor={row.competitor}
                              sentiment="positive_endorsement"
                              count={row.positive_endorsement}
                              badgeClassName="bg-gray-100 text-gray-700"
                              popupPosition={popupPos}
                            />
                          </td>
                          <td className="text-center py-3 px-2">
                            <CompetitorSentimentBadge
                              competitor={row.competitor}
                              sentiment="neutral_mention"
                              count={row.neutral_mention}
                              badgeClassName="bg-blue-100 text-blue-800"
                              popupPosition={popupPos}
                            />
                          </td>
                          <td className="text-center py-3 px-2">
                            <CompetitorSentimentBadge
                              competitor={row.competitor}
                              sentiment="conditional"
                              count={row.conditional}
                              badgeClassName="bg-yellow-100 text-yellow-800"
                              popupPosition={popupPos}
                            />
                          </td>
                          <td className="text-center py-3 px-2">
                            <CompetitorSentimentBadge
                              competitor={row.competitor}
                              sentiment="negative_comparison"
                              count={row.negative_comparison}
                              badgeClassName="bg-red-100 text-red-800"
                              popupPosition={popupPos}
                            />
                          </td>
                          <td className="text-center py-3 px-4">
                            <span className={`text-sm font-semibold ${row.strongRate >= 50 ? 'text-gray-600' : row.strongRate >= 25 ? 'text-gray-500' : 'text-gray-500'}`}>
                              {row.strongRate.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Brand reports: split tables — fixed header + "Your Brand" row, scrollable competitors */
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Competitor</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-gray-900">Strong</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-gray-600">Positive</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-gray-500">Neutral</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-amber-500">Conditional</th>
                        <th className="text-center py-3 px-2 text-sm font-medium text-red-500">Negative</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">
                          <div>Endorsement</div>
                          <div>Rate</div>
                          <div className="text-[10px] text-gray-400 font-normal">(% positive or strong endorsement)</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200 bg-gray-100/30">
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium text-gray-900">{runStatus?.brand} (Your Brand)</span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <CompetitorSentimentBadge
                            competitor={runStatus?.brand || ''}
                            sentiment="strong_endorsement"
                            count={brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.count || 0}
                            badgeClassName="bg-gray-100 text-gray-900"
                            popupPosition="bottom"
                          />
                        </td>
                        <td className="text-center py-3 px-2">
                          <CompetitorSentimentBadge
                            competitor={runStatus?.brand || ''}
                            sentiment="positive_endorsement"
                            count={brandSentimentData.find(d => d.sentiment === 'positive_endorsement')?.count || 0}
                            badgeClassName="bg-gray-100 text-gray-700"
                            popupPosition="bottom"
                          />
                        </td>
                        <td className="text-center py-3 px-2">
                          <CompetitorSentimentBadge
                            competitor={runStatus?.brand || ''}
                            sentiment="neutral_mention"
                            count={brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0}
                            badgeClassName="bg-blue-100 text-blue-800"
                            popupPosition="bottom"
                          />
                        </td>
                        <td className="text-center py-3 px-2">
                          <CompetitorSentimentBadge
                            competitor={runStatus?.brand || ''}
                            sentiment="conditional"
                            count={brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0}
                            badgeClassName="bg-yellow-100 text-yellow-800"
                            popupPosition="bottom"
                          />
                        </td>
                        <td className="text-center py-3 px-2">
                          <CompetitorSentimentBadge
                            competitor={runStatus?.brand || ''}
                            sentiment="negative_comparison"
                            count={brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0}
                            badgeClassName="bg-red-100 text-red-800"
                            popupPosition="bottom"
                          />
                        </td>
                        <td className="text-right py-3 px-4">
                          <span className="text-sm font-medium text-gray-900">
                            {(((brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.percentage || 0) + (brandSentimentData.find(d => d.sentiment === 'positive_endorsement')?.percentage || 0))).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {/* Scrollable competitor rows */}
                  <div style={{ maxHeight: '480px' }} className="overflow-y-auto overscroll-contain">
                    <table className="w-full">
                      <tbody>
                        {competitorSentimentData.map((row, rowIndex) => {
                          const popupPos = rowIndex >= competitorSentimentData.length - 2 ? 'top' as const : 'bottom' as const;
                          return (
                          <tr key={row.competitor} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <span className="text-sm font-medium text-gray-900">{row.competitor}</span>
                            </td>
                            <td className="text-center py-3 px-2">
                              <CompetitorSentimentBadge
                                competitor={row.competitor}
                                sentiment="strong_endorsement"
                                count={row.strong_endorsement}
                                badgeClassName="bg-gray-100 text-gray-900"
                                popupPosition={popupPos}
                              />
                            </td>
                            <td className="text-center py-3 px-2">
                              <CompetitorSentimentBadge
                                competitor={row.competitor}
                                sentiment="positive_endorsement"
                                count={row.positive_endorsement}
                                badgeClassName="bg-gray-100 text-gray-700"
                                popupPosition={popupPos}
                              />
                            </td>
                            <td className="text-center py-3 px-2">
                              <CompetitorSentimentBadge
                                competitor={row.competitor}
                                sentiment="neutral_mention"
                                count={row.neutral_mention}
                                badgeClassName="bg-blue-100 text-blue-800"
                                popupPosition={popupPos}
                              />
                            </td>
                            <td className="text-center py-3 px-2">
                              <CompetitorSentimentBadge
                                competitor={row.competitor}
                                sentiment="conditional"
                                count={row.conditional}
                                badgeClassName="bg-yellow-100 text-yellow-800"
                                popupPosition={popupPos}
                              />
                            </td>
                            <td className="text-center py-3 px-2">
                              <CompetitorSentimentBadge
                                competitor={row.competitor}
                                sentiment="negative_comparison"
                                count={row.negative_comparison}
                                badgeClassName="bg-red-100 text-red-800"
                                popupPosition={popupPos}
                              />
                            </td>
                            <td className="text-center py-3 px-4">
                              <span className={`text-sm font-semibold ${row.strongRate >= 50 ? 'text-gray-600' : row.strongRate >= 25 ? 'text-gray-500' : 'text-gray-500'}`}>
                                {row.strongRate.toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {competitorSentimentData.length > 10 && (
                <p className="text-xs text-gray-400 text-center pt-2">Scroll down to see all {competitorSentimentData.length} brands</p>
              )}
            </div>
          </div>
        )}

        {/* Individual Results with Sentiment */}
        {showSection('sentiment-details') && <div id="sentiment-details" className="bg-white rounded-xl shadow-sm border border-gray-100">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sentiment Details</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {isCategory
                  ? 'Sentiment shown per brand in each response. Filter by brand or model to narrow results.'
                  : 'How each AI response describes your brand'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isCategory ? (
                <select
                  value={responseBrandFilter}
                  onChange={(e) => setResponseBrandFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="all">All Brands</option>
                  {availableBrands.map((brand) => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={responseSentimentFilter}
                  onChange={(e) => setResponseSentimentFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="all">All Sentiments</option>
                  <option value="strong_endorsement">Strong</option>
                  <option value="positive_endorsement">Positive</option>
                  <option value="neutral_mention">Neutral</option>
                  <option value="conditional">Conditional</option>
                  <option value="negative_comparison">Negative</option>
                </select>
              )}
              <select
                value={responseLlmFilter}
                onChange={(e) => setResponseLlmFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Models</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const filteredSentimentResults = globallyFilteredResults
              .filter((r: Result) => hasEffectiveSentiment(r))
              .filter((r: Result) => {
                if (isCategory) {
                  // For industry reports: filter by brand presence in competitor_sentiments
                  if (responseBrandFilter === 'all') return true;
                  return r.competitor_sentiments && responseBrandFilter in r.competitor_sentiments
                    && r.competitor_sentiments[responseBrandFilter] !== 'not_mentioned';
                }
                // For other types: filter by sentiment
                return responseSentimentFilter === 'all' || getEffectiveSentiment(r) === responseSentimentFilter;
              })
              .filter((r: Result) => responseLlmFilter === 'all' || r.provider === responseLlmFilter);

            const totalWithSentiment = globallyFilteredResults.filter((r: Result) => hasEffectiveSentiment(r)).length;

            return (
              <>
                <div className="px-6 py-3 border-b border-gray-100">
                  <p className="text-sm text-gray-500">
                    Showing {filteredSentimentResults.length} of {totalWithSentiment} results
                  </p>
                </div>

                {/* Table */}
                <div className="overflow-x-auto min-h-0">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="w-[30%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Question</th>
                        <th className="w-[14%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                        <th className="w-[8%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{isIndustryReport ? '# Brands' : 'Rank'}</th>
                        <th className="w-[16%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Sentiment</th>
                        <th className="w-[22%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{isIndustryReport ? 'Brands' : 'Competitors'}</th>
                        <th className="w-[10%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                  </table>
                  {/* Scrollable tbody wrapper */}
                  <div className="max-h-[540px] overflow-y-auto overscroll-contain">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[14%]" />
                        <col className="w-[8%]" />
                        <col className="w-[16%]" />
                        <col className="w-[22%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <tbody>
                        {filteredSentimentResults.map((result: Result) => {
                        // Calculate rank
                        let rank = 0;
                        const brandLower = stripDiacritics(runStatus?.brand || '').toLowerCase();
                        if (result.brand_mentioned && result.response_text) {
                          const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                            ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                            : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                          const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
                          const brandPos = rankingText.indexOf(brandLower);
                          if (brandPos >= 0) {
                            let brandsBeforeCount = 0;
                            for (const b of allBrands) {
                              const bLower = stripDiacritics(b).toLowerCase();
                              if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
                              const bPos = rankingText.indexOf(bLower);
                              if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
                            }
                            rank = brandsBeforeCount + 1;
                          } else {
                            rank = allBrands.length + 1;
                          }
                        }

                        // Position badge styling
                        const getPositionBadge = () => {
                          if (rank === 0) {
                            return <span className="text-xs text-gray-400">—</span>;
                          }
                          const color = rank === 1
                            ? 'text-emerald-700 font-semibold'
                            : rank <= 3
                            ? 'text-teal-700 font-medium'
                            : rank <= 5
                            ? 'text-amber-600 font-medium'
                            : 'text-gray-500';
                          return (
                            <span className={`text-xs ${color}`}>#{rank}</span>
                          );
                        };

                        // Sentiment badge — for industry reports, show per-brand sentiment when filtered
                        const getSentimentBadge = () => {
                          const sentiment = (isCategory && responseBrandFilter !== 'all' && result.competitor_sentiments)
                            ? (result.competitor_sentiments[responseBrandFilter] || null)
                            : getEffectiveSentiment(result);
                          if (!sentiment || sentiment === 'not_mentioned') {
                            return <span className="text-xs text-gray-400">—</span>;
                          }
                          const configs: Record<string, { text: string; label: string }> = {
                            'strong_endorsement': { text: 'text-emerald-700', label: 'Strong' },
                            'positive_endorsement': { text: 'text-green-600', label: 'Positive' },
                            'neutral_mention': { text: 'text-gray-500', label: 'Neutral' },
                            'conditional': { text: 'text-amber-600', label: 'Conditional' },
                            'negative_comparison': { text: 'text-red-600', label: 'Negative' },
                          };
                          const config = configs[sentiment] || { text: 'text-gray-500', label: 'Unknown' };
                          return (
                            <span className={`text-xs font-medium ${config.text}`}>
                              {config.label}
                            </span>
                          );
                        };

                        // Get competitor info
                        const competitors = (result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || []).filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase() && !excludedBrands.has(b) && !isCategoryName(b, runStatus?.brand || ''));
                        const getCompetitorsList = () => {
                          if (competitors.length === 0) {
                            return <span className="text-xs text-gray-400">None</span>;
                          }
                          return (
                            <span className="text-xs text-gray-600">
                              {competitors.join(', ')}
                            </span>
                          );
                        };

                        return (
                          <tr
                            key={result.id}
                            className={`border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 ${filteredSentimentResults.indexOf(result) % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                            onClick={() => setSelectedResult(result)}
                          >
                            <td className="py-3 px-4" title={result.prompt}>
                              <p className="text-xs text-gray-900 truncate">{truncate(result.prompt, 50)}</p>
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                                <span className="flex-shrink-0">{getProviderIcon(result.provider)}</span>
                                {providerLabels[result.provider] || result.provider}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {isIndustryReport
                                ? <span className="text-xs font-medium text-gray-700">{(result.all_brands_mentioned || result.competitors_mentioned || []).filter(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b)).length}</span>
                                : getPositionBadge()}
                            </td>
                            <td className="py-3 px-4">
                              {getSentimentBadge()}
                            </td>
                            <td className="py-3 px-4">
                              {getCompetitorsList()}
                            </td>
                            <td className="py-3 px-4">
                              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                            </td>
                          </tr>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 bg-gray-50/50 border-t border-gray-100 rounded-b-2xl">
            <button
              onClick={handleExportSentimentCSV}
              className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <Link2 className="w-4 h-4" />
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>}
      </div>
    );
};

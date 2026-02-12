'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
} from './shared';
import { useResults, useResultsUI } from './ResultsContext';

// No props needed - all data comes from context

export const SentimentTab = () => {
  const { runStatus, globallyFilteredResults, trackedBrands, availableProviders } = useResults();
  const { copied, handleCopyLink, setSelectedResult } = useResultsUI();

  const [hoveredSentimentBadge, setHoveredSentimentBadge] = useState<{ provider: string; sentiment: string } | null>(null);
  const [responseSentimentFilter, setResponseSentimentFilter] = useState<string>('all');
  const [responseLlmFilter, setResponseLlmFilter] = useState<string>('all');
  const [sentimentProviderBrandFilter, setSentimentProviderBrandFilter] = useState<string>('');
  const [sentimentProviderCitationFilter, setSentimentProviderCitationFilter] = useState<string>('all');
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
      switch (sentiment) {
        case 'strong_endorsement': return 'Strong';
        case 'positive_endorsement': return 'Positive';
        case 'neutral_mention': return 'Neutral';
        case 'conditional': return 'Conditional';
        case 'negative_comparison': return 'Negative';
        case 'not_mentioned': return 'Not Mentioned';
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

    // Sentiment insights (moved from parent)
    const sentimentInsights = useMemo(() => {
      if (!runStatus) return [];

      const insights: string[] = [];
      const searchedBrand = runStatus.brand;

      // Get sentiment data
      const resultsWithSentiment = globallyFilteredResults.filter(
        (r: Result) => !r.error && r.brand_sentiment
      );

      if (resultsWithSentiment.length === 0) return [];

      // Count sentiments
      const sentimentCounts: Record<string, number> = {
        strong_endorsement: 0,
        positive_endorsement: 0,
        neutral_mention: 0,
        conditional: 0,
        negative_comparison: 0,
      };

      resultsWithSentiment.forEach((r: Result) => {
        const sentiment = r.brand_sentiment || '';
        if (sentimentCounts[sentiment] !== undefined) {
          sentimentCounts[sentiment]++;
        }
      });

      const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);
      const positiveCount = sentimentCounts.strong_endorsement + sentimentCounts.positive_endorsement;
      const positiveRate = total > 0 ? (positiveCount / total) * 100 : 0;

      // 1. Overall sentiment insight
      if (positiveRate >= 70) {
        insights.push(`${searchedBrand} receives highly positive framing — ${positiveRate.toFixed(0)}% of mentions are endorsements`);
      } else if (positiveRate >= 50) {
        insights.push(`${searchedBrand} has generally positive sentiment with ${positiveRate.toFixed(0)}% endorsement rate`);
      } else if (positiveRate >= 30) {
        insights.push(`${searchedBrand} has mixed sentiment — only ${positiveRate.toFixed(0)}% of mentions are positive endorsements`);
      } else {
        insights.push(`${searchedBrand} has challenging sentiment positioning — ${positiveRate.toFixed(0)}% positive endorsements`);
      }

      // 2. Strongest sentiment category
      const topSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0];
      if (topSentiment && topSentiment[1] > 0) {
        const labelMap: Record<string, string> = {
          strong_endorsement: 'Strong',
          positive_endorsement: 'Positive',
          neutral_mention: 'Neutral',
          conditional: 'Conditional',
          negative_comparison: 'Negative',
        };
        const percentage = total > 0 ? (topSentiment[1] / total * 100).toFixed(0) : 0;
        insights.push(`Most common framing: "${labelMap[topSentiment[0]]}" (${percentage}% of responses)`);
      }

      // 3. Caveat/negative analysis
      const negativeCount = sentimentCounts.conditional + sentimentCounts.negative_comparison;
      if (negativeCount > 0) {
        const negativeRate = (negativeCount / total) * 100;
        if (negativeRate > 20) {
          insights.push(`${negativeRate.toFixed(0)}% of mentions include caveats or negative comparisons — room for improvement`);
        }
      }

      // 4. Provider-specific sentiment patterns
      const providerSentiments: Record<string, { positive: number; total: number }> = {};
      resultsWithSentiment.forEach((r: Result) => {
        if (!providerSentiments[r.provider]) {
          providerSentiments[r.provider] = { positive: 0, total: 0 };
        }
        providerSentiments[r.provider].total++;
        if (r.brand_sentiment === 'strong_endorsement' || r.brand_sentiment === 'positive_endorsement') {
          providerSentiments[r.provider].positive++;
        }
      });

      const formatProviderName = (p: string) => {
        switch (p) {
          case 'openai': return 'GPT-4o';
          case 'anthropic': return 'Claude';
          case 'perplexity': return 'Perplexity';
          case 'ai_overviews': return 'Google AI Overviews';
          case 'gemini': return 'Gemini';
          default: return p;
        }
      };

      // Find best and worst providers
      const providerRates = Object.entries(providerSentiments)
        .filter(([, data]) => data.total >= 2)
        .map(([provider, data]) => ({
          provider,
          rate: (data.positive / data.total) * 100,
          total: data.total,
        }))
        .sort((a, b) => b.rate - a.rate);

      if (providerRates.length >= 2) {
        const best = providerRates[0];
        const worst = providerRates[providerRates.length - 1];
        if (best.rate - worst.rate > 20) {
          insights.push(`${formatProviderName(best.provider)} is most positive (${best.rate.toFixed(0)}% endorsements) vs ${formatProviderName(worst.provider)} (${worst.rate.toFixed(0)}%)`);
        }
      }

      // 5. Competitor comparison (if available)
      const competitorSentiments: Record<string, { positive: number; total: number }> = {};
      globallyFilteredResults
        .filter((r: Result) => !r.error && r.competitor_sentiments)
        .forEach((r: Result) => {
          if (r.competitor_sentiments) {
            Object.entries(r.competitor_sentiments).forEach(([comp, sentiment]) => {
              if (!competitorSentiments[comp]) {
                competitorSentiments[comp] = { positive: 0, total: 0 };
              }
              competitorSentiments[comp].total++;
              if (sentiment === 'strong_endorsement' || sentiment === 'positive_endorsement') {
                competitorSentiments[comp].positive++;
              }
            });
          }
        });

      const competitorsWithBetterSentiment = Object.entries(competitorSentiments)
        .filter(([, data]) => data.total >= 2)
        .filter(([, data]) => {
          const compRate = (data.positive / data.total) * 100;
          return compRate > positiveRate + 10;
        });

      if (competitorsWithBetterSentiment.length > 0) {
        const topComp = competitorsWithBetterSentiment[0];
        const compRate = (topComp[1].positive / topComp[1].total) * 100;
        insights.push(`${topComp[0]} has stronger sentiment (${compRate.toFixed(0)}% positive) than ${searchedBrand} (${positiveRate.toFixed(0)}%)`);
      } else if (Object.keys(competitorSentiments).length > 0) {
        insights.push(`${searchedBrand} has equal or better sentiment than tracked competitors`);
      }

      return insights.slice(0, 5);
    }, [runStatus, globallyFilteredResults]);

    // Export sentiment CSV handler
    const handleExportSentimentCSV = () => {
      if (!runStatus) return;

      const headers = [
        'Prompt',
        'Provider',
        'Model',
        'Position',
        `${runStatus.brand} Sentiment`,
        'Competitor Sentiments',
        'All Brands Mentioned',
        'Response',
      ];

      const rows = globallyFilteredResults
        .filter((r: Result) => !r.error && r.brand_sentiment)
        .map((r: Result) => {
          const compSentiments = r.competitor_sentiments
            ? Object.entries(r.competitor_sentiments)
                .filter(([_, sentiment]) => sentiment !== 'not_mentioned')
                .map(([comp, sentiment]) => `${comp}: ${sentiment}`)
                .join('; ')
            : '';

          // Calculate position/rank
          let rank = 0;
          const brandLower = runStatus.brand.toLowerCase();
          if (r.brand_mentioned && r.response_text) {
            const allBrands: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
              ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
              : [runStatus.brand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

            const rankingText = getTextForRanking(r.response_text, r.provider).toLowerCase();
            const brandPos = rankingText.indexOf(brandLower);
            if (brandPos >= 0) {
              let brandsBeforeCount = 0;
              for (const b of allBrands) {
                const bLower = b.toLowerCase();
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
            r.brand_sentiment || '',
            `"${compSentiments}"`,
            `"${(r.all_brands_mentioned || []).join(', ')}"`,
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

    // Calculate brand sentiment distribution
    const brandSentimentData = useMemo(() => {
      const sentimentCounts: Record<string, number> = {
        strong_endorsement: 0,
        positive_endorsement: 0,
        neutral_mention: 0,
        conditional: 0,
        negative_comparison: 0,
        not_mentioned: 0,
      };

      globallyFilteredResults
        .filter((r: Result) => !r.error)
        .forEach((r: Result) => {
          const sentiment = r.brand_sentiment || 'not_mentioned';
          if (sentimentCounts[sentiment] !== undefined) {
            sentimentCounts[sentiment]++;
          }
        });

      const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);

      return Object.entries(sentimentCounts)
        .map(([sentiment, count]) => ({
          sentiment,
          label: getSentimentLabel(sentiment),
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
          color: getSentimentBarColor(sentiment),
        }))
        .filter(d => d.count > 0);
    }, [globallyFilteredResults]);

    // Calculate sentiment by provider
    // Get list of brands for the sentiment provider filter dropdown
    const sentimentProviderBrandOptions = useMemo(() => {
      if (!runStatus) return [];
      const options: { value: string; label: string; isSearched: boolean }[] = [];

      // Add searched brand first
      if (runStatus.brand) {
        options.push({ value: runStatus.brand, label: `${runStatus.brand} (searched)`, isSearched: true });
      }

      // Collect all competitors from competitor_sentiments
      const competitors = new Set<string>();
      globallyFilteredResults.forEach((r: Result) => {
        if (!r.error && r.competitor_sentiments) {
          Object.keys(r.competitor_sentiments).forEach(comp => competitors.add(comp));
        }
      });

      // Add competitors sorted alphabetically
      Array.from(competitors).sort().forEach(comp => {
        options.push({ value: comp, label: comp, isSearched: false });
      });

      return options;
    }, [runStatus, globallyFilteredResults]);

    // Get the effective brand filter (default to searched brand)
    const effectiveSentimentBrand = sentimentProviderBrandFilter || runStatus?.brand || '';

    // Get list of unique citation source domains for the filter dropdown
    const citationSourceOptions = useMemo(() => {
      const domains = new Set<string>();
      globallyFilteredResults.forEach((r: Result) => {
        if (!r.error && r.sources) {
          r.sources.forEach((source) => {
            if (source.url) {
              domains.add(extractDomain(source.url));
            }
          });
        }
      });
      return Array.from(domains).sort();
    }, [globallyFilteredResults]);

    const sentimentByProvider = useMemo(() => {
      const providerData: Record<string, {
        strong_endorsement: number;
        positive_endorsement: number;
        neutral_mention: number;
        conditional: number;
        negative_comparison: number;
        not_mentioned: number;
      }> = {};

      const isSearchedBrand = effectiveSentimentBrand === runStatus?.brand;

      globallyFilteredResults
        .filter((r: Result) => {
          if (r.error) return false;
          // Filter by citation source domain if not "all"
          if (sentimentProviderCitationFilter !== 'all') {
            if (!r.sources || r.sources.length === 0) return false;
            const hasCitationFromDomain = r.sources.some(
              (source) => source.url && extractDomain(source.url) === sentimentProviderCitationFilter
            );
            if (!hasCitationFromDomain) return false;
          }
          return true;
        })
        .forEach((r: Result) => {
          if (!providerData[r.provider]) {
            providerData[r.provider] = {
              strong_endorsement: 0,
              positive_endorsement: 0,
              neutral_mention: 0,
              conditional: 0,
              negative_comparison: 0,
              not_mentioned: 0,
            };
          }

          let sentiment: string;
          if (isSearchedBrand) {
            // Use brand_sentiment for the searched brand
            sentiment = r.brand_sentiment || 'not_mentioned';
          } else {
            // Use competitor_sentiments for competitors
            sentiment = r.competitor_sentiments?.[effectiveSentimentBrand] || 'not_mentioned';
          }

          if (sentiment in providerData[r.provider]) {
            providerData[r.provider][sentiment as keyof typeof providerData[string]]++;
          }
        });

      return Object.entries(providerData).map(([provider, counts]) => {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const positiveTotal = counts.strong_endorsement + counts.positive_endorsement;
        return {
          provider,
          label: getProviderLabel(provider),
          strong_endorsement: counts.strong_endorsement,
          positive_endorsement: counts.positive_endorsement,
          neutral_mention: counts.neutral_mention,
          conditional: counts.conditional,
          negative_comparison: counts.negative_comparison,
          not_mentioned: counts.not_mentioned,
          total,
          strongRate: total > 0 ? (positiveTotal / total) * 100 : 0,
        };
      }).sort((a, b) => {
        const aIdx = PROVIDER_ORDER.indexOf(a.provider);
        const bIdx = PROVIDER_ORDER.indexOf(b.provider);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });
    }, [globallyFilteredResults, effectiveSentimentBrand, runStatus?.brand, sentimentProviderCitationFilter]);

    // Helper to get results for a specific provider and sentiment
    const getResultsForProviderSentiment = (provider: string, sentiment: string): Result[] => {
      const isSearchedBrand = effectiveSentimentBrand === runStatus?.brand;
      return globallyFilteredResults.filter((r: Result) => {
        if (r.error) return false;
        if (r.provider !== provider) return false;

        // Apply citation filter if set
        if (sentimentProviderCitationFilter !== 'all') {
          if (!r.sources || r.sources.length === 0) return false;
          const hasCitationFromDomain = r.sources.some(
            (source) => source.url && extractDomain(source.url) === sentimentProviderCitationFilter
          );
          if (!hasCitationFromDomain) return false;
        }

        // Check sentiment match
        let resultSentiment: string;
        if (isSearchedBrand) {
          resultSentiment = r.brand_sentiment || 'not_mentioned';
        } else {
          resultSentiment = r.competitor_sentiments?.[effectiveSentimentBrand] || 'not_mentioned';
        }
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
        // Only update if the value is actually different to prevent re-renders
        if (hoveredSentimentBadge?.provider === provider && hoveredSentimentBadge?.sentiment === sentiment) {
          return; // Already hovered on this badge
        }
        setHoveredSentimentBadge({ provider, sentiment });
      }, [provider, sentiment]);

      const handleMouseLeave = useCallback(() => {
        setHoveredSentimentBadge(null);
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
              className={`absolute z-50 bg-white border border-gray-200 rounded-lg p-3 shadow-xl min-w-[300px] max-w-[380px] text-left ${
                popupPosition === 'top'
                  ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
                  : 'top-full mt-2 left-1/2 -translate-x-1/2'
              }`}
              style={{ maxHeight: '280px' }}
              onWheel={(e) => e.stopPropagation()}
            >
                <p className="text-xs font-medium text-gray-500 mb-2 pb-2 border-b border-gray-100">
                {matchingResults.length} {matchingResults.length === 1 ? 'response' : 'responses'} - Click to view details
              </p>
              <div className="overflow-y-auto space-y-0" style={{ maxHeight: '220px' }}>
                {matchingResults.map((result, idx) => {
                  const truncatedPrompt = result.prompt.length > 60
                    ? result.prompt.substring(0, 60) + '...'
                    : result.prompt;

                  // Calculate rank using same logic as All Answers chart
                  let rank = 0;
                  const brandLower = (runStatus?.brand || '').toLowerCase();
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
                        const bLower = b.toLowerCase();
                        if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
                        const bPos = rankingText.indexOf(bLower);
                        if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
                      }
                      rank = brandsBeforeCount + 1;
                    } else {
                      rank = allBrands.length + 1;
                    }
                  }

                  return (
                    <div
                      key={result.id}
                      className={`p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${idx > 0 ? 'mt-2' : ''}`}
                      onClick={() => {
                        setSelectedResult(result);
                        setHoveredSentimentBadge(null);
                      }}
                    >
                      <p className="text-sm font-medium text-gray-900 mb-1 leading-snug" title={result.prompt}>
                        {truncatedPrompt}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-600">
                          {rank === 0
                            ? 'Not shown'
                            : rank === 1
                              ? 'Shown as: #1 (Top result)'
                              : `Shown as: #${rank}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {getProviderLabel(result.provider)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    };

    // Calculate competitor sentiment comparison
    const competitorSentimentData = useMemo(() => {
      const competitorData: Record<string, {
        strong_endorsement: number;
        positive_endorsement: number;
        neutral_mention: number;
        conditional: number;
        negative_comparison: number;
        not_mentioned: number;
      }> = {};
      const trackedComps = trackedBrands;

      globallyFilteredResults
        .filter((r: Result) => !r.error && r.competitor_sentiments)
        .forEach((r: Result) => {
          if (r.competitor_sentiments) {
            Object.entries(r.competitor_sentiments).forEach(([comp, sentiment]) => {
              if (!trackedComps.has(comp)) return;
              if (!competitorData[comp]) {
                competitorData[comp] = {
                  strong_endorsement: 0,
                  positive_endorsement: 0,
                  neutral_mention: 0,
                  conditional: 0,
                  negative_comparison: 0,
                  not_mentioned: 0,
                };
              }
              if (sentiment in competitorData[comp]) {
                competitorData[comp][sentiment as keyof typeof competitorData[string]]++;
              }
            });
          }
        });

      return Object.entries(competitorData)
        .map(([competitor, counts]) => {
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          const mentionedTotal = total - counts.not_mentioned;
          const positiveTotal = counts.strong_endorsement + counts.positive_endorsement;
          return {
            competitor,
            strong_endorsement: counts.strong_endorsement,
            positive_endorsement: counts.positive_endorsement,
            neutral_mention: counts.neutral_mention,
            conditional: counts.conditional,
            negative_comparison: counts.negative_comparison,
            not_mentioned: counts.not_mentioned,
            total,
            mentionedTotal,
            strongRate: total > 0 ? (positiveTotal / total) * 100 : 0,
            positiveRate: mentionedTotal > 0 ? (positiveTotal / mentionedTotal) * 100 : 0,
          };
        })
        .sort((a, b) => b.strongRate - a.strongRate);
    }, [globallyFilteredResults, trackedBrands]);

    // Check if we have any sentiment data
    const hasSentimentData = globallyFilteredResults.some(
      (r: Result) => !r.error && r.brand_sentiment
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
        <div id="sentiment-distribution" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">How AI Describes {runStatus?.brand}</h3>
          <p className="text-sm text-gray-500 mb-6">Sentiment classification of how AI models mention your brand</p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6 items-start">
            {/* Sentiment Distribution */}
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-700">Overall Sentiment Distribution</h4>
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
                const neutralCount = brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0;
                const conditionalCount = brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0;
                const negativeCount = brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0;
                const notMentionedCount = brandSentimentData.find(d => d.sentiment === 'not_mentioned')?.count || 0;

                const strongRate = total > 0 ? (strongCount / total) * 100 : 0;
                const positiveRate = total > 0 ? ((strongCount + neutralCount) / total) * 100 : 0;
                const mentionRate = total > 0 ? ((total - notMentionedCount) / total) * 100 : 0;

                let insight = '';
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

                return <p className="text-sm text-gray-600">{insight}</p>;
              })()}
            </div>
          </div>
        </div>

        {/* Key Sentiment & Tone Insights */}
        {sentimentInsights.length > 0 && (
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
        {globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).length > 0 && (() => {
          // Get effective brand filter (default to searched brand)
          const effectiveBrand = sentimentByPromptBrandFilter || runStatus?.brand || '';

          // Build brand options for dropdown
          const brandOptions: { value: string; label: string }[] = [];
          if (runStatus?.brand) {
            brandOptions.push({ value: runStatus.brand, label: `${runStatus.brand} (searched)` });
          }
          const competitors = new Set<string>();
          globallyFilteredResults.forEach((r: Result) => {
            r.competitors_mentioned?.forEach(c => competitors.add(c));
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
              // Check if the selected brand is mentioned
              const isBrandMentioned = effectiveBrand === runStatus?.brand
                ? r.brand_mentioned
                : r.competitors_mentioned?.includes(effectiveBrand);

              if (isBrandMentioned) {
                mentioned++;

                // Get sentiment for the selected brand
                let sentiment: string | null | undefined;
                if (effectiveBrand === runStatus?.brand) {
                  sentiment = r.brand_sentiment;
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
                      Which questions lead to positive vs negative descriptions
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
                      value={sentimentByPromptBrandFilter || runStatus?.brand || ''}
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
                  <h2 className="text-lg font-semibold text-gray-900">Sentiment by Question</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Which questions lead to positive vs negative descriptions of {effectiveBrand}
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
                    value={sentimentByPromptBrandFilter || runStatus?.brand || ''}
                    onChange={(e) => setSentimentByPromptBrandFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    {brandOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Sentiment Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
                <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#047857' }} />
                  <span className="text-xs text-gray-500">Strong</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                  <span className="text-xs text-gray-500">Positive</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                  <span className="text-xs text-gray-500">Neutral</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                  <span className="text-xs text-gray-500">Conditional</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                  <span className="text-xs text-gray-500">Negative</span>
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
                      tickFormatter={(value) => ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'][Math.round(value)] || ''}
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      label={{ value: 'Average Sentiment', position: 'bottom', offset: 25, style: { fill: '#374151', fontSize: 14, fontWeight: 500 } }}
                    />
                    <YAxis
                      type="number"
                      dataKey="mentioned"
                      name="Mentions"
                      domain={[0, yMax]}
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
                          const sentimentLabels = ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'];
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm max-w-[300px]">
                              <p className="font-medium text-gray-900 mb-2 line-clamp-2">{data.prompt}</p>
                              <div className="space-y-1 text-gray-600">
                                <p>Sentiment: <span className="font-medium">{sentimentLabels[Math.round(data.avgSentimentScore)] || 'N/A'}</span></p>
                                <p>Mentions: <span className="font-medium">{data.mentioned}</span> of {data.total} responses</p>
                                <p>Visibility: <span className="font-medium">{data.visibilityScore.toFixed(0)}%</span></p>
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
        <div id="sentiment-by-platform" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-visible">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sentiment by AI Platform</h3>
              <p className="text-sm text-gray-500 mt-0.5">How each AI platform describes {effectiveSentimentBrand || 'your brand'}</p>
            </div>
            <div className="flex items-center gap-2">
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
              <select
                value={sentimentProviderBrandFilter || runStatus?.brand || ''}
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
                  <span><span className="font-semibold text-gray-900">{highEndorsers.length} of {totalProviders}</span> platforms endorse {effectiveSentimentBrand || 'your brand'}</span>
                )}
                {highEndorsers.length > 0 && lowEndorsers.length > 0 && <span className="mx-2 text-gray-300">·</span>}
                {lowEndorsers.length > 0 && (
                  <span><span className="font-semibold text-gray-900">{lowEndorsers.length}</span> {lowEndorsers.length === 1 ? 'platform has' : 'platforms have'} low endorsement</span>
                )}
                {highEndorsers.length === 0 && lowEndorsers.length === 0 && (
                  <span>Mixed sentiment across platforms</span>
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
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Endorsement Rate</span>
                    <div className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">% positive or strong</div>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Strong</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Positive</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Neutral</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Conditional</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Negative</span>
                  </th>
                  <th className="text-center py-2.5 px-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Not Mentioned</span>
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
        </div>

        {/* Competitor Sentiment Comparison */}
        {competitorSentimentData.length > 0 && (
          <div id="sentiment-competitor" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Competitor Sentiment Comparison</h3>
            <p className="text-sm text-gray-500 mb-6">How AI models describe competitors in the same responses</p>

            <div className="overflow-x-auto">
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
                      <div className="text-[10px] text-gray-400 font-normal">% positive or strong</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Add the brand first for comparison */}
                  <tr className="border-b border-gray-200 bg-gray-100/30">
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-gray-900">{runStatus?.brand} (Your Brand)</span>
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-900 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'positive_endorsement')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'positive_endorsement')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className="text-sm font-medium text-gray-900">
                        {brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.percentage.toFixed(0) || 0}%
                      </span>
                    </td>
                  </tr>
                  {competitorSentimentData.map((row) => (
                    <tr key={row.competitor} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-gray-900">{row.competitor}</span>
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.strong_endorsement > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-900 text-sm font-medium rounded-lg">
                            {row.strong_endorsement}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.positive_endorsement > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">
                            {row.positive_endorsement}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.neutral_mention > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 text-sm font-medium rounded-lg">
                            {row.neutral_mention}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.conditional > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-lg">
                            {row.conditional}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.negative_comparison > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-800 text-sm font-medium rounded-lg">
                            {row.negative_comparison}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`text-sm font-semibold ${row.strongRate >= 50 ? 'text-gray-600' : row.strongRate >= 25 ? 'text-gray-500' : 'text-gray-500'}`}>
                          {row.strongRate.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Individual Results with Sentiment */}
        <div id="sentiment-details" className="bg-white rounded-xl shadow-sm border border-gray-100">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sentiment Details</h3>
              <p className="text-sm text-gray-500 mt-0.5">How each AI response describes your brand</p>
            </div>
            <div className="flex items-center gap-3">
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
              .filter((r: Result) => !r.error && r.brand_sentiment)
              .filter((r: Result) => responseSentimentFilter === 'all' || r.brand_sentiment === responseSentimentFilter)
              .filter((r: Result) => responseLlmFilter === 'all' || r.provider === responseLlmFilter);

            return (
              <>
                <div className="px-6 py-3 border-b border-gray-100">
                  <p className="text-sm text-gray-500">
                    Showing {filteredSentimentResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).length} results
                  </p>
                </div>

                {/* Table */}
                <div className="overflow-x-auto min-h-0">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="w-[30%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Question</th>
                        <th className="w-[14%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                        <th className="w-[8%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                        <th className="w-[16%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Sentiment</th>
                        <th className="w-[22%] text-left py-2.5 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Competitors</th>
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
                        const brandLower = (runStatus?.brand || '').toLowerCase();
                        if (result.brand_mentioned && result.response_text) {
                          const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                            ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                            : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                          const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
                          const brandPos = rankingText.indexOf(brandLower);
                          if (brandPos >= 0) {
                            let brandsBeforeCount = 0;
                            for (const b of allBrands) {
                              const bLower = b.toLowerCase();
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

                        // Sentiment badge
                        const getSentimentBadge = () => {
                          const sentiment = result.brand_sentiment;
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
                        const competitors = result.competitors_mentioned || [];
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
                              {getPositionBadge()}
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
        </div>
      </div>
    );
};

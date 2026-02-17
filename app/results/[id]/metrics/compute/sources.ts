/**
 * Pure computation functions for Sources metrics.
 * Extracted from page.tsx and SourcesTab.tsx useMemo blocks.
 */

import type { Result, RunStatusResponse, Source } from '../../tabs/shared';
import {
  getDomain,
  getSentimentScore,
  getResultPosition,
  isCategoryName,
  categorizeDomain,
} from '../../tabs/shared';
import type {
  TopCitedSource,
  KeyInfluencer,
  SourcePositioningRow,
  SourcePositioningBrandOption,
  BrandWebsiteCitationsResult,
  BrandCitationRow,
  BrandPresenceData,
  SourceCategoryEntry,
  DomainTableRow,
  SourceBrandHeatmapData,
} from '../types';

// ---------------------------------------------------------------------------
// page.tsx: topCitedSources (line 2813)
// ---------------------------------------------------------------------------

export function computeTopCitedSources(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  sourcesProviderFilter: string,
  sourcesBrandFilter: string,
): TopCitedSource[] {
  if (!runStatus) return [];

  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error) return false;
    if (sourcesProviderFilter !== 'all' && r.provider !== sourcesProviderFilter) return false;
    return true;
  });

  const sourceData: Record<string, {
    domain: string;
    urlCounts: Map<string, { url: string; title: string; count: number; providers: Set<string> }>;
    count: number;
    providers: Set<string>;
    brands: Set<string>;
  }> = {};

  for (const result of results) {
    if (result.sources && result.sources.length > 0) {
      const resultBrands: string[] = [];
      if (result.brand_mentioned && runStatus.brand) {
        resultBrands.push(runStatus.brand);
      }
      const resultCompBrands = result.all_brands_mentioned?.length ? result.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus.brand || '').toLowerCase()) : result.competitors_mentioned || [];
      resultBrands.push(...resultCompBrands);

      const seenUrlsInResponse = new Set<string>();
      const uniqueSourcesInResponse = result.sources.filter((source: { url?: string }) => {
        if (!source.url || seenUrlsInResponse.has(source.url)) return false;
        seenUrlsInResponse.add(source.url);
        return true;
      });

      for (const source of uniqueSourcesInResponse) {
        if (!source.url) continue;
        const domain = getDomain(source.url);
        if (!sourceData[domain]) {
          sourceData[domain] = {
            domain,
            urlCounts: new Map(),
            count: 0,
            providers: new Set(),
            brands: new Set(),
          };
        }
        const existingUrl = sourceData[domain].urlCounts.get(source.url);
        if (existingUrl) {
          existingUrl.count += 1;
          existingUrl.providers.add(result.provider);
        } else {
          sourceData[domain].urlCounts.set(source.url, {
            url: source.url,
            title: source.title || source.url,
            count: 1,
            providers: new Set([result.provider]),
          });
        }
        sourceData[domain].count += 1;
        sourceData[domain].providers.add(result.provider);
        resultBrands.forEach(brand => sourceData[domain].brands.add(brand));
      }
    }
  }

  return Object.values(sourceData)
    .filter(s => {
      if (sourcesBrandFilter === 'all') return true;
      return s.brands.has(sourcesBrandFilter);
    })
    .map(s => {
      const urlDetails = Array.from(s.urlCounts.values())
        .map(u => ({
          url: u.url,
          title: u.title,
          count: u.count,
          providers: Array.from(u.providers),
        }))
        .sort((a, b) => b.count - a.count);
      return {
        domain: s.domain,
        url: urlDetails[0]?.url || '',
        urlDetails,
        count: s.count,
        providers: Array.from(s.providers),
        title: urlDetails[0]?.title || s.domain,
        brands: Array.from(s.brands),
      };
    })
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// page.tsx: hasAnySources (line 2905)
// ---------------------------------------------------------------------------

export function computeHasAnySources(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): boolean {
  if (!runStatus) return false;
  return globallyFilteredResults.some((r: Result) => !r.error && r.sources && r.sources.length > 0);
}

// ---------------------------------------------------------------------------
// page.tsx: keyInfluencers (line 2913)
// ---------------------------------------------------------------------------

export function computeKeyInfluencers(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): KeyInfluencer[] {
  if (!runStatus) return [];

  const results = globallyFilteredResults.filter((r: Result) => !r.error);

  const sourceData: Record<string, {
    domain: string;
    urlCounts: Map<string, { url: string; title: string; count: number }>;
    count: number;
    providers: Set<string>;
  }> = {};

  for (const result of results) {
    if (result.sources && result.sources.length > 0) {
      const seenUrlsInResponse = new Set<string>();
      const uniqueSourcesInResponse = result.sources.filter((source: { url?: string }) => {
        if (!source.url || seenUrlsInResponse.has(source.url)) return false;
        seenUrlsInResponse.add(source.url);
        return true;
      });

      for (const source of uniqueSourcesInResponse) {
        if (!source.url) continue;
        const domain = getDomain(source.url);
        if (!sourceData[domain]) {
          sourceData[domain] = {
            domain,
            urlCounts: new Map(),
            count: 0,
            providers: new Set(),
          };
        }
        const existingUrl = sourceData[domain].urlCounts.get(source.url);
        if (existingUrl) {
          existingUrl.count += 1;
        } else {
          sourceData[domain].urlCounts.set(source.url, {
            url: source.url,
            title: source.title || source.url,
            count: 1,
          });
        }
        sourceData[domain].count += 1;
        sourceData[domain].providers.add(result.provider);
      }
    }
  }

  return Object.values(sourceData)
    .filter(s => s.providers.size >= 2)
    .map(s => {
      const urlDetails = Array.from(s.urlCounts.values())
        .sort((a, b) => b.count - a.count);
      return {
        domain: s.domain,
        url: urlDetails[0]?.url || '',
        urlDetails,
        count: s.count,
        providers: Array.from(s.providers),
        title: urlDetails[0]?.title || s.domain,
      };
    })
    .sort((a, b) => {
      if (b.providers.length !== a.providers.length) {
        return b.providers.length - a.providers.length;
      }
      return b.count - a.count;
    })
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// page.tsx: sourcesInsights (line 2985)
// ---------------------------------------------------------------------------

export function computeSourcesInsights(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  topCitedSources: TopCitedSource[],
  keyInfluencers: KeyInfluencer[],
): string[] {
  if (!runStatus) return [];

  const formatDomainName = (domain: string) => {
    const names: Record<string, string> = {
      'youtube.com': 'YouTube',
      'youtu.be': 'YouTube',
      'reddit.com': 'Reddit',
      'wikipedia.org': 'Wikipedia',
      'en.wikipedia.org': 'Wikipedia',
      'linkedin.com': 'LinkedIn',
      'twitter.com': 'X (Twitter)',
      'x.com': 'X',
      'github.com': 'GitHub',
      'amazon.com': 'Amazon',
      'yelp.com': 'Yelp',
      'facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'tiktok.com': 'TikTok',
      'pinterest.com': 'Pinterest',
    };
    return names[domain] || domain;
  };

  const insights: string[] = [];
  const searchedBrand = runStatus.brand;

  // Get all results with sources
  const resultsWithSources = globallyFilteredResults.filter(
    (r: Result) => !r.error && r.sources && r.sources.length > 0
  );

  if (resultsWithSources.length === 0) return [];

  // 1. Top referenced source
  if (topCitedSources.length > 0) {
    const topSource = topCitedSources[0];
    insights.push(`${formatDomainName(topSource.domain)} is the most frequently referenced source (${topSource.count} references across ${topSource.providers.length} ${topSource.providers.length === 1 ? 'model' : 'models'})`);
  }

  // 2. Key influencer insight (sources used by multiple providers)
  if (keyInfluencers.length > 0) {
    insights.push(`${keyInfluencers.length} source${keyInfluencers.length === 1 ? '' : 's'} ${keyInfluencers.length === 1 ? 'is' : 'are'} used by multiple AI models, indicating high authority`);
  }

  // 3. Brand website usage
  const brandDomain = searchedBrand.toLowerCase().replace(/\s+/g, '');
  const brandCitations = topCitedSources.filter(s =>
    s.domain.toLowerCase().includes(brandDomain) || brandDomain.includes(s.domain.toLowerCase().replace('.com', '').replace('.org', ''))
  );
  if (brandCitations.length > 0) {
    const totalBrandCitations = brandCitations.reduce((sum, s) => sum + s.count, 0);
    insights.push(`${searchedBrand}'s website appears ${totalBrandCitations} time${totalBrandCitations === 1 ? '' : 's'} as a source in AI responses`);
  } else {
    insights.push(`${searchedBrand}'s website is not currently linked as a source by AI models — an opportunity for improvement`);
  }

  // 4. Source diversity
  const uniqueDomains = new Set(topCitedSources.map(s => s.domain));
  if (uniqueDomains.size > 5) {
    insights.push(`AI models draw from ${uniqueDomains.size} different sources, showing diverse information gathering`);
  }

  // 5. Provider with most sources
  const providerSourceCounts: Record<string, number> = {};
  resultsWithSources.forEach((r: Result) => {
    providerSourceCounts[r.provider] = (providerSourceCounts[r.provider] || 0) + (r.sources?.length || 0);
  });
  const topProvider = Object.entries(providerSourceCounts).sort((a, b) => b[1] - a[1])[0];
  if (topProvider) {
    const formatProviderName = (p: string) => {
      switch (p) {
        case 'openai': return 'GPT-4o';
        case 'anthropic': return 'Claude';
        case 'perplexity': return 'Perplexity';
        case 'ai_overviews': return 'Google AI Overviews';
        case 'gemini': return 'Gemini';
        case 'grok': return 'Grok';
        case 'llama': return 'Llama';
        default: return p;
      }
    };
    insights.push(`${formatProviderName(topProvider[0])} provides the most source references (${topProvider[1]} total)`);
  }

  return insights.slice(0, 5);
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: sourcePositioningData (line 116)
// ---------------------------------------------------------------------------

export function computeSourcePositioningData(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  sourcePositioningBrandFilter: string,
  excludedBrands: Set<string>,
  isCategory: boolean,
): SourcePositioningRow[] {
  if (!runStatus) return [];

  const selectedBrand = sourcePositioningBrandFilter === 'all' ? null : sourcePositioningBrandFilter;

  // Helper to extract domain from URL (local to this function)
  const extractDomain = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  // Get results with sources
  const resultsWithSources = globallyFilteredResults.filter(
    (r: Result) => !r.error && r.sources && r.sources.length > 0
  );

  if (resultsWithSources.length === 0) return [];

  // Aggregate data per domain
  const domainStats: Record<string, {
    domain: string;
    citationCount: number;
    providers: Set<string>;
    sentimentScores: number[];
    positions: number[];
    brandMentioned: number;
    totalCitations: number;
  }> = {};

  resultsWithSources.forEach((r: Result) => {
    // Check if this result mentions the selected brand (or any brand if all)
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    const brandMentioned = selectedBrand
      ? ((!isCategory && r.brand_mentioned && runStatus.brand === selectedBrand) ||
        rBrands.includes(selectedBrand))
      : isCategory
        ? (rBrands.length > 0)
        : (r.brand_mentioned || rBrands.length > 0);

    r.sources?.forEach((source) => {
      if (!source.url) return;
      const domain = extractDomain(source.url);

      if (!domainStats[domain]) {
        domainStats[domain] = {
          domain,
          citationCount: 0,
          providers: new Set(),
          sentimentScores: [],
          positions: [],
          brandMentioned: 0,
          totalCitations: 0,
        };
      }

      domainStats[domain].citationCount++;
      domainStats[domain].totalCitations++;
      domainStats[domain].providers.add(r.provider);

      // Track sentiment when brand is mentioned
      // Use source_brand_sentiments first (per-source per-brand), fall back to competitor_sentiments
      // Only include brands actually mentioned (skip not_mentioned / missing)
      if (brandMentioned) {
        domainStats[domain].brandMentioned++;

        if (selectedBrand) {
          // Specific brand selected — get sentiment for that brand at this source
          const perSourceSent = r.source_brand_sentiments?.[domain]?.[selectedBrand];
          const fallbackSent = (!isCategory && selectedBrand === runStatus.brand)
            ? r.brand_sentiment
            : r.competitor_sentiments?.[selectedBrand];
          const effectiveSent = (perSourceSent && perSourceSent !== 'not_mentioned')
            ? perSourceSent : fallbackSent;
          if (effectiveSent && effectiveSent !== 'not_mentioned') {
            const score = getSentimentScore(effectiveSent);
            if (score > 0) {
              domainStats[domain].sentimentScores.push(score);
            }
          }
        } else if (isCategory) {
          // "All Brands" filter: average per-brand sentiments only for brands in this result
          const rBrandsForSent = (r.all_brands_mentioned?.length
            ? r.all_brands_mentioned
            : r.competitors_mentioned || [])
            .filter(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b));
          const scores: number[] = [];
          rBrandsForSent.forEach(b => {
            const perSourceSent = r.source_brand_sentiments?.[domain]?.[b];
            const fallbackSent = r.competitor_sentiments?.[b];
            const effectiveSent = (perSourceSent && perSourceSent !== 'not_mentioned')
              ? perSourceSent : fallbackSent;
            if (effectiveSent && effectiveSent !== 'not_mentioned') {
              const s = getSentimentScore(effectiveSent);
              if (s > 0) scores.push(s);
            }
          });
          if (scores.length > 0) {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            domainStats[domain].sentimentScores.push(avg);
          }
        } else if (r.brand_sentiment && r.brand_sentiment !== 'not_mentioned') {
          const score = getSentimentScore(r.brand_sentiment);
          if (score > 0) {
            domainStats[domain].sentimentScores.push(score);
          }
        }

        // Get position using the helper function
        const position = getResultPosition(r, runStatus!);
        if (position && position > 0) {
          domainStats[domain].positions.push(position);
        }
      }
    });
  });

  // Calculate importance score and average sentiment for each domain
  const maxCitations = Math.max(...Object.values(domainStats).map(d => d.citationCount), 1);

  return Object.values(domainStats)
    .filter(d => d.citationCount >= 2) // Only show sources with at least 2 citations
    .map(d => {
      // Source Importance Score (0-100):
      // - 40% based on citation count (normalized)
      // - 30% based on provider diversity (cited by multiple models = more important)
      // - 30% based on brand mention rate when cited
      const citationScore = (d.citationCount / maxCitations) * 40;
      const providerDiversityScore = Math.min(d.providers.size / 4, 1) * 30; // Max out at 4 providers
      const brandMentionRate = d.totalCitations > 0 ? (d.brandMentioned / d.totalCitations) : 0;
      const brandMentionScore = brandMentionRate * 30;

      const importanceScore = citationScore + providerDiversityScore + brandMentionScore;

      // Average sentiment (default to 3/neutral if no sentiment data)
      const avgSentiment = d.sentimentScores.length > 0
        ? d.sentimentScores.reduce((a, b) => a + b, 0) / d.sentimentScores.length
        : 3;

      // Average position
      const avgPosition = d.positions.length > 0
        ? d.positions.reduce((a, b) => a + b, 0) / d.positions.length
        : null;

      return {
        domain: d.domain,
        citationCount: d.citationCount,
        providerCount: d.providers.size,
        providers: Array.from(d.providers),
        importanceScore: Math.round(importanceScore),
        avgSentiment: Math.round(avgSentiment * 10) / 10,
        avgPosition,
        brandMentionRate: Math.round(brandMentionRate * 100),
      };
    })
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .slice(0, 20); // Top 20 sources
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: sourcePositioningBrandOptions (line 269)
// ---------------------------------------------------------------------------

export function computeSourcePositioningBrandOptions(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  isIssue: boolean,
  isPublicFigure: boolean,
  isCategory: boolean,
): SourcePositioningBrandOption[] {
  if (!runStatus) return [];
  const options: { value: string; label: string }[] = [
    { value: 'all', label: isIssue ? 'All Issues' : isPublicFigure ? 'All Figures' : 'All Brands' }
  ];

  // Add searched brand/issue/figure (skip for category — it's the industry name, not a brand)
  if (runStatus.brand && !isCategory) {
    options.push({ value: runStatus.brand, label: `${runStatus.brand} (searched)` });
  }

  // Add competitors / related issues
  const competitors = new Set<string>();
  globallyFilteredResults.forEach((r: Result) => {
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    rBrands.forEach(comp => competitors.add(comp));
  });
  Array.from(competitors).sort().forEach(comp => {
    options.push({ value: comp, label: comp });
  });

  return options;
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: brandWebsiteCitations (line 294)
// ---------------------------------------------------------------------------

export function computeBrandWebsiteCitations(
  globallyFilteredResults: Result[],
  runStatusBrand: string | undefined,
  trackedBrands: Set<string>,
  brandCitationsBrandFilter: string,
  brandCitationsProviderFilter: string,
  isCategory: boolean,
): BrandWebsiteCitationsResult {
  const searchedBrand = runStatusBrand || '';
  // Filter out the searched brand from trackedBrands to avoid duplicates (trackedBrands stores lowercase)
  const competitorsOnly = Array.from(trackedBrands).filter(b => !isCategoryName(b, searchedBrand));
  const allBrandsToTrack = [...(isCategory ? [] : [runStatusBrand || '']), ...competitorsOnly].filter(Boolean);

  // Helper to extract domain from URL (local to this function)
  const extractDomain = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  // Structure to hold citation data per brand
  const brandCitationData: Record<string, {
    count: number;
    urls: { url: string; title: string; provider: string; count: number }[];
    providers: Set<string>;
    snippets: { provider: string; prompt: string; text: string }[];
    seenResultIds: Set<string>;
  }> = {};

  let totalResultsWithSources = 0;

  // Filter results by selected filters
  const filteredResults = globallyFilteredResults
    .filter((r: Result) => !r.error && r.sources && r.sources.length > 0)
    .filter((r: Result) => {
      if (brandCitationsProviderFilter !== 'all' && r.provider !== brandCitationsProviderFilter) return false;
      return true;
    });

  filteredResults.forEach((r: Result) => {
    totalResultsWithSources++;
    r.sources?.forEach((source) => {
      if (source.url) {
        const domain = extractDomain(source.url).toLowerCase();

        // Check each brand (including searched brand and competitors)
        allBrandsToTrack.forEach((brand) => {
          const brandDomainCheck = brand.toLowerCase().replace(/\s+/g, '');
          if (domain.includes(brandDomainCheck) || brandDomainCheck.includes(domain.replace('.com', '').replace('.org', '').replace('.net', ''))) {
            if (!brandCitationData[brand]) {
              brandCitationData[brand] = { count: 0, urls: [], providers: new Set(), snippets: [], seenResultIds: new Set() };
            }
            brandCitationData[brand].count++;
            brandCitationData[brand].providers.add(r.provider);

            // Track individual URLs
            const existingUrl = brandCitationData[brand].urls.find(u => u.url === source.url);
            if (existingUrl) {
              existingUrl.count++;
            } else {
              brandCitationData[brand].urls.push({
                url: source.url,
                title: source.title || '',
                provider: r.provider,
                count: 1
              });
            }

            // Extract response snippet mentioning the brand (once per result)
            if (r.response_text && !brandCitationData[brand].seenResultIds.has(r.id)) {
              brandCitationData[brand].seenResultIds.add(r.id);
              const plain = r.response_text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
              const sentences = plain.split(/(?<=[.!?])\s+/);
              const brandLower = brand.toLowerCase();
              for (let si = 0; si < sentences.length; si++) {
                if (sentences[si].toLowerCase().includes(brandLower)) {
                  const snippet = sentences[si] + (sentences[si + 1] ? ' ' + sentences[si + 1] : '');
                  const cleaned = snippet.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
                  if (cleaned.length > 20) {
                    brandCitationData[brand].snippets.push({
                      provider: r.provider,
                      prompt: r.prompt,
                      text: cleaned.length > 200 ? cleaned.substring(0, 200).replace(/\s\S*$/, '') + '...' : cleaned,
                    });
                    break;
                  }
                }
              }
            }
          }
        });
      }
    });
  });

  // Convert to array and sort
  const citationsArray: BrandCitationRow[] = Object.entries(brandCitationData)
    .map(([brand, data]) => ({
      brand,
      count: data.count,
      urls: data.urls.sort((a, b) => b.count - a.count),
      providers: Array.from(data.providers),
      snippets: data.snippets,
      rate: totalResultsWithSources > 0 ? (data.count / totalResultsWithSources) * 100 : 0,
      isSearchedBrand: !isCategory && brand === runStatusBrand
    }))
    .sort((a, b) => {
      // Searched brand first, then by count
      if (a.isSearchedBrand) return -1;
      if (b.isSearchedBrand) return 1;
      return b.count - a.count;
    });

  // Filter by brand filter (case-insensitive)
  const filteredCitations = brandCitationsBrandFilter === 'all'
    ? citationsArray
    : citationsArray.filter(c => c.brand.toLowerCase() === brandCitationsBrandFilter.toLowerCase());

  return {
    citations: filteredCitations,
    totalResultsWithSources,
    totalBrandsWithCitations: citationsArray.length
  };
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: brandPresenceData (line 406)
// ---------------------------------------------------------------------------

export function computeBrandPresenceData(
  brandWebsiteCitations: BrandWebsiteCitationsResult,
): BrandPresenceData {
  const searchedBrandData = brandWebsiteCitations.citations.find(c => c.isSearchedBrand);
  return {
    brandCitations: searchedBrandData?.count || 0,
    brandCitationRate: searchedBrandData?.rate || 0,
    totalResultsWithSources: brandWebsiteCitations.totalResultsWithSources,
    competitorCitations: brandWebsiteCitations.citations
      .filter(c => !c.isSearchedBrand)
      .map(c => ({ name: c.brand, count: c.count, rate: c.rate }))
  };
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: sourceCategoryData (line 813)
// ---------------------------------------------------------------------------

export function computeSourceCategoryData(
  topCitedSources: TopCitedSource[],
  categorizeDomainFn: (domain: string) => string,
): SourceCategoryEntry[] {
  const categoryCounts: Record<string, number> = {};

  topCitedSources.forEach((source) => {
    const category = categorizeDomainFn(source.domain);
    categoryCounts[category] = (categoryCounts[category] || 0) + source.count;
  });

  const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

  const rawData = Object.entries(categoryCounts)
    .map(([category, count]) => ({
      name: category,
      value: count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);

  // Show top 4 categories, group the rest as "Other"
  const top4 = rawData.slice(0, 4);
  const otherItems = rawData.slice(4);

  if (otherItems.length > 0) {
    const otherValue = otherItems.reduce((sum, item) => sum + item.value, 0);
    const otherPercentage = otherItems.reduce((sum, item) => sum + item.percentage, 0);
    top4.push({
      name: 'Other',
      value: otherValue,
      percentage: otherPercentage
    });
  }

  return top4;
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: domainTableData (line 849)
// ---------------------------------------------------------------------------

export function computeDomainTableData(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  categorizeDomainFn: (domain: string) => string,
  isCategory: boolean,
  excludedBrands: Set<string>,
): DomainTableRow[] {
  if (!runStatus) return [];

  const searchedBrand = runStatus.brand || '';

  // Get all results with sources for calculating percentages
  const resultsWithSources = globallyFilteredResults.filter(
    (r: Result) => !r.error && r.sources && r.sources.length > 0
  );
  const totalResponsesWithSources = resultsWithSources.length;

  // Track per-domain stats
  const domainStats: Record<string, {
    domain: string;
    responsesWithDomain: number;
    totalCitations: number;
    sentimentScores: number[];
    brands: Set<string>;
    providers: Set<string>;
    prompts: Set<string>;
  }> = {};

  // Process each result to collect domain stats
  resultsWithSources.forEach((r: Result) => {
    if (!r.sources) return;

    // Collect brands mentioned in this response (skip category name for industry reports)
    const brandsInResponse: string[] = [];
    if (!isCategory && r.brand_mentioned && searchedBrand) {
      brandsInResponse.push(searchedBrand);
    }
    const rBrands = (r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [])
      .filter(b => !isCategoryName(b, searchedBrand || '') && !excludedBrands.has(b));
    brandsInResponse.push(...rBrands);

    // Track unique domains per response
    const domainsInResponse = new Set<string>();

    r.sources.forEach((source: Source) => {
      if (!source.url) return;
      try {
        const hostname = new URL(source.url).hostname.replace(/^www\./, '');
        domainsInResponse.add(hostname);

        if (!domainStats[hostname]) {
          domainStats[hostname] = {
            domain: hostname,
            responsesWithDomain: 0,
            totalCitations: 0,
            sentimentScores: [],
            brands: new Set(),
            providers: new Set(),
            prompts: new Set(),
          };
        }
        domainStats[hostname].totalCitations += 1;
      } catch {
        // Skip invalid URLs
      }
    });

    // Count unique responses per domain, capture sentiment, track brands and providers
    domainsInResponse.forEach(domain => {
      domainStats[domain].responsesWithDomain += 1;
      // Add brands mentioned in this response to the domain's brand set
      brandsInResponse.forEach(brand => domainStats[domain].brands.add(brand));
      // Track which provider cited this domain
      domainStats[domain].providers.add(r.provider);
      // Track which prompt led to this citation
      if (r.prompt) domainStats[domain].prompts.add(r.prompt);
      // Use sentiment data (convert to numeric)
      if (isCategory) {
        // For industry reports, average competitor_sentiments (per-brand sentiments)
        if (r.competitor_sentiments) {
          Object.entries(r.competitor_sentiments).forEach(([brand, sentiment]) => {
            if (!sentiment || sentiment === 'not_mentioned') return;
            if (isCategoryName(brand, searchedBrand)) return;
            if (excludedBrands.has(brand)) return;
            const score = getSentimentScore(sentiment);
            if (score > 0) domainStats[domain].sentimentScores.push(score);
          });
        }
      } else if (r.brand_sentiment) {
        const sentimentScore = getSentimentScore(r.brand_sentiment);
        if (sentimentScore > 0) {
          domainStats[domain].sentimentScores.push(sentimentScore);
        }
      }
    });
  });

  // Convert to array with calculated metrics
  return Object.values(domainStats)
    .map(stat => {
      const usedPercent = totalResponsesWithSources > 0
        ? (stat.responsesWithDomain / totalResponsesWithSources) * 100
        : 0;
      const avgCitation = stat.responsesWithDomain > 0
        ? stat.totalCitations / stat.responsesWithDomain
        : 0;
      const avgSentiment = stat.sentimentScores.length > 0
        ? stat.sentimentScores.reduce((a, b) => a + b, 0) / stat.sentimentScores.length
        : null;

      // Sort brands: searched brand first, then others alphabetically
      const brandsArray = Array.from(stat.brands);
      const sortedBrands = brandsArray.sort((a, b) => {
        if (a === searchedBrand) return -1;
        if (b === searchedBrand) return 1;
        return a.localeCompare(b);
      });

      return {
        domain: stat.domain,
        usedPercent,
        avgCitation,
        category: categorizeDomainFn(stat.domain),
        avgSentiment,
        totalCitations: stat.totalCitations,
        responsesWithDomain: stat.responsesWithDomain,
        brands: sortedBrands,
        providers: Array.from(stat.providers),
        prompts: Array.from(stat.prompts),
      };
    })
    .sort((a, b) => b.usedPercent - a.usedPercent);
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: publisherPromptOptions (line 978)
// ---------------------------------------------------------------------------

export function computePublisherPromptOptions(
  domainTableData: DomainTableRow[],
): string[] {
  const prompts = new Set<string>();
  domainTableData.forEach(row => row.prompts.forEach(p => prompts.add(p)));
  return Array.from(prompts).sort();
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: publisherBrandOptions (line 985)
// ---------------------------------------------------------------------------

export function computePublisherBrandOptions(
  domainTableData: DomainTableRow[],
): string[] {
  const brands = new Set<string>();
  domainTableData.forEach(row => row.brands.forEach(b => brands.add(b)));
  return Array.from(brands).sort();
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: sortedDomainTableData (line 992)
// ---------------------------------------------------------------------------

export function computeSortedDomainTableData(
  domainTableData: DomainTableRow[],
  domainSortColumn: 'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment',
  domainSortDirection: 'asc' | 'desc',
  publisherPromptFilter: string,
  publisherBrandFilter: string,
): DomainTableRow[] {
  let filtered = publisherPromptFilter === 'all'
    ? domainTableData
    : domainTableData.filter(row => row.prompts.includes(publisherPromptFilter));
  if (publisherBrandFilter !== 'all') {
    filtered = filtered.filter(row => row.brands.includes(publisherBrandFilter));
  }
  return [...filtered].sort((a, b) => {
    let aVal: string | number | null;
    let bVal: string | number | null;

    switch (domainSortColumn) {
      case 'domain':
        aVal = a.domain.toLowerCase();
        bVal = b.domain.toLowerCase();
        break;
      case 'usedPercent':
        aVal = a.usedPercent;
        bVal = b.usedPercent;
        break;
      case 'avgCitation':
        aVal = a.avgCitation;
        bVal = b.avgCitation;
        break;
      case 'category':
        aVal = a.category.toLowerCase();
        bVal = b.category.toLowerCase();
        break;
      case 'avgSentiment':
        aVal = a.avgSentiment ?? -1;
        bVal = b.avgSentiment ?? -1;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return domainSortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return domainSortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: sourceBrandHeatmapData (line 1136)
// ---------------------------------------------------------------------------

export function computeSourceBrandHeatmapData(
  isCategory: boolean,
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  sourceBrandHeatmapProviderFilter: string,
  sourceBrandHeatmapSort: string,
  sourceBrandHeatmapView: 'citations' | 'sentiment',
  excludedBrands: Set<string>,
): SourceBrandHeatmapData {
  if (!isCategory || !runStatus) return { sources: [], brands: [], matrix: {} as Record<string, Record<string, number>>, sentimentMatrix: {} as Record<string, Record<string, { sum: number; count: number }>>, totals: { bySource: {} as Record<string, number>, byBrand: {} as Record<string, number>, grand: 0 } };

  const filteredResults = globallyFilteredResults.filter((r: Result) => {
    if (r.error || !r.sources || r.sources.length === 0) return false;
    if (sourceBrandHeatmapProviderFilter !== 'all' && r.provider !== sourceBrandHeatmapProviderFilter) return false;
    return true;
  });

  // Build source x brand matrix (citations) and sentiment matrix
  const matrix: Record<string, Record<string, number>> = {};
  const sentimentMatrix: Record<string, Record<string, { sum: number; count: number }>> = {};
  const sourceTotals: Record<string, number> = {};
  const brandTotals: Record<string, number> = {};
  const allBrands = new Set<string>();

  filteredResults.forEach((r: Result) => {
    const brands = (r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [])
      .filter(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b));
    const domains = new Set<string>();
    r.sources!.forEach(s => {
      if (s.url) {
        try {
          domains.add(new URL(s.url).hostname.replace(/^www\./, ''));
        } catch { /* skip bad urls */ }
      }
    });

    brands.forEach(brand => allBrands.add(brand));

    domains.forEach(domain => {
      if (!matrix[domain]) matrix[domain] = {};
      if (!sentimentMatrix[domain]) sentimentMatrix[domain] = {};
      brands.forEach(brand => {
        matrix[domain][brand] = (matrix[domain][brand] || 0) + 1;
        sourceTotals[domain] = (sourceTotals[domain] || 0) + 1;
        brandTotals[brand] = (brandTotals[brand] || 0) + 1;

        // Compute per-source-brand sentiment
        if (!sentimentMatrix[domain][brand]) sentimentMatrix[domain][brand] = { sum: 0, count: 0 };
        const perSourceSentiment = r.source_brand_sentiments?.[domain]?.[brand];
        const fallbackSentiment = r.competitor_sentiments?.[brand];
        const effectiveSentiment = (perSourceSentiment && perSourceSentiment !== 'not_mentioned')
          ? perSourceSentiment
          : fallbackSentiment;
        if (effectiveSentiment && effectiveSentiment !== 'not_mentioned') {
          const score = getSentimentScore(effectiveSentiment);
          if (score > 0) {
            sentimentMatrix[domain][brand].sum += score;
            sentimentMatrix[domain][brand].count += 1;
          }
        }
      });
    });
  });

  // Sort sources by total citations, take top 20
  const sortedSources = Object.keys(sourceTotals)
    .sort((a, b) => sourceTotals[b] - sourceTotals[a])
    .slice(0, 20);

  // Sort brands by total citations
  const sortedBrands = Array.from(allBrands)
    .sort((a, b) => (brandTotals[b] || 0) - (brandTotals[a] || 0));

  // Re-sort sources if sorting by a specific brand
  let finalSources = sortedSources;
  if (sourceBrandHeatmapSort !== 'total') {
    finalSources = [...sortedSources].sort((a, b) => {
      if (sourceBrandHeatmapView === 'sentiment') {
        const aAvg = sentimentMatrix[a]?.[sourceBrandHeatmapSort]?.count > 0
          ? sentimentMatrix[a][sourceBrandHeatmapSort].sum / sentimentMatrix[a][sourceBrandHeatmapSort].count : 0;
        const bAvg = sentimentMatrix[b]?.[sourceBrandHeatmapSort]?.count > 0
          ? sentimentMatrix[b][sourceBrandHeatmapSort].sum / sentimentMatrix[b][sourceBrandHeatmapSort].count : 0;
        return bAvg - aAvg;
      }
      const aVal = matrix[a]?.[sourceBrandHeatmapSort] || 0;
      const bVal = matrix[b]?.[sourceBrandHeatmapSort] || 0;
      return bVal - aVal;
    });
  }

  const grand = Object.values(sourceTotals).reduce((a, b) => a + b, 0);

  return {
    sources: finalSources,
    brands: sortedBrands,
    matrix,
    sentimentMatrix,
    totals: { bySource: sourceTotals, byBrand: brandTotals, grand },
  };
}

// ---------------------------------------------------------------------------
// SourcesTab.tsx: heatmapMaxValue (line 1230)
// ---------------------------------------------------------------------------

export function computeHeatmapMaxValue(
  sourceBrandHeatmapData: SourceBrandHeatmapData,
): number {
  let max = 0;
  for (const domain of sourceBrandHeatmapData.sources) {
    for (const brand of sourceBrandHeatmapData.brands) {
      const val = sourceBrandHeatmapData.matrix[domain]?.[brand] || 0;
      if (val > max) max = val;
    }
  }
  return max;
}

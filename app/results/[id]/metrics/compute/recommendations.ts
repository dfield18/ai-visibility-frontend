/**
 * Pure computation functions extracted from RecommendationsTab.tsx useMemo blocks.
 * No hooks, no state, no closures — only typed inputs and outputs.
 */

import type { Result, RunStatusResponse } from '../../tabs/shared';
import { getProviderLabel } from '../../tabs/shared';
import type {
  QuickWin,
  AdOpportunity,
  SourceOpportunity,
  ParsedRecommendation,
  PromptBreakdownRow,
  BrandBreakdownRow,
  LlmBreakdownRow,
} from '../types';
import { truncate } from '@/lib/utils';
import { correctBrandMetricsInText } from './textCorrections';

// ---------------------------------------------------------------------------
// quickWins  (RecommendationsTab.tsx line 219)
// ---------------------------------------------------------------------------

export function computeQuickWins(
  runStatus: RunStatusResponse | null,
  promptBreakdownStats: PromptBreakdownRow[],
  brandBreakdownStats: BrandBreakdownRow[],
  llmBreakdownStats: Record<string, LlmBreakdownRow>,
  globallyFilteredResults: Result[],
  isPublicFigure: boolean,
  isIssue: boolean = false,
): QuickWin[] {
  if (!runStatus) return [];

  const allWins: QuickWin[] = [];

  // Calculate global brand average visibility for relative comparisons
  const brandGlobalAvgRate = brandBreakdownStats.find(b => b.isSearchedBrand)?.visibilityScore || 0;

  // --- PROMPT GAPS ---
  // Eligibility: total responses >= 5, competitor avg >= 40%, brand visibility < 25%
  promptBreakdownStats.forEach(prompt => {
    const totalResponses = prompt.total;
    const brandVisibility = prompt.visibilityScore;

    // Calculate competitor average visibility for this prompt
    const competitorStats = brandBreakdownStats
      .filter(b => !b.isSearchedBrand)
      .map(b => {
        const promptStat = b.promptsWithStats.find((ps: any) => ps.prompt === prompt.prompt);
        return { brand: b.brand, rate: promptStat?.rate || 0 };
      })
      .filter(c => c.rate > 0);

    const competitorAvgVisibility = competitorStats.length > 0
      ? competitorStats.reduce((sum, c) => sum + c.rate, 0) / competitorStats.length
      : 0;

    const topCompetitors = competitorStats
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map(c => c.brand);

    // Eligibility filters
    if (totalResponses < 5) return;
    if (competitorAvgVisibility < 40) return;
    if (brandVisibility >= 25) return;

    // Severity classification
    const severity: 'critical' | 'high' | 'medium' =
      brandVisibility < 10 && competitorAvgVisibility > 60 ? 'critical' : 'high';

    // Scoring components (normalized to 0-1)
    const visibilityGapScore = (competitorAvgVisibility - brandVisibility) / 100;
    const competitorStrengthScore = competitorAvgVisibility / 100;
    const responseVolumeScore = Math.min(1, Math.log(totalResponses + 1) / Math.log(50));
    const confidenceScore = Math.min(1, totalResponses / 10);

    const quickWinScore = visibilityGapScore + competitorStrengthScore + responseVolumeScore + confidenceScore;

    allWins.push({
      type: 'prompt_gap',
      severity,
      title: `Expand visibility for "${truncate(prompt.prompt, 45)}"`,
      description: isPublicFigure
        ? `This figure appears in ${brandVisibility.toFixed(0)}% of responses vs similar figures at ${competitorAvgVisibility.toFixed(0)}%`
        : isIssue
        ? `This issue appears in ${brandVisibility.toFixed(0)}% of responses vs related issues at ${competitorAvgVisibility.toFixed(0)}%`
        : `Your brand appears in ${brandVisibility.toFixed(0)}% of responses vs competitors at ${competitorAvgVisibility.toFixed(0)}%`,
      competitors: topCompetitors,
      score: quickWinScore,
      metrics: {
        brandVisibility,
        competitorVisibility: competitorAvgVisibility,
        responseCount: totalResponses,
      },
    });
  });

  // --- PROVIDER GAPS ---
  // Calculate competitor averages per provider
  const providerCompetitorRates: Record<string, number[]> = {};
  globallyFilteredResults.forEach((r: Result) => {
    if (r.error) return;
    if (!providerCompetitorRates[r.provider]) {
      providerCompetitorRates[r.provider] = [];
    }
    const competitorMentionCount = r.all_brands_mentioned?.length || r.competitors_mentioned?.length || 0;
    if (competitorMentionCount > 0) {
      providerCompetitorRates[r.provider].push(1);
    } else {
      providerCompetitorRates[r.provider].push(0);
    }
  });

  Object.entries(llmBreakdownStats).forEach(([provider, stats]) => {
    const brandProviderRate = stats.rate * 100;
    const responseCount = stats.total;

    // Calculate competitor average rate for this provider
    const competitorRates = providerCompetitorRates[provider] || [];
    const competitorProviderAvgRate = competitorRates.length > 0
      ? (competitorRates.reduce((a, b) => a + b, 0) / competitorRates.length) * 100
      : 0;

    // Eligibility filters
    if (responseCount < 3) return;
    if (competitorProviderAvgRate < brandProviderRate + 15) return;

    // Severity classification
    const severity: 'critical' | 'high' | 'medium' = brandProviderRate < 15 ? 'high' : 'medium';

    // Scoring components
    const visibilityGapScore = (competitorProviderAvgRate - brandProviderRate) / 100;
    const competitorStrengthScore = competitorProviderAvgRate / 100;
    const responseVolumeScore = Math.min(1, Math.log(responseCount + 1) / Math.log(30));
    const confidenceScore = Math.min(1, responseCount / 8);

    const quickWinScore = visibilityGapScore + competitorStrengthScore + responseVolumeScore + confidenceScore;

    allWins.push({
      type: 'provider_gap',
      severity,
      title: `Improve visibility on ${getProviderLabel(provider)}`,
      description: isPublicFigure
        ? `This figure appears in ${brandProviderRate.toFixed(0)}% of responses vs similar figures at ${competitorProviderAvgRate.toFixed(0)}% across ${responseCount} answers`
        : isIssue
        ? `This issue appears in ${brandProviderRate.toFixed(0)}% of responses vs related issues at ${competitorProviderAvgRate.toFixed(0)}% across ${responseCount} answers`
        : `Your brand appears in ${brandProviderRate.toFixed(0)}% of responses vs competitors at ${competitorProviderAvgRate.toFixed(0)}% across ${responseCount} answers`,
      score: quickWinScore,
      metrics: {
        brandVisibility: brandProviderRate,
        competitorVisibility: competitorProviderAvgRate,
        responseCount,
      },
    });
  });

  // --- SOURCE GAPS ---
  const sourceData: Record<string, {
    brandMentions: number;
    competitors: string[];
    appearanceCount: number;
  }> = {};

  globallyFilteredResults.forEach((r: Result) => {
    if (!r.sources) return;
    r.sources.forEach(s => {
      try {
        const domain = s.url ? new URL(s.url).hostname.replace('www.', '') : '';
        if (!domain) return;

        if (!sourceData[domain]) {
          sourceData[domain] = { brandMentions: 0, competitors: [], appearanceCount: 0 };
        }

        sourceData[domain].appearanceCount++;

        if (r.brand_mentioned) {
          sourceData[domain].brandMentions++;
        }
        const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase()) : r.competitors_mentioned || [];
        rBrands.forEach(comp => {
          if (!sourceData[domain].competitors.includes(comp)) {
            sourceData[domain].competitors.push(comp);
          }
        });
      } catch {}
    });
  });

  Object.entries(sourceData).forEach(([domain, data]) => {
    // Eligibility filters: appears in >= 3 responses, cites >= 2 competitors, never cites brand
    if (data.appearanceCount < 3) return;
    if (data.competitors.length < 2) return;
    if (data.brandMentions > 0) return;

    // Scoring components
    const authorityScore = Math.min(1, Math.log(data.appearanceCount + 1) / Math.log(20));
    const competitorStrengthScore = Math.min(1, data.competitors.length / 5);
    const confidenceScore = Math.min(1, data.appearanceCount / 6);
    const visibilityGapScore = 0.5; // Fixed since brand has 0% on this source

    const quickWinScore = visibilityGapScore + competitorStrengthScore + authorityScore + confidenceScore;

    allWins.push({
      type: 'source_gap',
      severity: data.competitors.length >= 4 ? 'high' : 'medium',
      title: `Target coverage from ${domain}`,
      description: isPublicFigure
        ? `This source frequently cites ${data.competitors.length} similar figures but has never mentioned this figure`
        : isIssue
        ? `This source frequently cites ${data.competitors.length} related issues but has never mentioned this issue`
        : `This source frequently cites ${data.competitors.length} competitors but has never mentioned your brand`,
      competitors: data.competitors.slice(0, 4),
      score: quickWinScore,
      metrics: {
        brandVisibility: 0,
        competitorVisibility: (data.competitors.length / 5) * 100,
        responseCount: data.appearanceCount,
      },
    });
  });

  // Sort all wins by score and return top 5
  return allWins
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// adOpportunities  (RecommendationsTab.tsx line 427)
// ---------------------------------------------------------------------------

export function computeAdOpportunities(
  runStatus: RunStatusResponse | null,
  promptBreakdownStats: PromptBreakdownRow[],
  brandBreakdownStats: BrandBreakdownRow[],
): AdOpportunity[] {
  if (!runStatus) return [];

  return promptBreakdownStats
    .filter(p => p.visibilityScore < 40)
    .map(prompt => {
      const competitorVisibility = brandBreakdownStats
        .filter(b => !b.isSearchedBrand)
        .reduce((sum, b) => {
          const promptStat = b.promptsWithStats.find((ps: any) => ps.prompt === prompt.prompt);
          return sum + (promptStat?.rate || 0);
        }, 0) / Math.max(brandBreakdownStats.filter(b => !b.isSearchedBrand).length, 1);

      return {
        prompt: prompt.prompt,
        yourVisibility: prompt.visibilityScore,
        competitorAvg: competitorVisibility,
        gap: competitorVisibility - prompt.visibilityScore,
      };
    })
    .filter(p => p.gap > 20)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// sourceOpportunities  (RecommendationsTab.tsx line 453)
// ---------------------------------------------------------------------------

export function computeSourceOpportunities(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): SourceOpportunity[] {
  if (!runStatus) return [];

  const sourceMentions: Record<string, { brand: number; competitors: string[] }> = {};

  globallyFilteredResults.forEach((r: Result) => {
    if (!r.sources) return;
    r.sources.forEach(s => {
      try {
        const domain = s.url ? new URL(s.url).hostname.replace('www.', '') : '';
        if (!domain) return;

        if (!sourceMentions[domain]) {
          sourceMentions[domain] = { brand: 0, competitors: [] };
        }

        if (r.brand_mentioned) {
          sourceMentions[domain].brand++;
        }
        const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase()) : r.competitors_mentioned || [];
        rBrands.forEach(comp => {
          if (!sourceMentions[domain].competitors.includes(comp)) {
            sourceMentions[domain].competitors.push(comp);
          }
        });
      } catch {}
    });
  });

  return Object.entries(sourceMentions)
    .filter(([_, data]) => data.brand === 0 && data.competitors.length >= 2)
    .map(([domain, data]) => ({
      domain,
      competitorCount: data.competitors.length,
      competitors: data.competitors.slice(0, 4),
    }))
    .sort((a, b) => b.competitorCount - a.competitorCount)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// parsedAiRecommendations  (RecommendationsTab.tsx line 494)
// ---------------------------------------------------------------------------

export function computeParsedAiRecommendations(
  aiRecommendations: string | Array<{ title: string; description: string; tactics?: string[] }> | undefined,
  isCategory: boolean,
  brandBreakdownStats: BrandBreakdownRow[] = [],
): ParsedRecommendation[] {
  if (!aiRecommendations) return [];

  const recs: ParsedRecommendation[] = [];

  // Helper to estimate effort based on keywords - returns level and reason
  const estimateEffort = (text: string): { level: 'high' | 'medium' | 'low'; reason: string } => {
    const lowText = text.toLowerCase();
    // High effort indicators
    if (lowText.includes('partnership') || lowText.includes('outreach') || lowText.includes('pr campaign') ||
        lowText.includes('media coverage') || lowText.includes('influencer') || lowText.includes('backlink') ||
        lowText.includes('get featured') || lowText.includes('earn coverage') || lowText.includes('build relationship')) {
      return { level: 'high', reason: 'Requires partnerships, outreach, or external relationships' };
    }
    // Low effort indicators
    if (lowText.includes('update') || lowText.includes('add') || lowText.includes('include') ||
        lowText.includes('optimize') || lowText.includes('improve') || lowText.includes('tweak') ||
        lowText.includes('ensure') || lowText.includes('check') || lowText.includes('review')) {
      return { level: 'low', reason: 'Simple content updates or optimizations' };
    }
    return { level: 'medium', reason: 'Moderate implementation effort required' };
  };

  // Helper to estimate impact based on keywords - returns level and reason
  const estimateImpact = (text: string): { level: 'high' | 'medium' | 'low'; reason: string } => {
    const lowText = text.toLowerCase();
    // High impact indicators
    if (lowText.includes('significantly') || lowText.includes('major') || lowText.includes('critical') ||
        lowText.includes('key') || lowText.includes('primary') || lowText.includes('essential') ||
        lowText.includes('visibility') || lowText.includes('ranking') || lowText.includes('authority') ||
        lowText.includes('competitor') || lowText.includes('differentiate')) {
      return { level: 'high', reason: 'Directly affects visibility, rankings, or competitive positioning' };
    }
    // Low impact indicators
    if (lowText.includes('minor') || lowText.includes('small') || lowText.includes('slight') ||
        lowText.includes('optional') || lowText.includes('consider')) {
      return { level: 'low', reason: 'Minor or optional improvement' };
    }
    return { level: 'medium', reason: 'Moderate impact on AI visibility' };
  };

  // Helper to extract tactics from recommendation text
  const extractTactics = (text: string, title: string): string[] => {
    const tactics: string[] = [];

    // Remove the title from the text to avoid duplication
    let content = text.replace(title, '').trim();

    // Look for bullet points (-, *, •) or numbered sub-items
    const bulletMatches = content.match(/(?:^|\n)\s*[-*•]\s*([^\n]+)/g);
    if (bulletMatches && bulletMatches.length > 0) {
      bulletMatches.forEach(match => {
        const tactic = match.replace(/^\s*[-*•]\s*/, '').trim();
        if (tactic.length > 10 && tactic.length < 150) {
          tactics.push(tactic.replace(/[*_]/g, ''));
        }
      });
    }

    // If no bullets found, try to extract actionable sentences
    if (tactics.length === 0) {
      // Split on sentence-ending punctuation but NOT on decimal points (e.g. "58.3%")
      const sentences = content.split(/(?<!\d)\.(?!\d)|[!?]+/).filter(s => s.trim().length > 15);
      sentences.slice(0, 3).forEach(sentence => {
        const cleaned = sentence.trim().replace(/[*_]/g, '');
        if (cleaned.length > 10 && cleaned.length < 150) {
          tactics.push(cleaned);
        }
      });
    }

    return tactics.slice(0, 4); // Limit to 4 tactics per recommendation
  };

  const recsContent = aiRecommendations;

  if (typeof recsContent === 'string') {
    // Parse markdown text - split by numbered items, bullet points, or double newlines
    const paragraphs = recsContent
      .split(/(?:\n\n|\n(?=\d+\.|\*|\-))/)
      .map(p => p.trim())
      .filter(p => p.length > 20); // Filter out very short fragments

    paragraphs.forEach(para => {
      // Extract title (first sentence or bolded text)
      const boldMatch = para.match(/\*\*([^*]+)\*\*/);
      const numberMatch = para.match(/^\d+\.\s*\*?\*?([^*\n.!?]+)/);

      let title = '';
      let description = para;

      if (boldMatch) {
        title = boldMatch[1].replace(/[.:]/g, '').trim();
        description = para.replace(/\*\*[^*]+\*\*:?\s*/, '').trim();
      } else if (numberMatch) {
        title = numberMatch[1].trim();
        description = para.replace(/^\d+\.\s*/, '').trim();
      } else {
        // Use first sentence as title
        const firstSentence = para.match(/^[^.!?]+[.!?]/);
        if (firstSentence) {
          title = firstSentence[0].replace(/[.!?]$/, '').trim();
          description = para.substring(firstSentence[0].length).trim();
        } else {
          title = para.substring(0, 50) + (para.length > 50 ? '...' : '');
          description = para;
        }
      }

      // Clean up markdown formatting
      title = title.replace(/[*_#]/g, '').trim();
      description = description.replace(/[*_#]/g, '').trim();

      if (title && title.length > 5) {
        const impactResult = estimateImpact(para);
        const effortResult = estimateEffort(para);
        const tactics = extractTactics(para, title);
        recs.push({
          title,
          description,
          impact: impactResult.level,
          effort: effortResult.level,
          impactReason: impactResult.reason,
          effortReason: effortResult.reason,
          tactics,
        });
      }
    });
  } else if (Array.isArray(recsContent)) {
    // Handle array format
    (recsContent as Array<{ title: string; description: string; tactics?: string[] }>).forEach(rec => {
      const fullText = `${rec.title} ${rec.description} ${rec.tactics?.join(' ') || ''}`;
      const impactResult = estimateImpact(fullText);
      const effortResult = estimateEffort(fullText);
      recs.push({
        title: rec.title,
        description: rec.description,
        impact: impactResult.level,
        effort: effortResult.level,
        impactReason: impactResult.reason,
        effortReason: effortResult.reason,
        tactics: rec.tactics || [],
      });
    });
  }

  const sliced = recs.slice(0, isCategory ? 8 : 6);

  // Apply metric corrections AFTER parsing so decimal percentages (e.g. "75.0%")
  // don't break the title/sentence parser which splits on periods.
  if (isCategory && brandBreakdownStats.length > 0) {
    for (const rec of sliced) {
      rec.title = correctBrandMetricsInText(rec.title, brandBreakdownStats);
      rec.description = correctBrandMetricsInText(rec.description, brandBreakdownStats);
      rec.tactics = rec.tactics.map(t => correctBrandMetricsInText(t, brandBreakdownStats));
    }
  }

  return sliced;
}

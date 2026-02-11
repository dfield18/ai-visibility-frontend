'use client';

import React, { useMemo } from 'react';
import {
  Sparkles,
  Globe,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronRight,
  FileText,
  Download,
  Link2,
} from 'lucide-react';
import { useSiteAudits } from '@/hooks/useApi';
import { truncate, getSessionId } from '@/lib/utils';
import {
  type Result,
  type RunStatusResponse,
  type AISummaryResponse,
  type TabType,
  getProviderLabel,
} from './shared';

export interface RecommendationsTabProps {
  runStatus: RunStatusResponse | null;
  aiSummary: AISummaryResponse | undefined;
  isSummaryLoading: boolean;
  globallyFilteredResults: Result[];
  promptBreakdownStats: any[];
  brandBreakdownStats: any[];
  llmBreakdownStats: Record<string, any>;
  setActiveTab: (tab: TabType) => void;
  copied: boolean;
  handleCopyLink: () => void;
  handleExportRecommendationsPDF: (recommendations: any[]) => void;
  handleExportRecommendationsCSV: (recommendations: any[]) => void;
}

export function RecommendationsTab(props: RecommendationsTabProps) {
  const {
    runStatus,
    aiSummary,
    isSummaryLoading,
    globallyFilteredResults,
    promptBreakdownStats,
    brandBreakdownStats,
    llmBreakdownStats,
    setActiveTab,
    copied,
    handleCopyLink,
    handleExportRecommendationsPDF,
    handleExportRecommendationsCSV,
  } = props;

  // Fetch site audits for this session
  const sessionId = getSessionId();
  const { data: siteAuditsData } = useSiteAudits(sessionId);
  const siteAudits = siteAuditsData?.audits || [];

  // Find the most recent completed audit, preferring one that matches the current run's brand
  const latestAudit = useMemo(() => {
    const completed = siteAudits.filter(a => a.status === 'complete' && a.overall_score != null);
    if (completed.length === 0) return null;
    // Sort by created_at descending
    const sorted = completed.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    // Prefer an audit whose URL contains the current run's brand name
    if (runStatus?.brand) {
      const brandLower = runStatus.brand.toLowerCase().replace(/\s+/g, '');
      const brandMatch = sorted.find(a => {
        try {
          const hostname = new URL(a.url).hostname.toLowerCase().replace(/^www\./, '');
          return hostname.includes(brandLower) || brandLower.includes(hostname.split('.')[0]);
        } catch {
          return a.url.toLowerCase().includes(brandLower);
        }
      });
      if (brandMatch) return brandMatch;
    }
    return sorted[0];
  }, [siteAudits, runStatus?.brand]);

  // Calculate high-impact actions with unified scoring system
  const quickWins = useMemo(() => {
    if (!runStatus) return [];

    interface QuickWin {
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
          const promptStat = b.promptsWithStats.find(ps => ps.prompt === prompt.prompt);
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
        description: `Your brand appears in ${brandVisibility.toFixed(0)}% of responses vs competitors at ${competitorAvgVisibility.toFixed(0)}%`,
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
      const competitorMentionCount = r.competitors_mentioned?.length || 0;
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
        description: `Your brand appears in ${brandProviderRate.toFixed(0)}% of responses vs competitors at ${competitorProviderAvgRate.toFixed(0)}% across ${responseCount} answers`,
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
          if (r.competitors_mentioned) {
            r.competitors_mentioned.forEach(comp => {
              if (!sourceData[domain].competitors.includes(comp)) {
                sourceData[domain].competitors.push(comp);
              }
            });
          }
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
        description: `This source frequently cites ${data.competitors.length} competitors but has never mentioned your brand`,
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
  }, [runStatus, promptBreakdownStats, brandBreakdownStats, llmBreakdownStats, globallyFilteredResults]);

  // Calculate ChatGPT ad opportunities - prompts with low visibility but high competitor presence
  const adOpportunities = useMemo(() => {
    if (!runStatus) return [];

    return promptBreakdownStats
      .filter(p => p.visibilityScore < 40)
      .map(prompt => {
        const competitorVisibility = brandBreakdownStats
          .filter(b => !b.isSearchedBrand)
          .reduce((sum, b) => {
            const promptStat = b.promptsWithStats.find(ps => ps.prompt === prompt.prompt);
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
  }, [runStatus, promptBreakdownStats, brandBreakdownStats]);

  // Calculate source opportunities
  const sourceOpportunities = useMemo(() => {
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
          if (r.competitors_mentioned) {
            r.competitors_mentioned.forEach(comp => {
              if (!sourceMentions[domain].competitors.includes(comp)) {
                sourceMentions[domain].competitors.push(comp);
              }
            });
          }
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
  }, [runStatus, globallyFilteredResults]);

  // Parse AI recommendations and assign effort/impact based on keywords
  const parsedAiRecommendations = useMemo(() => {
    if (!aiSummary?.recommendations) return [];

    const recs: Array<{
      title: string;
      description: string;
      impact: 'high' | 'medium' | 'low';
      effort: 'high' | 'medium' | 'low';
      impactReason: string;
      effortReason: string;
      tactics: string[];
    }> = [];

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
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 15);
        sentences.slice(0, 3).forEach(sentence => {
          const cleaned = sentence.trim().replace(/[*_]/g, '');
          if (cleaned.length > 10 && cleaned.length < 150) {
            tactics.push(cleaned);
          }
        });
      }

      return tactics.slice(0, 4); // Limit to 4 tactics per recommendation
    };

    const recsContent = aiSummary.recommendations;

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
        description = description.replace(/[*_#]/g, '').substring(0, 150);
        if (description.length === 150) description += '...';

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
      (recsContent as Array<{title: string; description: string; tactics?: string[]}>).forEach(rec => {
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

    return recs.slice(0, 6); // Limit to 6 items for the chart
  }, [aiSummary?.recommendations]);

  const getImpactBadge = (impact: 'high' | 'medium' | 'low') => {
    const colors = {
      high: 'bg-gray-100 text-gray-900 border-gray-200',
      medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      low: 'bg-gray-100 text-gray-600 border-gray-200',
    };
    return colors[impact];
  };

  const getEffortBadge = (effort: 'high' | 'medium' | 'low') => {
    const colors = {
      high: 'bg-red-50 text-red-600 border-red-200',
      medium: 'bg-orange-50 text-orange-600 border-orange-200',
      low: 'bg-blue-50 text-blue-600 border-blue-200',
    };
    return colors[effort];
  };

  // Show loading state while AI summary is being generated
  if (isSummaryLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-gray-900" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AI-Powered Recommendations</h2>
              <p className="text-sm text-gray-500">Generating personalized strategy...</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-8">
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
              <p className="text-sm text-gray-500">Analyzing your visibility data and generating recommendations...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI-Powered Recommendations - combined section with chart + cards */}
      {aiSummary?.recommendations && parsedAiRecommendations.length > 0 && (
      <div id="recommendations-ai" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">

        {/* Effort vs Impact Matrix Chart */}
        {parsedAiRecommendations.length > 0 && (() => {
          // Calculate positions and handle overlapping circles
          const effortMap = { low: 16.67, medium: 50, high: 83.33 };
          const impactMap = { low: 83.33, medium: 50, high: 16.67 };

          // Group items by position to detect overlaps
          const positionGroups: Record<string, number[]> = {};
          parsedAiRecommendations.forEach((rec, idx) => {
            const key = `${rec.effort}-${rec.impact}`;
            if (!positionGroups[key]) positionGroups[key] = [];
            positionGroups[key].push(idx);
          });

          // Calculate offset for each item - stack vertically when overlapping
          const getOffset = (idx: number, rec: typeof parsedAiRecommendations[0]) => {
            const key = `${rec.effort}-${rec.impact}`;
            const group = positionGroups[key];
            const posInGroup = group.indexOf(idx);
            const total = group.length;
            if (total === 1) return { x: 0, y: 0 };
            // Stack items vertically with 28px spacing to prevent label overlap
            const verticalSpacing = 28;
            const totalHeight = (total - 1) * verticalSpacing;
            const startY = -totalHeight / 2;
            return { x: 0, y: startY + posInGroup * verticalSpacing };
          };

          return (
          <div className="mb-6">
            {/* Chart Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-gray-900" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Effort vs Impact Matrix</h2>
                <p className="text-sm text-gray-500">Prioritize recommendations by their expected impact and implementation effort</p>
              </div>
            </div>
            <div className="relative bg-white rounded-lg p-4">
              {/* Chart container */}
              <div className="ml-8">
                {/* Y-axis labels */}
                <div className="flex">
                  {/* Y-axis label (rotated) - positioned to align with grid center */}
                  <div className="relative w-6 flex items-center justify-center" style={{ height: '315px' }}>
                    <span className="-rotate-90 text-base font-semibold text-gray-600 whitespace-nowrap">
                      Impact
                    </span>
                  </div>
                  <div className="w-12 flex flex-col justify-between text-right pr-2 text-sm text-gray-400" style={{ height: '315px' }}>
                    <span>High</span>
                    <span>Med</span>
                    <span>Low</span>
                  </div>

                  {/* Grid */}
                  <div className="flex-1 relative" style={{ height: '315px' }}>
                    {/* Background grid - simplified */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {/* Quick Wins quadrant (top-left) - label in top-left corner */}
                      <div className="bg-[#E8F5E9] border border-gray-100 relative">
                        <span className="absolute top-1.5 left-1.5 text-xs text-gray-900 font-medium opacity-70">Quick Wins</span>
                      </div>
                      <div className="bg-[#E8F5E9]/50 border border-gray-100" />
                      {/* Major Projects quadrant (top-right) - label in top-right corner */}
                      <div className="bg-amber-50/70 border border-gray-100 relative">
                        <span className="absolute top-1.5 right-1.5 text-xs text-amber-600 font-medium opacity-70">Major Projects</span>
                      </div>
                      <div className="bg-gray-50 border border-gray-100" />
                      <div className="bg-gray-50 border border-gray-100" />
                      <div className="bg-gray-50 border border-gray-100" />
                      {/* Low Priority quadrant (bottom-left) - label in bottom-left corner */}
                      <div className="bg-blue-50/50 border border-gray-100 relative">
                        <span className="absolute bottom-1.5 left-1.5 text-xs text-blue-500 font-medium opacity-70">Low Priority</span>
                      </div>
                      <div className="bg-gray-50/50 border border-gray-100" />
                      {/* Avoid quadrant (bottom-right) - label in bottom-right corner */}
                      <div className="bg-red-50/50 border border-gray-100 relative">
                        <span className="absolute bottom-1.5 right-1.5 text-xs text-red-400 font-medium opacity-70">Avoid</span>
                      </div>
                    </div>

                    {/* Plot points with labels */}
                    {parsedAiRecommendations.map((rec, idx) => {
                      const x = effortMap[rec.effort];
                      const y = impactMap[rec.impact];
                      const offset = getOffset(idx, rec);

                      // Build detailed tooltip
                      const quadrantName =
                        rec.impact === 'high' && rec.effort === 'low' ? 'Quick Win' :
                        rec.impact === 'high' && rec.effort === 'high' ? 'Major Project' :
                        rec.impact === 'low' && rec.effort === 'low' ? 'Low Priority' :
                        rec.impact === 'low' && rec.effort === 'high' ? 'Avoid' : 'Consider';

                      const tooltip = `${rec.title}

${quadrantName.toUpperCase()}

Impact: ${rec.impact.charAt(0).toUpperCase() + rec.impact.slice(1)}
↳ ${rec.impactReason}

Effort: ${rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}
↳ ${rec.effortReason}`;

                      return (
                        <div
                          key={idx}
                          className="absolute cursor-default group"
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                            zIndex: 10 + idx
                          }}
                          title={tooltip}
                        >
                          {/* Dot with label */}
                          <div className="flex items-center gap-1.5 relative">
                            <div className="w-3 h-3 bg-gray-900 rounded-full shadow-sm border border-white flex-shrink-0 group-hover:scale-125 transition-transform duration-150" />
                            <span className="text-xs font-medium text-gray-700 bg-white/90 px-1.5 py-0.5 rounded shadow-sm overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px] group-hover:max-w-none group-hover:bg-gray-900 group-hover:text-white transition-all duration-150">
                              {rec.title}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* X-axis labels */}
                <div className="flex mt-2">
                  <div className="w-[72px]" /> {/* Spacer to align with grid (w-6 Impact label + w-12 Y-axis values) */}
                  <div className="flex-1 grid grid-cols-3 text-center text-sm text-gray-400">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                </div>

                {/* X-axis label */}
                <div className="flex mt-1">
                  <div className="w-[72px]" />
                  <div className="flex-1 text-center text-base font-semibold text-gray-600">
                    Effort
                  </div>
                </div>
              </div>

            </div>
          </div>
          );
        })()}

        {/* Recommendation Cards */}
        {parsedAiRecommendations.length > 0 && (
          <div className="space-y-3 mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-gray-900" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI-Powered Recommendations</h2>
                <p className="text-sm text-gray-500">Personalized strategy based on your visibility analysis</p>
              </div>
            </div>
            {parsedAiRecommendations.map((rec, idx) => {
              const quadrantName =
                rec.impact === 'high' && rec.effort === 'low' ? 'Quick Win' :
                rec.impact === 'high' && rec.effort === 'high' ? 'Major Project' :
                rec.impact === 'low' && rec.effort === 'low' ? 'Low Priority' :
                rec.impact === 'low' && rec.effort === 'high' ? 'Avoid' : 'Consider';

              const impactColor: Record<string, string> = {
                high: 'text-emerald-700',
                medium: 'text-amber-600',
                low: 'text-gray-500',
              };

              const effortColor: Record<string, string> = {
                low: 'text-emerald-700',
                medium: 'text-amber-600',
                high: 'text-red-600',
              };

              const categoryColor: Record<string, string> = {
                'Quick Win': 'text-gray-700',
                'Major Project': 'text-amber-700',
                'Low Priority': 'text-blue-700',
                'Avoid': 'text-red-700',
                'Consider': 'text-gray-700',
              };

              return (
                <div
                  key={idx}
                  className={`rounded-xl border border-gray-100 p-4 hover:shadow-sm transition ${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}`}
                >
                  {/* Title row with number badge and badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white text-xs font-medium">{idx + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{rec.title}</h3>
                        {rec.description && (
                          <p className="text-xs text-gray-500 mt-1">{rec.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span
                        className={`text-xs font-medium ${impactColor[rec.impact] || 'text-gray-500'}`}
                        title={rec.impactReason ? `Impact: ${rec.impactReason}` : undefined}
                      >
                        {rec.impact.charAt(0).toUpperCase() + rec.impact.slice(1)} Impact
                      </span>
                      <span
                        className={`text-xs font-medium ${effortColor[rec.effort] || 'text-gray-500'}`}
                        title={rec.effortReason ? `Effort: ${rec.effortReason}` : undefined}
                      >
                        {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)} Effort
                      </span>
                      <span className={`text-xs font-medium ${categoryColor[quadrantName] || 'text-gray-700'}`}>
                        {quadrantName}
                      </span>
                    </div>
                  </div>

                  {/* Tactics checklist */}
                  {rec.tactics && rec.tactics.length > 0 && (
                    <div className="mt-3 ml-9 space-y-1.5">
                      {rec.tactics.map((tactic, tidx) => (
                        <div key={tidx} className="flex items-start gap-2 text-xs text-gray-600">
                          <span className="text-gray-400 mt-0.5 flex-shrink-0">•</span>
                          <span>{tactic}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Site Audit Insights */}
      <div id="recommendations-llm" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Globe className="w-5 h-5 text-gray-900" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Website AI Optimization</h2>
            <p className="text-sm text-gray-500">Technical factors affecting your AI visibility</p>
          </div>
        </div>

        {latestAudit ? (
          <div className="space-y-4">
            {/* Audit Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-gray-500">Latest audit for</p>
                  <p className="font-medium text-gray-900">{latestAudit.url}</p>
                </div>
                <div className={`px-4 py-2 rounded-lg ${
                  (latestAudit.overall_score ?? 0) >= 90 ? 'bg-gray-100' :
                  (latestAudit.overall_score ?? 0) >= 70 ? 'bg-gray-100' :
                  (latestAudit.overall_score ?? 0) >= 50 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <span className={`text-2xl font-bold ${
                    (latestAudit.overall_score ?? 0) >= 90 ? 'text-gray-900' :
                    (latestAudit.overall_score ?? 0) >= 70 ? 'text-gray-700' :
                    (latestAudit.overall_score ?? 0) >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {latestAudit.overall_score}
                  </span>
                  <span className="text-gray-500 text-sm ml-1">/100</span>
                </div>
              </div>

              {/* Key findings from the audit */}
              {latestAudit.results && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                  {/* AI Crawler Access */}
                  {latestAudit.results.robots_txt && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">AI Bot Access</p>
                      <div className="flex items-center gap-2">
                        {latestAudit.results.robots_txt.crawlers.every(c => c.allowed) ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">All allowed</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm font-medium text-yellow-700">
                              {latestAudit.results.robots_txt.crawlers.filter(c => !c.allowed).length} blocked
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Structured Data */}
                  {latestAudit.results.structured_data && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Rich Data Markup</p>
                      <div className="flex items-center gap-2">
                        {latestAudit.results.structured_data.has_json_ld ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">
                              {latestAudit.results.structured_data.json_ld_types.slice(0, 2).join(', ')}
                            </span>
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 text-red-500" />
                            <span className="text-sm font-medium text-red-700">Missing rich data markup</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Content Accessibility */}
                  {latestAudit.results.content_accessibility && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Content Accessibility</p>
                      <div className="flex items-center gap-2">
                        {latestAudit.results.content_accessibility.estimated_ssr ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">Fully readable by AI</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm font-medium text-yellow-700">May be hard for AI to read</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Audit recommendations */}
              {latestAudit.recommendations && latestAudit.recommendations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">Top Technical Recommendations</p>
                  <ul className="space-y-2">
                    {latestAudit.recommendations.slice(0, 3).map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                          rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {rec.priority === 'high' ? 'High' : rec.priority === 'medium' ? 'Med' : 'Low'}
                        </span>
                        <span className="text-gray-700">{rec.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveTab('site-audit')}
              className="text-sm text-gray-900 hover:underline flex items-center gap-1"
            >
              View full site audit details
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-700 font-medium mb-2">No site audit yet</p>
            <p className="text-sm text-gray-500 mb-4">
              Run a site audit to check if {runStatus?.brand}'s website is optimized for AI search engines like ChatGPT, Claude, and Perplexity.
            </p>
            <button
              onClick={() => setActiveTab('site-audit')}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              Run Site Audit
            </button>
          </div>
        )}
      </div>

      {/* Export & Share Footer */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-end gap-3 p-4 bg-gray-50/50 border-t border-gray-100">
          <button
            onClick={() => handleExportRecommendationsPDF(parsedAiRecommendations)}
            disabled={parsedAiRecommendations.length === 0}
            className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={() => handleExportRecommendationsCSV(parsedAiRecommendations)}
            disabled={parsedAiRecommendations.length === 0}
            className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
}

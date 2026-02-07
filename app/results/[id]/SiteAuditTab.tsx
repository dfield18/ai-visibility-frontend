'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Shield,
  Code2,
  Sparkles,
  ArrowLeft,
  Bot,
  Layout,
} from 'lucide-react';
import { useCreateSiteAudit, useSiteAudit } from '@/hooks/useApi';
import { getSessionId, cn } from '@/lib/utils';
import { CrawlerStatus, Recommendation } from '@/lib/types';

interface SiteAuditTabProps {
  brand: string;
}

// Score color helpers
const getScoreColor = (score: number): string => {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-lime-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
};

const getScoreBgColor = (score: number): string => {
  if (score >= 90) return 'bg-green-100';
  if (score >= 70) return 'bg-lime-100';
  if (score >= 50) return 'bg-yellow-100';
  return 'bg-red-100';
};

const getScoreLabel = (score: number): string => {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
};

const getScoreDescription = (score: number): string => {
  if (score >= 90) return 'Your site is well-optimized for AI search engines';
  if (score >= 70) return 'Your site is mostly ready, with some improvements possible';
  if (score >= 50) return 'Several areas need attention for better AI visibility';
  return 'Significant changes needed to appear in AI search results';
};

// Crawler descriptions for non-technical users
const CRAWLER_DESCRIPTIONS: Record<string, string> = {
  "GPTBot": "OpenAI's crawler for ChatGPT",
  "ChatGPT-User": "ChatGPT browsing feature",
  "ClaudeBot": "Anthropic's crawler for Claude",
  "Claude-Web": "Claude's web browsing feature",
  "PerplexityBot": "Perplexity AI search engine",
  "Google-Extended": "Google's Gemini AI crawler",
  "CCBot": "Common Crawl (used by many AI models)",
  "Applebot-Extended": "Apple Intelligence features",
};

// Collapsible section component
const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ElementType;
  description?: string;
  status?: 'pass' | 'warning' | 'fail';
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon: Icon, description, status, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const statusIcon = {
    pass: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    fail: <XCircle className="w-5 h-5 text-red-500" />,
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E8F0E8] flex items-center justify-center">
            <Icon className="w-5 h-5 text-[#4A7C59]" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-gray-900 block">{title}</span>
            {description && <span className="text-sm text-gray-500">{description}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status && statusIcon[status]}
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  );
};

// Crawler row component
const CrawlerRow: React.FC<{ crawler: CrawlerStatus }> = ({ crawler }) => {
  const description = CRAWLER_DESCRIPTIONS[crawler.name] || crawler.user_agent;

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <Bot className="w-4 h-4 text-gray-400" />
        <div>
          <span className="font-medium text-gray-900">{crawler.name}</span>
          <span className="text-gray-500 text-sm block">{description}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {crawler.allowed ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-green-600 text-sm font-medium">Can access</span>
          </>
        ) : (
          <>
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-red-600 text-sm font-medium">Blocked</span>
          </>
        )}
      </div>
    </div>
  );
};

// Recommendation card component
const RecommendationCard: React.FC<{ rec: Recommendation }> = ({ rec }) => {
  const priorityColors = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-blue-100 text-blue-700 border-blue-200",
  };

  const priorityLabels = {
    high: "High Priority",
    medium: "Medium Priority",
    low: "Nice to Have",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "px-2 py-1 rounded text-xs font-medium border flex-shrink-0",
            priorityColors[rec.priority]
          )}
        >
          {priorityLabels[rec.priority]}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 mb-1">{rec.title}</h4>
          <p className="text-sm text-gray-500">{rec.description}</p>
        </div>
      </div>
    </div>
  );
};

// Inline audit results view
const AuditResultsView: React.FC<{
  auditId: string;
  onBack: () => void;
}> = ({ auditId, onBack }) => {
  const { data: audit, isLoading } = useSiteAudit(auditId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59] mx-auto mb-4" />
          <p className="text-gray-500">Loading audit results...</p>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="text-center py-16">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-900 font-medium mb-2">Audit not found</p>
        <button onClick={onBack} className="text-[#4A7C59] hover:underline">
          Go back
        </button>
      </div>
    );
  }

  // Running state
  if (audit.status === 'queued' || audit.status === 'running') {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-[#E8F0E8] flex items-center justify-center mx-auto mb-6">
          <Loader2 className="w-8 h-8 text-[#4A7C59] animate-spin" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Analyzing your site...</h3>
        <p className="text-gray-500 mb-4">{audit.url}</p>
        <p className="text-sm text-gray-400">Checking robots.txt, meta tags, structured data, and more</p>
      </div>
    );
  }

  // Failed state
  if (audit.status === 'failed') {
    return (
      <div className="text-center py-16">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Audit Failed</h3>
        <p className="text-gray-500 mb-2">{audit.url}</p>
        <p className="text-red-600 mb-6">{audit.error_message || 'An error occurred'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-[#4A7C59] text-white rounded-lg hover:bg-[#3d6649]"
        >
          Try Another Site
        </button>
      </div>
    );
  }

  // Complete state - show results
  const results = audit.results;
  const recommendations = audit.recommendations || [];

  // Calculate section statuses
  const getCrawlerStatus = (): 'pass' | 'warning' | 'fail' | undefined => {
    if (!results?.robots_txt) return undefined;
    const blocked = results.robots_txt.crawlers.filter((c) => !c.allowed).length;
    if (blocked === 0) return 'pass';
    if (blocked <= 2) return 'warning';
    return 'fail';
  };

  const getMetaStatus = (): 'pass' | 'warning' | 'fail' | undefined => {
    if (!results?.meta_directives) return undefined;
    if (results.meta_directives.has_noai) return 'fail';
    if (results.meta_directives.has_noimageai) return 'warning';
    return 'pass';
  };

  const getLlmsTxtStatus = (): 'pass' | 'warning' | undefined => {
    if (!results?.llms_txt) return undefined;
    return results.llms_txt.found ? 'pass' : 'warning';
  };

  const getStructuredDataStatus = (): 'pass' | 'warning' | 'fail' | undefined => {
    if (!results?.structured_data) return undefined;
    const { has_json_ld, has_open_graph, has_twitter_cards } = results.structured_data;
    if (has_json_ld && has_open_graph) return 'pass';
    if (has_json_ld || has_open_graph || has_twitter_cards) return 'warning';
    return 'fail';
  };

  const getContentStatus = (): 'pass' | 'warning' | undefined => {
    if (!results?.content_accessibility) return undefined;
    return results.content_accessibility.estimated_ssr ? 'pass' : 'warning';
  };

  const getStructureStatus = (): 'pass' | 'warning' | 'fail' | undefined => {
    if (!results?.content_structure) return undefined;
    const { has_valid_heading_hierarchy, semantic_elements_count } = results.content_structure;
    if (has_valid_heading_hierarchy && semantic_elements_count >= 3) return 'pass';
    if (has_valid_heading_hierarchy || semantic_elements_count >= 2) return 'warning';
    return 'fail';
  };

  return (
    <div className="space-y-6">
      {/* Back button and URL header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <a
            href={audit.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-semibold text-[#4A7C59] hover:underline inline-flex items-center gap-2"
          >
            {audit.url}
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Score */}
      {audit.overall_score != null && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-6">
            <div
              className={cn(
                "w-24 h-24 rounded-full flex flex-col items-center justify-center border-4",
                audit.overall_score >= 90 ? "text-green-600 bg-green-50 border-green-200" :
                audit.overall_score >= 70 ? "text-lime-600 bg-lime-50 border-lime-200" :
                audit.overall_score >= 50 ? "text-yellow-600 bg-yellow-50 border-yellow-200" :
                "text-red-600 bg-red-50 border-red-200"
              )}
            >
              <span className="text-3xl font-bold">{audit.overall_score}</span>
              <span className="text-xs font-medium">{getScoreLabel(audit.overall_score)}</span>
            </div>
            <div>
              <p className="text-gray-500 text-sm">LLM Optimization Score</p>
              <p className="text-gray-700 mt-1">{getScoreDescription(audit.overall_score)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Recommendations ({recommendations.length})
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            Actions to improve how AI search engines understand and recommend your website.
          </p>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <RecommendationCard key={idx} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Audit Details */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Audit Details</h3>

        {/* AI Crawler Access */}
        {results?.robots_txt && (
          <CollapsibleSection
            title="AI Crawler Access"
            icon={Shield}
            description="Can AI bots read your website?"
            defaultOpen={true}
            status={getCrawlerStatus()}
          >
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Why this matters:</strong> AI search engines use "crawlers" to read websites. If blocked, AI tools won't have up-to-date information about your business.
              </p>
            </div>
            <div className="space-y-1">
              {results.robots_txt.crawlers.map((crawler, idx) => (
                <CrawlerRow key={idx} crawler={crawler} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Meta Directives */}
        {results?.meta_directives && (
          <CollapsibleSection
            title="Meta Directives"
            icon={FileText}
            description="Hidden tags that tell AI what to do"
            status={getMetaStatus()}
          >
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Why this matters:</strong> "noai" tags can block AI systems from using your content entirely.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700 block">noai directive</span>
                  <span className="text-xs text-gray-400">Blocks all AI from using your content</span>
                </div>
                {results.meta_directives.has_noai ? (
                  <span className="text-red-600 font-medium flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Found (blocking AI)
                  </span>
                ) : (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Not found (good)
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700 block">noimageai directive</span>
                  <span className="text-xs text-gray-400">Blocks AI from using your images</span>
                </div>
                {results.meta_directives.has_noimageai ? (
                  <span className="text-yellow-600 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Found
                  </span>
                ) : (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Not found (good)
                  </span>
                )}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* llms.txt */}
        {results?.llms_txt && (
          <CollapsibleSection
            title="llms.txt"
            icon={FileText}
            description="Instructions file for AI systems"
            status={getLlmsTxtStatus()}
          >
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Why this matters:</strong> An llms.txt file is like a welcome guide for AI, helping them understand your business accurately.
              </p>
            </div>
            {results.llms_txt.found ? (
              <div>
                <p className="text-green-600 font-medium flex items-center gap-1 mb-3">
                  <CheckCircle2 className="w-4 h-4" /> Great! Your site has an llms.txt file
                </p>
                {results.llms_txt.content && (
                  <pre className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 overflow-x-auto max-h-48">
                    {results.llms_txt.content}
                  </pre>
                )}
              </div>
            ) : (
              <p className="text-gray-500">
                No llms.txt file found. Consider adding one to help AI systems understand your business.
              </p>
            )}
          </CollapsibleSection>
        )}

        {/* Structured Data */}
        {results?.structured_data && (
          <CollapsibleSection
            title="Structured Data"
            icon={Code2}
            description="Machine-readable info about your business"
            status={getStructuredDataStatus()}
          >
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Why this matters:</strong> Structured data is like a business card that AI can read perfectly.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700 block">JSON-LD Schema</span>
                  <span className="text-xs text-gray-400">The most important format for AI</span>
                </div>
                {results.structured_data.has_json_ld ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {results.structured_data.json_ld_types.join(", ")}
                  </span>
                ) : (
                  <span className="text-red-600 font-medium flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Missing
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700 block">Open Graph</span>
                  <span className="text-xs text-gray-400">Used for social media sharing</span>
                </div>
                {results.structured_data.has_open_graph ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Found
                  </span>
                ) : (
                  <span className="text-yellow-600 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Missing
                  </span>
                )}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Content Accessibility */}
        {results?.content_accessibility && (
          <CollapsibleSection
            title="Content Accessibility"
            icon={Globe}
            description="Can AI read your content without JavaScript?"
            status={getContentStatus()}
          >
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Why this matters:</strong> AI crawlers often can't run JavaScript. If your content only loads after JavaScript runs, AI may see a blank page.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700 block">Server-Side Rendered</span>
                  <span className="text-xs text-gray-400">Content available without JavaScript</span>
                </div>
                {results.content_accessibility.estimated_ssr ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Yes (good!)
                  </span>
                ) : (
                  <span className="text-yellow-600 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> JavaScript required
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700 block">Initial Content Size</span>
                  <span className="text-xs text-gray-400">Amount of content AI sees immediately</span>
                </div>
                <span className="text-gray-600">
                  {results.content_accessibility.initial_html_length.toLocaleString()} characters
                </span>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Content Structure */}
        {results?.content_structure && (
          <CollapsibleSection
            title="Content Structure"
            icon={Layout}
            description="Is your content well-organized for AI?"
            status={getStructureStatus()}
          >
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Why this matters:</strong> Well-organized content with clear headings helps AI understand and cite the right information.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-gray-700 block">Proper Heading Order</span>
                  <span className="text-xs text-gray-400">Headings should flow logically (H1 → H2 → H3)</span>
                </div>
                {results.content_structure.has_valid_heading_hierarchy ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Yes
                  </span>
                ) : (
                  <span className="text-yellow-600 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Needs improvement
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-2">Semantic Page Sections:</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { label: "header", has: results.content_structure.has_header },
                    { label: "main", has: results.content_structure.has_main },
                    { label: "footer", has: results.content_structure.has_footer },
                    { label: "article", has: results.content_structure.has_article },
                    { label: "nav", has: results.content_structure.has_nav },
                  ].map((el) => (
                    <div
                      key={el.label}
                      className={cn(
                        "px-3 py-2 rounded-lg text-center text-sm",
                        el.has ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"
                      )}
                    >
                      &lt;{el.label}&gt;
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
};

// Main component
export const SiteAuditTab: React.FC<SiteAuditTabProps> = ({ brand }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoadingWebsite, setIsLoadingWebsite] = useState(false);
  const [websiteLoaded, setWebsiteLoaded] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const createAudit = useCreateSiteAudit();
  const sessionId = getSessionId();

  // Fetch brand's website when component mounts
  useEffect(() => {
    const fetchBrandWebsite = async () => {
      if (!brand || websiteLoaded) return;

      setIsLoadingWebsite(true);
      try {
        const response = await fetch('/api/brand-website', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.website) {
            setUrl(data.website);
          }
        }
      } catch (err) {
        console.error('Failed to fetch brand website:', err);
      } finally {
        setIsLoadingWebsite(false);
        setWebsiteLoaded(true);
      }
    };

    fetchBrandWebsite();
  }, [brand, websiteLoaded]);

  const validateUrl = (input: string): boolean => {
    try {
      const urlToTest = input.startsWith('http') ? input : `https://${input}`;
      new URL(urlToTest);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setError('Please enter a URL');
      return;
    }

    if (!validateUrl(trimmedUrl)) {
      setError('Please enter a valid URL');
      return;
    }

    setError(null);

    try {
      const result = await createAudit.mutateAsync({
        url: trimmedUrl,
        session_id: sessionId,
      });
      // Show the new audit inline instead of navigating away
      setSelectedAuditId(result.audit_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };

  // If an audit is selected, show it inline
  if (selectedAuditId) {
    return (
      <AuditResultsView
        auditId={selectedAuditId}
        onBack={() => setSelectedAuditId(null)}
      />
    );
  }

  // Default list view
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">LLM Site Audit</h2>
        <p className="text-gray-500">
          Check if {brand ? `${brand}'s website or any other site` : 'a website'} is optimized for AI search engines and LLM crawlers.
        </p>
      </div>

      {/* New Audit Form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-900">Run a New Audit</h3>
          {isLoadingWebsite && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Finding {brand}'s website...</span>
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`flex items-center bg-gray-50 border rounded-xl p-1.5 ${error ? 'border-red-300' : 'border-gray-200'}`}>
            <Search className="w-5 h-5 text-gray-400 ml-3" />
            <input
              type="text"
              placeholder={isLoadingWebsite ? `Looking up ${brand}'s website...` : "Enter website URL (e.g., example.com)"}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              disabled={createAudit.isPending || isLoadingWebsite}
              className="flex-1 px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!url.trim() || createAudit.isPending || isLoadingWebsite}
              className="px-5 py-2.5 text-sm bg-[#4A7C59] text-white font-medium rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {createAudit.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Audit Site
                </>
              )}
            </button>
          </div>
          {websiteLoaded && url && !error && (
            <p className="text-sm text-[#4A7C59] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Auto-filled with {brand}'s website. You can edit or enter a different URL.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </form>

        {/* What we check */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-sm text-gray-500 mb-3">What we check:</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4 text-[#4A7C59]" />
              <span>AI Crawler Access</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText className="w-4 h-4 text-[#4A7C59]" />
              <span>llms.txt & Meta Tags</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Code2 className="w-4 h-4 text-[#4A7C59]" />
              <span>Structured Data</span>
            </div>
          </div>
        </div>
      </div>

      {/* Score Legend */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-medium text-gray-900 mb-4">Understanding Your Score</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <div>
              <span className="font-medium text-gray-900">90-100</span>
              <span className="text-gray-500 text-sm ml-2">Excellent</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-lime-500"></div>
            <div>
              <span className="font-medium text-gray-900">70-89</span>
              <span className="text-gray-500 text-sm ml-2">Good</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div>
              <span className="font-medium text-gray-900">50-69</span>
              <span className="text-gray-500 text-sm ml-2">Fair</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div>
              <span className="font-medium text-gray-900">0-49</span>
              <span className="text-gray-500 text-sm ml-2">Poor</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

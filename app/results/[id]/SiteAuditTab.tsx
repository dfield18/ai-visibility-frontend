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
  Layout,
  Clock,
  Target,
  BookOpen,
  Layers,
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
  if (score >= 90) return 'bg-green-50';
  if (score >= 70) return 'bg-lime-50';
  if (score >= 50) return 'bg-yellow-50';
  return 'bg-red-50';
};

const getScoreLabel = (score: number): string => {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Work';
};

// Crawler descriptions
const CRAWLER_DESCRIPTIONS: Record<string, string> = {
  "GPTBot": "ChatGPT",
  "ChatGPT-User": "ChatGPT Browse",
  "ClaudeBot": "Claude",
  "Claude-Web": "Claude Browse",
  "PerplexityBot": "Perplexity",
  "Google-Extended": "Gemini",
  "CCBot": "Common Crawl",
  "Applebot-Extended": "Apple AI",
};

// Compact section component
const AuditSection: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  status?: 'pass' | 'warning' | 'fail';
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, subtitle, icon: Icon, status, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const statusColors = {
    pass: 'bg-green-100 text-green-600',
    warning: 'bg-yellow-100 text-yellow-600',
    fail: 'bg-red-100 text-red-600',
  };

  const statusIcons = {
    pass: <CheckCircle2 className="w-3.5 h-3.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5" />,
    fail: <XCircle className="w-3.5 h-3.5" />,
  };

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#4A7C59]" />
          <div className="text-left">
            <span className="font-medium text-gray-900 text-sm block">{title}</span>
            {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", statusColors[status])}>
              {statusIcons[status]}
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {isOpen && <div className="px-3 pb-3 border-t border-gray-100 pt-3 text-sm">{children}</div>}
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
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#4A7C59] mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Analyzing site...</p>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-gray-900 font-medium mb-2">Audit not found</p>
        <button onClick={onBack} className="text-[#4A7C59] hover:underline text-sm">
          Go back
        </button>
      </div>
    );
  }

  // Running state
  if (audit.status === 'queued' || audit.status === 'running') {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 text-[#4A7C59] animate-spin mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Analyzing site...</h3>
        <p className="text-gray-500 text-sm">{audit.url}</p>
      </div>
    );
  }

  // Failed state
  if (audit.status === 'failed') {
    return (
      <div className="text-center py-12">
        <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Audit Failed</h3>
        <p className="text-red-600 text-sm mb-4">{audit.error_message || 'An error occurred'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-[#4A7C59] text-white text-sm rounded-lg hover:bg-[#3d6649]"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Complete state
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
    const { has_json_ld, has_open_graph } = results.structured_data;
    if (has_json_ld && has_open_graph) return 'pass';
    if (has_json_ld || has_open_graph) return 'warning';
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

  // Group recommendations by priority
  const highPriority = recommendations.filter(r => r.priority === 'high');
  const mediumPriority = recommendations.filter(r => r.priority === 'medium');
  const lowPriority = recommendations.filter(r => r.priority === 'low');

  return (
    <div className="space-y-4">
      {/* Header with back button and URL */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
        <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <a
          href={audit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#4A7C59] hover:underline inline-flex items-center gap-1.5 font-medium text-sm truncate"
        >
          {audit.url}
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
        </a>
      </div>

      {/* Score and Key Insights Row */}
      <div className="grid md:grid-cols-4 gap-3">
        {/* Score Card */}
        {audit.overall_score != null && (
          <div className={cn("rounded-xl p-4 border", getScoreBgColor(audit.overall_score), "border-gray-200")}>
            <p className="text-xs text-gray-500 mb-1">LLM Visibility Score</p>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-3xl font-bold", getScoreColor(audit.overall_score))}>
                {audit.overall_score}
              </span>
              <span className={cn("text-sm font-medium", getScoreColor(audit.overall_score))}>
                {getScoreLabel(audit.overall_score)}
              </span>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        {results?.robots_txt && (
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Retrieval Access</p>
            <div className="flex items-center gap-2">
              {results.robots_txt.crawlers.every(c => c.allowed) ? (
                <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="font-medium text-green-700">All crawlers allowed</span></>
              ) : (
                <><AlertTriangle className="w-4 h-4 text-yellow-500" /><span className="font-medium text-yellow-700">{results.robots_txt.crawlers.filter(c => !c.allowed).length} blocked</span></>
              )}
            </div>
          </div>
        )}

        {results?.structured_data && (
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Machine-Readable Data</p>
            <div className="flex items-center gap-2">
              {results.structured_data.has_json_ld ? (
                <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="font-medium text-green-700">{results.structured_data.json_ld_types[0] || 'JSON-LD'}</span></>
              ) : (
                <><XCircle className="w-4 h-4 text-red-500" /><span className="font-medium text-red-700">No structured data</span></>
              )}
            </div>
          </div>
        )}

        {results?.content_accessibility && (
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Content Access</p>
            <div className="flex items-center gap-2">
              {results.content_accessibility.estimated_ssr ? (
                <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="font-medium text-green-700">Server-rendered</span></>
              ) : (
                <><AlertTriangle className="w-4 h-4 text-yellow-500" /><span className="font-medium text-yellow-700">JS required</span></>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Priority Actions */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-[#4A7C59]" />
            <p className="text-sm font-medium text-gray-900">Priority Actions</p>
          </div>
          <div className="space-y-2">
            {highPriority.slice(0, 2).map((rec, idx) => (
              <div key={idx} className="flex items-start gap-2 bg-red-50 rounded-lg p-2">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 flex-shrink-0">High</span>
                <div>
                  <span className="text-sm text-gray-900">{rec.title}</span>
                  {rec.description && <p className="text-xs text-gray-500 mt-0.5">{rec.description}</p>}
                </div>
              </div>
            ))}
            {mediumPriority.slice(0, 2).map((rec, idx) => (
              <div key={idx} className="flex items-start gap-2 bg-yellow-50 rounded-lg p-2">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 flex-shrink-0">Med</span>
                <div>
                  <span className="text-sm text-gray-900">{rec.title}</span>
                  {rec.description && <p className="text-xs text-gray-500 mt-0.5">{rec.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Audit Results - Grouped by Framework Category */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Retrieval Readiness - Can RAG systems find and surface the right pages? */}
        {results?.robots_txt && (
          <AuditSection
            title="Retrieval Readiness"
            subtitle="Can AI systems access and surface your content?"
            icon={Shield}
            status={getCrawlerStatus()}
            defaultOpen
          >
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-2">AI Crawler Access</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {results.robots_txt.crawlers.map((crawler, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1.5 rounded text-xs",
                        crawler.allowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}
                    >
                      {crawler.allowed ? (
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 flex-shrink-0" />
                      )}
                      <span className="truncate">{CRAWLER_DESCRIPTIONS[crawler.name] || crawler.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              {results?.meta_directives && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Meta Directives</p>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5">
                      {results.meta_directives.has_noai ? (
                        <><XCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-red-700">noai blocking content</span></>
                      ) : (
                        <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /><span className="text-green-700">No AI blocks</span></>
                      )}
                    </div>
                    {results.meta_directives.has_noimageai && (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /><span className="text-yellow-700">Images blocked</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </AuditSection>
        )}

        {/* Machine-Readable Facts - Can LLMs extract facts without inference? */}
        {results?.structured_data && (
          <AuditSection
            title="Machine-Readable Facts"
            subtitle="Can LLMs extract facts without inference?"
            icon={Code2}
            status={getStructuredDataStatus()}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5">
                  {results.structured_data.has_json_ld ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-green-700">JSON-LD: {results.structured_data.json_ld_types.slice(0, 3).join(', ')}</span>
                    </>
                  ) : (
                    <><XCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-red-700">No JSON-LD schema</span></>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5">
                  {results.structured_data.has_open_graph ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /><span className="text-green-700">Open Graph tags</span></>
                  ) : (
                    <><AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /><span className="text-yellow-700">No Open Graph</span></>
                  )}
                </div>
                {results.structured_data.has_twitter_cards && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /><span className="text-green-700">Twitter Cards</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                Structured data helps LLMs understand your pricing, features, and company info without guessing.
              </p>
            </div>
          </AuditSection>
        )}

        {/* Brand Ground Truth - llms.txt for explicit brand definition */}
        {results?.llms_txt && (
          <AuditSection
            title="Brand Ground Truth"
            subtitle="Can LLMs confidently explain your brand?"
            icon={BookOpen}
            status={getLlmsTxtStatus()}
          >
            {results.llms_txt.found ? (
              <div>
                <p className="text-green-700 flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> llms.txt file found
                </p>
                {results.llms_txt.content && (
                  <pre className="bg-gray-50 p-2 rounded text-xs text-gray-600 overflow-x-auto max-h-32">
                    {results.llms_txt.content}
                  </pre>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-600">No llms.txt file found.</p>
                <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  An llms.txt file explicitly tells AI who you are, what you do, and who you're for—preventing hallucinations and misclassification.
                </p>
              </div>
            )}
          </AuditSection>
        )}

        {/* Content Accessibility - Can LLMs read your content? */}
        {results?.content_accessibility && (
          <AuditSection
            title="Content Accessibility"
            subtitle="Can crawlers read your content?"
            icon={Globe}
            status={getContentStatus()}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-1.5">
                  {results.content_accessibility.estimated_ssr ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /><span className="text-green-700">Server-rendered content</span></>
                  ) : (
                    <><AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /><span className="text-yellow-700">JavaScript required</span></>
                  )}
                </div>
                <div className="text-gray-600">
                  Initial HTML: {results.content_accessibility.initial_html_length.toLocaleString()} chars
                </div>
              </div>
              {!results.content_accessibility.estimated_ssr && (
                <p className="text-xs text-gray-500 bg-yellow-50 p-2 rounded">
                  JavaScript-only content may not be visible to AI crawlers. Consider server-side rendering for key pages.
                </p>
              )}
            </div>
          </AuditSection>
        )}

        {/* Page Structure - Clear hierarchy for retrieval */}
        {results?.content_structure && (
          <AuditSection
            title="Page Structure"
            subtitle="Clear headings and semantic layout?"
            icon={Layout}
            status={getStructureStatus()}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                {results.content_structure.has_valid_heading_hierarchy ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /><span className="text-green-700">Valid heading hierarchy (H1→H2→H3)</span></>
                ) : (
                  <><AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /><span className="text-yellow-700">Heading hierarchy issues</span></>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Semantic Elements</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'header', has: results.content_structure.has_header },
                    { label: 'main', has: results.content_structure.has_main },
                    { label: 'footer', has: results.content_structure.has_footer },
                    { label: 'article', has: results.content_structure.has_article },
                    { label: 'nav', has: results.content_structure.has_nav },
                  ].map((el) => (
                    <span
                      key={el.label}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs",
                        el.has ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                      )}
                    >
                      &lt;{el.label}&gt;
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </AuditSection>
        )}
      </div>

      {/* Additional Recommendations */}
      {(mediumPriority.length > 2 || lowPriority.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900 mb-3">Additional Improvements</p>
          <div className="space-y-2">
            {mediumPriority.slice(2).map((rec, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 flex-shrink-0">Med</span>
                <span className="text-gray-700">{rec.title}</span>
              </div>
            ))}
            {lowPriority.map((rec, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 flex-shrink-0">Low</span>
                <span className="text-gray-700">{rec.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Framework Note */}
      <div className="text-xs text-gray-400 text-center py-2">
        Audit based on LLM Brand Visibility framework. Some checks (consistency, positioning) require manual review.
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
      setSelectedAuditId(result.audit_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };

  // If an audit is selected, show results inline
  if (selectedAuditId) {
    return (
      <AuditResultsView
        auditId={selectedAuditId}
        onBack={() => setSelectedAuditId(null)}
      />
    );
  }

  // Default form view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">LLM Brand Visibility Audit</h2>
        <p className="text-sm text-gray-500 mt-1">
          Check if your website is optimized to be found, understood, and accurately represented by AI systems
        </p>
      </div>

      {/* Audit Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Website URL</label>
            {isLoadingWebsite && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Finding {brand}'s site...
              </span>
            )}
          </div>
          <div className={cn(
            "flex items-center bg-gray-50 border rounded-lg overflow-hidden",
            error ? 'border-red-300' : 'border-gray-200'
          )}>
            <Search className="w-4 h-4 text-gray-400 ml-3" />
            <input
              type="text"
              placeholder={isLoadingWebsite ? `Looking up ${brand}...` : "example.com"}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              disabled={createAudit.isPending || isLoadingWebsite}
              className="flex-1 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!url.trim() || createAudit.isPending || isLoadingWebsite}
              className="px-4 py-2.5 text-sm bg-[#4A7C59] text-white font-medium hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 m-1 rounded-md"
            >
              {createAudit.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Auditing...</>
              ) : (
                <><Globe className="w-4 h-4" />Audit</>
              )}
            </button>
          </div>
          {websiteLoaded && url && !error && (
            <p className="text-xs text-[#4A7C59] flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Auto-filled with {brand}'s website
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </div>

      {/* Framework Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-medium text-gray-900 mb-4">What we analyze</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-[#4A7C59] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Retrieval Readiness</p>
                <p className="text-xs text-gray-500">Can RAG systems find and surface your pages?</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Code2 className="w-4 h-4 text-[#4A7C59] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Machine-Readable Facts</p>
                <p className="text-xs text-gray-500">Can LLMs extract facts without inference?</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 text-[#4A7C59] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Brand Ground Truth</p>
                <p className="text-xs text-gray-500">Can an LLM confidently explain your brand?</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Globe className="w-4 h-4 text-[#4A7C59] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Content Accessibility</p>
                <p className="text-xs text-gray-500">Can crawlers read your content?</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Layout className="w-4 h-4 text-[#4A7C59] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Page Structure</p>
                <p className="text-xs text-gray-500">Clear headings and semantic layout?</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Layers className="w-4 h-4 text-gray-300 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-400">Consistency & Positioning</p>
                <p className="text-xs text-gray-400">Manual review recommended</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span>90+ Excellent</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-lime-500"></span>70-89 Good</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500"></span>50-69 Fair</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span>&lt;50 Needs Work</span>
      </div>
    </div>
  );
};

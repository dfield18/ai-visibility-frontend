"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import {
  Eye,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Bot,
  Shield,
  FileText,
  Code2,
  Layout,
  Globe,
  ExternalLink,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { useSiteAudit } from "@/hooks/useApi";
import { formatDate, cn } from "@/lib/utils";
import { CrawlerStatus, Recommendation } from "@/lib/types";

function ScoreCircle({ score }: { score: number | null }) {
  if (score === null) return null;

  const getScoreColor = (s: number) => {
    if (s >= 90) return "text-green-600 bg-green-50 border-green-200";
    if (s >= 70) return "text-lime-600 bg-lime-50 border-lime-200";
    if (s >= 50) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getScoreLabel = (s: number) => {
    if (s >= 90) return "Excellent";
    if (s >= 70) return "Good";
    if (s >= 50) return "Fair";
    return "Poor";
  };

  return (
    <div className="text-center">
      <div
        className={cn(
          "w-32 h-32 rounded-full flex flex-col items-center justify-center border-4 mx-auto",
          getScoreColor(score)
        )}
      >
        <span className="text-4xl font-bold">{score}</span>
        <span className="text-sm font-medium">{getScoreLabel(score)}</span>
      </div>
      <p className="text-gray-500 text-sm mt-3">LLM Optimization Score</p>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
  status,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
  status?: "pass" | "warning" | "fail";
}) {
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
          <span className="font-semibold text-gray-900">{title}</span>
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
}

function CrawlerRow({ crawler }: { crawler: CrawlerStatus }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <Bot className="w-4 h-4 text-gray-400" />
        <div>
          <span className="font-medium text-gray-900">{crawler.name}</span>
          <span className="text-gray-400 text-sm ml-2">({crawler.user_agent})</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {crawler.allowed ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-green-600 text-sm font-medium">Allowed</span>
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
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const priorityColors = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-blue-100 text-blue-700 border-blue-200",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "px-2 py-1 rounded text-xs font-medium border",
            priorityColors[rec.priority]
          )}
        >
          {rec.priority.toUpperCase()}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 mb-1">{rec.title}</h4>
          <p className="text-sm text-gray-500">{rec.description}</p>
        </div>
      </div>
    </div>
  );
}

export default function SiteAuditResultPage() {
  const router = useRouter();
  const params = useParams();
  const auditId = params.id as string;

  const { data: audit, isLoading, error } = useSiteAudit(auditId);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-500">Loading audit...</p>
        </div>
      </main>
    );
  }

  if (error || !audit) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-md w-full text-center p-8">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to load audit
          </h1>
          <p className="text-gray-500 mb-6">
            {error instanceof Error ? error.message : "Audit not found"}
          </p>
          <Link
            href="/site-audit"
            className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-xl hover:bg-[#3d6649] transition-colors inline-block"
          >
            Start New Audit
          </Link>
        </div>
      </main>
    );
  }

  // Running state
  if (audit.status === "queued" || audit.status === "running") {
    return (
      <main className="min-h-screen bg-[#FAFAF8]">
        <Header />
        <div className="max-w-2xl mx-auto px-8 pt-16">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#E8F0E8] flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-[#4A7C59] animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Analyzing your site...
            </h2>
            <p className="text-gray-500 mb-4">{audit.url}</p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <Globe className="w-4 h-4" />
              Checking robots.txt, meta tags, structured data, and more
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Failed state
  if (audit.status === "failed") {
    return (
      <main className="min-h-screen bg-[#FAFAF8]">
        <Header />
        <div className="max-w-2xl mx-auto px-8 pt-16">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Audit Failed
            </h2>
            <p className="text-gray-500 mb-2">{audit.url}</p>
            <p className="text-red-600 mb-6">{audit.error_message || "An error occurred during the audit"}</p>
            <Link
              href="/site-audit"
              className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-xl hover:bg-[#3d6649] transition-colors inline-block"
            >
              Try Again
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Complete state
  const results = audit.results;
  const recommendations = audit.recommendations || [];

  // Calculate section statuses
  const getCrawlerStatus = () => {
    if (!results?.robots_txt) return undefined;
    const blocked = results.robots_txt.crawlers.filter((c) => !c.allowed).length;
    if (blocked === 0) return "pass";
    if (blocked <= 2) return "warning";
    return "fail";
  };

  const getMetaStatus = () => {
    if (!results?.meta_directives) return undefined;
    if (results.meta_directives.has_noai) return "fail";
    if (results.meta_directives.has_noimageai) return "warning";
    return "pass";
  };

  const getLlmsTxtStatus = () => {
    if (!results?.llms_txt) return undefined;
    return results.llms_txt.found ? "pass" : "warning";
  };

  const getStructuredDataStatus = () => {
    if (!results?.structured_data) return undefined;
    const { has_json_ld, has_open_graph, has_twitter_cards } = results.structured_data;
    if (has_json_ld && has_open_graph) return "pass";
    if (has_json_ld || has_open_graph || has_twitter_cards) return "warning";
    return "fail";
  };

  const getContentStatus = () => {
    if (!results?.content_accessibility) return undefined;
    return results.content_accessibility.estimated_ssr ? "pass" : "warning";
  };

  const getStructureStatus = () => {
    if (!results?.content_structure) return undefined;
    const { has_valid_heading_hierarchy, semantic_elements_count } = results.content_structure;
    if (has_valid_heading_hierarchy && semantic_elements_count >= 3) return "pass";
    if (has_valid_heading_hierarchy || semantic_elements_count >= 2) return "warning";
    return "fail";
  };

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <Header />

      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* URL and Score Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <ScoreCircle score={audit.overall_score} />
            <div className="flex-1 text-center md:text-left">
              <a
                href={audit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-semibold text-[#4A7C59] hover:underline inline-flex items-center gap-2"
              >
                {audit.url}
                <ExternalLink className="w-4 h-4" />
              </a>
              <p className="text-gray-500 text-sm mt-1">
                Audited {audit.completed_at ? formatDate(audit.completed_at) : "just now"}
              </p>
              <div className="mt-4">
                <Link
                  href="/site-audit"
                  className="px-4 py-2 text-sm border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors inline-block"
                >
                  Audit Another Site
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Recommendations ({recommendations.length})
            </h3>
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
              defaultOpen={true}
              status={getCrawlerStatus()}
            >
              <div className="space-y-1">
                {results.robots_txt.crawlers.map((crawler, idx) => (
                  <CrawlerRow key={idx} crawler={crawler} />
                ))}
              </div>
              {!results.robots_txt.found && (
                <p className="text-sm text-gray-500 mt-3">
                  No robots.txt found - all crawlers are allowed by default
                </p>
              )}
            </CollapsibleSection>
          )}

          {/* Meta Directives */}
          {results?.meta_directives && (
            <CollapsibleSection
              title="Meta Directives"
              icon={FileText}
              status={getMetaStatus()}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">noai directive</span>
                  {results.meta_directives.has_noai ? (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> Found (blocks AI)
                    </span>
                  ) : (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Not found
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">noimageai directive</span>
                  {results.meta_directives.has_noimageai ? (
                    <span className="text-yellow-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Found
                    </span>
                  ) : (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Not found
                    </span>
                  )}
                </div>
                {results.meta_directives.x_robots_tag && (
                  <div className="py-2">
                    <span className="text-gray-700">X-Robots-Tag: </span>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                      {results.meta_directives.x_robots_tag}
                    </code>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* llms.txt */}
          {results?.llms_txt && (
            <CollapsibleSection
              title="llms.txt"
              icon={FileText}
              status={getLlmsTxtStatus()}
            >
              {results.llms_txt.found ? (
                <div>
                  <p className="text-green-600 font-medium flex items-center gap-1 mb-3">
                    <CheckCircle2 className="w-4 h-4" /> llms.txt file found
                  </p>
                  {results.llms_txt.content && (
                    <pre className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 overflow-x-auto max-h-48">
                      {results.llms_txt.content}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">
                  No llms.txt file found. Consider adding one to provide instructions to LLMs.
                </p>
              )}
            </CollapsibleSection>
          )}

          {/* Structured Data */}
          {results?.structured_data && (
            <CollapsibleSection
              title="Structured Data"
              icon={Code2}
              status={getStructuredDataStatus()}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">JSON-LD</span>
                  {results.structured_data.has_json_ld ? (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />{" "}
                      {results.structured_data.json_ld_types.join(", ")}
                    </span>
                  ) : (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> Not found
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">Open Graph</span>
                  {results.structured_data.has_open_graph ? (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Found
                    </span>
                  ) : (
                    <span className="text-yellow-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Not found
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">Twitter Cards</span>
                  {results.structured_data.has_twitter_cards ? (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Found
                    </span>
                  ) : (
                    <span className="text-gray-400 font-medium flex items-center gap-1">
                      Not found
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
              status={getContentStatus()}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">Server-Side Rendered</span>
                  {results.content_accessibility.estimated_ssr ? (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Yes
                    </span>
                  ) : (
                    <span className="text-yellow-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Likely client-side only
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">Initial HTML Length</span>
                  <span className="text-gray-600">
                    {results.content_accessibility.initial_html_length.toLocaleString()} chars
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">noscript Fallback</span>
                  {results.content_accessibility.has_noscript_content ? (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Found
                    </span>
                  ) : (
                    <span className="text-gray-400">Not found</span>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Content Structure */}
          {results?.content_structure && (
            <CollapsibleSection
              title="Content Structure"
              icon={Layout}
              status={getStructureStatus()}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-700">Valid Heading Hierarchy</span>
                  {results.content_structure.has_valid_heading_hierarchy ? (
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Yes
                    </span>
                  ) : (
                    <span className="text-yellow-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Issues found
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 py-2">
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
                        el.has
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-50 text-gray-400"
                      )}
                    >
                      &lt;{el.label}&gt;
                    </div>
                  ))}
                </div>
                {results.content_structure.headings.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-500 mb-2">Heading Structure:</p>
                    <div className="bg-gray-50 p-3 rounded-lg text-sm max-h-32 overflow-y-auto">
                      {results.content_structure.headings.slice(0, 10).map((h, idx) => (
                        <div key={idx} style={{ marginLeft: `${(h.level - 1) * 16}px` }}>
                          <span className="text-gray-400">h{h.level}:</span>{" "}
                          <span className="text-gray-700">{h.text}</span>
                        </div>
                      ))}
                      {results.content_structure.headings.length > 10 && (
                        <p className="text-gray-400 mt-2">
                          +{results.content_structure.headings.length - 10} more headings
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-[#FAFAF8] border-b border-gray-100">
      <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Link href="/site-audit" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E8F0E8] flex items-center justify-center">
              <Eye className="w-4 h-4 text-[#4A7C59]" />
            </div>
            <span className="font-semibold text-gray-900">Site Audit Results</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-gray-600 hover:text-gray-900 text-sm">
            Brand Analysis
          </Link>
          <SignedOut>
            <a
              href="/sign-in"
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Sign In
            </a>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-9 h-9",
                },
              }}
            />
          </SignedIn>
        </div>
      </nav>
    </header>
  );
}

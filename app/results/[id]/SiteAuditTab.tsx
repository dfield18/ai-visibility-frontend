'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Search, Loader2, CheckCircle, XCircle, AlertCircle, ExternalLink, ChevronDown, ChevronUp, FileText, Shield, Code2 } from 'lucide-react';
import { useCreateSiteAudit, useSiteAudits } from '@/hooks/useApi';
import { getSessionId } from '@/lib/utils';
import { SiteAuditResult, CrawlerStatus } from '@/lib/types';

interface SiteAuditTabProps {
  brand: string;
}

// Score color helper
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

// Collapsible section component
const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  score?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, score, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E8F0E8] flex items-center justify-center">
            {icon}
          </div>
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {score !== undefined && (
            <span className={`text-sm font-medium ${getScoreColor(score)}`}>
              {score}/100
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>
      {isOpen && (
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          {children}
        </div>
      )}
    </div>
  );
};

// Audit result card
const AuditResultCard: React.FC<{ audit: SiteAuditResult }> = ({ audit }) => {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/site-audit/${audit.audit_id}`)}
      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#4A7C59] hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{audit.url}</p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(audit.created_at).toLocaleDateString()} at{' '}
            {new Date(audit.created_at).toLocaleTimeString()}
          </p>
        </div>
        {audit.status === 'complete' && audit.overall_score != null && (
          <div className={`px-3 py-1.5 rounded-lg ${getScoreBgColor(audit.overall_score)}`}>
            <span className={`text-lg font-bold ${getScoreColor(audit.overall_score)}`}>
              {audit.overall_score}
            </span>
          </div>
        )}
        {audit.status === 'running' && (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Running...</span>
          </div>
        )}
        {audit.status === 'failed' && (
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">Failed</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm text-[#4A7C59]">
        <span>View details</span>
        <ExternalLink className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

export const SiteAuditTab: React.FC<SiteAuditTabProps> = ({ brand }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const createAudit = useCreateSiteAudit();
  const sessionId = getSessionId();
  const { data: auditsData, isLoading: auditsLoading } = useSiteAudits(sessionId);

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
      router.push(`/site-audit/${result.audit_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };

  const audits = auditsData?.audits || [];

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
        <h3 className="font-medium text-gray-900 mb-4">Run a New Audit</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`flex items-center bg-gray-50 border rounded-xl p-1.5 ${error ? 'border-red-300' : 'border-gray-200'}`}>
            <Search className="w-5 h-5 text-gray-400 ml-3" />
            <input
              type="text"
              placeholder="Enter website URL (e.g., example.com)"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              disabled={createAudit.isPending}
              className="flex-1 px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!url.trim() || createAudit.isPending}
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

      {/* Previous Audits */}
      <div>
        <h3 className="font-medium text-gray-900 mb-4">Previous Audits</h3>
        {auditsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : audits.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No audits yet. Enter a URL above to get started.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {audits.map((audit) => (
              <AuditResultCard key={audit.audit_id} audit={audit} />
            ))}
          </div>
        )}
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

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  Plus,
  X,
  AlertTriangle,
  FileBarChart,
  Clock,
  Edit2,
  Power,
  PlayCircle,
  Pause,
  Trash2,
  Globe,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { useSiteAudits } from '@/hooks/useApi';
import { getSessionId } from '@/lib/utils';
import { ScheduledReport, ScheduledReportCreate, RunStatusResponse, SiteAuditResult } from '@/lib/types';

interface ReportsTabProps {
  runStatus: RunStatusResponse | null;
}

const MAX_REPORTS = 3;
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PROVIDER_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  gemini: 'Google Gemini',
  anthropic: 'Claude',
  perplexity: 'Perplexity',
  ai_overviews: 'Google AI Overviews',
  grok: 'Grok',
  llama: 'Llama',
};

// Score color helper for site audits
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

export function ReportsTab({ runStatus }: ReportsTabProps) {
  const { getToken } = useAuth();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Site audits
  const sessionId = getSessionId();
  const { data: auditsData, isLoading: auditsLoading } = useSiteAudits(sessionId);
  const siteAudits = auditsData?.audits || [];
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [runNowPrompt, setRunNowPrompt] = useState<{ reportId: string; reportName: string } | null>(null);


  // Extract unique values from results - memoize to prevent re-render loops
  const uniquePrompts = useMemo(() =>
    runStatus?.results ? [...new Set(runStatus.results.map(r => r.prompt))] : [],
    [runStatus?.results]
  );
  const uniqueProviders = useMemo(() =>
    runStatus?.results ? [...new Set(runStatus.results.map(r => r.provider))] : [],
    [runStatus?.results]
  );
  const allCompetitorsMentioned = useMemo(() =>
    runStatus?.results
      ? [...new Set(runStatus.results.flatMap(r => r.competitors_mentioned || []))]
      : [],
    [runStatus?.results]
  );

  // Form state
  const [formData, setFormData] = useState<Partial<ScheduledReportCreate>>({
    name: '',
    brand: runStatus?.brand || '',
    search_type: runStatus?.search_type || 'brand',
    prompts: uniquePrompts.length > 0 ? uniquePrompts : [''],
    competitors: allCompetitorsMentioned.length > 0 ? allCompetitorsMentioned : [''],
    providers: uniqueProviders.length > 0 ? uniqueProviders : ['openai'],
    temperatures: [0.7],
    repeats: 1,
    frequency: 'weekly',
    day_of_week: 1,
    hour: 9,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // Helper: call an API with a token, retrying with a fresh one if expired
  const retryWithFreshToken = useCallback(async <T,>(apiFn: (token: string) => Promise<T>): Promise<T> => {
    let token = await getToken();
    if (!token) throw new Error('Please sign in to access reports');
    try {
      return await apiFn(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message?.toLowerCase() : '';
      // If token expired, get a fresh one and retry once
      if (msg.includes('token has expired') || msg.includes('expired') || msg.includes('401')) {
        try {
          token = await getToken({ skipCache: true });
          if (!token) throw new Error('Your session has expired. Please refresh the page.');
          return await apiFn(token);
        } catch {
          throw new Error('Your session has expired. Please refresh the page.');
        }
      }
      throw err;
    }
  }, [getToken]);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await retryWithFreshToken((token) => api.listScheduledReports(token));
      setReports(response.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [retryWithFreshToken]);

  // Fetch reports on mount
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Sync user profile from Clerk on mount (ensures email is correct for notifications)
  useEffect(() => {
    const syncProfile = async () => {
      try {
        await retryWithFreshToken((token) => api.syncProfile(token));
      } catch (err) {
        // Silently fail - this is just a background sync
        console.log('[ReportsTab] Profile sync:', err instanceof Error ? err.message : 'failed');
      }
    };
    syncProfile();
  }, [getToken]);

  // Sync form data when runStatus changes (e.g., when data loads after mount)
  useEffect(() => {
    if (runStatus && !isCreating && !editingReport) {
      setFormData(prev => ({
        ...prev,
        brand: runStatus.brand || prev.brand,
        search_type: runStatus.search_type || prev.search_type,
        prompts: uniquePrompts.length > 0 ? uniquePrompts : prev.prompts,
        competitors: allCompetitorsMentioned.length > 0 ? allCompetitorsMentioned : prev.competitors,
        providers: uniqueProviders.length > 0 ? uniqueProviders : prev.providers,
      }));
    }
  }, [runStatus, uniquePrompts, uniqueProviders, allCompetitorsMentioned, isCreating, editingReport]);

  // Helper to manage action loading state
  const setActionLoadingState = (id: string, isLoading: boolean) => {
    setActionLoading(prev => {
      const next = new Set(prev);
      if (isLoading) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    try {
      setActionLoadingState('create', true);

      const prompts = (formData.prompts || []).filter(p => p.trim());
      const competitors = (formData.competitors || []).filter(c => c.trim());
      const providers = (formData.providers || []).filter(p => p.trim());

      if (prompts.length === 0) {
        setError('At least one prompt is required');
        setActionLoadingState('create', false);
        return;
      }
      if (competitors.length === 0) {
        setError('At least one competitor is required');
        setActionLoadingState('create', false);
        return;
      }
      if (providers.length === 0) {
        setError('At least one provider is required');
        setActionLoadingState('create', false);
        return;
      }

      const data: ScheduledReportCreate = {
        name: formData.name || `${runStatus?.brand} Report`,
        brand: formData.brand || runStatus?.brand || '',
        search_type: formData.search_type || 'brand',
        prompts,
        competitors,
        providers,
        temperatures: formData.temperatures || [0.7],
        repeats: formData.repeats || 1,
        frequency: formData.frequency || 'weekly',
        day_of_week: formData.frequency === 'weekly' ? formData.day_of_week : null,
        hour: formData.hour || 9,
        timezone: formData.timezone || 'UTC',
      };

      const newReport = await retryWithFreshToken((token) => api.createScheduledReport(data, token));
      await fetchReports();
      setIsCreating(false);
      resetForm();
      // Prompt user to run the report now
      setRunNowPrompt({ reportId: newReport.id, reportName: data.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    } finally {
      setActionLoadingState('create', false);
    }
  };

  const handleUpdate = async () => {
    if (!editingReport) return;
    try {
      setActionLoadingState('update', true);
      await retryWithFreshToken((token) => api.updateScheduledReport(editingReport.id, formData, token));
      await fetchReports();
      setEditingReport(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report');
    } finally {
      setActionLoadingState('update', false);
    }
  };

  const handleDeleteConfirm = async (reportId: string) => {
    try {
      setActionLoadingState(reportId, true);
      await retryWithFreshToken((token) => api.deleteScheduledReport(reportId, token));
      await fetchReports();
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report');
    } finally {
      setActionLoadingState(reportId, false);
    }
  };

  const handleToggle = async (reportId: string) => {
    if (actionLoading.has(reportId)) return; // Prevent double-click
    try {
      setActionLoadingState(reportId, true);
      await retryWithFreshToken((token) => api.toggleScheduledReport(reportId, token));
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle report');
    } finally {
      setActionLoadingState(reportId, false);
    }
  };

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleRunNow = async (reportId: string) => {
    if (actionLoading.has(reportId)) return; // Prevent double-click
    try {
      setActionLoadingState(reportId, true);
      const response = await retryWithFreshToken((token) => api.runScheduledReportNow(reportId, token));
      setSuccessMessage(`Report started! Run ID: ${response.run_id.slice(0, 8)}...`);
      setTimeout(() => setSuccessMessage(null), 5000);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run report');
    } finally {
      setActionLoadingState(reportId, false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      brand: runStatus?.brand || '',
      search_type: runStatus?.search_type || 'brand',
      prompts: uniquePrompts.length > 0 ? uniquePrompts : [''],
      competitors: allCompetitorsMentioned.length > 0 ? allCompetitorsMentioned : [''],
      providers: uniqueProviders.length > 0 ? uniqueProviders : ['openai'],
      temperatures: [0.7],
      repeats: 1,
      frequency: 'weekly',
      day_of_week: 1,
      hour: 9,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  const openEditModal = (report: ScheduledReport) => {
    setEditingReport(report);
    setFormData({
      name: report.name,
      brand: report.brand,
      search_type: report.search_type,
      prompts: report.prompts,
      competitors: report.competitors,
      providers: report.providers,
      temperatures: report.temperatures,
      repeats: report.repeats,
      frequency: report.frequency,
      day_of_week: report.day_of_week,
      hour: report.hour,
      timezone: report.timezone,
    });
  };

  const formatNextRun = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Not scheduled';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header - Always show so user can create reports */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Automated Reports</h2>
          <p className="text-sm text-gray-500 mt-1">
            Schedule recurring visibility analyses and receive results via email
          </p>
          {!loading && (
            <p className="text-sm text-gray-600 mt-1 font-medium">
              {reports.length} of {MAX_REPORTS} reports used
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsCreating(true);
          }}
          disabled={!loading && reports.length >= MAX_REPORTS}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            !loading && reports.length >= MAX_REPORTS
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-[#4A7C59] text-white hover:bg-[#3d6649]'
          }`}
          title={!loading && reports.length >= MAX_REPORTS ? `Maximum of ${MAX_REPORTS} reports allowed` : undefined}
        >
          <Plus className="w-4 h-4" />
          New Report
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          {error.toLowerCase().includes('session') || error.toLowerCase().includes('expired') || error.toLowerCase().includes('sign in') ? (
            <button
              onClick={() => { setError(null); fetchReports(); }}
              className="ml-auto px-3 py-1 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
            >
              Retry
            </button>
          ) : (
            <button
              onClick={() => setError(null)}
              className="ml-auto p-1 hover:bg-red-100 rounded"
            >
              <X className="w-4 h-4 text-red-500" />
            </button>
          )}
        </div>
      )}

      {/* Reports List */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Spinner className="w-8 h-8 mx-auto mb-4 text-[#4A7C59]" />
          <p className="text-gray-500">Loading reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-[#E8F0E8] rounded-full flex items-center justify-center mx-auto mb-4">
            <FileBarChart className="w-8 h-8 text-[#4A7C59]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No automated reports yet</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-4">
            Create your first automated report to receive regular visibility updates for {runStatus?.brand || 'your brand'}.
          </p>
          <p className="text-sm text-gray-600 mb-6 font-medium">
            You can create up to {MAX_REPORTS} automated reports.
          </p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsCreating(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4A7C59] text-white text-sm font-medium rounded-lg hover:bg-[#3d6649] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Report
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${
                !report.is_active ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{report.name}</h3>
                    <span
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                        report.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {report.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">
                    {report.brand} · {report.frequency === 'weekly' && report.day_of_week !== null ? `Every ${DAYS_OF_WEEK[report.day_of_week]}` : report.frequency === 'weekly' ? 'Weekly' : 'Daily'} at {report.hour}:00
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {report.providers.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                      >
                        {PROVIDER_LABELS[p] || p}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Next: {report.is_active ? formatNextRun(report.next_run_at) : 'Paused'}
                    </span>
                    {report.last_run_at && (
                      <span>Last run: {formatNextRun(report.last_run_at)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunNow(report.id)}
                    disabled={actionLoading.has(report.id)}
                    className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Run Now"
                  >
                    {actionLoading.has(report.id) ? (
                      <Spinner className="w-5 h-5" />
                    ) : (
                      <PlayCircle className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleToggle(report.id)}
                    disabled={actionLoading.has(report.id)}
                    className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title={report.is_active ? 'Pause' : 'Resume'}
                  >
                    {report.is_active ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Power className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => openEditModal(report)}
                    className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(report.id)}
                    disabled={actionLoading.has(report.id)}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Site Audits Section */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Previous Site Audits</h3>
          <p className="text-sm text-gray-500 mt-1">
            LLM optimization audits you've run to check if websites are ready for AI search
          </p>
        </div>

        {auditsLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : siteAudits.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No site audits yet</p>
            <p className="text-sm text-gray-400">
              Run a site audit from the Site Audit tab to check if a website is optimized for AI search engines.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {siteAudits.map((audit) => (
              <a
                key={audit.audit_id}
                href={`/site-audit/${audit.audit_id}`}
                className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-[#4A7C59] hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <p className="font-medium text-gray-900 truncate">{audit.url}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      {new Date(audit.created_at).toLocaleDateString()} at{' '}
                      {new Date(audit.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
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
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isCreating || editingReport) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingReport ? 'Edit Report' : 'Create Automated Report'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {editingReport
                  ? 'Update your scheduled report settings'
                  : 'Set up a recurring visibility analysis based on the current run'}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Report Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Report Name
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={`${runStatus?.brand} Weekly Report`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                />
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, frequency: 'daily' })}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formData.frequency === 'daily'
                        ? 'bg-[#4A7C59] text-white border-[#4A7C59]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, frequency: 'weekly' })}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formData.frequency === 'weekly'
                        ? 'bg-[#4A7C59] text-white border-[#4A7C59]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Weekly
                  </button>
                </div>
              </div>

              {/* Day of Week (for weekly) */}
              {formData.frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Day of Week
                  </label>
                  <select
                    value={formData.day_of_week ?? 1}
                    onChange={(e) =>
                      setFormData({ ...formData, day_of_week: parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                  >
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <option key={day} value={idx}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time (Hour)
                </label>
                <select
                  value={formData.hour ?? 9}
                  onChange={(e) => setFormData({ ...formData, hour: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Timezone: {formData.timezone}
                </p>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Report Configuration</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="font-medium">Brand:</span> {formData.brand}</p>
                  <p><span className="font-medium">Prompts:</span> {formData.prompts?.length || 0}</p>
                  <p><span className="font-medium">Competitors:</span> {formData.competitors?.length || 0}</p>
                  <p><span className="font-medium">Providers:</span> {formData.providers?.map(p => PROVIDER_LABELS[p] || p).join(', ')}</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingReport(null);
                  resetForm();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingReport ? handleUpdate : handleCreate}
                disabled={actionLoading.has('create') || actionLoading.has('update')}
                className="px-4 py-2 text-sm font-medium text-white bg-[#4A7C59] rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {(actionLoading.has('create') || actionLoading.has('update')) && (
                  <Spinner className="w-4 h-4" />
                )}
                {editingReport ? 'Save Changes' : 'Create Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Report</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this report? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(deleteConfirmId)}
                disabled={actionLoading.has(deleteConfirmId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading.has(deleteConfirmId) && <Spinner className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Now Prompt Modal */}
      {runNowPrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <PlayCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Report Created!</h3>
                <p className="text-sm text-gray-500">{runNowPrompt.reportName}</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Would you like to run this report now and receive a test email? You can also run it later using the play button.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRunNowPrompt(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Later
              </button>
              <button
                onClick={async () => {
                  const reportId = runNowPrompt.reportId;
                  setRunNowPrompt(null);
                  await handleRunNow(reportId);
                }}
                disabled={actionLoading.has(runNowPrompt.reportId)}
                className="px-4 py-2 text-sm font-medium text-white bg-[#4A7C59] rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading.has(runNowPrompt.reportId) && <Spinner className="w-4 h-4" />}
                Run Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message Toast */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ScheduledReport, ScheduledReportCreate, RunStatusResponse } from '@/lib/types';

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
};

export function ReportsTab({ runStatus }: ReportsTabProps) {
  const { getToken } = useAuth();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Extract unique values from results
  const uniquePrompts = runStatus?.results ? [...new Set(runStatus.results.map(r => r.prompt))] : [];
  const uniqueProviders = runStatus?.results ? [...new Set(runStatus.results.map(r => r.provider))] : [];
  const allCompetitorsMentioned = runStatus?.results
    ? [...new Set(runStatus.results.flatMap(r => r.competitors_mentioned || []))]
    : [];

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

  // Fetch reports on mount
  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (!token) {
        setError('Please sign in to view reports');
        return;
      }
      const response = await api.listScheduledReports(token);
      setReports(response.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setActionLoading('create');
      const token = await getToken();
      if (!token) return;

      const prompts = (formData.prompts || []).filter(p => p.trim());
      const competitors = (formData.competitors || []).filter(c => c.trim());
      const providers = (formData.providers || []).filter(p => p.trim());

      if (prompts.length === 0) {
        setError('At least one prompt is required');
        setActionLoading(null);
        return;
      }
      if (competitors.length === 0) {
        setError('At least one competitor is required');
        setActionLoading(null);
        return;
      }
      if (providers.length === 0) {
        setError('At least one provider is required');
        setActionLoading(null);
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

      await api.createScheduledReport(data, token);
      await fetchReports();
      setIsCreating(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    if (!editingReport) return;
    try {
      setActionLoading('update');
      const token = await getToken();
      if (!token) return;

      await api.updateScheduledReport(editingReport.id, formData, token);
      await fetchReports();
      setEditingReport(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
      setActionLoading(reportId);
      const token = await getToken();
      if (!token) return;

      await api.deleteScheduledReport(reportId, token);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggle = async (reportId: string) => {
    try {
      setActionLoading(reportId);
      const token = await getToken();
      if (!token) return;

      await api.toggleScheduledReport(reportId, token);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle report');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunNow = async (reportId: string) => {
    try {
      setActionLoading(reportId);
      const token = await getToken();
      if (!token) return;

      const response = await api.runScheduledReportNow(reportId, token);
      alert(`Report started! Run ID: ${response.run_id}`);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run report');
    } finally {
      setActionLoading(null);
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

  const formatNextRun = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <Spinner className="w-8 h-8 mx-auto mb-4 text-[#4A7C59]" />
        <p className="text-gray-500">Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Automated Reports</h2>
          <p className="text-sm text-gray-500 mt-1">
            Schedule recurring visibility analyses and receive results via email
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {reports.length} of {MAX_REPORTS} reports used
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsCreating(true);
          }}
          disabled={reports.length >= MAX_REPORTS}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            reports.length >= MAX_REPORTS
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-[#4A7C59] text-white hover:bg-[#3d6649]'
          }`}
          title={reports.length >= MAX_REPORTS ? `Maximum of ${MAX_REPORTS} reports allowed` : undefined}
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
          <button
            onClick={() => setError(null)}
            className="ml-auto p-1 hover:bg-red-100 rounded"
          >
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-[#E8F0E8] rounded-full flex items-center justify-center mx-auto mb-4">
            <FileBarChart className="w-8 h-8 text-[#4A7C59]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No automated reports yet</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-4">
            Create your first automated report to receive regular visibility updates for {runStatus?.brand || 'your brand'}.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            You can create up to {MAX_REPORTS} automated reports.
          </p>
          <button
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
                    {report.brand} · {report.frequency === 'weekly' ? `Every ${DAYS_OF_WEEK[report.day_of_week || 0]}` : 'Daily'} at {report.hour}:00
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
                    disabled={actionLoading === report.id}
                    className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors"
                    title="Run Now"
                  >
                    {actionLoading === report.id ? (
                      <Spinner className="w-5 h-5" />
                    ) : (
                      <PlayCircle className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleToggle(report.id)}
                    disabled={actionLoading === report.id}
                    className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors"
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
                    onClick={() => handleDelete(report.id)}
                    disabled={actionLoading === report.id}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                disabled={actionLoading === 'create' || actionLoading === 'update'}
                className="px-4 py-2 text-sm font-medium text-white bg-[#4A7C59] rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {(actionLoading === 'create' || actionLoading === 'update') && (
                  <Spinner className="w-4 h-4" />
                )}
                {editingReport ? 'Save Changes' : 'Create Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

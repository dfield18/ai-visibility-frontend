'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  StopCircle,
  Loader2,
  ArrowLeft,
  Check,
  X,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useRunStatus, useCancelRun } from '@/hooks/useApi';
import { formatDuration, truncate } from '@/lib/utils';
import { Result } from '@/lib/types';

export default function RunPage() {
  const router = useRouter();
  const params = useParams();
  const runId = params.id as string;

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { data: runStatus, isLoading, error } = useRunStatus(runId);
  const cancelMutation = useCancelRun();

  // Auto-redirect to results when complete
  useEffect(() => {
    if (runStatus?.status === 'complete') {
      const timer = setTimeout(() => {
        router.push(`/results/${runId}`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [runStatus?.status, runId, router]);

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(runId);
      setShowCancelConfirm(false);
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  const getStatusBadge = () => {
    if (!runStatus) return null;

    const statusConfig = {
      queued: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Queued', icon: Clock },
      running: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Running', icon: Loader2 },
      complete: { bg: 'bg-[#E8F0E8]', text: 'text-[#4A7C59]', label: 'Complete', icon: CheckCircle2 },
      failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed', icon: XCircle },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Cancelled', icon: StopCircle },
    };

    const config = statusConfig[runStatus.status];
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
        <Icon className={`w-4 h-4 ${runStatus.status === 'running' ? 'animate-spin' : ''}`} />
        {config.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-500">Loading run status...</p>
        </div>
      </main>
    );
  }

  if (error || !runStatus) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-md w-full text-center p-8">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to load run
          </h1>
          <p className="text-gray-500 mb-6">
            {error instanceof Error ? error.message : 'Run not found'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-xl hover:bg-[#3d6649] transition-colors"
          >
            Start New Analysis
          </button>
        </div>
      </main>
    );
  }

  const completedCalls = runStatus.completed_calls + runStatus.failed_calls;
  const recentResults = runStatus.results
    .filter((r: Result) => r.response_text)
    .slice(-5)
    .reverse();

  return (
    <main className="min-h-screen bg-[#FAFAF8] pb-8">
      {/* Header */}
      <header className="pt-6 pb-4">
        <div className="max-w-2xl mx-auto px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Analyzing{' '}
                <span className="text-[#4A7C59]">{runStatus.brand}</span>
              </h1>
              <p className="text-sm text-gray-500">
                Running visibility analysis across AI models
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 space-y-6">
        {/* Status Badge */}
        <div className="flex justify-center">
          {getStatusBadge()}
        </div>

        {/* Progress Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="text-center mb-6">
            {/* Circular Progress Indicator */}
            <div className="relative inline-flex items-center justify-center w-32 h-32 mb-4">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-gray-200"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 56}
                  strokeDashoffset={2 * Math.PI * 56 * (1 - runStatus.progress_percent / 100)}
                  className="text-[#5B7B5D] transition-all duration-500"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-gray-900">
                  {Math.round(runStatus.progress_percent)}%
                </span>
              </div>
            </div>

            <p className="text-lg text-gray-700 mb-2">
              <span className="font-semibold">{completedCalls}</span> of{' '}
              <span className="font-semibold">{runStatus.total_calls}</span> calls complete
            </p>

            {runStatus.estimated_seconds_remaining !== null && runStatus.status === 'running' && (
              <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                <Clock className="w-4 h-4" />
                ~{formatDuration(runStatus.estimated_seconds_remaining)} remaining
              </p>
            )}
          </div>

          {/* Linear Progress Bar */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                runStatus.status === 'complete' ? 'bg-[#4A7C59]' : 'bg-[#5B7B5D]'
              }`}
              style={{ width: `${runStatus.progress_percent}%` }}
            />
          </div>

          {/* Status Messages */}
          {runStatus.status === 'complete' && (
            <div className="mt-6 p-4 bg-[#E8F0E8] rounded-xl text-center">
              <CheckCircle2 className="w-8 h-8 text-[#4A7C59] mx-auto mb-2" />
              <p className="text-[#4A7C59] font-medium">
                Analysis complete! Redirecting to results...
              </p>
            </div>
          )}

          {runStatus.status === 'cancelled' && (
            <div className="mt-6 p-4 bg-gray-100 rounded-xl text-center">
              <StopCircle className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-700 mb-3">Analysis was cancelled</p>
              <button
                onClick={() => router.push(`/results/${runId}`)}
                className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                View Partial Results
              </button>
            </div>
          )}

          {runStatus.status === 'failed' && (
            <div className="mt-6 p-4 bg-red-50 rounded-xl text-center">
              <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-700 mb-3">Analysis failed</p>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Start New Analysis
              </button>
            </div>
          )}
        </div>

        {/* Live Results Preview */}
        {recentResults.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Recent Results
            </h2>
            <div className="space-y-3">
              {recentResults.map((result: Result) => (
                <div
                  key={result.id}
                  className="p-3 bg-[#FAFAF8] rounded-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">
                        {truncate(result.prompt, 50)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {result.provider === 'openai' ? '🤖' : result.provider === 'anthropic' ? '🧠' : result.provider === 'perplexity' ? '🔍' : result.provider === 'ai_overviews' ? '🌐' : '✨'}{' '}
                          {result.provider === 'openai' ? 'GPT-4o' : result.provider === 'anthropic' ? 'Claude' : result.provider === 'perplexity' ? 'Perplexity' : result.provider === 'ai_overviews' ? 'Google AI Overviews' : 'Gemini'}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">
                          Temp: {result.temperature}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {result.brand_mentioned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#E8F0E8] text-[#4A7C59] text-xs font-medium rounded-lg">
                          <Check className="w-3 h-3" />
                          Mentioned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                          <X className="w-3 h-3" />
                          Not mentioned
                        </span>
                      )}
                    </div>
                  </div>
                  {result.competitors_mentioned.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      Competitors: {result.competitors_mentioned.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancel Button */}
        {['queued', 'running'].includes(runStatus.status) && (
          <div className="text-center">
            {showCancelConfirm ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 inline-block">
                <p className="text-gray-700 mb-4">
                  Are you sure you want to cancel this analysis?
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-4 py-2 text-gray-600 text-sm font-medium hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    Keep Running
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                    className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="px-4 py-2 text-gray-500 text-sm font-medium hover:bg-gray-100 rounded-xl transition-colors inline-flex items-center gap-2"
              >
                <StopCircle className="w-4 h-4" />
                Cancel Analysis
              </button>
            )}
          </div>
        )}

        {/* View Results Button (when complete) */}
        {runStatus.status === 'complete' && (
          <div className="text-center">
            <button
              onClick={() => router.push(`/results/${runId}`)}
              className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-xl hover:bg-[#3d6649] transition-colors"
            >
              View Full Results
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

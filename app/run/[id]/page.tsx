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
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
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
      queued: { variant: 'info' as const, label: 'Queued', icon: Clock },
      running: { variant: 'warning' as const, label: 'Running', icon: Loader2 },
      complete: { variant: 'success' as const, label: 'Complete', icon: CheckCircle2 },
      failed: { variant: 'error' as const, label: 'Failed', icon: XCircle },
      cancelled: { variant: 'default' as const, label: 'Cancelled', icon: StopCircle },
    };

    const config = statusConfig[runStatus.status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} size="md">
        <Icon className={`w-4 h-4 mr-1 ${runStatus.status === 'running' ? 'animate-spin' : ''}`} />
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-600">Loading run status...</p>
        </div>
      </main>
    );
  }

  if (error || !runStatus) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center" padding="lg">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to load run
          </h1>
          <p className="text-gray-600 mb-6">
            {error instanceof Error ? error.message : 'Run not found'}
          </p>
          <Button onClick={() => router.push('/')}>
            Start New Analysis
          </Button>
        </Card>
      </main>
    );
  }

  const completedCalls = runStatus.completed_calls + runStatus.failed_calls;
  const recentResults = runStatus.results
    .filter((r: Result) => r.response_text)
    .slice(-5)
    .reverse();

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Analyzing{' '}
            <span className="text-blue-600">{runStatus.brand}</span>
          </h1>
          <div className="flex justify-center">
            {getStatusBadge()}
          </div>
        </div>

        {/* Progress Section */}
        <Card className="mb-6" padding="lg">
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
                  className="text-blue-600 transition-all duration-500"
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
          <ProgressBar
            value={runStatus.progress_percent}
            size="lg"
            color={runStatus.status === 'complete' ? 'green' : 'blue'}
          />

          {/* Status Messages */}
          {runStatus.status === 'complete' && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-green-700 font-medium">
                Analysis complete! Redirecting to results...
              </p>
            </div>
          )}

          {runStatus.status === 'cancelled' && (
            <div className="mt-6 p-4 bg-gray-100 rounded-lg text-center">
              <StopCircle className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-700">Analysis was cancelled</p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => router.push(`/results/${runId}`)}
              >
                View Partial Results
              </Button>
            </div>
          )}

          {runStatus.status === 'failed' && (
            <div className="mt-6 p-4 bg-red-50 rounded-lg text-center">
              <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-700">Analysis failed</p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => router.push('/')}
              >
                Start New Analysis
              </Button>
            </div>
          )}
        </Card>

        {/* Live Results Preview */}
        {recentResults.length > 0 && (
          <Card padding="md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Recent Results
            </h2>
            <div className="space-y-3">
              {recentResults.map((result: Result) => (
                <div
                  key={result.id}
                  className="p-3 bg-gray-50 rounded-lg animate-fade-in"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">
                        {truncate(result.prompt, 50)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {result.provider === 'openai' ? '🤖' : result.provider === 'anthropic' ? '🧠' : result.provider === 'perplexity' ? '🔍' : '✨'}{' '}
                          {result.provider === 'openai' ? 'GPT-4o' : result.provider === 'anthropic' ? 'Claude' : result.provider === 'perplexity' ? 'Perplexity' : 'Gemini'}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">
                          Temp: {result.temperature}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {result.brand_mentioned ? (
                        <Badge variant="success" size="sm">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Mentioned
                        </Badge>
                      ) : (
                        <Badge variant="default" size="sm">
                          <XCircle className="w-3 h-3 mr-1" />
                          Not mentioned
                        </Badge>
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
          </Card>
        )}

        {/* Cancel Button */}
        {['queued', 'running'].includes(runStatus.status) && (
          <div className="mt-6 text-center">
            {showCancelConfirm ? (
              <Card padding="md" className="inline-block">
                <p className="text-gray-700 mb-4">
                  Are you sure you want to cancel this analysis?
                </p>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="ghost"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    Keep Running
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleCancel}
                    loading={cancelMutation.isPending}
                  >
                    Yes, Cancel
                  </Button>
                </div>
              </Card>
            ) : (
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={() => setShowCancelConfirm(true)}
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Cancel Analysis
              </Button>
            )}
          </div>
        )}

        {/* View Results Button (when complete) */}
        {runStatus.status === 'complete' && (
          <div className="mt-6 text-center">
            <Button
              size="lg"
              onClick={() => router.push(`/results/${runId}`)}
            >
              View Full Results
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

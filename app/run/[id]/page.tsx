'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
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

// Circular Progress Ring Animation Component
function CircularProgressAnimation({ progress, completedProviders = [] }: { progress: number; completedProviders?: string[] }) {
  const [displayedProgress, setDisplayedProgress] = useState(0);

  // Animate the number counting up
  useEffect(() => {
    const timer = setTimeout(() => {
      if (displayedProgress < progress) {
        setDisplayedProgress(prev => Math.min(prev + 1, progress));
      }
    }, 20);
    return () => clearTimeout(timer);
  }, [displayedProgress, progress]);

  // Calculate circle properties
  const size = 180;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  // Platform data with brand colors
  const platforms = [
    { key: 'openai', name: 'ChatGPT', color: '#10a37f' },
    { key: 'anthropic', name: 'Claude', color: '#d97706' },
    { key: 'gemini', name: 'Gemini', color: '#4285f4' },
    { key: 'perplexity', name: 'Perplexity', color: '#6366f1' },
    { key: 'grok', name: 'Grok', color: '#1d9bf0' },
    { key: 'llama', name: 'Llama', color: '#8b5cf6' },
  ];

  // Status text based on progress
  const getStatusText = () => {
    if (progress < 20) return "Initializing analysis...";
    if (progress < 40) return "Querying AI platforms...";
    if (progress < 60) return "Analyzing responses...";
    if (progress < 80) return "Calculating scores...";
    if (progress < 100) return "Finalizing results...";
    return "Complete!";
  };

  return (
    <div className="flex flex-col items-center">
      {/* Circular Progress Ring */}
      <div className="relative">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#111827"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold text-gray-900">
            {Math.round(displayedProgress)}
          </span>
          <span className="text-sm text-gray-400 mt-1">percent</span>
        </div>
      </div>

      {/* Status text */}
      <p className="mt-6 text-gray-600 text-sm animate-pulse">
        {getStatusText()}
      </p>

      {/* Platform indicators */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {platforms.map((platform) => {
          const isActive = completedProviders.includes(platform.key);
          const isInProgress = progress > 0 && progress < 100 && !isActive;

          return (
            <div
              key={platform.key}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                isActive
                  ? 'bg-gray-100'
                  : 'bg-gray-50 opacity-50'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  isActive ? '' : isInProgress ? 'animate-pulse' : ''
                }`}
                style={{
                  backgroundColor: isActive ? platform.color : '#D1D5DB',
                }}
              />
              <span className={isActive ? 'text-gray-700' : 'text-gray-400'}>
                {platform.name}
              </span>
              {isActive && (
                <Check className="w-3 h-3 text-gray-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
            className="px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
          >
            Start New Analysis
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-[#FAFAF8] pb-8"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }}
    >
      {/* Header */}
      <header className="pt-6 pb-4">
        <div className="max-w-2xl mx-auto px-6">
          <div className="flex items-center justify-between">
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
                  AI Brand Visibility Tracker
                </h1>
              </div>
            </div>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-9 h-9",
                },
              }}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 space-y-6">
        {/* Circular Progress Animation */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-gray-900">
              Analyzing <span className="text-gray-900">{runStatus.brand}</span>
            </h2>
            {runStatus.estimated_seconds_remaining !== null && runStatus.status === 'running' && (
              <p className="text-sm text-gray-500 mt-2 flex items-center justify-center gap-1">
                <Clock className="w-4 h-4" />
                ~{formatDuration(runStatus.estimated_seconds_remaining)} remaining
              </p>
            )}
          </div>

          {/* Circular Progress */}
          <CircularProgressAnimation
            progress={runStatus.progress_percent}
            completedProviders={
              runStatus.results
                ? [...new Set(runStatus.results.map((r: Result) => r.provider))]
                : []
            }
          />

          {/* Status Messages */}
          {runStatus.status === 'complete' && (
            <div className="mt-8 p-4 bg-gray-100 rounded-xl text-center">
              <CheckCircle2 className="w-8 h-8 text-gray-900 mx-auto mb-2" />
              <p className="text-gray-900 font-medium">
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
              className="px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
            >
              View Full Results
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

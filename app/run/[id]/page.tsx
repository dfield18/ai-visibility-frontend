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

// House Construction Animation Component - Thin black & white stick figure style
function TypingAnimation({ progress }: { progress: number }) {
  const [cursorVisible, setCursorVisible] = useState(true);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);

  const lines = [
    "Querying AI platforms...",
    "Analyzing brand mentions...",
    "Evaluating sentiment...",
    "Calculating visibility scores...",
    "Compiling results..."
  ];

  // Blink cursor
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Type characters
  useEffect(() => {
    const lineIndex = Math.min(Math.floor(progress / 20), lines.length - 1);
    setCurrentLineIndex(lineIndex);

    // Calculate how many chars to show based on progress within current segment
    const segmentProgress = progress % 20;
    const currentLine = lines[lineIndex];
    const charsToShow = Math.floor((segmentProgress / 20) * currentLine.length);
    setDisplayedChars(charsToShow);
  }, [progress]);

  // Get completed lines
  const completedLines = lines.slice(0, currentLineIndex);
  const currentLine = lines[currentLineIndex];
  const displayedText = currentLine?.substring(0, displayedChars) || "";

  return (
    <div className="w-full max-w-sm mx-auto font-mono text-sm">
      {/* Terminal-like container */}
      <div className="bg-gray-900 rounded-lg p-4 shadow-lg">
        {/* Terminal header */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-2 text-gray-400 text-xs">AI Visibility Analysis</span>
        </div>

        {/* Terminal content */}
        <div className="space-y-1 min-h-[120px]">
          {/* Completed lines with checkmarks */}
          {completedLines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <span className="text-gray-400">{line}</span>
            </div>
          ))}

          {/* Current typing line */}
          {currentLine && (
            <div className="flex items-center gap-2">
              <span className="text-[#4A7C59]">›</span>
              <span className="text-green-400">
                {displayedText}
                <span
                  className={`inline-block w-2 h-4 ml-0.5 bg-green-400 align-middle ${
                    cursorVisible ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </span>
            </div>
          )}

          {/* Remaining lines (dimmed) */}
          {lines.slice(currentLineIndex + 1).map((line, idx) => (
            <div key={idx} className="flex items-center gap-2 opacity-30">
              <span className="text-gray-500">○</span>
              <span className="text-gray-600">{line}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-4 pt-3 border-t border-gray-700">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4A7C59] rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
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
            className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-xl hover:bg-[#3d6649] transition-colors"
          >
            Start New Analysis
          </button>
        </div>
      </main>
    );
  }

  const recentResults = runStatus.results
    .filter((r: Result) => r.response_text)
    .slice(-5)
    .reverse();

  return (
    <main className="min-h-screen bg-[#FAFAF8] pb-8">
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
        {/* House Construction Animation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <TypingAnimation progress={runStatus.progress_percent} />

          {/* Progress Info */}
          <div className="mt-8 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Analyzing <span className="text-[#4A7C59]">{runStatus.brand}</span>
            </h2>

            {/* Progress Bar */}
            <div className="mt-4 mb-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-[#4A7C59]"
                  style={{ width: `${runStatus.progress_percent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
              <span className="font-medium text-lg text-gray-900">
                {Math.round(runStatus.progress_percent)}%
              </span>
              {runStatus.estimated_seconds_remaining !== null && runStatus.status === 'running' && (
                <>
                  <span className="text-gray-400">|</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    ~{formatDuration(runStatus.estimated_seconds_remaining)} remaining
                  </span>
                </>
              )}
            </div>
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

        {/* Recent Results */}
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

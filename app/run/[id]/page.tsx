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
function HouseConstruction({ progress }: { progress: number }) {
  const [workerPosition, setWorkerPosition] = useState(0);

  // Cycle worker position every 400ms
  useEffect(() => {
    const interval = setInterval(() => {
      setWorkerPosition((prev) => (prev + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Progress thresholds for each element
  const showFoundation = progress >= 10;
  const showLeftWall = progress >= 20;
  const showRightWall = progress >= 30;
  const showRoofLeft = progress >= 45;
  const showRoofRight = progress >= 55;
  const showDoor = progress >= 65;
  const showWindow = progress >= 75;
  const showChimney = progress >= 88;

  // Calculate stroke dashoffset for progressive reveal
  const getStrokeDashoffset = (pathLength: number, visible: boolean) => {
    if (!visible) return pathLength;
    return 0;
  };

  // Worker position based on what's currently being built
  const getWorkerPosition = () => {
    if (progress < 10) return { x: 100, y: 132 }; // At scaffolding center
    if (progress < 20) return { x: 100, y: 132 }; // Building foundation
    if (progress < 30) return { x: 50, y: 110 }; // Building left wall
    if (progress < 45) return { x: 150, y: 110 }; // Building right wall
    if (progress < 55) return { x: 70, y: 70 }; // Building left roof
    if (progress < 65) return { x: 130, y: 70 }; // Building right roof
    if (progress < 75) return { x: 100, y: 120 }; // Building door
    if (progress < 88) return { x: 132, y: 107 }; // Building window
    return { x: 126, y: 50 }; // Building chimney
  };

  const workerPos = getWorkerPosition();
  // Add slight movement based on animation frame
  const workerX = workerPos.x + (workerPosition - 1) * 3;
  const workerY = workerPos.y;

  return (
    <svg viewBox="0 0 220 170" className="w-full max-w-xs mx-auto">
      {/* Ground line */}
      <line
        x1="10"
        y1="145"
        x2="210"
        y2="145"
        stroke="#000"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Scaffolding - always visible from the start */}
      <g stroke="#000" strokeWidth="0.75" fill="none" opacity="0.6">
        {/* Vertical poles */}
        <line x1="35" y1="145" x2="35" y2="30" />
        <line x1="165" y1="145" x2="165" y2="30" />

        {/* Horizontal supports */}
        <line x1="32" y1="145" x2="168" y2="145" />
        <line x1="32" y1="110" x2="168" y2="110" />
        <line x1="32" y1="75" x2="168" y2="75" />
        <line x1="32" y1="45" x2="168" y2="45" />

        {/* Cross braces */}
        <line x1="35" y1="145" x2="50" y2="110" strokeDasharray="2,2" />
        <line x1="165" y1="145" x2="150" y2="110" strokeDasharray="2,2" />
        <line x1="35" y1="75" x2="50" y2="45" strokeDasharray="2,2" />
        <line x1="165" y1="75" x2="150" y2="45" strokeDasharray="2,2" />

        {/* Platform boards at work levels */}
        <line x1="35" y1="110" x2="55" y2="110" strokeWidth="1.5" />
        <line x1="145" y1="110" x2="165" y2="110" strokeWidth="1.5" />
        <line x1="60" y1="75" x2="85" y2="75" strokeWidth="1.5" />
        <line x1="115" y1="75" x2="140" y2="75" strokeWidth="1.5" />
        <line x1="115" y1="45" x2="140" y2="45" strokeWidth="1.5" />
      </g>

      {/* Ghost outline of complete house (very light) */}
      <g opacity="0.1" stroke="#000" strokeWidth="1" fill="none">
        {/* Foundation */}
        <line x1="40" y1="140" x2="160" y2="140" />
        {/* Left wall */}
        <line x1="50" y1="140" x2="50" y2="80" />
        {/* Right wall */}
        <line x1="150" y1="140" x2="150" y2="80" />
        {/* Roof left */}
        <line x1="45" y1="80" x2="100" y2="40" />
        {/* Roof right */}
        <line x1="155" y1="80" x2="100" y2="40" />
        {/* Door */}
        <rect x="90" y="105" width="20" height="35" />
        {/* Window */}
        <rect x="125" y="100" width="15" height="15" />
        {/* Chimney */}
        <rect x="120" y="35" width="12" height="25" />
      </g>

      {/* Animated construction elements - thin black lines */}
      <g stroke="#000" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Foundation */}
        <line
          x1="40"
          y1="140"
          x2="160"
          y2="140"
          strokeDasharray="120"
          strokeDashoffset={getStrokeDashoffset(120, showFoundation)}
          className="transition-all duration-700 ease-out"
        />

        {/* Left wall */}
        <line
          x1="50"
          y1="140"
          x2="50"
          y2="80"
          strokeDasharray="60"
          strokeDashoffset={getStrokeDashoffset(60, showLeftWall)}
          className="transition-all duration-500 ease-out"
        />

        {/* Right wall */}
        <line
          x1="150"
          y1="140"
          x2="150"
          y2="80"
          strokeDasharray="60"
          strokeDashoffset={getStrokeDashoffset(60, showRightWall)}
          className="transition-all duration-500 ease-out"
        />

        {/* Top wall connecting line */}
        {showRightWall && (
          <line
            x1="50"
            y1="80"
            x2="150"
            y2="80"
            strokeDasharray="100"
            strokeDashoffset={0}
            className="transition-all duration-500 ease-out"
          />
        )}

        {/* Roof left side */}
        <line
          x1="45"
          y1="80"
          x2="100"
          y2="40"
          strokeDasharray="70"
          strokeDashoffset={getStrokeDashoffset(70, showRoofLeft)}
          className="transition-all duration-500 ease-out"
        />

        {/* Roof right side */}
        <line
          x1="155"
          y1="80"
          x2="100"
          y2="40"
          strokeDasharray="70"
          strokeDashoffset={getStrokeDashoffset(70, showRoofRight)}
          className="transition-all duration-500 ease-out"
        />

        {/* Door */}
        <rect
          x="90"
          y="105"
          width="20"
          height="35"
          strokeDasharray="110"
          strokeDashoffset={getStrokeDashoffset(110, showDoor)}
          className="transition-all duration-500 ease-out"
        />
        {/* Door knob */}
        {showDoor && (
          <circle cx="105" cy="122" r="1.5" fill="#000" />
        )}

        {/* Window */}
        <rect
          x="125"
          y="100"
          width="15"
          height="15"
          strokeDasharray="60"
          strokeDashoffset={getStrokeDashoffset(60, showWindow)}
          className="transition-all duration-500 ease-out"
        />
        {/* Window cross */}
        {showWindow && (
          <>
            <line x1="132.5" y1="100" x2="132.5" y2="115" strokeWidth="1" />
            <line x1="125" y1="107.5" x2="140" y2="107.5" strokeWidth="1" />
          </>
        )}

        {/* Chimney */}
        <rect
          x="120"
          y="35"
          width="12"
          height="25"
          strokeDasharray="74"
          strokeDashoffset={getStrokeDashoffset(74, showChimney)}
          className="transition-all duration-500 ease-out"
        />
        {/* Smoke */}
        {showChimney && progress >= 95 && (
          <g className="animate-pulse" opacity="0.5">
            <path
              d="M126 33 Q129 25 124 18 Q122 12 126 5"
              strokeWidth="1"
              fill="none"
            />
          </g>
        )}
      </g>

      {/* Animated stick figure construction worker - black & white */}
      <g
        transform={`translate(${workerX}, ${workerY})`}
        stroke="#000"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="transition-all duration-300 ease-in-out"
      >
        {/* Head - simple circle */}
        <circle cx="0" cy="-28" r="4" fill="none" />

        {/* Body - single line */}
        <line x1="0" y1="-24" x2="0" y2="-10" />

        {/* Legs - two lines */}
        <line x1="0" y1="-10" x2="-5" y2="0" />
        <line x1="0" y1="-10" x2="5" y2="0" />

        {/* Arms - animated based on position */}
        {workerPosition === 0 && (
          <>
            <line x1="0" y1="-20" x2="-8" y2="-15" />
            <line x1="0" y1="-20" x2="8" y2="-25" />
            {/* Hammer */}
            <line x1="8" y1="-25" x2="12" y2="-30" strokeWidth="1" />
            <line x1="10" y1="-32" x2="14" y2="-28" strokeWidth="2" />
          </>
        )}
        {workerPosition === 1 && (
          <>
            <line x1="0" y1="-20" x2="-8" y2="-18" />
            <line x1="0" y1="-20" x2="8" y2="-18" />
            {/* Hammer */}
            <line x1="8" y1="-18" x2="14" y2="-18" strokeWidth="1" />
            <line x1="14" y1="-20" x2="14" y2="-16" strokeWidth="2" />
          </>
        )}
        {workerPosition === 2 && (
          <>
            <line x1="0" y1="-20" x2="-8" y2="-25" />
            <line x1="0" y1="-20" x2="8" y2="-12" />
            {/* Hammer */}
            <line x1="8" y1="-12" x2="12" y2="-8" strokeWidth="1" />
            <line x1="10" y1="-6" x2="14" y2="-10" strokeWidth="2" />
          </>
        )}
      </g>
    </svg>
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
          <HouseConstruction progress={runStatus.progress_percent} />

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
              <span className="text-gray-400">|</span>
              <span>
                {completedCalls} of {runStatus.total_calls} calls
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

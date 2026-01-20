'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  X,
  Edit2,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Spinner } from '@/components/ui/Spinner';
import { useStore } from '@/hooks/useStore';
import { useSuggestions, useStartRun } from '@/hooks/useApi';
import {
  getSessionId,
  calculateEstimatedCost,
  calculateTotalCalls,
  estimateDuration,
  formatCurrency,
  formatDuration,
} from '@/lib/utils';

const PROVIDER_INFO = {
  openai: {
    name: 'OpenAI GPT-4o',
    cost: '$0.003/call',
    icon: '🤖',
  },
  gemini: {
    name: 'Google Gemini Flash',
    cost: '$0.00025/call',
    icon: '✨',
  },
};

export default function ConfigurePage() {
  const router = useRouter();
  const {
    brand,
    prompts,
    selectedPrompts,
    setPrompts,
    togglePrompt,
    addPrompt,
    removePrompt,
    updatePrompt,
    competitors,
    selectedCompetitors,
    setCompetitors,
    toggleCompetitor,
    addCompetitor,
    removeCompetitor,
    providers,
    toggleProvider,
    temperatures,
    setTemperatures,
    repeats,
    setRepeats,
  } = useStore();

  const [newPrompt, setNewPrompt] = useState('');
  const [newCompetitor, setNewCompetitor] = useState('');
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suggestions, isLoading: suggestionsLoading, error: suggestionsError } = useSuggestions(brand);
  const startRunMutation = useStartRun();

  // Redirect if no brand
  useEffect(() => {
    if (!brand) {
      router.push('/');
    }
  }, [brand, router]);

  // Populate prompts and competitors from suggestions
  useEffect(() => {
    if (suggestions) {
      if (prompts.length === 0) {
        setPrompts(suggestions.prompts);
      }
      if (competitors.length === 0) {
        setCompetitors(suggestions.competitors);
      }
    }
  }, [suggestions, prompts.length, competitors.length, setPrompts, setCompetitors]);

  // Calculate estimates
  const selectedPromptsArray = Array.from(selectedPrompts);
  const selectedCompetitorsArray = Array.from(selectedCompetitors);
  const totalCalls = calculateTotalCalls(
    selectedPromptsArray.length,
    providers.length,
    temperatures.length,
    repeats
  );
  const estimatedCost = calculateEstimatedCost(
    selectedPromptsArray.length,
    providers.length,
    temperatures.length,
    repeats,
    providers
  );
  const estimatedTime = estimateDuration(totalCalls);

  const handleAddPrompt = () => {
    if (newPrompt.trim() && prompts.length < 10) {
      addPrompt(newPrompt.trim());
      setNewPrompt('');
    }
  };

  const handleAddCompetitor = () => {
    if (newCompetitor.trim() && competitors.length < 10) {
      addCompetitor(newCompetitor.trim());
      setNewCompetitor('');
    }
  };

  const handleEditPrompt = (index: number) => {
    setEditingPromptIndex(index);
    setEditingPromptValue(prompts[index]);
  };

  const handleSavePromptEdit = () => {
    if (editingPromptIndex !== null && editingPromptValue.trim()) {
      updatePrompt(prompts[editingPromptIndex], editingPromptValue.trim());
      setEditingPromptIndex(null);
      setEditingPromptValue('');
    }
  };

  const handleRunAnalysis = async () => {
    if (selectedPromptsArray.length === 0) {
      setError('Please select at least one prompt');
      return;
    }
    if (providers.length === 0) {
      setError('Please select at least one provider');
      return;
    }

    setError(null);

    try {
      const result = await startRunMutation.mutateAsync({
        session_id: getSessionId(),
        brand,
        prompts: selectedPromptsArray,
        competitors: selectedCompetitorsArray,
        providers,
        temperatures,
        repeats,
      });
      router.push(`/run/${result.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    }
  };

  const canRun = selectedPromptsArray.length > 0 && providers.length > 0 && !startRunMutation.isPending;

  if (!brand) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Configuring analysis for{' '}
                <span className="text-blue-600">{brand}</span>
              </h1>
              <p className="text-sm text-gray-500">
                Customize prompts, competitors, and AI models
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Error Alert */}
        {(error || suggestionsError) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">
                {error || (suggestionsError instanceof Error ? suggestionsError.message : 'Failed to load suggestions')}
              </p>
            </div>
          </div>
        )}

        {/* Prompts Section */}
        <Card padding="md">
          <div className="flex items-start justify-between mb-4">
            <div>
              <CardTitle>Search Prompts</CardTitle>
              <CardDescription>
                These queries will be sent to AI models
              </CardDescription>
            </div>
            <span className="text-sm text-gray-500">
              {selectedPromptsArray.length}/{prompts.length} selected
            </span>
          </div>

          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-3 text-gray-600">Generating prompts with AI...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {prompts.map((prompt, index) => (
                <div
                  key={prompt}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group"
                >
                  <Checkbox
                    checked={selectedPrompts.has(prompt)}
                    onChange={() => togglePrompt(prompt)}
                  />
                  {editingPromptIndex === index ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editingPromptValue}
                        onChange={(e) => setEditingPromptValue(e.target.value)}
                        className="flex-1 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSavePromptEdit();
                          if (e.key === 'Escape') setEditingPromptIndex(null);
                        }}
                      />
                      <button
                        onClick={handleSavePromptEdit}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingPromptIndex(null)}
                        className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-gray-700">{prompt}</span>
                      <button
                        onClick={() => handleEditPrompt(index)}
                        className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Edit prompt"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removePrompt(prompt)}
                        className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove prompt"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {prompts.length < 10 && (
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Add custom prompt..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPrompt();
                }}
              />
              <Button
                variant="secondary"
                onClick={handleAddPrompt}
                disabled={!newPrompt.trim()}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Maximum 10 prompts
          </p>
        </Card>

        {/* Competitors Section */}
        <Card padding="md">
          <div className="flex items-start justify-between mb-4">
            <div>
              <CardTitle>Competitors to Track</CardTitle>
              <CardDescription>
                We&apos;ll check if these brands are mentioned in responses
              </CardDescription>
            </div>
            <span className="text-sm text-gray-500">
              {selectedCompetitorsArray.length}/{competitors.length} selected
            </span>
          </div>

          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-3 text-gray-600">Identifying competitors...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {competitors.map((competitor) => (
                <div
                  key={competitor}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    selectedCompetitors.has(competitor)
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                  onClick={() => toggleCompetitor(competitor)}
                >
                  <Checkbox
                    checked={selectedCompetitors.has(competitor)}
                    onChange={() => {}}
                  />
                  <span className="text-sm font-medium">{competitor}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCompetitor(competitor);
                    }}
                    className="p-0.5 hover:text-red-500"
                    aria-label="Remove competitor"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {competitors.length < 10 && (
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
                placeholder="Add competitor..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCompetitor();
                }}
              />
              <Button
                variant="secondary"
                onClick={handleAddCompetitor}
                disabled={!newCompetitor.trim()}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Maximum 10 competitors
          </p>
        </Card>

        {/* Providers Section */}
        <Card padding="md">
          <div className="mb-4">
            <CardTitle>AI Models</CardTitle>
            <CardDescription>
              Select which AI models to query
            </CardDescription>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(PROVIDER_INFO).map(([key, info]) => (
              <button
                key={key}
                onClick={() => toggleProvider(key)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  providers.includes(key)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{info.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900">{info.name}</p>
                    <p className="text-sm text-gray-500">{info.cost}</p>
                  </div>
                  <div className="ml-auto">
                    <Checkbox checked={providers.includes(key)} onChange={() => {}} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Advanced Settings */}
        <Card padding="md">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between"
          >
            <div>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>
                Temperature and repeat configuration
              </CardDescription>
            </div>
            {showAdvanced ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-6">
              {/* Temperatures */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Temperatures
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Higher temperatures produce more creative/varied responses. Lower temperatures are more deterministic.
                </p>
                <div className="flex gap-2">
                  {[0.3, 0.7, 1.0].map((temp) => (
                    <button
                      key={temp}
                      onClick={() => {
                        if (temperatures.includes(temp)) {
                          if (temperatures.length > 1) {
                            setTemperatures(temperatures.filter((t) => t !== temp));
                          }
                        } else {
                          setTemperatures([...temperatures, temp].sort());
                        }
                      }}
                      className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                        temperatures.includes(temp)
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {temp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Repeats */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Repeats per configuration: {repeats}
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Run each prompt/provider/temperature combination multiple times for statistical significance.
                </p>
                <input
                  type="range"
                  min={1}
                  max={3}
                  value={repeats}
                  onChange={(e) => setRepeats(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <p className="text-gray-600">
                <span className="font-medium">{selectedPromptsArray.length}</span> prompts{' '}
                <span className="text-gray-400">×</span>{' '}
                <span className="font-medium">{providers.length}</span> providers{' '}
                <span className="text-gray-400">×</span>{' '}
                <span className="font-medium">{temperatures.length}</span> temps{' '}
                <span className="text-gray-400">×</span>{' '}
                <span className="font-medium">{repeats}</span> repeats{' '}
                <span className="text-gray-400">=</span>{' '}
                <span className="font-bold text-gray-900">{totalCalls} calls</span>
              </p>
              <p className="text-gray-500">
                Estimated: {formatCurrency(estimatedCost)} &middot; {formatDuration(estimatedTime)}
              </p>
              {totalCalls > 100 && (
                <p className="text-yellow-600 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-4 h-4" />
                  Large run - consider reducing configuration
                </p>
              )}
            </div>
            <Button
              size="lg"
              onClick={handleRunAnalysis}
              disabled={!canRun}
              loading={startRunMutation.isPending}
              className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Run Analysis ({formatCurrency(estimatedCost)})
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  AlertTriangle,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
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
    name: 'OpenAI ChatGPT',
    cost: 'from $0.0003/call',
  },
  gemini: {
    name: 'Google Gemini Flash',
    cost: '$0.00025/call',
  },
  anthropic: {
    name: 'Anthropic Claude',
    cost: 'from $0.025/call',
  },
  perplexity: {
    name: 'Perplexity Sonar',
    cost: '$0.001/call',
  },
  ai_overviews: {
    name: 'Google AI Overviews',
    cost: '$0.005/call',
  },
};

export default function ConfigurePage() {
  const router = useRouter();
  const {
    brand,
    searchType,
    prompts,
    selectedPrompts,
    setPrompts,
    togglePrompt,
    selectAllPrompts,
    deselectAllPrompts,
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
    openaiModel,
    setOpenaiModel,
    anthropicModel,
    setAnthropicModel,
    country,
    setCountry,
  } = useStore();

  // Labels based on search type
  const isCategory = searchType === 'category';
  const brandsLabel = isCategory ? 'Brands to Track' : 'Competitors to Track';
  const brandsDescription = isCategory
    ? "We'll check if these brands are mentioned in responses"
    : "We'll check if these competitors are mentioned in responses";
  const brandsLoadingText = isCategory ? 'Identifying brands...' : 'Identifying competitors...';
  const addBrandPlaceholder = isCategory ? 'Add brand...' : 'Add competitor...';

  const [newPrompt, setNewPrompt] = useState('');
  const [newCompetitor, setNewCompetitor] = useState('');
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: suggestions, isLoading: suggestionsLoading, error: suggestionsError } = useSuggestions(brand, searchType);
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
    providers,
    openaiModel,
    anthropicModel
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
        search_type: searchType,
        prompts: selectedPromptsArray,
        competitors: selectedCompetitorsArray,
        providers,
        temperatures,
        repeats,
        openai_model: openaiModel,
        anthropic_model: anthropicModel,
        country,
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
    <main className="min-h-screen bg-[#FAFAF8] pb-32">
      {/* Header */}
      <header className="pt-6 pb-4">
        <div className="max-w-3xl mx-auto px-6">
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
                Configuring analysis for{' '}
                <span className="text-[#4A7C59]">{brand}</span>
                {isCategory && <span className="text-gray-500 text-sm font-normal ml-1">(category)</span>}
              </h1>
              <p className="text-sm text-gray-500">
                Customize prompts, {isCategory ? 'brands' : 'competitors'}, and AI models
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 space-y-6">
        {/* Error Alert */}
        {(error || suggestionsError) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Search Prompts</h2>
              <p className="text-sm text-gray-500">
                These queries will be sent to AI models
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {selectedPromptsArray.length}/{prompts.length} selected
            </span>
          </div>

          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-3 text-gray-500">Generating prompts with AI...</span>
            </div>
          ) : (
            <>
              {/* Select All Checkbox - Separate Section */}
              {prompts.length > 0 && (
                <div
                  className="flex items-center justify-between px-3 py-2 mb-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 rounded-t-lg transition-colors"
                  onClick={() => {
                    if (selectedPrompts.size === prompts.length) {
                      deselectAllPrompts();
                    } else {
                      selectAllPrompts();
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                        selectedPrompts.size === prompts.length
                          ? 'bg-[#5B7B5D]'
                          : selectedPrompts.size > 0
                          ? 'bg-[#5B7B5D]/50'
                          : 'bg-[#E8E8E0]'
                      }`}
                    >
                      {selectedPrompts.size === prompts.length ? (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      ) : selectedPrompts.size > 0 ? (
                        <div className="w-2 h-0.5 bg-white rounded" />
                      ) : null}
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      {selectedPrompts.size === prompts.length ? 'Deselect all' : 'Select all'}
                    </span>
                  </div>
                </div>
              )}

              {/* Prompts List */}
              <div className="space-y-2">
              {prompts.map((prompt, index) => (
                <div
                  key={prompt}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 group cursor-pointer"
                  onClick={() => {
                    if (editingPromptIndex !== index) {
                      togglePrompt(prompt);
                    }
                  }}
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedPrompts.has(prompt)
                        ? 'bg-[#5B7B5D]'
                        : 'bg-[#E8E8E0]'
                    }`}
                  >
                    {selectedPrompts.has(prompt) && (
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                  {editingPromptIndex === index ? (
                    <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingPromptValue}
                        onChange={(e) => setEditingPromptValue(e.target.value)}
                        className="flex-1 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSavePromptEdit();
                          if (e.key === 'Escape') setEditingPromptIndex(null);
                        }}
                      />
                      <button
                        onClick={handleSavePromptEdit}
                        className="p-1.5 text-[#4A7C59] hover:bg-green-50 rounded-lg"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingPromptIndex(null)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-700">{prompt}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditPrompt(index);
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg hover:bg-gray-100"
                        aria-label="Edit prompt"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
              </div>
            </>
          )}

          {prompts.length < 10 && (
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Add custom prompt..."
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent placeholder-gray-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPrompt();
                }}
              />
              <button
                onClick={handleAddPrompt}
                disabled={!newPrompt.trim()}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </div>

        {/* Competitors/Brands Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{brandsLabel}</h2>
              <p className="text-sm text-gray-500">
                {brandsDescription}
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {selectedCompetitorsArray.length}/{competitors.length} selected
            </span>
          </div>

          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-3 text-gray-500">{brandsLoadingText}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {competitors.map((competitor) => (
                <div
                  key={competitor}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                    selectedCompetitors.has(competitor)
                      ? 'bg-[#E8F0E8] border-[#5B7B5D]/30 text-[#4A7C59]'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => toggleCompetitor(competitor)}
                >
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                      selectedCompetitors.has(competitor)
                        ? 'bg-[#5B7B5D]'
                        : 'bg-[#E8E8E0]'
                    }`}
                  >
                    {selectedCompetitors.has(competitor) && (
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <span className="text-sm font-medium">{competitor}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCompetitor(competitor);
                    }}
                    className="p-0.5 hover:text-red-500 transition-colors"
                    aria-label="Remove competitor"
                  >
                    <X className="w-3.5 h-3.5" />
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
                placeholder={addBrandPlaceholder}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent placeholder-gray-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCompetitor();
                }}
              />
              <button
                onClick={handleAddCompetitor}
                disabled={!newCompetitor.trim()}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </div>

        {/* Providers Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900">AI Models</h2>
            <p className="text-sm text-gray-500">
              Select which AI models to query
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(PROVIDER_INFO).map(([key, info]) => (
              <button
                key={key}
                onClick={() => toggleProvider(key)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  providers.includes(key)
                    ? 'border-[#5B7B5D] bg-[#E8F0E8]'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                      providers.includes(key)
                        ? 'bg-[#5B7B5D]'
                        : 'bg-[#E8E8E0]'
                    }`}
                  >
                    {providers.includes(key) && (
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{info.name}</p>
                    <p className="text-xs text-gray-500">{info.cost}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Features Dropdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="text-left">
              <h2 className="text-base font-semibold text-gray-900">Advanced Features</h2>
              <p className="text-sm text-gray-500">
                Model selection, temperature, and repeat configuration
              </p>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-gray-400 transition-transform ${
                advancedOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {advancedOpen && (
            <div className="px-6 pb-6 pt-2 border-t border-gray-100 space-y-6">
              {/* Temperatures */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Temperatures
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Higher temperatures produce more creative responses. Lower temperatures are more deterministic.
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
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        temperatures.includes(temp)
                          ? 'bg-[#E8F0E8] border-[#5B7B5D] text-[#4A7C59]'
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
                <p className="text-xs text-gray-500 mb-3">
                  Run each prompt/provider/temperature combination multiple times for statistical significance.
                </p>
                <input
                  type="range"
                  min={1}
                  max={3}
                  value={repeats}
                  onChange={(e) => setRepeats(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#5B7B5D]"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                </div>
              </div>

              {/* OpenAI Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  OpenAI Model
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  GPT-4o-mini is faster and cheaper. GPT-4o is more capable but costs ~10x more.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOpenaiModel('gpt-4o-mini')}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      openaiModel === 'gpt-4o-mini'
                        ? 'bg-[#E8F0E8] border-[#5B7B5D] text-[#4A7C59]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    GPT-4o-mini
                    <span className="block text-xs font-normal opacity-70">$0.0003/call</span>
                  </button>
                  <button
                    onClick={() => setOpenaiModel('gpt-4o')}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      openaiModel === 'gpt-4o'
                        ? 'bg-[#E8F0E8] border-[#5B7B5D] text-[#4A7C59]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    GPT-4o
                    <span className="block text-xs font-normal opacity-70">$0.003/call</span>
                  </button>
                </div>
              </div>

              {/* Anthropic Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Claude Model
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Haiku 4.5 is faster and cheaper. Sonnet is more capable but costs more. Both include web search for sources.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAnthropicModel('claude-haiku-4-5-20251001')}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      anthropicModel === 'claude-haiku-4-5-20251001'
                        ? 'bg-[#E8F0E8] border-[#5B7B5D] text-[#4A7C59]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Claude Haiku 4.5
                    <span className="block text-xs font-normal opacity-70">~$0.025/call</span>
                  </button>
                  <button
                    onClick={() => setAnthropicModel('claude-sonnet-4-20250514')}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      anthropicModel === 'claude-sonnet-4-20250514'
                        ? 'bg-[#E8F0E8] border-[#5B7B5D] text-[#4A7C59]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Claude Sonnet
                    <span className="block text-xs font-normal opacity-70">~$0.035/call</span>
                  </button>
                </div>
              </div>

              {/* Country/Region */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country/Region
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Filter search results by country. Affects Google AI Overviews and web search results.
                </p>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                >
                  <option value="us">United States</option>
                  <option value="gb">United Kingdom</option>
                  <option value="ca">Canada</option>
                  <option value="au">Australia</option>
                  <option value="de">Germany</option>
                  <option value="fr">France</option>
                  <option value="es">Spain</option>
                  <option value="it">Italy</option>
                  <option value="nl">Netherlands</option>
                  <option value="br">Brazil</option>
                  <option value="mx">Mexico</option>
                  <option value="in">India</option>
                  <option value="jp">Japan</option>
                  <option value="kr">South Korea</option>
                  <option value="sg">Singapore</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-gray-600">
              <p>
                <span className="font-medium">{selectedPromptsArray.length}</span> prompts{' '}
                <span className="text-gray-400">×</span>{' '}
                <span className="font-medium">{providers.length}</span> providers{' '}
                <span className="text-gray-400">×</span>{' '}
                <span className="font-medium">{temperatures.length}</span> temps{' '}
                <span className="text-gray-400">×</span>{' '}
                <span className="font-medium">{repeats}</span> repeats{' '}
                <span className="text-gray-400">=</span>{' '}
                <span className="font-semibold text-gray-900">{totalCalls} calls</span>
              </p>
              <p className="text-gray-500">
                Estimated: {formatCurrency(estimatedCost)} · {formatDuration(estimatedTime)}
              </p>
            </div>
            <button
              onClick={handleRunAnalysis}
              disabled={!canRun}
              className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-xl hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {startRunMutation.isPending ? (
                <Spinner size="sm" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              Run Analysis ({formatCurrency(estimatedCost)})
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

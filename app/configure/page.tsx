'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  HelpCircle,
  MessageSquare,
  Users,
  Bot,
  Settings2,
  Globe,
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

const PROVIDER_INFO: Record<string, { name: string; description: string; cost: string }> = {
  openai: {
    name: 'ChatGPT',
    description: 'Most popular AI assistant',
    cost: 'from $0.0003/call',
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Google\'s AI with search integration',
    cost: '$0.00025/call',
  },
  anthropic: {
    name: 'Claude',
    description: 'Anthropic\'s AI with web search',
    cost: 'from $0.025/call',
  },
  perplexity: {
    name: 'Perplexity',
    description: 'AI-powered search engine',
    cost: '$0.001/call',
  },
  ai_overviews: {
    name: 'Google AI Overviews',
    description: 'AI summaries in Google Search',
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
    ? "Select which brands you want to monitor in AI responses"
    : "Select competitors to see how they compare to your brand";
  const brandsLoadingText = isCategory ? 'Finding relevant brands...' : 'Finding your competitors...';
  const addBrandPlaceholder = isCategory ? 'Add a brand...' : 'Add a competitor...';

  const [newPrompt, setNewPrompt] = useState('');
  const [newCompetitor, setNewCompetitor] = useState('');
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [addingCompetitor, setAddingCompetitor] = useState(false);

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
        const basePrompts = [...suggestions.prompts];

        // For brand searches, add a comparison question if there's a known competitor
        if (!isCategory && suggestions.competitors.length > 0) {
          const rival = suggestions.competitors[0];
          const comparisonPrompt = `How does ${brand} compare to ${rival}?`;
          const alreadyHasComparison = basePrompts.some(
            (p) => p.toLowerCase().includes('compare') || p.toLowerCase().includes(' vs ')
          );
          if (!alreadyHasComparison) {
            basePrompts.push(comparisonPrompt);
          }
        }

        setPrompts(basePrompts);
      }
      if (competitors.length === 0) {
        setCompetitors(suggestions.competitors);
      }
    }
  }, [suggestions, prompts.length, competitors.length, setPrompts, setCompetitors, isCategory, brand]);

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
      setError('Please select at least one question');
      return;
    }
    if (providers.length === 0) {
      setError('Please select at least one AI platform');
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
    <main className="min-h-screen bg-gradient-to-b from-[#FAFAF8] to-[#F5F5F0] pb-32">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Configure Analysis</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-[#4A7C59]/10 text-[#4A7C59]">
                    {brand}
                  </span>
                  {isCategory && (
                    <span className="text-xs text-gray-400">(category search)</span>
                  )}
                </div>
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

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Error Alert */}
        {(error || suggestionsError) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Something went wrong</p>
              <p className="text-sm text-red-700">
                {error || (suggestionsError instanceof Error ? suggestionsError.message : 'Failed to load suggestions')}
              </p>
            </div>
          </div>
        )}

        {/* Questions Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-[#4A7C59]/10 rounded-lg">
                <MessageSquare className="w-4 h-4 text-[#4A7C59]" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gray-900">Questions to Ask AI</h2>
              </div>
              <span className="text-xs font-medium text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full">
                {selectedPromptsArray.length} selected
              </span>
            </div>
          </div>

          <div className="p-3">
            {suggestionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
                <span className="ml-3 text-gray-500 text-sm">Generating smart questions...</span>
              </div>
            ) : (
              <>
                {/* Select All */}
                {prompts.length > 0 && (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      if (selectedPrompts.size === prompts.length) {
                        deselectAllPrompts();
                      } else {
                        selectAllPrompts();
                      }
                    }}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                        selectedPrompts.size === prompts.length
                          ? 'bg-[#4A7C59]'
                          : selectedPrompts.size > 0
                          ? 'bg-[#4A7C59]/50'
                          : 'border-2 border-gray-300'
                      }`}
                    >
                      {selectedPrompts.size === prompts.length ? (
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      ) : selectedPrompts.size > 0 ? (
                        <div className="w-1.5 h-0.5 bg-white rounded" />
                      ) : null}
                    </div>
                    <span className="text-xs font-medium text-gray-600">
                      {selectedPrompts.size === prompts.length ? 'Deselect all' : 'Select all'}
                    </span>
                  </button>
                )}

                {/* Questions List */}
                <div className="space-y-0.5">
                  {prompts.map((prompt, index) => (
                    <div
                      key={prompt}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all group ${
                        selectedPrompts.has(prompt)
                          ? 'bg-[#4A7C59]/5 hover:bg-[#4A7C59]/10'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        if (editingPromptIndex !== index) {
                          togglePrompt(prompt);
                        }
                      }}
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                          selectedPrompts.has(prompt)
                            ? 'bg-[#4A7C59]'
                            : 'border-2 border-gray-300'
                        }`}
                      >
                        {selectedPrompts.has(prompt) && (
                          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                        )}
                      </div>
                      {editingPromptIndex === index ? (
                        <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingPromptValue}
                            onChange={(e) => setEditingPromptValue(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 border border-[#4A7C59] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/20"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePromptEdit();
                              if (e.key === 'Escape') setEditingPromptIndex(null);
                            }}
                          />
                          <button
                            onClick={handleSavePromptEdit}
                            className="p-1.5 text-[#4A7C59] hover:bg-[#4A7C59]/10 rounded-lg transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingPromptIndex(null)}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className={`flex-1 text-sm ${selectedPrompts.has(prompt) ? 'text-gray-900' : 'text-gray-600'}`}>
                            {prompt}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPrompt(index);
                            }}
                            className="p-1 text-gray-400 hover:text-[#4A7C59] opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-white"
                            aria-label="Edit question"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="mt-3 pt-3 border-t border-gray-100">
                {addingPrompt ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      placeholder="Type your question here..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/20 focus:border-[#4A7C59] placeholder-gray-400"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { handleAddPrompt(); }
                        if (e.key === 'Escape') { setAddingPrompt(false); setNewPrompt(''); }
                      }}
                    />
                    <button
                      onClick={handleAddPrompt}
                      disabled={!newPrompt.trim()}
                      className="px-3 py-2 text-sm bg-[#4A7C59] text-white rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingPrompt(false); setNewPrompt(''); }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingPrompt(true)}
                    className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#4A7C59]/5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add your own question
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Competitors/Brands Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-[#4A7C59]/10 rounded-lg">
                <Users className="w-5 h-5 text-[#4A7C59]" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">{brandsLabel}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{brandsDescription}</p>
              </div>
              <span className="text-sm font-medium text-[#4A7C59] bg-[#4A7C59]/10 px-2.5 py-1 rounded-full">
                {selectedCompetitorsArray.length} selected
              </span>
            </div>
          </div>

          <div className="p-4">
            {suggestionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
                <span className="ml-3 text-gray-500">{brandsLoadingText}</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {competitors.map((competitor) => (
                  <button
                    key={competitor}
                    type="button"
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      selectedCompetitors.has(competitor)
                        ? 'bg-[#4A7C59]/10 border-[#4A7C59]/30 text-[#4A7C59]'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-100'
                    }`}
                    onClick={() => toggleCompetitor(competitor)}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                        selectedCompetitors.has(competitor)
                          ? 'bg-[#4A7C59]'
                          : 'border-2 border-gray-300'
                      }`}
                    >
                      {selectedCompetitors.has(competitor) && (
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      )}
                    </div>
                    <span>{competitor}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCompetitor(competitor);
                      }}
                      className="p-0.5 hover:text-red-500 transition-colors ml-1"
                      aria-label="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </button>
                ))}
              </div>
            )}

            {competitors.length < 10 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {addingCompetitor ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCompetitor}
                      onChange={(e) => setNewCompetitor(e.target.value)}
                      placeholder={addBrandPlaceholder}
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/20 focus:border-[#4A7C59] placeholder-gray-400"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { handleAddCompetitor(); }
                        if (e.key === 'Escape') { setAddingCompetitor(false); setNewCompetitor(''); }
                      }}
                    />
                    <button
                      onClick={handleAddCompetitor}
                      disabled={!newCompetitor.trim()}
                      className="px-4 py-2.5 text-sm bg-[#4A7C59] text-white rounded-xl hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingCompetitor(false); setNewCompetitor(''); }}
                      className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingCompetitor(true)}
                    className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-[#4A7C59]/5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add {isCategory ? 'another brand' : 'another competitor'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AI Platforms Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-[#4A7C59]/10 rounded-lg">
                <Bot className="w-5 h-5 text-[#4A7C59]" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">AI Platforms to Test</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Choose which AI assistants to include in your analysis
                </p>
              </div>
              <span className="text-sm font-medium text-[#4A7C59] bg-[#4A7C59]/10 px-2.5 py-1 rounded-full">
                {providers.length} selected
              </span>
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleProvider(key)}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                    providers.includes(key)
                      ? 'bg-[#4A7C59]/5 border-[#4A7C59]/30'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                      providers.includes(key)
                        ? 'bg-[#4A7C59]'
                        : 'border-2 border-gray-300'
                    }`}
                  >
                    {providers.includes(key) && (
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${providers.includes(key) ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                      {info.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Settings2 className="w-5 h-5 text-gray-500" />
              </div>
              <div className="text-left">
                <h2 className="text-base font-semibold text-gray-900">Advanced Settings</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Fine-tune AI models, response variation, and region
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-gray-400 transition-transform ${
                advancedOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {advancedOpen && (
            <div className="px-6 pb-6 border-t border-gray-100 space-y-8">
              {/* Response Variation */}
              <div className="pt-6">
                <div className="flex items-start gap-2 mb-4">
                  <label className="block text-sm font-semibold text-gray-900">
                    Response Variation
                  </label>
                  <div className="group relative">
                    <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                      Controls how creative or consistent AI responses are. &quot;Consistent&quot; gives similar answers each time, &quot;Creative&quot; gives more varied responses.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {([0.3, 0.7, 1.0] as const).map((temp) => {
                    const config = {
                      0.3: { label: 'Consistent', desc: 'Reliable, similar answers' },
                      0.7: { label: 'Balanced', desc: 'Mix of consistency & variety' },
                      1.0: { label: 'Creative', desc: 'More varied responses' },
                    }[temp];
                    return (
                      <button
                        key={temp}
                        type="button"
                        onClick={() => {
                          if (temperatures.includes(temp)) {
                            if (temperatures.length > 1) {
                              setTemperatures(temperatures.filter((t) => t !== temp));
                            }
                          } else {
                            setTemperatures([...temperatures, temp].sort());
                          }
                        }}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          temperatures.includes(temp)
                            ? 'bg-[#4A7C59]/5 border-[#4A7C59]/30'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center ${
                              temperatures.includes(temp)
                                ? 'bg-[#4A7C59]'
                                : 'border-2 border-gray-300'
                            }`}
                          >
                            {temperatures.includes(temp) && (
                              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                            )}
                          </div>
                          <span className={`text-sm font-medium ${temperatures.includes(temp) ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                            {config.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 ml-6">{config.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Repeats */}
              <div>
                <div className="flex items-start gap-2 mb-4">
                  <label className="block text-sm font-semibold text-gray-900">
                    Repeat Each Question
                  </label>
                  <div className="group relative">
                    <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                      Running the same question multiple times helps ensure reliable results. More repeats = more accurate data but higher cost.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRepeats(num)}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        repeats === num
                          ? 'bg-[#4A7C59]/5 border-[#4A7C59]/30'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-lg font-semibold ${repeats === num ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                        {num}x
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {num === 1 ? 'Quick scan' : num === 2 ? 'Recommended' : 'Most accurate'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* OpenAI Model */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    ChatGPT Version
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setOpenaiModel('gpt-4o-mini')}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        openaiModel === 'gpt-4o-mini'
                          ? 'bg-[#4A7C59]/5 border-[#4A7C59]/30'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${openaiModel === 'gpt-4o-mini' ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                          GPT-4o Mini
                        </span>
                        <span className="text-xs text-gray-500">$0.0003/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Faster & more affordable</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenaiModel('gpt-4o')}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        openaiModel === 'gpt-4o'
                          ? 'bg-[#4A7C59]/5 border-[#4A7C59]/30'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${openaiModel === 'gpt-4o' ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                          GPT-4o
                        </span>
                        <span className="text-xs text-gray-500">$0.003/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">More capable, 10x cost</p>
                    </button>
                  </div>
                </div>

                {/* Anthropic Model */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    Claude Version
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setAnthropicModel('claude-haiku-4-5-20251001')}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        anthropicModel === 'claude-haiku-4-5-20251001'
                          ? 'bg-[#4A7C59]/5 border-[#4A7C59]/30'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${anthropicModel === 'claude-haiku-4-5-20251001' ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                          Claude Haiku
                        </span>
                        <span className="text-xs text-gray-500">~$0.025/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Fast with web search</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnthropicModel('claude-sonnet-4-20250514')}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        anthropicModel === 'claude-sonnet-4-20250514'
                          ? 'bg-[#4A7C59]/5 border-[#4A7C59]/30'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${anthropicModel === 'claude-sonnet-4-20250514' ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                          Claude Sonnet
                        </span>
                        <span className="text-xs text-gray-500">~$0.035/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">More capable with web search</p>
                    </button>
                  </div>
                </div>
              </div>

              {/* Region */}
              <div>
                <div className="flex items-start gap-3 mb-3">
                  <Globe className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <label className="block text-sm font-semibold text-gray-900">
                      Region
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Affects search results and AI Overviews based on location
                    </p>
                  </div>
                </div>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/20 focus:border-[#4A7C59] bg-white"
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
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <p className="text-gray-900">
                <span className="font-semibold">{selectedPromptsArray.length}</span> question{selectedPromptsArray.length !== 1 ? 's' : ''}{' '}
                <span className="text-gray-400">×</span>{' '}
                <span className="font-semibold">{providers.length}</span> platform{providers.length !== 1 ? 's' : ''}{' '}
                <span className="text-gray-400">=</span>{' '}
                <span className="font-bold text-[#4A7C59]">{totalCalls} API calls</span>
              </p>
              <p className="text-gray-500 mt-0.5">
                Estimated cost: {formatCurrency(estimatedCost)} · Time: {formatDuration(estimatedTime)}
              </p>
            </div>
            <button
              onClick={handleRunAnalysis}
              disabled={!canRun}
              className="px-8 py-3.5 bg-[#4A7C59] text-white font-semibold rounded-xl hover:bg-[#3d6649] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#4A7C59]/20 hover:shadow-xl hover:shadow-[#4A7C59]/30"
            >
              {startRunMutation.isPending ? (
                <Spinner size="sm" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              Run Analysis
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

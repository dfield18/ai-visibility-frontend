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
    <main className="min-h-screen bg-[#FAFAF8]">
      {/* Header - minimal, transparent */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Configure Analysis</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#4A7C59]/10 text-[#4A7C59]">
                  {brand}
                </span>
              </div>
            </div>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Error Alert */}
        {(error || suggestionsError) && (
          <div className="bg-red-50 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Something went wrong</p>
              <p className="text-sm text-red-700">
                {error || (suggestionsError instanceof Error ? suggestionsError.message : 'Failed to load suggestions')}
              </p>
            </div>
          </div>
        )}

        {/* Main three-column layout for desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Questions Section - no border/shadow, grouped section feel */}
          <div className="bg-white/60 rounded-2xl p-6">
            {/* Header with inline icon */}
            <div className="flex items-center gap-2 mb-5">
              <MessageSquare className="w-5 h-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900 flex-1">Questions to Ask AI</h2>
              <span className="text-sm text-[#4A7C59]/70 font-medium">
                {selectedPromptsArray.length} selected
              </span>
            </div>

            {suggestionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
                <span className="ml-3 text-gray-500 text-sm">Generating smart questions...</span>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Select All / Deselect All */}
                {prompts.length > 0 && (
                  <div
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all ${
                      selectedPrompts.size === prompts.length
                        ? 'bg-gray-100 hover:bg-gray-200'
                        : 'bg-[#E8F5E9]'
                    }`}
                    onClick={() => {
                      if (selectedPrompts.size === prompts.length) {
                        deselectAllPrompts();
                      } else {
                        selectAllPrompts();
                      }
                    }}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        selectedPrompts.size === prompts.length
                          ? 'bg-[#4A7C59]'
                          : 'border-2 border-[#4A7C59]'
                      }`}
                    >
                      {selectedPrompts.size === prompts.length && (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      )}
                    </div>
                    <span className="text-base font-semibold text-gray-700">
                      {selectedPrompts.size === prompts.length ? 'Deselect all' : 'Select all'}
                    </span>
                  </div>
                )}

                {/* Divider line */}
                {prompts.length > 0 && (
                  <div className="border-t border-gray-200 my-2" />
                )}

                {/* Questions List */}
                {prompts.map((prompt, index) => (
                  <div
                    key={prompt}
                    className={`flex items-start gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all group ${
                      selectedPrompts.has(prompt)
                        ? 'bg-white'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      if (editingPromptIndex !== index) {
                        togglePrompt(prompt);
                      }
                    }}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                        selectedPrompts.has(prompt)
                          ? 'bg-[#4A7C59]'
                          : 'border-2 border-gray-300'
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
                        <span className="flex-1 text-sm text-gray-600 leading-relaxed">
                          {prompt}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditPrompt(index);
                          }}
                          className="p-1 text-gray-400 hover:text-[#4A7C59] opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-gray-100"
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
            )}

            {prompts.length < 10 && (
              <div className="mt-4">
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
                    className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add your own question
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Competitors Section */}
          <div className="bg-white/60 rounded-2xl p-6">
            {/* Header with inline icon */}
            <div className="flex items-start gap-2 mb-2">
              <Users className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">{brandsLabel}</h2>
                  <span className="text-sm text-purple-600/70 font-medium">
                    {selectedCompetitorsArray.length} selected
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{brandsDescription}</p>
              </div>
            </div>

            <div className="mt-5">
              {suggestionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                  <span className="ml-3 text-gray-500">{brandsLoadingText}</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {competitors.map((competitor) => (
                    <div
                      key={competitor}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[#E8F5E9] text-sm cursor-pointer transition-all hover:bg-[#d4edda]"
                      onClick={() => toggleCompetitor(competitor)}
                    >
                      <div className="w-5 h-5 rounded-full bg-[#4A7C59] flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                      <span className="text-gray-700 font-medium">{competitor}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCompetitor(competitor);
                        }}
                        className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {competitors.length < 10 && (
                <div className="mt-5">
                  {addingCompetitor ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCompetitor}
                        onChange={(e) => setNewCompetitor(e.target.value)}
                        placeholder={addBrandPlaceholder}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/20 focus:border-[#4A7C59] placeholder-gray-400"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { handleAddCompetitor(); }
                          if (e.key === 'Escape') { setAddingCompetitor(false); setNewCompetitor(''); }
                        }}
                      />
                      <button
                        onClick={handleAddCompetitor}
                        disabled={!newCompetitor.trim()}
                        className="px-3 py-2 text-sm bg-[#4A7C59] text-white rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddingCompetitor(false); setNewCompetitor(''); }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingCompetitor(true)}
                      className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Add {isCategory ? 'another brand' : 'another competitor'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* AI Platforms Section - 2-column grid */}
          <div className="bg-white/60 rounded-2xl p-6">
            {/* Header with inline icon */}
            <div className="flex items-start gap-2 mb-2">
              <Bot className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">AI Platforms to Test</h2>
                  <span className="text-sm text-[#4A7C59]/70 font-medium">
                    {providers.length} selected
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  Choose which AI assistants to include in your analysis
                </p>
              </div>
            </div>

            {/* 2-column grid */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleProvider(key)}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                    providers.includes(key)
                      ? 'bg-[#E8F5E9]'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
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
                    <p className="text-sm font-medium text-gray-900">
                      {info.name}
                    </p>
                    <p className="text-xs text-gray-500">{info.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>{/* End of three-column grid */}

        {/* Advanced Settings - full width, subtle gray background */}
        <div className="bg-gray-100/50 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-100/70 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Settings2 className="w-5 h-5 text-gray-400" />
              <div className="text-left">
                <h2 className="text-base font-semibold text-gray-900">Advanced Settings</h2>
                <p className="text-sm text-gray-500">
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
            <div className="px-6 pb-6 space-y-8">
              {/* Response Variation */}
              <div className="pt-4">
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
                        className={`p-4 rounded-xl text-left transition-all ${
                          temperatures.includes(temp)
                            ? 'bg-[#E8F5E9]'
                            : 'bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center ${
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
                      className={`p-4 rounded-xl text-center transition-all ${
                        repeats === num
                          ? 'bg-[#E8F5E9]'
                          : 'bg-white hover:bg-gray-50'
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
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        openaiModel === 'gpt-4o-mini'
                          ? 'bg-[#E8F5E9]'
                          : 'bg-white hover:bg-gray-50'
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
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        openaiModel === 'gpt-4o'
                          ? 'bg-[#E8F5E9]'
                          : 'bg-white hover:bg-gray-50'
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
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        anthropicModel === 'claude-haiku-4-5-20251001'
                          ? 'bg-[#E8F5E9]'
                          : 'bg-white hover:bg-gray-50'
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
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        anthropicModel === 'claude-sonnet-4-20250514'
                          ? 'bg-[#E8F5E9]'
                          : 'bg-white hover:bg-gray-50'
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
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <label className="text-sm font-semibold text-gray-900">
                    Region
                  </label>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Affects search results and AI Overviews based on location
                </p>
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

      {/* Bottom Action Section - blends with page background */}
      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{selectedPromptsArray.length}</span> question{selectedPromptsArray.length !== 1 ? 's' : ''}{' '}
              <span className="text-gray-400">×</span>{' '}
              <span className="font-medium">{providers.length}</span> platform{providers.length !== 1 ? 's' : ''}{' '}
              <span className="text-gray-400">=</span>{' '}
              <span className="font-semibold text-[#4A7C59]">{totalCalls} API calls</span>
            </p>
            <p className="text-sm text-gray-500">
              Estimated cost: {formatCurrency(estimatedCost)} · Time: {formatDuration(estimatedTime)}
            </p>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={!canRun}
            className="px-6 py-3 bg-[#4A7C59] text-white font-semibold rounded-xl hover:bg-[#3d6649] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
    </main>
  );
}

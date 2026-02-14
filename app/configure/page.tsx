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
  ChevronDown,
  ChevronUp,
  HelpCircle,
  MessageSquare,
  Users,
  Bot,
  Settings2,
  Globe,
  MapPin,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useStore } from '@/hooks/useStore';
import { useSuggestions, useStartRun, useAuthSync } from '@/hooks/useApi';
import {
  getSessionId,
  calculateEstimatedCost,
  calculateTotalCalls,
  estimateDuration,
  formatCurrency,
  formatDuration,
} from '@/lib/utils';
import { getSearchTypeConfig } from '@/lib/searchTypeConfig';
import { useBillingStatus } from '@/hooks/useBilling';
import { FREEMIUM_CONFIG, isProviderFree } from '@/lib/billing';

const PROVIDER_INFO: Record<string, { name: string; description: string; cost: string }> = {
  openai: {
    name: 'ChatGPT',
    description: 'Most popular AI assistant',
    cost: 'from $0.0003/call',
  },
  gemini: {
    name: 'Google Gemini',
    description: "Google's AI with search integration",
    cost: '$0.00025/call',
  },
  anthropic: {
    name: 'Claude',
    description: "Anthropic's AI with web search",
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
  grok: {
    name: 'Grok',
    description: "xAI's AI with real-time data",
    cost: '$0.001/call',
  },
  llama: {
    name: 'Llama',
    description: "Meta's open-source LLM",
    cost: '$0.0005/call',
  },
};

export default function ConfigurePage() {
  const router = useRouter();
  const {
    brand,
    brandUrl,
    setBrandUrl,
    searchType,
    location,
    setLocation,
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
    setProviders,
    toggleProvider,
    temperatures,
    setTemperatures,
    repeats,
    setRepeats,
    openaiModel,
    setOpenaiModel,
    anthropicModel,
    setAnthropicModel,
    grokModel,
    setGrokModel,
    llamaModel,
    setLlamaModel,
    country,
    setCountry,
  } = useStore();

  // Sync Clerk auth token to API client for backend billing checks
  useAuthSync();

  // Billing status for provider locking and report counting
  const { data: billing, isPlaceholderData: isBillingPlaceholder } = useBillingStatus();
  const isPaidUser = billing?.hasSubscription ?? false;

  // Auto-deselect locked providers for free users (skip while using placeholder data)
  useEffect(() => {
    if (isBillingPlaceholder) return;
    if (billing && !isPaidUser) {
      const allowedProviders = providers.filter(p => isProviderFree(p));
      if (allowedProviders.length !== providers.length) {
        setProviders(allowedProviders.length > 0 ? allowedProviders : FREEMIUM_CONFIG.freeProviders);
      }
    }
  }, [billing, isPaidUser, isBillingPlaceholder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Labels from config registry
  const searchConfig = getSearchTypeConfig(searchType);
  const isCategory = searchType === 'category';
  const isLocal = searchType === 'local';
  const brandsLabel = searchConfig.competitorsLabel;
  const brandsDescription = searchConfig.competitorsDescription;
  const brandsLoadingText = searchConfig.competitorsLoadingText;
  const addBrandPlaceholder = searchConfig.addCompetitorPlaceholder;

  const [newPrompt, setNewPrompt] = useState('');
  const [newCompetitor, setNewCompetitor] = useState('');
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [tempLocation, setTempLocation] = useState('');
  const [questionsExpanded, setQuestionsExpanded] = useState(true);

  const { data: suggestions, isLoading: suggestionsLoading, error: suggestionsError } = useSuggestions(brand, searchType, location);
  const startRunMutation = useStartRun();

  // Redirect if no brand
  useEffect(() => {
    if (!brand) {
      router.push('/');
    }
  }, [brand, router]);

  // Auto-generate brand URL if empty
  useEffect(() => {
    if (brand && !brandUrl) {
      const generatedUrl = brand.toLowerCase().replace(/\s+/g, '') + '.com';
      setBrandUrl(generatedUrl);
    }
  }, [brand, brandUrl, setBrandUrl]);

  // Populate prompts and competitors from suggestions
  useEffect(() => {
    if (suggestions) {
      if (prompts.length === 0) {
        const basePrompts = [...suggestions.prompts];

        // For brand searches, add a specific comparison question if there's a known competitor
        if (!isCategory && suggestions.competitors.length > 0) {
          const rival = suggestions.competitors[0];

          const extractProductContext = (prompts: string[]): string | null => {
            const productPatterns = [
              /best\s+(.+?)(?:\s+for|\s+in|\s+to|\?|$)/i,
              /top\s+(.+?)(?:\s+for|\s+in|\s+to|\?|$)/i,
              /recommend(?:ed)?\s+(.+?)(?:\s+for|\s+in|\s+to|\?|$)/i,
              /looking for\s+(.+?)(?:\s+for|\s+in|\s+to|\?|$)/i,
            ];

            for (const prompt of prompts) {
              for (const pattern of productPatterns) {
                const match = prompt.match(pattern);
                if (match && match[1]) {
                  const product = match[1].trim();
                  if (product.length > 2 && !['the', 'a', 'an', 'some'].includes(product.toLowerCase())) {
                    return product;
                  }
                }
              }
            }
            return null;
          };

          const productContext = extractProductContext(basePrompts);

          const comparisonPrompt = productContext
            ? `What are the differences between ${brand} and ${rival} ${productContext}?`
            : `What are the key differences between ${brand} and ${rival} products?`;

          const alreadyHasComparison = basePrompts.some(
            (p) => p.toLowerCase().includes('compare') || p.toLowerCase().includes(' vs ') || p.toLowerCase().includes('difference')
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
    if (newPrompt.trim() && prompts.length < 20) {
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

    // Check free tier report limit (only enforce when billing data has loaded)
    if (!isBillingPlaceholder && !isPaidUser && billing && billing.reportsUsed >= FREEMIUM_CONFIG.freeReportsPerUser) {
      router.push('/pricing?reason=limit');
      return;
    }

    setError(null);

    try {
      const result = await startRunMutation.mutateAsync({
        session_id: getSessionId(),
        brand,
        search_type: searchType,
        ...(isLocal && location ? { location } : {}),
        prompts: selectedPromptsArray,
        competitors: selectedCompetitorsArray,
        providers,
        temperatures,
        repeats,
        openai_model: openaiModel,
        anthropic_model: anthropicModel,
        grok_model: grokModel,
        llama_model: llamaModel,
        country,
      });
      router.push(`/run/${result.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    }
  };

  const canRun = selectedPromptsArray.length > 0 && providers.length > 0 && !startRunMutation.isPending;

  // Questions to display (with show less/more)
  const COLLAPSED_QUESTION_COUNT = 4;
  const visiblePrompts = questionsExpanded ? prompts : prompts.slice(0, COLLAPSED_QUESTION_COUNT);
  const canToggleQuestions = prompts.length > COLLAPSED_QUESTION_COUNT;

  if (!brand) {
    return null;
  }

  return (
    <main
      className="min-h-screen bg-[#FAFAF8]"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-gray-100">
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
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-900 text-white">
                    {brand}
                  </span>
                  {/* Location badge for local search type */}
                  {isLocal && (
                    editingLocation ? (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <input
                          type="text"
                          value={tempLocation}
                          onChange={(e) => setTempLocation(e.target.value)}
                          className="px-2 py-0.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600 w-36"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setLocation(tempLocation);
                              setEditingLocation(false);
                            }
                            if (e.key === 'Escape') {
                              setEditingLocation(false);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            setLocation(tempLocation);
                            setEditingLocation(false);
                          }}
                          className="p-0.5 text-teal-600 hover:bg-teal-50 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingLocation(false)}
                          className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setTempLocation(location);
                          setEditingLocation(true);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors group"
                      >
                        <MapPin className="w-3 h-3" />
                        <span>{location || 'Add location'}</span>
                        <svg className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )
                  )}
                  {editingUrl ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={tempUrl}
                        onChange={(e) => setTempUrl(e.target.value)}
                        className="px-2 py-0.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600 w-36"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setBrandUrl(tempUrl);
                            setEditingUrl(false);
                          }
                          if (e.key === 'Escape') {
                            setEditingUrl(false);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          setBrandUrl(tempUrl);
                          setEditingUrl(false);
                        }}
                        className="p-0.5 text-teal-600 hover:bg-teal-50 rounded"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingUrl(false)}
                        className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setTempUrl(brandUrl);
                        setEditingUrl(true);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-gray-500 hover:bg-gray-100 transition-colors group"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{brandUrl || 'Add URL'}</span>
                      <svg className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            {/* Header Stepper */}
            <div className="hidden md:flex items-center gap-0">
              {/* Step 1 - Questions (completed) */}
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
                <span className="text-xs font-medium text-gray-700">Questions</span>
              </div>
              <div className="w-8 h-px bg-gray-300 mx-1" />

              {/* Step 2 - Competitors */}
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-400">2</span>
                </div>
                <span className="text-xs font-medium text-gray-400">Competitors</span>
              </div>
              <div className="w-8 h-px bg-gray-300 mx-1" />

              {/* Step 3 - AI Platforms */}
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-400">3</span>
                </div>
                <span className="text-xs font-medium text-gray-400">AI Platforms</span>
              </div>
              <div className="w-8 h-px bg-gray-300 mx-1" />

              {/* Step 4 - Review */}
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-400">4</span>
                </div>
                <span className="text-xs font-medium text-gray-400">Review</span>
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

      <div className="max-w-7xl mx-auto px-6 py-6 pb-24">
        {/* Error Alert */}
        {(error || suggestionsError) && (
          <div className="bg-red-50 rounded-xl p-4 flex items-start gap-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Something went wrong</p>
              <p className="text-sm text-red-700">
                {error || (suggestionsError instanceof Error ? suggestionsError.message : 'Failed to load suggestions')}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-8">
          {/* Left Sidebar - How it works */}
          <div className="hidden lg:block w-60 flex-shrink-0">
            <div className="sticky top-20">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">How it works</h2>
              <p className="text-sm text-gray-500 mb-6">
                Configure your AI-powered competitive analysis in three simple steps.
              </p>

              <div className="space-y-5">
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">1</span>
                  </div>
                  <div>
                    <p className="text-base font-medium text-gray-900">Pick your questions</p>
                    <p className="text-sm text-gray-500 mt-0.5">Select or add the questions you want each AI platform to answer about your brand.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">2</span>
                  </div>
                  <div>
                    <p className="text-base font-medium text-gray-900">Choose competitors</p>
                    <p className="text-sm text-gray-500 mt-0.5">Add the brands you want to benchmark against in the analysis results.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">3</span>
                  </div>
                  <div>
                    <p className="text-base font-medium text-gray-900">Select AI platforms</p>
                    <p className="text-sm text-gray-500 mt-0.5">Pick which AI assistants to query so you can compare responses across platforms.</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-teal-700 rounded-xl p-4">
                <p className="text-sm text-teal-50">
                  <span className="mr-1">💡</span>
                  <span className="font-medium">Tip:</span> The more questions and platforms you select, the richer your analysis will be.
                </p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-8">

            {/* Questions Section - full width card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-5">
              {/* Header with step number */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-7 h-7 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-semibold">1</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  <h2 className="text-base font-semibold text-gray-900">Questions to Ask AI</h2>
                </div>
                <span className="ml-auto text-sm font-semibold text-teal-600">
                  {selectedPromptsArray.length}/{prompts.length}
                </span>
              </div>


              {suggestionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" />
                  <span className="ml-3 text-gray-500 text-sm">Generating smart questions...</span>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {/* Questions List */}
                  {visiblePrompts.map((prompt, index) => (
                    <div
                      key={prompt}
                      className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group ${
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
                            ? 'bg-teal-600'
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
                            className="flex-1 px-2.5 py-1.5 border border-teal-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePromptEdit();
                              if (e.key === 'Escape') setEditingPromptIndex(null);
                            }}
                          />
                          <button
                            onClick={handleSavePromptEdit}
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
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
                            className="p-1 text-gray-400 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-gray-100"
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

              {/* Show less/more + Add question */}
              {prompts.length > 0 && !suggestionsLoading && (
                <>
                  {canToggleQuestions ? (
                    <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-between">
                      <button
                        onClick={() => setQuestionsExpanded(!questionsExpanded)}
                        className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
                      >
                        {questionsExpanded ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Show more ({prompts.length - COLLAPSED_QUESTION_COUNT} more)
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => deselectAllPrompts()}
                        className="text-sm text-teal-600 hover:text-teal-700 transition-colors font-medium"
                      >
                        Deselect all
                      </button>
                    </div>
                  ) : (
                    <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-end">
                      <button
                        onClick={() => deselectAllPrompts()}
                        className="text-sm text-teal-600 hover:text-teal-700 transition-colors font-medium"
                      >
                        Deselect all
                      </button>
                    </div>
                  )}

                  {/* Add question */}
                  {prompts.length < 20 && (
                    <div className="border-t border-gray-100 mt-3 pt-3">
                      {addingPrompt ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newPrompt}
                            onChange={(e) => setNewPrompt(e.target.value)}
                            placeholder="Type your question here..."
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 placeholder-gray-400"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { handleAddPrompt(); }
                              if (e.key === 'Escape') { setAddingPrompt(false); setNewPrompt(''); }
                            }}
                          />
                          <button
                            onClick={handleAddPrompt}
                            disabled={!newPrompt.trim()}
                            className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                          className="text-sm text-gray-500 hover:bg-gray-50 font-medium flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 border-dashed transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Add your own question
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Competitors + Platforms side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

              {/* Competitors Section */}
              <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-5">
                {/* Header with step number */}
                <div className="flex items-start gap-3 mb-1">
                  <div className="w-7 h-7 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-semibold">2</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <h2 className="text-base font-semibold text-gray-900">{brandsLabel}</h2>
                  </div>
                  <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                    {selectedCompetitorsArray.length} selected
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1 mb-4 ml-10">{brandsDescription}</p>

                <div>
                  {suggestionsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner size="lg" />
                      <span className="ml-3 text-gray-500">{brandsLoadingText}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {competitors.map((competitor) => {
                        const isSelected = selectedCompetitors.has(competitor);
                        return (
                          <div
                            key={competitor}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-all group border ${
                              isSelected
                                ? 'border-teal-200 bg-white text-gray-700'
                                : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
                            }`}
                            onClick={() => toggleCompetitor(competitor)}
                          >
                            {isSelected && (
                              <div className="w-4 h-4 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                                <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                              </div>
                            )}
                            <span>{competitor}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCompetitor(competitor);
                              }}
                              className={`p-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                                isSelected ? 'text-gray-400 hover:text-gray-600' : 'text-gray-400 hover:text-gray-600'
                              }`}
                              aria-label="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {competitors.length < 10 && (
                    <div className="mt-3">
                      {addingCompetitor ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newCompetitor}
                            onChange={(e) => setNewCompetitor(e.target.value)}
                            placeholder={addBrandPlaceholder}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 placeholder-gray-400"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { handleAddCompetitor(); }
                              if (e.key === 'Escape') { setAddingCompetitor(false); setNewCompetitor(''); }
                            }}
                          />
                          <button
                            onClick={handleAddCompetitor}
                            disabled={!newCompetitor.trim()}
                            className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                          className="text-sm text-gray-500 hover:bg-gray-50 font-medium flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 border-dashed transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Add {isCategory ? 'another brand' : searchType === 'public_figure' ? 'another public figure' : searchType === 'issue' ? 'another issue' : 'another competitor'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* AI Platforms Section */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-5">
                {/* Header with step number */}
                <div className="flex items-start gap-3 mb-1">
                  <div className="w-7 h-7 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-semibold">3</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-gray-400" />
                    <h2 className="text-base font-semibold text-gray-900">AI Platforms to Test</h2>
                  </div>
                  <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                    {providers.length} selected
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1 mb-4 ml-10">
                  Choose which AI assistants to include in your analysis
                </p>

                {/* 2-column grid */}
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PROVIDER_INFO).map(([key, info]) => {
                    const isSelected = providers.includes(key);
                    const isLocked = !isBillingPlaceholder && !isPaidUser && !isProviderFree(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => !isLocked && toggleProvider(key)}
                        disabled={isLocked}
                        className={`flex items-start gap-2.5 px-3 py-3 rounded-xl text-left transition-all ${
                          isLocked
                            ? 'bg-gray-50 border border-gray-200 opacity-40 cursor-not-allowed'
                            : isSelected
                            ? 'bg-white ring-1 ring-gray-200'
                            : 'bg-gray-50 border border-gray-200 opacity-60'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                            isLocked
                              ? 'bg-gray-200'
                              : isSelected
                              ? 'bg-teal-600'
                              : 'border-2 border-gray-300'
                          }`}
                        >
                          {isLocked ? (
                            <Lock className="w-2.5 h-2.5 text-gray-400" />
                          ) : isSelected ? (
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-gray-900">
                              {info.name}
                            </p>
                            {isLocked && (
                              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">PRO</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>{/* End of Competitors + Platforms grid */}

          </div>{/* End of main content */}
        </div>{/* End of sidebar + content flex */}

        {/* Advanced Settings - full width, subtle gray background */}
        <div className="bg-gray-100/50 rounded-2xl overflow-hidden mt-8">
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
                            ? 'bg-gray-100'
                            : 'bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center ${
                              temperatures.includes(temp)
                                ? 'bg-teal-600'
                                : 'border-2 border-gray-300'
                            }`}
                          >
                            {temperatures.includes(temp) && (
                              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                            )}
                          </div>
                          <span className={`text-sm font-medium ${temperatures.includes(temp) ? 'text-gray-900' : 'text-gray-700'}`}>
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
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-lg font-semibold ${repeats === num ? 'text-gray-900' : 'text-gray-700'}`}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${openaiModel === 'gpt-4o-mini' ? 'text-gray-900' : 'text-gray-700'}`}>
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
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${openaiModel === 'gpt-4o' ? 'text-gray-900' : 'text-gray-700'}`}>
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
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${anthropicModel === 'claude-haiku-4-5-20251001' ? 'text-gray-900' : 'text-gray-700'}`}>
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
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${anthropicModel === 'claude-sonnet-4-20250514' ? 'text-gray-900' : 'text-gray-700'}`}>
                          Claude Sonnet
                        </span>
                        <span className="text-xs text-gray-500">~$0.035/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">More capable with web search</p>
                    </button>
                  </div>
                </div>

                {/* Grok Model */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    Grok Version
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setGrokModel('grok-3')}
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        grokModel === 'grok-3'
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${grokModel === 'grok-3' ? 'text-gray-900' : 'text-gray-700'}`}>
                          Grok-3
                        </span>
                        <span className="text-xs text-gray-500">$0.001/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Most capable</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGrokModel('grok-3-mini')}
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        grokModel === 'grok-3-mini'
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${grokModel === 'grok-3-mini' ? 'text-gray-900' : 'text-gray-700'}`}>
                          Grok-3 Mini
                        </span>
                        <span className="text-xs text-gray-500">$0.0003/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Faster & cheaper</p>
                    </button>
                  </div>
                </div>

                {/* Llama Model */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    Llama Version
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setLlamaModel('llama-3.3-70b-versatile')}
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        llamaModel === 'llama-3.3-70b-versatile'
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${llamaModel === 'llama-3.3-70b-versatile' ? 'text-gray-900' : 'text-gray-700'}`}>
                          Llama 3.3 70B
                        </span>
                        <span className="text-xs text-gray-500">$0.0005/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Proven & reliable</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLlamaModel('meta-llama/llama-4-scout-17b-16e-instruct')}
                      className={`w-full p-3 rounded-xl text-left transition-all ${
                        llamaModel === 'meta-llama/llama-4-scout-17b-16e-instruct'
                          ? 'bg-gray-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${llamaModel === 'meta-llama/llama-4-scout-17b-16e-instruct' ? 'text-gray-900' : 'text-gray-700'}`}>
                          Llama 4 Scout
                        </span>
                        <span className="text-xs text-gray-500">$0.0003/call</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Newer Llama 4 model</p>
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 bg-white"
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

      {/* Sticky bottom CTA bar */}
      <div className="sticky bottom-0 z-10 bg-white/80 backdrop-blur-sm border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {selectedPromptsArray.length} question{selectedPromptsArray.length !== 1 ? 's' : ''}
            {' · '}
            {selectedCompetitorsArray.length} competitor{selectedCompetitorsArray.length !== 1 ? 's' : ''}
            {' · '}
            {providers.length} platform{providers.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={handleRunAnalysis}
            disabled={!canRun}
            className="px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {startRunMutation.isPending ? (
              <Spinner size="sm" />
            ) : null}
            Run Analysis
            {!startRunMutation.isPending && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </main>
  );
}

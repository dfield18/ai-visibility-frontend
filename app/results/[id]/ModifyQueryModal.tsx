'use client';

import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { RunStatusResponse, ExtendRunRequest } from '@/lib/types';
import { useExtendRun } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';

interface ModifyQueryModalProps {
  runStatus: RunStatusResponse;
  onClose: () => void;
  onSuccess: (childRunId: string) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  gemini: 'Google Gemini',
  anthropic: 'Claude',
  perplexity: 'Perplexity',
  ai_overviews: 'Google AI Overviews',
  grok: 'Grok',
  llama: 'Llama',
};

const ALL_PROVIDERS = ['openai', 'gemini', 'anthropic', 'perplexity', 'ai_overviews', 'grok', 'llama'];

export function ModifyQueryModal({ runStatus, onClose, onSuccess }: ModifyQueryModalProps) {
  const extendRunMutation = useExtendRun();

  // Extract existing config from runStatus
  const existingConfig = runStatus.config || {
    prompts: [...new Set(runStatus.results.map(r => r.prompt))],
    competitors: [...new Set(runStatus.results.flatMap(r => r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || []))].filter(b => b.toLowerCase() !== (runStatus.brand || '').toLowerCase()),
    providers: [...new Set(runStatus.results.map(r => r.provider))],
    temperatures: [0.7],
    repeats: 1,
  };

  // State for new additions
  const [newPrompts, setNewPrompts] = useState<string[]>([]);
  const [newCompetitors, setNewCompetitors] = useState<string[]>([]);
  const [selectedNewProviders, setSelectedNewProviders] = useState<string[]>([]);
  const [showExistingPrompts, setShowExistingPrompts] = useState(false);
  const [showExistingCompetitors, setShowExistingCompetitors] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Get existing provider set
  const existingProviderSet = useMemo(
    () => new Set(existingConfig.providers),
    [existingConfig.providers]
  );

  // Calculate new combinations
  const newCombinations = useMemo(() => {
    const validNewPrompts = newPrompts.filter(p => p.trim());
    const validNewCompetitors = newCompetitors.filter(c => c.trim());
    const existingPrompts = new Set(existingConfig.prompts);
    const existingProviders = new Set(existingConfig.providers);
    const allProviders = [...existingProviders, ...selectedNewProviders];
    const temperatures = existingConfig.temperatures || [0.7];
    const repeats = existingConfig.repeats || 1;

    // New prompts with all providers
    let count = 0;
    for (const prompt of validNewPrompts) {
      if (!existingPrompts.has(prompt)) {
        count += allProviders.length * temperatures.length * repeats;
      }
    }

    // Existing prompts with new providers
    for (const _prompt of existingConfig.prompts) {
      for (const _provider of selectedNewProviders) {
        count += temperatures.length * repeats;
      }
    }

    // Estimate cost (rough estimate: $0.003 per call average)
    const estimatedCost = count * 0.003;

    return {
      count,
      newPrompts: validNewPrompts.filter(p => !existingPrompts.has(p)),
      newCompetitors: validNewCompetitors.filter(c => !(existingConfig.competitors ?? []).includes(c)),
      newProviders: selectedNewProviders,
      estimatedCost,
    };
  }, [newPrompts, newCompetitors, selectedNewProviders, existingConfig]);

  // Handle prompt input changes
  const handlePromptChange = (index: number, value: string) => {
    const updated = [...newPrompts];
    updated[index] = value;
    setNewPrompts(updated);
  };

  const addPromptField = () => {
    setNewPrompts([...newPrompts, '']);
  };

  const removePromptField = (index: number) => {
    setNewPrompts(newPrompts.filter((_, i) => i !== index));
  };

  // Handle competitor input changes
  const handleCompetitorChange = (index: number, value: string) => {
    const updated = [...newCompetitors];
    updated[index] = value;
    setNewCompetitors(updated);
  };

  const addCompetitorField = () => {
    setNewCompetitors([...newCompetitors, '']);
  };

  const removeCompetitorField = (index: number) => {
    setNewCompetitors(newCompetitors.filter((_, i) => i !== index));
  };

  // Handle provider toggle
  const toggleProvider = (provider: string) => {
    if (existingProviderSet.has(provider)) return; // Can't toggle existing providers
    setSelectedNewProviders(prev =>
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    );
  };

  // Submit handler
  const handleSubmit = async () => {
    setError(null);

    // Validate we have something to add
    if (newCombinations.count === 0) {
      setError('No new combinations to run. Add new prompts, competitors, or providers.');
      return;
    }

    const request: ExtendRunRequest = {};

    if (newCombinations.newPrompts.length > 0) {
      request.add_prompts = newCombinations.newPrompts;
    }

    if (newCombinations.newCompetitors.length > 0) {
      request.add_competitors = newCombinations.newCompetitors;
    }

    if (newCombinations.newProviders.length > 0) {
      request.add_providers = newCombinations.newProviders;
    }

    try {
      const result = await extendRunMutation.mutateAsync({
        runId: runStatus.run_id,
        request,
      });
      onSuccess(result.run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend run');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Modify Query</h2>
            <p className="text-sm text-gray-500 mt-1">
              Existing results are kept. Only new combinations will be run.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Brand */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-900">Brand:</span>
            <span className="text-gray-700">{runStatus.brand}</span>
          </div>

          {/* Prompts Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-900">
                Prompts
              </label>
              <button
                type="button"
                onClick={() => setShowExistingPrompts(!showExistingPrompts)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {existingConfig.prompts.length} existing
                {showExistingPrompts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Existing prompts (collapsible) */}
            {showExistingPrompts && (
              <div className="mb-3 space-y-1.5">
                {existingConfig.prompts.map((prompt: string, index: number) => (
                  <div key={`existing-${index}`} className="flex items-start gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{prompt}</span>
                  </div>
                ))}
              </div>
            )}

            {/* New prompt inputs */}
            {newPrompts.length > 0 && (
              <div className="space-y-2 mb-2">
                {newPrompts.map((prompt, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={prompt}
                      onChange={(e) => handlePromptChange(index, e.target.value)}
                      placeholder="Enter a new prompt..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => removePromptField(index)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addPromptField}
              className="flex items-center gap-1 text-sm text-gray-900 hover:text-gray-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add new prompt
            </button>
          </div>

          {/* Competitors Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-900">
                Competitors
              </label>
              <button
                type="button"
                onClick={() => setShowExistingCompetitors(!showExistingCompetitors)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {(existingConfig.competitors ?? []).length} existing
                {showExistingCompetitors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Existing competitors (collapsible) */}
            {showExistingCompetitors && (
              <div className="mb-3 flex flex-wrap gap-2">
                {(existingConfig.competitors ?? []).map((comp: string, index: number) => (
                  <span key={`existing-${index}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-full text-sm text-gray-600">
                    <Check className="w-3 h-3 text-green-500" />
                    {comp}
                  </span>
                ))}
              </div>
            )}

            {/* New competitor inputs */}
            {newCompetitors.length > 0 && (
              <div className="space-y-2 mb-2">
                {newCompetitors.map((competitor, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={competitor}
                      onChange={(e) => handleCompetitorChange(index, e.target.value)}
                      placeholder="Enter a competitor name..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => removeCompetitorField(index)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addCompetitorField}
              className="flex items-center gap-1 text-sm text-gray-900 hover:text-gray-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add new competitor
            </button>
          </div>

          {/* Providers Section - show all, existing are pre-selected */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              AI Providers
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_PROVIDERS.map((provider) => {
                const isExisting = existingProviderSet.has(provider);
                const isNewSelected = selectedNewProviders.includes(provider);
                const isActive = isExisting || isNewSelected;

                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => toggleProvider(provider)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? isExisting
                          ? 'bg-gray-900 text-white border-gray-900 cursor-default'
                          : 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {isExisting && <Check className="w-3.5 h-3.5" />}
                    {PROVIDER_LABELS[provider] || provider}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Existing providers are locked. Click others to add them.
            </p>
          </div>

          {/* Preview */}
          {newCombinations.count > 0 && (
            <div className="bg-gray-900/5 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">New Queries Preview</h3>
              <div className="space-y-1 text-sm text-gray-700">
                <p>
                  <span className="font-medium">{newCombinations.count}</span> new API calls will be made
                </p>
                {newCombinations.newPrompts.length > 0 && (
                  <p className="text-gray-600">
                    + {newCombinations.newPrompts.length} new prompt{newCombinations.newPrompts.length > 1 ? 's' : ''}
                  </p>
                )}
                {newCombinations.newCompetitors.length > 0 && (
                  <p className="text-gray-600">
                    + {newCombinations.newCompetitors.length} new competitor{newCombinations.newCompetitors.length > 1 ? 's' : ''} to track
                  </p>
                )}
                {newCombinations.newProviders.length > 0 && (
                  <p className="text-gray-600">
                    + {newCombinations.newProviders.length} new provider{newCombinations.newProviders.length > 1 ? 's' : ''}
                  </p>
                )}
                <p className="text-gray-600 mt-2">
                  Estimated cost: <span className="font-medium">{formatCurrency(newCombinations.estimatedCost)}</span>
                </p>
              </div>
            </div>
          )}

          {newCombinations.count === 0 && (newPrompts.length > 0 || newCompetitors.length > 0 || selectedNewProviders.length > 0) && (
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500 text-center">
              Fill in the new items above to see a preview of queries to run.
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={newCombinations.count === 0 || extendRunMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {extendRunMutation.isPending ? (
              <>
                <Spinner size="sm" />
                Running...
              </>
            ) : newCombinations.count > 0 ? (
              <>Run {newCombinations.count} New Queries</>
            ) : (
              <>Add Something New to Run</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

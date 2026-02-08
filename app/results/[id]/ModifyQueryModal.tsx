'use client';

import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, AlertTriangle } from 'lucide-react';
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
};

const ALL_PROVIDERS = ['openai', 'gemini', 'anthropic', 'perplexity', 'ai_overviews', 'grok'];

export function ModifyQueryModal({ runStatus, onClose, onSuccess }: ModifyQueryModalProps) {
  const extendRunMutation = useExtendRun();

  // Extract existing config from runStatus
  const existingConfig = runStatus.config || {
    prompts: [...new Set(runStatus.results.map(r => r.prompt))],
    competitors: [...new Set(runStatus.results.flatMap(r => r.competitors_mentioned || []))],
    providers: [...new Set(runStatus.results.map(r => r.provider))],
    temperatures: [0.7],
    repeats: 1,
  };

  // State for new additions
  const [newPrompts, setNewPrompts] = useState<string[]>(['']);
  const [newCompetitors, setNewCompetitors] = useState<string[]>(['']);
  const [selectedNewProviders, setSelectedNewProviders] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  // Get available providers that aren't already in the run
  const availableProviders = useMemo(() => {
    const existing = new Set(existingConfig.providers);
    return ALL_PROVIDERS.filter(p => !existing.has(p));
  }, [existingConfig.providers]);

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
    for (const prompt of existingConfig.prompts) {
      for (const provider of selectedNewProviders) {
        count += temperatures.length * repeats;
      }
    }

    // Estimate cost (rough estimate: $0.003 per call average)
    const estimatedCost = count * 0.003;

    return {
      count,
      newPrompts: validNewPrompts.filter(p => !existingPrompts.has(p)),
      newCompetitors: validNewCompetitors.filter(c => !existingConfig.competitors.includes(c)),
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
    if (newPrompts.length > 1) {
      setNewPrompts(newPrompts.filter((_, i) => i !== index));
    }
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
    if (newCompetitors.length > 1) {
      setNewCompetitors(newCompetitors.filter((_, i) => i !== index));
    }
  };

  // Handle provider toggle
  const toggleProvider = (provider: string) => {
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
      setError('No new combinations to run. Add new prompts or providers.');
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
              Add new prompts, competitors, or AI providers to this analysis
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
          {/* Existing Configuration Summary */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <h3 className="font-medium text-gray-900 mb-2">Current Analysis</h3>
            <div className="space-y-1 text-gray-600">
              <p><span className="font-medium">Brand:</span> {runStatus.brand}</p>
              <p><span className="font-medium">Prompts:</span> {existingConfig.prompts.length}</p>
              <p><span className="font-medium">Competitors:</span> {existingConfig.competitors.length}</p>
              <p>
                <span className="font-medium">Providers:</span>{' '}
                {existingConfig.providers.map(p => PROVIDER_LABELS[p] || p).join(', ')}
              </p>
            </div>
          </div>

          {/* Add New Prompts */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add New Prompts
            </label>
            <div className="space-y-2">
              {newPrompts.map((prompt, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => handlePromptChange(index, e.target.value)}
                    placeholder="Enter a new prompt..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                  />
                  {newPrompts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePromptField(index)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addPromptField}
                className="flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
              >
                <Plus className="w-4 h-4" />
                Add another prompt
              </button>
            </div>
          </div>

          {/* Add New Competitors */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add New Competitors
            </label>
            <div className="space-y-2">
              {newCompetitors.map((competitor, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={competitor}
                    onChange={(e) => handleCompetitorChange(index, e.target.value)}
                    placeholder="Enter a competitor name..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                  />
                  {newCompetitors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCompetitorField(index)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addCompetitorField}
                className="flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
              >
                <Plus className="w-4 h-4" />
                Add another competitor
              </button>
            </div>
          </div>

          {/* Add New Providers */}
          {availableProviders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add New AI Providers
              </label>
              <div className="flex flex-wrap gap-2">
                {availableProviders.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => toggleProvider(provider)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      selectedNewProviders.includes(provider)
                        ? 'bg-[#4A7C59] text-white border-[#4A7C59]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {PROVIDER_LABELS[provider] || provider}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {newCombinations.count > 0 && (
            <div className="bg-[#4A7C59]/10 rounded-lg p-4">
              <h3 className="font-medium text-[#4A7C59] mb-2">Preview</h3>
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
            className="px-4 py-2 text-sm font-medium text-white bg-[#4A7C59] rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {extendRunMutation.isPending ? (
              <>
                <Spinner size="sm" />
                Running...
              </>
            ) : (
              <>
                Run {newCombinations.count} New Queries
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

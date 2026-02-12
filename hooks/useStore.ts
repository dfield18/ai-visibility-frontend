'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SearchType } from '@/lib/types';

interface LocationCoords {
  lat: number;
  lng: number;
}

interface VisibilityStore {
  // Brand/Category data
  brand: string;
  brandUrl: string;
  searchType: SearchType;
  setBrand: (brand: string) => void;
  setBrandUrl: (url: string) => void;
  setSearchType: (type: SearchType) => void;

  // Location (for local search type)
  location: string;
  locationCoords: LocationCoords | null;
  setLocation: (location: string) => void;
  setLocationCoords: (coords: LocationCoords | null) => void;

  // Configuration
  prompts: string[];
  selectedPrompts: Set<string>;
  setPrompts: (prompts: string[]) => void;
  togglePrompt: (prompt: string) => void;
  selectAllPrompts: () => void;
  deselectAllPrompts: () => void;
  addPrompt: (prompt: string) => void;
  removePrompt: (prompt: string) => void;
  updatePrompt: (oldPrompt: string, newPrompt: string) => void;

  competitors: string[];
  selectedCompetitors: Set<string>;
  setCompetitors: (competitors: string[]) => void;
  toggleCompetitor: (competitor: string) => void;
  addCompetitor: (competitor: string) => void;
  removeCompetitor: (competitor: string) => void;

  providers: string[];
  setProviders: (providers: string[]) => void;
  toggleProvider: (provider: string) => void;

  temperatures: number[];
  setTemperatures: (temperatures: number[]) => void;

  repeats: number;
  setRepeats: (repeats: number) => void;

  // Model selection
  openaiModel: 'gpt-4o-mini' | 'gpt-4o';
  setOpenaiModel: (model: 'gpt-4o-mini' | 'gpt-4o') => void;
  anthropicModel: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-20250514';
  setAnthropicModel: (model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-20250514') => void;

  // Country/Region
  country: string;
  setCountry: (country: string) => void;

  // Reset
  reset: () => void;
  resetConfig: () => void;
}

const DEFAULT_PROVIDERS = ['openai', 'gemini', 'anthropic', 'perplexity', 'ai_overviews', 'grok', 'llama'];
const DEFAULT_TEMPERATURES = [0.3];
const DEFAULT_REPEATS = 1;
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini' as const;
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001' as const;
const DEFAULT_COUNTRY = 'us';

export const useStore = create<VisibilityStore>()(
  persist(
    (set, get) => ({
      // Brand/Category
      brand: '',
      brandUrl: '',
      searchType: 'brand' as SearchType,
      setBrand: (brand) => set({ brand }),
      setBrandUrl: (brandUrl) => set({ brandUrl }),
      setSearchType: (searchType) => set({ searchType }),

      // Location (for local search type)
      location: '',
      locationCoords: null,
      setLocation: (location) => set({ location }),
      setLocationCoords: (locationCoords) => set({ locationCoords }),

      // Prompts
      prompts: [],
      selectedPrompts: new Set<string>(),
      setPrompts: (prompts) =>
        set({
          prompts,
          selectedPrompts: new Set(prompts),
        }),
      togglePrompt: (prompt) =>
        set((state) => {
          const newSelected = new Set(state.selectedPrompts);
          if (newSelected.has(prompt)) {
            newSelected.delete(prompt);
          } else {
            newSelected.add(prompt);
          }
          return { selectedPrompts: newSelected };
        }),
      selectAllPrompts: () =>
        set((state) => ({
          selectedPrompts: new Set(state.prompts),
        })),
      deselectAllPrompts: () =>
        set(() => ({
          selectedPrompts: new Set<string>(),
        })),
      addPrompt: (prompt) =>
        set((state) => {
          if (state.prompts.includes(prompt)) return state;
          const newPrompts = [...state.prompts, prompt];
          const newSelected = new Set(state.selectedPrompts);
          newSelected.add(prompt);
          return { prompts: newPrompts, selectedPrompts: newSelected };
        }),
      removePrompt: (prompt) =>
        set((state) => {
          const newPrompts = state.prompts.filter((p) => p !== prompt);
          const newSelected = new Set(state.selectedPrompts);
          newSelected.delete(prompt);
          return { prompts: newPrompts, selectedPrompts: newSelected };
        }),
      updatePrompt: (oldPrompt, newPrompt) =>
        set((state) => {
          const newPrompts = state.prompts.map((p) =>
            p === oldPrompt ? newPrompt : p
          );
          const newSelected = new Set(state.selectedPrompts);
          if (newSelected.has(oldPrompt)) {
            newSelected.delete(oldPrompt);
            newSelected.add(newPrompt);
          }
          return { prompts: newPrompts, selectedPrompts: newSelected };
        }),

      // Competitors
      competitors: [],
      selectedCompetitors: new Set<string>(),
      setCompetitors: (competitors) =>
        set({
          competitors,
          selectedCompetitors: new Set(competitors),
        }),
      toggleCompetitor: (competitor) =>
        set((state) => {
          const newSelected = new Set(state.selectedCompetitors);
          if (newSelected.has(competitor)) {
            newSelected.delete(competitor);
          } else {
            newSelected.add(competitor);
          }
          return { selectedCompetitors: newSelected };
        }),
      addCompetitor: (competitor) =>
        set((state) => {
          if (state.competitors.includes(competitor)) return state;
          const newCompetitors = [...state.competitors, competitor];
          const newSelected = new Set(state.selectedCompetitors);
          newSelected.add(competitor);
          return { competitors: newCompetitors, selectedCompetitors: newSelected };
        }),
      removeCompetitor: (competitor) =>
        set((state) => {
          const newCompetitors = state.competitors.filter((c) => c !== competitor);
          const newSelected = new Set(state.selectedCompetitors);
          newSelected.delete(competitor);
          return { competitors: newCompetitors, selectedCompetitors: newSelected };
        }),

      // Providers
      providers: DEFAULT_PROVIDERS,
      setProviders: (providers) => set({ providers }),
      toggleProvider: (provider) =>
        set((state) => {
          const hasProvider = state.providers.includes(provider);
          if (hasProvider) {
            return { providers: state.providers.filter((p) => p !== provider) };
          } else {
            return { providers: [...state.providers, provider] };
          }
        }),

      // Temperatures
      temperatures: DEFAULT_TEMPERATURES,
      setTemperatures: (temperatures) => set({ temperatures }),

      // Repeats
      repeats: DEFAULT_REPEATS,
      setRepeats: (repeats) => set({ repeats }),

      // Model selection
      openaiModel: DEFAULT_OPENAI_MODEL,
      setOpenaiModel: (openaiModel) => set({ openaiModel }),
      anthropicModel: DEFAULT_ANTHROPIC_MODEL,
      setAnthropicModel: (anthropicModel) => set({ anthropicModel }),

      // Country/Region
      country: DEFAULT_COUNTRY,
      setCountry: (country) => set({ country }),

      // Reset
      reset: () =>
        set({
          brand: '',
          brandUrl: '',
          searchType: 'brand' as SearchType,
          location: '',
          locationCoords: null,
          prompts: [],
          selectedPrompts: new Set<string>(),
          competitors: [],
          selectedCompetitors: new Set<string>(),
          providers: DEFAULT_PROVIDERS,
          temperatures: DEFAULT_TEMPERATURES,
          repeats: DEFAULT_REPEATS,
          openaiModel: DEFAULT_OPENAI_MODEL,
          anthropicModel: DEFAULT_ANTHROPIC_MODEL,
          country: DEFAULT_COUNTRY,
        }),
      resetConfig: () =>
        set({
          // Note: location is NOT cleared here - it's part of the search context like brand
          brandUrl: '',
          prompts: [],
          selectedPrompts: new Set<string>(),
          competitors: [],
          selectedCompetitors: new Set<string>(),
          providers: DEFAULT_PROVIDERS,
          temperatures: DEFAULT_TEMPERATURES,
          repeats: DEFAULT_REPEATS,
          openaiModel: DEFAULT_OPENAI_MODEL,
          anthropicModel: DEFAULT_ANTHROPIC_MODEL,
          country: DEFAULT_COUNTRY,
        }),
    }),
    {
      name: 'visibility-store',
      partialize: (state) => ({
        brand: state.brand,
        brandUrl: state.brandUrl,
        searchType: state.searchType,
        location: state.location,
        locationCoords: state.locationCoords,
        prompts: state.prompts,
        selectedPrompts: Array.from(state.selectedPrompts),
        competitors: state.competitors,
        selectedCompetitors: Array.from(state.selectedCompetitors),
        providers: state.providers,
        temperatures: state.temperatures,
        repeats: state.repeats,
        openaiModel: state.openaiModel,
        anthropicModel: state.anthropicModel,
        country: state.country,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert arrays back to Sets after rehydration
          state.selectedPrompts = new Set(state.selectedPrompts as unknown as string[]);
          state.selectedCompetitors = new Set(state.selectedCompetitors as unknown as string[]);
        }
      },
    }
  )
);

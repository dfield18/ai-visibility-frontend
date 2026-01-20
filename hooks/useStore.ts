'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface VisibilityStore {
  // Brand data
  brand: string;
  setBrand: (brand: string) => void;

  // Configuration
  prompts: string[];
  selectedPrompts: Set<string>;
  setPrompts: (prompts: string[]) => void;
  togglePrompt: (prompt: string) => void;
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

  // Reset
  reset: () => void;
  resetConfig: () => void;
}

const DEFAULT_PROVIDERS = ['openai', 'gemini'];
const DEFAULT_TEMPERATURES = [0.3, 0.7, 1.0];
const DEFAULT_REPEATS = 2;

export const useStore = create<VisibilityStore>()(
  persist(
    (set, get) => ({
      // Brand
      brand: '',
      setBrand: (brand) => set({ brand }),

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

      // Reset
      reset: () =>
        set({
          brand: '',
          prompts: [],
          selectedPrompts: new Set<string>(),
          competitors: [],
          selectedCompetitors: new Set<string>(),
          providers: DEFAULT_PROVIDERS,
          temperatures: DEFAULT_TEMPERATURES,
          repeats: DEFAULT_REPEATS,
        }),
      resetConfig: () =>
        set({
          prompts: [],
          selectedPrompts: new Set<string>(),
          competitors: [],
          selectedCompetitors: new Set<string>(),
          providers: DEFAULT_PROVIDERS,
          temperatures: DEFAULT_TEMPERATURES,
          repeats: DEFAULT_REPEATS,
        }),
    }),
    {
      name: 'visibility-store',
      partialize: (state) => ({
        brand: state.brand,
        prompts: state.prompts,
        selectedPrompts: Array.from(state.selectedPrompts),
        competitors: state.competitors,
        selectedCompetitors: Array.from(state.selectedCompetitors),
        providers: state.providers,
        temperatures: state.temperatures,
        repeats: state.repeats,
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

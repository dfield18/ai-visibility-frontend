# CLAUDE.md - Project Context for Claude Code

## Project Overview

AI Visibility Frontend - A Next.js application for analyzing visibility across AI providers (ChatGPT, Claude, Gemini, Perplexity, Grok, Llama, AI Overviews). Supports multiple search types: **Brand**, **Industry** (category), **Local**, **Issue**, and **Public Figure**. Users select a search type, enter their subject, configure prompts and competitors, run analysis, and view results.

## Backend Repo

Located at `/Users/davidfield/Documents/ai-visibility-backend` (FastAPI/Python). Key files:
- `app/services/openai_service.py` — GPT prompt generation for suggestions, analysis summaries, and recommendations
- `app/api/routes/run.py` — Run creation and result formatting
- `app/api/routes/suggest.py` — Prompt/competitor suggestion endpoints

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 3.4
- **Data Fetching**: TanStack React Query v5
- **State Management**: Zustand v5 with localStorage persistence
- **Authentication**: Clerk (@clerk/nextjs)
- **Icons**: Lucide React
- **Charts**: Recharts
- **Markdown**: react-markdown with remark-gfm

## Project Structure

```
app/                          # Next.js App Router pages
├── layout.tsx                # Root layout with QueryClientProvider
├── page.tsx                  # Landing page (search type selector + input)
├── providers.tsx             # React Query provider setup
├── api/validate-brand/       # Brand validation API route (GPT-4o-mini)
├── configure/page.tsx        # Prompts/competitors configuration
├── run/[id]/page.tsx         # Real-time progress tracking
└── results/[id]/
    ├── page.tsx              # Results dashboard (orchestrates tabs + contexts)
    ├── BrandFilterPanel.tsx  # Sidebar brand filter for industry reports
    └── tabs/
        ├── shared.ts         # Shared types (Result, RunStatusResponse, TabType) + isCategoryName() helper
        ├── ResultsContext.tsx # ResultsContext (data) + ResultsUIContext (UI state)
        ├── OverviewTab.tsx    # Visibility overview metrics + charts
        ├── CompetitiveTab.tsx # Competitive landscape / brand comparison
        ├── SentimentTab.tsx   # Sentiment & tone analysis
        ├── SourcesTab.tsx     # Source citations + publisher breakdown
        ├── RecommendationsTab.tsx # Recommendations (brand) / Analysis (industry)
        └── ReferenceTab.tsx   # Raw data table

components/ui/                # Reusable UI components (Button, Card, Badge, etc.)
hooks/
├── useApi.ts                 # React Query hooks for API calls
└── useStore.ts               # Zustand store definition
lib/
├── api.ts                    # API client class
├── types.ts                  # TypeScript interfaces (includes SearchType union)
├── searchTypeConfig.ts       # Per-search-type configuration registry
└── utils.ts                  # Helper functions
```

## Commands

```bash
npm run dev     # Development server (port 3000)
npm run build   # Production build
npm run start   # Production server
npm run lint    # ESLint
```

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:8000)
- `OPENAI_API_KEY` - OpenAI API key for brand validation
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key (required)
- `CLERK_SECRET_KEY` - Clerk secret key (required)

## Search Type System (`lib/searchTypeConfig.ts`)

The `SearchTypeConfig` registry is the central config that drives ALL per-search-type behavior. Instead of scattered `if (isCategory)` checks, labels and settings come from this config.

**Search types**: `'brand' | 'category' | 'local' | 'issue' | 'public_figure'` (defined in `lib/types.ts`)

Each config includes: labels for UI text (brandMentionLabel, competitorColumnLabel, sentimentLabel), tab list with enable/disable flags, placeholder text, example suggestions, and recommendation context for the AI.

**Key behaviors per type:**
- **Brand**: Full feature set, all tabs enabled, Site Audit included
- **Industry (category)**: "Recommendations" tab renamed to "Analysis", Site Audit disabled, category name excluded from brand lists (use `competitors_mentioned` not `brand_mentioned`), no impact/effort badges on insights, Industry Overview tab added
- **Local**: Like brand but requires location, no Site Audit
- **Issue**: "Competitive" renamed to "Related Issues", "Sentiment" renamed to "Framing & Tone", no Site Audit or Reports
- **Public Figure**: "Competitive" renamed to "Figure Comparison", no Site Audit

## Results Architecture

### Two-Context Pattern (`ResultsContext.tsx`)

- **`ResultsContext`** (via `useResults()`): Stable/read-mostly data — run status, filtered results, computed stats, available providers/brands/prompts, search type config
- **`ResultsUIContext`** (via `useResultsUI()`): Interactive UI state — active tab, selected result, copy/export handlers, modal setters

### `visibleSections` Prop Pattern

Tab components (OverviewTab, CompetitiveTab, SentimentTab) accept an optional `visibleSections` prop — an array of section IDs. When provided, only those sections render. This enables composing tabs: e.g., Industry Overview embeds `<SentimentTab visibleSections={['sentiment-by-platform']} />` between two OverviewTab instances without duplicating code.

### Industry Overview Tab Composition (`page.tsx`)

For category search type, the Industry Overview tab is composed from multiple tab components:
1. `<OverviewTab visibleSections={['by-platform']} />` — Brand Visibility by Platform
2. `<SentimentTab visibleSections={['sentiment-by-platform']} />` — Sentiment by Platform
3. `<OverviewTab visibleSections={['all-results']} />` — All Results table (with brand filter dropdown)

### Category-Specific Data Rules

- `brand_mentioned` holds the category name (e.g., "Sneakers") — exclude from brand lists for industry reports
- `competitors_mentioned` holds actual brands within the category — use these for brand filtering
- Publisher Breakdown: skip category name when building `brandsInResponse`
- Sources tab: don't look up websites for the category itself, only for brands within it
- **`isCategoryName()` helper** (`shared.ts`): Uses substring matching (not exact match) to detect category name variants (e.g., "Laptop" vs "Laptops"). Used across `page.tsx`, `OverviewTab.tsx`, `CompetitiveTab.tsx`, and `SourcesTab.tsx` to filter category names from brand lists, market leader calculations, and `llmBreakdownBrands`.
- **All Results table "# Brands" column** (OverviewTab): Uses `all_brands_mentioned` (filtered by `isCategoryName()`) for industry reports, with fallback to `competitors_mentioned` for other search types.
- **Market Leader card** (OverviewTab): Shows "share of voice (% of total brand mentions captured)" instead of "% of all mentions".

### Brand Filter Panel (Industry Reports)

- `app/results/[id]/BrandFilterPanel.tsx` — sidebar panel lets users exclude brands from the report
- Uses **pending state** pattern: checkbox changes are local until user clicks "Update Report" button
- `excludedBrands` state lives in `page.tsx`, filtered derivatives (`filteredAvailableBrands`, `filteredTrackedBrands`) passed through `ResultsContext`
- Computed stats (`shareOfVoiceData`, `llmBreakdownBrands`, `brandBreakdownStats`) also filter out excluded brands
- `ResultsContext` exposes: `allAvailableBrands` (unfiltered, for sidebar), `availableBrands` (filtered), `excludedBrands`, `setExcludedBrands`
- Select-all checkbox uses **purple accent** (`#7c3aed`), individual checkboxes use gray-900
- `SectionGuide` component accepts `children` prop to render the panel below the "On this page" nav

## Key Patterns & Conventions

### Component Structure
- Use `'use client'` directive for client components
- UI components use `forwardRef` pattern with variant props
- Props interfaces exported alongside components

### API Integration
- `ApiClient` class in `lib/api.ts` handles all backend requests
- React Query hooks in `hooks/useApi.ts` wrap API calls
- Polling pattern for run status (2s interval while running)

### State Management
- Zustand store persists to localStorage (key: "visibility-store")
- Store contains: brand, prompts, competitors, providers, temperatures, repeats

### Styling
- Utility-first Tailwind CSS
- Use `cn()` from `lib/utils.ts` for conditional classes
- **Color scheme**: Gray-900 (#111827) is the primary accent color (NOT green)
- Background: `#FAFAF8` with subtle grid pattern
- Cards use `rounded-xl` or `rounded-2xl` with `shadow-sm border border-gray-100`
- Buttons: `bg-gray-900 text-white hover:bg-gray-800`
- Focus rings: `focus:ring-gray-900`

### Design System (Updated Feb 2026)
- **Primary accent**: Gray-900 (`#111827`) - used for buttons, active states, emphasis
- **Grid background pattern**: Applied to main pages via inline style:
  ```tsx
  style={{
    backgroundImage: `
      linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
    `,
    backgroundSize: '48px 48px',
  }}
  ```
- **Platform brand colors** (for charts):
  - ChatGPT: `#10a37f` (teal)
  - Claude: `#d97706` (orange)
  - Gemini: `#4285f4` (blue)
  - Perplexity: `#20b8cd` (teal)
  - Grok: `#1d9bf0` (blue)
  - Llama: `#8b5cf6` (purple)
  - AI Overviews: `#FBBC04` (Google yellow)
- **Metric cards**: Use gradient backgrounds (`from-gray-100 to-gray-50`)
- **Purple accent**: Used for selected items on configure page (`rgba(139, 92, 246, 0.1)`)

### TypeScript
- Strict mode enabled
- Path alias: `@/*` maps to project root
- All API responses are typed in `lib/types.ts`

## API Endpoints

### Internal Next.js API Routes
- `POST /api/validate-brand` - Validates and corrects brand/category names using OpenAI (GPT-4o-mini). For categories, fixes spelling/grammar and returns Title Case corrected names (e.g., "computers Mouses" → "Computer Mice"). System prompt is in `app/api/validate-brand/route.ts`.

### External Backend Endpoints
The frontend expects these backend endpoints:
- `POST /api/v1/suggest` - Get prompt/competitor suggestions
- `POST /api/v1/run` - Start a new analysis run
- `GET /api/v1/run/{id}` - Get run status and results
- `POST /api/v1/run/{id}/cancel` - Cancel a running analysis

## UI Component Variants

Components in `components/ui/` follow this pattern:
- `variant`: visual style (primary, secondary, outline, ghost, etc.)
- `size`: sm, md, lg
- All extend native HTML element attributes

## Key Pages

### Homepage (`app/page.tsx`)
- Explicit search type selector buttons (Brand, Industry, Local, Issue, Public Figure) — user must choose before searching
- Input placeholder and TRY examples change per search type (driven by `searchTypeConfig`)
- Buttons use `flex-1` for equal width
- **Typo correction flow**: When `/api/validate-brand` returns a `correctedName` that differs from user input, an amber inline banner shows "Did you mean **X**?" with accept/reject buttons (state: `correctionSuggestion`). Works for all search types (brand, category, local).

### Configure Page (`app/configure/page.tsx`)
- "AI Platforms to Test" section uses `BrainCircuit` icon (not `Cpu`)

### Configure Page (`app/configure/page.tsx`)
- Edit prompts/questions to ask AI
- Select competitors to track
- Choose AI platforms to test (OpenAI, Claude, Gemini, Perplexity, Grok, Llama, AI Overviews)
- Purple accent for selected items

### Run Page (`app/run/[id]/page.tsx`)
- Circular progress animation
- Platform status indicators with brand colors
- Cancel functionality

### Results Page (`app/results/[id]/page.tsx`)
- Dynamic tab list driven by `searchTypeConfig.tabs` (filtered by `enabled` flag)
- Tab components extracted to `app/results/[id]/tabs/` directory
- Orchestrates `ResultsProvider` with both data and UI contexts
- Industry reports add "Industry Overview" tab composed from multiple sub-components
- Tabs: Visibility, Competitive Landscape, Sentiment & Tone, Sources, Recommendations, Site Audit, Automated Reports, ChatGPT Advertising, Raw Data (availability varies by search type)
- Sentiment colors: emerald-700 (Strong), green-600 (Positive), gray-500 (Neutral), amber-600 (Conditional), red-600 (Negative)
- **AI Analysis section** (industry reports, OverviewTab): Market leader stats (share of all mentions + visibility score with parenthetical definitions) are injected into the AI summary's "Market leader" paragraph — not shown as a separate line. Any "visibility score" in the summary without a definition gets "(% of AI responses that mention the brand)" appended (first occurrence only). Backend "mention rate" text is replaced with "visibility score". Repeated "suggest/suggests" is varied with alternatives (indicates, points to, reflects). Does NOT list all brands — full brand breakdown is in the Competitive tab.
- **Prompt Performance Matrix** (industry reports, CompetitiveTab): Table is capped at ~10 visible rows (`max-height: 480px`) with vertical scroll to see all brands. Header stays sticky. Hint text shown below: "Scroll down to see all X brands".
- **Market Spread donut** (industry reports, OverviewTab): Footer shows total brand count across all prompt responses (e.g., 30), not just the number of chart slices (top 6 + Other).
- **Brand Landscape by Platform** (industry reports, OverviewTab): "Not mentioned" dots use `not_mentioned` sentiment (gray), not the overall response sentiment. When filtering by a specific brand, uses that brand's individual sentiment from `competitor_sentiments`.
- **Citations by Source & Brand heatmap** (industry reports, SourcesTab): Cells are clickable — opens the full response modal with both the source domain and brand highlighted in yellow.
- **Response modal highlighting** (page.tsx): When both brand and domain are set in `selectedResultHighlight`, the modal header shows both, and paragraphs mentioning either are highlighted.
- **Cross-response brand normalization** (backend): GPT-4o-mini normalizes brand name variants across all results (e.g., "ESPN+" and "ESPN Unlimited" → "ESPN+"). Mapping cached on `Run.brand_name_map` (JSON column). Applied to `all_brands_mentioned`, `competitor_sentiments`, and `source_brand_sentiments` in `get_run_status()`.

### Running TypeScript checks
- Must run from the project directory: `cd /Users/davidfield/Documents/ai-visibility-frontend && npx tsc --noEmit`
- Running `npx tsc` from outside the project dir will fail

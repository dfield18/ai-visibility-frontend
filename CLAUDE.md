# CLAUDE.md - Project Context for Claude Code

## Project Overview

AI Visibility Frontend - A Next.js application for analyzing brand visibility across AI providers (OpenAI, Google Gemini). Users enter their brand, configure prompts and competitors, run analysis, and view results showing mention rates and response data.

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
app/                    # Next.js App Router pages
├── layout.tsx          # Root layout with QueryClientProvider
├── page.tsx            # Landing page (brand input)
├── providers.tsx       # React Query provider setup
├── api/validate-brand/ # Brand validation API route
├── configure/page.tsx  # Prompts/competitors configuration
├── run/[id]/page.tsx   # Real-time progress tracking
└── results/[id]/page.tsx # Results dashboard

components/ui/          # Reusable UI components (Button, Card, Badge, etc.)
hooks/
├── useApi.ts           # React Query hooks for API calls
└── useStore.ts         # Zustand store definition
lib/
├── api.ts              # API client class
├── types.ts            # TypeScript interfaces
└── utils.ts            # Helper functions
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
- `POST /api/validate-brand` - Validates and corrects brand names using OpenAI

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
- Brand input with "Visibility" logo
- Search box with TRY chips for quick examples
- Visibility Report preview card

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
- Multi-tab dashboard (Visibility, Competitive Landscape, Sentiment, Sources, Recommendations, Site Audit, Reports, Reference)
- Metric cards with donut charts
- AI Brand Position by Platform chart with platform brand colors
- Detailed response tables and exports

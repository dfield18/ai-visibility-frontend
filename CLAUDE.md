# CLAUDE.md - Project Context for Claude Code

## Project Overview

AI Visibility Frontend - A Next.js application for analyzing brand visibility across AI providers (OpenAI, Google Gemini). Users enter their brand, configure prompts and competitors, run analysis, and view results showing mention rates and response data.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 3.4 with custom `primary` color palette
- **Data Fetching**: TanStack React Query v5
- **State Management**: Zustand v5 with localStorage persistence
- **Icons**: Lucide React

## Project Structure

```
app/                    # Next.js App Router pages
├── layout.tsx          # Root layout with QueryClientProvider
├── page.tsx            # Landing page (brand input)
├── providers.tsx       # React Query provider setup
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
- Custom colors: primary (blue), success (green), error (red), warning (yellow)

### TypeScript
- Strict mode enabled
- Path alias: `@/*` maps to project root
- All API responses are typed in `lib/types.ts`

## API Endpoints

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

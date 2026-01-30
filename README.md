# AI Brand Visibility Tracker - Frontend

A Next.js frontend application for tracking how AI models recommend and mention your brand.

## Overview

This application allows you to:
- Enter a brand name and get AI-suggested search prompts
- Configure which prompts, competitors, and AI providers to test
- Run visibility analysis across OpenAI GPT-4o and Google Gemini
- View detailed results with brand mention rates and competitor analysis
- Export results to CSV

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Data Fetching**: TanStack Query (React Query)
- **State Management**: Zustand
- **Icons**: Lucide React

## Prerequisites

- Node.js 18.17 or later
- npm or yarn
- Running backend server (see [ai-visibility-backend](../ai-visibility-backend))

## Local Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and set your backend URL:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Connecting to Backend

This frontend connects to the FastAPI backend at the URL specified in `NEXT_PUBLIC_API_URL`. Make sure the backend is running before using the application.

Default backend URL: `http://localhost:8000`

### Backend Endpoints Used

- `POST /api/v1/suggest` - Get AI-generated prompts and competitors
- `POST /api/v1/run` - Start a visibility analysis run
- `GET /api/v1/run/{run_id}` - Get run status and results
- `POST /api/v1/run/{run_id}/cancel` - Cancel a running analysis

## Project Structure

```
ai-visibility-frontend/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Landing page - brand input
│   ├── providers.tsx       # React Query provider
│   ├── globals.css         # Global styles
│   ├── configure/
│   │   └── page.tsx        # Configuration page
│   ├── run/
│   │   └── [id]/
│   │       └── page.tsx    # Progress view
│   └── results/
│       └── [id]/
│           └── page.tsx    # Results view
├── components/
│   └── ui/
│       ├── Badge.tsx       # Status badges
│       ├── Button.tsx      # Button component
│       ├── Card.tsx        # Card component
│       ├── Checkbox.tsx    # Checkbox component
│       ├── Input.tsx       # Input component
│       ├── ProgressBar.tsx # Progress bar
│       └── Spinner.tsx     # Loading spinner
├── hooks/
│   ├── useApi.ts           # React Query hooks
│   └── useStore.ts         # Zustand store
├── lib/
│   ├── api.ts              # API client
│   ├── types.ts            # TypeScript types
│   └── utils.ts            # Helper functions
├── .env.local.example      # Environment template
├── next.config.js          # Next.js configuration
├── tailwind.config.ts      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Pages

### 1. Landing Page (`/`)
Enter a brand name to begin analysis. Includes example brands for quick testing.

### 2. Configure Page (`/configure`)
- View and edit AI-generated search prompts
- Select competitors to track
- Choose AI providers (OpenAI, Gemini)
- Configure advanced settings (temperature, repeats)
- See live cost estimates

### 3. Run Page (`/run/[id]`)
- Real-time progress tracking
- Live results preview
- Cancel functionality
- Auto-redirect on completion

### 4. Results Page (`/results/[id]`)
- Summary statistics (mention rate, total calls, cost)
- Provider breakdown with comparison
- Competitor mention analysis
- Filterable results table
- Export to CSV
- Share link

## Features

- **Responsive Design**: Works on desktop and mobile
- **Real-time Updates**: Polls for progress every 2 seconds
- **Persistent State**: Configuration saved in localStorage
- **Error Handling**: Graceful error states throughout
- **Accessibility**: Proper labels and focus states

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

## License

MIT


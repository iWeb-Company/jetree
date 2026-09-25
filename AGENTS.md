# Repository Guidelines

## Project Structure & Module Organization

Jetree is a Next.js 14 App Router application using React 18, TypeScript, and Tailwind CSS.

- `src/app/`: root page, layout, global styles, and API routes for agents, chat, and Telegram webhooks.
- `src/components/`: dashboard UI, including agent cards, department trees, task boards, and configuration modals.
- `src/lib/`: Supabase, AI-provider, and Telegram integrations. `src/lib/agents/` contains orchestration, plugin definitions, and initial data.
- `src/types/index.ts`: shared domain types; `public/`: static assets.
- No test directory or automated test suite currently exists. Treat `.next/` and `node_modules/` as generated content.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: start local development at `http://localhost:3000`.
- `npm run build`: create the production build and run Next.js validation.
- `npm start`: serve an existing production build.
- `npx tsc --noEmit`: check TypeScript without emitting JavaScript.
- `npm run lint`: invokes `next lint`, but ESLint dependencies and configuration are not currently present; setup is needed before treating it as a reliable check.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted TypeScript strings, and semicolons, matching nearby code. Keep TypeScript strict mode enabled. Use PascalCase for components and interfaces, camelCase for functions and variables, and Next.js filenames such as `page.tsx` and `route.ts`. Prefer `@/` imports for modules under `src/`. Use Tailwind utilities for styling and add `'use client'` where browser state or hooks require it. No formatter is configured.

## Testing Guidelines

There is no `npm test` script, testing framework, or coverage threshold. For changes, run type checking and the production build, and report existing failures separately. Manually exercise affected dashboard flows and API success/error paths using development credentials. If introducing tests, document the runner and use descriptive `*.test.ts` or `*.test.tsx` filenames.

## Commit & Pull Request Guidelines

History uses short subjects such as `Update route.ts`; no formal convention is established. Prefer imperative, descriptive subjects such as `Fix Telegram agent routing`. Keep commits focused. PRs should explain behavior changes, list validation results, link relevant issues, and include screenshots for UI changes.

## Security & Configuration

Keep credentials in ignored `.env.local` files. Configure Supabase through `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; keep AI-provider keys and `TELEGRAM_BOT_TOKEN` server-side. Never copy credentials into documentation, commits, or logs.

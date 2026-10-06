# Repository Guidelines

## Project Structure & Module Organization

Jetree is a Next.js 14 App Router application using React 18, TypeScript, and Tailwind CSS.

- `src/app/`: root page, layout, global styles, and API routes for agents, chat, and Telegram webhooks.
- `src/components/`: dashboard UI, including agent cards, department trees, task boards, and configuration modals.
- `src/lib/`: Supabase, AI-provider, and Telegram integrations. `src/lib/agents/` contains orchestration, plugin definitions, and initial data.
- `src/types/index.ts`: shared domain types; `public/`: static assets.
- `tests/`: automated TypeScript tests; `tests/database/`: disposable PostgreSQL migration and RLS checks. Treat `.next/` and `node_modules/` as generated content.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: start local development at `http://localhost:3000`.
- `npm run build`: create the production build and run Next.js validation.
- `npm start`: serve an existing production build.
- `npx tsc --noEmit`: check TypeScript without emitting JavaScript.
- `npm run lint`: runs the configured Next.js ESLint checks.
- `npm test`: runs the TypeScript tests with Node and tsx.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted TypeScript strings, and semicolons, matching nearby code. Keep TypeScript strict mode enabled. Use PascalCase for components and interfaces, camelCase for functions and variables, and Next.js filenames such as `page.tsx` and `route.ts`. Prefer `@/` imports for modules under `src/`. Use Tailwind utilities for styling and add `'use client'` where browser state or hooks require it. No formatter is configured.

## Testing Guidelines

For changes, run `npm test`, lint, type checking and the production build, and report existing failures separately. The database CI job applies migrations in a fresh PostgreSQL 17 database and checks RLS using synthetic identities. Its minimal Auth contract is not a substitute for Supabase staging, HTTP authentication or E2E tests. Never run `tests/database/bootstrap.sql` on an existing database. Use descriptive `*.test.ts` or `*.test.tsx` filenames.

## Commit & Pull Request Guidelines

History uses short subjects such as `Update route.ts`; no formal convention is established. Prefer imperative, descriptive subjects such as `Fix Telegram agent routing`. Keep commits focused. PRs should explain behavior changes, list validation results, link relevant issues, and include screenshots for UI changes.

## Security & Configuration

Keep credentials in ignored `.env.local` files. Configure Supabase through `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; keep AI-provider keys and `TELEGRAM_BOT_TOKEN` server-side. Never copy credentials into documentation, commits, or logs.

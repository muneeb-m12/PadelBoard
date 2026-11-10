# PadelBoard

Smart court lighting and booking management for padel clubs.
Next.js (App Router, TypeScript, Tailwind) + Supabase — following Product Documentation v1.0, Phase 1 (software only, lights simulated on screen).

## Run it (demo mode, no database needed)

**Prerequisite: Node.js 22.12 or newer** (check with `node -v`). Older Node versions fail with
`require() of ES Module ... magic-string ... not supported` when Tailwind/Turbopack loads,
because loading an ES module with `require()` is only supported from Node 20.19 / 22.12 onwards.
If you upgrade Node, delete `node_modules` and `.next` and run `npm install` again.

```bash
npm install
npm run dev
# open http://localhost:3000
```

Without Supabase keys the dashboard runs with seeded demo data in the browser: court cards with live countdowns, free-slots grid, add booking (overlap rejected), check-in (15-minute window; the session end is anchored to the booked end, so a late arrival loses the missed minutes), extend 30m/1h, free "club delay" comp minutes when the delay was the club's fault, no-show release, manual light override, light log, savings/utilization figures, and Reset demo data.

## Connect Supabase (5 minutes)

1. Create a free project at https://supabase.com
2. In the project: **SQL Editor** → paste and run `supabase/schema.sql`
   (creates clubs, courts, bookings, light_log, enables RLS + Realtime, and the database-level no-double-booking exclusion constraint)
3. **Project Settings → API**: copy the Project URL and anon key
4. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only, for the cron route)
   - `CRON_SECRET` (any long random string)
5. Restart `npm run dev`

The Supabase client lives in `src/lib/supabase/client.ts` (browser) and `server.ts` (service role). Booking rules shared by UI and database live in `src/lib/rules.ts`.

> Next step to go fully live on Supabase: swap the in-memory state in `src/components/Dashboard.tsx` for Supabase queries + Realtime subscriptions on `courts` / `bookings` (the schema already publishes them), and add Supabase Auth for owner/staff roles (Doc §9).

## Automatic lights-off in production

`vercel.json` schedules `/api/cron/switch-off` every minute on Vercel. That route (service-role key required) completes due sessions and switches lights off, skipping courts under manual override — so it works even if every phone and browser is closed (Doc §3, §10).

## Deploy

Push this folder to GitHub, import it in Vercel, set the same env vars, deploy. Or:

```bash
npx vercel
```

## Project map

```
src/app/page.tsx                 Dashboard page
src/components/Dashboard.tsx     All dashboard UI + demo-mode logic
src/lib/types.ts                 Court / Booking / LightLog / Settings types
src/lib/rules.ts                 Overlap, check-in window, lights-off rules (Doc §3, §5)
src/lib/supabase/client.ts       Browser Supabase client (null in demo mode)
src/lib/supabase/server.ts       Service-role client for cron
src/app/api/cron/switch-off/     Every-minute switch-off route
supabase/schema.sql              Database schema, RLS, Realtime, seed club
```

## Not in this version (per the roadmap)

Real hardware / relays (Phase 3), QR/PIN self check-in (Phase 4), online payments (Phase 5), login & roles UI (schema/RLS are ready for it).

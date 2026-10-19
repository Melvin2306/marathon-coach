# Marathon Coach

A local-first marathon training app built with Next.js 16 (App Router), React 19 and Tailwind CSS 4.

## Features

- **Personalised plan**: a periodised plan (Base → Build → Marathon-specific → Taper) generated from your race date, current fitness, weekly volume, days per week and experience. Includes cutback weeks every 4th week, a tune-up half marathon, and a 3-week taper.
- **Paces that fit you**: training paces (Easy, Marathon, Threshold, Interval, Repetition) from Jack Daniels' VDOT model, progressing gradually toward your goal.
- **Today dashboard**: countdown, today's workout, this week, race prediction vs goal, and planned-vs-actual training load.
- **Coach insights**: flags missed or excessive volume, easy runs done too hard, upcoming long-run prep, and offers to recalibrate paces when you log a faster race.
- **Training log**: log runs with distance, time, effort (RPE) and notes. Click a run to open everything recorded for it: heart rate, cadence, power, stride, ground contact, elevation, weather, time in heart-rate zones, heart-rate / pace / elevation charts, Strava splits, best efforts and route.
- **Progress**: fitness trend from pace + heart rate, weekly heart-rate zone mix, resting heart rate, HRV and Apple's VO₂max, Strava totals and shoe mileage.
- **Treadmill mode**: one Outdoor / Treadmill switch (remembered) turns every workout into a treadmill program: belt speed in km/h or mph, incline and structured steps (warm-up, reps, recoveries, cool-down) with estimated times. Races and the tune-up half stay outdoors.
- **Workout guide**: every session type explained (what, why, how it should feel), with your current pace and heart-rate range, on the Plan page and per workout.
- **Data priority**: recorded data wins. Apple Health replaces matching Strava and manual entries, and Strava replaces manual ones. Your effort ratings, notes and run types are kept.
- **Strava**: connect once and runs sync automatically when the app opens or regains focus (at most every 15 minutes; first sync covers a year). Splits, best efforts and streams load for the newest runs and whenever you open a run. Upload of the Strava bulk export (`activities.csv` or the archive ZIP) also works without an API app.
- **Apple Health import**: upload the Health app's `export.zip`; it is streamed and parsed entirely in the browser (~130 MB/s). Besides workouts it reads the heart-rate samples recorded during each run, running dynamics, weather metadata and daily resting heart rate, HRV and VO₂max. Runs are deduplicated across sources.
- **English and German**: locale-prefixed routes (`/en`, `/de`), chosen from your browser language and switchable in the nav.
- **Pace calculator**: VDOT, training paces, equivalent race times and race-day splits.
- **Your data stays local**: everything is stored in `localStorage`. Export and import backups from Settings.

## Methodology and sources

The plan and the paces are checked against published data, studies and established plans. The goal is to make the app's advice defensible.

**Paces and predictions** (`src/lib/vdot.ts`)
- Jack Daniels' VDOT model (Daniels/Gilbert equations). Race equivalents are within 0.2% of Daniels' tables. Marathon, threshold and interval paces are within ~1 s/km of the official VDOT O2 calculator from VDOT 40 upward.
- Easy pace is 62–70% of VDOT. Repetition pace is interval pace minus 15 s/km. Both match the official calculator.
- Known gap: below VDOT ~39, the online calculator gives faster paces than the older book tables. The app keeps the book's more conservative values.
- **Realistic marathon time:** VDOT/Riegel predictions are too optimistic for recreational marathoners. In Vickers & Vertosick 2016 (BMC Sports Sci Med Rehabil, n = 2,303), the median runner finished ~10 min slower than predicted. The app shows their model 1, which corrects for weekly mileage, next to the "fully trained" VDOT time.
- **Improvement cap:** the planned improvement depends on level: +6 VDOT below 35, +4 for 35–45, +3 for 45–55, +2 above. Training paces never run more than 1 VDOT ahead of your last race result. 5K fitness checks every 8 weeks and a tune-up half marathon unlock the rest (Daniels: raise VDOT step by step, confirmed by performances).

**Current fitness from recorded runs** (`src/lib/fitness.ts`)
- When recorded runs (Apple Health, Strava) exist, they replace the manual fitness values. Weekly distance and longest run come from the 4 weeks before the plan start, so the plan stays stable as you import more.
- Fitness (VDOT) is the median of per-run estimates from the last 8 weeks. Each estimate uses the run's pace and average heart rate as a share of max heart rate. Max HR is the highest workout maximum of the past year, unless it stands more than 8% above the next-highest (then it's treated as a sensor spike). Your fastest recent effort sets the floor. Treadmill runs are excluded.
- Heart rate maps to intensity through a linear fit of Daniels' own zone anchors (%HRmax = 0.877·%VDOT + 14.0, within 1.8 points of each anchor). Lab equations such as Swain 1994 map to measured VO2max, not VDOT, and would overstate fitness by ~15–20% at easy effort.
- In simulation, the estimator recovers a true VDOT of 40 as 39.8 from mostly easy runs. Without heart rate it falls back to the fastest effort, a conservative lower bound; the plan's 5K fitness checks sharpen it.

**Heart-rate zones** (`src/lib/heart.ts`)
- Five zones matched to the training paces via Daniels' heart-rate anchors: recovery < 65% of max, easy 65–79%, marathon 80–87%, threshold 88–92%, interval ≥ 93%.
- Time in zones uses the heart-rate series recorded during each run (Apple Health samples or Strava streams, in 30-second buckets, from the device that recorded the run). Runs with only an average heart rate count toward that average's zone, and the charts say so.

**Treadmill programs** (`src/lib/treadmill.ts`)
- Running segments use a 1% incline: without air resistance, a 1% grade best matches the energy cost of outdoor running (Jones & Doust 1996, J Sports Sci; tested at 10.5–18 km/h).
- Speeds are the training paces converted to km/h or mph, rounded to the 0.1 steps treadmills use. Easy runs show a range.
- Hill repeats use a 6% incline. The speed is solved so the oxygen cost (Daniels' equation plus the ACSM vertical term, 0.9 · speed · grade) matches flat running at interval pace.

**Plan structure** (`src/lib/plan.ts`)
- **Peak volume and long runs:** benchmarked against Higdon (Novice/Intermediate), Pfitzinger 18/55–18/70, Hansons and Daniels 2Q. Also against Knopp et al. 2024 (Sports Med Open, 92 plans), where low-volume plans peak at ~59 km with a ~30 km long run. Peak volume is also capped at 3× your starting volume (minimum 40 km).
- **Progression:** at most +8% per week over the last full week, including after cutback weeks. Higdon rebounds by about 20%, and Nielsen et al. 2014 (JOSPT) flags increases over 30% across two weeks.
- **Single-run rule:** no planned run is more than 10% longer than the longest run of the previous 30 days. This is the clearest injury signal in Frandsen et al. 2025 (BJSM, 5,205 runners). The coach also warns when a *logged* run breaks it.
- **Long runs:** capped at ~3 h at easy pace (3.5 h for experienced runners), but never below 26 km. Time caps are coaching practice (Daniels, Hansons) rather than tested in studies. Some plans (Higdon) prescribe 32 km for everyone, and Doherty et al. 2020 linked runs of 32 km or more to faster finishes.
- **Intensity:** at most 1 hard session per week on 3 days and 2 on 4–6 days, counting marathon-pace long runs. That keeps ~85–90% of volume easy, a pyramidal distribution in line with Knopp 2024 and Muniz-Pumares 2024.
- **Taper:** 3 weeks at ~80/60/40% of peak volume, keeping some intensity. Bosquet et al. 2007 meta-analysis; Smyth & Lawlor 2021 (158k Strava marathoners) found strict 3-week tapers ~2.6% faster.

**Coaching tips** follow current evidence:
- Fuelling: 30–60 g carbohydrate per hour, building to 60–90 g/h for marathon efforts (Jeukendrup).
- Strength training: framed as improving running economy (Blagrove 2018). Evidence that it prevents running injuries is weak (Wu 2024, Toresdahl 2020).
- Shoes typically last 500–800 km; sleep at least 7 h (Walsh 2021).

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

## Strava sync (optional)

1. Create an API application at https://www.strava.com/settings/api. Set **Authorization Callback Domain** to `localhost` (or your deployed host).
2. Copy `.env.example` to `.env.local` and fill in `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`.
3. Restart the dev server, then go to **Import → Connect with Strava**.

The app requests `read,activity:read_all,profile:read_all` (profile access enables shoes and running totals). A sync uses roughly 4–10 requests, well within Strava's default limit of 100 read requests per 15 minutes. Tokens are kept in an httpOnly cookie in your browser; route handlers under `src/app/api/strava` talk to Strava so the client secret never reaches the client. Without these variables the Strava archive upload still works.

## Structure

- `src/lib/plan.ts`: plan generator (a pure function of the profile)
- `src/lib/vdot.ts`: VDOT model, pace and race-time prediction
- `src/lib/coach.ts`: coaching insights from the plan and the run log
- `src/lib/store.ts`: localStorage-backed store (`useSyncExternalStore`)
- `src/lib/import/*`: Strava CSV and Apple Health parsers, streaming ZIP reader, dedupe
- `src/lib/strava/server.ts`: Strava OAuth and API client (server only)
- `src/i18n/*`: locale config, message catalogs (`messages/en.ts`, `messages/de.ts`), translation helpers
- `src/proxy.ts`: redirects locale-less URLs to `/en` or `/de`
- `src/lib/heart.ts`, `src/lib/progress.ts`: heart-rate zones and Progress-page series
- `src/lib/strava/client.ts`: browser-side sync (auto-sync, detail loading)
- `src/components/charts.tsx`: line, stacked-column and share-bar charts
- `src/app/[lang]/*`: pages (Today, Plan, Log, Progress, Import, Paces, Settings)
- `src/app/api/strava/*`: OAuth connect/callback, activities, activity detail + streams, athlete, status, disconnect

To add a language, add it to `LOCALES` in `src/i18n/config.ts` and create a catalog typed against `en`.

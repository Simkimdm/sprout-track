# Sprout Track — Arbeitskontext

Kompakter Einstiegskontext für die Arbeit am Repo. Die verbindlichen, detaillierten
Regeln stehen in [CLAUDE.md](CLAUDE.md) — dieses Dokument fasst zusammen und verlinkt.

## Was die App ist

**Sprout Track** (npm-Name `baby-tracker`, v1.6.8) ist eine selbst gehostete
Next.js-Anwendung zum Tracken von Baby-Aktivitäten und -Entwicklung: Schlafen,
Füttern, Windeln, Baden, Messungen, Medikamente, Aktivitäten, Meilensteine.
Dazu: Tages-Dashboard, Monatskalender, Reports mit Wachstumskurven (WHO/CDC-
Referenzdaten als CSV in `documentation/`), PDF-Report-Card, Voll-Log mit
CSV/XLSX-Export, Nursery-Modus, Dark Mode, PWA mit Offline-Support und
Push-Benachrichtigungen (VAPID). 5 Sprachen (en/es/fr/de/it). API-Keys und
Webhooks für Home Assistant, Grafana, NFC.

## Tech-Stack

- **Next.js App Router** (`app/`) + **TypeScript strict**
- **Prisma 7** mit Dual-Provider: SQLite (Standard, Docker-Build) und PostgreSQL
  (`DATABASE_PROVIDER`) — alles muss mit beiden kompatibel sein
- **TailwindCSS 4 + CVA** für Varianten; **kein** CSS Modules, **kein** Styled Components
- State/Fetching: `useState`/`useEffect` + Custom Hooks — **React Query wird nicht verwendet**
- Vitest (`npm test`), Tests in `tests/*.test.ts` (node-env, `@/`-Alias)
- Deploy: einzelnes Docker-Image (`Dockerfile`, `docker-startup.sh`), das das
  Prisma-Schema zur Laufzeit auf den Provider umschreibt und neu generiert

## Struktur

```
app/                  Next.js App Router: Routen + ALLE API-Routen (app/api/*)
app/api/utils/auth.ts Auth-Middleware (withAuth / withAdminAuth / withAuthContext)
src/components/       Feature-Ordner (Calendar/, Reports/, Timeline/, features/nursery-mode/ …)
src/components/ui/    Basis-Primitives; je Ordner: index.tsx, styles.ts (CVA), .css, types.ts, README.md
src/hooks/            Custom Hooks (useWakeLock, useIsMobile, useAuthedImage …)
src/context/          localization.tsx, theme.tsx, family.tsx
src/utils/            Pure Functions (testbar ohne DB/React) — Logik hierher auslagern
src/localization/     translations/{en,es,fr,de,it}.json (flach, Keys = englischer Text)
prisma/               schema.prisma, seed.ts, prisma.config.ts, log.config.ts (Log-DB)
documentation/        Architektur- & Datenmodell-Doku, WHO/CDC-Wachstumsreferenzen
tests/                Vitest-Suites, u. a. Guards für Prisma-7-Flags und next.config
```

## Häufige Befehle

```bash
npm run dev                 # Next.js Dev-Server
npm test                    # Vitest (Pflicht für jede Änderung)
npm run lint                # ESLint
npm run prisma:generate     # Client generieren (mit Provider-Prepare)
npm run prisma:migrate      # SQLite-Migrationen
docker compose up           # App lokal; docker-compose.postgres.yml für Postgres
```

## Die wichtigsten Regeln (Details in CLAUDE.md)

1. **Family-Scoping (goldene Regel):** Nie client-gesendeter Family-Kontext
   vertrauen — Datenzugriff immer über `authContext.familyId` aus der
   Auth-Middleware scopen; Ressourcen vorher laden und `familyId` prüfen (404 bei Mismatch).
2. **Prisma 7:** Driver-Adapter sind Pflicht (`@prisma/adapter-pg` /
   `@prisma/adapter-better-sqlite3`); kein `--skip-generate` bei `db push`;
   Schema-Sync brancht auf `isPostgreSQL()`. Zwei Clients: main + Log-DB
   (`prisma/log-db.ts`).
3. **Dark Mode** über `html.dark`-Selektoren in `[component].css` — **keine**
   Tailwind-`dark:`-Klassen (umgeht den In-App-Theme-Toggle).
4. **Lokalisierung:** Jeder user-sichtbare Text über `useLocalization().t('…')`;
   Key zuerst nur in `en.json`, dann `node scripts/check-missing-translations.js`.
5. **Native Shell (Capacitor, separates Repo `mobile-app-v1`):** Jede native-aware
   Änderung gated auf `isNativeApp()` und no-op im Browser. `src/utils/bridge-contract.ts`
   ist vendored — nicht hier editieren. Kein Payment-UI im Shell.
6. **Styling:** Light = Tailwind via CVA in `styles.ts`; Dark = `html.dark` in `.css`.
   Komponenten < 200 LOC, Container/Presentational-Trennung.
7. **API-Antwortformat:** `{ success: boolean, data?: T, error?: string }`.
8. **Tests:** Jede Änderung bringt Test-Scoping mit; Logik zuerst als Pure Function
   in `src/utils/` extrahieren, dann testen.

## Arbeitsweise in diesem Repo

- Änderungen auf Task-Branches (`vibe/<slug>-<id>`), PRs gegen `main`, Merge via PR.
- Commit-Stil: Conventional Commits (`fix(docker): …`, `feat(diaper): …`, `fix(security): …`).
- Vor jeder Änderung `CLAUDE.md`, betroffene Komponenten-READMEs und bestehende
  Tests im selben Bereich lesen.
- `.env.sample` enthält keine echten Secrets (wurde bewusst gesäubert — so lassen).

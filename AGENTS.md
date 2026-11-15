# Sprout Track — Projekt-Kontext für AI-Agenten

Diese Datei ist der schnelle Einstiegspunkt. Die **vollständigen Entwicklungsregeln** stehen in [`CLAUDE.md`](CLAUDE.md) — lies sie vor jeder größeren Änderung. Architektur-Details liegen in [`documentation/Architecture-Documentation/`](documentation/Architecture-Documentation/), Admin-Doku in [`documentation/Admin-Documentation/`](documentation/Admin-Documentation/).

## Was ist das?

**Sprout Track** ist eine self-hosted Web-App zum Tracken der Entwicklung von Babys/Kleinkindern: Aktivitäten (Schlaf, Füttern, Windeln, Baden, Medikamente, Messungen, Meilensteine, Fotos), Kalender, Reports/Wachstumskurven (CDC-Perzentilen), PDF-Report-Cards, Nursery-Modus, PWA mit Push-Benachrichtigungen, Multi-Family- und Multi-Caretaker-Support (PIN-basiert) plus Account-Login (E-Mail/Passwort). Self-Hosting via Docker, Datenbanken: SQLite oder PostgreSQL.

## Tech Stack

- **Next.js (App Router) + React 19 + TypeScript (strict)** — `app/` für Routen & API-Routes, `src/` für Komponenten/Hooks/Utils/Context/Types
- **Prisma 7** mit SQLite **oder** PostgreSQL (beide müssen funktionieren!) — Schema in `prisma/schema.prisma` (~75 Models), zweites Log-DB-Schema in `prisma/log-schema.prisma`
- **TailwindCSS 4** — Utility-first, **keine CSS Modules**, CVA für Varianten
- **Vitest** — Tests in `tests/*.test.ts` (node-Umgebung, `@/`-Alias)
- **Docker** — Multi-Stage-Build, `docker-startup.sh` regeneriert den Prisma-Client zur Laufzeit je nach `DATABASE_PROVIDER`
- PWA (Service Worker, VAPID Web-Push, Wake Lock) + Capacitor-Shell (separates Repo `mobile-app-v1`) mit nativem Layer in `src/utils/native-*.ts`

## Projektstruktur

```
app/                  Next.js App Router — Seiten (Gruppen: (app), (auth), (nursery), ...) + api/ (eine Route pro Ressource)
app/api/              API-Routes, z. B. app/api/feed-log/route.ts, app/api/auth/route.ts; Auth-Utils in app/api/utils/auth.ts
src/components/       ui/ (Primitives), forms/, modals/, Feature-Komponenten (Calendar/, Timeline/, Reports/, ...), features/nursery-mode/
src/context/          React-Contexts: family.tsx, theme.tsx, localization.tsx
src/hooks/            Custom Hooks
src/utils/            Reine Hilfsfunktionen (testbar, z. B. native-app.ts, shell-chrome.ts)
src/localization/     Übersetzungen: translations/{en,de,es,fr,it}.json — Keys = englischer Text
prisma/               schema.prisma, log-schema.prisma, migrations/ (nur SQLite)
tests/                Vitest-Tests (*.test.ts)
documentation/        Architecture-Documentation/, Admin-Documentation/, Implementation/, User-Documentation/
scripts/              Setup-/Hilfsskripte (Bash + tsx)
```

## Die wichtigsten Regeln (Details in CLAUDE.md)

1. **Family-Scoping ist heilig:** Niemals client-gesendete Family-IDs vertrauen. Quelle der Wahrheit ist `authContext.familyId` aus `withAuthContext`. Jeder DB-Zugriff muss auf `familyId` eingeschränkt sein (404 bei Mismatch).
2. **Auth-Wrapper korrekt wählen:** `withAuth` (eingeloggt), `withAdminAuth` (Admin), `withAuthContext` (liefert `authContext`). JWT in `localStorage` als `authToken`, Header `Authorization: Bearer <token>`.
3. **Prisma 7 Gotchas:** `new PrismaClient()` braucht einen Driver-Adapter (`@prisma/adapter-pg` / `@prisma/adapter-better-sqlite3`). `prisma db push` akzeptiert kein `--skip-generate`. SQLite nutzt versionierte Migrations, PostgreSQL `db push`. Zwei generierte Clients (main + log).
4. **Dark Mode:** Niemals Tailwind-`dark:`-Klassen — stattdessen `html.dark .klasse` in der `.css`-Datei des Komponenten-Ordners (in-app Theme-Toggle, nicht System-Präferenz).
5. **Lokalisierung:** Nie hartkodierte Strings. `const { t } = useLocalization()`, Key = englischer Text in `src/localization/translations/en.json`, danach `node scripts/check-missing-translations.js` ausführen.
6. **Styling:** Pro Komponente ein Ordner mit `index.tsx`, `*.styles.ts` (CVA + Tailwind, Light Mode), `*.css` (Dark Mode via `html.dark`), `*.types.ts`, `README.md`. Komponenten klein halten (< 200 Zeilen), "dumb" + konfigurierbar über Props.
7. **State:** React Hooks + Context, **kein React Query** für Fetching (trotz Abhängigkeit im Projekt nicht für Daten-Fetching nutzen — `useEffect` + fetch). Offline-first denken (PWA).
8. **Formulare:** Standard-React-State (`useState`/`useEffect`), kein React Hook Form.
9. **Tests:** Jede Änderung braucht Tests in `tests/`. Nicht-triviale Logik als pure Funktionen nach `src/utils/` auslagern. Test-First bevorzugen. `npm test` (Vitest).
10. **Native Shell:** Jede native-aware Verzweigung muss im normalen Browser no-op sein (Detection via `isNativeApp()` aus `src/utils/native-app.ts`, nie inline während Render lesen — Hydration-Mismatch, stattdessen in `useEffect` in State). `src/utils/bridge-contract.ts` ist vendored — nicht hier editieren.

## API-Konventionen

- Antwort-Format konsistent: `{ success: boolean, data?: T, error?: string }`
- Eine Route pro Ressource unter `app/api/<ressource>/route.ts` mit HTTP-Methoden als benannte Exports
- Deutsch/Englisch in Doku ok, Code & Commit-Messages auf Englisch

## Development Workflow

- **Immer auf Feature-Branch arbeiten** (`vibe/<slug>-<id>`), nie direkt auf `main`. PR via `gh pr create --draft`.
- Lokale Entwicklung: `./scripts/setup.sh` dann `npm run dev` (Node 22+). Tests: `npm test`. Lint: `npm run lint`. Build: `npm run build`.
- Prisma-Änderungen: Schema editieren, dann `npm run prisma:generate` (bzw. `prisma:generate:log` fürs Log-Schema); für SQLite Migration anlegen, für PostgreSQL `db push`.
- Vor jedem Commit: `npm test` und `npm run lint` müssen grün sein.
- Commit-Messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, ...), Englisch, klein/geschlossen.

## Wichtige Dokumente

| Thema | Datei |
|-------|-------|
| Alle Dev-Regeln | `CLAUDE.md` |
| Datenmodell | `documentation/Architecture-Documentation/DataModel.md` |
| Auth & Autorisierung | `documentation/Architecture-Documentation/AuthenticationAndAuthorization.md` |
| API-Design | `documentation/Architecture-Documentation/APIDesignPatterns.md` |
| Komponenten & Styling | `documentation/Architecture-Documentation/ComponentAndStylingSystem.md` |
| Native App Integration | `documentation/Architecture-Documentation/NativeAppIntegration.md` |
| PWA & Push | `documentation/Architecture-Documentation/PWAAndNotifications.md` |
| Neue Aktivität hinzufügen | `documentation/Implementation/add-new-activity.md` |
| Docker Deployment | `documentation/Admin-Documentation/docker-deployment.md` |
| Umgebungsvariablen | `documentation/Admin-Documentation/environment-variables.md` |

## Defaults & Zugangsdaten (lokale Dev-Umgebung)

- URL: http://localhost:3000, System-PIN default `111222`, Family-Manager `/family-manager` Passwort default `admin`
- Demo: https://www.sprout-track.com/demo (ID `01`, PIN `111111`)

# Security Operations Notes

## Overview

Deliberate security trade-offs and known limits that operators should be aware of. These are conscious decisions, not bugs — each section describes the behavior, why it exists, and what to watch for.

## Token blacklist fails open during database outages

`isTokenBlacklisted()` (`app/api/utils/auth.ts`) is checked on every authenticated request. On logout/revocation, `invalidateToken()` stores the SHA-256 hash of the token in the `SecurityEvent` table (kind `token_blacklist`) until the token's original `exp` — only the hash is stored, never the token itself.

If the database is unreachable when the blacklist is checked, the lookup throws, is logged (`isTokenBlacklisted error:`), and the function returns `false` — the token is treated as **valid**. This is deliberate: failing closed would reject every user whenever the database hiccups (availability over revocation).

Operational impact:

- During a DB outage, revoked tokens (e.g. after a logout on a lost device) are accepted again until the database recovers.
- The exposure is bounded: blacklist entries live only until the token's own `exp`, and access tokens expire after `AUTH_LIFE` (default 30 minutes) regardless of the blacklist.
- No action required — just be aware that "log out everywhere" is only fully effective once the database is healthy again.

## IP lockout window is anchored at the first failed attempt

`recordFailedAttempt()` (`app/api/utils/ip-lockout.ts`) keeps a per-IP counter in the `SecurityEvent` table (kind `ip_lockout`):

- 3 failed attempts within the window trigger a 5-minute lockout (`locked: true` with a fresh `expiresAt`).
- The counter window (`expiresAt` on non-locked rows) is set when the **first** failed attempt creates the row; later failed attempts increment `count` but do not extend `expiresAt` (the `update` branch leaves it unchanged).
- The window is therefore anchored at the first failed attempt, not sliding: 3 failures spread over 4 minutes still trigger a lockout, and the counter resets 5 minutes after the first failure, not the last.

`checkIpLockout()` and `recordFailedAttempt()` also fail open on DB errors — a DB hiccup must not lock out every IP.

## Content-Security-Policy allows 'unsafe-inline' for scripts and styles

The CSP in `next.config.ts` sets `script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`. Next.js hydration relies on inline `<script>` tags, so dropping `'unsafe-inline'` breaks the app at runtime. Everything else is locked down (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, plus `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and a `Permissions-Policy` that allows only the camera).

Long-term improvement: move to a nonce- or hash-based CSP so only inline scripts emitted by Next.js itself execute. Until then, keep the remaining directives strict and treat any XSS in the app as the primary way to bypass this.

Note: `Strict-Transport-Security` is sent on every response but browsers only enforce it over HTTPS — serve the app behind TLS in production.

## Notification cron log is size-capped (non-root containers)

The container runs as non-root (uid 1000) by default, where `crond` is unavailable, so `docker-startup.sh` runs the notification cron in a per-minute loop appending to `/app/logs/notification-cron.log`. The loop truncates the log once it exceeds 1 MiB, so the file cannot grow unbounded on the `/app/logs` volume. Root containers use `crond` with the system crontab and are unaffected.

## Related Documentation

- [Authentication and Authorization](../Architecture-Documentation/AuthenticationAndAuthorization.md)
- [Docker Deployment](docker-deployment.md)
- [Push Notifications](push-notifications.md)
- [Environment Variables](environment-variables.md)

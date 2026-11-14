import type { NextConfig } from 'next';

/**
 * Keep the Prisma client and its driver adapters out of the Next/Turbopack
 * server bundle so they are `require`d from `node_modules` at runtime.
 *
 * Why this matters (issue #266): Prisma requires a *literal* datasource
 * `provider` in schema.prisma, so the provider ("sqlite" | "postgresql") is
 * frozen into the generated client at `prisma generate` time — it cannot come
 * from an env var. The Docker image runs `prisma generate` at build time with
 * the default sqlite provider, then `next build`. Without this config,
 * Turbopack inlines that sqlite-generated client into `.next/server/chunks`.
 *
 * At container startup `docker-startup.sh` rewrites the schema to the runtime
 * DATABASE_PROVIDER and re-runs `prisma generate`, which correctly updates
 * `node_modules/.prisma/client` to postgresql — but a bundled copy would be
 * ignored, so a PostgreSQL deployment loaded the stale sqlite client and threw
 * `PrismaClientInitializationError: The Driver Adapter @prisma/adapter-pg ...
 * is not compatible with the provider sqlite specified in the Prisma schema.`
 *
 * Marking these packages external makes the runtime-regenerated client the one
 * that actually loads, so a single image serves both sqlite and postgresql.
 */
const nextConfig: NextConfig = {
  // Baseline security headers for all routes. CSP allows 'unsafe-inline' for
  // script/style because Next.js hydration relies on inline scripts; everything
  // else is locked to self (images/media also allow data:/blob: for photos and
  // camera previews, worker-src blob: for the PWA service worker).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "media-src 'self' blob:",
              "connect-src 'self' blob:",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Ignored by browsers on plain HTTP, enforced when served over HTTPS
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Camera is used for photo capture (getUserMedia); mic/geo stay off
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  serverExternalPackages: [
    // The main client is imported as `@prisma/client`; the log client is
    // generated to a custom output and imported directly as `.prisma/log-client`
    // (see prisma/log-db.ts). BOTH must be external or Turbopack inlines the
    // generated client — including its build-time `activeProvider` — into the
    // server bundle, defeating the runtime `prisma generate` in docker-startup.sh.
    // Turbopack matches these by import specifier, not the generated package's
    // hashed name, so list the specifiers exactly as imported.
    '@prisma/client',
    '.prisma/client',
    '.prisma/log-client',
    '@prisma/adapter-pg',
    '@prisma/adapter-better-sqlite3',
    'better-sqlite3',
  ],
};

export default nextConfig;

import { NextRequest } from 'next/server';
import logPrisma from '../../../prisma/log-db';

export interface ApiLogEntry {
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  ip?: string;
  userAgent?: string;
  caretakerId?: string;
  familyId?: string;
  error?: string;
  requestBody?: any;
  responseBody?: any;
}

// Keys whose values must never be written to the log database, matched
// case-insensitively at any nesting level of request/response bodies.
const SENSITIVE_KEYS = new Set([
  'password', 'adminpassword', 'newpassword', 'oldpassword', 'currentpassword',
  'securitypin', 'pin', 'newpin', 'currentpin',
  'token', 'refreshtoken', 'accesstoken', 'idtoken',
  'authorization', 'apikey', 'secret', 'clientsecret',
  'privatekey', 'vapidprivatekey',
]);

/**
 * Deep-redacts sensitive fields (passwords, PINs, tokens, keys, secrets) from
 * a value before it is logged. Defense-in-depth on top of the per-route
 * '[REDACTED]' markers: even if a route forgets to redact, the log DB never
 * receives credentials.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[MaxDepth]';
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redactSensitive(v, depth + 1);
    }
    return out;
  }
  return value;
}

export async function logApiCall(entry: ApiLogEntry): Promise<void> {
  // Check if logging is enabled
  if (process.env.ENABLE_LOG !== 'true') {
    return;
  }

  try {
    await logPrisma.apiLog.create({
      data: {
        method: entry.method,
        path: entry.path,
        status: entry.status ?? null,
        durationMs: entry.durationMs ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        caretakerId: entry.caretakerId ?? null,
        familyId: entry.familyId ?? null,
        error: entry.error ?? null,
        requestBody: entry.requestBody ? JSON.stringify(redactSensitive(entry.requestBody)) : null,
        responseBody: entry.responseBody ? JSON.stringify(redactSensitive(entry.responseBody)) : null,
      },
    });
  } catch (error) {
    // Don't let logging errors break the API
    console.error('Failed to write API log:', error);
  }
}

export function getClientInfo(req: NextRequest) {
  return {
    ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

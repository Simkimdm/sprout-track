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
        requestBody: entry.requestBody ? JSON.stringify(entry.requestBody) : null,
        responseBody: entry.responseBody ? JSON.stringify(entry.responseBody) : null,
      },
    });
  } catch (error) {
    // Don't let logging errors break the API
    console.error('Failed to write API log:', error);
  }
}

/**
 * Extracts the client IP from proxy headers. Uses the RIGHTMOST X-Forwarded-For
 * entry: a reverse proxy appends the address it sees, so client-supplied
 * entries (which sit to the left and are trivially spoofable) cannot forge it.
 * Without a proxy in front, any header value is client-controlled — run behind
 * a trusted reverse proxy (or accept that IP-based limits are best-effort).
 */
export function extractClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const entries = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
    const rightmost = entries[entries.length - 1];
    if (rightmost) return rightmost;
  }
  return headers.get('x-real-ip') || 'unknown';
}

export function getClientInfo(req: NextRequest) {
  return {
    ip: extractClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

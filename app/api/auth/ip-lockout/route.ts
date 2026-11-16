import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '../../types';
import { extractClientIp } from '../../utils/api-logger';
import { checkIpLockout } from '../../utils/ip-lockout';

/**
 * Read-only lockout status for the login UI.
 *
 * Only GET is allowed: recording/resetting failed attempts is done server-side
 * inside the login routes themselves. Exposing POST/DELETE here would let any
 * unauthenticated caller lock out arbitrary IPs (via a spoofed X-Forwarded-For)
 * or clear the lockout and brute-force PINs without limit.
 */
export async function GET(req: NextRequest) {
  // Get the client IP (rightmost X-Forwarded-For entry, anti-spoofing)
  const ip = extractClientIp(req.headers);

  const { locked, remainingTime } = checkIpLockout(ip);

  return NextResponse.json<ApiResponse<{ locked: boolean; remainingTime: number }>>(
    {
      success: true,
      data: { locked, remainingTime }
    }
  );
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json<ApiResponse<null>>(
    {
      success: false,
      error: 'Method not allowed. Failed attempts are tracked server-side during login.'
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '../../types';
import { invalidateToken, clearRefreshTokenCookie } from '../../utils/auth';

/**
 * Handles logout requests by clearing authentication cookies
 */
export async function POST(req: NextRequest) {
  try {
    // Get the authorization header to invalidate the token
    const authHeader = req.headers.get('Authorization');
    let token: string | undefined;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
      // Add the token to the blacklist
      if (token) {
        invalidateToken(token);
      }
    }
    
    const response = NextResponse.json<ApiResponse<{ success: boolean }>>(
      {
        success: true,
        data: { success: true },
      },
      { status: 200 }
    );

    // Clear the refresh token cookie
    clearRefreshTokenCookie(response);

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: 'Failed to logout',
      },
      { status: 500 }
    );
  }
}

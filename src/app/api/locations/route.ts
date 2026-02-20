import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchLocations } from '@/lib/google';

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('google_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const accountId = request.nextUrl.searchParams.get('accountId');
    if (!accountId) {
        return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    try {
        const data = await fetchLocations(accessToken, accountId);
        return NextResponse.json(data);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number; retryAfter?: number };
        console.error('Locations fetch error:', err.message);

        if (err.statusCode === 429) {
            return NextResponse.json(
                { error: err.message, retryAfter: err.retryAfter || 60 },
                { status: 429 }
            );
        }

        return NextResponse.json(
            { error: err.message || 'Failed to fetch locations' },
            { status: 500 }
        );
    }
}

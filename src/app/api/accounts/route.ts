import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchAccounts } from '@/lib/google';

export async function GET() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('google_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const data = await fetchAccounts(accessToken);
        return NextResponse.json(data);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number; retryAfter?: number };

        if (err.statusCode === 429) {
            return NextResponse.json(
                { error: err.message, retryAfter: err.retryAfter || 120 },
                { status: 429 }
            );
        }

        console.error('Accounts fetch error:', err.message);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch accounts' },
            { status: 500 }
        );
    }
}

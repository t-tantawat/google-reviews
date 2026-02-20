import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google';

export async function GET() {
    try {
        const authUrl = getAuthUrl();
        return NextResponse.redirect(authUrl);
    } catch (error) {
        console.error('Auth error:', error);
        return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
    }
}

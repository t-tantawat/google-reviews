import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCode } from '@/lib/google';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_BASE_URL}?error=${encodeURIComponent(error)}`
        );
    }

    if (!code) {
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_BASE_URL}?error=no_code`
        );
    }

    try {
        const tokens = await getTokensFromCode(code);

        const cookieStore = await cookies();

        // Store tokens in httpOnly cookies
        cookieStore.set('google_access_token', tokens.access_token || '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 3600, // 1 hour
            path: '/',
        });

        if (tokens.refresh_token) {
            cookieStore.set('google_refresh_token', tokens.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
            });
        }

        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}?auth=success`);
    } catch (err) {
        console.error('Token exchange error:', err);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_BASE_URL}?error=token_exchange_failed`
        );
    }
}

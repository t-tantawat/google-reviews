import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();
    cookieStore.delete('google_access_token');
    cookieStore.delete('google_refresh_token');
    return NextResponse.json({ success: true });
}

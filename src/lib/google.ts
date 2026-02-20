import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = [
    'https://www.googleapis.com/auth/business.manage',
];

export function getOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`
    );
}

export function getAuthUrl() {
    const oauth2Client = getOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });
}

export async function getTokensFromCode(code: string) {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

// --- File-based cache (persists across hot-reloads) ---
const CACHE_DIR = path.join(process.cwd(), '.next', 'cache', 'google-api');
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_TTL = 60 * 1000; // 60 seconds lockout (Google quota is per minute)
const LOCKOUT_FILE = path.join(CACHE_DIR, '_rate_limit_lockout.json');

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function getCacheFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(CACHE_DIR, `${safeKey}.json`);
}

function getCached(key: string): unknown | null {
    try {
        const filePath = getCacheFilePath(key);
        if (!fs.existsSync(filePath)) return null;

        const raw = fs.readFileSync(filePath, 'utf-8');
        const entry = JSON.parse(raw);

        if (Date.now() > entry.expiry) {
            fs.unlinkSync(filePath);
            return null;
        }

        console.log(`[Cache HIT] ${key}`);
        return entry.data;
    } catch {
        return null;
    }
}

function setCache(key: string, data: unknown, ttlMs: number = CACHE_TTL) {
    try {
        ensureCacheDir();
        const filePath = getCacheFilePath(key);
        const entry = { data, expiry: Date.now() + ttlMs };
        fs.writeFileSync(filePath, JSON.stringify(entry));
        console.log(`[Cache SET] ${key} (TTL: ${ttlMs / 1000}s)`);
    } catch (err) {
        console.warn('[Cache WRITE ERROR]', err);
    }
}

// --- Rate Limit Lockout ---
// When we get a 429, we lock out ALL Google API calls for LOCKOUT_TTL
// This prevents wasting quota on retries

function isLockedOut(): { locked: boolean; remainingSeconds: number } {
    try {
        if (!fs.existsSync(LOCKOUT_FILE)) return { locked: false, remainingSeconds: 0 };

        const raw = fs.readFileSync(LOCKOUT_FILE, 'utf-8');
        const lockout = JSON.parse(raw);
        const remaining = lockout.expiry - Date.now();

        if (remaining <= 0) {
            fs.unlinkSync(LOCKOUT_FILE);
            return { locked: false, remainingSeconds: 0 };
        }

        return { locked: true, remainingSeconds: Math.ceil(remaining / 1000) };
    } catch {
        return { locked: false, remainingSeconds: 0 };
    }
}

function setLockout() {
    try {
        ensureCacheDir();
        const entry = { expiry: Date.now() + LOCKOUT_TTL, setAt: new Date().toISOString() };
        fs.writeFileSync(LOCKOUT_FILE, JSON.stringify(entry));
        console.warn(`[LOCKOUT] Google API locked out for ${LOCKOUT_TTL / 1000}s`);
    } catch (err) {
        console.warn('[LOCKOUT WRITE ERROR]', err);
    }
}

// Custom error with extra properties
class ApiError extends Error {
    statusCode: number;
    retryAfter: number;

    constructor(message: string, statusCode: number, retryAfter: number) {
        super(message);
        this.statusCode = statusCode;
        this.retryAfter = retryAfter;
    }
}

// --- Guarded fetch: checks lockout BEFORE calling Google ---
async function guardedFetch(url: string, options: RequestInit): Promise<Response> {
    // Check lockout first — don't even call Google if locked
    const lockout = isLockedOut();
    if (lockout.locked) {
        console.warn(`[BLOCKED] API call blocked — lockout active for ${lockout.remainingSeconds}s more`);
        throw new ApiError(
            `Rate limit active. Please wait ${lockout.remainingSeconds} seconds.`,
            429,
            lockout.remainingSeconds
        );
    }

    const res = await fetch(url, options);

    if (res.status === 429) {
        // Set lockout to prevent further calls
        setLockout();

        const retryAfter = Math.ceil(LOCKOUT_TTL / 1000);
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: { message?: string } }).error?.message ||
            `Rate limit exceeded. Please wait ${retryAfter} seconds.`;

        throw new ApiError(msg, 429, retryAfter);
    }

    return res;
}

// --- API functions with caching + lockout protection ---

export async function fetchAccounts(accessToken: string) {
    const cacheKey = 'accounts';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const res = await guardedFetch(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to fetch accounts');
    }

    const data = await res.json();
    setCache(cacheKey, data);
    return data;
}

export async function fetchLocations(accessToken: string, accountId: string) {
    const cacheKey = `locations_${accountId.replace(/\//g, '_')}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const res = await guardedFetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,metadata`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to fetch locations');
    }

    const data = await res.json();
    setCache(cacheKey, data);
    return data;
}

export async function fetchReviews(
    accessToken: string,
    accountId: string,
    locationId: string,
    pageToken?: string
) {
    const cacheKey = `reviews_${accountId.replace(/\//g, '_')}_${locationId.replace(/\//g, '_')}_${pageToken || 'first'}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = new URL(
        `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews`
    );
    if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
    }
    url.searchParams.set('pageSize', '50');

    const res = await guardedFetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to fetch reviews');
    }

    const data = await res.json();
    setCache(cacheKey, data);
    return data;
}

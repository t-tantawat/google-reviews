'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { GoogleAccount, GoogleLocation, GoogleReview } from '@/types';
import ReviewCard from '@/components/ReviewCard';
import StarRating from '@/components/StarRating';

const STAR_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function friendlyError(msg: string): string {
  if (msg.includes('Quota exceeded') || msg.includes('quota') || msg.includes('Rate limit')) {
    return 'เกิน rate limit ของ Google API กรุณารอสักครู่...';
  }
  if (msg.includes('Not authenticated') || msg.includes('401')) {
    return 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่';
  }
  return msg;
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [locations, setLocations] = useState<GoogleLocation[]>([]);
  const [reviews, setReviews] = useState<GoogleReview[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const initRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      // Auto-retry when countdown reaches 0
      if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        setError(null);
        action();
      }
      return;
    }

    if (!countdownRef.current) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [countdown, pendingAction]);

  // Check auth status (with guard against React Strict Mode double-render)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
        if (data.authenticated) {
          loadAccounts();
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Handle 429 quota error — use retryAfter from server (lockout is 120s)
  const handleQuotaError = (retryAfter: number, retryFn: () => void) => {
    const waitSecs = Math.max(retryAfter, 60);
    setCountdown(waitSecs);
    setPendingAction(() => retryFn);
    setError(`เกิน rate limit ของ Google API ระบบจะลองใหม่อัตโนมัติ...`);
  };

  // Load accounts
  const loadAccounts = async () => {
    setLoadingAccounts(true);
    setError(null);
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();

      if (res.status === 429) {
        handleQuotaError(data.retryAfter || 60, loadAccounts);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch accounts');
      }

      setAccounts(data.accounts || []);
    } catch (err) {
      if (!error?.includes('rate limit')) {
        setError(friendlyError(err instanceof Error ? err.message : 'Failed to load accounts'));
      }
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Load locations when account changes
  const loadLocations = useCallback(async (accountId: string) => {
    setLoadingLocations(true);
    setLocations([]);
    setSelectedLocation('');
    setReviews([]);
    setError(null);
    try {
      const res = await fetch(`/api/locations?accountId=${encodeURIComponent(accountId)}`);
      const data = await res.json();

      if (res.status === 429) {
        handleQuotaError(data.retryAfter || 60, () => loadLocations(accountId));
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch locations');
      }

      setLocations(data.locations || []);
    } catch (err) {
      if (!error?.includes('rate limit')) {
        setError(friendlyError(err instanceof Error ? err.message : 'Failed to load locations'));
      }
    } finally {
      setLoadingLocations(false);
    }
  }, [error]);

  // Load reviews when location changes
  const loadReviews = useCallback(async (accountId: string, locationId: string, pageToken?: string) => {
    setLoadingReviews(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        accountId,
        locationId,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`/api/reviews?${params.toString()}`);
      const data = await res.json();

      if (res.status === 429) {
        handleQuotaError(data.retryAfter || 60, () => loadReviews(accountId, locationId, pageToken));
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch reviews');
      }

      if (pageToken) {
        setReviews((prev) => [...prev, ...(data.reviews || [])]);
      } else {
        setReviews(data.reviews || []);
      }
      setAverageRating(data.averageRating || 0);
      setTotalReviews(data.totalReviewCount || 0);
      setNextPageToken(data.nextPageToken || null);
    } catch (err) {
      if (!error?.includes('rate limit')) {
        setError(friendlyError(err instanceof Error ? err.message : 'Failed to load reviews'));
      }
    } finally {
      setLoadingReviews(false);
    }
  }, [error]);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccount(accountId);
    if (accountId) {
      loadLocations(accountId);
    }
  };

  const handleLocationChange = (locationName: string) => {
    setSelectedLocation(locationName);
    if (locationName && selectedAccount) {
      loadReviews(selectedAccount, locationName);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setAccounts([]);
    setLocations([]);
    setReviews([]);
    setSelectedAccount('');
    setSelectedLocation('');
  };

  const ratingDistribution = reviews.reduce((acc, review) => {
    const rating = STAR_MAP[review.starRating] || 0;
    acc[rating] = (acc[rating] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
          <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-b-cyan-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-strong">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gradient">Google Reviews</h1>
              <p className="text-xs text-gray-500">Dashboard</p>
            </div>
          </div>

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-400 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              ออกจากระบบ
            </button>
          )}
        </div>
      </header>

      {!isAuthenticated ? (
        /* Login Screen */
        <div className="flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-6">
          <div className="animate-fade-in-up text-center">
            {/* Decorative element */}
            <div className="relative mx-auto mb-8 h-32 w-32">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 animate-pulse-glow" />
              <div className="absolute inset-2 flex items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-600">
                <svg className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
            </div>

            <h2 className="mb-3 text-4xl font-bold tracking-tight">
              <span className="text-gradient">Google Reviews</span>
              <br />
              <span className="text-white">Dashboard</span>
            </h2>
            <p className="mx-auto mb-8 max-w-md text-gray-400">
              เชื่อมต่อกับ Google Business Profile เพื่อดูและจัดการรีวิวของธุรกิจคุณ
            </p>

            <a
              href="/api/auth/google"
              className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-purple-500/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/30"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              เข้าสู่ระบบด้วย Google
              <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>

            <p className="mt-6 text-xs text-gray-600">
              ต้องการสิทธิ์ Google Business Profile เพื่อเข้าถึงรีวิว
            </p>
          </div>
        </div>
      ) : (
        /* Dashboard */
        <div className="mx-auto max-w-7xl px-6 py-8">
          {/* Error Alert */}
          {error && (
            <div className={`mb-6 animate-fade-in rounded-xl border p-4 ${countdown > 0 ? 'border-amber-500/20 bg-amber-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
              <div className="flex items-center gap-3">
                {countdown > 0 ? (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                    <span className="text-lg font-bold text-amber-400">{countdown}</span>
                  </div>
                ) : (
                  <svg className="h-5 w-5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
                <div className="flex-1">
                  <span className={`text-sm ${countdown > 0 ? 'text-amber-300' : 'text-red-300'}`}>
                    {error}
                  </span>
                  {countdown > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000 ease-linear"
                          style={{ width: `${Math.max(0, (1 - countdown / 60) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-amber-400/60">ระบบจะลองใหม่อัตโนมัติใน {countdown} วินาที</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!countdown && (
                    <button
                      onClick={() => { setError(null); loadAccounts(); }}
                      className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white transition-all hover:bg-white/20"
                    >
                      ลองใหม่
                    </button>
                  )}
                  <button onClick={() => { setError(null); setCountdown(0); setPendingAction(null); }} className={`${countdown > 0 ? 'text-amber-400 hover:text-amber-300' : 'text-red-400 hover:text-red-300'}`}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mb-8 animate-fade-in-up">
            <h2 className="mb-4 text-xl font-bold text-white">เลือกธุรกิจ</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Account Selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  บัญชี Business Profile
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  disabled={loadingAccounts}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white transition-all focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 disabled:opacity-50"
                >
                  <option value="" className="bg-gray-900">
                    {loadingAccounts ? 'กำลังโหลด...' : '-- เลือกบัญชี --'}
                  </option>
                  {accounts.map((account) => (
                    <option key={account.name} value={account.name} className="bg-gray-900">
                      {account.accountName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  สถานที่ / สาขา
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  disabled={!selectedAccount || loadingLocations}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white transition-all focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50"
                >
                  <option value="" className="bg-gray-900">
                    {loadingLocations ? 'กำลังโหลด...' : '-- เลือกสถานที่ --'}
                  </option>
                  {locations.map((location) => (
                    <option key={location.name} value={location.name} className="bg-gray-900">
                      {location.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {reviews.length > 0 && (
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Average Rating */}
              <div className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 hover:border-purple-500/30 hover:bg-white/8">
                <div className="mb-2 text-sm text-gray-400">คะแนนเฉลี่ย</div>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-gradient">{averageRating.toFixed(1)}</span>
                  <span className="mb-1 text-gray-500">/ 5.0</span>
                </div>
                <div className="mt-2">
                  <StarRating rating={Math.round(averageRating)} size="md" />
                </div>
              </div>

              {/* Total Reviews */}
              <div className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/30 hover:bg-white/8">
                <div className="mb-2 text-sm text-gray-400">รีวิวทั้งหมด</div>
                <div className="text-4xl font-bold text-white">{totalReviews}</div>
                <div className="mt-2 text-sm text-gray-500">รีวิว</div>
              </div>

              {/* Positive */}
              <div className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 hover:border-emerald-500/30 hover:bg-white/8">
                <div className="mb-2 text-sm text-gray-400">รีวิวเชิงบวก</div>
                <div className="text-4xl font-bold text-emerald-400">
                  {(ratingDistribution[4] || 0) + (ratingDistribution[5] || 0)}
                </div>
                <div className="mt-2 text-sm text-gray-500">4-5 ดาว</div>
              </div>

              {/* Needs Attention */}
              <div className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all duration-300 hover:border-amber-500/30 hover:bg-white/8">
                <div className="mb-2 text-sm text-gray-400">ต้องดูแล</div>
                <div className="text-4xl font-bold text-amber-400">
                  {(ratingDistribution[1] || 0) + (ratingDistribution[2] || 0) + (ratingDistribution[3] || 0)}
                </div>
                <div className="mt-2 text-sm text-gray-500">1-3 ดาว</div>
              </div>
            </div>
          )}

          {/* Rating Distribution */}
          {reviews.length > 0 && (
            <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-semibold text-white">การกระจายของคะแนน</h3>
              <div className="space-y-3">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingDistribution[star] || 0;
                  const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="w-8 text-right text-sm font-medium text-gray-400">{star} ★</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-3 rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${percentage}%`,
                            background: star >= 4
                              ? 'linear-gradient(90deg, #a855f7, #06b6d4)'
                              : star === 3
                                ? 'linear-gradient(90deg, #f59e0b, #f97316)'
                                : 'linear-gradient(90deg, #ef4444, #f97316)',
                          }}
                        />
                      </div>
                      <span className="w-16 text-right text-sm text-gray-500">
                        {count} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reviews Grid */}
          {loadingReviews && reviews.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="relative mx-auto mb-4 h-12 w-12">
                  <div className="h-12 w-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
                </div>
                <p className="text-gray-400">กำลังโหลดรีวิว...</p>
              </div>
            </div>
          ) : reviews.length > 0 ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  รีวิวทั้งหมด ({reviews.length})
                </h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {reviews.map((review, index) => (
                  <ReviewCard key={review.reviewId} review={review} index={index} />
                ))}
              </div>

              {/* Load More */}
              {nextPageToken && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => loadReviews(selectedAccount, selectedLocation, nextPageToken)}
                    disabled={loadingReviews}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-all hover:border-purple-500/30 hover:bg-purple-500/10 disabled:opacity-50"
                  >
                    {loadingReviews ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                        กำลังโหลด...
                      </>
                    ) : (
                      <>
                        โหลดเพิ่มเติม
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : selectedLocation ? (
            <div className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-400">ไม่พบรีวิว</h3>
              <p className="mt-1 text-sm text-gray-600">สถานที่นี้ยังไม่มีรีวิว</p>
            </div>
          ) : (
            <div className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 animate-float">
                <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-400">เลือกบัญชีและสถานที่</h3>
              <p className="mt-1 text-sm text-gray-600">เลือกบัญชีและสถานที่ด้านบนเพื่อดูรีวิว</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

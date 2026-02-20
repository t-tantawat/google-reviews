'use client';

import { useState } from 'react';
import { GoogleReview } from '@/types';
import StarRating from './StarRating';

interface ReviewCardProps {
    review: GoogleReview;
    index: number;
}

const STAR_MAP: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
};

export default function ReviewCard({ review, index }: ReviewCardProps) {
    const rating = STAR_MAP[review.starRating] || 0;
    const [imgError, setImgError] = useState(false);
    const date = new Date(review.createTime).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <div
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all duration-500 hover:border-white/20 hover:bg-white/10 hover:shadow-2xl hover:shadow-purple-500/10"
            style={{
                animationDelay: `${index * 80}ms`,
                animation: 'fadeInUp 0.6s ease-out forwards',
                opacity: 0,
            }}
        >
            {/* Gradient accent */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        {review.reviewer.profilePhotoUrl && !imgError ? (
                            <img
                                src={review.reviewer.profilePhotoUrl}
                                alt={review.reviewer.displayName}
                                className="h-11 w-11 rounded-full ring-2 ring-purple-400/30"
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 text-lg font-bold text-white">
                                {review.reviewer.displayName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        )}
                        <div>
                            <h3 className="font-semibold text-white">
                                {review.reviewer.displayName || 'Anonymous'}
                            </h3>
                            <p className="text-xs text-gray-400">{date}</p>
                        </div>
                    </div>
                    <StarRating rating={rating} size="sm" />
                </div>

                {/* Comment */}
                {review.comment && (
                    <p className="mt-4 leading-relaxed text-gray-300">
                        {review.comment}
                    </p>
                )}

                {/* Reply */}
                {review.reviewReply && (
                    <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                        <div className="mb-1 flex items-center gap-2">
                            <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            <span className="text-xs font-medium text-cyan-400">Owner Reply</span>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-400">
                            {review.reviewReply.comment}
                        </p>
                    </div>
                )}

                {/* Rating badge */}
                <div className="mt-4 flex items-center justify-between">
                    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${rating >= 4
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : rating >= 3
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                        {rating >= 4 ? 'Positive' : rating >= 3 ? 'Neutral' : 'Needs Attention'}
                    </div>
                </div>
            </div>
        </div>
    );
}

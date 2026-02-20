export interface GoogleAccount {
  name: string;
  accountName: string;
  type: string;
  accountNumber?: string;
}

export interface GoogleLocation {
  name: string;
  title: string;
  storefrontAddress?: {
    addressLines: string[];
    locality: string;
    administrativeArea: string;
    postalCode: string;
    regionCode: string;
  };
  phoneNumbers?: {
    primaryPhone: string;
  };
  websiteUri?: string;
  metadata?: {
    mapsUri: string;
  };
}

export interface GoogleReview {
  reviewId: string;
  reviewer: {
    displayName: string;
    profilePhotoUrl?: string;
    isAnonymous?: boolean;
  };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

export interface ReviewsResponse {
  reviews: GoogleReview[];
  averageRating: number;
  totalReviewCount: number;
  nextPageToken?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

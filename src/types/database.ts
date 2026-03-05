export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'posted' | 'failed' | 'retry';
export type Platform = 'instagram' | 'facebook' | 'bluesky' | 'pinterest' | 'tiktok' | 'youtube' | 'twitter' | 'linkedin';
export type MediaType = 'image' | 'video' | 'carousel';

export interface Brand {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  color: string;
  avatar_url: string | null;
  drive_folder: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialAccount {
  id: string;
  user_id: string;
  platform: Platform;
  platform_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  brand_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  account_id: string;
  platform: Platform;
  caption: string;
  media_type: MediaType;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  pillar_id: string | null;
  hashtag_group_id: string | null;
  error_message: string | null;
  retry_count: number;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  account?: SocialAccount;
  media?: PostMedia[];
  pillar?: ContentPillar;
  hashtag_group?: HashtagGroup;
}

export interface PostMedia {
  id: string;
  post_id: string;
  media_url: string;
  storage_path: string | null;
  media_type: 'image' | 'video';
  sort_order: number;
  width: number | null;
  height: number | null;
  file_size: number | null;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  user_id: string;
  file_name: string;
  storage_path: string;
  url: string;
  media_type: 'image' | 'video';
  file_size: number;
  width: number | null;
  height: number | null;
  folder: string | null;
  created_at: string;
}

export interface ContentPillar {
  id: string;
  user_id: string;
  name: string;
  color: string;
  description: string | null;
  post_frequency: number;
  is_active: boolean;
  created_at: string;
}

export interface HashtagGroup {
  id: string;
  user_id: string;
  name: string;
  hashtags: string[];
  is_active: boolean;
  created_at: string;
}

export interface CaptionTemplate {
  id: string;
  user_id: string;
  name: string;
  template: string;
  variables: string[];
  created_at: string;
}

export interface PostMetrics {
  id: string;
  post_id: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement_rate: number;
  collected_at: string;
}

export interface AccountMetrics {
  id: string;
  account_id: string;
  followers: number;
  following: number;
  posts_count: number;
  engagement_rate: number;
  collected_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

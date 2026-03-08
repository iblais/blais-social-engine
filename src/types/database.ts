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
  first_comment: string | null;
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

// File Organizer
export interface FileSortLog {
  id: string;
  user_id: string;
  file_name: string;
  source_path: string | null;
  dest_path: string;
  brand_slug: string | null;
  track: string | null;
  batch: string | null;
  day_num: number | null;
  created_at: string;
}

// Engagement / DM Automation
export type TriggerType = 'comment_keyword' | 'dm_keyword' | 'story_mention' | 'story_reply';
export type MatchMode = 'exact' | 'contains' | 'starts_with' | 'regex';
export type ConversationStatus = 'active' | 'paused' | 'closed';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface DmRule {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  trigger_type: TriggerType;
  keywords: string[];
  match_mode: MatchMode;
  response_template: string;
  dm_template: string | null;
  ai_enabled: boolean;
  ai_prompt: string | null;
  cooldown_minutes: number;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DmConversation {
  id: string;
  account_id: string;
  ig_user_id: string;
  ig_username: string;
  message_count: number;
  last_message_at: string | null;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  message_text: string;
  rule_id: string | null;
  is_automated: boolean;
  ig_message_id: string | null;
  status: MessageStatus;
  created_at: string;
}

export interface CommentTracking {
  id: string;
  account_id: string;
  post_id: string;
  ig_comment_id: string;
  ig_user_id: string;
  ig_username: string;
  comment_text: string;
  reply_text: string | null;
  rule_id: string | null;
  dm_sent: boolean;
  processed_at: string | null;
  created_at: string;
}

// Autolists
export interface Autolist {
  id: string;
  user_id: string;
  brand_id: string | null;
  name: string;
  description: string | null;
  account_ids: string[];
  schedule_cron: string;
  repeat_interval_days: number;
  is_active: boolean;
  last_posted_at: string | null;
  next_post_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutolistItem {
  id: string;
  autolist_id: string;
  caption: string;
  media_urls: string[];
  sort_order: number;
  times_posted: number;
  last_posted_at: string | null;
  is_active: boolean;
  created_at: string;
}

// SmartLinks
export interface SmartLink {
  id: string;
  user_id: string;
  brand_id: string | null;
  slug: string;
  title: string;
  bio: string | null;
  avatar_url: string | null;
  theme: Record<string, unknown>;
  is_active: boolean;
  total_views: number;
  created_at: string;
  updated_at: string;
}

export interface SmartLinkItem {
  id: string;
  smartlink_id: string;
  type: string;
  title: string;
  url: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  clicks: number;
  created_at: string;
}

// Competitors
export interface Competitor {
  id: string;
  user_id: string;
  brand_id: string | null;
  platform: string;
  username: string;
  platform_user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers: number | null;
  following: number | null;
  post_count: number | null;
  engagement_rate: number | null;
  last_fetched_at: string | null;
  created_at: string;
}

export interface CompetitorSnapshot {
  id: string;
  competitor_id: string;
  followers: number | null;
  following: number | null;
  post_count: number | null;
  engagement_rate: number | null;
  captured_at: string;
}

// Content Curation
export interface ContentFeed {
  id: string;
  user_id: string;
  brand_id: string | null;
  name: string;
  url: string;
  last_fetched_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CuratedContent {
  id: string;
  feed_id: string | null;
  user_id: string;
  brand_id: string | null;
  title: string;
  url: string | null;
  summary: string | null;
  image_url: string | null;
  source: string | null;
  is_saved: boolean;
  is_used: boolean;
  published_at: string | null;
  created_at: string;
}

export interface EngagementStats {
  id: string;
  account_id: string;
  date: string;
  comments_processed: number;
  replies_sent: number;
  dms_sent: number;
  ai_replies: number;
  rules_triggered: number;
  created_at: string;
}

export interface YouTubeAudit {
  id: string;
  account_id: string;
  user_id: string;
  audit_data: Record<string, unknown>;
  score: number | null;
  recommendations: string[];
  best_post_times: Array<{ day: string; hour: number; performance: string }>;
  created_at: string;
}

export interface CompetitorVideo {
  id: string;
  competitor_id: string;
  video_id: string;
  title: string | null;
  published_at: string | null;
  views: number;
  likes: number;
  comments: number;
  duration: string | null;
  tags: string[];
  thumbnail_url: string | null;
  created_at: string;
}

export interface YouTubeKeyword {
  id: string;
  user_id: string;
  keyword: string;
  parent_keyword: string | null;
  search_volume_tier: string | null;
  competition_tier: string | null;
  niche: string | null;
  created_at: string;
}

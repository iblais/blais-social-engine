'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  ThumbsUp,
  Reply,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  Youtube,
  Zap,
  Plus,
  X,
  Sparkles,
  CheckCircle2,
  SkipForward,
  ListChecks,
  AlertTriangle,
  Eye,
  Heart,
  Calendar,
  Video,
  Filter,
  ArrowUpDown,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';

// --- Types ---

interface VideoItem {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

interface CommentReply {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorChannelUrl: string;
  text: string;
  likeCount: number;
  publishedAt: string;
}

interface Comment {
  id: string;
  videoId: string;
  authorName: string;
  authorAvatar: string;
  authorChannelUrl: string;
  text: string;
  textOriginal: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
  totalReplyCount: number;
  replyCount: number;
  replies: CommentReply[];
}

interface CannedResponse {
  id: string;
  label: string;
  text: string;
  category: string;
}

interface BulkReplyItem {
  commentId: string;
  commentText: string;
  authorName: string;
  reply: string;
  status: 'pending' | 'approved' | 'skipped' | 'sent' | 'sending' | 'error';
}

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type FilterType = 'all' | 'unanswered' | 'answered';
type SortType = 'newest' | 'oldest' | 'most-likes';

// --- Component ---

export default function YouTubeCommentsPage() {
  const { accounts } = useBrandAccounts();
  const ytAccounts = useMemo(() => accounts.filter(a => a.platform === 'youtube'), [accounts]);

  // Account & video selection
  const [selectedAccount, setSelectedAccount] = useState('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [videosNextPage, setVideosNextPage] = useState<string | null>(null);
  const [loadingMoreVideos, setLoadingMoreVideos] = useState(false);

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter & sort
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  // Expanded replies
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Canned responses
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [cannedLoading, setCannedLoading] = useState(false);
  const [showCannedForm, setShowCannedForm] = useState(false);
  const [newCannedLabel, setNewCannedLabel] = useState('');
  const [newCannedText, setNewCannedText] = useState('');
  const [newCannedCategory, setNewCannedCategory] = useState('general');
  const [savingCanned, setSavingCanned] = useState(false);

  // AI Reply state
  const [aiReplyLoading, setAiReplyLoading] = useState<Record<string, boolean>>({});

  // Bulk AI Reply state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkReplies, setBulkReplies] = useState<BulkReplyItem[]>([]);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  // API error state
  const [apiNotEnabled, setApiNotEnabled] = useState(false);
  const [apiErrorMessage, setApiErrorMessage] = useState('');

  // Auto-select first account
  useEffect(() => {
    if (ytAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(ytAccounts[0].id);
    }
  }, [ytAccounts, selectedAccount]);

  // Load videos when account changes
  useEffect(() => {
    if (selectedAccount) {
      loadVideos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  // Load canned responses on mount
  useEffect(() => {
    loadCannedResponses();
  }, []);

  // --- Data fetching ---

  async function loadVideos(pageToken?: string) {
    if (!selectedAccount) return;
    if (pageToken) {
      setLoadingMoreVideos(true);
    } else {
      setVideosLoading(true);
      setVideos([]);
      setApiNotEnabled(false);
      setApiErrorMessage('');
    }

    try {
      let url = `/api/youtube/comments?accountId=${selectedAccount}&mode=videos`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.apiNotEnabled) {
        setApiNotEnabled(true);
        setApiErrorMessage(data.error);
        setVideosLoading(false);
        setLoadingMoreVideos(false);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to load videos');

      if (pageToken) {
        setVideos(prev => [...prev, ...(data.videos || [])]);
      } else {
        setVideos(data.videos || []);
      }
      setVideosNextPage(data.nextPageToken || null);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setVideosLoading(false);
    setLoadingMoreVideos(false);
  }

  const loadComments = useCallback(async (videoId: string, pageToken?: string) => {
    if (!selectedAccount) { toast.error('Select a YouTube account'); return; }

    if (pageToken) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setComments([]);
      setNextPageToken(null);
      setApiNotEnabled(false);
      setApiErrorMessage('');
    }

    try {
      let url = `/api/youtube/comments?accountId=${selectedAccount}&videoId=${encodeURIComponent(videoId)}`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.apiNotEnabled) {
        setApiNotEnabled(true);
        setApiErrorMessage(data.error);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to load comments');

      const newComments: Comment[] = data.comments || [];
      if (pageToken) {
        setComments(prev => [...prev, ...newComments]);
      } else {
        setComments(newComments);
      }
      setNextPageToken(data.nextPageToken || null);
      if (!pageToken) toast.success(`Loaded ${newComments.length} comments`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [selectedAccount]);

  async function loadCannedResponses() {
    setCannedLoading(true);
    try {
      const res = await fetch('/api/ai/canned-responses');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load canned responses');
      setCannedResponses(data.responses || []);
    } catch (err) {
      console.error('Failed to load canned responses:', (err as Error).message);
    }
    setCannedLoading(false);
  }

  // --- Actions ---

  async function createCannedResponse() {
    if (!newCannedLabel.trim() || !newCannedText.trim()) {
      toast.error('Label and text are required');
      return;
    }
    setSavingCanned(true);
    try {
      const res = await fetch('/api/ai/canned-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newCannedLabel.trim(),
          text: newCannedText.trim(),
          category: newCannedCategory.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create canned response');
      setCannedResponses(prev => [data.response, ...prev]);
      setNewCannedLabel('');
      setNewCannedText('');
      setNewCannedCategory('general');
      setShowCannedForm(false);
      toast.success('Quick reply created');
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSavingCanned(false);
  }

  async function deleteCannedResponse(id: string) {
    try {
      const res = await fetch('/api/ai/canned-responses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      setCannedResponses(prev => prev.filter(r => r.id !== id));
      toast.success('Quick reply deleted');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function submitReply(commentId: string) {
    if (!replyText.trim()) { toast.error('Enter a reply'); return; }
    setReplyLoading(true);
    try {
      const res = await fetch('/api/youtube/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount,
          parentId: commentId,
          text: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post reply');
      toast.success('Reply posted');
      setReplyText('');
      setReplyingTo(null);
      // Reload comments for current video
      if (selectedVideoId) loadComments(selectedVideoId);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setReplyLoading(false);
  }

  async function deleteComment(commentId: string) {
    try {
      const res = await fetch('/api/youtube/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount,
          commentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete comment');
      setComments(prev => prev.filter(c => c.id !== commentId));
      setDeletingId(null);
      toast.success('Comment deleted');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function toggleReplies(commentId: string) {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }

  function useCannedReply(text: string) {
    setReplyText(text);
    toast.success('Quick reply loaded');
  }

  async function generateAIReply(comment: Comment) {
    setAiReplyLoading(prev => ({ ...prev, [comment.id]: true }));
    try {
      const selectedAcc = ytAccounts.find(a => a.id === selectedAccount);
      const selectedVideo = videos.find(v => v.id === (selectedVideoId || comment.videoId));
      const res = await fetch('/api/ai/youtube-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentText: comment.text,
          videoTitle: selectedVideo?.title || undefined,
          channelName: selectedAcc?.display_name || selectedAcc?.username || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate AI reply');
      setReplyingTo(comment.id);
      setReplyText(data.reply);
      toast.success('AI reply generated - edit before sending');
    } catch (err) {
      toast.error((err as Error).message);
    }
    setAiReplyLoading(prev => ({ ...prev, [comment.id]: false }));
  }

  async function startBulkAIReply() {
    const unreplied = filteredComments.filter(c => c.totalReplyCount === 0);
    if (unreplied.length === 0) {
      toast.error('No unreplied comments found');
      return;
    }

    setBulkMode(true);
    setBulkGenerating(true);
    const items: BulkReplyItem[] = unreplied.map(c => ({
      commentId: c.id,
      commentText: c.text,
      authorName: c.authorName,
      reply: '',
      status: 'pending' as const,
    }));
    setBulkReplies(items);

    const selectedAcc = ytAccounts.find(a => a.id === selectedAccount);
    const channelName = selectedAcc?.display_name || selectedAcc?.username || '';
    const selectedVideo = videos.find(v => v.id === selectedVideoId);

    for (let i = 0; i < items.length; i++) {
      try {
        const res = await fetch('/api/ai/youtube-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commentText: items[i].commentText,
            videoTitle: selectedVideo?.title || undefined,
            channelName: channelName || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        items[i].reply = data.reply;
        items[i].status = 'approved';
      } catch {
        items[i].reply = '';
        items[i].status = 'error';
      }
      setBulkReplies([...items]);
    }
    setBulkGenerating(false);
    toast.success(`Generated ${items.filter(i => i.status === 'approved').length} AI replies`);
  }

  function updateBulkReply(commentId: string, newText: string) {
    setBulkReplies(prev => prev.map(r =>
      r.commentId === commentId ? { ...r, reply: newText } : r
    ));
  }

  function toggleBulkApproval(commentId: string) {
    setBulkReplies(prev => prev.map(r => {
      if (r.commentId !== commentId) return r;
      if (r.status === 'approved') return { ...r, status: 'skipped' as const };
      if (r.status === 'skipped') return { ...r, status: 'approved' as const };
      return r;
    }));
  }

  async function sendAllApprovedReplies() {
    const approved = bulkReplies.filter(r => r.status === 'approved' && r.reply.trim());
    if (approved.length === 0) {
      toast.error('No approved replies to send');
      return;
    }

    setBulkSending(true);
    let sent = 0;
    const updated = [...bulkReplies];

    for (const item of approved) {
      const idx = updated.findIndex(r => r.commentId === item.commentId);
      updated[idx] = { ...updated[idx], status: 'sending' };
      setBulkReplies([...updated]);

      try {
        const res = await fetch('/api/youtube/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: selectedAccount,
            parentId: item.commentId,
            text: item.reply.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        updated[idx] = { ...updated[idx], status: 'sent' };
        sent++;
      } catch {
        updated[idx] = { ...updated[idx], status: 'error' };
      }
      setBulkReplies([...updated]);
    }

    setBulkSending(false);
    toast.success(`Sent ${sent}/${approved.length} replies`);
    if (sent > 0 && selectedVideoId) loadComments(selectedVideoId);
  }

  // --- Derived state ---

  const cannedByCategory = useMemo(() => {
    const groups: Record<string, CannedResponse[]> = {};
    for (const cr of cannedResponses) {
      const cat = cr.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cr);
    }
    return groups;
  }, [cannedResponses]);

  // Filter and sort comments
  const filteredComments = useMemo(() => {
    let result = [...comments];

    // Filter
    if (filter === 'unanswered') {
      result = result.filter(c => c.totalReplyCount === 0);
    } else if (filter === 'answered') {
      result = result.filter(c => c.totalReplyCount > 0);
    }

    // Sort
    if (sort === 'newest') {
      result.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    } else if (sort === 'oldest') {
      result.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    } else if (sort === 'most-likes') {
      result.sort((a, b) => b.likeCount - a.likeCount);
    }

    return result;
  }, [comments, filter, sort]);

  const unansweredCount = useMemo(() => comments.filter(c => c.totalReplyCount === 0).length, [comments]);
  const answeredCount = useMemo(() => comments.filter(c => c.totalReplyCount > 0).length, [comments]);

  // --- Handlers ---

  function handleVideoSelect(videoId: string) {
    setSelectedVideoId(videoId);
    setComments([]);
    setNextPageToken(null);
    if (videoId === 'all') {
      loadComments('all');
    } else if (videoId) {
      loadComments(videoId);
    }
  }

  function handleAccountChange(accountId: string) {
    setSelectedAccount(accountId);
    setSelectedVideoId('');
    setComments([]);
    setVideos([]);
    setNextPageToken(null);
    setApiNotEnabled(false);
    setApiErrorMessage('');
  }

  // --- Render ---

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/youtube" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to YouTube Studio
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <MessageCircle className="h-7 w-7 text-red-500" />
            Comment Manager
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage comments across your YouTube videos</p>
        </div>
      </div>

      {/* API Not Enabled Error */}
      {apiNotEnabled && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <AlertTriangle className="h-8 w-8 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <h3 className="font-semibold text-lg text-amber-800 dark:text-amber-200">YouTube Data API Not Enabled</h3>
                <div className="text-sm text-amber-700 dark:text-amber-300 space-y-2">
                  <p>The YouTube Data API v3 is not enabled for your Google Cloud project. Follow these steps to fix it:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Go to the <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=1059424724065" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100 inline-flex items-center gap-1">Google Cloud Console <ExternalLink className="h-3 w-3" /></a></li>
                    <li>Make sure you have project <code className="bg-amber-200/50 dark:bg-amber-800/50 px-1.5 py-0.5 rounded text-xs font-mono">1059424724065</code> selected</li>
                    <li>Click <strong>&quot;Enable&quot;</strong></li>
                    <li>Wait a few minutes for the change to propagate</li>
                  </ol>
                  <p className="mt-2">If the issue persists after enabling, try reconnecting your YouTube account in <Link href="/settings/accounts" className="underline font-medium">Settings &gt; Accounts</Link>.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  onClick={() => {
                    setApiNotEnabled(false);
                    setApiErrorMessage('');
                    loadVideos();
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-2 sm:w-72">
              <Label>YouTube Account</Label>
              <Select value={selectedAccount} onValueChange={handleAccountChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {ytAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <div className="flex items-center gap-2">
                        <Youtube className="h-3.5 w-3.5 text-red-500" />
                        {acc.display_name || acc.username}
                      </div>
                    </SelectItem>
                  ))}
                  {ytAccounts.length === 0 && (
                    <SelectItem value="none" disabled>No YouTube accounts connected</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedAccount && !apiNotEnabled && (
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadVideos()}
                  disabled={videosLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${videosLoading ? 'animate-spin' : ''}`} />
                  Refresh Videos
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Videos List */}
      {!apiNotEnabled && selectedAccount && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Video className="h-5 w-5 text-red-500" />
              Your Videos
              {videos.length > 0 && (
                <Badge variant="secondary" className="ml-2">{videos.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {videosLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading videos...
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Video className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No videos found. Upload a video to YouTube first.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Load All Comments button */}
                <Button
                  variant={selectedVideoId === 'all' ? 'default' : 'outline'}
                  className="w-full justify-start h-auto py-3"
                  onClick={() => handleVideoSelect('all')}
                  disabled={loading}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-12 w-20 rounded bg-muted flex items-center justify-center shrink-0">
                      <MessageCircle className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-medium">Load All Comments</p>
                      <p className="text-xs text-muted-foreground">Load comments from all your videos</p>
                    </div>
                    {loading && selectedVideoId === 'all' && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                  </div>
                </Button>

                {/* Individual video buttons */}
                <div className="grid gap-2">
                  {videos.map(video => (
                    <button
                      key={video.id}
                      className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent/50 ${
                        selectedVideoId === video.id ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20' : 'border-border'
                      }`}
                      onClick={() => handleVideoSelect(video.id)}
                      disabled={loading}
                    >
                      <div className="flex items-center gap-3">
                        {video.thumbnail ? (
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="h-12 w-20 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-20 rounded bg-muted flex items-center justify-center shrink-0">
                            <Video className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{video.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(video.publishedAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {formatNumber(video.viewCount)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {formatNumber(video.likeCount)}
                            </span>
                            <span className="flex items-center gap-1 font-medium text-foreground">
                              <MessageCircle className="h-3 w-3" />
                              {formatNumber(video.commentCount)}
                            </span>
                          </div>
                        </div>
                        {loading && selectedVideoId === video.id && (
                          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-red-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Load more videos */}
                {videosNextPage && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadVideos(videosNextPage)}
                      disabled={loadingMoreVideos}
                    >
                      {loadingMoreVideos ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                      Load More Videos
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Replies */}
      {!apiNotEnabled && comments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Quick Replies
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCannedForm(!showCannedForm)}
              >
                {showCannedForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {showCannedForm ? 'Cancel' : 'New'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showCannedForm && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cannedLabel">Label</Label>
                    <Input
                      id="cannedLabel"
                      placeholder="e.g. Thank you"
                      value={newCannedLabel}
                      onChange={(e) => setNewCannedLabel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cannedCategory">Category</Label>
                    <Input
                      id="cannedCategory"
                      placeholder="e.g. general, promo, support"
                      value={newCannedCategory}
                      onChange={(e) => setNewCannedCategory(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cannedText">Response Text</Label>
                  <Textarea
                    id="cannedText"
                    placeholder="The reply text that will be inserted..."
                    value={newCannedText}
                    onChange={(e) => setNewCannedText(e.target.value)}
                    rows={2}
                  />
                </div>
                <Button size="sm" onClick={createCannedResponse} disabled={savingCanned}>
                  {savingCanned ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Save Quick Reply
                </Button>
              </div>
            )}

            {cannedLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading quick replies...
              </div>
            ) : cannedResponses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quick replies yet. Create one to speed up your responses.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(cannedByCategory).map(([category, responses]) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{category}</p>
                    <div className="flex flex-wrap gap-2">
                      {responses.map(cr => (
                        <div key={cr.id} className="group relative">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              if (replyingTo) {
                                useCannedReply(cr.text);
                              } else {
                                toast.info('Click "Reply" on a comment first, then select a quick reply');
                              }
                            }}
                            title={cr.text}
                          >
                            <Zap className="h-3 w-3 mr-1 text-yellow-500" />
                            {cr.label}
                          </Button>
                          <button
                            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                            onClick={(e) => { e.stopPropagation(); deleteCannedResponse(cr.id); }}
                            title="Delete quick reply"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bulk AI Reply Panel */}
      {bulkMode && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-violet-500" />
                Bulk AI Replies
                {bulkGenerating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
              <div className="flex items-center gap-2">
                {!bulkGenerating && bulkReplies.some(r => r.status === 'approved' || r.status === 'skipped') && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBulkReplies(prev => prev.map(r =>
                        (r.status === 'approved' || r.status === 'skipped') && r.reply.trim()
                          ? { ...r, status: 'approved' as const }
                          : r
                      ))}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBulkReplies(prev => prev.map(r =>
                        r.status === 'approved' || r.status === 'skipped'
                          ? { ...r, status: 'skipped' as const }
                          : r
                      ))}
                    >
                      <SkipForward className="h-4 w-4 mr-1" />
                      Skip All
                    </Button>
                    <Button
                      size="sm"
                      onClick={sendAllApprovedReplies}
                      disabled={bulkSending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {bulkSending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                      Send All Approved ({bulkReplies.filter(r => r.status === 'approved').length})
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => { setBulkMode(false); setBulkReplies([]); }}>
                  <X className="h-4 w-4 mr-1" /> Close
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {bulkReplies.map(item => (
              <div
                key={item.commentId}
                className={`border rounded-lg p-3 space-y-2 ${
                  item.status === 'sent' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                  item.status === 'skipped' ? 'bg-muted/50 opacity-60' :
                  item.status === 'error' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' :
                  item.status === 'sending' ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{item.authorName}</p>
                    <p className="text-sm truncate">{item.commentText}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.status === 'sent' && <Badge variant="outline" className="text-green-600 border-green-300">Sent</Badge>}
                    {item.status === 'sending' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {item.status === 'error' && <Badge variant="destructive">Error</Badge>}
                    {item.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {(item.status === 'approved' || item.status === 'skipped') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleBulkApproval(item.commentId)}
                        title={item.status === 'approved' ? 'Skip this reply' : 'Approve this reply'}
                      >
                        {item.status === 'approved' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <SkipForward className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {item.reply && item.status !== 'sent' && (
                  <Textarea
                    value={item.reply}
                    onChange={(e) => updateBulkReply(item.commentId, e.target.value)}
                    rows={2}
                    className="text-sm"
                    disabled={item.status === 'sending'}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Comments Section */}
      {!apiNotEnabled && comments.length > 0 && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="w-auto">
                    <TabsList className="h-8">
                      <TabsTrigger value="all" className="text-xs px-3 h-7">
                        All ({comments.length})
                      </TabsTrigger>
                      <TabsTrigger value="unanswered" className="text-xs px-3 h-7">
                        Unanswered ({unansweredCount})
                      </TabsTrigger>
                      <TabsTrigger value="answered" className="text-xs px-3 h-7">
                        Answered ({answeredCount})
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <Select value={sort} onValueChange={(v) => setSort(v as SortType)}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="most-likes">Most Likes</SelectItem>
                    </SelectContent>
                  </Select>

                  {filteredComments.some(c => c.totalReplyCount === 0) && !bulkMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startBulkAIReply}
                      disabled={bulkGenerating}
                      className="text-violet-600 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/20 h-8 text-xs"
                    >
                      {bulkGenerating ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                      )}
                      Bulk AI Reply ({filteredComments.filter(c => c.totalReplyCount === 0).length})
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comment count */}
          <p className="text-sm text-muted-foreground">
            Showing {filteredComments.length} of {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </p>

          {/* Comments */}
          {filteredComments.map(comment => (
            <Card key={comment.id} className="overflow-hidden">
              <CardContent className="pt-4 pb-4 space-y-3">
                {/* Comment header */}
                <div className="flex items-start gap-3">
                  {comment.authorAvatar ? (
                    <img
                      src={comment.authorAvatar}
                      alt={comment.authorName}
                      className="h-10 w-10 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shrink-0 text-white text-sm font-bold">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{comment.authorName}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(comment.publishedAt)}</span>
                      {comment.totalReplyCount === 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600">
                          Needs Reply
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1.5 whitespace-pre-wrap leading-relaxed">{comment.text}</p>
                  </div>
                </div>

                {/* Comment actions */}
                <div className="flex items-center gap-2 ml-13 pl-13 border-t pt-3" style={{ marginLeft: '52px' }}>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
                    <ThumbsUp className="h-3 w-3" /> {comment.likeCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setReplyingTo(replyingTo === comment.id ? null : comment.id);
                      setReplyText('');
                    }}
                  >
                    <Reply className="h-3.5 w-3.5 mr-1" /> Reply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-violet-600 hover:text-violet-700"
                    onClick={() => generateAIReply(comment)}
                    disabled={aiReplyLoading[comment.id]}
                  >
                    {aiReplyLoading[comment.id] ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                    )}
                    AI Reply
                  </Button>
                  {comment.totalReplyCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleReplies(comment.id)}
                    >
                      {expandedComments.has(comment.id) ? (
                        <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Hide {comment.totalReplyCount} {comment.totalReplyCount === 1 ? 'reply' : 'replies'}</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5 mr-1" /> {comment.totalReplyCount} {comment.totalReplyCount === 1 ? 'reply' : 'replies'}</>
                      )}
                    </Button>
                  )}
                  <div className="flex-1" />
                  {deletingId === comment.id ? (
                    <div className="flex items-center gap-1">
                      <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => deleteComment(comment.id)}>
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeletingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDeletingId(comment.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* Reply input */}
                {replyingTo === comment.id && (
                  <div className="space-y-2" style={{ marginLeft: '52px' }}>
                    {cannedResponses.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {cannedResponses.map(cr => (
                          <Button
                            key={cr.id}
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2"
                            onClick={() => useCannedReply(cr.text)}
                            title={cr.text}
                          >
                            <Zap className="h-2.5 w-2.5 mr-0.5 text-yellow-500" />
                            {cr.label}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <Textarea
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={2}
                        className="flex-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => submitReply(comment.id)}
                        disabled={replyLoading || !replyText.trim()}
                      >
                        {replyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Expanded replies */}
                {expandedComments.has(comment.id) && comment.replies && comment.replies.length > 0 && (
                  <div className="space-y-3 border-l-2 border-red-200 dark:border-red-800 pl-4" style={{ marginLeft: '52px' }}>
                    {comment.replies.map(reply => (
                      <div key={reply.id} className="flex items-start gap-3">
                        {reply.authorAvatar ? (
                          <img
                            src={reply.authorAvatar}
                            alt={reply.authorName}
                            className="h-7 w-7 rounded-full shrink-0"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center shrink-0 text-white text-[10px] font-bold">
                            {reply.authorName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs">{reply.authorName}</span>
                            <span className="text-xs text-muted-foreground">{timeAgo(reply.publishedAt)}</span>
                          </div>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap">{reply.text}</p>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <ThumbsUp className="h-3 w-3" /> {reply.likeCount}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Load More */}
          {nextPageToken && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => selectedVideoId && loadComments(selectedVideoId, nextPageToken)}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                Load More Comments
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-red-500" />
            <p className="text-muted-foreground">Loading comments...</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !apiNotEnabled && comments.length === 0 && selectedVideoId && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-muted-foreground">No comments found for this video.</p>
          </CardContent>
        </Card>
      )}

      {/* No account selected */}
      {!selectedAccount && !apiNotEnabled && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Youtube className="h-12 w-12 mx-auto mb-3 opacity-20 text-red-500" />
            <p className="text-muted-foreground">Connect a YouTube account in <Link href="/settings/accounts" className="underline">Settings</Link> to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

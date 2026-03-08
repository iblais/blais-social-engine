'use client';

import { useState, useMemo, useCallback } from 'react';
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
import { toast } from 'sonner';
import {
  Loader2,
  MessageCircle,
  ThumbsUp,
  Reply,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  Youtube,
} from 'lucide-react';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { createClient } from '@/lib/supabase/client';

interface Comment {
  id: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  replyCount: number;
  replies?: Comment[];
}

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

function extractVideoId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export default function YouTubeCommentsPage() {
  const { accounts } = useBrandAccounts();
  const supabase = useMemo(() => createClient(), []);
  const ytAccounts = useMemo(() => accounts.filter(a => a.platform === 'youtube'), [accounts]);

  const [selectedAccount, setSelectedAccount] = useState('');
  const [videoInput, setVideoInput] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  // Expanded replies
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadComments = useCallback(async (pageToken?: string) => {
    if (!selectedAccount) { toast.error('Select a YouTube account'); return; }
    if (!videoInput.trim()) { toast.error('Enter a video ID or URL'); return; }
    const videoId = extractVideoId(videoInput);

    if (pageToken) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setComments([]);
      setNextPageToken(null);
    }

    try {
      let url = `/api/youtube/comments?accountId=${selectedAccount}&videoId=${encodeURIComponent(videoId)}`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const res = await fetch(url);
      const data = await res.json();
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
  }, [selectedAccount, videoInput]);

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
      // Refresh to show new reply
      loadComments();
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

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageCircle className="h-8 w-8 text-red-500" />
          Comment Manager
        </h1>
        <p className="text-muted-foreground mt-1">View, reply to, and manage YouTube comments</p>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>YouTube Account</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
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
                    <SelectItem value="none" disabled>No YouTube accounts</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="videoInput">Video ID or URL</Label>
              <Input
                id="videoInput"
                placeholder="https://youtube.com/watch?v=... or video ID"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => loadComments()} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                Load Comments
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comments List */}
      {comments.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{comments.length} comment{comments.length !== 1 ? 's' : ''} loaded</p>
          {comments.map(comment => (
            <Card key={comment.id}>
              <CardContent className="pt-4 space-y-3">
                {/* Comment header */}
                <div className="flex items-start gap-3">
                  {comment.authorAvatar ? (
                    <img
                      src={comment.authorAvatar}
                      alt={comment.authorName}
                      className="h-8 w-8 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{comment.authorName}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(comment.publishedAt)}</span>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{comment.text}</p>
                  </div>
                </div>

                {/* Comment actions */}
                <div className="flex items-center gap-3 ml-11">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ThumbsUp className="h-3.5 w-3.5" /> {comment.likeCount}
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
                  {comment.replyCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleReplies(comment.id)}
                    >
                      {expandedComments.has(comment.id) ? (
                        <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Hide replies</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5 mr-1" /> {comment.replyCount} replies</>
                      )}
                    </Button>
                  )}
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
                  <div className="ml-11 flex items-start gap-2">
                    <Textarea
                      placeholder="Write a reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => submitReply(comment.id)}
                      disabled={replyLoading}
                    >
                      {replyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                )}

                {/* Expanded replies */}
                {expandedComments.has(comment.id) && comment.replies && comment.replies.length > 0 && (
                  <div className="ml-11 space-y-3 border-l-2 border-muted pl-4">
                    {comment.replies.map(reply => (
                      <div key={reply.id} className="flex items-start gap-3">
                        {reply.authorAvatar ? (
                          <img
                            src={reply.authorAvatar}
                            alt={reply.authorName}
                            className="h-6 w-6 rounded-full shrink-0"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold">
                            {reply.authorName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs">{reply.authorName}</span>
                            <span className="text-xs text-muted-foreground">{timeAgo(reply.publishedAt)}</span>
                          </div>
                          <p className="text-sm mt-0.5">{reply.text}</p>
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
                onClick={() => loadComments(nextPageToken)}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                Load More
              </Button>
            </div>
          )}
        </div>
      )}

      {!loading && comments.length === 0 && videoInput && selectedAccount && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No comments loaded. Click &quot;Load Comments&quot; to fetch.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

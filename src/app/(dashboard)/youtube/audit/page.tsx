'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import {
  ArrowLeft,
  Loader2,
  Youtube,
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface VideoData {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  tags: string[];
  description: string;
  thumbnail: string;
}

interface AuditScores {
  upload_consistency: number;
  title_optimization: number;
  description_seo: number;
  tag_usage: number;
  engagement_rate: number;
  overall_score: number;
}

interface AuditResult {
  audit: {
    channel: {
      title: string;
      description: string;
      subscriberCount: number;
      videoCount: number;
      viewCount: number;
      customUrl: string;
      thumbnail: string;
    };
    videos: VideoData[];
  };
  ai: {
    scores: AuditScores;
    best_post_times: Array<{ day: string; hour: number; performance: string }>;
    recommendations: string[];
  } | null;
}

function ScoreRing({ score, label, size = 'md' }: { score: number; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  const sizes = { sm: 60, md: 80, lg: 120 };
  const s = sizes[size];
  const r = (s - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const fontSize = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: s, height: s }}>
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="-rotate-90">
          <circle cx={s/2} cy={s/2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted-foreground/20" />
          <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center ${fontSize} font-bold`} style={{ color }}>{score}</span>
      </div>
      <span className="text-xs text-muted-foreground capitalize">{label.replaceAll('_', ' ')}</span>
    </div>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function HeatMap({ times }: { times: Array<{ day: string; hour: number; performance: string }> }) {
  const heatData: Record<string, string> = {};
  times.forEach(t => { heatData[`${t.day}-${t.hour}`] = t.performance; });

  const perfColor: Record<string, string> = {
    high: 'bg-green-500',
    medium: 'bg-yellow-500',
    low: 'bg-gray-300 dark:bg-gray-700',
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-1" style={{ gridTemplateColumns: `60px repeat(24, 20px)` }}>
        <div />
        {HOURS.map(h => (
          <div key={h} className="text-[10px] text-center text-muted-foreground">{h}</div>
        ))}
        {DAYS.map(day => (
          <Fragment key={day}>
            <div className="text-xs text-right pr-2 leading-5">{day}</div>
            {HOURS.map(h => {
              const key = `${day}-${h}`;
              const fullDay = Object.keys(heatData).find(k => k.toLowerCase().startsWith(day.toLowerCase()));
              const perf = heatData[key] || (fullDay ? 'low' : '');
              return (
                <div
                  key={`${day}-${h}`}
                  className={`w-5 h-5 rounded-sm ${perf ? perfColor[perf] || 'bg-muted' : 'bg-muted'}`}
                  title={perf ? `${day} ${h}:00 — ${perf}` : ''}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function YouTubeAuditPage() {
  const { accounts } = useBrandAccounts();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const ytAccounts = useMemo(() => accounts.filter(a => a.platform === 'youtube'), [accounts]);

  useEffect(() => {
    if (ytAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(ytAccounts[0].id);
    }
  }, [ytAccounts]);

  async function runAudit() {
    if (!selectedAccount) { toast.error('Select a YouTube account'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/channel-audit?accountId=${selectedAccount}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      toast.success('Audit complete');
    } catch (err) {
      toast.error((err as Error).message);
    }
    setLoading(false);
  }

  const scores = result?.ai?.scores;
  const channel = result?.audit?.channel;
  const videos = result?.audit?.videos || [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Link href="/youtube" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
        <ArrowLeft className="h-4 w-4" /> Back to YouTube Studio
      </Link>
      <div className="flex items-center gap-3">
        <Youtube className="h-8 w-8 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold">Channel Audit</h1>
          <p className="text-muted-foreground">AI-powered YouTube channel analysis</p>
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-2 min-w-[200px]">
          <label className="text-sm font-medium">YouTube Account</label>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {ytAccounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.display_name || a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={runAudit} disabled={loading || !selectedAccount} className="bg-red-600 hover:bg-red-700">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
          Run Audit
        </Button>
      </div>

      {channel && (
        <>
          {/* Channel Overview */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                {channel.thumbnail && <img src={channel.thumbnail} alt="thumbnail" className="w-16 h-16 rounded-full" />}
                <div>
                  <h2 className="text-xl font-bold">{channel.title}</h2>
                  <p className="text-sm text-muted-foreground">{channel.customUrl}</p>
                </div>
                <div className="ml-auto flex gap-6 text-center">
                  <div>
                    <p className="text-2xl font-bold">{channel.subscriberCount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Subscribers</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{channel.viewCount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Views</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{channel.videoCount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Videos</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Score Cards */}
          {scores && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Channel Scores</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap justify-center gap-8">
                  <ScoreRing score={scores.overall_score} label="Overall" size="lg" />
                  <ScoreRing score={scores.upload_consistency} label="Consistency" />
                  <ScoreRing score={scores.title_optimization} label="Titles" />
                  <ScoreRing score={scores.description_seo} label="SEO" />
                  <ScoreRing score={scores.tag_usage} label="Tags" />
                  <ScoreRing score={scores.engagement_rate} label="Engagement" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Best Post Times */}
          {result?.ai?.best_post_times && result.ai.best_post_times.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Best Times to Post</CardTitle></CardHeader>
              <CardContent>
                <HeatMap times={result.ai.best_post_times} />
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {result?.ai?.recommendations && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Recommendations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.ai.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <Badge variant="outline" className="mt-0.5 shrink-0">{i + 1}</Badge>
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Video Scorecard */}
          {videos.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Videos ({videos.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {videos.map((v) => (
                    <div key={v.id} className="border rounded-lg">
                      <button
                        onClick={() => setExpandedVideo(expandedVideo === v.id ? null : v.id)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        {expandedVideo === v.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        {v.thumbnail && <img src={v.thumbnail} alt="thumbnail" className="w-24 h-14 object-cover rounded shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{v.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(v.publishedAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-4 text-center shrink-0">
                          <div><p className="text-sm font-medium">{v.views.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">views</p></div>
                          <div><p className="text-sm font-medium">{v.likes.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">likes</p></div>
                          <div><p className="text-sm font-medium">{v.comments.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">comments</p></div>
                        </div>
                      </button>
                      {expandedVideo === v.id && (
                        <div className="px-3 pb-3 border-t pt-3 space-y-2">
                          <p className="text-sm text-muted-foreground">{v.description}</p>
                          {v.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {v.tags.slice(0, 15).map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          )}
                          <a
                            href={`https://youtube.com/watch?v=${v.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                          >
                            View on YouTube <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

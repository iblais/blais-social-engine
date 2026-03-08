'use client';

import { useState, useMemo } from 'react';
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
import {
  ArrowLeft,
  Loader2,
  Users,
  Eye,
  Video,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Sparkles,
  Youtube,
} from 'lucide-react';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { createClient } from '@/lib/supabase/client';

interface ChannelStats {
  subscribers: number;
  totalViews: number;
  videoCount: number;
}

interface GrowthMetrics {
  subsPerWeek: number;
  viewsPerWeek: number;
  growthPercent: number;
}

interface DataPoint {
  date: string;
  subscribers: number;
  views: number;
}

interface AIPrediction {
  predictedSubGrowth: number;
  predictedViewGrowth: number;
  confidence: string;
  summary: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function GrowthArrow({ value }: { value: number }) {
  if (value > 0) return <ArrowUp className="h-4 w-4 text-green-500" />;
  if (value < 0) return <ArrowDown className="h-4 w-4 text-red-500" />;
  return null;
}

function MiniChart({ data, dataKey, color }: { data: DataPoint[]; dataKey: 'subscribers' | 'views'; color: string }) {
  if (data.length < 2) return null;

  const values = data.map(d => d[dataKey]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 400;
  const height = 120;
  const padding = 10;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((d[dataKey] - min) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  // Area fill
  const firstX = padding;
  const lastX = padding + chartWidth;
  const areaPoints = `${firstX},${height - padding} ${points} ${lastX},${height - padding}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <polygon points={areaPoints} fill={color} opacity="0.1" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Start and end labels */}
      <text x={padding} y={height - 2} fontSize="10" fill="currentColor" className="text-muted-foreground">
        {data[0].date}
      </text>
      <text x={width - padding} y={height - 2} fontSize="10" fill="currentColor" textAnchor="end" className="text-muted-foreground">
        {data[data.length - 1].date}
      </text>
    </svg>
  );
}

export default function YouTubeGrowthPage() {
  const { accounts } = useBrandAccounts();
  const supabase = useMemo(() => createClient(), []);
  const ytAccounts = useMemo(() => accounts.filter(a => a.platform === 'youtube'), [accounts]);

  const [selectedAccount, setSelectedAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [growth, setGrowth] = useState<GrowthMetrics | null>(null);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [prediction, setPrediction] = useState<AIPrediction | null>(null);

  async function loadGrowthData() {
    if (!selectedAccount) { toast.error('Select a YouTube account'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/growth?accountId=${encodeURIComponent(selectedAccount)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load growth data');

      setStats(data.stats || null);
      setGrowth(data.growth || null);
      setHistory(data.history || []);
      setPrediction(data.prediction || null);
      toast.success('Growth data loaded');
    } catch (err) {
      toast.error((err as Error).message);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6 p-6">
      <Link href="/youtube" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
        <ArrowLeft className="h-4 w-4" /> Back to YouTube Studio
      </Link>
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="h-8 w-8 text-red-500" />
          Channel Growth
        </h1>
        <p className="text-muted-foreground mt-1">Track subscriber growth, views, and AI-predicted trends</p>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">YouTube Account</label>
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
            <Button onClick={loadGrowthData} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              Load Growth Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Subscribers</p>
                  <p className="text-3xl font-bold">{formatNumber(stats.subscribers)}</p>
                </div>
                <Users className="h-10 w-10 text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Views</p>
                  <p className="text-3xl font-bold">{formatNumber(stats.totalViews)}</p>
                </div>
                <Eye className="h-10 w-10 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Videos</p>
                  <p className="text-3xl font-bold">{formatNumber(stats.videoCount)}</p>
                </div>
                <Video className="h-10 w-10 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Growth Metrics */}
      {growth && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Subs / Week</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold">{growth.subsPerWeek >= 0 ? '+' : ''}{formatNumber(growth.subsPerWeek)}</p>
                <GrowthArrow value={growth.subsPerWeek} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Views / Week</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold">{growth.viewsPerWeek >= 0 ? '+' : ''}{formatNumber(growth.viewsPerWeek)}</p>
                <GrowthArrow value={growth.viewsPerWeek} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Growth %</p>
              <div className="flex items-center gap-2 mt-1">
                <p className={`text-2xl font-bold ${growth.growthPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {growth.growthPercent >= 0 ? '+' : ''}{growth.growthPercent.toFixed(1)}%
                </p>
                <GrowthArrow value={growth.growthPercent} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Historical Charts */}
      {history.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-red-500" />
                Subscriber Trend (90 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MiniChart data={history} dataKey="subscribers" color="#ef4444" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                View Trend (90 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MiniChart data={history} dataKey="views" color="#3b82f6" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Prediction */}
      {prediction && (
        <Card className="border-purple-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Growth Prediction (Next 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Predicted Sub Growth</p>
                <p className="text-xl font-bold text-green-500">
                  +{formatNumber(prediction.predictedSubGrowth)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Predicted View Growth</p>
                <p className="text-xl font-bold text-blue-500">
                  +{formatNumber(prediction.predictedViewGrowth)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confidence</p>
                <Badge
                  className={
                    prediction.confidence === 'high'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : prediction.confidence === 'medium'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }
                >
                  {prediction.confidence}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{prediction.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !stats && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Select a YouTube account and load growth data to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

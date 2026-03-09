'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Factory,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Search,
  FileText,
  Video,
  Settings2,
  Activity,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Rocket,
  Eye,
  Pencil,
  Save,
  Globe,
  Hash,
  Calendar,
  AlertTriangle,
  Terminal,
  CircleDot,
  Flame,
  Target,
  Star,
  ExternalLink,
  Radio,
  Gauge,
  Clapperboard,
  Workflow,
  CircleCheck,
  CircleX,
  CirclePause,
  Boxes,
  Wrench,
  Mic,
  Scissors,
  Upload,
  TrendingUp,
  Layers,
  Power,
  PowerOff,
  SquarePlay,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface PipelineChannel {
  id: string;
  name: string;
  slug: string;
  niche: string;
  youtube_account_id: string | null;
  brand_id: string | null;
  posting_frequency: string;
  target_length: string;
  tone: string;
  shorts_enabled: boolean;
  brand_colors: string[];
  tags_default: string[];
  sources: Record<string, unknown>;
  is_active: boolean;
  brands?: { name: string; color: string; avatar_url: string | null };
  social_accounts?: { username: string; display_name: string | null };
}

interface PipelineRun {
  id: string;
  channel_id: string;
  status: string;
  current_stage: string;
  topic_title: string | null;
  topic_url: string | null;
  error: string | null;
  output_path: string | null;
  config: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  pipeline_channels?: { name: string; slug: string };
}

interface ScoutedTopic {
  id: string;
  channel_id: string;
  run_id: string | null;
  title: string;
  url: string | null;
  source: string;
  summary: string;
  virality_score: number;
  relevance_score: number;
  novelty_score: number;
  total_score: number;
  reasoning: string;
  status: string;
  research_brief: Record<string, unknown> | null;
  script: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  scouted_at: string;
}

interface PipelineLog {
  id: string;
  run_id: string;
  stage: string;
  level: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const STAGES = [
  { key: 'scout', label: 'Scout', icon: Search, desc: 'Find trending topics from RSS, Reddit, HN, GitHub, X, Product Hunt', color: '#F59E0B' },
  { key: 'research', label: 'Research', icon: Globe, desc: 'Deep-dive analysis — fetch docs, READMEs, repo structure', color: '#3B82F6' },
  { key: 'script', label: 'Script', icon: FileText, desc: 'AI writes hook, context, demo steps, verdict, CTA', color: '#10B981' },
  { key: 'demo', label: 'Demo', icon: Terminal, desc: 'Docker sandbox CLI + Playwright browser recording', color: '#06B6D4' },
  { key: 'avatar', label: 'Avatar', icon: Mic, desc: 'HeyGen AI narrator — intro + verdict clips', color: '#EC4899' },
  { key: 'editor', label: 'Editor', icon: Scissors, desc: 'FFmpeg assembly — concat, captions, music, thumbnail', color: '#8B5CF6' },
  { key: 'publisher', label: 'Publish', icon: Upload, desc: 'Upload to Supabase Storage, create draft post', color: '#EF4444' },
] as const;

const SOURCE_ICONS: Record<string, string> = {
  rss: '📡', reddit: '🔴', github: '🐙', hackernews: '🟠', producthunt: '🚀', twitter: '𝕏',
};

// ============================================================
// HELPERS
// ============================================================

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-zinc-400', running: 'bg-cyan-400 animate-pulse', completed: 'bg-emerald-400',
    failed: 'bg-red-400', approved: 'bg-emerald-400', rejected: 'bg-red-400', processing: 'bg-amber-400 animate-pulse',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] || colors.pending}`} />;
}

function StatusLabel({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
      <StatusDot status={status} />
      {status}
    </span>
  );
}

function ScoreRing({ score, size = 48, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, score));
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-zinc-800" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-black" style={{ color }}>{score}</span>
      {label && <span className="text-[9px] text-zinc-500 mt-0.5 uppercase tracking-widest">{label}</span>}
    </div>
  );
}

// ============================================================
// STAGE PROGRESS BAR
// ============================================================

function StageProgressBar({ currentStage, status }: { currentStage: string; status: string }) {
  const currentIdx = STAGES.findIndex(s => s.key === currentStage);
  return (
    <div className="flex items-center w-full gap-0.5">
      {STAGES.map((stage, i) => {
        const isDone = status === 'completed' || i < currentIdx;
        const isCurrent = i === currentIdx && status === 'running';
        const isFailed = i === currentIdx && status === 'failed';
        const Icon = stage.icon;
        return (
          <div key={stage.key} className="flex items-center flex-1 gap-0.5">
            <div className="relative group">
              <div
                className={`h-7 w-7 rounded-md flex items-center justify-center text-xs transition-all ${
                  isDone ? 'text-white' :
                  isCurrent ? 'text-white ring-1 ring-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.3)]' :
                  isFailed ? 'bg-red-500/20 text-red-400' :
                  'bg-zinc-800 text-zinc-600'
                }`}
                style={isDone ? { background: stage.color } : isCurrent ? { background: stage.color } : undefined}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-[10px] text-zinc-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {stage.label}: {stage.desc}
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 rounded ${isDone ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Full stage breakdown card
function StageBreakdown() {
  return (
    <div className="grid grid-cols-7 gap-1">
      {STAGES.map((stage) => {
        const Icon = stage.icon;
        return (
          <div key={stage.key} className="text-center group">
            <div
              className="mx-auto h-11 w-11 rounded-lg flex items-center justify-center mb-2 transition-all group-hover:scale-110 group-hover:shadow-lg"
              style={{ background: `${stage.color}20`, color: stage.color, boxShadow: `0 0 0 1px ${stage.color}30` }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-[11px] font-bold text-zinc-300">{stage.label}</p>
            <p className="text-[9px] text-zinc-600 leading-tight mt-0.5 hidden md:block">{stage.desc.split(' — ')[0]}</p>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// TYPES
// ============================================================

type TabType = 'command-center' | 'topics' | 'scripts' | 'preview' | 'channels';

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PipelineWorkshopPage() {
  const [activeTab, setActiveTab] = useState<TabType>('command-center');
  const [channels, setChannels] = useState<PipelineChannel[]>([]);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [topics, setTopics] = useState<ScoutedTopic[]>([]);
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editScript, setEditScript] = useState('');
  const [savingScript, setSavingScript] = useState(false);
  const [topicStatus, setTopicStatus] = useState<string>('all');
  const [editingChannel, setEditingChannel] = useState<PipelineChannel | null>(null);
  const [savingChannel, setSavingChannel] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // ============================================================
  // DATA LOADING
  // ============================================================

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/channels');
      const data = await res.json();
      if (res.ok) setChannels(data.channels || []);
    } catch { /* ignore */ }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      let url = '/api/pipeline/runs?limit=50';
      if (selectedChannel !== 'all') url += `&channelId=${selectedChannel}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) setRuns(data.runs || []);
    } catch { /* ignore */ }
  }, [selectedChannel]);

  const loadTopics = useCallback(async () => {
    try {
      let url = '/api/pipeline/topics?';
      if (selectedChannel !== 'all') url += `channelId=${selectedChannel}&`;
      if (topicStatus !== 'all') url += `status=${topicStatus}&`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) setTopics(data.topics || []);
    } catch { /* ignore */ }
  }, [selectedChannel, topicStatus]);

  const loadLogs = useCallback(async (runId: string) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/pipeline/logs?runId=${runId}`);
      const data = await res.json();
      if (res.ok) setLogs(data.logs || []);
    } catch { /* ignore */ }
    setLogsLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadChannels(), loadRuns(), loadTopics()]);
      setLoading(false);
    }
    init();
  }, [loadChannels, loadRuns, loadTopics]);

  useEffect(() => { loadRuns(); loadTopics(); }, [selectedChannel, loadRuns, loadTopics]);

  // ============================================================
  // ACTIONS
  // ============================================================

  async function triggerRun(channelId: string) {
    setTriggerLoading(channelId);
    try {
      const res = await fetch('/api/pipeline/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger');
      toast.success('Pipeline run queued');
      loadRuns();
    } catch (err) { toast.error((err as Error).message); }
    setTriggerLoading(null);
  }

  async function updateTopicStatus(topicId: string, status: string) {
    try {
      const res = await fetch('/api/pipeline/topics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: topicId, status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, status } : t));
      toast.success(`Topic ${status}`);
    } catch (err) { toast.error((err as Error).message); }
  }

  async function saveScript(topicId: string) {
    setSavingScript(true);
    try {
      const scriptObj = JSON.parse(editScript);
      const res = await fetch('/api/pipeline/topics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: topicId, script: scriptObj }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, script: scriptObj } : t));
      setEditingTopicId(null);
      toast.success('Script saved');
    } catch (err) { toast.error((err as Error).message); }
    setSavingScript(false);
  }

  async function saveChannel(channel: PipelineChannel) {
    setSavingChannel(true);
    try {
      const res = await fetch('/api/pipeline/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: channel.id, name: channel.name, niche: channel.niche,
          posting_frequency: channel.posting_frequency, target_length: channel.target_length,
          tone: channel.tone, shorts_enabled: channel.shorts_enabled,
          tags_default: channel.tags_default, is_active: channel.is_active,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      loadChannels();
      setEditingChannel(null);
      toast.success('Channel updated');
    } catch (err) { toast.error((err as Error).message); }
    setSavingChannel(false);
  }

  // ============================================================
  // DERIVED
  // ============================================================

  const filteredRuns = useMemo(() => {
    if (selectedChannel === 'all') return runs;
    return runs.filter(r => r.channel_id === selectedChannel);
  }, [runs, selectedChannel]);

  const runningCount = runs.filter(r => r.status === 'running').length;
  const completedCount = runs.filter(r => r.status === 'completed').length;
  const failedCount = runs.filter(r => r.status === 'failed').length;
  const pendingTopics = topics.filter(t => t.status === 'pending').length;
  const approvedTopics = topics.filter(t => t.status === 'approved').length;
  const activeChannels = channels.filter(c => c.is_active).length;

  // System health
  const systemChecks = useMemo(() => [
    { label: 'Pipeline Channels', ok: channels.length > 0, detail: `${channels.length} configured` },
    { label: 'Active Channels', ok: activeChannels > 0, detail: `${activeChannels} active` },
    { label: 'Gemini AI', ok: true, detail: 'Connected' },
    { label: 'Supabase', ok: true, detail: 'Connected' },
    { label: 'HeyGen Avatar', ok: false, detail: 'Key needed' },
    { label: 'AssemblyAI', ok: false, detail: 'Key needed' },
  ], [channels.length, activeChannels]);

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Factory className="h-16 w-16 text-cyan-500 mx-auto" />
          <div className="h-1 w-48 mx-auto bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-zinc-500 text-sm font-mono">Initializing workshop...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-[1400px] mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/20 flex items-center justify-center">
            <Factory className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Production Workshop</h1>
            <p className="text-sm text-zinc-500">Automated faceless content pipeline</p>
          </div>
        </div>

        {/* Live stats */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
            <Radio className={`h-3 w-3 ${runningCount > 0 ? 'text-cyan-400 animate-pulse' : 'text-zinc-600'}`} />
            <span className="text-xs font-mono text-zinc-400">{runningCount} running</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
            <CircleCheck className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-mono text-zinc-400">{completedCount} done</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
            <CirclePause className="h-3 w-3 text-amber-400" />
            <span className="text-xs font-mono text-zinc-400">{pendingTopics} pending</span>
          </div>
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-1.5">
              <CircleX className="h-3 w-3 text-red-400" />
              <span className="text-xs font-mono text-red-400">{failedCount} failed</span>
            </div>
          )}
        </div>
      </div>

      {/* ===== TABS + FILTER ===== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          <TabsList className="bg-zinc-900 border border-zinc-800 h-9">
            <TabsTrigger value="command-center" className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400 px-3">
              <Gauge className="h-3.5 w-3.5" /> Command Center
            </TabsTrigger>
            <TabsTrigger value="topics" className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400 px-3">
              <Search className="h-3.5 w-3.5" /> Topic Feed
              {pendingTopics > 0 && (
                <span className="ml-1 h-4 min-w-4 px-1 rounded-full bg-amber-500 text-zinc-900 text-[10px] font-bold flex items-center justify-center">{pendingTopics}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="scripts" className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400 px-3">
              <FileText className="h-3.5 w-3.5" /> Scripts
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400 px-3">
              <Clapperboard className="h-3.5 w-3.5" /> Drafts
            </TabsTrigger>
            <TabsTrigger value="channels" className="gap-1.5 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-cyan-400 px-3">
              <Settings2 className="h-3.5 w-3.5" /> Channels
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Select value={selectedChannel} onValueChange={setSelectedChannel}>
            <SelectTrigger className="w-44 h-8 text-xs bg-zinc-900 border-zinc-800">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channels.map(ch => (
                <SelectItem key={ch.id} value={ch.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: ch.brand_colors?.[0] || '#06b6d4' }} />
                    {ch.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-zinc-800" onClick={() => { loadRuns(); loadTopics(); loadChannels(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* COMMAND CENTER TAB                                                     */}
      {/* ===================================================================== */}
      {activeTab === 'command-center' && (
        <div className="space-y-5">

          {/* Pipeline Stage Breakdown */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <Workflow className="h-4 w-4 text-cyan-500" /> Pipeline Stages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StageBreakdown />
            </CardContent>
          </Card>

          {/* System Health + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* System Health */}
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-cyan-500" /> System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {systemChecks.map(check => (
                  <div key={check.label} className="flex items-center justify-between py-1.5 border-b border-zinc-900 last:border-0">
                    <span className="text-xs text-zinc-400">{check.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-600">{check.detail}</span>
                      {check.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Channel Launch Pads */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {channels.map(ch => {
                const chRuns = runs.filter(r => r.channel_id === ch.id);
                const lastRun = chRuns[0];
                const isRunning = chRuns.some(r => r.status === 'running');
                const accentColor = ch.brand_colors?.[0] || '#06b6d4';
                return (
                  <Card key={ch.id} className="bg-zinc-950 border-zinc-800 overflow-hidden relative group">
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accentColor }} />
                    <CardContent className="pt-4 pb-3 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black text-white"
                            style={{ background: `linear-gradient(135deg, ${accentColor}, ${ch.brand_colors?.[1] || '#0a0a0a'})` }}>
                            {ch.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-zinc-200">{ch.name}</h3>
                            <p className="text-[10px] text-zinc-600">{ch.posting_frequency} &middot; {ch.target_length}</p>
                          </div>
                        </div>
                        {ch.is_active ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400"><Power className="h-3 w-3" /> ON</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-zinc-600"><PowerOff className="h-3 w-3" /> OFF</span>
                        )}
                      </div>

                      {lastRun && (
                        <div className="space-y-2">
                          <StageProgressBar currentStage={lastRun.current_stage} status={lastRun.status} />
                          <div className="flex items-center justify-between text-[10px]">
                            <StatusLabel status={lastRun.status} />
                            <span className="text-zinc-600">{timeAgo(lastRun.started_at)}</span>
                          </div>
                          {lastRun.topic_title && (
                            <p className="text-[11px] text-zinc-500 truncate">{lastRun.topic_title}</p>
                          )}
                        </div>
                      )}

                      <Button
                        size="sm"
                        className="w-full h-7 text-[11px] font-bold tracking-wide bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                        onClick={() => triggerRun(ch.id)}
                        disabled={!!triggerLoading || isRunning || !ch.is_active}
                      >
                        {triggerLoading === ch.id ? (
                          <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Queuing...</>
                        ) : isRunning ? (
                          <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Running...</>
                        ) : (
                          <><Play className="h-3 w-3 mr-1.5" style={{ color: accentColor }} /> Launch Pipeline</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Run History */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-500" /> Run Log
                  <span className="text-zinc-700">({filteredRuns.length})</span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {filteredRuns.length === 0 ? (
                <div className="text-center py-12">
                  <Rocket className="h-10 w-10 mx-auto mb-3 text-zinc-800" />
                  <p className="text-sm text-zinc-600">No runs yet. Launch a pipeline to get started.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredRuns.map(run => (
                    <div key={run.id}>
                      <button
                        className={`w-full text-left rounded-lg p-3 transition-all hover:bg-zinc-900 ${selectedRunId === run.id ? 'bg-zinc-900 ring-1 ring-zinc-700' : ''}`}
                        onClick={() => { setSelectedRunId(selectedRunId === run.id ? null : run.id); if (selectedRunId !== run.id) loadLogs(run.id); }}
                      >
                        <div className="flex items-center gap-3">
                          <StatusDot status={run.status} />
                          <span className="text-xs font-semibold text-zinc-300 w-28 truncate">{run.pipeline_channels?.name || '—'}</span>
                          <div className="flex-1 hidden sm:block"><StageProgressBar currentStage={run.current_stage} status={run.status} /></div>
                          <span className="text-[10px] text-zinc-600 w-20 text-right">{timeAgo(run.started_at)}</span>
                          {run.completed_at && (
                            <span className="text-[10px] text-zinc-700 w-12 text-right">
                              {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 60000)}m
                            </span>
                          )}
                          {selectedRunId === run.id ? <ChevronUp className="h-3.5 w-3.5 text-zinc-600" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-700" />}
                        </div>
                        {run.topic_title && (
                          <p className="text-[11px] text-zinc-600 mt-1 ml-5 truncate">{run.topic_title}</p>
                        )}
                      </button>

                      {selectedRunId === run.id && (
                        <div className="ml-5 mr-2 mb-2 border-l-2 border-zinc-800 pl-4 space-y-2">
                          {run.error && (
                            <div className="flex items-start gap-2 p-2 rounded bg-red-950/30 border border-red-900/30 text-xs text-red-400">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span className="font-mono break-all">{run.error}</span>
                            </div>
                          )}
                          {logsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-zinc-600 py-3 justify-center">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
                            </div>
                          ) : logs.length === 0 ? (
                            <p className="text-[11px] text-zinc-700 py-3 text-center">No logs recorded.</p>
                          ) : (
                            <div className="max-h-48 overflow-y-auto space-y-px font-mono text-[11px]">
                              {logs.map(log => (
                                <div key={log.id} className={`flex items-start gap-2 px-2 py-1 rounded ${
                                  log.level === 'error' ? 'text-red-400 bg-red-950/20' :
                                  log.level === 'warn' ? 'text-amber-400' : 'text-zinc-500'
                                }`}>
                                  <span className="text-zinc-700 shrink-0 w-14 text-[10px]">
                                    {new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false })}
                                  </span>
                                  <span className="text-cyan-700 shrink-0 w-16 truncate">[{log.stage}]</span>
                                  <span className="break-all">{log.message}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TOPICS TAB                                                            */}
      {/* ===================================================================== */}
      {activeTab === 'topics' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <Tabs value={topicStatus} onValueChange={setTopicStatus}>
              <TabsList className="bg-zinc-900 border border-zinc-800 h-8">
                <TabsTrigger value="all" className="text-xs h-7 px-3 data-[state=active]:bg-zinc-800">All ({topics.length})</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs h-7 px-3 data-[state=active]:bg-zinc-800">
                  Pending ({topics.filter(t => t.status === 'pending').length})
                </TabsTrigger>
                <TabsTrigger value="approved" className="text-xs h-7 px-3 data-[state=active]:bg-zinc-800">
                  Approved ({topics.filter(t => t.status === 'approved').length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs h-7 px-3 data-[state=active]:bg-zinc-800">
                  Rejected ({topics.filter(t => t.status === 'rejected').length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7 border-zinc-700 text-emerald-400 hover:bg-emerald-950/30"
                onClick={() => { topics.filter(t => t.status === 'pending' && t.total_score >= 70).forEach(t => updateTopicStatus(t.id, 'approved')); }}
                disabled={topics.filter(t => t.status === 'pending' && t.total_score >= 70).length === 0}>
                <Zap className="h-3 w-3 mr-1" /> Auto-Approve 70+
              </Button>
            </div>
          </div>

          {topics.length === 0 ? (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardContent className="pt-6 text-center py-16">
                <Search className="h-14 w-14 mx-auto mb-4 text-zinc-800" />
                <p className="text-zinc-500 font-semibold">No topics scouted yet</p>
                <p className="text-xs text-zinc-600 mt-1">Run the pipeline to scout from RSS, Reddit, HN, GitHub, X, and Product Hunt.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {topics.map(topic => {
                const isExpanded = expandedTopics.has(topic.id);
                const ch = channels.find(c => c.id === topic.channel_id);
                return (
                  <Card key={topic.id} className={`bg-zinc-950 border-zinc-800 overflow-hidden transition-all ${
                    topic.status === 'rejected' ? 'opacity-40' : ''
                  }`}>
                    <CardContent className="pt-3 pb-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <ScoreRing score={topic.total_score} size={44} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm text-zinc-200">{topic.title}</h3>
                            <StatusLabel status={topic.status} />
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-600 flex-wrap">
                            <span>{SOURCE_ICONS[topic.source] || '📰'} {topic.source}</span>
                            {ch && (
                              <span className="flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ch.brand_colors?.[0] }} />
                                {ch.name}
                              </span>
                            )}
                            <span>{timeAgo(topic.scouted_at)}</span>
                            {topic.url && (
                              <a href={topic.url} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          {topic.summary && <p className="text-[11px] text-zinc-600 mt-1.5 line-clamp-2">{topic.summary}</p>}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {topic.status === 'pending' && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-400 hover:bg-emerald-950/30"
                                onClick={() => updateTopicStatus(topic.id, 'approved')} title="Approve">
                                <ThumbsUp className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:bg-red-950/30"
                                onClick={() => updateTopicStatus(topic.id, 'rejected')} title="Reject">
                                <ThumbsDown className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-600"
                            onClick={() => { setExpandedTopics(prev => { const n = new Set(prev); if (n.has(topic.id)) n.delete(topic.id); else n.add(topic.id); return n; }); }}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Score bars */}
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Virality', score: topic.virality_score, icon: Flame, color: '#F59E0B' },
                          { label: 'Relevance', score: topic.relevance_score, icon: Target, color: '#3B82F6' },
                          { label: 'Novelty', score: topic.novelty_score, icon: Star, color: '#10B981' },
                        ].map(s => (
                          <div key={s.label} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] uppercase tracking-widest text-zinc-600 flex items-center gap-1">
                                <s.icon className="h-2.5 w-2.5" style={{ color: s.color }} /> {s.label}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">{s.score}</span>
                            </div>
                            <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, background: s.color }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {isExpanded && (
                        <div className="space-y-3 pt-2 border-t border-zinc-800">
                          {topic.reasoning && (
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">AI Reasoning</p>
                              <p className="text-xs text-zinc-500 bg-zinc-900 rounded-lg p-3 border border-zinc-800">{topic.reasoning}</p>
                            </div>
                          )}
                          {topic.research_brief && (() => {
                            const brief = topic.research_brief as Record<string, string>;
                            return (
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Research Brief</p>
                                <div className="text-xs text-zinc-500 bg-zinc-900 rounded-lg p-3 border border-zinc-800 space-y-1">
                                  {brief.whatItIs && <p><strong className="text-zinc-400">What:</strong> {brief.whatItIs}</p>}
                                  {brief.whyItMatters && <p><strong className="text-zinc-400">Why:</strong> {brief.whyItMatters}</p>}
                                  {brief.wowMoment && <p><strong className="text-zinc-400">Wow:</strong> {brief.wowMoment}</p>}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SCRIPTS TAB                                                           */}
      {/* ===================================================================== */}
      {activeTab === 'scripts' && (
        <div className="space-y-3">
          {topics.filter(t => t.script || t.status === 'approved').length === 0 ? (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardContent className="pt-6 text-center py-16">
                <FileText className="h-14 w-14 mx-auto mb-4 text-zinc-800" />
                <p className="text-zinc-500 font-semibold">No scripts yet</p>
                <p className="text-xs text-zinc-600 mt-1">Approve topics and run the script stage to generate scripts.</p>
              </CardContent>
            </Card>
          ) : (
            topics.filter(t => t.script || t.status === 'approved').map(topic => {
              const isEditing = editingTopicId === topic.id;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const script = topic.script as Record<string, any> | null;
              return (
                <Card key={topic.id} className="bg-zinc-950 border-zinc-800">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-cyan-500" />
                        <div>
                          <h3 className="font-semibold text-sm text-zinc-200">{topic.title}</h3>
                          <p className="text-[10px] text-zinc-600">{topic.source} &middot; {timeAgo(topic.scouted_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusLabel status={topic.status} />
                        {!isEditing && script && (
                          <Button variant="outline" size="sm" className="text-xs h-7 border-zinc-700"
                            onClick={() => { setEditingTopicId(topic.id); setEditScript(JSON.stringify(script, null, 2)); }}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                        )}
                      </div>
                    </div>

                    {script && !isEditing && (
                      <div className="space-y-3 bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        {script.title && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1">Title</p>
                            <p className="font-bold text-zinc-200">{script.title}</p>
                          </div>
                        )}
                        {script.hook && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1 flex items-center gap-1">
                              <Zap className="h-3 w-3 text-amber-400" /> Hook (0:00-0:15)
                            </p>
                            <p className="text-sm text-zinc-300">{script.hook}</p>
                          </div>
                        )}
                        {script.context && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1">Context (0:15-0:45)</p>
                            <p className="text-sm text-zinc-400">{script.context}</p>
                          </div>
                        )}
                        {script.demoSteps && Array.isArray(script.demoSteps) && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-2 flex items-center gap-1">
                              <Terminal className="h-3 w-3 text-emerald-400" /> Demo ({script.demoSteps.length} steps)
                            </p>
                            <div className="space-y-1">
                              {script.demoSteps.map((step: { instruction?: string; action?: string; type?: string }, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-xs bg-zinc-950 rounded p-2 border border-zinc-800">
                                  <span className="h-5 w-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0">{i + 1}</span>
                                  <div className="min-w-0">
                                    <p className="text-zinc-300">{step.instruction || ''}</p>
                                    {step.action && <p className="text-zinc-600 font-mono text-[11px] mt-0.5 truncate">{step.action}</p>}
                                  </div>
                                  {step.type && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-zinc-700 text-zinc-500 shrink-0">{step.type}</Badge>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {script.verdict && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1">Verdict</p>
                            <p className="text-sm text-zinc-300">{script.verdict}</p>
                          </div>
                        )}
                        {script.cta && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1">CTA</p>
                            <p className="text-sm text-cyan-400">{script.cta}</p>
                          </div>
                        )}
                        {script.estimatedDuration && (
                          <p className="text-[10px] text-zinc-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> ~{Math.round(Number(script.estimatedDuration) / 60)} min
                          </p>
                        )}
                      </div>
                    )}

                    {isEditing && (
                      <div className="space-y-3">
                        <Textarea value={editScript} onChange={(e) => setEditScript(e.target.value)} rows={20}
                          className="font-mono text-xs bg-zinc-900 border-zinc-800" />
                        <div className="flex items-center gap-2 justify-end">
                          <Button variant="outline" size="sm" className="h-7 border-zinc-700" onClick={() => setEditingTopicId(null)}>Cancel</Button>
                          <Button size="sm" className="h-7" onClick={() => saveScript(topic.id)} disabled={savingScript}>
                            {savingScript ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    )}

                    {!script && (
                      <div className="text-center py-8 bg-zinc-900 rounded-xl border border-zinc-800">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-zinc-800" />
                        <p className="text-[11px] text-zinc-600">No script generated. Run the script stage after approving this topic.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* DRAFTS/PREVIEW TAB                                                    */}
      {/* ===================================================================== */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          {filteredRuns.filter(r => r.status === 'completed').length === 0 ? (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardContent className="pt-6 text-center py-16">
                <Clapperboard className="h-14 w-14 mx-auto mb-4 text-zinc-800" />
                <p className="text-zinc-500 font-semibold">No video drafts yet</p>
                <p className="text-xs text-zinc-600 mt-1">Complete a full pipeline run to see assembled video drafts here.</p>
                <p className="text-xs text-zinc-700 mt-3">Drafts appear in your <span className="text-cyan-500">Compose</span> queue as &quot;draft&quot; posts for final review before publishing.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredRuns.filter(r => r.status === 'completed').map(run => {
                const ch = channels.find(c => c.id === run.channel_id);
                const accentColor = ch?.brand_colors?.[0] || '#06b6d4';
                return (
                  <Card key={run.id} className="bg-zinc-950 border-zinc-800 overflow-hidden group">
                    <div className="aspect-video bg-zinc-900 relative flex items-center justify-center">
                      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accentColor}10, transparent)` }} />
                      <div className="text-center space-y-2 z-10">
                        <SquarePlay className="h-12 w-12 text-zinc-700 mx-auto group-hover:text-zinc-500 transition-colors" />
                      </div>
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-950/80 px-2 py-0.5 rounded">{run.pipeline_channels?.name}</span>
                        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-950/80 px-2 py-0.5 rounded">{formatDate(run.completed_at || run.started_at)}</span>
                      </div>
                    </div>
                    <CardContent className="pt-3 pb-3">
                      <h3 className="font-semibold text-sm text-zinc-300 truncate">{run.topic_title || 'Untitled Draft'}</h3>
                      <div className="mt-2">
                        <StageProgressBar currentStage="publisher" status="completed" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* CHANNELS/SETTINGS TAB                                                 */}
      {/* ===================================================================== */}
      {activeTab === 'channels' && (
        <div className="space-y-4">
          {channels.map(ch => {
            const isEditing = editingChannel?.id === ch.id;
            const editCh = isEditing ? editingChannel! : ch;
            const accentColor = ch.brand_colors?.[0] || '#06b6d4';
            return (
              <Card key={ch.id} className="bg-zinc-950 border-zinc-800 overflow-hidden">
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
                <CardContent className="pt-5 pb-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black text-white"
                        style={{ background: `linear-gradient(135deg, ${accentColor}, ${ch.brand_colors?.[1] || '#0a0a0a'})` }}>
                        {ch.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-200">{ch.name}</h3>
                        <p className="text-xs text-zinc-600 font-mono">/{ch.slug}</p>
                      </div>
                    </div>
                    {!isEditing ? (
                      <Button variant="outline" size="sm" className="h-7 text-xs border-zinc-700" onClick={() => setEditingChannel({ ...ch })}>
                        <Pencil className="h-3 w-3 mr-1" /> Configure
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs border-zinc-700" onClick={() => setEditingChannel(null)}>Cancel</Button>
                        <Button size="sm" className="h-7 text-xs" onClick={() => saveChannel(editCh)} disabled={savingChannel}>
                          {savingChannel ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                          Save
                        </Button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="grid gap-4 md:grid-cols-2 bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Channel Name</Label>
                        <Input value={editCh.name} onChange={(e) => setEditingChannel({ ...editCh, name: e.target.value })}
                          className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Niche</Label>
                        <Input value={editCh.niche} onChange={(e) => setEditingChannel({ ...editCh, niche: e.target.value })}
                          className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Posting Frequency</Label>
                        <Select value={editCh.posting_frequency} onValueChange={(v) => setEditingChannel({ ...editCh, posting_frequency: v })}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="3x/week">3x/week</SelectItem>
                            <SelectItem value="2x/week">2x/week</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Target Length</Label>
                        <Select value={editCh.target_length} onValueChange={(v) => setEditingChannel({ ...editCh, target_length: v })}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1-3 minutes">1-3 min</SelectItem>
                            <SelectItem value="3-5 minutes">3-5 min</SelectItem>
                            <SelectItem value="5-8 minutes">5-8 min</SelectItem>
                            <SelectItem value="8-12 minutes">8-12 min</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Tone / Style</Label>
                        <Textarea value={editCh.tone} onChange={(e) => setEditingChannel({ ...editCh, tone: e.target.value })}
                          rows={2} className="bg-zinc-950 border-zinc-800 text-sm" placeholder="e.g. enthusiastic but honest" />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Default Tags</Label>
                        <Input value={editCh.tags_default?.join(', ') || ''}
                          onChange={(e) => setEditingChannel({ ...editCh, tags_default: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                          className="bg-zinc-950 border-zinc-800 h-8 text-sm" placeholder="AI, tutorial, tools" />
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input type="checkbox" checked={editCh.shorts_enabled}
                            onChange={(e) => setEditingChannel({ ...editCh, shorts_enabled: e.target.checked })} className="rounded bg-zinc-800 border-zinc-700" />
                          Shorts enabled
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input type="checkbox" checked={editCh.is_active}
                            onChange={(e) => setEditingChannel({ ...editCh, is_active: e.target.checked })} className="rounded bg-zinc-800 border-zinc-700" />
                          Active
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {[
                        { label: 'Niche', value: ch.niche || '—' },
                        { label: 'Frequency', value: ch.posting_frequency },
                        { label: 'Length', value: ch.target_length },
                        { label: 'Tone', value: ch.tone || '—' },
                        { label: 'Status', value: ch.is_active ? 'Active' : 'Paused' },
                      ].map(item => (
                        <div key={item.label} className="bg-zinc-900 rounded-lg p-2.5 border border-zinc-800">
                          <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">{item.label}</p>
                          <p className="text-xs text-zinc-400 truncate">{item.value}</p>
                        </div>
                      ))}
                      {ch.tags_default?.length > 0 && (
                        <div className="col-span-2 md:col-span-5 flex items-center gap-1.5 flex-wrap">
                          <Hash className="h-3 w-3 text-zinc-700" />
                          {ch.tags_default.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

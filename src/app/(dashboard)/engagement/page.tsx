'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  MessageCircle,
  Plus,
  Loader2,
  Zap,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  Play,
  Clock,
  Send,
  X,
} from 'lucide-react';
import type { DmRule, CommentTracking, DmConversation, DmMessage, EngagementStats, SocialAccount } from '@/types/database';

type Tab = 'rules' | 'activity' | 'inbox' | 'stats';

export default function EngagementPage() {
  const supabase = createClient();
  const { accounts } = useBrandAccounts();
  const igAccounts = accounts.filter((a: SocialAccount) => a.platform === 'instagram');

  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<DmRule[]>([]);
  const [activity, setActivity] = useState<CommentTracking[]>([]);
  const [conversations, setConversations] = useState<(DmConversation & { messages?: DmMessage[] })[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [convoMessages, setConvoMessages] = useState<DmMessage[]>([]);
  const [stats, setStats] = useState<EngagementStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Create/Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formTriggerType, setFormTriggerType] = useState('comment_keyword');
  const [formKeywords, setFormKeywords] = useState('');
  const [formMatchMode, setFormMatchMode] = useState('contains');
  const [formResponseTemplate, setFormResponseTemplate] = useState('');
  const [formDmTemplate, setFormDmTemplate] = useState('');
  const [formCooldown, setFormCooldown] = useState(60);
  const [formPriority, setFormPriority] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    const res = await fetch('/api/engagement/rules');
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules || []);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    if (!igAccounts.length) return;
    const accountIds = igAccounts.map((a: SocialAccount) => a.id);
    const { data } = await supabase
      .from('comment_tracking')
      .select('*')
      .in('account_id', accountIds)
      .order('created_at', { ascending: false })
      .limit(50);
    setActivity(data || []);
  }, [supabase, igAccounts]);

  const loadConversations = useCallback(async () => {
    if (!igAccounts.length) return;
    const accountIds = igAccounts.map((a: SocialAccount) => a.id);
    const { data } = await supabase
      .from('dm_conversations')
      .select('*')
      .in('account_id', accountIds)
      .order('last_message_at', { ascending: false })
      .limit(50);
    setConversations(data || []);
  }, [supabase, igAccounts]);

  const loadStats = useCallback(async () => {
    if (!igAccounts.length) return;
    const accountIds = igAccounts.map((a: SocialAccount) => a.id);
    const { data } = await supabase
      .from('engagement_stats')
      .select('*')
      .in('account_id', accountIds)
      .order('date', { ascending: false })
      .limit(30);
    setStats(data || []);
  }, [supabase, igAccounts]);

  const loadConvoMessages = useCallback(async (convoId: string) => {
    setSelectedConvo(convoId);
    const { data } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true })
      .limit(100);
    setConvoMessages(data || []);
  }, [supabase]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadRules(), loadActivity(), loadConversations(), loadStats()]).finally(() => setLoading(false));
  }, [loadRules, loadActivity, loadConversations, loadStats]);

  function resetForm() {
    setEditingId(null);
    setFormName('');
    setFormAccountId(igAccounts[0]?.id || '');
    setFormTriggerType('comment_keyword');
    setFormKeywords('');
    setFormMatchMode('contains');
    setFormResponseTemplate('');
    setFormDmTemplate('');
    setFormCooldown(60);
    setFormPriority(0);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(rule: DmRule) {
    setEditingId(rule.id);
    setFormName(rule.name);
    setFormAccountId(rule.account_id);
    setFormTriggerType(rule.trigger_type);
    setFormKeywords(rule.keywords.join(', '));
    setFormMatchMode(rule.match_mode);
    setFormResponseTemplate(rule.response_template);
    setFormDmTemplate(rule.dm_template || '');
    setFormCooldown(rule.cooldown_minutes);
    setFormPriority(rule.priority);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName || !formKeywords) return toast.error('Name and keywords required');
    setSaving(true);

    const payload = {
      id: editingId || undefined,
      name: formName,
      account_id: formAccountId,
      trigger_type: formTriggerType,
      keywords: formKeywords.split(',').map((k: string) => k.trim()).filter(Boolean),
      match_mode: formMatchMode,
      response_template: formResponseTemplate,
      dm_template: formDmTemplate || null,
      cooldown_minutes: formCooldown,
      priority: formPriority,
    };

    try {
      const res = await fetch('/api/engagement/rules', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(editingId ? 'Rule updated' : 'Rule created');
      setShowForm(false);
      loadRules();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: DmRule) {
    const res = await fetch('/api/engagement/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    });
    if (res.ok) {
      toast.success(`Rule ${rule.is_active ? 'paused' : 'activated'}`);
      loadRules();
    }
  }

  async function deleteRule(id: string) {
    const res = await fetch('/api/engagement/rules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success('Rule deleted');
      loadRules();
    }
  }

  async function processNow() {
    if (!igAccounts.length) return toast.error('No Instagram accounts connected');
    setProcessing(true);

    try {
      for (const acc of igAccounts) {
        const res = await fetch('/api/engagement/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: acc.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(`@${acc.username}: ${data.commentsProcessed} comments, ${data.repliesSent} replies, ${data.dmsSent} DMs`);
      }
      loadActivity();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Engagement</h1>
          <p className="text-muted-foreground">Auto-reply to comments and DMs with keyword triggers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={processNow} disabled={processing}>
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Process Now
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Rule
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['rules', 'activity', 'inbox', 'stats'] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = { rules: 'Rules', activity: 'Activity', inbox: 'Inbox', stats: 'Stats' };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Create/Edit Form Overlay */}
      {showForm && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{editingId ? 'Edit Rule' : 'Create Rule'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Rule Name</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Link Request" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instagram Account</Label>
                <select
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {igAccounts.map((a: SocialAccount) => (
                    <option key={a.id} value={a.id}>@{a.username}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Trigger Type</Label>
                <select
                  value={formTriggerType}
                  onChange={(e) => setFormTriggerType(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="comment_keyword">Comment Keyword</option>
                  <option value="dm_keyword">DM Keyword</option>
                  <option value="story_mention">Story Mention</option>
                  <option value="story_reply">Story Reply</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Match Mode</Label>
                <select
                  value={formMatchMode}
                  onChange={(e) => setFormMatchMode(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exact Match</option>
                  <option value="starts_with">Starts With</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Keywords (comma-separated)</Label>
                <Input value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="LINK, INFO, SEND" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Comment Reply Template</Label>
              <textarea
                value={formResponseTemplate}
                onChange={(e) => setFormResponseTemplate(e.target.value)}
                placeholder="Thanks @{{username}}! Check your DMs for the link."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              />
              <p className="text-xs text-muted-foreground">Variables: {'{{username}}'}, {'{{keyword}}'}, {'{{comment}}'}</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">DM Template (optional — sends a DM too)</Label>
              <textarea
                value={formDmTemplate}
                onChange={(e) => setFormDmTemplate(e.target.value)}
                placeholder="Hey {{username}}! Here's the link you requested: https://..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Cooldown (minutes)</Label>
                <Input type="number" min={0} value={formCooldown} onChange={(e) => setFormCooldown(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority (higher = first)</Label>
                <Input type="number" value={formPriority} onChange={(e) => setFormPriority(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                {editingId ? 'Update Rule' : 'Create Rule'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {!rules.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No rules yet. Create your first auto-reply rule.</p>
              </CardContent>
            </Card>
          ) : (
            rules.map((rule) => (
              <Card key={rule.id} className={!rule.is_active ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm">{rule.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          rule.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'
                        }`}>
                          {rule.is_active ? 'Active' : 'Paused'}
                        </span>
                        <span className="text-xs text-muted-foreground">{rule.trigger_type.replace('_', ' ')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {rule.keywords.map((kw, i) => (
                          <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            {kw}
                          </span>
                        ))}
                        <span className="text-xs text-muted-foreground">({rule.match_mode})</span>
                      </div>
                      {rule.response_template && (
                        <p className="text-xs text-muted-foreground truncate">
                          Reply: {rule.response_template}
                        </p>
                      )}
                      {rule.dm_template && (
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Send className="h-3 w-3" /> DM: {rule.dm_template}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {rule.cooldown_minutes}min cooldown
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => toggleRule(rule)}>
                        {rule.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <div className="space-y-3">
          {!activity.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No activity yet. Process comments to see results here.</p>
              </CardContent>
            </Card>
          ) : (
            activity.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">@{item.ig_username}</span>
                        {item.rule_id && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Matched</span>
                        )}
                        {item.dm_sent && (
                          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded">DM Sent</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{item.comment_text}</p>
                      {item.reply_text && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          Reply: {item.reply_text}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Inbox Tab */}
      {tab === 'inbox' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ minHeight: 400 }}>
          {/* Conversation list */}
          <div className="space-y-2 md:border-r md:pr-4">
            {!conversations.length ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Send className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                </CardContent>
              </Card>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConvoMessages(conv.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedConvo === conv.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">@{conv.ig_username}</span>
                    <span className="text-xs text-muted-foreground">
                      {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {conv.last_message_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(conv.last_message_at).toLocaleDateString()}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Message thread */}
          <div className="md:col-span-2">
            {!selectedConvo ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a conversation to view messages
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {convoMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p>{msg.message_text}</p>
                      <div className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {new Date(msg.created_at).toLocaleTimeString()}
                        {msg.is_automated && ' (auto)'}
                      </div>
                    </div>
                  </div>
                ))}
                {!convoMessages.length && (
                  <p className="text-sm text-muted-foreground text-center py-8">No messages in this conversation</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <div className="space-y-4">
          {/* Today's summary */}
          {(() => {
            const today = stats.find((s) => s.date === new Date().toISOString().split('T')[0]);
            const totals = stats.reduce(
              (acc, s) => ({
                comments: acc.comments + s.comments_processed,
                replies: acc.replies + s.replies_sent,
                dms: acc.dms + s.dms_sent,
                ai: acc.ai + s.ai_replies,
              }),
              { comments: 0, replies: 0, dms: 0, ai: 0 }
            );
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{today?.comments_processed || 0}</p>
                      <p className="text-xs text-muted-foreground">Comments Today</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{today?.replies_sent || 0}</p>
                      <p className="text-xs text-muted-foreground">Replies Today</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{today?.dms_sent || 0}</p>
                      <p className="text-xs text-muted-foreground">DMs Today</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{today?.ai_replies || 0}</p>
                      <p className="text-xs text-muted-foreground">AI Replies Today</p>
                    </CardContent>
                  </Card>
                </div>

                {/* All-time totals */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">All-Time Totals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="font-medium">{totals.comments}</p>
                        <p className="text-muted-foreground text-xs">Comments Processed</p>
                      </div>
                      <div>
                        <p className="font-medium">{totals.replies}</p>
                        <p className="text-muted-foreground text-xs">Replies Sent</p>
                      </div>
                      <div>
                        <p className="font-medium">{totals.dms}</p>
                        <p className="text-muted-foreground text-xs">DMs Sent</p>
                      </div>
                      <div>
                        <p className="font-medium">{totals.ai}</p>
                        <p className="text-muted-foreground text-xs">AI Replies</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Daily breakdown */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Daily Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!stats.length ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No stats yet</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                          <span>Date</span>
                          <span className="text-right">Comments</span>
                          <span className="text-right">Replies</span>
                          <span className="text-right">DMs</span>
                          <span className="text-right">AI</span>
                        </div>
                        {stats.slice(0, 14).map((s) => (
                          <div key={s.id} className="grid grid-cols-5 gap-2 text-sm">
                            <span className="text-muted-foreground">{new Date(s.date).toLocaleDateString()}</span>
                            <span className="text-right">{s.comments_processed}</span>
                            <span className="text-right">{s.replies_sent}</span>
                            <span className="text-right">{s.dms_sent}</span>
                            <span className="text-right">{s.ai_replies}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

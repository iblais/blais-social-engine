import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SmartLinkPublicPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: link } = await supabase
    .from('smartlinks')
    .select('*, smartlink_items(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (!link) notFound();

  // Increment view count (fire and forget)
  supabase.from('smartlinks').update({ total_views: (link.total_views || 0) + 1 }).eq('id', link.id).then(() => {});

  const items = (link.smartlink_items || [])
    .filter((i: { is_active: boolean }) => i.is_active)
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-md space-y-6">
        {/* Avatar & Title */}
        <div className="text-center space-y-3">
          {link.avatar_url ? (
            <img src={link.avatar_url} alt={link.title} className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-white/20" />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
              {link.title[0]?.toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-bold text-white">{link.title}</h1>
          {link.bio && <p className="text-sm text-gray-400">{link.bio}</p>}
        </div>

        {/* Links */}
        <div className="space-y-3">
          {items.map((item: { id: string; type: string; title: string; url: string | null; icon: string | null }) => {
            if (item.type === 'header') {
              return (
                <p key={item.id} className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-2">
                  {item.title}
                </p>
              );
            }
            return (
              <a
                key={item.id}
                href={`/l/${slug}/click?item=${item.id}&url=${encodeURIComponent(item.url || '#')}`}
                className="block w-full py-3.5 px-5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-center font-medium transition-all hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm border border-white/5"
              >
                {item.icon && <span className="mr-2">{item.icon}</span>}
                {item.title}
              </a>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 pt-4">
          Powered by Blais Social Engine
        </p>
      </div>
    </div>
  );
}

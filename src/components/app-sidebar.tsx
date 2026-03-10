'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PenSquare,
  CalendarDays,
  ListTodo,
  Settings,
  LogOut,
  Hash,
  Layers,
  Sparkles,
  ImagePlus,
  Lightbulb,
  BarChart3,
  FolderOpen,
  Kanban,
  Recycle,
  FlaskConical,
  FileText,
  Users,
  Key,
  FolderTree,
  MessageCircle,
  Link2,
  Rss,
  Trophy,
  RotateCcw,
  Youtube,
  Factory,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { AccountSwitcher } from '@/components/account-switcher';

const mainNav = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Compose', href: '/compose', icon: PenSquare },
  { title: 'Calendar', href: '/calendar', icon: CalendarDays },
  { title: 'Queue', href: '/queue', icon: ListTodo },
  { title: 'Analytics', href: '/analytics', icon: BarChart3 },
  { title: 'Media Library', href: '/media', icon: FolderOpen },
];

const contentNav = [
  { title: 'Pillars', href: '/settings/pillars', icon: Layers },
  { title: 'Hashtags', href: '/settings/hashtags', icon: Hash },
  { title: 'Templates', href: '/settings/templates', icon: FileText },
  { title: 'Pipeline', href: '/pipeline', icon: Kanban },
];

const aiNav = [
  { title: 'AI Captions', href: '/ai/captions', icon: Sparkles },
  { title: 'AI Images', href: '/ai/images', icon: ImagePlus },
  { title: 'Content Ideas', href: '/ai/ideas', icon: Lightbulb },
  { title: 'YouTube Studio', href: '/youtube', icon: Youtube },
];

const toolsNav = [
  { title: 'File Organizer', href: '/tools/organizer', icon: FolderTree },
];

const growthNav = [
  { title: 'Autolists', href: '/autolists', icon: RotateCcw },
  { title: 'Evergreen', href: '/evergreen', icon: Recycle },
  { title: 'Engagement', href: '/engagement', icon: MessageCircle },
  { title: 'Competitors', href: '/competitors', icon: Trophy },
  { title: 'SmartLinks', href: '/smartlinks', icon: Link2 },
  { title: 'Curation', href: '/curation', icon: Rss },
  { title: 'A/B Testing', href: '/ab-testing', icon: FlaskConical },
];

const productionNav = [
  { title: 'Content Pipeline', href: '/pipeline/workshop', icon: Factory },
];

const systemNav = [
  { title: 'Accounts', href: '/settings/accounts', icon: Users },
  { title: 'Brand Voice', href: '/settings/brand-voice', icon: Sparkles },
  { title: 'API Keys', href: '/settings/general', icon: Key },
];

type NavItem = { title: string; href: string; icon: React.ElementType };

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname === item.href || pathname.startsWith(item.href + '/')}>
                <Link href={item.href} onClick={() => { if (isMobile) setOpenMobile(false); }}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            B
          </div>
          <div>
            <p className="text-sm font-semibold">Blais Social</p>
            <p className="text-xs text-muted-foreground">Engine</p>
          </div>
        </Link>
      </SidebarHeader>
      <AccountSwitcher />
      <SidebarContent>
        <NavGroup label="Main" items={mainNav} />
        <NavGroup label="Content" items={contentNav} />
        <NavGroup label="AI" items={aiNav} />
        <NavGroup label="Tools" items={toolsNav} />
        <NavGroup label="Growth" items={growthNav} />
        <NavGroup label="Production" items={productionNav} />
        <NavGroup label="Settings" items={systemNav} />
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

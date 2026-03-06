'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Library', href: '/media' },
  { label: 'Resizer', href: '/media/resize' },
];

export default function MediaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Media</h1>
        <p className="text-muted-foreground">Manage your media assets and resize images for all platforms</p>
      </div>
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => {
          const isActive = tab.href === '/media' ? pathname === '/media' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}

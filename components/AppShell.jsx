'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/predictions', label: 'Predictions' },
  { href: '/stats', label: 'Stats' },
  { href: '/players', label: 'Players' },
  { href: '/analyst', label: 'Market Analyst' }
];

function isActiveTab(pathname, href) {
  if (href === '/predictions') return pathname === '/predictions' || pathname === '/';
  return pathname === href;
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isPlayers = pathname === '/players';

  return (
    <div className={`app${isPlayers ? ' appPlayers' : ''}`}>
      <header className="uclHero wcHero">
        <p className="uclHeroEyebrow">FIFA World Cup 2026</p>
        <h1 className="uclHeroTag">Match Predictor</h1>
        <p className="uclMeta">USA · Mexico · Canada · 48 teams · 12 groups</p>
      </header>

      <nav className="tabBar" aria-label="Main sections">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tab${isActiveTab(pathname, tab.href) ? ' active' : ''}`}
            aria-current={isActiveTab(pathname, tab.href) ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}

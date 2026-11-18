'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { label: 'Overview', href: '/', icon: '◫' },
  { label: 'Institutions', href: '/institutions', icon: '▦' },
  { label: 'Supervisory analytics', href: '/analytics', icon: '↗' },
  { label: 'Exceptions & alerts', href: '/exceptions', icon: '!' },
];

const plannedNavigation = [
  'Custom reports',
  'Data explorer',
  'AI supervisory assistant',
  'Integrations & health',
  'Administration',
];

export function DashboardNavigation() {
  const pathname = usePathname();
  return (
    <nav className="nav-list" aria-label="Main navigation">
      {navigation.map((item) => {
        const active = item.href === '/'
          ? pathname === '/'
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      {plannedNavigation.map((label) => (
        <span className="nav-disabled" aria-disabled="true" key={label}>
          <span aria-hidden="true">○</span>
          {label}
          <span className="nav-tag">Planned</span>
        </span>
      ))}
    </nav>
  );
}

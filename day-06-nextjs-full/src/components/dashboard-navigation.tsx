'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type NavigationIcon =
  | 'overview'
  | 'institutions'
  | 'analytics'
  | 'exceptions'
  | 'reports'
  | 'data'
  | 'assistant'
  | 'agents'
  | 'health'
  | 'settings';

type NavigationItem = {
  label: string;
  href: string;
  icon: NavigationIcon;
};

type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'Supervision',
    items: [
      { label: 'Overview', href: '/', icon: 'overview' },
      { label: 'Institutions', href: '/institutions', icon: 'institutions' },
      { label: 'Supervisory analytics', href: '/analytics', icon: 'analytics' },
      { label: 'Exceptions & alerts', href: '/exceptions', icon: 'exceptions' },
    ],
  },
  {
    label: 'Workflows',
    items: [
      { label: 'Custom reports', href: '/reports', icon: 'reports' },
      { label: 'Data explorer', href: '/data-explorer', icon: 'data' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'AI supervisory assistant', href: '/assistant', icon: 'assistant' },
      { label: 'Multi-agent supervision', href: '/agents', icon: 'agents' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Integrations & health', href: '/system-health', icon: 'health' },
      { label: 'Administration', href: '/settings', icon: 'settings' },
    ],
  },
];

function NavigationItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return navigationGroups.map((group) => (
    <div className="nav-group" key={group.label}>
      <div className="nav-group-label">{group.label}</div>
      <div className="nav-group-links">
        {group.items.map((item) => {
          const active = item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={onNavigate}
            >
              <NavIcon name={item.icon} />
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  ));
}

function NavIcon({ name }: { name: NavigationIcon }) {
  const paths: Record<NavigationIcon, string> = {
    overview: 'M3.5 3.5h7v7h-7zM13.5 3.5h7v5h-7zM13.5 10.5h7v10h-7zM3.5 12.5h7v8h-7z',
    institutions: 'M4 20.5h16M6.5 20.5V6.8L12 4l5.5 2.8v13.7M9 9h.01M15 9h.01M9 12.5h.01M15 12.5h.01M10 20.5v-4h4v4',
    analytics: 'M3.5 19.5h17M4.5 16l4-4 3 2 6-7M14.5 7h3v3',
    exceptions: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 8v4m0 3.5h.01',
    reports: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6',
    data: 'M4 5h10v6H4zM4 14h10v5H4zM17 7.5h3M17 16.5h3M18.5 6v3M18.5 15v3',
    assistant: 'M12 3.5l1.7 5.1 5.1 1.7-5.1 1.7-1.7 5.1-1.7-5.1-5.1-1.7 5.1-1.7zM19 16v4M17 18h4',
    agents: 'M6 6.5h.01M18 6.5h.01M12 17.5h.01M6 6.5l6 11 6-11M6 6.5h12',
    health: 'M3.5 12h4l2-5 4 10 2-5h5',
    settings: 'M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M11 16v4',
  };

  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function DashboardNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="nav-list" aria-label="Main navigation">
      <NavigationItems onNavigate={onNavigate} />
    </nav>
  );
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const currentItem = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.href === '/'
      ? pathname === '/'
      : pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <span>SupTech Monitor</span>
      <span className="crumb-separator" aria-hidden="true">/</span>
      <strong>{currentItem?.label ?? 'Supervisory workspace'}</strong>
    </nav>
  );
}

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const closeNavigation = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLButtonElement>('.mobile-nav-close')?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeNavigation();
        return;
      }

      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeNavigation, isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        className="mobile-nav-toggle"
        type="button"
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
        aria-controls="mobile-navigation-drawer"
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {isOpen
            ? <path d="m6 6 12 12M18 6 6 18" />
            : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>
      {isOpen && (
        <div className="mobile-nav-overlay">
          <button
            className="mobile-nav-scrim"
            type="button"
            aria-label="Close navigation menu"
            onClick={closeNavigation}
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation-drawer"
            className="mobile-nav-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
          >
            <div className="mobile-nav-header">
              <div className="brand">
                <div className="brand-mark" aria-hidden="true">S</div>
                <div>
                  <div className="brand-title">SupTech Monitor</div>
                  <div className="brand-subtitle">Supervisory intelligence</div>
                </div>
              </div>
              <button
                className="mobile-nav-close"
                type="button"
                aria-label="Close navigation menu"
                onClick={closeNavigation}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <DashboardNavigation onNavigate={closeNavigation} />
            <div className="sidebar-note">
              <strong>Training data</strong>
              <span>Synthetic records only</span>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

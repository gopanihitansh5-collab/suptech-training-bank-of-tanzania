'use client';

import { AnalystChat } from '../../src/components/AnalystChat';
import { AppHeader } from '../../src/components/AppHeader';

export default function AnalystPage() {
  return (
    <div className="app">
      <AppHeader />
      <main className="app__body">
        <AnalystChat />
      </main>
    </div>
  );
}

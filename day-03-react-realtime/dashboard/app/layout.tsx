import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../src/styles.css';

export const metadata: Metadata = {
  title: 'NavsaTech | Supervisory Monitoring',
  description:
    'Synthetic-data supervisory monitoring dashboard training prototype.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

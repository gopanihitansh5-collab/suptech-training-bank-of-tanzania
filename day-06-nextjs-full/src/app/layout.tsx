import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SupTech Monitor | Day 6',
    template: '%s | SupTech Monitor',
  },
  description: 'Synthetic supervisory monitoring training application.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

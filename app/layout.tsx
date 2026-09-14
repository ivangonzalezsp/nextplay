import type { Metadata } from 'next';
import './globals.css';
import './themes/index.css';
import { THEME_INIT_SCRIPT } from '@/lib/themes';
export const metadata: Metadata = {
  title: 'Next Play · Tu próximo juego',
  description: 'Tu biblioteca, tus gustos y un juego para cada momento.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

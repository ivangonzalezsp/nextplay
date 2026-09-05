import type { Metadata } from 'next';
import './globals.css';
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
    <html lang="es" className="dark">
      <body>{children}</body>
    </html>
  );
}

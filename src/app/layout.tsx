import './globals.css';
import Link from 'next/link';

// Request-specific CSP nonces must never be prerendered or reused from a cache.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Jetree - iWeb Management',
  description: 'Gestión operativa de agentes y departamentos',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-[#05070b] text-white antialiased">
        {children}
        <footer aria-label="Información y datos" className="flex flex-wrap justify-center gap-5 border-t border-cyan-950/40 px-4 py-5 text-xs text-gray-400">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/condiciones">Condiciones</Link>
          <Link href="/uso-ia">Uso de IA</Link>
          <Link href="/datos">Tus datos</Link>
        </footer>
      </body>
    </html>
  );
}

import './globals.css';

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
      </body>
    </html>
  );
}

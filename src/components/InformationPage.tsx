import Link from 'next/link';

export default function InformationPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-5 py-12 text-gray-200">
    <Link href="/" className="text-sm text-cyan-300 hover:underline">← Volver a Jetree</Link>
    <h1 className="mt-8 text-3xl font-semibold text-white">{title}</h1>
    <p className="mt-2 text-sm text-gray-400">Jetree · Workspace de iWeb · Actualizado el 7 de octubre de 2026</p>
    <div className="mt-8 space-y-6 leading-relaxed">{children}</div>
  </main>;
}

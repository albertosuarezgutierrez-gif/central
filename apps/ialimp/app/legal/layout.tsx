import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Información legal — IALIMP',
  robots: { index: true, follow: true },
}

// Marco común de las páginas legales (públicas): cabecera con logo + contenido + footer
// con los enlaces entre páginas. Tema claro / indigo / Nunito, responsive.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Nunito', -apple-system, sans-serif", color: '#1e1b4b', background: '#f1f5f9', minHeight: '100dvh' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(255,255,255,.9)', borderBottom: '1px solid #e2e8f0', backdropFilter: 'saturate(1.4) blur(8px)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.03em', textDecoration: 'none', color: '#1e1b4b' }}>
            <span style={{ color: '#4f46e5' }}>ia</span><span style={{ fontWeight: 400 }}>limp</span>
          </Link>
          <Link href="/login" style={{ fontWeight: 600, fontSize: 14, color: '#4f46e5', textDecoration: 'none' }}>← Volver</Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 20px 64px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 'clamp(24px,5vw,40px)', boxShadow: '0 12px 36px -20px rgba(30,27,75,.28)' }}>
          {children}
        </div>
      </main>

      <footer style={{ borderTop: '1px solid #e2e8f0', padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <Link href="/legal/aviso-legal" style={{ color: '#64748b', fontWeight: 600, textDecoration: 'none' }}>Aviso legal</Link>
          <Link href="/legal/privacidad" style={{ color: '#64748b', fontWeight: 600, textDecoration: 'none' }}>Privacidad</Link>
          <Link href="/legal/cookies" style={{ color: '#64748b', fontWeight: 600, textDecoration: 'none' }}>Cookies</Link>
        </div>
        © {new Date().getFullYear()} IALIMP · Alberto Suárez Gutiérrez
      </footer>
    </div>
  )
}

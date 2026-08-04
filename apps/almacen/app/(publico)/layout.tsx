import Link from 'next/link'

// Escaparate público de alquiler (sin sesión). Cabecera corporativa Joaquín Jaén.
export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="pub-nav">
        <Link href="/catalogo" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-jj.png" alt="Joaquín Jaén · Catering" className="brand-logo" />
          <span className="brand-tag">Alquiler</span>
        </Link>
        <span className="nav-spacer" />
        <Link href="/catalogo" className="pub-navlink">Catálogo</Link>
        <Link href="/reservar" className="btn btn-primary pub-cta">Solicitar reserva</Link>
      </header>
      <div className="container pub-container">{children}</div>
      <footer className="pub-foot">
        <span>Joaquín Jaén · Eventos &amp; Catering</span>
        <span className="muted">Alquiler de menaje y material para eventos</span>
      </footer>
    </>
  )
}

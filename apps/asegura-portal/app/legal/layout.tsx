import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Marco de las páginas legales. Va aparte del `(portal)` a propósito: estas
 * cuatro páginas tienen que poder leerse SIN sesión — quien llega al portal por
 * primera vez todavía no ha metido el código, y la información precontractual
 * del art. 19 LDS y la política de privacidad son justo lo que tiene que poder
 * ver ANTES de darnos un dato.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="legal">
      {children}
      <p className="legal-volver">
        <Link href="/">← Volver al portal</Link>
      </p>
    </main>
  )
}

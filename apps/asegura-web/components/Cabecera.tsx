'use client'
// Cabecera del sitio público.
//
// Reproduce el gesto de la landing de `app.grupoasegura.com`: arriba del todo
// es transparente y alta (76 px); en cuanto se baja de 24 px se encoge a 56 px
// y se convierte en una PÍLDORA flotante con borde, sombra y desenfoque. Es lo
// que hace que la página se sienta «viva» sin animar nada más.
//
// Es cliente por eso y solo por eso: hace falta leer `scrollY`. El resto del
// layout sigue siendo servidor.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NAV_CABECERA, PORTAL_URL } from '@/lib/sitio'

/** Enlaces internos de la nav. En su web la nav son anclas de la propia home;
 *  aquí son las páginas de ramo, que es lo que esta web tiene que posicionar. */
export default function Cabecera({ marca }: { marca: string }) {
  const [bajado, setBajado] = useState(false)
  const [avance, setAvance] = useState(0)

  useEffect(() => {
    const alScroll = () => {
      setBajado(window.scrollY > 24)
      const alto = document.documentElement.scrollHeight - window.innerHeight
      setAvance(alto > 0 ? window.scrollY / alto : 0)
    }
    alScroll()
    window.addEventListener('scroll', alScroll, { passive: true })
    return () => window.removeEventListener('scroll', alScroll)
  }, [])

  return (
    <>
      {/* Barra de progreso de lectura, como la suya. */}
      <div className="progreso" style={{ transform: `scaleX(${avance})` }} aria-hidden />
      <header className={bajado ? 'hdr bajado' : 'hdr'}>
        <div className="wrap">
          {/* La píldora flotante va SIEMPRE en oscuro (`oscuro` re-tematiza sus
                tokens). Blanca se comía media pantalla cada vez que flotaba
                sobre una sección oscura, que en esta página son la mayoría; en
                oscuro se integra ahí y sigue destacando sobre las claras. */}
            <div className={bajado ? 'hdr-caja oscuro' : 'hdr-caja'}>
            {/* Nav a la izquierda y logo centrado en absoluto, como él. Por
                debajo de 1024 px la nav se esconde y el logo pasa a la
                izquierda (regla en globals.css), que es lo que evita que el
                botón le pise encima en el móvil. */}
            <nav className="hdr-nav" aria-label="Secciones">
              {NAV_CABECERA.map((n) => (
                <Link key={n.href} href={n.href}>
                  {n.texto}
                </Link>
              ))}
            </nav>

            <Link href="/" className="hdr-marca">
              <span className="marca-tile" aria-hidden="true">
                <span className="marca-mono" />
              </span>
              {marca}
            </Link>

            <div className="hdr-dcha">
              {/* Único acceso de la web: la intranet del CLIENTE. Es <a> y no
                  <Link> porque es otro dominio. No hay «acceso corredor» a
                  propósito: Alberto entra por plataforma. */}
              <a href={PORTAL_URL} className="btn btn-brand btn-sm">
                Área de clientes
              </a>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}

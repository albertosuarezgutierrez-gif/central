'use client'
// Cabecera del sitio público (rediseño 30/09/2026).
//
// Reproduce el gesto de la landing de `app.grupoasegura.com`: arriba del todo
// es transparente y alta (76 px); en cuanto se baja de 24 px se encoge a 56 px
// y se convierte en una PÍLDORA flotante con borde, sombra y desenfoque. Es lo
// que hace que la página se sienta «viva» sin animar nada más.
//
// 30/09/2026 (Alberto: «la gente no entra a ver tipos de seguro»): la cabecera
// deja de ser un catálogo de ramos y pasa a ser accesos a las herramientas.
// Escritorio: Marca · Seguros ▾ · herramientas · ¿Siniestro? · Mis seguros.
// Móvil: Marca · Mis seguros, y debajo una fila de chips con lo mismo.
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { NAV, HERRAMIENTAS, PORTAL_URL } from '@/lib/sitio'
import EnlaceMedido from '@/components/EnlaceMedido'

/** Ayuda: lo que se busca con prisa o una vez al año. Va en el panel, no en la fila. */
const AYUDA = [
  { href: '/siniestro', texto: 'Tengo un siniestro', key: 'siniestro_menu' },
  { href: '/telefonos-siniestros', texto: 'Teléfonos para dar parte', key: 'telefonos' },
  { href: '/carta-baja-seguro', texto: 'Carta para dar de baja un seguro', key: 'baja' },
  { href: '/seguro-hipoteca-banco-obligatorio', texto: '¿Es obligatorio el seguro del banco?', key: 'ley_banco' },
  { href: '/cambiar-de-correduria', texto: 'Cambiar de correduría', key: 'cambiar' },
] as const

const RAMOS = NAV.filter((n) => n.href.startsWith('/seguros/'))

export default function Cabecera({ marca }: { marca: string }) {
  const [bajado, setBajado] = useState(false)
  const [avance, setAvance] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLElement>(null)

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

  // Esc y clic fuera de la cabecera cierran el panel. El «fuera» es la cabecera
  // entera: así el botón de escritorio y el chip del móvil no se pisan.
  useEffect(() => {
    if (!abierto) return
    const alTecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    const alClic = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    window.addEventListener('keydown', alTecla)
    document.addEventListener('click', alClic)
    return () => {
      window.removeEventListener('keydown', alTecla)
      document.removeEventListener('click', alClic)
    }
  }, [abierto])

  const alternar = () => setAbierto((a) => !a)

  return (
    <>
      <div className="progreso" style={{ transform: `scaleX(${avance})` }} aria-hidden />
      <header ref={raiz} className={bajado ? 'hdr bajado' : 'hdr'}>
        <div className="wrap">
          <div className="hdr-caja">
            <Link href="/" className="hdr-marca">
              <span className="marca-tile" aria-hidden="true">
                <span className="marca-mono" />
              </span>
              <span className="marca-palabra" aria-hidden="true" />
              <span className="sr-marca">{marca}</span>
            </Link>

            {/* Escritorio: Seguros ▾ + las herramientas. Se esconde <1024 px
                (lo sustituye la fila de chips de abajo). */}
            <nav className="hdr-nav" aria-label="Accesos">
              <button
                type="button"
                className="hdr-seguros"
                onClick={alternar}
                aria-expanded={abierto}
                aria-controls="hdr-panel"
              >
                Seguros <span aria-hidden="true">▾</span>
              </button>
              {HERRAMIENTAS.map((h) => (
                <EnlaceMedido key={h.key} href={h.href} origen={`cabecera_${h.key}`}>
                  {h.texto}
                </EnlaceMedido>
              ))}
            </nav>

            <div className="hdr-dcha">
              <EnlaceMedido href="/siniestro" origen="cabecera_siniestro" className="btn btn-siniestro btn-sm">
                ¿Siniestro?
              </EnlaceMedido>
              {/* Único acceso a la intranet. Es <a> y no <Link> porque es otro
                  dominio. `origen="cabecera"` se conserva: es la serie histórica
                  del embudo del portal en PostHog. */}
              <EnlaceMedido href={PORTAL_URL} origen="cabecera" className="btn btn-brand btn-sm">
                Mis seguros
              </EnlaceMedido>
            </div>
          </div>

          {/* Móvil/tablet (<1024 px): la nav de arriba no cabe; los mismos
              accesos van en una fila deslizable bajo la píldora. */}
          <div className="hdr-chips" aria-label="Accesos rápidos">
            <button
              type="button"
              className="hdr-chip"
              onClick={alternar}
              aria-expanded={abierto}
              aria-controls="hdr-panel"
            >
              Seguros ▾
            </button>
            {HERRAMIENTAS.map((h) => (
              <EnlaceMedido key={h.key} href={h.href} origen={`cabecera_${h.key}`} className="hdr-chip">
                {h.texto}
              </EnlaceMedido>
            ))}
            <EnlaceMedido href="/siniestro" origen="cabecera_siniestro" className="hdr-chip hdr-chip-urgente">
              ¿Siniestro?
            </EnlaceMedido>
          </div>

          {/* 🚨 El panel está SIEMPRE en el HTML (`hidden` cuando está cerrado),
              no se monta al abrir: la cabecera es el enlace que sale en todas
              las páginas y reparte el peso interno a las páginas de ramo. Montado
              perezoso, Google dejaría de ver esos enlaces. */}
          <div id="hdr-panel" className="hdr-panel" hidden={!abierto}>
            <div className="hdr-grupo">
              <p className="hdr-grupo-titulo">Seguros</p>
              {RAMOS.map((n) => (
                <EnlaceMedido
                  key={n.href}
                  href={n.href}
                  origen={`cabecera_ramo_${n.href.replace('/seguros/', '')}`}
                  className="hdr-item"
                >
                  {n.texto}
                </EnlaceMedido>
              ))}
            </div>
            <div className="hdr-grupo">
              <p className="hdr-grupo-titulo">Ayuda</p>
              {AYUDA.map((a) => (
                <EnlaceMedido key={a.href} href={a.href} origen={`cabecera_${a.key}`} className="hdr-item">
                  {a.texto}
                </EnlaceMedido>
              ))}
            </div>
          </div>
        </div>
      </header>
    </>
  )
}

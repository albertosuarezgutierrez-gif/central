'use client'
import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Accesos directos de la correduría (24/09/2026, Alberto: «tiene que ser todo
 * accesos directos… pincho en la póliza y me aparecen coberturas, recibos,
 * siniestros, y ya dentro de cada uno la información»).
 *
 * Dos sabores con la MISMA baldosa:
 * - `TiraAccesos`: cada baldosa es un enlace (la ficha del cliente, que carga
 *   cada sección en el servidor por `?tab=`).
 * - `PanelAccesos`: las baldosas abren su contenido debajo, de una en una, sin
 *   navegar (la ficha de póliza). Lo abierto va a `?v=` con `replaceState`, así
 *   que al volver atrás el navegador lo restaura sin remontar la página.
 *
 * Solo se MONTA el contenido abierto: el resto no crea DOM ni pide nada.
 */

export type Tono = 'malo' | 'aviso' | 'bien'

export type Acceso = {
  id: string
  icono: string
  titulo: string
  /** Una línea con el dato: «12 · 1 devuelto». `null` = no se pinta (no es «0»). */
  detalle?: string | null
  tono?: Tono
}

const COLOR: Record<Tono, string> = { malo: 'var(--negative)', aviso: 'var(--warning)', bien: 'var(--positive)' }

export const rejillaAccesos: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10,
}

function estiloBaldosa(on: boolean): React.CSSProperties {
  return {
    display: 'grid', gap: 2, alignContent: 'start', textAlign: 'left',
    minHeight: 64, padding: '10px 12px', borderRadius: 'var(--radius)',
    background: 'var(--surface)', boxShadow: 'var(--shadow)',
    border: `2px solid ${on ? 'var(--primary)' : 'transparent'}`,
    color: 'var(--text)', textDecoration: 'none', cursor: 'pointer', font: 'inherit',
  }
}

function Cuerpo({ a }: { a: Acceso }) {
  return (
    <>
      <span style={{ fontSize: 14, fontWeight: 700 }}>
        <span aria-hidden style={{ marginRight: 6 }}>{a.icono}</span>{a.titulo}
      </span>
      {a.detalle && (
        <span style={{ fontSize: 12, fontWeight: a.tono ? 700 : 400, color: a.tono ? COLOR[a.tono] : 'var(--muted)' }}>{a.detalle}</span>
      )}
    </>
  )
}

export function TiraAccesos({ accesos, activo }: {
  /** El `href` va en cada acceso, no como función: una función no cruza de servidor a cliente. */
  accesos: (Acceso & { href: string })[]
  activo: string | null
}) {
  return (
    <nav aria-label="Accesos" style={rejillaAccesos}>
      {accesos.map(a => (
        <Link key={a.id} href={a.href} prefetch={false} scroll={false} aria-current={activo === a.id ? 'page' : undefined} style={estiloBaldosa(activo === a.id)}>
          <Cuerpo a={a} />
        </Link>
      ))}
    </nav>
  )
}

export function PanelAccesos({ accesos, inicial }: {
  accesos: (Acceso & { contenido: ReactNode })[]
  /** El `?v=` con el que se cargó la página. */
  inicial: string | null
}) {
  const valido = (v: string | null) => (v && accesos.some(a => a.id === v) ? v : null)
  const [abierto, setAbierto] = useState<string | null>(valido(inicial))

  // Al volver atrás con `replaceState` de por medio, el `?v=` de la barra manda.
  useEffect(() => {
    const leer = () => setAbierto(valido(new URLSearchParams(window.location.search).get('v')))
    window.addEventListener('popstate', leer)
    return () => window.removeEventListener('popstate', leer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pulsar(id: string) {
    const nuevo = abierto === id ? null : id
    setAbierto(nuevo)
    const url = new URL(window.location.href)
    if (nuevo) url.searchParams.set('v', nuevo)
    else url.searchParams.delete('v')
    window.history.replaceState(null, '', url)
    if (nuevo) requestAnimationFrame(() => document.getElementById(`acceso-${nuevo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const actual = accesos.find(a => a.id === abierto)
  return (
    <>
      <div role="tablist" aria-label="Datos de la póliza" style={rejillaAccesos}>
        {accesos.map(a => (
          <button key={a.id} type="button" role="tab" aria-selected={abierto === a.id} aria-controls={`acceso-${a.id}`} onClick={() => pulsar(a.id)} style={estiloBaldosa(abierto === a.id)}>
            <Cuerpo a={a} />
          </button>
        ))}
      </div>
      {actual && (
        <section id={`acceso-${actual.id}`} role="tabpanel" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, scrollMarginTop: 12 }}>
          {actual.contenido}
        </section>
      )}
    </>
  )
}

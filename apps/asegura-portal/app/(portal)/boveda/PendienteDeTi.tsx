'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import type { ItemPendiente } from '@/lib/pendiente-de-ti'

/** Lo que dispara un bloque de la misma página cuando la persona resuelve algo sin recargar. */
export const EVENTO_PENDIENTE_RESUELTO = 'portal:pendiente-resuelto'

export function avisarPendienteResuelto(clave: 'contacto' | 'anulacion', id?: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO_PENDIENTE_RESUELTO, { detail: { clave, id } }))
}

/**
 * «Pendiente de ti» (§Q.4): arriba de «Mis seguros», una sola lista de lo que necesitamos de la
 * persona. Cada fila lleva a donde se hace. Sin nada pendiente no pinta nada; lo que no se ha podido
 * comprobar se dice en una línea, nunca como «todo al día».
 */
export function PendienteDeTi({
  items: iniciales,
  anulaciones,
  sinComprobar,
}: {
  items: ItemPendiente[]
  /** Cuántas anulaciones quedan por firmar: la fila se quita al firmar la última. */
  anulaciones: number
  sinComprobar: string[]
}) {
  const [items, setItems] = useState(iniciales)
  // Por id: un evento repetido (reintento, doble clic) no puede descontar dos veces.
  const firmadas = useRef(new Set<string>())

  useEffect(() => {
    function resuelto(e: Event) {
      const { clave, id } = (e as CustomEvent<{ clave: string; id?: string }>).detail ?? {}
      if (clave === 'contacto') setItems((xs) => xs.filter((x) => x.clave !== 'contacto'))
      if (clave === 'anulacion' && id) {
        firmadas.current.add(id)
        if (firmadas.current.size >= anulaciones) setItems((xs) => xs.filter((x) => x.clave !== 'anulacion'))
      }
    }
    window.addEventListener(EVENTO_PENDIENTE_RESUELTO, resuelto)
    return () => window.removeEventListener(EVENTO_PENDIENTE_RESUELTO, resuelto)
  }, [anulaciones])

  if (items.length === 0 && sinComprobar.length === 0) return null

  return (
    <section className="seccion" aria-labelledby="pendiente-titulo">
      <h2 id="pendiente-titulo">
        Pendiente de ti{items.length > 0 && <span className="chip aviso" style={{ marginLeft: 8 }}>{items.length}</span>}
      </h2>
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {items.map((it) => (
            <li key={it.clave}>
              <Link
                href={it.href}
                className="poliza-enlace"
                style={{ display: 'block', minHeight: 44, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}
              >
                <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  {it.urgente && <span className="chip peligro">Urgente</span>}
                  <strong>{it.titulo}</strong>
                </span>
                {it.detalle && <span className="suave" style={{ display: 'block', fontSize: 14, marginTop: 2 }}>{it.detalle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {sinComprobar.length > 0 && (
        <p className="suave" style={{ fontSize: 13, margin: items.length > 0 ? '8px 0 0' : 0 }}>
          No hemos podido comprobar {sinComprobar.join(' ni ')}. No significa que no haya nada: vuelve a mirar en un rato.
        </p>
      )}
    </section>
  )
}

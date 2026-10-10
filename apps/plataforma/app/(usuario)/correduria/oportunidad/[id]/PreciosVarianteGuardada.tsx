'use client'

// «Ver precios y emitir» de una variante YA PEDIDA, dentro de «Presupuestos de este riesgo» (10/10/2026; nació como
// `PreciosVarianteMoto` el 07/10/2026 y se extrajo al llegar auto). Lee la tarificación guardada (gratis) y, si es
// ESA variante y sigue vigente, deja que el ramo pinte sus precios con su «Emitir». Común a los ramos con cotizador
// embebido; cada uno aporta su acción de lectura y su lista de precios.
//
// 🚨 Nunca otra en su lugar: si asegura devolviera otra tarificación (la última del cliente), no se emite. Y una
// caducada (efecto ya pasado) no se confirma ni se emite: se dice y se manda a pedir precio de nuevo.

import { useEffect, useState, type ReactNode } from 'react'
import type { RespuestaTarificacionNueva, TarificacionNuevaGuardada } from '@/lib/retarificar-asegura'

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** «Tarificación del 07/10/26 10:00 · efecto 08/10/2026»: el resumen de una tarificación ya pagada. */
export function resumenGuardada(g: TarificacionNuevaGuardada): string {
  return `Tarificación del ${new Date(g.creadaEn).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}${g.fechaEfecto ? ` · efecto ${fechaCorta(g.fechaEfecto)}` : ''}`
}

type Carga =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'caducada'; fechaEfecto: string | null }
  | { estado: 'ok'; g: TarificacionNuevaGuardada }

export default function PreciosVarianteGuardada({ clienteId, oportunidadId, tarificacionId, leer, pintar }: {
  /** El tomador de ESA variante (la tarificación es suya). */
  clienteId: string
  oportunidadId: string
  tarificacionId: string
  /** La acción de servidor del ramo que lee una tarificación guardada (gratis). */
  leer: (entrada: { clienteId: string; oportunidadId: string; tarificacionId: string }) => Promise<RespuestaTarificacionNueva>
  /** Los precios de ESA variante, vigente, con su «Emitir». */
  pintar: (g: TarificacionNuevaGuardada) => ReactNode
}) {
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  useEffect(() => {
    let vivo = true
    setCarga({ estado: 'cargando' })
    leer({ clienteId, oportunidadId, tarificacionId })
      .then((r) => {
        if (!vivo) return
        if (r.estado === 'ninguna') { setCarga({ estado: 'error', mensaje: 'No se encuentra esta variante guardada: no se puede emitir desde aquí.' }); return }
        if (r.estado !== 'ok') { setCarga({ estado: 'error', mensaje: `No se han podido leer sus precios: ${r.mensaje}` }); return }
        const g = r.guardada
        // Nunca otra en su lugar: si asegura devolviera otra tarificación (la última del cliente), no se emite.
        if (g.cotizacionId !== tarificacionId) { setCarga({ estado: 'error', mensaje: 'Lo leído no es esta variante: no se emite desde aquí.' }); return }
        if (g.caducada) { setCarga({ estado: 'caducada', fechaEfecto: g.fechaEfecto }); return }
        setCarga({ estado: 'ok', g })
      })
      .catch(() => { if (vivo) setCarga({ estado: 'error', mensaje: 'No se han podido leer sus precios (sin conexión).' }) })
    return () => { vivo = false }
    // `leer` es una acción de servidor (referencia estable): no entra en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, oportunidadId, tarificacionId])
  if (carga.estado === 'cargando') return <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Leyendo sus precios (gratis)…</p>
  if (carga.estado === 'error') return <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{carga.mensaje}</p>
  if (carga.estado === 'caducada') {
    return (
      <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
        Su fecha de efecto{carga.fechaEfecto ? ` (${fechaCorta(carga.fechaEfecto)})` : ''} ya ha pasado: la compañía no la confirma ni la emite. Pide precio de nuevo en el bloque «Pedir precio».
      </p>
    )
  }
  return <>{pintar(carga.g)}</>
}

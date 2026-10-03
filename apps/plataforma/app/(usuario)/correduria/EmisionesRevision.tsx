'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, TriangleAlert } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import { ConIcono } from './iconos'
import {
  colaDeProxy, contadorCola, pantallaCola, textoCoincidencias, textoErrorCola, textoMotivo,
  type ColaRevision, type FilaRevision,
} from '@/lib/correduria/emisiones-revision'

/**
 * Emisiones de Avant2 que el descubrimiento automático NO pudo registrar solo (03/10/2026): tomador sin
 * ficha o con varias, ramo que no se acuña, estado desconocido… Cada fila dice por qué, enlaza a la
 * ficha del cliente si asegura la conoce y se cierra con «Marcar revisada».
 *
 * 🚨 «Nada pendiente» SOLO sale de una lectura buena que dice 0. Un fallo de carga es un error visible
 * y el contador de la barra es `null` («!»), nunca 0. No hay patrón de URL de Avant2 en el repo: se
 * enseña el id del proyecto, sin enlace inventado.
 */

const POR_PAGINA = 50
const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const

function fecha(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'
}

export default function EmisionesRevision({ onContador, primero }: {
  /** `undefined` = aún no contestó · `null` = no se pudo leer (nunca 0) · n = abiertas. */
  onContador?: (n: number | null) => void
  primero?: boolean
}) {
  const [cola, setCola] = useState<ColaRevision | null>(null)
  const [filas, setFilas] = useState<FilaRevision[]>([])
  const [cerrando, setCerrando] = useState<string | null>(null)
  const [errorCierre, setErrorCierre] = useState('')
  const [cargandoMas, setCargandoMas] = useState(false)
  const avisar = useRef(onContador)
  avisar.current = onContador

  const leer = useCallback(async (desde: number): Promise<ColaRevision> => {
    try {
      const r = await fetch(`/api/correduria/emisiones-revision?desde=${desde}`, { cache: 'no-store' })
      return colaDeProxy(r.status, await r.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }, [])

  // Carga inicial y «recarga sin desmontar»: la lista anterior se queda en pantalla hasta que llega la nueva.
  const recargar = useCallback(async () => {
    const c = await leer(0)
    setCola(c)
    if (c.estado === 'ok') setFilas(c.filas)
    const n = contadorCola(c)
    if (n !== undefined) avisar.current?.(n)
  }, [leer])

  useEffect(() => { void recargar() }, [recargar])

  async function verMas() {
    setCargandoMas(true)
    const c = await leer(filas.length)
    setCargandoMas(false)
    if (c.estado === 'ok') {
      setFilas((f) => [...f, ...c.filas])
      setCola(c)
    } else {
      setErrorCierre(`No se han podido cargar más: ${c.estado === 'error' ? textoErrorCola(c.motivo) : 'asegura no está conectado.'}`)
    }
  }

  async function marcar(f: FilaRevision) {
    setCerrando(f.id)
    setErrorCierre('')
    try {
      const r = await fetch(`/api/correduria/emisiones-revision/${encodeURIComponent(f.id)}/resolver`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (!r.ok || !j || j.estado !== 'ok') {
        setErrorCierre(`No se ha podido marcar como revisada (no se ha cerrado nada): ${textoErrorCola(j?.motivo ?? 'asegura_error')}`)
      } else {
        await recargar()
      }
    } catch {
      setErrorCierre('No se ha podido marcar como revisada: no se pudo llegar al servidor. No se ha cerrado nada.')
    } finally {
      setCerrando(null)
    }
  }

  const modo = pantallaCola(cola)
  const titulo = 'Emisiones a revisar'

  if (modo === 'cargando') {
    return <Bloque titulo={titulo} Icono={ClipboardCheck} primero={primero}><p style={pMuted}>Cargando…</p></Bloque>
  }
  if (modo === 'sin_configurar') {
    return (
      <Bloque titulo={titulo} Icono={ClipboardCheck} tono="aviso" primero={primero}>
        <p style={pMuted}>El puerto con asegura no está conectado. <strong>No lo leas como «nada pendiente»</strong>: desde aquí no se ha podido mirar.</p>
      </Bloque>
    )
  }
  if (modo === 'error' && cola?.estado === 'error') {
    return (
      <Bloque titulo={titulo} Icono={ClipboardCheck} tono="malo" primero={primero}
        accion={<button type="button" onClick={() => void recargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Reintentar</button>}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          <ConIcono i={TriangleAlert}>No se ha podido leer la cola: {textoErrorCola(cola.motivo)} <strong>No significa que no haya nada pendiente.</strong></ConIcono>
        </p>
      </Bloque>
    )
  }
  if (modo === 'vacia') {
    return (
      <Bloque titulo={titulo} Icono={ClipboardCheck} primero={primero}
        sub="Emisiones de Avant2 que el descubrimiento automático no pudo registrar solo.">
        <p style={pMuted}>Nada pendiente: no hay emisiones esperando revisión.</p>
      </Bloque>
    )
  }

  const total = cola?.estado === 'ok' ? cola.total : filas.length
  const hayMas = cola?.estado === 'ok' && cola.hayMas
  return (
    <Bloque
      titulo={`${titulo} · ${total}`}
      Icono={ClipboardCheck}
      tono="aviso"
      primero={primero}
      sub="Emisiones de Avant2 que el descubrimiento automático no pudo registrar solo. «Marcar revisada» no escribe en la cartera: solo apunta que ya la has mirado."
    >
      {errorCierre && <p role="alert" style={{ ...pMuted, color: 'var(--negative)', marginBottom: 8 }}>{errorCierre}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        {filas.map((f) => {
          const t = textoMotivo(f.motivo)
          const coinc = textoCoincidencias(f.motivo, f.coincidencias)
          return (
            <li key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, minWidth: 0, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>{t.titulo}</strong>
                {f.veces > 1 && <Badge tono="neutral" title="Veces que el descubrimiento ha vuelto a verlo">visto {f.veces} veces</Badge>}
              </div>
              <p style={{ ...pMuted, overflowWrap: 'anywhere' }}>{t.que}</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, overflowWrap: 'anywhere' }}>
                Proyecto Avant2 nº {f.projectId}
                {f.compania ? ` · ${f.compania}` : ''}
                {f.ramoVendor ? ` · ${f.ramoVendor}` : ''}
                {f.estadoEmision ? ` · solicitud ${f.estadoEmision}` : ''}
                {f.numeroPoliza ? ` · póliza ${f.numeroPoliza}` : ''}
                {coinc ? ` · ${coinc}` : ''}
                {` · desde el ${fecha(f.primeraVezAt)}`}
              </p>
              {f.detalle && <p style={{ fontSize: 12, margin: 0, overflowWrap: 'anywhere' }}>Detalle: {f.detalle}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {f.clienteId && (
                  <Link href={`/correduria/cliente/${f.clienteId}`} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                    Abrir la ficha del cliente
                  </Link>
                )}
                <button
                  type="button"
                  disabled={cerrando !== null}
                  onClick={() => void marcar(f)}
                  style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}
                >
                  {cerrando === f.id ? 'Marcando…' : 'Marcar revisada'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {hayMas && (
        <button type="button" disabled={cargandoMas} onClick={() => void verMas()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, marginTop: 10 }}>
          {cargandoMas ? 'Cargando…' : `Ver más (${Math.min(POR_PAGINA, total - filas.length)} de ${total - filas.length} restantes)`}
        </button>
      )}
    </Bloque>
  )
}

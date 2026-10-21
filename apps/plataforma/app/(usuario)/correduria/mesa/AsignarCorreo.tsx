'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { btnStyle } from '@/components/ui'
import type { CorreoCompania } from '@/lib/correduria/correos-compania'
import SelectorCliente, { type ClienteElegido } from './SelectorCliente'

const ABIERTAS = new Set(['competencia', 'en_negociacion', 'pendiente_cliente'])
const BTN: React.CSSProperties = { ...btnStyle('secundario', 'sm'), minHeight: 44 }
const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }

type Op = { id: string; ramo: string | null; estado: string }
type Ops = { fase: 'cargando' } | { fase: 'ok'; abiertas: Op[] } | { fase: 'error'; texto: string }

/** Lee `GET /api/correduria/oportunidad?clienteId=` y se queda con las ABIERTAS. Un fallo se dice, nunca «no tiene». */
function abiertasDe(j: unknown): Op[] | null {
  const o = typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null
  if (o?.estado !== 'ok' || !Array.isArray(o.oportunidades)) return null
  return (o.oportunidades as Record<string, unknown>[])
    .filter((x) => typeof x?.id === 'string' && typeof x.estado === 'string' && ABIERTAS.has(x.estado))
    .map((x) => ({ id: x.id as string, ramo: typeof x.ramo === 'string' ? x.ramo : null, estado: x.estado as string }))
}

/**
 * «Asignar a cliente / oportunidad» de un aviso SIN RESOLVER de la bandeja (F1 del agente de correo, 21/10/2026).
 * El buscador arranca con el nombre SUGERIDO por el asunto, pero Alberto ELIGE la ficha: nada se asigna por nombre.
 * Una solicitud se engancha a una oportunidad ABIERTA del cliente (se apunta su nº); el resto, a la ficha (nota, sin
 * tareas). Si el puerto dice que no, se dice por qué y la fila queda como estaba.
 */
export default function AsignarCorreo({ fila, onHecho, onCancelar }: {
  fila: CorreoCompania
  onHecho: (cliente: ClienteElegido, resumen: string) => void
  onCancelar: () => void
}) {
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)
  const [ops, setOps] = useState<Ops | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const solicitud = fila.tipo === 'solicitud'

  // Las oportunidades se piden al elegir cliente (solo para una solicitud); `elegir` deja el estado en «cargando».
  function elegir(c: ClienteElegido | null) {
    setCliente(c)
    setOps(c && solicitud ? { fase: 'cargando' } : null)
  }

  useEffect(() => {
    if (!cliente || !solicitud) return
    let vivo = true
    fetch(`/api/correduria/oportunidad?clienteId=${encodeURIComponent(cliente.clienteId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const lista = abiertasDe(await r.json().catch(() => null))
        if (vivo) setOps(lista ? { fase: 'ok', abiertas: lista } : { fase: 'error', texto: 'No se han podido leer sus oportunidades. Reintenta.' })
      })
      .catch(() => { if (vivo) setOps({ fase: 'error', texto: 'No se han podido leer sus oportunidades (sin conexión).' }) })
    return () => { vivo = false }
  }, [cliente, solicitud])

  async function asignar(oportunidadId: string | null) {
    if (!cliente) return
    setEnviando(true)
    setFallo(null)
    try {
      const r = await fetch('/api/correduria/correos-compania', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'asignar', id: fila.id, clienteId: cliente.clienteId, oportunidadId }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; resumen?: string; motivo?: string } | null
      if (r.status === 200 && j?.estado === 'ok') onHecho(cliente, j.resumen ?? 'asignado a mano')
      else setFallo(`No se ha asignado: ${j?.motivo ?? `respuesta ${r.status}`}. Sigue como estaba.`)
    } catch {
      setFallo('No se ha asignado (sin conexión). Sigue como estaba.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      {fila.sugerencia
        ? <p style={NOTA}>Sugerencia por el asunto: <strong>«{fila.sugerencia}»</strong>. Comprueba que es esa persona antes de elegir.</p>
        : <p style={NOTA}>El asunto no trae un nombre reconocible: busca la ficha por nombre, NIF, póliza o matrícula.</p>}
      {!cliente
        ? <SelectorCliente inicial={fila.sugerencia} onSelect={elegir} />
        : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>Cliente: <strong>{cliente.nombre}</strong></span>
            <button type="button" disabled={enviando} onClick={() => elegir(null)} style={BTN}>Cambiar</button>
          </div>
        )}
      {cliente && !solicitud && (
        <div>
          <button type="button" disabled={enviando} onClick={() => void asignar(null)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
            {enviando ? 'Asignando…' : `Asignar a ${cliente.nombre}`}
          </button>
          <p style={{ ...NOTA, marginTop: 6 }}>Queda anotado en su ficha (sin tareas): revisa tú si hace falta alguna.</p>
        </div>
      )}
      {cliente && solicitud && ops?.fase === 'cargando' && <p aria-live="polite" style={NOTA}>Cargando sus oportunidades…</p>}
      {cliente && solicitud && ops?.fase === 'error' && <p role="alert" style={{ ...NOTA, color: 'var(--negative)' }}>{ops.texto}</p>}
      {cliente && solicitud && ops?.fase === 'ok' && (ops.abiertas.length === 0
        ? (
          <p style={NOTA}>
            No tiene oportunidades abiertas: ábrela en <Link href={`/correduria/cliente/${cliente.clienteId}`} style={{ color: 'var(--primary)' }}>su ficha</Link> y vuelve a asignar la solicitud.
          </p>
        )
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
            <span style={{ fontSize: 13 }}>¿En qué oportunidad está la solicitud {fila.clave}?</span>
            {ops.abiertas.slice(0, 20).map((o) => (
              <button key={o.id} type="button" disabled={enviando} onClick={() => void asignar(o.id)}
                style={{ ...BTN, justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere' }}>
                {enviando ? 'Asignando…' : `${o.ramo ?? 'Sin ramo'} · ${o.estado.replace(/_/g, ' ')}`}
              </button>
            ))}
          </div>
        ))}
      {fallo && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{fallo}</p>}
      <div>
        <button type="button" disabled={enviando} onClick={onCancelar} style={BTN}>Cancelar</button>
      </div>
    </div>
  )
}

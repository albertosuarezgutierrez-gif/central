'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { etiquetaActividad, riesgoActividad, type EmbudoPortal, type EventoActividad } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { interpretarActividad } from '@/lib/actividad-asegura'
import type { VistaIngesta } from '@/lib/correduria/ingesta-pantalla'
import { agregarContadores, type Contador, type Destino } from './secciones'
import { lineaEstadoIngesta, sinInvitar } from './hoy-cockpit'
import Aprobaciones from './Aprobaciones'
import Anulaciones from './Anulaciones'
import CartasMediador from './CartasMediador'
import BajasPue from './BajasPue'
import OportunidadesPatrimonio from './OportunidadesPatrimonio'

/**
 * El cockpit de «Gestión» (antes «Hoy»; pieza 1-4 de ASegura OS). Desde el 13/10/2026 NO lleva la franja de
 * cuatro contadores, ni las tareas de hoy, ni las pérdidas de cartera: viven en «Mi mesa»
 * (`/correduria/mesa`). Aquí queda el estado de la ingesta, lo que espera tu OK, anulaciones, cartas, bajas
 * PUE y lo que han hecho los clientes en el portal. Las incidencias NO se repintan aquí: son los bloques de
 * siempre, justo debajo (`#incidencias`).
 *
 * Todo número tiene tres estados: `undefined` = cargando (no se pinta),
 * `null` = no se ha podido mirar («!», nunca 0) y el número.
 */

type N = number | null | undefined
const MOSTRAR_PORTAL = 3

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}
function hora(iso: string): string {
  const d = new Date(iso)
  const hoy = hoyMadrid()
  const dia = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const hh = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
  return dia === hoy ? hh : `ayer ${hh}`
}
/** Un contador agregado: «n+» si alguna cola no se pudo leer (es un SUELO, no el total). */
function cifraC(c: Contador | null | undefined): string {
  return c === undefined ? '…' : c === null ? '!' : `${c.n}${c.parcial ? '+' : ''}`
}

export default function HoyCockpit({
  ingesta, nIncidencias, nBlog, onIr,
}: {
  ingesta: VistaIngesta | null
  /** Todas las colas de los bloques de debajo (las mismas que el badge de la pestaña). */
  nIncidencias: Contador | null | undefined
  nBlog: N
  onIr: (s: Destino) => void
}) {
  const [portal, setPortal] = useState<{ eventos: EventoActividad[]; embudo: EmbudoPortal } | null | undefined>(undefined)
  const [nAprobaciones, setNAprobaciones] = useState<N>(undefined)
  const [nBajasPue, setNBajasPue] = useState<N>(undefined)
  // El bloque del portal va PLEGADO y se lee al abrirlo: es la consulta más pesada de Gestión
  // (feed + embudo) y no pide ninguna acción; lo accionable ya llega por Telegram y por las colas.
  const [verPortal, setVerPortal] = useState(false)

  useEffect(() => {
    if (!verPortal) return
    fetch('/api/correduria/actividad?quien=cliente&dias=1')
      .then(async r => interpretarActividad(await r.json().catch(() => null)))
      .then(a => setPortal(a.ok ? { eventos: a.eventos, embudo: a.embudo } : null))
      .catch(() => setPortal(null))
  }, [verPortal])

  const nOk = nBlog === undefined || nAprobaciones === undefined || nBajasPue === undefined ? undefined : agregarContadores([nBlog, nAprobaciones, nBajasPue])
  const estado = lineaEstadoIngesta(ingesta)
  const colorEstado = estado.tono === 'ok' ? 'var(--positive)' : estado.tono === 'malo' ? 'var(--negative)' : estado.tono === 'aviso' ? 'var(--warning)' : 'var(--muted)'
  const pendInvitar = portal ? sinInvitar(portal.embudo) : null

  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr)', marginBottom: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: colorEstado }} />
        {estado.texto}
        {estado.tono !== 'ok' && estado.tono !== 'cargando' && (
          <button type="button" onClick={() => onIr('ingesta')} style={{ ...btnStyle('sutil', 'sm'), padding: '0 6px', minHeight: 44 }}>Ver</button>
        )}
      </span>

      <Anulaciones />
      <CartasMediador />
      <BajasPue onContador={setNBajasPue} />
      <OportunidadesPatrimonio />

      {/* ── Esperan tu OK ─────────────────────────────────────────── */}
      <section id="esperan-ok" style={{ display: 'grid', gap: 6 }}>
        <h2 style={TITULO}>Esperan tu OK{nOk && nOk.n > 0 ? ` · ${cifraC(nOk)}` : ''}</h2>
        <Aprobaciones onContador={setNAprobaciones} />
        <FilaOk n={nBlog} titulo="Artículos del blog" sub="Escritos y pendientes de publicar." onClick={() => onIr('redes')} />
        {nOk && nOk.n === 0 && !nOk.parcial && <p style={NOTA}>Nada esperando tu OK.</p>}
        {nOk === null && <p style={{ ...NOTA, color: 'var(--negative)' }}>No se ha podido comprobar qué espera tu OK. No significa que no haya nada.</p>}
      </section>

      {/* ── Clientes en el portal ─────────────────────────────────── */}
      <details onToggle={(e) => { if (e.currentTarget.open) setVerPortal(true) }} style={{ display: 'grid', gap: 6 }}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'list-item' }}>
          <h2 style={{ ...TITULO, display: 'inline' }}>Clientes en el portal · 24 h</h2>
        </summary>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => onIr('actividad')} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Todo</button>
        </div>
        {verPortal && portal === undefined && <p style={NOTA}>Cargando…</p>}
        {portal === null && <p style={{ ...NOTA, color: 'var(--negative)' }}>No se ha podido leer la actividad del portal. No significa que no haya.</p>}
        {portal && portal.eventos.length === 0 && <p style={NOTA}>Ningún cliente ha hecho nada en el portal en las últimas 24 h.</p>}
        {portal && portal.eventos.slice(0, MOSTRAR_PORTAL).map(e => {
          const riesgo = riesgoActividad(e.tipo)
          const quien = e.cliente ?? 'Un cliente sin ficha'
          const fila = (
            <span style={{ display: 'grid', gap: 2 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
                <span>{quien} · {etiquetaActividad(e.tipo)}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{hora(e.fecha)}</span>
              </span>
              {riesgo && <span style={{ fontSize: 12, color: 'var(--warning)' }}>{riesgo}</span>}
            </span>
          )
          return e.clienteId
            ? <Link key={e.id} href={`/correduria/cliente/${e.clienteId}`} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none', minHeight: 44, display: 'grid', alignItems: 'center' }}>{fila}</Link>
            : <div key={e.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>{fila}</div>
        })}
        {portal && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Portal activo: {portal.embudo.hanEntrado ?? '—'} de {portal.embudo.clientes ?? '—'} clientes han entrado
            {pendInvitar !== null ? ` · ${pendInvitar} con correo sin invitar` : ''}. Esto mismo te llega por Telegram.
          </span>
        )}
        </div>
      </details>

      {/* Las incidencias son los bloques de siempre, justo debajo. */}
      <h2 id="incidencias" style={TITULO}>Avisos{nIncidencias !== undefined && (nIncidencias === null || nIncidencias.n > 0) ? ` · ${cifraC(nIncidencias)}` : ''}</h2>
    </div>
  )
}

function FilaOk({ n, titulo, sub, onClick }: { n: N; titulo: string; sub: string; onClick: () => void }) {
  if (n === 0 || n === undefined) return null
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
      <span style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
      </span>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{n === null ? '!' : n} ›</span>
    </button>
  )
}

const TITULO: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }
const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }

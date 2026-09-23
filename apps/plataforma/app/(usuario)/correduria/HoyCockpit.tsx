'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Phone } from 'lucide-react'
import { etiquetaActividad, riesgoActividad, type EmbudoPortal, type EventoActividad } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { interpretarActividad } from '@/lib/actividad-asegura'
import { colaLlamadas, TIPOS_TAREA_UI, type LeadsVencimientos, type TareasDeHoy } from '@/lib/seguimiento-asegura'
import type { VistaIngesta } from '@/lib/correduria/ingesta-pantalla'
import { agregarContadores, type Contador, type Seccion } from './secciones'
import { cuandoTarea, lineaEstadoIngesta, sinInvitar } from './hoy-cockpit'

/**
 * El cockpit de «Hoy» (pieza 1-4 de ASegura OS, maqueta aprobada el
 * 23/09/2026): una franja con lo que hay que hacer y cuatro bloques —tareas de
 * hoy, lo que espera tu OK, incidencias y lo que han hecho los clientes en el
 * portal—. Las incidencias NO se repintan aquí: son los bloques de siempre,
 * justo debajo (`#incidencias`); la franja solo las cuenta.
 *
 * Todo número tiene tres estados: `undefined` = cargando (no se pinta),
 * `null` = no se ha podido mirar («!», nunca 0) y el número.
 */

type N = number | null | undefined
const MOSTRAR_TAREAS = 5
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
function cifra(n: N): string {
  return n === undefined ? '…' : n === null ? '!' : String(n)
}
/** Un contador agregado: «n+» si alguna cola no se pudo leer (es un SUELO, no el total). */
function cifraC(c: Contador | null | undefined): string {
  return c === undefined ? '…' : c === null ? '!' : `${c.n}${c.parcial ? '+' : ''}`
}

export default function HoyCockpit({
  ingesta, nIncidencias, nRecaptacion, nBlog, onIr, onContadorTareas,
}: {
  ingesta: VistaIngesta | null
  /** Partes + supresiones + recibos + sustituciones, ya agregado por la pantalla. */
  nIncidencias: Contador | null | undefined
  nRecaptacion: N
  nBlog: N
  onIr: (s: Seccion) => void
  onContadorTareas: (n: number | null) => void
}) {
  const [tareas, setTareas] = useState<TareasDeHoy | null>(null)
  const [llamadas, setLlamadas] = useState<N>(undefined)
  const [portal, setPortal] = useState<{ eventos: EventoActividad[]; embudo: EmbudoPortal } | null | undefined>(undefined)
  const [verTodas, setVerTodas] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargarTareas = useCallback(() => {
    fetch('/api/correduria/tareas-hoy')
      .then(r => (r.ok ? r.json() : { estado: 'error', motivo: `HTTP ${r.status}` }))
      .then((d: TareasDeHoy) => {
        setTareas(d)
        onContadorTareas(d.estado === 'ok' ? d.tareas.length : null)
      })
      .catch(() => { setTareas({ estado: 'error', motivo: 'red' }); onContadorTareas(null) })
  }, [onContadorTareas])

  useEffect(() => {
    cargarTareas()
    fetch('/api/correduria/leads-competencia?dias=90')
      .then(r => (r.ok ? r.json() : null))
      .then((d: LeadsVencimientos | null) => setLlamadas(d?.estado === 'ok' ? colaLlamadas(d.leads).length : null))
      .catch(() => setLlamadas(null))
    fetch('/api/correduria/actividad?quien=cliente&dias=1')
      .then(async r => interpretarActividad(await r.json().catch(() => null)))
      .then(a => setPortal(a.ok ? { eventos: a.eventos, embudo: a.embudo } : null))
      .catch(() => setPortal(null))
  }, [cargarTareas])

  async function cerrar(id: string) {
    setOcupado(id)
    setError(null)
    try {
      const r = await fetch('/api/correduria/oportunidad/tarea', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tareaId: id }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (r.ok && j?.estado === 'ok') cargarTareas()
      else if (r.status === 502 || j?.motivo === 'red') setError('No se ha podido confirmar si se cerró: recarga antes de repetirlo.')
      else setError(j?.motivo ?? `No se ha podido cerrar (HTTP ${r.status}).`)
    } catch {
      setError('No se ha podido confirmar si se cerró: recarga antes de repetirlo.')
    } finally {
      setOcupado(null)
    }
  }

  const hoy = hoyMadrid()
  const nTareas: N = tareas === null ? undefined : tareas.estado === 'ok' ? tareas.tareas.length : null
  const nOk = nRecaptacion === undefined || nBlog === undefined ? undefined : agregarContadores([nRecaptacion, nBlog])
  const estado = lineaEstadoIngesta(ingesta)
  const colorEstado = estado.tono === 'ok' ? 'var(--positive)' : estado.tono === 'malo' ? 'var(--negative)' : estado.tono === 'aviso' ? 'var(--warning)' : 'var(--muted)'
  const vencidas = tareas?.estado === 'ok' ? tareas.tareas.filter(t => cuandoTarea(t.fechaLimite, hoy).vencida).length : 0
  const rotuloTipo = (t: string) => TIPOS_TAREA_UI.find(x => x.valor === t)?.rotulo ?? t
  const pendInvitar = portal ? sinInvitar(portal.embudo) : null

  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr)', marginBottom: 8 }}>
      {/* ── Franja ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Link href="/correduria/vencimientos/llamada" style={{ ...CELDA, background: 'var(--primary)', color: '#fff', textDecoration: 'none' }}>
          <span style={NUM}>{cifra(llamadas)}</span>
          <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Phone size={14} strokeWidth={1.75} aria-hidden /> llamadas hoy ›</span>
        </Link>
        <a href="#tareas-hoy" style={{ ...CELDA, textDecoration: 'none', color: 'var(--text)' }}>
          <span style={NUM}>{cifra(nTareas)}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>tareas de hoy{vencidas > 0 ? ` · ${vencidas} vencida(s)` : ''}</span>
        </a>
        <a href="#esperan-ok" style={{ ...CELDA, textDecoration: 'none', color: 'var(--text)' }}>
          <span style={NUM}>{cifraC(nOk)}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>esperan tu OK</span>
        </a>
        <a href="#incidencias" style={{ ...CELDA, textDecoration: 'none', color: nIncidencias && nIncidencias.n > 0 ? 'var(--negative)' : 'var(--text)' }}>
          <span style={NUM}>{cifraC(nIncidencias)}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>incidencias</span>
        </a>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: colorEstado }} />
        {estado.texto}
        {estado.tono !== 'ok' && estado.tono !== 'cargando' && (
          <button type="button" onClick={() => onIr('ingesta')} style={{ ...btnStyle('sutil', 'sm'), padding: '0 6px' }}>Ver</button>
        )}
      </span>

      {/* ── Tareas de hoy ─────────────────────────────────────────── */}
      <section id="tareas-hoy" style={{ display: 'grid', gap: 6 }}>
        <h2 style={TITULO}>Tareas de hoy{nTareas ? ` · ${nTareas}` : ''}</h2>
        {tareas === null && <p style={NOTA}>Cargando tareas…</p>}
        {tareas?.estado === 'sin_configurar' && <p style={NOTA}>No se pueden leer: falta conectar el puerto con central-asegura. No significa que no haya.</p>}
        {tareas?.estado === 'error' && <p style={{ ...NOTA, color: 'var(--negative)' }}>No se han podido leer las tareas ({tareas.motivo}). No significa que no haya.</p>}
        {tareas?.estado === 'ok' && tareas.tareas.length === 0 && (
          <p style={NOTA}>Nada con fecha para hoy. Las llamadas de la lista salen en «llamadas hoy».</p>
        )}
        {tareas?.estado === 'ok' && (verTodas ? tareas.tareas : tareas.tareas.slice(0, MOSTRAR_TAREAS)).map(t => {
          const c = cuandoTarea(t.fechaLimite, hoy)
          return (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <button type="button" disabled={ocupado !== null} onClick={() => void cerrar(t.id)} aria-label={`Marcar hecha: ${t.observaciones}`} title="Marcar hecha" style={{ ...btnStyle('secundario'), width: 44, padding: 0 }}>
                <Check size={18} strokeWidth={1.75} />
              </button>
              <Link href={`/correduria/oportunidad/${t.oportunidadId}`} style={{ display: 'grid', gap: 2, minWidth: 0, color: 'var(--text)', textDecoration: 'none' }}>
                <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{rotuloTipo(t.tipo)} · {t.observaciones.split('\n')[0] || '(sin descripción)'}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {t.cliente ?? '(ficha sin nombre)'}{t.ramo ? ` · ${t.ramo}` : ''}{t.prioridad === 'alta' ? ' · prioridad alta' : ''}
                </span>
              </Link>
              <span style={{ fontSize: 13, fontWeight: 600, color: c.vencida ? 'var(--negative)' : 'var(--text)' }}>{c.texto}</span>
            </div>
          )
        })}
        {tareas?.estado === 'ok' && tareas.tareas.length > MOSTRAR_TAREAS && (
          <button type="button" onClick={() => setVerTodas(v => !v)} style={{ ...btnStyle('sutil'), justifySelf: 'start' }}>
            {verTodas ? 'Ver menos' : `Ver las ${tareas.tareas.length - MOSTRAR_TAREAS} restantes`}
          </button>
        )}
        {tareas?.estado === 'ok' && tareas.truncado && <p style={NOTA}>⚠️ Hay más tareas de las que se ven: la lista llegó recortada.</p>}
        {tareas?.estado === 'ok' && tareas.descartadas > 0 && <p style={NOTA}>{tareas.descartadas} tarea(s) no se han podido leer y no se muestran.</p>}
        {error && <p role="alert" style={{ ...NOTA, color: 'var(--negative)' }}>{error}</p>}
      </section>

      {/* ── Esperan tu OK ─────────────────────────────────────────── */}
      <section id="esperan-ok" style={{ display: 'grid', gap: 6 }}>
        <h2 style={TITULO}>Esperan tu OK{nOk && nOk.n > 0 ? ` · ${cifraC(nOk)}` : ''}</h2>
        <FilaOk n={nRecaptacion} titulo="Leads para recaptar" sub="Correo solo a quien fue cliente (LSSI 21.2); tú decides a quién se envía." onClick={() => onIr('clientes')} />
        <FilaOk n={nBlog} titulo="Artículos del blog" sub="Escritos y pendientes de publicar." onClick={() => onIr('redes')} />
        {nOk && nOk.n === 0 && !nOk.parcial && <p style={NOTA}>Nada esperando tu OK.</p>}
        {nOk === null && <p style={{ ...NOTA, color: 'var(--negative)' }}>No se ha podido comprobar qué espera tu OK. No significa que no haya nada.</p>}
      </section>

      {/* ── Clientes en el portal ─────────────────────────────────── */}
      <section style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 style={TITULO}>Clientes en el portal · 24 h</h2>
          <button type="button" onClick={() => onIr('actividad')} style={btnStyle('sutil', 'sm')}>Todo</button>
        </div>
        {portal === undefined && <p style={NOTA}>Cargando…</p>}
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
      </section>

      {/* Las incidencias son los bloques de siempre, justo debajo. */}
      <h2 id="incidencias" style={TITULO}>Incidencias{nIncidencias !== undefined && (nIncidencias === null || nIncidencias.n > 0) ? ` · ${cifraC(nIncidencias)}` : ''}</h2>
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

const CELDA: React.CSSProperties = { display: 'grid', gap: 2, padding: '12px 14px', minHeight: 44, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)' }
const NUM: React.CSSProperties = { fontSize: 24, fontWeight: 800, lineHeight: 1.1 }
const TITULO: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }
const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }

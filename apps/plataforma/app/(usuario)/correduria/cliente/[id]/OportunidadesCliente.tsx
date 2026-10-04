'use client'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  RAMOS_OPORTUNIDAD_UI,
  ROTULO_ESTADO,
  TIPOS_TAREA_UI,
  interpretarOportunidadesCliente,
  parsearPrima,
  primaParaCampo,
  rotuloMotivo,
  rotuloRamo,
  textoAltaOportunidad,
  type LecturaDocumentoOportunidad,
  type OportunidadDeCliente,
  type OportunidadesCliente as Lectura,
} from '@/lib/seguimiento-asegura'
import type { PrecargaAlta } from '@/lib/correduria/seguros-cliente'
import { rutaSinOportunidad, textoPresupuestos, textoSinOportunidad, type PresupuestoSinOportunidad } from '@/lib/correduria/presupuestos-oportunidad'
import type { SeguroAnterior } from '@central/module-seguros'
import { vistaCompetencia } from '@/lib/correduria/competencia-oportunidad'
import { AvisoFechaDudosa, fmt } from './piezas'
import SeguimientoOportunidad from './SeguimientoOportunidad'
import { AvisosLectura, useLeerPoliza } from '../../LeerPoliza'

/**
 * Las oportunidades de ESTE cliente, en su ficha (Fase 1 del rediseño, 24/09/2026). Hasta hoy solo
 * se veían desde Vencimientos u «Hoy», y abrir una a mano no existía: «Presupuestar» lleva a
 * tarificar, que no es lo mismo que «le interesa, llámale el jueves».
 *
 * - Abrir: nace con su PRIMER PASO (tipo + fecha), o no nace. Si ya hay una abierta del mismo
 *   ramo, asegura no abre otra y aquí se enlaza la que hay.
 * - Corregir: ramo, vencimiento, compañía y prima de una ABIERTA. El estado va por sus acciones
 *   (en «Gestionar ▾», que despliega su seguimiento aquí mismo), que exigen motivo.
 * - Ganar: con la póliza que se emitió, elegida de las suyas; sin póliza también vale (aún no ha
 *   entrado por CIMA), y se dice.
 * - Descartar: abierta por error o duplicada. NO se borra (el historial la referencia) ni cuenta
 *   como venta perdida.
 *
 * Tres estados: lista vacía = «no tiene»; fallo de lectura = «no se ha podido mirar», nunca «no tiene».
 */
type Poliza = { id: string; etiqueta: string }

const campo: React.CSSProperties = {
  minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%', boxSizing: 'border-box',
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }
const rejilla: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))' }

function manana(): string {
  const d = new Date(Date.now() + 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

async function enviar(body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  try {
    const res = await fetch('/api/correduria/oportunidad', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 0, json: { motivo: 'sin conexión' } }
  }
}

function motivoDe(json: unknown, status: number): string {
  const o = json as { motivo?: unknown } | null
  return typeof o?.motivo === 'string' ? o.motivo : `HTTP ${status}`
}

export default function OportunidadesCliente({ clienteId, telefono = null, polizas, precargas = {} }: {
  clienteId: string; telefono?: string | null; polizas: Poliza[]
  /** Por id de póliza del volcado: con qué se precarga el alta al crear la oportunidad desde su fila. */
  precargas?: Record<string, PrecargaAlta>
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  // De qué fila del volcado nace el alta abierta (`?desde=<polizaId>`), si nace de una.
  const [desde, setDesde] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; id?: string | null } | null>(null)
  const [verCerradas, setVerCerradas] = useState(false)
  // La oportunidad desplegada. Se gestiona aquí mismo (25/09/2026): la página aparte
  // `/correduria/oportunidad/<id>` solo redirige a la ficha con `?op=<id>`.
  const [desplegada, setDesplegada] = useState<string | null>(null)
  const alternar = (id: string) => setDesplegada(d => (d === id ? null : id))

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/correduria/oportunidad?clienteId=${encodeURIComponent(clienteId)}`)
      setLectura(interpretarOportunidadesCliente(res.status, await res.json().catch(() => null)))
    } catch {
      setLectura({ estado: 'error', motivo: 'sin conexión' })
    }
  }, [clienteId])

  useEffect(() => { void cargar() }, [cargar])

  // La única puerta para abrir una es el menú «➕ Nueva oportunidad ▾» de la cabecera; su opción
  // «sin precio» llega aquí con `?oportunidad=nueva`. Con useSearchParams y no leyendo
  // `window.location` una vez: si ya estás en la ficha, el enlace es una navegación suave que NO
  // remonta este componente, y un efecto de montaje no se enteraría.
  const params = useSearchParams()
  const pideNueva = params.get('oportunidad') === 'nueva'
  const pideDesde = params.get('desde')
  useEffect(() => {
    if (!pideNueva) return
    setAviso(null)
    setDesde(pideDesde && precargas[pideDesde] ? pideDesde : null)
    setAbriendo(true)
    document.getElementById('oportunidades')?.scrollIntoView({ block: 'start' })
    // Se quita el parámetro: si se quedara, un segundo clic en el menú no cambiaría la URL
    // y el formulario ya cerrado no volvería a abrirse.
    const url = new URL(window.location.href)
    url.searchParams.delete('oportunidad')
    url.searchParams.delete('desde')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [pideNueva])

  // `?op=<id>` (desde Vencimientos, «Hoy», la tarjeta del seguro…) la deja desplegada.
  const pideOp = useSearchParams().get('op')
  useEffect(() => { if (pideOp) setDesplegada(pideOp) }, [pideOp])
  const cerradaPedida = lectura?.estado === 'ok' && pideOp !== null && lectura.oportunidades.some(o => o.id === pideOp && (o.estado === 'ganada' || o.estado === 'perdida'))
  useEffect(() => { if (cerradaPedida) setVerCerradas(true) }, [cerradaPedida])
  const listo = lectura?.estado === 'ok'
  useEffect(() => {
    if (listo && pideOp) document.getElementById(`op-${pideOp}`)?.scrollIntoView({ block: 'start' })
  }, [listo, pideOp, verCerradas])

  const abiertas = lectura?.estado === 'ok' ? lectura.oportunidades.filter(o => o.estado !== 'ganada' && o.estado !== 'perdida') : []
  const cerradas = lectura?.estado === 'ok' ? lectura.oportunidades.filter(o => o.estado === 'ganada' || o.estado === 'perdida') : []

  return (
    <div id="oportunidades" style={{ display: 'grid', gap: 10, fontSize: 13, scrollMarginTop: 80 }}>
      {aviso && (
        <div role="status" style={{ color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>
          {aviso.texto}
          {aviso.id && <> <button type="button" onClick={() => setDesplegada(aviso.id ?? null)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>abrir →</button></>}
        </div>
      )}

      {lectura === null && <div style={{ color: 'var(--muted)' }}>Cargando oportunidades…</div>}
      {lectura?.estado === 'sin_configurar' && <div style={{ color: 'var(--muted)' }}>La cartera no está conectada: no se pueden mirar las oportunidades.</div>}
      {lectura?.estado === 'error' && (
        <div style={{ color: 'var(--negative)' }}>
          No se han podido leer las oportunidades ({lectura.motivo}): eso no quiere decir que no tenga.{' '}
          <button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Reintentar</button>
        </div>
      )}

      {lectura?.estado === 'ok' && (
        <>
          {abiertas.length === 0 && !abriendo && <div style={{ color: 'var(--muted)' }}>Ninguna oportunidad abierta. Se abre desde «+ Nueva oportunidad ▾», arriba.</div>}
          {abiertas.map(o => (
            <FilaAbierta key={o.id} o={o} polizas={polizas} telefono={telefono} desplegada={desplegada === o.id} onAlternar={() => alternar(o.id)} onRecargar={() => void cargar()} onHecho={(t) => { setAviso(t); void cargar() }} />
          ))}
          {lectura.descartadas > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{lectura.descartadas} oportunidad(es) llegaron incompletas y no se pintan.</div>
          )}
          <SinOportunidad clienteId={clienteId} lista={lectura.sinOportunidad} />
          {cerradas.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerCerradas(v => !v)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                {verCerradas ? 'Ocultar' : 'Ver'} cerradas ({cerradas.length}{lectura.truncado ? '+' : ''})
              </button>
              {verCerradas && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 6 }}>
                  {cerradas.map(o => <FilaCerrada key={o.id} o={o} desplegada={desplegada === o.id} onAlternar={() => alternar(o.id)} onRecargar={() => void cargar()} />)}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {abriendo && (
        <FormAlta
          key={desde ?? 'nueva'}
          clienteId={clienteId}
          precarga={desde ? precargas[desde] ?? null : null}
          onCancelar={() => setAbriendo(false)}
          onHecho={(t) => { setAviso(t); if (t.ok) setAbriendo(false); void cargar() }}
          onRecargar={() => void cargar()}
        />
      )}
    </div>
  )
}

/**
 * Lo tarificado que no cuelga de ninguna oportunidad (anterior al 24/09/2026, cuando aún no se
 * enlazaba solo). Va en la misma lista para que no haya precios en un bloque aparte; no se les abre
 * oportunidad a posteriori, que crearía tareas con semanas de retraso. `undefined` = asegura aún no
 * lo manda (no se pinta nada); `null` = no se pudo leer (se dice).
 */
function SinOportunidad({ clienteId, lista }: { clienteId: string; lista: PresupuestoSinOportunidad[] | null | undefined }) {
  const [ver, setVer] = useState(false)
  if (lista === undefined || (lista !== null && lista.length === 0)) return null
  if (lista === null) return <div style={{ color: 'var(--muted)' }}>No se han podido mirar los presupuestos sin oportunidad: eso no quiere decir que no haya.</div>
  return (
    <div>
      <button type="button" onClick={() => setVer(v => !v)} aria-expanded={ver} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
        {ver ? 'Ocultar' : 'Ver'} presupuestos sin oportunidad ({lista.length})
      </button>
      {ver && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 6 }}>
          {lista.map(p => {
            const ruta = rutaSinOportunidad(clienteId, p)
            return (
              <li key={p.tarificacionId} style={{ borderTop: '1px solid var(--border)', paddingTop: 6, overflowWrap: 'anywhere' }}>
                <b>{rotuloRamo(p.ramo)}</b> <span style={{ color: 'var(--muted)' }}>{fmt(p.creadoAt.slice(0, 10))}</span>
                <div>{textoSinOportunidad(p)}</div>
                {ruta && <a href={ruta} style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Abrir →</a>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Resumen({ o }: { o: OportunidadDeCliente }) {
  const partes: string[] = []
  // Dos oportunidades de auto del mismo cliente se distinguen por el coche.
  const coche = [o.vehiculo, o.matricula].filter(Boolean).join(' ')
  if (coche) partes.push(coche)
  if (o.aseguradora) partes.push(`con ${o.aseguradora}`)
  if (o.prima !== null) partes.push(eur(o.prima))
  // Aviso a 45 días (03/10/2026): sin vencimiento NO se avisa y se dice; con él, cuándo suena.
  const v = vistaCompetencia({ seguroAnterior: o.seguroAnterior, prima: o.prima, fechaFinVigencia: o.fechaFinVigencia, hoy: hoyMadrid() })
  if (o.fechaFinVigencia && v.aviso.estado === 'desconocido') partes.push(`vence ${fmt(o.fechaFinVigencia)} (fecha ilegible)`)
  else if (!o.fechaFinVigencia) partes.push('vencimiento desconocido: no se avisa (tampoco entra en Vencimientos)')
  else partes.push(`vence ${fmt(o.fechaFinVigencia)}`)
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', overflowWrap: 'anywhere' }}>{partes.join(' · ')}</span>
      {o.fechaFinVigencia && v.aviso.estado !== 'desconocido' && (
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{v.aviso.texto}</span>
      )}
      {v.etiquetaPrioritaria && (
        <span style={{ justifySelf: 'start', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning)', overflowWrap: 'anywhere' }}>
          ★ {v.etiquetaPrioritaria}
        </span>
      )}
    </div>
  )
}

function FilaAbierta({ o, telefono, polizas, desplegada, onAlternar, onRecargar, onHecho }: {
  o: OportunidadDeCliente
  telefono: string | null
  polizas: Poliza[]
  desplegada: boolean
  onAlternar: () => void
  onRecargar: () => void
  onHecho: (t: { ok: boolean; texto: string }) => void
}) {
  const [modo, setModo] = useState<null | 'editar' | 'ganar' | 'descartar'>(null)
  const [ocupado, setOcupado] = useState(false)
  const [polizaGanada, setPolizaGanada] = useState('')
  const [motivoDescarte, setMotivoDescarte] = useState('')
  const aparcada = o.aparcadaHasta !== null && o.aparcadaHasta > hoyMadrid()
  const vencida = o.proximaTarea !== null && o.proximaTarea.fechaLimite < hoyMadrid()
  const puedeGanar = o.estado === 'en_negociacion' || o.estado === 'pendiente_cliente'

  async function accion(body: Record<string, unknown>, ok: string) {
    setOcupado(true)
    const r = await enviar({ id: o.id, ...body })
    setOcupado(false)
    if (r.status === 200) { setModo(null); onHecho({ ok: true, texto: ok }) }
    else onHecho({ ok: false, texto: `No se ha guardado: ${motivoDe(r.json, r.status)}` })
  }

  return (
    <div id={`op-${o.id}`} style={{ border: `1px solid ${desplegada ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: 10, display: 'grid', gap: 6, scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <button type="button" onClick={onAlternar} aria-expanded={desplegada} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, color: 'var(--primary)' }}>
          {desplegada ? '▾' : '▸'} {rotuloRamo(o.ramo)}
        </button>
        <span style={{ fontWeight: 600 }}>{ROTULO_ESTADO[o.estado]}</span>
        {aparcada && <span style={{ color: 'var(--muted)' }}>· aparcada hasta el {fmt(o.aparcadaHasta!)}</span>}
      </div>
      <Resumen o={o} />
      {o.presupuestos && <div>{textoPresupuestos(o.presupuestos)}</div>}
      {o.emision?.estado === 'riesgo_condicionado' && (
        <div style={{ color: 'var(--negative)', overflowWrap: 'anywhere' }}>
          <strong>⛔ Emitida · retenida por {o.emision.compania ?? 'la compañía'}</strong> · desde {fmt(o.emision.desde.slice(0, 10))}.
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>La póliza no está en vigor hasta que la compañía la libere; se comprueba sola dos veces al día.</div>
        </div>
      )}
      {o.emision?.estado === 'rechazada' && (
        <div style={{ color: 'var(--negative)', overflowWrap: 'anywhere' }}>
          <strong>⛔ Rechazada por la compañía</strong>{o.emision.compania ? ` (${o.emision.compania})` : ''} · desde {fmt(o.emision.desde.slice(0, 10))}.
        </div>
      )}
      <div style={{ color: o.proximaTarea === null || vencida ? 'var(--negative)' : 'var(--text)' }}>
        {o.proximaTarea === null
          ? (aparcada ? 'Sin paso pendiente (aparcada).' : 'Sin siguiente paso: nadie la va a mirar. Ponle una tarea en «Gestionar».')
          : `Siguiente: ${o.proximaTarea.tipo} el ${fmt(o.proximaTarea.fechaLimite)}${vencida ? ' (vencida)' : ''}`}
      </div>
      {/* UN botón por fila (26/09/2026, «muy poco clara y muy extensa»): Corregir,
          Ganada y Descartar viven dentro de «Gestionar», junto al seguimiento. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onAlternar} aria-expanded={desplegada} style={{ ...btnStyle(desplegada ? 'secundario' : 'primario', 'sm'), minHeight: 44 }}>
          {desplegada ? 'Plegar ▴' : 'Gestionar ▾'}
        </button>
        {/* El riesgo como pantalla (29/09/2026): intervinientes y presupuestos P1…Pn de ESTE riesgo. */}
        <a href={`/correduria/oportunidad/${encodeURIComponent(o.id)}`} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, color: 'var(--primary)', textDecoration: 'none' }}>
          Abrir riesgo →
        </a>
      </div>

      {desplegada && <SeguimientoOportunidad id={o.id} telefono={telefono} onCambio={onRecargar} />}

      {desplegada && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <button type="button" disabled={ocupado} onClick={() => setModo(modo === 'editar' ? null : 'editar')} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Corregir</button>
          {puedeGanar && (
            <button type="button" disabled={ocupado} onClick={() => setModo(modo === 'ganar' ? null : 'ganar')} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}><Trophy size={16} strokeWidth={1.75} aria-hidden /> Ganada</button>
          )}
          <button type="button" disabled={ocupado} onClick={() => setModo(modo === 'descartar' ? null : 'descartar')} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }} title="Abierta por error o duplicada. Si el cliente no quiere, usa «Perdida» arriba.">Descartar (error)</button>
        </div>
      )}

      {modo === 'editar' && (
        <FormEdicion o={o} onCancelar={() => setModo(null)} onHecho={(t) => { if (t.ok) setModo(null); onHecho(t) }} />
      )}

      {modo === 'ganar' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={etiqueta}>
            ¿Con qué póliza se ha ganado?
            <select value={polizaGanada} onChange={e => setPolizaGanada(e.target.value)} style={campo}>
              <option value="">Aún no ha entrado (se enlaza después)</option>
              {polizas.map(p => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}
              onClick={() => void accion(
                { accion: 'ganar', ...(polizaGanada ? { polizaGanadaId: polizaGanada } : {}) },
                polizaGanada ? 'Ganada y enlazada a su póliza. Sus tareas pendientes se han cerrado.' : 'Ganada, sin póliza enlazada todavía. Sus tareas pendientes se han cerrado.',
              )}>
              Confirmar ganada
            </button>
            <button type="button" onClick={() => setModo(null)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
          </div>
        </div>
      )}

      {modo === 'descartar' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: 'var(--muted)' }}>
            Solo si se abrió por error o está duplicada (no cuenta como perdida).
          </div>
          <label style={etiqueta}>
            Nota (opcional)
            <input value={motivoDescarte} onChange={e => setMotivoDescarte(e.target.value)} maxLength={500} style={campo} placeholder="p. ej. duplicada de la de hogar" />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}
              onClick={() => void accion({ accion: 'perder', motivo: 'error_alta', detalle: motivoDescarte }, 'Oportunidad descartada.')}>
              Confirmar descarte
            </button>
            <button type="button" onClick={() => setModo(null)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaCerrada({ o, desplegada, onAlternar, onRecargar }: { o: OportunidadDeCliente; desplegada: boolean; onAlternar: () => void; onRecargar: () => void }) {
  const cuando = o.cerradaAt ? fmt(o.cerradaAt.slice(0, 10)) : null
  const descartada = o.motivoPerdida === 'error_alta'
  return (
    <li id={`op-${o.id}`} style={{ borderTop: '1px solid var(--border)', paddingTop: 6, scrollMarginTop: 80 }}>
      <button type="button" onClick={onAlternar} aria-expanded={desplegada} style={{ all: 'unset', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>{desplegada ? '▾' : '▸'} {rotuloRamo(o.ramo)}</button>{' '}
      <b>{descartada ? 'Descartada' : ROTULO_ESTADO[o.estado]}</b>
      {cuando && <> el {cuando}</>}
      {o.estado === 'perdida' && !descartada && o.motivoPerdida && <span style={{ color: 'var(--muted)' }}> · {rotuloMotivo(o.motivoPerdida)}{o.competidor ? ` (${o.competidor})` : ''}</span>}
      {o.presupuestos && o.presupuestos.variantes > 0 && <span style={{ color: 'var(--muted)' }}> · {textoPresupuestos(o.presupuestos)}</span>}
      {' '}<a href={`/correduria/oportunidad/${encodeURIComponent(o.id)}`} style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Abrir riesgo →</a>
      {desplegada && <div style={{ marginTop: 8 }}><SeguimientoOportunidad id={o.id} onCambio={onRecargar} /></div>}
    </li>
  )
}

type LecturaOk = Extract<LecturaDocumentoOportunidad, { estado: 'ok' }>

/** El bonus leído, en una línea: lo que se va a guardar con la oportunidad. */
export function textoSeguroAnterior(s: SeguroAnterior): string {
  const partes: string[] = []
  if (s.aniosSinSiniestros !== null) partes.push(`${s.aniosSinSiniestros} años sin siniestros`)
  if (s.siniestrosUltimos5 !== null) partes.push(`${s.siniestrosUltimos5} siniestros en 5 años`)
  if (s.fechaEfecto !== null) partes.push(`efecto ${fmt(s.fechaEfecto)}`)
  if (s.codigoDgs !== null) partes.push(`DGS ${s.codigoDgs}`)
  return partes.join(' · ')
}

/**
 * `inicial` (29/09/2026): una lectura ya hecha (la póliza subida en Documentos) rellena el
 * formulario al abrirlo, sin volver a pagar la lectura.
 */
export function FormAlta({ clienteId, inicial, precarga = null, onCancelar, onHecho, onRecargar }: {
  clienteId: string
  inicial?: LecturaOk | null
  /** Crear desde una fila del volcado: vehículo/aseguradora, y el vencimiento SOLO si es futuro. */
  precarga?: PrecargaAlta | null
  onCancelar: () => void
  onHecho: (t: { ok: boolean; texto: string; id?: string | null }) => void
  /** Refresca la lista sin cerrar el formulario (el documento ya abrió la oportunidad por su cuenta). */
  onRecargar?: () => void
}) {
  const [ramo, setRamo] = useState(precarga?.ramo ?? '')
  const [estado, setEstado] = useState<'en_negociacion' | 'competencia'>(precarga ? 'competencia' : 'en_negociacion')
  const [vence, setVence] = useState(precarga?.fechaFinVigencia ?? '')
  const [compania, setCompania] = useState(precarga?.aseguradora ?? '')
  const [prima, setPrima] = useState('')
  const [tipoTarea, setTipoTarea] = useState('llamada')
  const [fechaTarea, setFechaTarea] = useState(manana())
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lectura, setLectura] = useState<{ ok: boolean; texto: string } | null>(null)
  // Lo leído que no tiene campo en el formulario pero se guarda con la oportunidad:
  // el nº de póliza (distingue dos seguros del mismo ramo), la moto y el bonus.
  const [leido, setLeido] = useState<Pick<LecturaOk, 'numeroPoliza' | 'matricula' | 'vehiculo' | 'seguroAnterior'> | null>(
    precarga ? { numeroPoliza: precarga.numeroPoliza, matricula: precarga.matricula, vehiculo: precarga.vehiculo, seguroAnterior: null } : null,
  )
  const fichero = useRef<HTMLInputElement>(null)
  const aplicado = useRef(false)

  // Lo leído RELLENA lo vacío y no pisa lo que Alberto ya ha tecleado: si él escribió
  // la prima que le dijo el cliente, esa manda sobre la del papel. La lectura (POST, helpers y
  // avisos de oportunidad/ficha) es la de `../../LeerPoliza`, la misma de «Subir póliza».
  // Viaja `clienteId` + `crear` (03/10/2026, como «Subir póliza»): el servidor abre la oportunidad en
  // la ficha del tomador y guarda el documento; si no la abre, el formulario se rellena como siempre.
  const lector = useLeerPoliza({ clienteId, crear: true, onLectura: l => aplicar(l) })
  const leyendo = lector.leyendo
  const abierta = lector.abierta
  // Una vez por lectura: la lista se refresca porque la oportunidad ya existe.
  useEffect(() => {
    if (abierta) onRecargar?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta])
  const lecturaVista = lector.motivoError !== null ? { ok: false, texto: `No se ha podido leer: ${lector.motivoError}. Rellénalo a mano.` } : lectura
  function leerDocumento(f: File) {
    setLectura(null)
    void lector.leer(f)
  }

  function aplicar(l: LecturaOk) {
    const puestos: string[] = []
    const respetados: string[] = []
    const poner = (nombre: string, valor: unknown, actual: string, fijar: () => void) => {
      if (valor === null) return
      if (actual.trim() === '') { fijar(); puestos.push(nombre) } else respetados.push(nombre)
    }
    poner('ramo', l.ramo, ramo, () => setRamo(l.ramo!))
    poner('vencimiento', l.vence, vence, () => setVence(l.vence!))
    poner('compañía', l.compania, compania, () => setCompania(l.compania!))
    poner('prima', l.prima, prima, () => setPrima(primaParaCampo(l.prima!)))
    setLeido({ numeroPoliza: l.numeroPoliza, matricula: l.matricula ?? null, vehiculo: l.vehiculo ?? null, seguroAnterior: l.seguroAnterior ?? null })
    if (l.numeroPoliza) puestos.push(`nº de póliza ${l.numeroPoliza}`)
    if (l.seguroAnterior) puestos.push(textoSeguroAnterior(l.seguroAnterior))
    setLectura({
      ok: true,
      texto: (puestos.length ? `Leído del documento: ${puestos.join(', ')}. Revísalo antes de abrir.` : 'El documento no añade nada a lo que ya habías escrito.')
        + (respetados.length ? ` No he tocado lo que ya habías escrito (${respetados.join(', ')}).` : ''),
    })
  }

  useEffect(() => {
    if (!inicial || aplicado.current) return
    aplicado.current = true
    aplicar(inicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!ramo) { setError('Elige el ramo.'); return }
    const p = parsearPrima(prima)
    if (p === 'invalido') { setError('La prima no es un importe válido (p. ej. 412,50).'); return }
    setOcupado(true)
    const r = await enviar({
      accion: 'crear', clienteId, ramo, estado,
      fechaFinVigencia: vence || null, aseguradora: compania, prima: p,
      tipoTarea, fechaTarea, nota,
      ...(leido ? { numeroPoliza: leido.numeroPoliza, matricula: leido.matricula, vehiculo: leido.vehiculo, seguroAnterior: leido.seguroAnterior } : {}),
    })
    setOcupado(false)
    const t = textoAltaOportunidad(r.status, r.json)
    if (!t.ok && r.status !== 409) { setError(t.texto); return }
    onHecho(t)
  }

  // La oportunidad ya está abierta: el formulario sobra (crearla otra vez la duplicaría) y se sustituye por lo que ha pasado.
  if (abierta) {
    const enEstaFicha = abierta.clienteId === clienteId
    return (
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
        <AvisosLectura oportunidad={lector.oportunidad} ficha={lector.ficha} sinGuardar={lector.sinGuardar} fichaIncierta={lector.fichaIncierta} figuras={lector.figuras} />
        {!enEstaFicha && (
          <div role="status" style={{ overflowWrap: 'anywhere' }}>
            La oportunidad está en {abierta.clienteId ? 'la ficha del tomador del documento' : 'otra ficha'}, no en esta: aquí no aparecerá en la lista.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {enEstaFicha && (
            <button type="button" onClick={() => onHecho({ ok: true, texto: lector.oportunidad?.texto ?? 'Oportunidad abierta desde el documento.', id: abierta.oportunidadId })} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
              Ver la oportunidad
            </button>
          )}
          <button type="button" onClick={onCancelar} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cerrar</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <input
          ref={fichero}
          type="file"
          accept="application/pdf,image/*"
          hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leerDocumento(f) }}
        />
        <button type="button" disabled={leyendo} onClick={() => fichero.current?.click()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, justifySelf: 'start' }}>
          {leyendo ? 'Leyendo el documento…' : 'Subir póliza, recibo o foto'}
        </button>
        {lecturaVista && <div role="status" style={{ color: lecturaVista.ok ? 'var(--positive)' : 'var(--negative)' }}>{lecturaVista.texto}</div>}
        {!lecturaVista && !leyendo && <div style={{ fontSize: 11, color: 'var(--muted)' }}>La IA lee ramo, compañía, vencimiento, prima y, en auto/moto, el bonus; abre la oportunidad sola y guarda el documento en la ficha del tomador.</div>}
        {/* Si no se abrió sola (error, ya es nuestra…), el aviso se enseña aquí y el formulario queda para abrirla a mano. */}
        <AvisosLectura oportunidad={lector.oportunidad} ficha={lector.ficha} sinGuardar={lector.sinGuardar} fichaIncierta={lector.fichaIncierta} figuras={lector.figuras} />
      </div>
      {/* Bloqueado mientras lee: lo leído solo rellena lo vacío, y eso se decide con lo que había al pulsar. */}
      <fieldset disabled={leyendo} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 10 }}>
      {leido && (leido.vehiculo || leido.matricula) && (
        <div style={{ fontSize: 14 }}>
          <b>{[leido.vehiculo, leido.matricula].filter(Boolean).join(' · ')}</b>
          <span style={{ color: 'var(--muted)' }}>{leido.numeroPoliza ? ` · nº ${leido.numeroPoliza}` : ''}</span>
        </div>
      )}
      {/* El vencimiento es el eje de una oportunidad: cuándo hay que llamarle. Siempre a la vista. */}
      <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 10, border: '2px solid var(--primary)', background: 'var(--primary-light)' }}>
        <div style={rejilla}>
          <label style={{ ...etiqueta, color: 'var(--text)', fontWeight: 700 }}>
            Vencimiento del seguro que tiene hoy
            <input type="date" value={vence} onChange={e => setVence(e.target.value)} style={{ ...campo, fontWeight: 600 }} />
          </label>
          <label style={{ ...etiqueta, color: 'var(--text)', fontWeight: 700 }}>
            Compañía actual
            <input value={compania} onChange={e => setCompania(e.target.value)} maxLength={120} style={campo} placeholder="Opcional" />
          </label>
        </div>
        {precarga?.fechaObsoleta && (
          <span role="status" style={{ fontSize: 12, color: 'var(--warning)' }}>
            ⚠️ Fecha del volcado obsoleta (constaba el {fmt(precarga.fechaObsoleta)}): pregunta al cliente cuándo le vence.
          </span>
        )}
        {precarga && !precarga.fechaObsoleta && !precarga.fechaFinVigencia && (
          <span role="status" style={{ fontSize: 12, color: 'var(--warning)' }}>⚠️ El volcado no trae fecha: pregunta al cliente cuándo le vence.</span>
        )}
        <AvisoFechaDudosa fecha={vence} hoy={hoyMadrid()} />
        {vence === '' && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sin vencimiento no entra en Vencimientos: nadie sabrá cuándo llamarle. Ponlo en cuanto lo sepas.</span>}
      </div>
      <div style={rejilla}>
        <label style={etiqueta}>
          Ramo
          <select value={ramo} onChange={e => setRamo(e.target.value)} style={campo} required>
            <option value="">Elige…</option>
            {RAMOS_OPORTUNIDAD_UI.map(r => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
          </select>
        </label>
        <label style={etiqueta}>
          Cómo está
          <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} style={campo}>
            <option value="en_negociacion">Interesado</option>
            <option value="competencia">Por contactar</option>
          </select>
        </label>
        <label style={etiqueta}>
          Prima actual (€)
          <input value={prima} onChange={e => setPrima(e.target.value)} inputMode="decimal" style={campo} placeholder="Opcional" />
        </label>
      </div>
      <div style={{ fontWeight: 600 }}>Primer paso</div>
      <div style={rejilla}>
        <label style={etiqueta}>
          Qué
          <select value={tipoTarea} onChange={e => setTipoTarea(e.target.value)} style={campo}>
            {TIPOS_TAREA_UI.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </label>
        <label style={etiqueta}>
          Cuándo
          <input type="date" value={fechaTarea} min={hoyMadrid()} onChange={e => setFechaTarea(e.target.value)} style={campo} required />
        </label>
      </div>
      <label style={etiqueta}>
        Nota para el primer paso (opcional)
        <textarea value={nota} onChange={e => setNota(e.target.value)} maxLength={2000} rows={2} style={{ ...campo, minHeight: 64, padding: 8 }} />
      </label>
      </fieldset>
      {error && <div role="alert" style={{ color: 'var(--negative)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={ocupado || leyendo} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>{ocupado ? 'Guardando…' : 'Abrir oportunidad'}</button>
        <button type="button" onClick={onCancelar} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
      </div>
    </form>
  )
}

function FormEdicion({ o, onCancelar, onHecho }: {
  o: OportunidadDeCliente
  onCancelar: () => void
  onHecho: (t: { ok: boolean; texto: string }) => void
}) {
  const [ramo, setRamo] = useState(o.ramo ?? '')
  const [vence, setVence] = useState(o.fechaFinVigencia ?? '')
  const [compania, setCompania] = useState(o.aseguradora ?? '')
  const [prima, setPrima] = useState(o.prima !== null ? String(o.prima).replace('.', ',') : '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const p = parsearPrima(prima)
    if (p === 'invalido') { setError('La prima no es un importe válido (p. ej. 412,50).'); return }
    // Solo lo que cambia: mandar un campo sin tocar lo reescribiría con lo que había en pantalla.
    const cambios: Record<string, unknown> = {}
    if (ramo && ramo !== o.ramo) cambios.ramo = ramo
    if ((vence || null) !== o.fechaFinVigencia) cambios.fechaFinVigencia = vence || null
    if ((compania.trim() || null) !== o.aseguradora) cambios.aseguradora = compania
    if (p !== o.prima) cambios.prima = p
    if (Object.keys(cambios).length === 0) { onCancelar(); return }
    setOcupado(true)
    const r = await enviar({ accion: 'editar', id: o.id, ...cambios })
    setOcupado(false)
    if (r.status === 200) onHecho({ ok: true, texto: 'Oportunidad corregida.' })
    else setError(`No se ha guardado: ${motivoDe(r.json, r.status)}`)
  }

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 10 }}>
      <div style={rejilla}>
        <label style={etiqueta}>
          Ramo
          <select value={ramo} onChange={e => setRamo(e.target.value)} style={campo}>
            {o.ramo === null && <option value="">Sin ramo</option>}
            {RAMOS_OPORTUNIDAD_UI.map(r => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
          </select>
        </label>
        <label style={etiqueta}>
          Le vence
          <input type="date" value={vence} onChange={e => setVence(e.target.value)} style={campo} />
          <AvisoFechaDudosa fecha={vence} hoy={hoyMadrid()} />
        </label>
        <label style={etiqueta}>
          Compañía actual
          <input value={compania} onChange={e => setCompania(e.target.value)} maxLength={120} style={campo} />
        </label>
        <label style={etiqueta}>
          Prima actual (€)
          <input value={prima} onChange={e => setPrima(e.target.value)} inputMode="decimal" style={campo} />
        </label>
      </div>
      {error && <div role="alert" style={{ color: 'var(--negative)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={ocupado} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={onCancelar} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
      </div>
    </form>
  )
}

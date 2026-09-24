'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { prepararAdjunto } from '@/lib/imagen-cliente'
import {
  RAMOS_OPORTUNIDAD_UI,
  ROTULO_ESTADO,
  TIPOS_TAREA_UI,
  interpretarLecturaOportunidad,
  interpretarOportunidadesCliente,
  parsearPrima,
  primaParaCampo,
  rotuloMotivo,
  rotuloRamo,
  textoAltaOportunidad,
  type OportunidadDeCliente,
  type OportunidadesCliente as Lectura,
} from '@/lib/seguimiento-asegura'
import { fmt } from './piezas'
import PedirDatos from './PedirDatos'

/**
 * Las oportunidades de ESTE cliente, en su ficha (Fase 1 del rediseño, 24/09/2026). Hasta hoy solo
 * se veían desde Vencimientos u «Hoy», y abrir una a mano no existía: «Presupuestar» lleva a
 * tarificar, que no es lo mismo que «le interesa, llámale el jueves».
 *
 * - Abrir: nace con su PRIMER PASO (tipo + fecha), o no nace. Si ya hay una abierta del mismo
 *   ramo, asegura no abre otra y aquí se enlaza la que hay.
 * - Corregir: ramo, vencimiento, compañía y prima de una ABIERTA. El estado va por sus acciones
 *   (en «Seguimiento →»), que exigen motivo.
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

export default function OportunidadesCliente({ clienteId, telefono = null, polizas }: { clienteId: string; telefono?: string | null; polizas: Poliza[] }) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; id?: string | null } | null>(null)
  const [verCerradas, setVerCerradas] = useState(false)

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
  const pideNueva = useSearchParams().get('oportunidad') === 'nueva'
  useEffect(() => {
    if (!pideNueva) return
    setAviso(null)
    setAbriendo(true)
    document.getElementById('oportunidades')?.scrollIntoView({ block: 'start' })
    // Se quita el parámetro: si se quedara, un segundo clic en el menú no cambiaría la URL
    // y el formulario ya cerrado no volvería a abrirse.
    const url = new URL(window.location.href)
    url.searchParams.delete('oportunidad')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [pideNueva])

  const abiertas = lectura?.estado === 'ok' ? lectura.oportunidades.filter(o => o.estado !== 'ganada' && o.estado !== 'perdida') : []
  const cerradas = lectura?.estado === 'ok' ? lectura.oportunidades.filter(o => o.estado === 'ganada' || o.estado === 'perdida') : []

  return (
    <div id="oportunidades" style={{ display: 'grid', gap: 10, fontSize: 13, scrollMarginTop: 80 }}>
      {aviso && (
        <div role="status" style={{ color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>
          {aviso.texto}
          {aviso.id && <> <Link href={`/correduria/oportunidad/${aviso.id}`}>abrir →</Link></>}
        </div>
      )}

      {lectura === null && <div style={{ color: 'var(--muted)' }}>Cargando oportunidades…</div>}
      {lectura?.estado === 'sin_configurar' && <div style={{ color: 'var(--muted)' }}>La cartera no está conectada: no se pueden mirar las oportunidades.</div>}
      {lectura?.estado === 'error' && (
        <div style={{ color: 'var(--negative)' }}>
          No se han podido leer las oportunidades ({lectura.motivo}): eso no quiere decir que no tenga.{' '}
          <button type="button" onClick={() => void cargar()} style={btnStyle('secundario', 'sm')}>Reintentar</button>
        </div>
      )}

      {lectura?.estado === 'ok' && (
        <>
          {abiertas.length === 0 && !abriendo && <div style={{ color: 'var(--muted)' }}>Ninguna oportunidad abierta. Se abre desde «➕ Nueva oportunidad ▾», arriba.</div>}
          {abiertas.map(o => (
            <FilaAbierta key={o.id} o={o} clienteId={clienteId} telefono={telefono} polizas={polizas} onHecho={(t) => { setAviso(t); void cargar() }} />
          ))}
          {lectura.descartadas > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{lectura.descartadas} oportunidad(es) llegaron incompletas y no se pintan.</div>
          )}
          {cerradas.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerCerradas(v => !v)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                {verCerradas ? 'Ocultar' : 'Ver'} cerradas ({cerradas.length}{lectura.truncado ? '+' : ''})
              </button>
              {verCerradas && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 6 }}>
                  {cerradas.map(o => <FilaCerrada key={o.id} o={o} />)}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {abriendo && (
        <FormAlta
          clienteId={clienteId}
          onCancelar={() => setAbriendo(false)}
          onHecho={(t) => { setAviso(t); if (t.ok) setAbriendo(false); void cargar() }}
        />
      )}
    </div>
  )
}

function Resumen({ o }: { o: OportunidadDeCliente }) {
  const partes: string[] = []
  if (o.aseguradora) partes.push(`con ${o.aseguradora}`)
  if (o.prima !== null) partes.push(eur(o.prima))
  partes.push(o.fechaFinVigencia ? `vence ${fmt(o.fechaFinVigencia)}` : 'sin fecha de vencimiento (no entra en Vencimientos)')
  return <span style={{ color: 'var(--muted)' }}>{partes.join(' · ')}</span>
}

function FilaAbierta({ o, clienteId, telefono, polizas, onHecho }: {
  o: OportunidadDeCliente
  clienteId: string
  telefono: string | null
  polizas: Poliza[]
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
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <b>{rotuloRamo(o.ramo)}</b>
        <span style={{ fontWeight: 600 }}>{ROTULO_ESTADO[o.estado]}</span>
        {aparcada && <span style={{ color: 'var(--muted)' }}>· aparcada hasta el {fmt(o.aparcadaHasta!)}</span>}
      </div>
      <Resumen o={o} />
      <div style={{ color: o.proximaTarea === null || vencida ? 'var(--negative)' : 'var(--text)' }}>
        {o.proximaTarea === null
          ? (aparcada ? 'Sin paso pendiente (aparcada).' : '⚠️ Sin siguiente paso: nadie la va a mirar. Ponle una tarea en «Seguimiento».')
          : `Siguiente: ${o.proximaTarea.tipo} el ${fmt(o.proximaTarea.fechaLimite)}${vencida ? ' (vencida)' : ''}`}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href={`/correduria/oportunidad/${o.id}`} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Seguimiento →
        </Link>
        <button type="button" disabled={ocupado} onClick={() => setModo(modo === 'editar' ? null : 'editar')} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Corregir</button>
        {puedeGanar && (
          <button type="button" disabled={ocupado} onClick={() => setModo(modo === 'ganar' ? null : 'ganar')} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>🏆 Ganada</button>
        )}
        <button type="button" disabled={ocupado} onClick={() => setModo(modo === 'descartar' ? null : 'descartar')} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Descartar</button>
      </div>

      {(o.ramo === 'moto' || o.ramo === 'auto') && <PedirDatos oportunidadId={o.id} clienteId={clienteId} telefono={telefono} ramo={o.ramo} />}

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
            Para una abierta por error o duplicada. No se borra (queda su rastro) ni cuenta como venta perdida.
            Si el cliente no quiere, usa «Perdida» en Seguimiento, con su motivo.
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

function FilaCerrada({ o }: { o: OportunidadDeCliente }) {
  const cuando = o.cerradaAt ? fmt(o.cerradaAt.slice(0, 10)) : null
  const descartada = o.motivoPerdida === 'error_alta'
  return (
    <li style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
      <Link href={`/correduria/oportunidad/${o.id}`}>{rotuloRamo(o.ramo)}</Link>{' '}
      <b>{descartada ? 'Descartada' : ROTULO_ESTADO[o.estado]}</b>
      {cuando && <> el {cuando}</>}
      {o.estado === 'perdida' && !descartada && o.motivoPerdida && <span style={{ color: 'var(--muted)' }}> · {rotuloMotivo(o.motivoPerdida)}{o.competidor ? ` (${o.competidor})` : ''}</span>}
    </li>
  )
}

function FormAlta({ clienteId, onCancelar, onHecho }: {
  clienteId: string
  onCancelar: () => void
  onHecho: (t: { ok: boolean; texto: string; id?: string | null }) => void
}) {
  const [ramo, setRamo] = useState('')
  const [estado, setEstado] = useState<'en_negociacion' | 'competencia'>('en_negociacion')
  const [vence, setVence] = useState('')
  const [compania, setCompania] = useState('')
  const [prima, setPrima] = useState('')
  const [tipoTarea, setTipoTarea] = useState('llamada')
  const [fechaTarea, setFechaTarea] = useState(manana())
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [lectura, setLectura] = useState<{ ok: boolean; texto: string } | null>(null)
  const fichero = useRef<HTMLInputElement>(null)

  // Lo leído RELLENA lo vacío y no pisa lo que Alberto ya ha tecleado: si él escribió
  // la prima que le dijo el cliente, esa manda sobre la del papel.
  async function leerDocumento(f: File) {
    setLeyendo(true)
    setLectura(null)
    let status = 0
    let json: unknown = null
    try {
      const a = await prepararAdjunto(f)
      const res = await fetch('/api/correduria/oportunidad/leer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base64: a.base64, mimeType: a.mimeType, fileName: a.fileName }),
      })
      status = res.status
      json = await res.json().catch(() => null)
    } catch {
      json = { error: 'sin conexión' }
    }
    setLeyendo(false)
    const l = interpretarLecturaOportunidad(status, json)
    if (l.estado === 'error') { setLectura({ ok: false, texto: `No se ha podido leer: ${l.motivo}. Rellénalo a mano.` }); return }
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
    poner('nº de póliza', l.numeroPoliza, nota, () => setNota(`Póliza actual nº ${l.numeroPoliza}`))
    setLectura({
      ok: true,
      texto: (puestos.length ? `Leído del documento: ${puestos.join(', ')}. Revísalo antes de abrir.` : 'El documento no añade nada a lo que ya habías escrito.')
        + (respetados.length ? ` No he tocado lo que ya habías escrito (${respetados.join(', ')}).` : ''),
    })
  }

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
    })
    setOcupado(false)
    const t = textoAltaOportunidad(r.status, r.json)
    if (!t.ok && r.status !== 409) { setError(t.texto); return }
    onHecho(t)
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
          {leyendo ? 'Leyendo el documento…' : '📎 Rellenar desde póliza, recibo o foto'}
        </button>
        {lectura && <div role="status" style={{ color: lectura.ok ? 'var(--positive)' : 'var(--negative)' }}>{lectura.texto}</div>}
        {!lectura && !leyendo && <div style={{ fontSize: 11, color: 'var(--muted)' }}>La IA lee ramo, compañía, vencimiento y prima. No se guarda el documento.</div>}
      </div>
      {/* Bloqueado mientras lee: lo leído solo rellena lo vacío, y eso se decide con lo que había al pulsar. */}
      <fieldset disabled={leyendo} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 10 }}>
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
          Le vence (si se sabe)
          <input type="date" value={vence} onChange={e => setVence(e.target.value)} style={campo} />
        </label>
        <label style={etiqueta}>
          Compañía actual
          <input value={compania} onChange={e => setCompania(e.target.value)} maxLength={120} style={campo} placeholder="Opcional" />
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

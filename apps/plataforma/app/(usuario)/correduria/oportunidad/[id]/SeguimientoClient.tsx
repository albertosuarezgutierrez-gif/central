'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Target } from 'lucide-react'
import { Badge, PageHeader, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  MOTIVOS_PERDIDA_UI,
  ROTULO_ESTADO,
  TIPOS_TAREA_UI,
  parsearPrima,
  type EstadoOportunidad,
  type LecturaOportunidad,
  type TareaSeguimiento,
} from '@/lib/seguimiento-asegura'

type Panel = null | 'perder' | 'aparcar'
type Envio = { estado: 'idle' } | { estado: 'enviando' } | { estado: 'error'; motivo: string }

const PASOS: readonly { estado: EstadoOportunidad | 'cierre'; rotulo: string }[] = [
  { estado: 'competencia', rotulo: 'Por contactar' },
  { estado: 'en_negociacion', rotulo: 'Interesado' },
  { estado: 'pendiente_cliente', rotulo: 'Propuesta enviada' },
  { estado: 'cierre', rotulo: 'Ganada o perdida' },
]

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}
function masDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function fecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' })
}

const AMBIGUO = 'No se ha podido confirmar si se guardó: recarga para verlo antes de repetirlo.'

async function enviar(url: string, metodo: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; causa?: string } | null
    if (r.ok && j?.estado === 'ok') return null
    // 502/red: el puerto pudo guardar y cortarse la respuesta. No se invita a repetir a ciegas.
    if (r.status === 502 || j?.motivo === 'red') return AMBIGUO
    return j?.motivo ?? j?.causa ?? `No se ha podido guardar (HTTP ${r.status}).`
  } catch {
    return AMBIGUO
  }
}

export default function SeguimientoClient({ id }: { id: string }) {
  const [datos, setDatos] = useState<LecturaOportunidad | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [envio, setEnvio] = useState<Envio>({ estado: 'idle' })

  const cargar = useCallback(() => {
    fetch(`/api/correduria/oportunidad?id=${encodeURIComponent(id)}`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) return setDatos({ estado: 'error', motivo: 'sin acceso: vuelve a iniciar sesión' })
        const j = await r.json().catch(() => null)
        setDatos(j && typeof j === 'object' && 'estado' in j ? (j as LecturaOportunidad) : { estado: 'error', motivo: `HTTP ${r.status}` })
      })
      .catch(() => setDatos({ estado: 'error', motivo: 'red' }))
  }, [id])
  useEffect(cargar, [cargar])

  async function accion(body: Record<string, unknown>) {
    setEnvio({ estado: 'enviando' })
    const error = await enviar('/api/correduria/oportunidad', 'POST', { id, ...body })
    if (error) return setEnvio({ estado: 'error', motivo: error })
    setEnvio({ estado: 'idle' })
    setPanel(null)
    cargar()
  }

  if (datos === null) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>
  if (datos.estado === 'no_encontrado') return <p style={{ fontSize: 14 }}>Esta oportunidad no existe o no es de la correduría. <Link href="/correduria/vencimientos?c=leads">Volver a Vencimientos</Link></p>
  if (datos.estado === 'sin_configurar') return <p style={{ fontSize: 13, color: 'var(--muted)' }}>No se puede leer: falta conectar el puerto con central-asegura.</p>
  if (datos.estado === 'error') return <p style={{ fontSize: 13, color: 'var(--negative)' }}>No se ha podido leer la oportunidad ({datos.motivo}).</p>

  const op = datos.oportunidad
  const hoy = hoyMadrid()
  const aparcada = op.aparcadaHasta !== null && op.aparcadaHasta > hoy
  const cerrada = op.estado === 'ganada' || op.estado === 'perdida'
  const enviando = envio.estado === 'enviando'
  const indicePaso = cerrada ? 3 : PASOS.findIndex(p => p.estado === op.estado)

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div>
        <Link href="/correduria/vencimientos?c=leads" style={{ fontSize: 13, color: 'var(--muted)' }}>← Vencimientos</Link>
        <PageHeader
          titulo={`${datos.cliente ?? '(sin nombre)'}${op.ramo ? ` · ${op.ramo}` : ''}`}
          icono={<Target size={20} strokeWidth={1.75} />}
          sub={<>
            {datos.fueCliente === true ? 'Fue cliente nuestro' : datos.fueCliente === false ? 'Nunca fue cliente' : 'Relación previa sin comprobar'}
            {datos.aseguradora ? ` · hoy en ${datos.aseguradora}` : ''}
            {op.fechaFinVigencia ? ` · su póliza vencía el ${fecha(op.fechaFinVigencia)} (el aniversario es estimado)` : ''}
            {' · '}<Link href={`/correduria/cliente/${op.clienteId}`}>abrir ficha</Link>
          </>}
          acciones={<Badge tono={op.estado === 'ganada' ? 'positivo' : op.estado === 'perdida' ? 'negativo' : 'info'}>{ROTULO_ESTADO[op.estado]}</Badge>}
        />
      </div>

      <ol aria-label="Estado de la oportunidad" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {PASOS.map((p, i) => (
          <li key={p.estado} aria-current={i === indicePaso ? 'step' : undefined} style={{
            padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: i === indicePaso ? 700 : 600,
            background: i === indicePaso ? 'var(--primary)' : i < indicePaso ? 'var(--primary-light)' : 'var(--surface)',
            color: i === indicePaso ? '#fff' : i < indicePaso ? 'var(--primary)' : 'var(--muted)',
            border: i > indicePaso ? '1px solid var(--border)' : '1px solid transparent',
          }}>
            {i + 1} · {i === 3 && cerrada ? ROTULO_ESTADO[op.estado] : p.rotulo}{i < indicePaso ? ' ✓' : ''}
          </li>
        ))}
      </ol>

      {op.estado === 'perdida' && (
        <p style={{ margin: 0, fontSize: 14 }}>
          Perdida{op.motivoPerdida ? ` · ${MOTIVOS_PERDIDA_UI.find(m => m.valor === op.motivoPerdida)?.rotulo ?? op.motivoPerdida}` : ''}
          {op.competidor ? ` · contra ${op.competidor}` : ''}
          {op.primaCompetidor !== null ? ` por ${eur(op.primaCompetidor)}` : ''}
        </p>
      )}
      {aparcada && <p style={{ margin: 0, fontSize: 14, color: 'var(--warning)' }}>Aparcada hasta el {fecha(op.aparcadaHasta)}: no sale en Vencimientos hasta entonces.</p>}

      <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Qué hago ahora</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {op.estado === 'competencia' && !aparcada && (
            <button type="button" disabled={enviando} style={btnStyle('secundario')} onClick={() => accion({ accion: 'interesado' })}>Interesado</button>
          )}
          {(op.estado === 'competencia' || op.estado === 'en_negociacion') && !aparcada && (
            <button type="button" disabled={enviando} style={btnStyle('primario')} onClick={() => accion({ accion: 'propuesta_enviada' })}>Propuesta enviada</button>
          )}
          {(op.estado === 'en_negociacion' || op.estado === 'pendiente_cliente') && !aparcada && (
            <button type="button" disabled={enviando} style={{ ...btnStyle('secundario'), color: 'var(--positive)' }}
              onClick={() => { if (window.confirm('¿Marcar como GANADA? Se cierran sus tareas pendientes.')) void accion({ accion: 'ganar' }) }}>
              Ganada
            </button>
          )}
          {!cerrada && (
            <>
              <button type="button" disabled={enviando} aria-expanded={panel === 'perder'} style={{ ...btnStyle('secundario'), color: 'var(--negative)' }} onClick={() => setPanel(panel === 'perder' ? null : 'perder')}>Perdida…</button>
              {!aparcada && <button type="button" disabled={enviando} aria-expanded={panel === 'aparcar'} style={btnStyle('secundario')} onClick={() => setPanel(panel === 'aparcar' ? null : 'aparcar')}>Aparcar…</button>}
            </>
          )}
          {(op.estado === 'perdida' || aparcada) && (
            <button type="button" disabled={enviando} style={btnStyle('secundario')} onClick={() => accion({ accion: 'reabrir' })}>Reabrir</button>
          )}
        </div>
        {panel === 'perder' && <FormPerder enviando={enviando} onEnviar={accion} onCancelar={() => setPanel(null)} />}
        {panel === 'aparcar' && <FormAparcar enviando={enviando} hoy={hoy} onEnviar={accion} onCancelar={() => setPanel(null)} />}
        {envio.estado === 'error' && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{envio.motivo}</p>}
      </section>

      <Tareas oportunidadId={id} tareas={datos.tareas} descartadas={datos.tareasDescartadas} fueCliente={datos.fueCliente} cerrada={cerrada} hoy={hoy} onCambio={cargar} />

      <section style={{ ...cardStyle, display: 'grid', gap: 4 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Historial</h2>
        {datos.historial.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Sin cambios registrados desde aquí todavía.</p>
        ) : datos.historial.map((h, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>{fecha(h.fecha)}</span>
            <span>
              {h.estadoAntes && h.estadoDespues && h.estadoAntes !== h.estadoDespues
                ? <>{ROTULO_ESTADO[h.estadoAntes as EstadoOportunidad] ?? h.estadoAntes} → <b>{ROTULO_ESTADO[h.estadoDespues as EstadoOportunidad] ?? h.estadoDespues}</b></>
                : h.accion}
              {' · '}{h.actor}
            </span>
          </div>
        ))}
        <span style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>El historial no se puede editar ni borrar: queda quién cambió qué y cuándo.</span>
      </section>
    </div>
  )
}

function FormPerder({ enviando, onEnviar, onCancelar }: { enviando: boolean; onEnviar: (b: Record<string, unknown>) => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState<string>('')
  const [competidor, setCompetidor] = useState('')
  const [prima, setPrima] = useState('')
  const [detalle, setDetalle] = useState('')
  // «1.234,50» (español) o «412.5»: con coma, los puntos son de millar; sin coma, el punto es decimal.
  const primaNum = parsearPrima(prima)
  const valido = motivo !== '' && (motivo !== 'competidor' || competidor.trim() !== '') && (motivo !== 'otro' || detalle.trim() !== '') && primaNum !== 'invalido'
  return (
    <form onSubmit={e => { e.preventDefault(); if (valido) onEnviar({ accion: 'perder', motivo, competidor: competidor.trim() || null, primaCompetidor: primaNum, detalle: detalle.trim() || null }) }}
      style={{ display: 'grid', gap: 12, padding: 14, borderRadius: 12, border: '1px solid var(--border)' }}>
      <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>¿Por qué? (obligatorio)</legend>
        {MOTIVOS_PERDIDA_UI.map(m => (
          <label key={m.valor} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 10, border: `1px solid ${motivo === m.valor ? 'var(--primary)' : 'var(--border)'}`, fontSize: 14 }}>
            <input type="radio" name="motivo" value={m.valor} checked={motivo === m.valor} onChange={() => setMotivo(m.valor)} /> {m.rotulo}
          </label>
        ))}
      </fieldset>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>¿Con qué compañía?{motivo === 'competidor' ? ' (obligatorio)' : ''}
          <input value={competidor} onChange={e => setCompetidor(e.target.value)} maxLength={120} style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Prima que le ofrecen (si la sabes)
          <input value={prima} onChange={e => setPrima(e.target.value)} inputMode="decimal" placeholder="412,00" style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
            {primaNum === 'invalido' && <span style={{ color: 'var(--negative)' }}>Escríbela como 412,50 o 1.200</span>}
        </label>
      </div>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Detalle{motivo === 'otro' ? ' (obligatorio)' : ' (opcional)'}
        <input value={detalle} onChange={e => setDetalle(e.target.value)} maxLength={500} style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
      </label>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Al guardar se cierran sus tareas pendientes. Se puede reabrir después.</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={!valido || enviando} style={{ ...btnStyle('primario'), background: 'var(--negative)', borderColor: 'var(--negative)' }}>Marcar perdida</button>
        <button type="button" onClick={onCancelar} style={btnStyle('sutil')}>Cancelar</button>
      </div>
    </form>
  )
}

function FormAparcar({ enviando, hoy, onEnviar, onCancelar }: { enviando: boolean; hoy: string; onEnviar: (b: Record<string, unknown>) => void; onCancelar: () => void }) {
  const [hasta, setHasta] = useState(masDias(hoy, 90))
  const [detalle, setDetalle] = useState('')
  const max = masDias(hoy, 400)
  const valido = hasta > hoy && hasta <= max && detalle.trim() !== ''
  return (
    <form onSubmit={e => { e.preventDefault(); if (valido) onEnviar({ accion: 'aparcar', aparcadaHasta: hasta, detalle: detalle.trim() }) }}
      style={{ display: 'grid', gap: 12, padding: 14, borderRadius: 12, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[90, 180, 330].map(n => (
          <button key={n} type="button" onClick={() => setHasta(masDias(hoy, n))} aria-pressed={hasta === masDias(hoy, n)} style={btnStyle(hasta === masDias(hoy, n) ? 'primario' : 'secundario', 'sm')}>
            {n === 90 ? '3 meses' : n === 180 ? '6 meses' : '11 meses'}
          </button>
        ))}
      </div>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Hasta
        <input type="date" value={hasta} min={masDias(hoy, 1)} max={max} onChange={e => setHasta(e.target.value)} style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Por qué (obligatorio)
        <input value={detalle} onChange={e => setDetalle(e.target.value)} maxLength={300} placeholder="Ej.: sin respuesta en 3 intentos; probar el año que viene" style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
      </label>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sale de la lista hasta esa fecha (máximo 13 meses) y vuelve sola. Aparcar no es perder.</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={!valido || enviando} style={btnStyle('primario')}>Aparcar hasta {fecha(hasta)}</button>
        <button type="button" onClick={onCancelar} style={btnStyle('sutil')}>Cancelar</button>
      </div>
    </form>
  )
}

function Tareas({ oportunidadId, tareas, descartadas, fueCliente, cerrada, hoy, onCambio }: { oportunidadId: string; tareas: TareaSeguimiento[]; descartadas: number; fueCliente: boolean | null; cerrada: boolean; hoy: string; onCambio: () => void }) {
  const [obs, setObs] = useState('')
  const [tipo, setTipo] = useState('llamada')
  const [limite, setLimite] = useState(hoy)
  const [prioridad, setPrioridad] = useState('media')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const pendientes = tareas.filter(t => t.estado !== 'cerrada')
  const hechas = tareas.filter(t => t.estado === 'cerrada')

  async function crear() {
    setOcupado(true)
    const e = await enviar('/api/correduria/oportunidad/tarea', 'POST', { oportunidadId, tipo, fechaLimite: limite, observaciones: obs.trim(), prioridad })
    setOcupado(false)
    setError(e)
    if (!e) { setObs(''); onCambio() }
  }
  async function cerrar(t: TareaSeguimiento) {
    setOcupado(true)
    const e = await enviar('/api/correduria/oportunidad/tarea', 'PATCH', { tareaId: t.id })
    setOcupado(false)
    setError(e)
    if (!e) onCambio()
  }

  const rotuloTipo = (t: string) => TIPOS_TAREA_UI.find(x => x.valor === t)?.rotulo ?? t
  // LSSI 21.2: por correo solo a quien fue cliente. Sin comprobar = no se ofrece.
  const tipos = TIPOS_TAREA_UI.filter(t => t.valor !== 'email' || fueCliente === true)
  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Tareas</h2>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{pendientes.length} pendiente(s)</span>
      </div>
      {pendientes.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Nada pendiente. Toda oportunidad abierta debería tener una siguiente tarea con fecha.</p>}
      {pendientes.map(t => (
        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <button type="button" disabled={ocupado} onClick={() => cerrar(t)} aria-label={`Marcar hecha: ${t.observaciones}`} title="Marcar hecha" style={{ ...btnStyle('secundario'), width: 44, padding: 0 }}>
            <Check size={18} strokeWidth={1.75} />
          </button>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{t.observaciones || '(sin descripción)'}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rotuloTipo(t.tipo)} · prioridad {t.prioridad}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.fechaLimite !== null && t.fechaLimite <= hoy ? 'var(--negative)' : 'var(--text)' }}>
            {t.fechaLimite === null ? 'sin fecha' : t.fechaLimite < hoy ? `vencida · ${fecha(t.fechaLimite)}` : t.fechaLimite === hoy ? 'hoy' : fecha(t.fechaLimite)}
          </span>
        </div>
      ))}
      {!cerrada && (
        <form onSubmit={e => { e.preventDefault(); if (obs.trim() !== '' && limite >= hoy) void crear() }}
          style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)', gridColumn: '1 / -1' }}>Qué hay que hacer
            <input value={obs} onChange={e => setObs(e.target.value)} maxLength={500} placeholder="Ej.: mandar la propuesta por correo" style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Tipo
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 8px', fontSize: 14, background: 'var(--surface)' }}>
              {tipos.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
            {fueCliente !== true && <span style={{ fontSize: 11 }}>Sin «Correo»: {fueCliente === false ? 'nunca fue cliente' : 'no consta que fuera cliente'} (LSSI 21.2).</span>}
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Para el
            <input type="date" value={limite} min={hoy} onChange={e => setLimite(e.target.value)} style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 8px', fontSize: 14 }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Prioridad
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)} style={{ minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 8px', fontSize: 14, background: 'var(--surface)' }}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
            </select>
          </label>
          <button type="submit" disabled={ocupado || obs.trim() === '' || limite < hoy} style={btnStyle('primario')}>Añadir</button>
        </form>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}
      {descartadas > 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--warning)' }}>{descartadas} tarea(s) del puerto no se han podido leer y no se muestran.</p>}
      {hechas.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)', minHeight: 44, display: 'flex', alignItems: 'center' }}>Hechas ({hechas.length})</summary>
          {hechas.map(t => (
            <div key={t.id} style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              {rotuloTipo(t.tipo)} · {t.observaciones} {t.fechaLimite ? `· ${fecha(t.fechaLimite)}` : ''}
            </div>
          ))}
        </details>
      )}
    </section>
  )
}

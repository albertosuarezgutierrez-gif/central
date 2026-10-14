'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge, btnStyle } from '@/components/ui'
import { cuandoRelativo, fechaCorta, masDias, motivoFalloTareaSuelta } from '@/lib/correduria/mesa'
import {
  ATAJOS_TAREA, abierta, atajo, interpretarTareasVinculadas, ordenarTareasVinculadas, partirTexto, textoTarea,
  type LecturaTareasVinculadas,
} from '@/lib/correduria/tareas-vinculadas'
import { TIPOS_TAREA_UI } from '@/lib/seguimiento-asegura'

const AMBIGUO = 'No se ha podido confirmar si se guardó: recarga para verlo antes de repetirlo.'
const PAGINA = 50
const CAMPO: React.CSSProperties = { minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14, background: 'var(--surface)', minWidth: 0 }
const ETIQUETA: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)', minWidth: 0 }
const ROTULO_TIPO: Record<string, string> = Object.fromEntries(TIPOS_TAREA_UI.map(t => [t.valor, t.rotulo]))

/**
 * Tareas de una PÓLIZA (`polizaId`) o de un CLIENTE (`clienteId`, con las de todas sus pólizas), y alta
 * rápida. Una sola tabla de tareas (la de siempre): lo que se crea aquí sale también en «Tareas sueltas» de
 * Mi mesa, y «Hecho» va por la misma vía. Desde la póliza, el cliente lo pone el servidor; desde la ficha,
 * la póliza es opcional (`polizas` = las del cliente).
 * Tres estados: `no se han podido leer` se DICE, nunca «no hay».
 */
export default function TareasVinculadas({ polizaId, clienteId, polizas, inicial, hoy }: {
  polizaId?: string
  clienteId?: string
  polizas?: { id: string; etiqueta: string }[]
  inicial: LecturaTareasVinculadas
  /** aaaa-mm-dd en Madrid. */
  hoy: string
}) {
  const [lectura, setLectura] = useState(inicial)
  const [limite, setLimite] = useState(PAGINA)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [fallo, setFallo] = useState<{ id: string; texto: string } | null>(null)

  const primero = ATAJOS_TAREA[0]
  const [rapido, setRapido] = useState<string>(primero.valor)
  const [titulo, setTitulo] = useState<string>(primero.rotulo)
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState<string>(primero.tipo)
  const [fecha, setFecha] = useState(masDias(hoy, primero.dias))
  const [poliza, setPoliza] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  const consulta = polizaId ? `polizaId=${encodeURIComponent(polizaId)}` : `clienteId=${encodeURIComponent(clienteId ?? '')}`

  async function recargar() {
    try {
      const r = await fetch(`/api/correduria/tareas?${consulta}`, { cache: 'no-store' })
      setLectura(interpretarTareasVinculadas(r.status, await r.json().catch(() => null)))
    } catch {
      setLectura({ estado: 'error', motivo: 'red' })
    }
  }

  function elegirAtajo(v: string) {
    const anterior = atajo(rapido)
    const a = atajo(v)
    setRapido(a.valor)
    // El título solo se reemplaza si no lo ha tocado nadie (sigue siendo el del atajo anterior o está vacío).
    if (titulo.trim() === '' || titulo === anterior.rotulo) setTitulo(a.valor === 'otro' ? '' : a.rotulo)
    setTipo(a.tipo)
    setFecha(masDias(hoy, a.dias))
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    const observaciones = textoTarea(titulo, descripcion)
    if (!observaciones) { setMensaje({ ok: false, texto: 'Di qué hay que hacer (título).' }); return }
    setGuardando(true)
    setMensaje(null)
    try {
      const r = await fetch('/api/correduria/tareas', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polizaId: polizaId ?? (poliza || undefined), clienteId, tipo, fechaLimite: fecha, observaciones }),
      })
      const j = (await r.json().catch(() => null)) as { motivo?: unknown } | null
      if (!r.ok) {
        setMensaje({ ok: false, texto: r.status >= 500 ? AMBIGUO : `No se ha guardado: ${typeof j?.motivo === 'string' ? j.motivo : `HTTP ${r.status}`}` })
        return
      }
      setMensaje({ ok: true, texto: 'Tarea creada. Sale también en «Tareas sueltas» de Mi mesa.' })
      setDescripcion('')
      setTitulo(rapido === 'otro' ? '' : atajo(rapido).rotulo)
      await recargar()
    } catch {
      setMensaje({ ok: false, texto: AMBIGUO })
    } finally {
      setGuardando(false)
    }
  }

  async function hecho(tareaId: string) {
    setOcupada(tareaId)
    setFallo(null)
    try {
      const r = await fetch('/api/correduria/oportunidad/tarea', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tareaId, suelta: true, accion: 'hecho' }),
      })
      const motivo = motivoFalloTareaSuelta(r.status, await r.json().catch(() => null))
      if (motivo) { setFallo({ id: tareaId, texto: motivo }); return }
      await recargar() // recarga sin desmontar
    } catch {
      setFallo({ id: tareaId, texto: AMBIGUO })
    } finally {
      setOcupada(null)
    }
  }

  const tareas = lectura.estado === 'ok' ? ordenarTareasVinculadas(lectura.tareas) : []
  const pendientes = tareas.filter(abierta).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      <form onSubmit={e => void crear(e)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Tipo de gestión">
          {ATAJOS_TAREA.map(a => (
            <button key={a.valor} type="button" aria-pressed={rapido === a.valor} onClick={() => elegirAtajo(a.valor)}
              style={{ ...btnStyle(rapido === a.valor ? 'primario' : 'secundario', 'sm'), minHeight: 44 }}>
              {a.rotulo}
            </button>
          ))}
        </div>
        <label style={ETIQUETA}>Título
          <input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={200} required placeholder="Ej.: pedir cambio de matrícula" style={CAMPO} />
        </label>
        <label style={ETIQUETA}>Descripción (opcional)
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={1500} rows={2} style={{ ...CAMPO, padding: 10, fontFamily: 'inherit' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
          <label style={ETIQUETA}>Para el
            <input type="date" value={fecha} min={hoy} required onChange={e => setFecha(e.target.value)} style={CAMPO} />
          </label>
          <label style={ETIQUETA}>Tipo
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={CAMPO}>
              {TIPOS_TAREA_UI.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
          </label>
          {!polizaId && polizas && polizas.length > 0 && (
            <label style={ETIQUETA}>Póliza (opcional)
              <select value={poliza} onChange={e => setPoliza(e.target.value)} style={CAMPO}>
                <option value="">— Del cliente, sin póliza —</option>
                {polizas.map(p => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </select>
            </label>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <button type="submit" disabled={guardando} style={{ ...btnStyle('primario'), minHeight: 44 }}>{guardando ? 'Guardando…' : 'Crear tarea'}</button>
          {mensaje && <span role={mensaje.ok ? 'status' : 'alert'} style={{ fontSize: 13, color: mensaje.ok ? 'var(--positive)' : 'var(--negative)' }}>{mensaje.texto}</span>}
        </div>
      </form>

      {lectura.estado !== 'ok' ? (
        <div role="alert" style={{ fontSize: 14, color: 'var(--warning)' }}>
          <strong>No se han podido leer las tareas.</strong> Esto no significa que no haya{lectura.estado === 'error' ? ` (${lectura.motivo})` : ' (el puerto con asegura no está conectado)'}.
        </div>
      ) : tareas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>No hay tareas{polizaId ? ' de esta póliza' : ' de este cliente ni de sus pólizas'}.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {pendientes} pendiente{pendientes === 1 ? '' : 's'}{lectura.truncado ? ' · la lista está recortada: hay más de las que se ven' : ''}
          </div>
          {tareas.slice(0, limite).map(t => {
            const { titulo: tit, descripcion: desc } = partirTexto(t.texto)
            const abiertaT = abierta(t)
            const vencida = abiertaT && t.fecha !== null && t.fecha <= hoy
            return (
              <article key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, padding: 12, borderRadius: 10, border: '1px solid var(--border)', opacity: abiertaT ? (ocupada === t.id ? 0.7 : 1) : 0.65 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <strong style={{ overflowWrap: 'anywhere', textDecoration: abiertaT ? undefined : 'line-through' }}>{tit || ROTULO_TIPO[t.tipo] || t.tipo}</strong>
                  <Badge tono="neutral">{ROTULO_TIPO[t.tipo] ?? t.tipo}</Badge>
                  {!abiertaT && <Badge tono="positivo">Hecha</Badge>}
                  {!polizaId && t.polizaId && (
                    <Link href={`/correduria/poliza/${t.polizaId}`} style={{ fontSize: 13, fontWeight: 600 }}>Póliza {t.polizaNumero ? `nº ${t.polizaNumero}` : '(sin número)'}</Link>
                  )}
                </div>
                {desc && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{desc}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: vencida ? 'var(--negative)' : 'var(--muted)' }}>
                    {t.fecha ? `${abiertaT ? cuandoRelativo(t.fecha, hoy) + ' · ' : ''}${fechaCorta(t.fecha, hoy)}` : 'sin fecha'}
                  </span>
                  {abiertaT && (t.oportunidadId
                    ? <Link href={`/correduria/oportunidad/${t.oportunidadId}`} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Se lleva desde su oportunidad</Link>
                    : <button type="button" disabled={ocupada !== null} onClick={() => void hecho(t.id)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>Hecho</button>)}
                </div>
                {fallo?.id === t.id && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{fallo.texto}</p>}
              </article>
            )
          })}
          {tareas.length > limite && (
            <div><button type="button" style={btnStyle('secundario')} onClick={() => setLimite(l => l + PAGINA)}>Ver {Math.min(PAGINA, tareas.length - limite)} más</button></div>
          )}
        </div>
      )}
    </div>
  )
}

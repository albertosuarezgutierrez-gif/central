'use client'
import { useState, useTransition } from 'react'
import { aceptarCitaAccion, huecosParaMoverAccion, moverCitaAccion, noPresentadoAccion, rechazarCitaAccion } from './acciones'

export type CitaUi = {
  id: string; inicio: string; duracionMinutos: number; estado: string; origen: string; motivo: string | null
  matricula: string; clienteNombre: string | null; clienteMovil: string | null; recepcionId: string | null
}
export type DiaUi = {
  fecha: string; capacidadMin: number; ocupadoMin: number; otsMin: number; porcentaje: number | null; saturado: boolean
  franjas: Array<{ hora: string; coches: number; max: number; llena: boolean }>
  citas: CitaUi[]
}
type Props = { desde: string; hoy: string; vista: 'dia' | 'semana'; dias: DiaUi[]; pendientes: CitaUi[]; anterior: string; siguiente: string; confirmacion: 'automatica' | 'manual' }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
const diaLargo = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
const horasMin = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
const ETIQUETA: Record<string, string> = { pedida: 'pendiente', confirmada: 'confirmada', realizada: 'en el taller', no_presentado: 'no vino' }

export function CitasCliente({ desde, hoy, vista, dias, pendientes, anterior, siguiente }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()
  const [mover, setMover] = useState<{ id: string; fecha: string; huecos: Array<{ inicio: string; hora: string }> | null } | null>(null)
  const recargar = () => location.reload()
  const accion = (f: () => Promise<{ ok: boolean; errores?: string[] }>) => iniciar(async () => {
    setError(null)
    const r = await f()
    if (r.ok) recargar()
    else setError((r.errores ?? ['No se pudo completar']).join(' '))
  })
  const abrirMover = (c: CitaUi) => {
    const fecha = c.inicio.slice(0, 10)
    setMover({ id: c.id, fecha, huecos: null })
    void huecosParaMoverAccion({ id: c.id, fecha }).then((r) => setMover({ id: c.id, fecha, huecos: r.ok ? r.huecos : [] }))
  }
  const cambiarDiaMover = (fecha: string) => {
    if (!mover) return
    setMover({ ...mover, fecha, huecos: null })
    void huecosParaMoverAccion({ id: mover.id, fecha }).then((r) => setMover({ id: mover.id, fecha, huecos: r.ok ? r.huecos : [] }))
  }

  const fila = (c: CitaUi) => (
    <li key={c.id} className="ficha">
      <div>
        <strong>{hora(c.inicio)} · {c.matricula}</strong>
        <span className="tenue"> · {c.clienteNombre ?? 'sin nombre'}{c.clienteMovil ? ` · ${c.clienteMovil}` : ''} · {c.motivo ?? ''} · {ETIQUETA[c.estado] ?? c.estado}</span>
      </div>
      <div className="fila">
        {c.estado === 'pedida' && <button type="button" className="btn" disabled={pend} onClick={() => accion(() => aceptarCitaAccion(c.id))}>Aceptar</button>}
        {(c.estado === 'pedida' || c.estado === 'confirmada') && (
          <>
            <button type="button" className="btn btn-sec" disabled={pend} onClick={() => abrirMover(c)}>Mover</button>
            <button type="button" className="btn btn-sec" disabled={pend} onClick={() => {
              const m = window.prompt(c.estado === 'pedida' ? 'Motivo del rechazo (opcional)' : 'Motivo de la cancelación (opcional)')
              if (m !== null) accion(() => rechazarCitaAccion(c.id, m))
            }}>{c.estado === 'pedida' ? 'Rechazar' : 'Cancelar'}</button>
            <a className="btn" href={`/recepcion?cita=${c.id}`}>Ha llegado: recepción</a>
            <button type="button" className="btn btn-sec" disabled={pend} onClick={() => accion(() => noPresentadoAccion(c.id))}>No vino</button>
          </>
        )}
        {c.recepcionId && <a className="btn btn-sec" href={`/recepcion/${c.recepcionId}/resguardo`}>Resguardo</a>}
      </div>
      {mover?.id === c.id && (
        <div className="ficha">
          <label>Día<input type="date" value={mover.fecha} onChange={(e) => e.target.value && cambiarDiaMover(e.target.value)} /></label>
          {mover.huecos === null ? <p className="tenue">Buscando…</p> : mover.huecos.length === 0 ? <p className="tenue">No hay franjas libres ese día.</p> : (
            <div className="fila">
              {mover.huecos.map((h) => (
                <button key={h.inicio} type="button" className="btn btn-sec" disabled={pend} onClick={() => accion(() => moverCitaAccion({ id: c.id, inicio: h.inicio }))}>{h.hora}</button>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-sec" onClick={() => setMover(null)}>Cerrar</button>
        </div>
      )}
    </li>
  )

  return (
    <>
      {error && <p className="aviso-error" role="alert">{error}</p>}
      <h2>Pendientes de aceptar ({pendientes.length})</h2>
      {pendientes.length === 0 ? <p className="tenue">No hay citas pendientes.</p> : (
        <ul className="lista-simple">
          {pendientes.map((c) => <li key={c.id}><span className="tenue">{new Date(c.inicio).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' })}</span><ul className="lista-simple">{fila(c)}</ul></li>)}
        </ul>
      )}

      <h2>Agenda</h2>
      <div className="fila">
        <a className="btn btn-sec" href={`/citas?v=${vista}&d=${anterior}`}>Anterior</a>
        <a className="btn btn-sec" href={`/citas?v=${vista}&d=${hoy}`}>Hoy</a>
        <a className="btn btn-sec" href={`/citas?v=${vista}&d=${siguiente}`}>Siguiente</a>
        <a className="btn btn-sec" href={`/citas?v=${vista === 'dia' ? 'semana' : 'dia'}&d=${desde}`}>{vista === 'dia' ? 'Ver semana' : 'Ver día'}</a>
      </div>
      <div className="lista">
        {dias.map((d) => (
          <section key={d.fecha} className="ficha" aria-label={diaLargo(d.fecha)}>
            <strong>{diaLargo(d.fecha)}{d.fecha === hoy ? ' (hoy)' : ''}</strong>
            {d.porcentaje === null && !d.saturado ? <span className="tenue">Cerrado / sin horario</span> : (
              <span className={d.saturado ? 'aviso-error' : 'tenue'} role={d.saturado ? 'alert' : undefined}>
                Capacidad: {d.porcentaje === null ? 'sin capacidad' : `${d.porcentaje} %`} ({horasMin(d.ocupadoMin)} de {horasMin(d.capacidadMin)}
                {d.otsMin > 0 ? `; ${horasMin(d.otsMin)} de trabajo abierto` : ''}){d.saturado ? ' · SE PASA' : ''}
              </span>
            )}
            {d.franjas.length > 0 && (
              <div className="fila" aria-label="Coches por franja">
                {d.franjas.map((f) => (
                  <span key={f.hora} className={f.llena ? 'aviso-error' : 'tenue'}>{f.hora}: {f.coches}/{f.max}</span>
                ))}
              </div>
            )}
            {d.citas.length === 0 ? <span className="tenue">Sin citas</span> : <ul className="lista-simple">{d.citas.map(fila)}</ul>}
          </section>
        ))}
      </div>
    </>
  )
}

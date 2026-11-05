'use client'
import { useState } from 'react'

type Props = {
  id: string | null
  modelo: string
  anio: number
  periodo: string
  estado: 'borrador' | 'revisado' | 'presentado' | null
  completo: boolean
  /** ¿Este modelo contabiliza algo al presentarse (303, 111, 115)? */
  contabiliza: boolean
}

async function llamar(url: string, cuerpo: unknown): Promise<{ ok: boolean; texto: string }> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const j = (await r.json().catch(() => ({}))) as { errores?: string[]; error?: string }
  return r.ok ? { ok: true, texto: 'Hecho.' } : { ok: false, texto: (j.errores ?? [j.error ?? 'No se pudo completar']).join(' · ') }
}

/** Acciones del ciclo: calcular/recalcular (borrador), revisar, devolver a borrador y registrar la presentación MANUAL. No envía nada a la AEAT. */
export function Acciones({ id, modelo, anio, periodo, estado, completo, contabiliza }: Props) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [fecha, setFecha] = useState(hoy)
  const [justificante, setJustificante] = useState('')
  const [pagar, setPagar] = useState(true)

  async function ejecutar(url: string, cuerpo: unknown) {
    setOcupado(true); setMsg(null)
    const r = await llamar(url, cuerpo)
    setOcupado(false); setMsg(r)
    if (r.ok) setTimeout(() => window.location.reload(), 600)
  }
  const calcular = (complementaria = false) => ejecutar('/api/impuestos/calcular', { modelo, anio, periodo, complementaria })

  return (
    <div>
      <div className="acciones-modelo">
        {(estado === null || estado === 'borrador') && <button type="button" className="btn" disabled={ocupado} onClick={() => calcular()}>{estado === null ? 'Calcular borrador' : 'Recalcular borrador'}</button>}
        {estado === 'borrador' && id && <button type="button" className="btn btn-sec" disabled={ocupado || !completo} onClick={() => ejecutar(`/api/impuestos/declaraciones/${id}`, { accion: 'revisar' })}>Marcar como revisado</button>}
        {estado === 'revisado' && id && <button type="button" className="btn btn-sec" disabled={ocupado} onClick={() => ejecutar(`/api/impuestos/declaraciones/${id}`, { accion: 'devolver' })}>Devolver a borrador</button>}
        {estado === 'presentado' && <button type="button" className="btn btn-sec" disabled={ocupado} onClick={() => { if (window.confirm('Se creará una declaración COMPLEMENTARIA (versión nueva). La presentada no se modifica. ¿Continuar?')) void calcular(true) }}>Preparar complementaria</button>}
        {id && <a className="btn btn-sec" href={`/api/impuestos/declaraciones/${id}/borrador?formato=html`} target="_blank" rel="noreferrer">Borrador (HTML/PDF)</a>}
        {id && <a className="btn btn-sec" href={`/api/impuestos/declaraciones/${id}/borrador?formato=csv`}>Borrador CSV</a>}
      </div>
      {estado === 'borrador' && !completo && <p className="aviso-error">Este cálculo contiene casos no soportados: no se puede revisar ni presentar. Corrígelos o llévalo con tu gestor.</p>}
      {estado === 'revisado' && id && (
        <form className="presentar-form" onSubmit={(ev) => { ev.preventDefault(); void ejecutar(`/api/impuestos/declaraciones/${id}`, { accion: 'presentar', fechaPresentacion: fecha, justificante, pagar }) }}>
          <p className="aviso-legal">La presentación la hace el titular o su gestor con certificado digital. Cuando ya esté presentada, anota aquí la fecha y la referencia del justificante (solo texto: no subas ni pegues el fichero).</p>
          <label className="campo">Fecha de presentación<input type="date" value={fecha} max={hoy} required onChange={(e) => setFecha(e.target.value)} /></label>
          <label className="campo">Referencia del justificante<input value={justificante} maxLength={60} required minLength={3} onChange={(e) => setJustificante(e.target.value)} placeholder="p. ej. 1234567890123 o CSV" /></label>
          {contabiliza && <label className="fila"><input type="checkbox" checked={pagar} onChange={(e) => setPagar(e.target.checked)} /> El importe ya está ingresado o domiciliado (generar también el asiento de pago contra bancos)</label>}
          <button type="submit" className="btn" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Registrar como presentado'}</button>
          {contabiliza && <p className="tenue">Se asentará la liquidación (IVA 477/472 → 4750/4700, a fecha de fin de periodo) y, si marcas el pago, 4750 o 4751 contra bancos (572) a la fecha de presentación.</p>}
        </form>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.texto}</p>}
    </div>
  )
}

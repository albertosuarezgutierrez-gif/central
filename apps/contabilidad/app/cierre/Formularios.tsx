'use client'
import { useState } from 'react'
import { enviar } from '../_enviar'
import { parsearImporte } from '@/lib/importes'

type Msg = { ok: boolean; texto: string } | null
const Mensaje = ({ m }: { m: Msg }) => (m ? <p className={m.ok ? 'ok' : 'error'} role="status">{m.texto}</p> : null)

export function FormPeriodificacion() {
  const hoy = new Date().toISOString().slice(0, 10)
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto')
  const [msg, setMsg] = useState<Msg>(null)
  const [enviando, setEnviando] = useState(false)
  async function alta(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const importe = parsearImporte(String(f.get('importe') ?? ''))
    if (importe === null || importe <= 0) { setMsg({ ok: false, texto: 'Importe no válido (usa 1.234,56)' }); return }
    setEnviando(true); setMsg(null)
    const r = await enviar('/api/cierre', {
      accion: 'periodificacion', ref: String(f.get('ref') ?? '').trim(), tipo, descripcion: String(f.get('descripcion') ?? ''), cuentaOrigen: String(f.get('cuenta') ?? '').trim(),
      importe, inicio: String(f.get('inicio') ?? ''), fin: String(f.get('fin') ?? ''),
    })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    setMsg({ ok: true, texto: 'Periodificación registrada.' })
    setTimeout(() => window.location.reload(), 700)
  }
  return (
    <form className="formulario" onSubmit={alta} noValidate>
      <fieldset>
        <legend>Nueva periodificación</legend>
        <div className="dos-col">
          <label className="campo">Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value as 'gasto' | 'ingreso')}><option value="gasto">Gasto pagado por adelantado (480)</option><option value="ingreso">Ingreso cobrado por adelantado (485)</option></select></label>
          <label className="campo">Referencia<input name="ref" maxLength={64} placeholder="SEG-2026" required /></label>
        </div>
        <label className="campo">Descripción<input name="descripcion" maxLength={200} required /></label>
        <div className="dos-col">
          <label className="campo">Cuenta donde se asentó el importe ({tipo === 'gasto' ? 'grupo 6' : 'grupo 7'})<input name="cuenta" inputMode="numeric" maxLength={12} placeholder={tipo === 'gasto' ? '625' : '705'} required /></label>
          <label className="campo">Importe total (€)<input name="importe" inputMode="decimal" placeholder="1.234,56" required /></label>
        </div>
        <div className="dos-col">
          <label className="campo">Periodo desde<input type="date" name="inicio" defaultValue={hoy} required /></label>
          <label className="campo">Periodo hasta<input type="date" name="fin" required /></label>
        </div>
        <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar'}</button>
        <Mensaje m={msg} />
      </fieldset>
    </form>
  )
}

export function AccionesCierre({ anio, puedeCerrar, esDueno }: { anio: number; puedeCerrar: boolean; esDueno: boolean }) {
  const [confirmar, setConfirmar] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [enviando, setEnviando] = useState(false)
  async function accion(cuerpo: Record<string, unknown>, ok: string) {
    setEnviando(true); setMsg(null)
    const r = await enviar('/api/cierre', { ...cuerpo, anio })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    setMsg({ ok: true, texto: r.datos.duplicado ? 'Ya estaba hecho.' : r.datos.sinNada ? 'No hay nada que periodificar.' : ok })
    setTimeout(() => window.location.reload(), 1000)
  }
  return (
    <div className="formulario">
      <fieldset>
        <legend>Acciones del ejercicio {anio}</legend>
        <p className="tenue">1) Asienta la amortización (Inmovilizado) y las periodificaciones. 2) Cierra el ejercicio: regulariza el resultado a la 129, cierra las cuentas y abre {anio + 1} con los mismos saldos.</p>
        <button type="button" className="btn btn-sec" disabled={enviando} onClick={() => accion({ accion: 'periodificar' }, 'Periodificaciones asentadas (480/485) y su reversa del 1 de enero.')}>Asentar periodificaciones al 31/12</button>
        {esDueno ? (
          <>
            <label className="casilla"><input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} /> <span>Entiendo que cerrar el ejercicio {anio} es <strong>definitivo</strong>: ya no admitirá asientos (los errores se corrigen con un contraasiento en un ejercicio abierto).</span></label>
            <button type="button" className="btn" disabled={enviando || !confirmar || !puedeCerrar} onClick={() => accion({ accion: 'cerrar', confirmar: true }, `Ejercicio ${anio} cerrado y ${anio + 1} abierto.`)}>{enviando ? 'Trabajando…' : `Cerrar el ejercicio ${anio}`}</button>
            {!puedeCerrar && <p className="tenue">El botón se activa cuando todas las comprobaciones obligatorias están en verde.</p>}
          </>
        ) : <p className="tenue">Solo el dueño puede cerrar el ejercicio.</p>}
        <Mensaje m={msg} />
      </fieldset>
    </div>
  )
}

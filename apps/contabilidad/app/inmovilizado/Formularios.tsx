'use client'
import { useState } from 'react'
import { enviar } from '../_enviar'
import { parsearImporte } from '@/lib/importes'
import { parsearPorcentajePb } from '@/lib/sociedades-form'

type Msg = { ok: boolean; texto: string } | null
export type CategoriaOpcion = { categoria: string; descripcion: string; porcentajeMaximoPb: number }

function Mensaje({ m }: { m: Msg }) {
  return m ? <p className={m.ok ? 'ok' : 'error'} role="status">{m.texto}</p> : null
}

/** Alta manual de un bien (otras verticales usan POST /api/inmovilizado con su propio origen). */
export function FormAlta({ categorias }: { categorias: readonly CategoriaOpcion[] }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [cat, setCat] = useState(categorias[0]?.categoria ?? '')
  const [msg, setMsg] = useState<Msg>(null)
  const [enviando, setEnviando] = useState(false)
  const maximo = categorias.find((c) => c.categoria === cat)?.porcentajeMaximoPb
  async function alta(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const valor = parsearImporte(String(f.get('valor') ?? ''))
    const residualTxt = String(f.get('residual') ?? '').trim()
    const residual = residualTxt === '' ? 0 : parsearImporte(residualTxt)
    const pctTxt = String(f.get('pct') ?? '').trim()
    const pb = pctTxt === '' ? undefined : parsearPorcentajePb(pctTxt)
    if (valor === null || valor <= 0) { setMsg({ ok: false, texto: 'Valor no válido (usa 1.234,56)' }); return }
    if (residual === null) { setMsg({ ok: false, texto: 'Valor residual no válido' }); return }
    if (pctTxt !== '' && pb === null) { setMsg({ ok: false, texto: 'Porcentaje no válido (0–100)' }); return }
    const sinFactura = f.get('sinFactura') === 'on'
    setEnviando(true); setMsg(null)
    const r = await enviar('/api/inmovilizado', {
      accion: 'alta', origen: 'manual', refExterna: `M-${Date.now().toString(36)}`, descripcion: String(f.get('descripcion') ?? ''), categoria: cat, fechaAlta: String(f.get('fecha') ?? ''),
      valorAdquisicion: valor, valorResidual: residual, ...(pb != null ? { porcentajePb: pb } : {}), ...(sinFactura ? { yaContabilizado: false, cuentaContrapartida: String(f.get('contrapartida') ?? '572') } : {}),
    })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    const avisos = (r.datos.avisos as string[] | undefined) ?? []
    setMsg({ ok: true, texto: ['Bien dado de alta.', ...avisos].join(' ') })
    setTimeout(() => window.location.reload(), avisos.length ? 3500 : 700)
  }
  return (
    <form className="formulario" onSubmit={alta} noValidate>
      <fieldset>
        <legend>Alta de un bien</legend>
        <label className="campo">Descripción<input name="descripcion" maxLength={200} required /></label>
        <div className="dos-col">
          <label className="campo">Categoría<select value={cat} onChange={(e) => setCat(e.target.value)}>{categorias.map((c) => <option key={c.categoria} value={c.categoria}>{c.descripcion}</option>)}</select></label>
          <label className="campo">Fecha de alta<input type="date" name="fecha" defaultValue={hoy} required /></label>
        </div>
        <div className="dos-col">
          <label className="campo">Valor de adquisición (€)<input name="valor" inputMode="decimal" placeholder="1.234,56" required /></label>
          <label className="campo">Valor residual (€, opcional)<input name="residual" inputMode="decimal" placeholder="0,00" /></label>
        </div>
        <label className="campo">% anual (opcional){maximo ? ` — máximo de la tabla: ${maximo / 100} %` : ''}<input name="pct" inputMode="decimal" placeholder={maximo ? String(maximo / 100).replace('.', ',') : ''} /></label>
        <label className="casilla"><input type="checkbox" name="sinFactura" /> <span>Este bien NO pasó por una factura asentada: asiento el alta ahora (Debe cuenta del activo / Haber contrapartida)</span></label>
        <label className="campo">Contrapartida del alta (solo si lo marcas arriba)<input name="contrapartida" defaultValue="572" maxLength={12} /></label>
        <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Dar de alta'}</button>
        <Mensaje m={msg} />
      </fieldset>
    </form>
  )
}

export function FormAmortizar({ anioPorDefecto }: { anioPorDefecto: number }) {
  const [anio, setAnio] = useState(String(anioPorDefecto))
  const [mes, setMes] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [enviando, setEnviando] = useState(false)
  async function amortizar(ev: React.FormEvent) {
    ev.preventDefault()
    setEnviando(true); setMsg(null)
    const r = await enviar('/api/inmovilizado', { accion: 'amortizar', anio: Number(anio), ...(mes ? { mes: Number(mes) } : {}) })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    setMsg({ ok: true, texto: r.datos.duplicado ? 'Ese periodo ya estaba asentado.' : r.datos.sinCuota ? 'No hay cuota que asentar en ese periodo.' : 'Amortización asentada.' })
    setTimeout(() => window.location.reload(), 900)
  }
  return (
    <form className="filtros" onSubmit={amortizar} noValidate>
      <label className="campo">Ejercicio<input type="number" min={2000} max={2200} value={anio} onChange={(e) => setAnio(e.target.value)} /></label>
      <label className="campo">Mes<select value={mes} onChange={(e) => setMes(e.target.value)}><option value="">Todo el año (un asiento anual)</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}</select></label>
      <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Asentando…' : 'Asentar amortización'}</button>
      <Mensaje m={msg} />
    </form>
  )
}

export function BajaActivo({ refActivo }: { refActivo: string }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [abierto, setAbierto] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [enviando, setEnviando] = useState(false)
  async function baja(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const pTxt = String(f.get('precio') ?? '').trim()
    const precio = pTxt === '' ? undefined : parsearImporte(pTxt)
    if (pTxt !== '' && precio === null) { setMsg({ ok: false, texto: 'Precio no válido (usa 1.234,56)' }); return }
    setEnviando(true); setMsg(null)
    const r = await enviar('/api/inmovilizado', { accion: 'baja', ref: refActivo, fecha: String(f.get('fecha') ?? ''), ...(precio != null ? { precioVenta: precio, cuentaContrapartida: String(f.get('contrapartida') ?? '572') } : {}) })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    setMsg({ ok: true, texto: 'Baja asentada.' })
    setTimeout(() => window.location.reload(), 700)
  }
  if (!abierto) return <button type="button" className="btn btn-sec" onClick={() => setAbierto(true)}>Baja / venta</button>
  return (
    <form className="pago-form" onSubmit={baja} noValidate>
      <label className="campo">Fecha<input type="date" name="fecha" defaultValue={hoy} /></label>
      <label className="campo">Precio de venta (€, vacío = retirada)<input name="precio" inputMode="decimal" placeholder="0,00" /></label>
      <label className="campo">Cobro en cuenta<select name="contrapartida" defaultValue="572"><option value="572">572 Bancos (cobrado)</option><option value="570">570 Caja</option><option value="440">440 Deudores (pendiente)</option></select></label>
      <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Confirmar baja'}</button>
      <button type="button" className="btn btn-sec" onClick={() => setAbierto(false)}>Cancelar</button>
      <Mensaje m={msg} />
    </form>
  )
}

export type FilaTablaEditable = { categoria: string; descripcion: string; cuentaActivo: string; cuentaAmortizacionAcumulada: string; cuentaGasto: string; porcentajeMaximoPb: number; periodoMaximoAnios: number }

/** Nueva versión de la tabla de amortización (solo el dueño). Las fichas ya dadas de alta conservan su porcentaje. */
export function EditarTabla({ filas }: { filas: FilaTablaEditable[] }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState(filas.map((f) => ({ ...f, pct: String(f.porcentajeMaximoPb / 100).replace('.', ',') })))
  const [msg, setMsg] = useState<Msg>(null)
  const [enviando, setEnviando] = useState(false)
  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    const filasOk: FilaTablaEditable[] = []
    for (const d of datos) {
      const pb = parsearPorcentajePb(d.pct)
      if (pb === null || pb === 0) { setMsg({ ok: false, texto: `Porcentaje no válido en ${d.descripcion}` }); return }
      filasOk.push({ categoria: d.categoria, descripcion: d.descripcion, cuentaActivo: d.cuentaActivo, cuentaAmortizacionAcumulada: d.cuentaAmortizacionAcumulada, cuentaGasto: d.cuentaGasto, porcentajeMaximoPb: pb, periodoMaximoAnios: d.periodoMaximoAnios })
    }
    setEnviando(true); setMsg(null)
    const r = await enviar('/api/inmovilizado', { accion: 'tabla', filas: filasOk })
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    setMsg({ ok: true, texto: 'Nueva versión de la tabla guardada.' })
    setTimeout(() => window.location.reload(), 700)
  }
  if (!abierto) return <button type="button" className="btn btn-sec" onClick={() => setAbierto(true)}>Editar la tabla</button>
  return (
    <form className="formulario" onSubmit={guardar} noValidate>
      <fieldset>
        <legend>Nueva versión de la tabla</legend>
        {datos.map((d, i) => (
          <div key={d.categoria} className="dos-col">
            <label className="campo">{d.descripcion} — % máximo<input inputMode="decimal" value={d.pct} onChange={(e) => setDatos(datos.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} /></label>
            <label className="campo">Periodo máximo (años)<input type="number" min={1} max={200} value={d.periodoMaximoAnios} onChange={(e) => setDatos(datos.map((x, j) => (j === i ? { ...x, periodoMaximoAnios: Number(e.target.value) } : x)))} /></label>
          </div>
        ))}
        <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar nueva versión'}</button>
        <button type="button" className="btn btn-sec" onClick={() => setAbierto(false)}>Cancelar</button>
        <Mensaje m={msg} />
      </fieldset>
    </form>
  )
}

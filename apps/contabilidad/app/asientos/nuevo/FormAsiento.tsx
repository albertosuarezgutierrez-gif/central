'use client'
import { useMemo, useState } from 'react'
import { formatearCentimos, parsearImporte } from '@/lib/importes'

type Cuenta = { codigo: string; nombre: string }
type Linea = { cuenta: string; debe: string; haber: string; documento: string }
const vacia = (): Linea => ({ cuenta: '', debe: '', haber: '', documento: '' })

/** Formulario del asiento manual: importes en formato español («1.234,56»), cuadre en vivo y validación final en el servidor. */
export function FormAsiento({ cuentas, ejercicios }: { cuentas: Cuenta[]; ejercicios: { anio: number; inicio: string; fin: string }[] }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const dentro = ejercicios.some((e) => hoy >= e.inicio && hoy <= e.fin)
  const [fecha, setFecha] = useState(dentro ? hoy : ejercicios[0].inicio)
  const [concepto, setConcepto] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([vacia(), vacia()])
  const [errores, setErrores] = useState<string[]>([])
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  const codigos = useMemo(() => new Set(cuentas.map((c) => c.codigo)), [cuentas])

  const parseadas = lineas.map((l) => ({ debe: l.debe.trim() ? parsearImporte(l.debe) : 0, haber: l.haber.trim() ? parsearImporte(l.haber) : 0 }))
  const debe = parseadas.reduce((s, p) => s + (p.debe ?? 0), 0)
  const haber = parseadas.reduce((s, p) => s + (p.haber ?? 0), 0)
  const formatoMal = parseadas.some((p) => p.debe === null || p.haber === null)
  const cuadra = !formatoMal && debe === haber && debe > 0

  const cambiar = (i: number, k: keyof Linea, v: string) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    setErrores([]); setOk('')
    const locales: string[] = []
    if (!concepto.trim()) locales.push('Escribe el concepto')
    lineas.forEach((l, i) => { if (!codigos.has(l.cuenta.trim())) locales.push(`Línea ${i + 1}: elige una cuenta del plan que admita apuntes`) })
    if (formatoMal) locales.push('Hay importes con formato no válido (usa 1.234,56)')
    if (!cuadra) locales.push('El asiento no cuadra: Debe y Haber deben sumar lo mismo')
    if (locales.length) { setErrores(locales); return }
    setEnviando(true)
    const r = await fetch('/api/asientos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fecha, concepto, apuntes: lineas.map((l, i) => ({ cuenta: l.cuenta.trim(), debe: parseadas[i].debe, haber: parseadas[i].haber, documento: l.documento })) }),
    })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setErrores(j.errores ?? [j.error ?? 'No se pudo guardar']); return }
    setOk(`Asiento nº ${j.numero} guardado.`)
    setConcepto(''); setLineas([vacia(), vacia()])
  }

  return (
    <form className="formulario" onSubmit={guardar} noValidate>
      <fieldset>
        <legend>Cabecera</legend>
        <div className="dos-col">
          <label className="campo">Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></label>
          <label className="campo">Concepto<input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={300} required /></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Apuntes</legend>
        <datalist id="cuentas-hoja">{cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</datalist>
        {lineas.map((l, i) => (
          <div key={i} className="linea-apunte">
            <label className="campo">Cuenta {i + 1}
              <input list="cuentas-hoja" inputMode="numeric" value={l.cuenta} onChange={(e) => cambiar(i, 'cuenta', e.target.value)} placeholder="p. ej. 572" />
              <span className="tenue" style={{ margin: 0, fontWeight: 400 }}>{cuentas.find((c) => c.codigo === l.cuenta.trim())?.nombre ?? ''}</span>
            </label>
            <label className="campo">Debe<input inputMode="decimal" value={l.debe} onChange={(e) => cambiar(i, 'debe', e.target.value)} placeholder="0,00" disabled={!!l.haber.trim()} /></label>
            <label className="campo">Haber<input inputMode="decimal" value={l.haber} onChange={(e) => cambiar(i, 'haber', e.target.value)} placeholder="0,00" disabled={!!l.debe.trim()} /></label>
            <button type="button" className="btn btn-sec" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} disabled={lineas.length <= 2} aria-label={`Quitar línea ${i + 1}`}>Quitar</button>
          </div>
        ))}
        <p className="fila"><button type="button" className="btn btn-sec" onClick={() => setLineas((ls) => [...ls, vacia()])} disabled={lineas.length >= 100}>Añadir línea</button></p>
        <p aria-live="polite">
          Debe <strong className="importe">{formatearCentimos(debe)}</strong> · Haber <strong className="importe">{formatearCentimos(haber)}</strong> ·{' '}
          <span className={cuadra ? 'cuadre ok' : 'cuadre mal'}>{formatoMal ? 'Importe no válido' : cuadra ? 'Cuadra' : `Descuadre ${formatearCentimos(Math.abs(debe - haber))}`}</span>
        </p>
      </fieldset>
      {errores.length > 0 && <div className="aviso-error" role="alert">{errores.map((e) => <div key={e}>{e}</div>)}</div>}
      {ok && <p className="ok" role="status">{ok}</p>}
      <p><button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar asiento'}</button></p>
    </form>
  )
}

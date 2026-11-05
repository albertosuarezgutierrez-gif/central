'use client'
import { useRef, useState } from 'react'
import { totalesFactura } from '@central/module-contabilidad'
import { formatearCentimos, parsearImporte } from '@/lib/importes'

type Opcion = { clave: string; etiqueta: string }
type Linea = { base: string; tipoIva: string; categoria: string }
const vacia = (categoria = ''): Linea => ({ base: '', tipoIva: '21', categoria })
const IVA = ['21', '10', '4', '0']

/** Alta manual de una factura recibida: líneas por tipo de IVA, retención, categoría sugerida por proveedor recordado. El adjunto es solo una referencia. */
export function FormCompra({ categorias, proveedores }: { categorias: Opcion[]; proveedores: { nif: string; nombre: string }[] }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [nif, setNif] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'proveedor' | 'acreedor'>('proveedor')
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [lineas, setLineas] = useState<Linea[]>([vacia()])
  const [retencion, setRetencion] = useState('')
  const [adjunto, setAdjunto] = useState('')
  const [sugerido, setSugerido] = useState('')
  const [errores, setErrores] = useState<string[]>([])
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ultimoNif = useRef('')

  const bases = lineas.map((l) => (l.base.trim() ? parsearImporte(l.base) : 0))
  const ret = retencion.trim() ? Number(retencion.replace(',', '.')) : 0
  const retOk = Number.isFinite(ret) && ret >= 0 && ret <= 100
  const formatoMal = bases.some((b) => b === null) || !retOk
  const tot = !formatoMal && bases.some((b) => (b ?? 0) > 0)
    ? totalesFactura(lineas.map((l, i) => ({ base: bases[i] ?? 0, tipoIva: Number(l.tipoIva) })), ret) : null

  const cambiar = (i: number, k: keyof Linea, v: string) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  async function alSalirDelNif() {
    const limpio = nif.trim()
    if (limpio.length < 8 || limpio === ultimoNif.current) return
    ultimoNif.current = limpio
    const r = await fetch(`/api/compras/proveedor?nif=${encodeURIComponent(limpio)}`).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { proveedor?: { nombre: string; tipo: 'proveedor' | 'acreedor'; categoria: string | null; retencionPct: number | null } | null } | null
    const p = j?.proveedor
    if (!p) { setSugerido(''); return }
    if (!nombre.trim()) setNombre(p.nombre)
    setTipo(p.tipo)
    if (p.retencionPct && !retencion.trim()) setRetencion(String(p.retencionPct))
    if (p.categoria) setLineas((ls) => ls.map((l, i) => (i === 0 && !l.categoria ? { ...l, categoria: p.categoria as string } : l)))
    setSugerido(`Proveedor recordado: ${p.nombre}${p.categoria ? ` · categoría habitual «${categorias.find((c) => c.clave === p.categoria)?.etiqueta ?? p.categoria}»` : ''}${p.retencionPct ? ` · retención ${p.retencionPct} %` : ''}. Puedes cambiarlo.`)
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    setErrores([]); setOk('')
    const locales: string[] = []
    if (formatoMal) locales.push('Hay importes o una retención con formato no válido (usa 1.234,56)')
    if (!tot) locales.push('Escribe al menos una base mayor que cero')
    if (locales.length) { setErrores(locales); return }
    setEnviando(true)
    const r = await fetch('/api/compras', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proveedor: { nif, nombre, tipo }, numero, fecha, retencionPct: retencion.trim() ? ret : undefined, adjuntoRef: adjunto,
        lineas: lineas.map((l, i) => ({ base: bases[i] ?? 0, tipoIva: Number(l.tipoIva), categoria: l.categoria || undefined })).filter((l) => l.base > 0),
      }),
    })
    const j = (await r.json().catch(() => ({}))) as { errores?: string[]; error?: string; total?: number; aPagar?: number }
    setEnviando(false)
    if (!r.ok) { setErrores(j.errores ?? [j.error ?? 'No se pudo guardar']); return }
    setOk(`Factura asentada: total ${formatearCentimos(j.total ?? 0)}, a pagar ${formatearCentimos(j.aPagar ?? 0)}.`)
    setNumero(''); setLineas([vacia()]); setAdjunto(''); setSugerido('')
    setTimeout(() => window.location.reload(), 900)
  }

  return (
    <form className="formulario" onSubmit={guardar} noValidate>
      <fieldset>
        <legend>Proveedor</legend>
        <datalist id="proveedores-conocidos">{proveedores.map((p) => <option key={p.nif} value={p.nif}>{p.nombre}</option>)}</datalist>
        <div className="dos-col">
          <label className="campo">NIF / CIF<input list="proveedores-conocidos" value={nif} onChange={(e) => setNif(e.target.value)} onBlur={alSalirDelNif} maxLength={20} autoComplete="off" required /></label>
          <label className="campo">Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} required /></label>
        </div>
        <label className="campo">Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'proveedor' | 'acreedor')}>
            <option value="proveedor">Proveedor (mercancías y suministros, cuenta 400)</option>
            <option value="acreedor">Acreedor / profesional (servicios, cuenta 410)</option>
          </select>
        </label>
        {sugerido && <p className="tenue" role="status">{sugerido}</p>}
      </fieldset>
      <fieldset>
        <legend>Factura</legend>
        <div className="dos-col">
          <label className="campo">Nº de factura (del proveedor)<input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} required /></label>
          <label className="campo">Fecha de la factura<input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required /></label>
        </div>
        {lineas.map((l, i) => (
          <div key={i} className="linea-compra">
            <label className="campo">Base {i + 1} (€)<input inputMode="decimal" value={l.base} onChange={(e) => cambiar(i, 'base', e.target.value)} placeholder="0,00" /></label>
            <label className="campo">IVA<select value={l.tipoIva} onChange={(e) => cambiar(i, 'tipoIva', e.target.value)}>{IVA.map((t) => <option key={t} value={t}>{t} %</option>)}</select></label>
            <label className="campo">Categoría
              <select value={l.categoria} onChange={(e) => cambiar(i, 'categoria', e.target.value)}>
                <option value="">Sin categoría (gasto por defecto)</option>
                {categorias.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-sec" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} disabled={lineas.length <= 1} aria-label={`Quitar línea ${i + 1}`}>Quitar</button>
          </div>
        ))}
        <p className="fila"><button type="button" className="btn btn-sec" onClick={() => setLineas((ls) => [...ls, vacia(ls.at(-1)?.categoria)])} disabled={lineas.length >= 50}>Añadir línea (otro tipo de IVA o categoría)</button></p>
        <div className="dos-col">
          <label className="campo">Retención IRPF (%) — solo profesionales<input inputMode="decimal" value={retencion} onChange={(e) => setRetencion(e.target.value)} placeholder="p. ej. 15" /></label>
          <label className="campo">Referencia del documento (opcional)<input value={adjunto} onChange={(e) => setAdjunto(e.target.value)} maxLength={300} placeholder="p. ej. nombre del PDF o enlace" /></label>
        </div>
        <p className="tenue">La referencia solo se guarda como texto; el fichero no se sube a ningún sitio.</p>
        <p aria-live="polite">
          {tot ? (
            <>Base <strong className="importe">{formatearCentimos(tot.base)}</strong> · IVA <strong className="importe">{formatearCentimos(tot.cuota)}</strong>
              {tot.retencion > 0 && <> · Retención <strong className="importe">−{formatearCentimos(tot.retencion)}</strong></>} · Total <strong className="importe">{formatearCentimos(tot.total)}</strong> · A pagar <strong className="importe">{formatearCentimos(tot.aPagar)}</strong></>
          ) : formatoMal ? <span className="cuadre mal">Importe no válido</span> : <span className="tenue">Escribe las bases para ver los totales.</span>}
        </p>
      </fieldset>
      {errores.length > 0 && <div className="aviso-error" role="alert">{errores.map((e) => <div key={e}>{e}</div>)}</div>}
      {ok && <p className="ok" role="status">{ok}</p>}
      <p><button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar factura'}</button></p>
    </form>
  )
}

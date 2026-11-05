'use client'
import { useState } from 'react'

type Cabeceras = { separador: string; cabeceras: string[]; sugerido: Record<string, string> }
type Mapeo = { fecha: string; concepto: string; importe: string; cargo: string; abono: string }

/** Subida de un extracto: Norma 43 (se lee tal cual) o CSV (primero se elige qué columna es cada dato). El fichero no se guarda: solo sus movimientos. */
export function ImportarExtracto() {
  const [formato, setFormato] = useState<'norma43' | 'csv'>('norma43')
  const [texto, setTexto] = useState('')
  const [nombre, setNombre] = useState('')
  const [cuentaRef, setCuentaRef] = useState('')
  const [cab, setCab] = useState<Cabeceras | null>(null)
  const [mapeo, setMapeo] = useState<Mapeo>({ fecha: '', concepto: '', importe: '', cargo: '', abono: '' })
  const [dosColumnas, setDosColumnas] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string[] } | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function alElegirFichero(f: File | undefined) {
    setMsg(null); setCab(null)
    if (!f) return
    const t = await f.text()
    setTexto(t); setNombre(f.name)
    const csv = /\.(csv|txt)$/i.test(f.name) && !/^11\d{16}/.test(t.trimStart())
    const fmt = csv ? 'csv' : 'norma43'
    setFormato(fmt)
    if (fmt === 'csv') await cargarCabeceras(t)
  }

  async function cargarCabeceras(t: string) {
    const r = await fetch('/api/banco/importar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'cabeceras', texto: t }) })
    const j = (await r.json().catch(() => null)) as Cabeceras | null
    if (!r.ok || !j) { setMsg({ ok: false, texto: ['No se pudieron leer las cabeceras del CSV'] }); return }
    setCab(j)
    const s = j.sugerido
    setMapeo({ fecha: s.fecha ?? '', concepto: s.concepto ?? '', importe: s.importe ?? '', cargo: s.cargo ?? '', abono: s.abono ?? '' })
    setDosColumnas(!s.importe && !!(s.cargo || s.abono))
  }

  async function importar(ev: React.FormEvent) {
    ev.preventDefault()
    setMsg(null)
    if (!texto) { setMsg({ ok: false, texto: ['Elige un fichero'] }); return }
    const m = formato === 'csv'
      ? { fecha: mapeo.fecha, concepto: mapeo.concepto, ...(dosColumnas ? { cargo: mapeo.cargo || undefined, abono: mapeo.abono || undefined } : { importe: mapeo.importe }) }
      : undefined
    setEnviando(true)
    const r = await fetch('/api/banco/importar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'importar', formato, texto, mapeo: m, cuentaRef: cuentaRef.trim() || undefined }) })
    const j = (await r.json().catch(() => ({}))) as { nuevos?: number; repetidos?: number; avisos?: string[]; errores?: string[]; error?: string }
    setEnviando(false)
    if (!r.ok) { setMsg({ ok: false, texto: j.errores ?? [j.error ?? 'No se pudo importar'] }); return }
    setMsg({ ok: true, texto: [`${j.nuevos} movimientos nuevos, ${j.repetidos} ya estaban importados.`, ...(j.avisos ?? [])] })
    setTimeout(() => window.location.reload(), 1200)
  }

  const col = (k: keyof Mapeo, etiqueta: string, opcional = false) => (
    <label className="campo">{etiqueta}
      <select value={mapeo[k]} onChange={(e) => setMapeo({ ...mapeo, [k]: e.target.value })}>
        <option value="">{opcional ? '— ninguna —' : 'Elige columna'}</option>
        {cab?.cabeceras.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  )

  return (
    <form className="formulario" onSubmit={importar} noValidate>
      <fieldset>
        <legend>Importar extracto</legend>
        <label className="campo">Fichero (Norma 43 o CSV)<input type="file" accept=".txt,.csv,.n43,.c43,text/plain,text/csv" onChange={(e) => void alElegirFichero(e.target.files?.[0])} /></label>
        {nombre && <p className="tenue">{nombre} · formato detectado: {formato === 'csv' ? 'CSV' : 'Norma 43'}. <button type="button" className="btn btn-sec" onClick={() => { const f = formato === 'csv' ? 'norma43' : 'csv'; setFormato(f); setCab(null); if (f === 'csv' && texto) void cargarCabeceras(texto) }}>Cambiar a {formato === 'csv' ? 'Norma 43' : 'CSV'}</button></p>}
        {formato === 'csv' && (
          <label className="campo">Nombre de la cuenta (para distinguir bancos)<input value={cuentaRef} onChange={(e) => setCuentaRef(e.target.value)} maxLength={60} placeholder="p. ej. Caja Rural c/c" /></label>
        )}
        {formato === 'csv' && cab && (
          <>
            <p className="tenue">Separador detectado: «{cab.separador === '\t' ? 'tabulador' : cab.separador}». Dime qué columna es cada dato.</p>
            <div className="dos-col">{col('fecha', 'Fecha')}{col('concepto', 'Concepto')}</div>
            <label className="check"><input type="checkbox" checked={dosColumnas} onChange={(e) => setDosColumnas(e.target.checked)} /> El importe viene en dos columnas (cargo y abono)</label>
            <div className="dos-col">{dosColumnas ? <>{col('cargo', 'Cargo / Debe', true)}{col('abono', 'Abono / Haber', true)}</> : col('importe', 'Importe (con signo)')}</div>
          </>
        )}
      </fieldset>
      {msg && <div className={msg.ok ? 'ok' : 'aviso-error'} role="status">{msg.texto.map((t) => <div key={t}>{t}</div>)}</div>}
      <p><button type="submit" className="btn" disabled={enviando || !texto}>{enviando ? 'Importando…' : 'Importar movimientos'}</button></p>
      <p className="tenue">Reimportar un extracto no duplica nada. La conexión directa con el banco (PSD2) todavía no está disponible.</p>
    </form>
  )
}

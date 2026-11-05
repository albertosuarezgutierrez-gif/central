'use client'
import { useState } from 'react'

type Fila = { clave: string; etiqueta: string; valor: string; base: string; propia: boolean; procedencia: 'empresa' | 'sector' | 'generica' }
const ORIGEN = { empresa: 'Tu regla', sector: 'Plantilla del sector', generica: 'Genérica' } as const

/** Un tipo de hecho: edita las cuentas y guarda una VERSIÓN NUEVA (solo cambios respecto a la plantilla + lo que ya era tuyo). */
export function FormRegla({ tipo, titulo, filas, admiteCategorias, puedeEditar }: { tipo: string; titulo: string; filas: Fila[]; admiteCategorias: boolean; puedeEditar: boolean }) {
  const [valores, setValores] = useState<Record<string, string>>(Object.fromEntries(filas.map((f) => [f.clave, f.valor])))
  const [nuevas, setNuevas] = useState<{ nombre: string; cuenta: string }[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    const cuentas: Record<string, string> = {}
    for (const f of filas) {
      const v = (valores[f.clave] ?? '').trim()
      if (v !== f.base || f.propia) cuentas[f.clave] = v
    }
    for (const n of nuevas) if (n.nombre.trim() || n.cuenta.trim()) cuentas[`categoria:${n.nombre.trim().toLowerCase().replace(/\s+/g, '_')}`] = n.cuenta.trim()
    if (Object.keys(cuentas).length === 0) { setMsg({ ok: false, texto: 'No hay cambios respecto a la plantilla.' }); return }
    setEnviando(true); setMsg(null)
    try {
      const r = await fetch('/api/reglas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo, cuentas }) })
      const j = (await r.json().catch(() => ({}))) as { version?: number; errores?: string[]; error?: string }
      if (r.ok) { setMsg({ ok: true, texto: `Guardado (versión ${j.version}). Se aplica a los movimientos nuevos; los asientos ya hechos no cambian.` }); setTimeout(() => window.location.reload(), 900) }
      else setMsg({ ok: false, texto: (j.errores ?? [j.error ?? 'No se pudo guardar']).join(' · ') })
    } finally { setEnviando(false) }
  }

  return (
    <details className="seccion" style={{ marginBottom: 12 }}>
      <summary>{titulo}</summary>
      <form className="seccion-cuerpo" onSubmit={guardar}>
        {filas.map((f) => (
          <div key={f.clave} className="reglas-fila">
            <label htmlFor={`${tipo}-${f.clave}`}>{f.etiqueta}</label>
            <input id={`${tipo}-${f.clave}`} inputMode="numeric" pattern="[1-9][0-9]{2,11}" list="cuentas-hoja" value={valores[f.clave] ?? ''} disabled={!puedeEditar} onChange={(e) => setValores({ ...valores, [f.clave]: e.target.value })} />
            <span className="tenue">{ORIGEN[f.procedencia]}</span>
          </div>
        ))}
        {admiteCategorias && puedeEditar && (
          <>
            {nuevas.map((n, i) => (
              <div key={i} className="reglas-fila">
                <input aria-label="Nombre de la categoría" placeholder="categoría (p. ej. mano_obra)" value={n.nombre} onChange={(e) => setNuevas(nuevas.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} style={{ maxWidth: 'none' }} />
                <input aria-label="Cuenta" inputMode="numeric" list="cuentas-hoja" placeholder="cuenta" value={n.cuenta} onChange={(e) => setNuevas(nuevas.map((x, j) => (j === i ? { ...x, cuenta: e.target.value } : x)))} />
              </div>
            ))}
            <button type="button" className="btn btn-sec" onClick={() => setNuevas([...nuevas, { nombre: '', cuenta: '' }])}>Añadir categoría</button>
          </>
        )}
        {puedeEditar
          ? <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar regla'}</button>
          : <p className="tenue">Solo el dueño de la empresa puede cambiar las reglas.</p>}
        {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.texto}</p>}
      </form>
    </details>
  )
}

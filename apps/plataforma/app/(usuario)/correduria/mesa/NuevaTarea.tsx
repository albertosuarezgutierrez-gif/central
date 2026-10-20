'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import SelectorCliente, { type ClienteElegido } from './SelectorCliente'

/**
 * Tipos de negocio de Alberto → `gestion_tipo` de la BD (`tarea|llamada|email|whatsapp`, sin columna para
 * «emisión», «siniestro»…). El tipo de negocio no cabe en la columna: va como PREFIJO del texto.
 */
export const TIPOS_ALTA: { valor: string; rotulo: string; prefijo: string }[] = [
  { valor: 'emision', rotulo: 'Emisión', prefijo: 'Emisión: ' },
  { valor: 'modificacion', rotulo: 'Modificación', prefijo: 'Modificación: ' },
  { valor: 'siniestro', rotulo: 'Siniestro', prefijo: 'Siniestro: ' },
  { valor: 'presupuesto', rotulo: 'Presupuesto', prefijo: 'Presupuesto: ' },
  { valor: 'otro', rotulo: 'Otro', prefijo: '' },
]

/** Texto de la tarea: prefijo del tipo + lo escrito, sin duplicar el prefijo si ya lo teclea. */
export function textoTarea(tipo: string, que: string): string {
  const t = que.trim()
  const p = TIPOS_ALTA.find(x => x.valor === tipo)?.prefijo ?? ''
  return p !== '' && !t.toLowerCase().startsWith(p.toLowerCase()) ? `${p}${t}` : t
}

const CAMPO: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 10px', fontSize: 16 }

/** Alta rápida de tarea desde Mi mesa (`POST /api/correduria/tareas`, siempre con cliente). */
export default function NuevaTarea({ hoy, onCerrar, onGuardada }: { hoy: string; onCerrar: () => void; onGuardada: () => Promise<void> }) {
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)
  const [que, setQue] = useState('')
  const [tipo, setTipo] = useState('otro')
  const [fecha, setFecha] = useState(hoy)
  const [prioridad, setPrioridad] = useState<'alta' | 'media' | 'baja'>('media')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cierre = useRef<HTMLButtonElement>(null)
  const cerrarRef = useRef(onCerrar)
  useEffect(() => { cerrarRef.current = onCerrar }, [onCerrar])

  useEffect(() => {
    cierre.current?.focus()
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current() }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [])

  const valido = cliente !== null && que.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || !cliente || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/tareas', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId: cliente.clienteId, tipo: 'tarea', prioridad, fechaLimite: fecha, observaciones: textoTarea(tipo, que) }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (r.ok && j?.estado !== 'error' && j?.estado !== 'invalido') {
        await onGuardada() // recarga sin desmontar la mesa
        onCerrar()
        return
      }
      // 5xx/red: pudo guardarse y cortarse la respuesta; no se invita a repetir a ciegas.
      setError(r.status >= 500 ? 'No se ha podido confirmar si se guardó: recarga la mesa para verlo antes de repetirlo.' : `No se ha guardado: ${j?.motivo ?? `HTTP ${r.status}`}`)
    } catch {
      setError('No se ha podido confirmar si se guardó: recarga la mesa para verlo antes de repetirlo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div role="presentation" onMouseDown={ev => { if (ev.target === ev.currentTarget) onCerrar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
      <div role="dialog" aria-modal="true" aria-label="Nueva tarea"
        style={{ width: '95vw', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)', borderRadius: 16, border: '1px solid var(--border)', padding: 16, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Nueva tarea</h2>
          <button ref={cierre} type="button" onClick={onCerrar} aria-label="Cerrar" style={{ ...btnStyle('sutil'), minWidth: 44, padding: 0 }}><X size={20} aria-hidden /></button>
        </div>

        {cliente === null ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Cliente</span>
            <SelectorCliente onSelect={setCliente} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Cliente:</span>
            <strong style={{ overflowWrap: 'anywhere' }}>{cliente.nombre}</strong>
            <button type="button" onClick={() => setCliente(null)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Cambiar</button>
          </div>
        )}

        <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Qué hay que hacer
            <textarea value={que} onChange={ev => setQue(ev.target.value)} rows={3} maxLength={480} required
              style={{ ...CAMPO, minHeight: 80, padding: 10, fontFamily: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Tipo
            <select value={tipo} onChange={ev => setTipo(ev.target.value)} style={CAMPO}>
              {TIPOS_ALTA.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Fecha
              <input type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} required style={CAMPO} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Prioridad
              <select value={prioridad} onChange={ev => setPrioridad(ev.target.value as 'alta' | 'media' | 'baja')} style={CAMPO}>
                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select>
            </label>
          </div>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCerrar} style={btnStyle('secundario')}>Cancelar</button>
            <button type="submit" disabled={!valido || enviando} style={btnStyle('primario')}>{enviando ? 'Guardando…' : 'Guardar tarea'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

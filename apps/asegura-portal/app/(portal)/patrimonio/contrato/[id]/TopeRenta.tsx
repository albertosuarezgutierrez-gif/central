'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para hacer esto en este contrato.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const fila: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }

/**
 * Tope de la actualización (decisión de Alberto, 24/10/2026): el cliente puede cambiar el límite legal que usamos para
 * proponer la subida de la renta de SU contrato. Por defecto, el del catálogo del año (lo revisa un agente fiscal).
 */
export function TopeRenta(props: { contratoId: string; modo: 'defecto' | 'propio' | 'sin_tope'; pctPropio: number | null }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [modo, setModo] = useState(props.modo)
  const [pct, setPct] = useState(props.pctPropio === null ? '' : String(props.pctPropio).replace('.', ','))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/contratos/${props.contratoId}/tope`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modo === 'propio' ? { modo, pct: pct.trim() } : { modo }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; campo?: string }
      if (res.ok) {
        setAbierto(false)
        router.refresh()
        return
      }
      setError(
        j.campo === 'pct'
          ? 'Escribe un porcentaje entre 0 y 100, con hasta dos decimales.'
          : (ERRORES[j.error ?? ''] ?? 'No hemos podido guardarlo. Inténtalo de nuevo.'),
      )
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" className="boton-secundario" style={{ minHeight: 44 }} onClick={() => setAbierto(true)}>
        Cambiar el tope
      </button>
    )
  }
  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 8 }}>
      <label style={etiqueta}>
        ¿Qué tope usamos?
        <select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} style={{ minHeight: 44, maxWidth: '100%' }}>
          <option value="defecto">El de la ley de ese año (el que tenemos)</option>
          <option value="propio">El mío</option>
          <option value="sin_tope">Sin tope</option>
        </select>
      </label>
      {modo === 'propio' && (
        <label style={etiqueta}>
          Tope máximo de subida (%)
          <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="2,5" style={{ minHeight: 44 }} />
        </label>
      )}
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div style={fila}>
        <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={enviando || (modo === 'propio' && pct.trim() === '')}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={enviando} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

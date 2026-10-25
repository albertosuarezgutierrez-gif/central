'use client'
import { useState } from 'react'

import { ERRORES_OFERTA, type TipoOferta } from '@/lib/patrimonio/ofertas'

/**
 * Tarjeta con UN botón: el cliente pide (`POST /api/patrimonio/ofertas`). 🚨 Nada se envía sin pulsarlo, y pulsarlo solo crea
 * una petición que la correduría ve en su pantalla (no manda correo ni mensaje). Un fallo NUNCA se pinta como «pedido».
 */
export function OfertaBoton({
  tipo,
  objeto,
  titulo,
  texto,
  boton,
}: {
  tipo: TipoOferta
  /** Ids del objeto pedido; el servidor los busca dentro de lo que ve esta sesión. */
  objeto: { inmuebleId?: string; contratoId?: string; polizaDeclaradaId?: string }
  titulo: string
  texto: string
  boton: string
}) {
  const [estado, setEstado] = useState<null | 'pedido' | 'ya_pedido'>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pedir() {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/patrimonio/ofertas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo, ...objeto }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; yaExistia?: boolean }
      if (!res.ok) {
        setError(ERRORES_OFERTA[j.error ?? ''] ?? 'No se ha podido enviar. Inténtalo de nuevo.')
        return
      }
      setEstado(j.yaExistia ? 'ya_pedido' : 'pedido')
    } catch {
      setError('No se ha podido enviar. Revisa tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="aviso-linea" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)', overflowWrap: 'anywhere' }}>
      <strong>{titulo}</strong>
      {estado === null ? (
        <>
          <span>{texto} Solo te contactaremos por esta petición que haces tú.</span>
          <div>
            <button type="button" className="boton" style={{ minHeight: 44 }} disabled={enviando} onClick={pedir}>
              {boton}
            </button>
          </div>
        </>
      ) : (
        <span role="status">
          {estado === 'ya_pedido'
            ? 'Ya lo habías pedido: el equipo de Grupo ASegura lo tiene en marcha.'
            : 'Hecho. El equipo de Grupo ASegura ha recibido tu petición y se pondrá en contacto contigo.'}
        </span>
      )}
      {error && <span role="alert" className="error">{error}</span>}
    </div>
  )
}

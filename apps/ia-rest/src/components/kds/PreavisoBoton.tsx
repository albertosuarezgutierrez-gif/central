'use client'
import { useState } from 'react'
import { C, SM } from '@/lib/colors'

type EstadoPreaviso = 'enviado' | 'mesa_lista' | 'servido' | 'cancelado'

type Props = {
  comandaId: string
  /** estado del preaviso de esta comanda, si existe */
  estadoPreaviso?: EstadoPreaviso
  /** headers de sesión firmada del KDS (mismo patrón que el resto de fetch del KDS) */
  sh: () => Record<string, string>
}

/**
 * Botón "📣 Preaviso" para la tarjeta del KDS.
 * - Sin preaviso → botón que hace POST /api/preaviso.
 * - 'enviado'    → "Preaviso enviado ⏳".
 * - 'mesa_lista' → "Mesa lista ✅ emplatar".
 * Solo se monta si preaviso_activo está on (gate en la pantalla KDS).
 */
export default function PreavisoBoton({ comandaId, estadoPreaviso, sh }: Props) {
  const [loading, setLoading] = useState(false)

  async function enviar(e: React.MouseEvent) {
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      await fetch('/api/preaviso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ comanda_id: comandaId }),
      })
    } catch { /* el Realtime refresca el estado; un fallo puntual no rompe el KDS */ }
    finally { setLoading(false) }
  }

  if (estadoPreaviso === 'mesa_lista' || estadoPreaviso === 'servido') {
    return (
      <span style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: C.green }}>
        Mesa lista ✅ emplatar
      </span>
    )
  }

  if (estadoPreaviso === 'enviado') {
    return (
      <span style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: C.amber }}>
        Preaviso enviado ⏳
      </span>
    )
  }

  return (
    <button
      onClick={enviar}
      disabled={loading}
      style={{
        background: C.amber, color: C.dark, border: 'none', borderRadius: 8,
        padding: '6px 12px', fontFamily: SM, fontSize: 11, fontWeight: 700,
        letterSpacing: '.04em', cursor: loading ? 'wait' : 'pointer',
      }}
    >
      {loading ? '…' : '📣 Preaviso'}
    </button>
  )
}

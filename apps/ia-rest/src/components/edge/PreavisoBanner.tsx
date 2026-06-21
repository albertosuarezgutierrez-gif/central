'use client'
import { useState } from 'react'
import { C, SN } from '@/lib/colors'
import { textoPreaviso, type PlatoLinea } from '@/lib/preaviso'

export type PreavisoEntrante = { id: string; mesa: string; platos: PlatoLinea[] }

type Props = {
  preaviso: PreavisoEntrante
  /** headers de sesión firmada (mismo patrón que el resto de fetch de /edge) */
  sh: () => Record<string, string>
  /** se llama al confirmar 'mesa_lista' para retirar el banner de la cola */
  onHecho: (id: string) => void
}

/**
 * Banner que aparece en /edge cuando cocina lanza un preaviso para la mesa del
 * camarero. Botón "Mesa lista" → PATCH /api/preaviso { accion: 'mesa_lista' }.
 */
export default function PreavisoBanner({ preaviso, sh, onHecho }: Props) {
  const [loading, setLoading] = useState(false)

  async function confirmar() {
    if (loading) return
    setLoading(true)
    try {
      await fetch('/api/preaviso', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ preaviso_id: preaviso.id, accion: 'mesa_lista' }),
      })
      onHecho(preaviso.id)
    } catch {
      // si falla la red, dejamos el banner para que el camarero reintente
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: C.bg3, borderLeft: `4px solid ${C.amber}`, borderRadius: 8,
      padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontFamily: SN, fontSize: 14, color: C.ink2, lineHeight: 1.4 }}>
        📣 {textoPreaviso(preaviso.mesa, preaviso.platos)} — monta la mesa
      </span>
      <button
        onClick={confirmar}
        disabled={loading}
        style={{
          flexShrink: 0, background: C.green, color: C.paper, border: 'none', borderRadius: 8,
          padding: '8px 14px', fontFamily: SN, fontSize: 14, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? '…' : 'Mesa lista'}
      </button>
    </div>
  )
}

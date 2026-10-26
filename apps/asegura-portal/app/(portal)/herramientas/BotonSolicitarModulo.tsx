'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { ModuloPortal } from '@central/module-seguros-portal'

const ERRORES: Record<string, string> = {
  no_admite: 'Este módulo no se puede pedir ahora mismo.',
  sin_comprobar: 'No hemos podido comprobarlo ahora mismo. Inténtalo en un rato.',
  modo_corredor: 'En la vista de corredor no se puede pedir nada.',
}

/** Pide (o apunta a) un módulo. La identidad la pone la cookie; aquí solo viaja el id del módulo. */
export function BotonSolicitarModulo({
  modulo,
  rotulo,
  variante = 'boton',
}: {
  modulo: ModuloPortal
  rotulo: string
  /** `enlace`: la solicitud como acción SECUNDARIA (texto subrayado de 44 px), no un segundo botón primario. */
  variante?: 'boton' | 'enlace'
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pedir() {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/modulos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modulo }),
      })
      const d = (await res.json().catch(() => null)) as { estado?: string; error?: string } | null
      // `ya_solicitado` (409) no es un fallo para quien lo ve: la tarjeta pasará a «Lo pediste el…».
      if (res.ok || d?.estado === 'ya_solicitado') {
        router.refresh()
        return
      }
      setError(ERRORES[d?.estado ?? d?.error ?? ''] ?? 'No se ha podido enviar. Inténtalo de nuevo.')
    } catch {
      setError('No se ha podido enviar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button type="button" className={variante === 'enlace' ? 'enlace-boton' : 'boton'} onClick={pedir} disabled={enviando} aria-busy={enviando}>
        {enviando ? 'Enviando…' : rotulo}
      </button>
      {error && <p role="alert" className="aviso-linea">{error}</p>}
    </>
  )
}

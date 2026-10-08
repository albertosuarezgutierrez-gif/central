'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookUser } from 'lucide-react'
import { btnStyle } from '@/components/ui'

/**
 * Aviso pequeño en la pestaña Clientes (05/10/2026): Google Contactos se gestiona en su vista
 * (`/correduria/google-contactos`, menú «…»). Aquí solo se enseña algo si HAY que ir: revisiones
 * pendientes o la conexión revocada/con error. Si el estado no se puede leer no se pinta nada (no se
 * afirma «0 pendientes»: simplemente no se avisa, y la vista sigue en el menú).
 */
export default function AvisoGoogleContactos() {
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/google-contactos-sync', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { conectada?: boolean; estado?: string; revisionesPendientes?: number } | null) => {
        if (!vivo || !j || j.conectada !== true) return
        const partes: string[] = []
        if (j.estado === 'revocada' || j.estado === 'error') partes.push(j.estado === 'revocada' ? 'la conexión está revocada' : 'la conexión tiene un error')
        const n = j.revisionesPendientes
        if (typeof n === 'number' && n > 0) partes.push(`${n.toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)} ${n === 1 ? 'revisión pendiente' : 'revisiones pendientes'}`)
        setAviso(partes.length ? `Google Contactos: ${partes.join(' y ')}.` : null)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!aviso) return null
  return (
    <div role="note" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 16, padding: 10, border: '1px solid var(--warning)', background: 'var(--warning-bg)', borderRadius: 12, fontSize: 13 }}>
      <BookUser size={15} strokeWidth={1.75} aria-hidden style={{ color: 'var(--warning)' }} />
      <span style={{ flex: '1 1 12rem', minWidth: 0, overflowWrap: 'anywhere' }}>{aviso}</span>
      <Link href="/correduria/google-contactos" style={{ ...btnStyle('secundario'), minHeight: 44, textDecoration: 'none' }}>Ver</Link>
    </div>
  )
}

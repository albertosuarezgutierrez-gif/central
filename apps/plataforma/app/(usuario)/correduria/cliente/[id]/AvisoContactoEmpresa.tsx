'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import type { AvisoContactoEmpresa as Aviso } from '@/lib/contacto-empresa'

/**
 * Una EMPRESA sin correo y sin persona de contacto autorizada: los presupuestos y avisos no salen por correo.
 * Marcar a alguien como contacto autorizado ANOTA una autorización (PATCH del puerto de relaciones, auditado en
 * asegura); no envía nada y nace PENDIENTE hasta que la persona la acepte en su portal.
 */
export default function AvisoContactoEmpresa({ clienteId, nombreEmpresa, aviso }: {
  clienteId: string
  nombreEmpresa: string
  aviso: Extract<Aviso, { aviso: true }>
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function marcar(id: string, nombre: string) {
    const primero = nombre.split(' ')[0] || nombre
    if (!confirm(
      `${primero} podrá recibir presupuestos y ver las pólizas de ${nombreEmpresa} en el portal.\n\n` +
      'Se anota la autorización; queda pendiente hasta que la acepte en su portal. No se envía nada ahora.',
    )) return
    setOcupado(id)
    setError(null)
    try {
      const res = await fetch('/api/correduria/cliente/relaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, relacionadoId: id, autoriza: true }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (!res.ok || j?.estado !== 'ok') setError(j?.motivo ?? 'No se pudo anotar la autorización.')
      else router.refresh()
    } catch {
      setError('No se pudo anotar la autorización (sin conexión).')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div role="alert" style={{ border: '1px solid var(--warning)', background: 'var(--warning-bg)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 600, overflowWrap: 'anywhere' }}>
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
        <span>Esta empresa no tiene correo ni persona de contacto autorizada: los presupuestos y avisos no pueden salir por correo.</span>
      </div>
      {aviso.autorizables.map(c => (
        <div key={c.relacionadoId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.nombre} ({c.tipo})</span>
          <button
            type="button"
            disabled={ocupado !== null}
            onClick={() => marcar(c.relacionadoId, c.nombre)}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', cursor: ocupado ? 'wait' : 'pointer', font: 'inherit', fontWeight: 600 }}
          >
            {ocupado === c.relacionadoId ? 'Anotando…' : 'Marcar como contacto autorizado'}
          </button>
        </div>
      ))}
      {aviso.pendientes.map(c => (
        <div key={c.relacionadoId} style={{ overflowWrap: 'anywhere', opacity: 0.85 }}>
          {c.nombre} ({c.tipo}) — autorización anotada, pendiente de que la acepte en su portal.
        </div>
      ))}
      {error && <div style={{ color: 'var(--negative)' }}>{error}</div>}
    </div>
  )
}

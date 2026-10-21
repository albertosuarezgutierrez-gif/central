'use client'

import { useEffect, useState } from 'react'
import { interpretarHistorialSolicitud, ROTULO_ESTADO_CORREO, ROTULO_ESTADO_SOLICITUD, type LecturaHistorialSolicitud } from '@/lib/correduria/correos-compania'

const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/**
 * Historial de una solicitud en la compañía de principio a fin (F1 del agente de correo, 21/10/2026): cada correo que
 * habla de ella (por su nº y por su póliza emitida), del primero al último. Se carga al abrirlo (perezoso). Un fallo se
 * dice: nunca «sin historial».
 */
export default function HistorialSolicitud({ id }: { id: string }) {
  const [l, setL] = useState<LecturaHistorialSolicitud | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/correduria/correos-compania?historial=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => null); if (vivo) setL(interpretarHistorialSolicitud(r.status, j)) })
      .catch(() => { if (vivo) setL({ estado: 'error', motivo: 'sin conexión' }) })
    return () => { vivo = false }
  }, [id])

  if (l === null) return <p aria-live="polite" style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Cargando historial…</p>
  if (l.estado === 'sin_migracion') return <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>El seguimiento de solicitudes aún no está activo (falta su migración).</p>
  if (l.estado === 'error') return <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>No se ha podido leer el historial ({l.motivo}).</p>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, fontSize: 13 }}>
      <span>
        Estado: <strong>{l.estadoSolicitud ? ROTULO_ESTADO_SOLICITUD[l.estadoSolicitud] ?? l.estadoSolicitud : 'no reconocido'}</strong>
        {l.estadoCompania ? ` («${l.estadoCompania}»)` : ''}{l.numeroPoliza ? ` · póliza ${l.numeroPoliza}` : ''}
      </span>
      {l.hitos.length === 0
        ? <span style={{ color: 'var(--muted)' }}>Sin correos registrados de esta solicitud.</span>
        : (
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {l.hitos.slice(0, 50).map((h) => (
              <li key={h.id} style={{ overflowWrap: 'anywhere' }}>
                {fechaEs(h.creado)} · {ROTULO_ESTADO_CORREO[h.estado as keyof typeof ROTULO_ESTADO_CORREO]?.texto ?? h.estado}
                {h.resumen ? ` — ${h.resumen}` : ''}
              </li>
            ))}
          </ol>
        )}
    </div>
  )
}

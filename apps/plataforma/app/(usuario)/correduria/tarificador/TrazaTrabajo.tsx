'use client'

// Traza de un trabajo del bot (08/10/2026): los pasos que dio, cuánto tardó cada uno y con qué código falló.
// Solo nombres de paso, tiempos y códigos: el servidor no guarda datos personales ni valores del formulario.
// Se carga al abrirla (no al montar la lista).

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui'
import { agruparPorIntento, duracionPaso, leerRespuestaTraza, rotuloCodigo, rotuloPaso, type TrazaVista } from '@/lib/tarificador-bandeja'

export default function TrazaTrabajo({ trabajoId }: { trabajoId: string }) {
  const [estado, setEstado] = useState<{ cargando: boolean; traza: TrazaVista | null; error: string | null }>({ cargando: true, traza: null, error: null })

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch(`/api/correduria/tarificador/trabajo/${encodeURIComponent(trabajoId)}/traza`, { cache: 'no-store' })
        const r = leerRespuestaTraza(res.status, await res.json().catch(() => null))
        if (vivo) setEstado(r.ok ? { cargando: false, traza: r.traza, error: null } : { cargando: false, traza: null, error: r.mensaje })
      } catch {
        if (vivo) setEstado({ cargando: false, traza: null, error: 'No se ha podido cargar la traza (red).' })
      }
    })()
    return () => { vivo = false }
  }, [trabajoId])

  const { cargando, traza, error } = estado
  if (cargando) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Cargando la traza…</p>
  if (error) return <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{error}</p>
  if (!traza) return null
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Versión del bot: {traza.botVersion ?? 'no consta'}
      </p>
      {traza.pasos.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Este trabajo no registró traza (es anterior a esta función o el bot no llegó a empezar).</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          {agruparPorIntento(traza.pasos).map((g, _i, todos) => (
            <div key={g.intento} style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              {todos.length > 1 && <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>Intento {g.intento}</p>}
              <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, fontSize: 13 }}>
                {g.pasos.map((p, i) => (
                  <li key={`${p.inicio}-${i}`} style={{ overflowWrap: 'anywhere' }}>
                    <strong>{rotuloPaso(p.paso)}</strong> · {duracionPaso(p.duracionMs)}{' '}
                    {p.ok ? <Badge tono="positivo">ok</Badge> : <Badge tono="negativo">falló: {rotuloCodigo(p.errorCodigo)}</Badge>}
                    {p.capturaRef && <span className="muted"> · con captura guardada</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

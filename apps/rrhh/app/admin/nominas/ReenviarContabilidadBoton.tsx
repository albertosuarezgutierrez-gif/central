'use client'
/**
 * «Reintentar envío a contabilidad»: reenvía las nóminas confirmadas de ESTA empresa cuyo envío quedó pendiente o falló
 * (`POST /api/admin/nominas/reenviar-contabilidad`; la empresa la pone la sesión). El cron diario hace lo mismo para todas.
 * Idempotente: una nómina ya asentada no se asienta dos veces.
 */
import { useState } from 'react'
import Boton from '@/components/ui/Boton'
import Aviso from '@/components/ui/Aviso'

const ETIQUETA: Record<string, string> = {
  enviado: 'enviadas', pendiente_regla: 'guardadas en contabilidad pendientes de regla o ejercicio',
  pendiente_vincular: 'sin enviar: la empresa no está vinculada a contabilidad', sin_configurar: 'sin enviar: falta configurar la conexión',
  error: 'con error (se reintentarán)', rechazado: 'rechazadas por contabilidad (hay que revisarlas)', no_enviable: 'no enviables (desglose incompleto)',
}

export default function ReenviarContabilidadBoton() {
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ procesadas: number; quedan: boolean; porEstado: Record<string, number> } | null>(null)

  async function reintentar() {
    setCargando(true); setFallo(null); setHecho(null)
    try {
      const res = await fetch('/api/admin/nominas/reenviar-contabilidad', { method: 'POST' })
      const j = await res.json().catch(() => null)
      if (!res.ok) { setFallo(j?.error ?? `Error ${res.status}`); return }
      setHecho({ procesadas: Number(j?.procesadas ?? 0), quedan: j?.quedan === true, porEstado: (j?.por_estado ?? {}) as Record<string, number> })
    } catch {
      setFallo('No se pudo conectar. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="mt-4 grid gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div><Boton type="button" variante="secundario" onClick={reintentar} disabled={cargando}>
        {cargando ? 'Reenviando…' : 'Reintentar envío a contabilidad'}
      </Boton></div>
      {fallo && <Aviso tono="alerta" titulo="No se pudo reintentar">{fallo}</Aviso>}
      {hecho && (
        <Aviso tono={hecho.procesadas === 0 ? 'ok' : 'info'} titulo={hecho.procesadas === 0 ? 'No había envíos pendientes' : `${hecho.procesadas} nóminas reintentadas`}>
          {Object.entries(hecho.porEstado).length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(hecho.porEstado).map(([k, n]) => <li key={k}>{n} {ETIQUETA[k] ?? k}</li>)}
            </ul>
          )}
          {hecho.quedan && <p>Quedan más: vuelve a pulsar para seguir.</p>}
        </Aviso>
      )}
    </section>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import Bloque from './Bloque'
import type { EstadoDominio } from '@/lib/correo/radar-recibos'

/**
 * De las compañías que el triaje de correo sabe reconocer, cuáles han
 * producido ALGUNA VEZ un aviso de recibo devuelto/impagado por correo, y
 * cuáles nunca (20/09/2026). Es la pregunta que decide dónde hace falta
 * vigilancia manual: CIMA no lo cuenta todo, y una compañía que nunca avisa
 * por correo tampoco lo va a avisar mañana.
 *
 * Sin contador (`onContador`): es un radar, no una cola de trabajo.
 */
type Estado = { fase: 'cargando' } | { fase: 'hecho'; dominios: EstadoDominio[] | null; motivo: string | null }

export default function RadarRecibos() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/radar-recibos')
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as { estado?: string; dominios?: EstadoDominio[]; motivo?: string } | null
        if (!j || j.estado !== 'ok' || !Array.isArray(j.dominios)) return { dominios: null, motivo: j?.motivo ?? 'red' }
        return { dominios: j.dominios, motivo: null }
      })
      .catch(() => ({ dominios: null, motivo: 'red' }))
      .then((r) => { if (vivo) setEstado({ fase: 'hecho', ...r }) })
    return () => { vivo = false }
  }, [])

  if (estado.fase === 'cargando') return null

  if (estado.dominios === null) {
    return (
      <Bloque Icono={Mail} titulo="Compañías sin aviso por correo" sub="No se ha podido comprobar. No significa que todas avisen.">
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{estado.motivo}</p>
      </Bloque>
    )
  }

  const sinVer = estado.dominios.filter((d) => !d.visto)
  const vistos = estado.dominios.filter((d) => d.visto)

  return (
    <Bloque
      Icono={Mail}
      titulo="Compañías sin aviso por correo"
      sub={`De ${estado.dominios.length} reconocidas, ${vistos.length} han avisado alguna vez de un recibo devuelto por correo.`}
    >
      {sinVer.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Todas las compañías reconocidas han avisado alguna vez.</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
            Estas nunca han producido un aviso de recibo por correo: si algo se les devuelve, no lo vas a saber por aquí.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sinVer.map((d) => (
              <li
                key={d.etiqueta}
                title={d.dominios.join(', ')}
                style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)' }}
              >
                {d.etiqueta}
              </li>
            ))}
          </ul>
        </>
      )}
    </Bloque>
  )
}

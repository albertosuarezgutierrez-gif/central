'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'

/**
 * «¿Dónde está el inmueble?» — CIMA no manda la dirección del riesgo de
 * hogar/comunidades, y una póliza que solo ha entrado por CIMA sin
 * gemela en el volcado no la tiene en ninguna parte (19/09/2026: 32 hogar
 * solo-CIMA vivas, 2 con dirección). Este es el único camino para anotarla.
 *
 * Escribe en `datos_especificos` de la póliza (proxy `/api/correduria/poliza`
 * → `PATCH /api/operador/poliza` de asegura con `campo: 'direccion_riesgo'`);
 * la calle se guarda cifrada allí, con las mismas claves que el volcado, así
 * que el portal del cliente la enseña sin más. No pisa una dirección que ya
 * exista: el puerto devuelve 409.
 */
export default function EditarDireccionRiesgo({ polizaId }: { polizaId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [direccion, setDireccion] = useState('')
  const [cp, setCp] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={btnStyle('secundario', 'sm')}>
        🏠 Anotar la dirección del inmueble
      </button>
    )
  }

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/correduria/poliza', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: polizaId,
          campo: 'direccion_riesgo',
          direccion,
          cp: cp.trim() || undefined,
          localidad: localidad.trim() || undefined,
        }),
      })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || j?.estado !== 'ok') {
        setError(typeof j?.motivo === 'string' ? j.motivo : 'No se ha podido guardar.')
        return
      }
      setAbierto(false)
      router.refresh()
    } catch {
      setError('No se ha podido guardar. Reinténtalo.')
    } finally {
      setGuardando(false)
    }
  }

  const campo = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 } as const

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8, border: '1px dashed var(--border)', borderRadius: 10, padding: 10 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>
        Dirección
        <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)} maxLength={200} placeholder="p. ej. Calle Socorro 24, 3º B" style={campo} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 120px) minmax(0, 1fr)', gap: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>
          CP
          <input type="text" inputMode="numeric" value={cp} onChange={e => setCp(e.target.value)} maxLength={5} placeholder="41003" style={campo} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>
          Localidad
          <input type="text" value={localidad} onChange={e => setLocalidad(e.target.value)} maxLength={80} placeholder="Sevilla" style={campo} />
        </label>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        Anotada por ti, no por la compañía: CIMA no manda la dirección del riesgo. El cliente la verá en su portal como título de la póliza.
      </p>
      {error && <p style={{ fontSize: 12, color: 'var(--negative)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={guardar} disabled={guardando || direccion.trim().length < 5} style={btnStyle('primario', 'sm')}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => setAbierto(false)} disabled={guardando} style={btnStyle('secundario', 'sm')}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

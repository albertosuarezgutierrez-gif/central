'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { MODALIDADES_RC } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'

/**
 * «¿Qué tipo de RC es?» — cuando la compañía no manda coberturas por CIMA,
 * este es el único camino para anotar a mano la modalidad (locativa,
 * patronal, profesional…). Escribe en `datos_especificos` de la póliza
 * (proxy `/api/correduria/poliza` → puerto de asegura) y NUNCA sustituye lo
 * que sí mande CIMA: si llegan coberturas reales, esas mandan siempre.
 */
export default function EditarModalidadRc({ polizaId, informadoPorCima }: { polizaId: string; informadoPorCima: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [modalidad, setModalidad] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (informadoPorCima) return null // lo de CIMA manda siempre; anotar a mano aquí no cambiaría nada visible

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={btnStyle('secundario', 'sm')}>
        ✏️ ¿Qué tipo de RC es?
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
        body: JSON.stringify({ id: polizaId, modalidad, nota: nota.trim() || undefined }),
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

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8, border: '1px dashed var(--border)', borderRadius: 10, padding: 10 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>
        Modalidad
        <select
          value={modalidad}
          onChange={e => setModalidad(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
        >
          <option value="">— elige —</option>
          {MODALIDADES_RC.map(m => <option key={m.id} value={m.id}>{m.etiqueta}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>
        Nota (opcional{modalidad === 'otra' ? ', obligatoria en "Otra"' : ''})
        <input
          type="text"
          value={nota}
          onChange={e => setNota(e.target.value)}
          maxLength={200}
          placeholder="p. ej. del local de la calle Betis"
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
        />
      </label>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        Anotado por ti, no por la compañía: si CIMA manda coberturas más adelante, esas se pintarán en vez de esto.
      </p>
      {error && <p style={{ fontSize: 12, color: 'var(--negative)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={guardar} disabled={guardando || modalidad === ''} style={btnStyle('primario', 'sm')}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => setAbierto(false)} disabled={guardando} style={btnStyle('secundario', 'sm')}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import Bloque from '../../Bloque'
import { btnStyle } from '@/components/ui'
import { CAMPO, ERROR, NOTA } from './estilos'

const ETIQUETA: Record<string, string> = { ganado: 'Ganado', perdido: 'Perdido', parcial: 'Parcial' }

export default function Cierre({ siniestroId, resultado, motivo, onGuardado }: {
  siniestroId: string
  resultado: string | null
  motivo: string | null
  onGuardado: () => void
}) {
  const [res, setRes] = useState('ganado')
  const [mot, setMot] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  if (resultado) {
    return (
      <Bloque titulo="Cierre">
        <p style={{ margin: 0, fontSize: 14 }}><strong>{ETIQUETA[resultado] ?? resultado}</strong>{motivo ? ` — ${motivo}` : ''}</p>
      </Bloque>
    )
  }

  async function cerrar() {
    if (mot.trim() === '') return setAviso('Cuenta el motivo.')
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/siniestro/cierre', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siniestroId, resultado: res, motivo: mot.trim() }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { motivo?: string } | null
        return setAviso(`NO se ha cerrado: ${j?.motivo ?? `error ${r.status}`}.`)
      }
      onGuardado()
    } catch {
      setAviso('NO se sabe si se ha cerrado: sin conexión.')
    } finally { setOcupado(false) }
  }

  return (
    <Bloque titulo="Cierre" sub="Sin resultado todavía.">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <select aria-label="Resultado" value={res} onChange={e => setRes(e.target.value)} style={CAMPO}>
          <option value="ganado">Ganado</option>
          <option value="parcial">Parcial</option>
          <option value="perdido">Perdido</option>
        </select>
        <textarea aria-label="Motivo" placeholder="Motivo" value={mot} onChange={e => setMot(e.target.value)} rows={3} style={{ ...CAMPO, resize: 'vertical' }} />
        {aviso && <p role="alert" style={ERROR}>{aviso}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={ocupado} onClick={cerrar} style={btnStyle('secundario')}>{ocupado ? 'Guardando…' : 'Registrar resultado'}</button>
          <span style={NOTA}>Alimenta lo que la IA aprende de los siniestros.</span>
        </div>
      </div>
    </Bloque>
  )
}

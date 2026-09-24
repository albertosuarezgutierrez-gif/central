'use client'
import { useState } from 'react'

const MAX_BYTES = 4 * 1024 * 1024

/** Sube la foto o el PDF del DNI. Tras subirlo queda «en revisión»: lo mira el corredor. */
export function SubirDni({ corredor }: { corredor: boolean }) {
  const [estado, setEstado] = useState<'libre' | 'subiendo' | 'ok'>('libre')
  const [aviso, setAviso] = useState<string | null>(null)

  async function subir(fichero: File | undefined) {
    if (!fichero) return
    // El límite real de una función de Vercel es ~4,5 MB: se dice antes de subir, no con un 413 que no es JSON.
    if (fichero.size > MAX_BYTES) {
      setAviso('El fichero pasa de 4 MB. Haz la foto con menos resolución o súbelo en PDF.')
      return
    }
    setEstado('subiendo')
    setAviso(null)
    const body = new FormData()
    body.append('documento', fichero)
    const r = await fetch('/api/documento/dni', { method: 'POST', body }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { estado?: string; motivo?: string } | null
    if (r?.ok && j?.estado === 'ok') {
      setEstado('ok')
      return
    }
    setEstado('libre')
    setAviso(typeof j?.motivo === 'string' ? j.motivo : r?.status === 413 ? 'El fichero es demasiado grande. Súbelo con menos resolución o en PDF.' : j?.estado === 'espera'
      ? 'Has subido varios ficheros seguidos. Inténtalo dentro de un rato.'
      : 'No sabemos si ha llegado. Recarga la página: si sigue pidiéndolo, vuelve a subirlo.')
  }

  if (estado === 'ok') {
    return <p className="confirmacion" style={{ margin: '12px 0 0' }}>Recibido. Lo revisamos y te avisamos si falta algo.</p>
  }
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
      <label className="boton boton-fichero" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', justifySelf: 'start', cursor: corredor ? 'not-allowed' : 'pointer', opacity: corredor ? 0.6 : 1 }}>
        {estado === 'subiendo' ? 'Subiendo…' : 'Subir foto o PDF del DNI'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          disabled={corredor || estado === 'subiendo'}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            // Se vacía: si falla, elegir el MISMO fichero otra vez tiene que volver a disparar el cambio.
            e.target.value = ''
            void subir(f)
          }}
        />
      </label>
      {corredor && <span style={{ fontSize: 13 }}>Vista de corredor: el DNI lo sube el cliente.</span>}
      {aviso && <span role="status" style={{ fontSize: 13, color: 'var(--negative, #b42318)' }}>{aviso}</span>}
    </div>
  )
}

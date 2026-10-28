'use client'
import { useState } from 'react'
import Bloque from '../../Bloque'
import { btnStyle } from '@/components/ui'
import { ERROR, NOTA } from './estilos'

type Peticion = { accion: 'analizar' | 'redactar'; destinatario?: 'compania' | 'cliente' }

export default function AccionesIa({ siniestroId, onHecho }: { siniestroId: string; onHecho: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null)

  async function pedir(p: Peticion) {
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/siniestro/ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siniestroId, ...p }),
      })
      if (r.status === 404) return setAviso({ mal: false, texto: 'Aún no disponible.' })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { motivo?: string } | null
        return setAviso({ mal: true, texto: `La IA no ha respondido: ${j?.motivo ?? `error ${r.status}`}.` })
      }
      onHecho()
    } catch {
      setAviso({ mal: true, texto: 'Sin conexión con la IA.' })
    } finally { setOcupado(false) }
  }

  return (
    <Bloque titulo="IA con la póliza" sub="Lee la póliza y el hilo. Nunca envía nada: el borrador lo copias tú.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={ocupado} onClick={() => pedir({ accion: 'analizar' })} style={btnStyle('secundario')}>Analizar con la póliza</button>
        <button type="button" disabled={ocupado} onClick={() => pedir({ accion: 'redactar', destinatario: 'compania' })} style={btnStyle('secundario')}>Redactar respuesta (compañía)</button>
        <button type="button" disabled={ocupado} onClick={() => pedir({ accion: 'redactar', destinatario: 'cliente' })} style={btnStyle('secundario')}>Redactar respuesta (cliente)</button>
      </div>
      {ocupado && <p style={{ ...NOTA, marginTop: 8 }}>Pensando…</p>}
      {aviso && <p role="status" style={{ ...(aviso.mal ? ERROR : NOTA), marginTop: 8 }}>{aviso.texto}</p>}
    </Bloque>
  )
}

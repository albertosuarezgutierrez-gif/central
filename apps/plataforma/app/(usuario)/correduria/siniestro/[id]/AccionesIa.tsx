'use client'
import { useRef, useState } from 'react'
import Bloque from '../../Bloque'
import { btnStyle } from '@/components/ui'
import { DESTINATARIOS_IA, citasNoEncontradas, leerMensaje, motivoFallo, type DestinatarioIa } from '@/lib/correduria/siniestro-hilo'
import { CAMPO, ERROR, NOTA } from './estilos'

type Peticion = { accion: 'analizar' | 'redactar'; destinatario?: DestinatarioIa }

export default function AccionesIa({ siniestroId, onHecho }: { siniestroId: string; onHecho: () => void }) {
  const [dest, setDest] = useState<DestinatarioIa>('compania_intranet')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null)

  const enCurso = useRef(false)

  async function pedir(p: Peticion) {
    if (enCurso.current) return // doble clic antes del re-render = doble gasto de IA
    enCurso.current = true
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/siniestro/ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siniestroId, ...p }),
      })
      if (r.status === 404) return setAviso({ mal: false, texto: 'Aún no disponible.' })
      if (!r.ok) {
        const j: unknown = await r.json().catch(() => null)
        return setAviso({ mal: true, texto: `La IA no ha respondido: ${motivoFallo(r.status, j)}.` })
      }
      const m = leerMensaje(await r.json().catch(() => null))
      const faltan = m ? citasNoEncontradas(m.meta) : []
      if (faltan.length > 0) setAviso({ mal: true, texto: `⚠ La IA cita algo que NO aparece en la póliza: ${faltan.join(' · ')}. Compruébalo antes de usar el texto.` })
      onHecho()
    } catch {
      setAviso({ mal: true, texto: 'Sin conexión con la IA.' })
    } finally { enCurso.current = false; setOcupado(false) }
  }

  return (
    <Bloque titulo="IA con la póliza" sub="Lee la póliza y el hilo. Nunca envía nada: el borrador lo copias tú.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={ocupado} onClick={() => pedir({ accion: 'analizar' })} style={btnStyle('secundario')}>Analizar con la póliza</button>
        <select aria-label="Destinatario del borrador" value={dest} onChange={e => setDest(e.target.value as DestinatarioIa)} style={{ ...CAMPO, width: 'auto', flex: '1 1 220px' }}>
          {DESTINATARIOS_IA.map(d => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
        </select>
        <button type="button" disabled={ocupado} onClick={() => pedir({ accion: 'redactar', destinatario: dest })} style={btnStyle('secundario')}>Redactar respuesta</button>
      </div>
      {ocupado && <p style={{ ...NOTA, marginTop: 8 }}>Pensando…</p>}
      {aviso && <p role="status" style={{ ...(aviso.mal ? ERROR : NOTA), marginTop: 8 }}>{aviso.texto}</p>}
    </Bloque>
  )
}

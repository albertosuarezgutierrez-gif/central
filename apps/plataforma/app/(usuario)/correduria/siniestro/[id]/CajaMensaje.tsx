'use client'
import { useEffect, useState } from 'react'
import Bloque from '../../Bloque'
import { btnStyle } from '@/components/ui'
import { cuerpoCaja, type ModoCaja } from '@/lib/correduria/siniestro-hilo'
import type { DocumentoResumen } from '@central/module-seguros'
import { CAMPO, ERROR, NOTA } from './estilos'

export type Precarga = { modo: ModoCaja; texto: string; n: number }

export default function CajaMensaje({ siniestroId, documentos, precarga, onGuardado }: {
  siniestroId: string
  documentos: DocumentoResumen[]
  precarga: Precarga | null
  onGuardado: () => void
}) {
  const [modo, setModo] = useState<ModoCaja>('compania')
  const [texto, setTexto] = useState('')
  const [docId, setDocId] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => { if (precarga) { setModo(precarga.modo); setTexto(precarga.texto) } }, [precarga])

  async function guardar() {
    if (texto.trim() === '') return setAviso('Escribe el texto.')
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/siniestro/hilo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siniestroId, ...cuerpoCaja(modo, texto, docId || null) }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { motivo?: string } | null
        setAviso(`NO se ha guardado: ${j?.motivo ?? `error ${r.status}`}.`)
        return
      }
      setTexto(''); setDocId('')
      onGuardado()
    } catch {
      setAviso('NO se sabe si se ha guardado: sin conexión. Mira el hilo antes de repetir.')
    } finally { setOcupado(false) }
  }

  return (
    <Bloque titulo="Añadir al hilo">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <select aria-label="Tipo de entrada" value={modo} onChange={e => setModo(e.target.value as ModoCaja)} style={CAMPO}>
          <option value="compania">Pegar de la compañía (comentario/rehúse)</option>
          <option value="enviado">Lo que he enviado</option>
          <option value="interna">Nota interna</option>
        </select>
        <textarea aria-label="Texto" value={texto} onChange={e => setTexto(e.target.value)} rows={6} style={{ ...CAMPO, resize: 'vertical' }} />
        {documentos.length > 0 && (
          <select aria-label="Adjuntar documento" value={docId} onChange={e => setDocId(e.target.value)} style={CAMPO}>
            <option value="">Sin adjunto</option>
            {documentos.filter(d => d.nombre !== null).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        )}
        {aviso && <p role="alert" style={ERROR}>{aviso}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={ocupado} onClick={guardar} style={btnStyle('primario')}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          <span style={NOTA}>Solo se guarda en el expediente; no se envía nada a nadie.</span>
        </div>
      </div>
    </Bloque>
  )
}

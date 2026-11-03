'use client'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'
import { leerPropuestaVolcado, leerResultadoVolcado, motivoFallo, trozosNuevos, type PropuestaVolcado } from '@/lib/correduria/siniestro-hilo'
import { CAMPO, ERROR, NOTA } from './estilos'
import { FichaPeritoVista } from './FichaPerito'

const ROL = { perito: 'Perito', tramitador: 'Tramitador', compania: 'Compañía' } as const

/** «Subir todo»: pega la conversación de la intranet, se revisa la propuesta y solo entonces se guarda. */
export default function VolcadoIntranet({ siniestroId, onGuardado }: { siniestroId: string; onGuardado: () => void }) {
  const [texto, setTexto] = useState('')
  const [prop, setProp] = useState<PropuestaVolcado | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null)

  async function llamar(confirmar: boolean): Promise<unknown | null> {
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/siniestro/volcado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siniestroId, texto, confirmar }),
      })
      const j: unknown = await r.json().catch(() => null)
      if (!r.ok) { setAviso({ mal: true, texto: `NO se ha ${confirmar ? 'guardado' : 'leído'}: ${motivoFallo(r.status, j)}.` }); return null }
      return j
    } catch {
      setAviso({ mal: true, texto: confirmar ? 'NO se sabe si se ha guardado: sin conexión. Mira el hilo antes de repetir.' : 'Sin conexión.' })
      return null
    } finally { setOcupado(false) }
  }

  async function revisar() {
    if (texto.trim() === '') return setAviso({ mal: true, texto: 'Pega el texto de la intranet.' })
    const j = await llamar(false)
    if (j === null) return
    const p = leerPropuestaVolcado(j)
    if (!p) return setAviso({ mal: true, texto: 'La respuesta no se pudo leer. No se ha guardado nada.' })
    setProp(p)
    if (p.trozos.length === 0) setAviso({ mal: false, texto: 'No se ha reconocido ningún mensaje en el texto pegado.' })
  }

  async function guardar() {
    const j = await llamar(true)
    if (j === null) return
    const res = leerResultadoVolcado(j)
    if (!res) return setAviso({ mal: true, texto: 'NO se sabe si se ha guardado: respuesta ilegible. Mira el hilo antes de repetir.' })
    setTexto(''); setProp(null)
    setAviso({ mal: res.preRehuse, texto: `Guardados ${res.insertados} mensajes${res.duplicados > 0 ? ` (${res.duplicados} ya estaban)` : ''}.${res.preRehuse ? ' ⚠ Posible rehúse: se ha avisado por Telegram.' : ''}` })
    onGuardado()
  }

  const nuevos = prop ? trozosNuevos(prop) : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <textarea aria-label="Volcado de la intranet" value={texto} onChange={e => { setTexto(e.target.value); setProp(null) }} rows={8}
        placeholder="Pega aquí toda la conversación del siniestro tal como sale en la intranet de la compañía" style={{ ...CAMPO, resize: 'vertical' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={ocupado} onClick={revisar} style={btnStyle('secundario')}>{ocupado && !prop ? 'Leyendo…' : 'Revisar antes de guardar'}</button>
        <span style={NOTA}>Primero se enseña qué se guardaría; no se guarda nada hasta confirmar.</span>
      </div>
      {prop && prop.trozos.length > 0 && (
        <>
          {prop.fichaPerito && <FichaPeritoVista ficha={prop.fichaPerito} titulo="Ficha del perito detectada" />}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
            {prop.trozos.map(t => (
              <li key={t.huella} style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, opacity: t.duplicado ? 0.55 : 1, background: t.tipo === 'rehuse' ? 'var(--negative-bg)' : 'var(--surface)' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{t.emisor ?? 'emisor desconocido'}</strong>{t.rol ? ` (${ROL[t.rol]})` : ''} · {t.fechaOriginal ?? 'sin fecha'} · {t.tipo === 'rehuse' ? 'REHÚSE' : 'comentario'}
                  {t.duplicado && <strong style={{ color: 'var(--warning)' }}> · ya está en el hilo, se salta</strong>}
                </span>
                <p style={{ margin: '2px 0 0', fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t.texto.length > 300 ? `${t.texto.slice(0, 300).trimEnd()}…` : t.texto}</p>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado || nuevos === 0} onClick={guardar} style={btnStyle('primario')}>
              {ocupado ? 'Guardando…' : `Guardar ${nuevos} mensaje${nuevos === 1 ? '' : 's'}`}
            </button>
            {nuevos === 0 && <span style={NOTA}>Todo lo pegado ya está en el hilo.</span>}
          </div>
        </>
      )}
      {aviso && <p role={aviso.mal ? 'alert' : 'status'} style={aviso.mal ? ERROR : NOTA}>{aviso.texto}</p>}
    </div>
  )
}

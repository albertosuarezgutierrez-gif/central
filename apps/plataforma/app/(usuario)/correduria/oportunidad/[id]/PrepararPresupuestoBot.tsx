'use client'

// «Preparar presupuesto con lo que ha sacado el bot» (18/10/2026). Llama a la ruta de plataforma (sesión), que
// reenvía al puerto de asegura con el secreto de operador; el navegador nunca lo ve. Deja un BORRADOR: nada se
// envía al cliente. Idempotente: pulsar otra vez con las mismas ofertas devuelve el que ya hay.
import { useState } from 'react'
import { Eye, FilePlus2 } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { vistaPresupuestoRpa, type VistaPresupuestoRpa } from '@/lib/presupuesto-rpa-vista'
import { interpretarVista, textoVista } from '@/lib/portal-cliente-asegura'

export default function PrepararPresupuestoBot({ oportunidadId, alTerminar }: { oportunidadId: string; alTerminar?: () => void }) {
  const [enviando, setEnviando] = useState(false)
  const [vista, setVista] = useState<VistaPresupuestoRpa | null>(null)

  async function preparar() {
    setEnviando(true); setVista(null)
    try {
      const res = await fetch(`/api/correduria/tarificador/oportunidad/${encodeURIComponent(oportunidadId)}/presupuesto-rpa`, { method: 'POST' })
      const j = await res.json().catch(() => null)
      setVista(vistaPresupuestoRpa(res.status, j))
      if (res.ok) alTerminar?.()
    } catch {
      setVista({ tono: 'error', texto: 'No se ha podido contactar con plataforma: vuelve a intentarlo.', presupuestoId: null })
    } finally {
      setEnviando(false)
    }
  }

  const [abriendo, setAbriendo] = useState(false)
  const [avisoVista, setAvisoVista] = useState<string | null>(null)

  /**
   * «Ver como el cliente» (18/10/2026): la MISMA página del portal del cliente, en solo lectura, también para el
   * borrador. La pestaña se abre ANTES del fetch (gesto del clic) y luego recibe la dirección; botón y no `<a href>`:
   * el enlace es de UN solo uso y un prefetch lo gastaría.
   */
  async function verComoCliente(presupuestoId: string) {
    setAbriendo(true); setAvisoVista(null)
    const pestana = window.open('about:blank', '_blank')
    try {
      const res = await fetch('/api/correduria/presupuesto/vista-cliente', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presupuestoId }),
      })
      const r = interpretarVista(res.status, await res.json().catch(() => null))
      if (r.estado === 'ok') {
        if (pestana) { pestana.opener = null; pestana.location.href = r.url } else window.location.assign(r.url)
        setAvisoVista('Vista previa abierta en otra pestaña: solo lectura, no cuenta como vista por el cliente. Pulsa «Salir» allí al terminar.')
      } else {
        pestana?.close()
        setAvisoVista(textoVista(r, 'este cliente', 'presupuesto'))
      }
    } catch {
      pestana?.close()
      setAvisoVista(textoVista({ estado: 'error', motivo: 'red' }, 'este cliente', 'presupuesto'))
    } finally {
      setAbriendo(false)
    }
  }

  const color = vista?.tono === 'error' ? 'var(--negative)' : vista?.tono === 'ok' ? 'var(--text)' : 'var(--muted)'
  return (
    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 }}>
      <button type="button" onClick={preparar} disabled={enviando} aria-busy={enviando}
        style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'center', opacity: enviando ? 0.7 : 1 }}>
        <FilePlus2 size={16} aria-hidden /> {enviando ? 'Preparando…' : 'Preparar presupuesto con lo que ha sacado el bot'}
      </button>
      {vista && (
        <p role="status" style={{ margin: 0, fontSize: 13, color, overflowWrap: 'anywhere' }}>
          {vista.texto}
          {vista.presupuestoId && (
            <> <a href={`/api/correduria/presupuesto/pdf?id=${encodeURIComponent(vista.presupuestoId)}`} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-block', minHeight: 44, lineHeight: '44px' }}>Ver el presupuesto (PDF)</a></>
          )}
        </p>
      )}
      {vista?.presupuestoId && (
        <button type="button" onClick={() => verComoCliente(vista.presupuestoId!)} disabled={abriendo} aria-busy={abriendo}
          style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'center', opacity: abriendo ? 0.7 : 1 }}>
          <Eye size={16} aria-hidden /> {abriendo ? 'Abriendo…' : 'Ver como el cliente'}
        </button>
      )}
      {avisoVista && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{avisoVista}</p>}
    </div>
  )
}

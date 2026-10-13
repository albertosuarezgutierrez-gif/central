'use client'
import { useState } from 'react'

import { TEXTO_CAPTACION, type EstadoCaptacion } from '@/lib/captacion-declarada'

/**
 * «¿Quieres verla siempre al día?» en la ficha de una póliza que APORTÓ el cliente.
 * La decisión de enseñarla la toma el servidor (`estadoCaptacion`); aquí solo se pinta y se pulsa.
 *
 * 🚨 Solo dice «Ya lo hemos recibido» cuando el servidor lo confirma (`pedida`/`ya_pedida`): un
 * fallo de envío se dice como fallo, nunca como recibido. No manda nada a nadie desde el cliente.
 */
export function CaptacionDeclarada({ polizaId, estado }: { polizaId: string; estado: Exclude<EstadoCaptacion, 'oculta'> }) {
  const [vista, setVista] = useState<'ofrecer' | 'pedida' | 'oculta'>(estado === 'ya_pedida' ? 'pedida' : 'ofrecer')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(accion: 'pedir' | 'ahora_no') {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch(`/api/polizas/${encodeURIComponent(polizaId)}/gestion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string } | null
      if (r.ok && (j?.estado === 'pedida' || j?.estado === 'ya_pedida')) setVista('pedida')
      else if (r.ok && j?.estado === 'oculta') setVista('oculta')
      else setError(TEXTO_CAPTACION.errorEnvio)
    } catch {
      setError(TEXTO_CAPTACION.errorEnvio)
    } finally {
      setEnviando(false)
    }
  }

  if (vista === 'oculta') return null

  return (
    <section className="aviso-linea" aria-labelledby={`captacion-${polizaId}`} style={{ marginBottom: 20 }}>
      <strong id={`captacion-${polizaId}`}>{TEXTO_CAPTACION.titulo}</strong>
      {vista === 'pedida' ? (
        <p className="linea" role="status" style={{ margin: '6px 0 0' }}>
          {TEXTO_CAPTACION.yaPedida}
        </p>
      ) : (
        <>
          <p className="linea" style={{ margin: '6px 0 0' }}>
            {TEXTO_CAPTACION.cuerpo}
          </p>
          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-acciones" style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={() => void enviar('pedir')} disabled={enviando}>
              {enviando ? 'Enviando…' : TEXTO_CAPTACION.boton}
            </button>
            <button type="button" className="boton-tenue" onClick={() => void enviar('ahora_no')} disabled={enviando}>
              {TEXTO_CAPTACION.ahoraNo}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

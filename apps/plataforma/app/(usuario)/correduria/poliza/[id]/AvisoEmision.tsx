'use client'

// En una póliza que SUSTITUYE a otra: mandar (o reenviar) al cliente el correo de su nuevo seguro con
// la carta de baja de la anterior para firmar, o mandártelo antes a ti como prueba. Emitir ya lo hace
// solo desde el 26/09/2026; esto es para las emitidas antes y para reenviar. Enviar al cliente pide
// un segundo clic en la propia pantalla: es un correo a un tercero.

import { useState } from 'react'
import { btnStyle } from '@/components/ui'

type Resultado = { ok: boolean; texto: string }

export default function AvisoEmision({ polizaId }: { polizaId: string }) {
  const [enviando, setEnviando] = useState<null | 'prueba' | 'cliente'>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)

  async function enviar(prueba: boolean) {
    setEnviando(prueba ? 'prueba' : 'cliente')
    setRes(null)
    try {
      const r = await fetch('/api/correduria/emision-aviso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polizaId, prueba }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; texto?: string; motivo?: string } | null
      setRes(j?.estado === 'ok'
        ? { ok: true, texto: j.texto ?? 'Hecho.' }
        : { ok: false, texto: `No se ha podido: ${j?.motivo ?? `HTTP ${r.status}`}` })
    } catch {
      setRes({ ok: false, texto: 'No sé si ha salido (se cortó la conexión). Mira la ficha del cliente antes de repetir.' })
    } finally {
      setEnviando(null)
      setConfirmar(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
      <strong>📧 Correo al cliente y firma de la baja</strong>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        Un solo correo: su nuevo seguro y el enlace para firmar en el portal la baja de la póliza anterior. Al firmar, la carta sale
        sola a la compañía si su buzón de bajas ya está elegido.
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" style={btnStyle('secundario')} disabled={enviando !== null} onClick={() => enviar(true)}>
          {enviando === 'prueba' ? 'Enviando…' : 'Enviarme una prueba'}
        </button>
        {!confirmar ? (
          <button type="button" style={btnStyle('secundario')} disabled={enviando !== null} onClick={() => setConfirmar(true)}>
            Enviar al cliente
          </button>
        ) : (
          <>
            <button type="button" style={btnStyle('primario')} disabled={enviando !== null} onClick={() => enviar(false)}>
              {enviando === 'cliente' ? 'Enviando…' : 'Sí, enviar al cliente'}
            </button>
            <button type="button" style={btnStyle('sutil')} disabled={enviando !== null} onClick={() => setConfirmar(false)}>
              Cancelar
            </button>
          </>
        )}
      </div>
      {res && (
        <div role="status" style={{ whiteSpace: 'pre-line', fontSize: 14, color: res.ok ? 'var(--text)' : 'var(--negative)' }}>
          {res.texto}
        </div>
      )}
    </div>
  )
}

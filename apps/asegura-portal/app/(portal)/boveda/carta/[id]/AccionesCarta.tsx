'use client'
import { useState } from 'react'

/**
 * Copiar e imprimir la carta. Son las DOS únicas salidas: al portapapeles y a
 * la impresora del propio navegador. No hay «enviar» — la carta es de la
 * persona a su compañía, y sale por el canal que ella elija.
 *
 * Lo que SÍ se apunta (20/09/2026): que la redactó (al primer copiar /
 * imprimir / abrir el correo) y, si lo marca, que la envió. Van a
 * `POST /api/polizas/[id]/carta` y las lee el corredor como señal de lead. El
 * apunte NUNCA bloquea la acción: si la red falla, el texto se copia igual.
 */
export function AccionesCarta({
  polizaId,
  asunto,
  cuerpo,
  enviadaEn,
  soloLectura,
}: {
  polizaId: string
  asunto: string
  cuerpo: string
  /** Cuándo marcó «ya la he enviado». `null` = no lo ha marcado. */
  enviadaEn: string | null
  /** Vista de corredor: se ve, no se marca. */
  soloLectura: boolean
}) {
  const [copiado, setCopiado] = useState<'no' | 'si' | 'error'>('no')
  const [enviada, setEnviada] = useState<string | null>(enviadaEn)
  const [marcando, setMarcando] = useState(false)
  const [errorMarca, setErrorMarca] = useState(false)

  async function senal(accion: 'generada' | 'enviada' | 'enviada_deshacer'): Promise<boolean> {
    if (soloLectura) return false
    try {
      const r = await fetch(`/api/polizas/${polizaId}/carta`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      return r.ok
    } catch {
      return false
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cuerpo)
      setCopiado('si')
    } catch {
      setCopiado('error')
    }
    void senal('generada')
  }

  function imprimir() {
    void senal('generada')
    window.print()
  }

  async function alternarEnviada() {
    setMarcando(true)
    setErrorMarca(false)
    const deshacer = enviada !== null
    const ok = await senal(deshacer ? 'enviada_deshacer' : 'enviada')
    setMarcando(false)
    if (!ok) {
      setErrorMarca(true)
      return
    }
    setEnviada(deshacer ? null : new Date().toISOString())
  }

  return (
    <div className="carta-acciones solo-pantalla">
      <button type="button" className="boton" onClick={() => void copiar()}>
        Copiar el texto
      </button>
      <button type="button" className="boton boton-secundario" onClick={imprimir}>
        Imprimir
      </button>
      <a
        className="boton boton-secundario"
        href={`mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`}
        onClick={() => void senal('generada')}
      >
        Abrir en mi correo
      </a>
      <p className="tenue" aria-live="polite" style={{ flex: '1 1 100%', margin: '6px 0 0' }}>
        {copiado === 'si' && 'Copiado. Pégalo en tu correo o en el formulario de la compañía.'}
        {copiado === 'error' && 'No se ha podido copiar solo: selecciona el texto y cópialo a mano.'}
        {copiado === 'no' && '«Abrir en mi correo» prepara el mensaje en tu programa de correo sin destinatario: pon tú la dirección oficial de tu compañía.'}
      </p>
      {!soloLectura && (
        <div style={{ flex: '1 1 100%', marginTop: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={enviada !== null}
              disabled={marcando}
              onChange={() => void alternarEnviada()}
              style={{ marginTop: 4, width: 18, height: 18 }}
            />
            <span>
              <strong>Ya la he enviado a mi compañía.</strong>{' '}
              <span className="tenue">
                Así la correduría sabe que estás cambiando de póliza y puede prepararte una alternativa antes de que
                venza. Puedes desmarcarlo si te has equivocado.
              </span>
            </span>
          </label>
          {errorMarca && (
            <p className="pendiente" style={{ margin: '4px 0 0' }}>
              No se ha podido guardar la marca. Inténtalo otra vez en un momento.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

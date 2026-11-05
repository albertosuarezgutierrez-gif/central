'use client'
import { useState, useTransition } from 'react'
import { enlacePedidoAccion, recepcionVerificadaAccion } from './acciones'

/** Enseña el enlace UNA vez y lo comparte con la Web Share API del móvil (WhatsApp, correo… del propio taller) o lo copia. */
function Compartir({ url, titulo, texto }: { url: string; titulo: string; texto: string }) {
  const [msg, setMsg] = useState('')
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  async function compartir() {
    try { await navigator.share({ title: titulo, text: texto, url }); setMsg('') } catch { /* cancelado por la persona */ }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(url); setMsg('Enlace copiado') } catch { setMsg('No se pudo copiar: selecciónalo a mano') }
  }
  return (
    <>
      <p className="ok">Enlace para el proveedor (solo se muestra ahora; si lo pierdes, genera otro y el anterior deja de valer):</p>
      <p className="enlace-copia" style={{ overflowWrap: 'anywhere' }}>{url}</p>
      <div className="fila">
        {puedeCompartir && <button className="btn" type="button" onClick={compartir}>Compartir enlace</button>}
        <button className="btn btn-sec" type="button" onClick={copiar}>Copiar</button>
        {msg && <span className="tenue" role="status">{msg}</span>}
      </div>
    </>
  )
}

const absoluta = (u: string) => (u.startsWith('/') ? `${location.origin}${u}` : u)

export function EnlacePedidoProveedor({ pedidoId, borrador, proveedor }: { pedidoId: string; borrador: boolean; proveedor: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()
  return (
    <div className="ficha no-imprimir">
      {url ? <Compartir url={url} titulo="Pedido" texto={`Hola ${proveedor}: te enviamos un pedido. Confírmalo y sube el albarán aquí:`} /> : (
        <button className="btn" type="button" disabled={pend} onClick={() => iniciar(async () => {
          setError(null)
          const r = await enlacePedidoAccion(pedidoId)
          if (r.ok) setUrl(absoluta(r.url)); else setError(r.mensaje)
        })}>{borrador ? 'Enlace para el proveedor (marca el pedido como enviado)' : 'Enlace para el proveedor'}</button>
      )}
      {error && <p className="aviso-error" role="alert">{error}</p>}
      <p className="tenue">No se envía nada desde la app: compártelo tú desde el móvil. El proveedor confirma el pedido y sube el albarán.</p>
    </div>
  )
}

export function RecepcionVerificada({ albaranId, proveedor, yaVerificada }: { albaranId: string; proveedor: string; yaVerificada: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()
  return (
    <div className="ficha no-imprimir">
      {url ? <Compartir url={url} titulo="Factura" texto={`Hola ${proveedor}: hemos recibido el material. Sube aquí la factura:`} /> : (
        <button className="btn" type="button" disabled={pend} onClick={() => iniciar(async () => {
          setError(null)
          const r = await recepcionVerificadaAccion(albaranId)
          if (r.ok) setUrl(absoluta(r.url)); else setError(r.mensaje)
        })}>{yaVerificada ? 'Pedir la factura de nuevo (nuevo enlace)' : 'Recepción verificada'}</button>
      )}
      {error && <p className="aviso-error" role="alert">{error}</p>}
      <p className="tenue">Púlsalo cuando hayas comprobado lo recibido: se genera el enlace para que el proveedor suba la factura.</p>
    </div>
  )
}

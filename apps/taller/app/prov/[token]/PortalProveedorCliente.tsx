'use client'
import { useState } from 'react'
import type { VistaProveedor } from '@/lib/portal-proveedor'

const ACEPTA = 'application/pdf,image/jpeg,image/png,application/xml,text/xml,.xml,.pdf,.jpg,.jpeg,.png'

/** Acciones del proveedor: confirmar el pedido y subir el albarán (enlace de pedido) o la factura (enlace de factura). */
export function PortalProveedorCliente({ token, vista }: { token: string; vista: VistaProveedor }) {
  const [confirmado, setConfirmado] = useState(vista.confirmadoEn != null)
  const [docs, setDocs] = useState(vista.documentos)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const esFactura = vista.proposito === 'factura'
  const facturaSubida = esFactura && docs.some((d) => d.tipo === 'factura')

  async function enviar(fd: FormData): Promise<{ ok: boolean; mensaje?: string }> {
    const r = await fetch(`/api/prov/${encodeURIComponent(token)}`, { method: 'POST', body: fd })
    return (await r.json().catch(() => ({ ok: false, mensaje: 'Error de conexión' }))) as { ok: boolean; mensaje?: string }
  }
  async function confirmar() {
    setOcupado(true); setMsg(null)
    const fd = new FormData(); fd.set('accion', 'confirmar')
    const r = await enviar(fd)
    setOcupado(false)
    if (r.ok) { setConfirmado(true); setMsg({ ok: true, texto: 'Pedido confirmado. Gracias.' }) } else setMsg({ ok: false, texto: r.mensaje ?? 'No se pudo confirmar' })
  }
  async function subir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = (form.elements.namedItem('archivo') as HTMLInputElement).files?.[0]
    if (!f) return setMsg({ ok: false, texto: 'Elige un archivo' })
    if (f.size > vista.maxMb * 1024 * 1024) return setMsg({ ok: false, texto: `El archivo pasa de ${vista.maxMb} MB` })
    setOcupado(true); setMsg(null)
    const fd = new FormData(); fd.set('accion', 'subir'); fd.set('archivo', f)
    const r = await enviar(fd)
    setOcupado(false)
    if (r.ok) {
      setDocs((d) => [...d, { tipo: esFactura ? 'factura' : 'albaran', nombre: f.name, subidoEn: new Date().toISOString() }])
      setMsg({ ok: true, texto: esFactura ? 'Factura recibida. El taller la revisará.' : 'Albarán recibido.' })
      form.reset()
    } else setMsg({ ok: false, texto: r.mensaje ?? 'No se pudo subir' })
  }

  return (
    <div className="formulario">
      {!esFactura && (
        confirmado
          ? <p className="ok">Pedido confirmado.</p>
          : <button className="btn" type="button" disabled={ocupado} onClick={confirmar}>Confirmar el pedido</button>
      )}
      {!facturaSubida && (
        <form onSubmit={subir} className="formulario">
          <label className="campo">{esFactura ? 'Factura (PDF, XML Facturae/UBL o foto)' : 'Albarán de entrega (PDF o foto)'}
            <input type="file" name="archivo" accept={ACEPTA} required />
          </label>
          <button className="btn" disabled={ocupado}>{ocupado ? 'Enviando…' : esFactura ? 'Enviar la factura' : 'Enviar el albarán'}</button>
          <p className="tenue">Máximo {vista.maxMb} MB. Formatos: PDF, JPG, PNG o XML.</p>
        </form>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'aviso-error'} role={msg.ok ? 'status' : 'alert'}>{msg.texto}</p>}
      {docs.length > 0 && (
        <>
          <h2>Enviado</h2>
          <ul>{docs.map((d, i) => <li key={i}>{d.tipo === 'factura' ? 'Factura' : 'Albarán'} · {d.nombre}</li>)}</ul>
        </>
      )}
    </div>
  )
}

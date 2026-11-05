import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { conTaller, enlaceProveedorLimitado } from '@/lib/db'
import { ipDeCabecera } from '@/lib/ip'
import { enlaceVigente, vistaProveedor, type TxPortal } from '@/lib/portal-proveedor'
import { Cabecera } from '../../_marca'
import { PortalProveedorCliente } from './PortalProveedorCliente'

export const dynamic = 'force-dynamic'
// El token va en la URL: que no salga en el Referer hacia nada (logo, enlaces).
export const metadata: Metadata = { title: 'Pedido del taller', robots: { index: false, follow: false }, referrer: 'no-referrer' }

/**
 * Página PÚBLICA del proveedor (móvil): marca del taller + «con Grupo ASegura». Muestra SOLO el documento del enlace (pedido o
 * albarán) y deja confirmar el pedido y subir el albarán o la factura. Token malo, caducado, revocado, cerrado o IP bloqueada → 404.
 */
export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const h = await headers()
  const ahora = new Date()
  const r = await enlaceProveedorLimitado(token, ipDeCabecera(h.get('x-forwarded-for')), ahora)
  if (!r) notFound()
  const vista = await conTaller(r.tallerId, async (tx) => {
    const e = await enlaceVigente(tx as unknown as TxPortal, { tallerId: r.tallerId, enlaceId: r.enlaceId, token, ahora })
    return e ? vistaProveedor(tx as unknown as TxPortal, e, ahora) : null
  })
  if (!vista) notFound()
  return (
    <>
      <Cabecera tallerId={r.tallerId} />
      <main className="contenido">
        <h1>{vista.proposito === 'pedido' ? vista.referencia : `Factura del ${vista.referencia.toLowerCase()}`}</h1>
        <p className="tenue">{vista.proveedor ? `${vista.proveedor} · ` : ''}{vista.fecha}</p>
        <div className="tabla-scroll"><table className="tabla-cards">
          <thead><tr><th>Artículo</th><th className="num">Cantidad</th></tr></thead>
          <tbody>
            {vista.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.descripcion}{l.referencia ? <span className="tenue"> · ref. {l.referencia}</span> : null}</td>
                <td className="num" data-label="Cantidad">{l.cantidad}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <PortalProveedorCliente token={token} vista={vista} />
      </main>
    </>
  )
}

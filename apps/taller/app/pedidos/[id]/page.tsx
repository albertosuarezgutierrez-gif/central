import { notFound, redirect } from 'next/navigation'
import { formatearCantidad, pendienteDeRecibir, type UnidadStock } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { tienePermiso } from '@/lib/permisos'
import { textoPedido } from '@/lib/pedidos'
import { claseEstado } from '../../_ui'
import { Cabecera } from '../../_marca'
import { cancelarPedidoAccion, marcarEnviadoAccion } from '../acciones'
import { CopiarImprimir } from './CopiarImprimir'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ETIQUETA: Record<string, string> = { borrador: 'Borrador', enviado: 'Enviado (a mano)', parcial: 'Recibido parcial', recibido: 'Recibido', facturado: 'Facturado', cancelado: 'Cancelado' }
const dia = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

export default async function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; ok?: string }> }) {
  const { id } = await params
  const q = await searchParams
  if (!UUID.test(id)) notFound()
  const datos = await paraPagina('almacen', async (tx, c) => {
    const p = await tx.pedido.findFirst({ where: { tallerId: c.tallerId, id } })
    if (!p) return null
    const [lineas, prov, taller] = await Promise.all([
      tx.pedidoLinea.findMany({ where: { tallerId: c.tallerId, pedidoId: id }, orderBy: { creadoEn: 'asc' } }),
      tx.proveedor.findFirst({ where: { tallerId: c.tallerId, id: p.proveedorId } }),
      tx.taller.findFirst({ where: { id: c.tallerId } }),
    ])
    const texto = textoPedido({ id: p.id, matricula: p.matricula ?? null, notas: p.notas ?? null }, { nombre: prov?.nombre ?? '—' }, { nombreComercial: taller?.nombreComercial ?? '' },
      lineas.map((l) => ({ descripcion: l.descripcion, referencia: l.referencia ?? null, cantidad: Number(l.cantidad), unidad: l.unidad })), p.creadoEn)
    return { p, lineas, prov, texto, puedeEnviar: tienePermiso(c.rol, 'pedidos_enviar') }
  })
  if (datos === 'sin_sesion') redirect('/login')
  if (datos === 'sin_permiso') return <main className="contenido"><p className="tenue">Tu perfil no incluye el almacén.</p></main>
  if (!datos) notFound()
  const { p, lineas, prov, texto } = datos
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Pedido {p.id.slice(0, 8).toUpperCase()}</h1>
        {q.aviso && <p className={q.ok ? 'ok' : 'aviso-error'} role="alert">{q.aviso}</p>}
        <p><span className={claseEstado(p.estado === 'parcial' ? 'pendiente' : p.estado === 'recibido' || p.estado === 'facturado' ? 'ok' : p.estado)}>{ETIQUETA[p.estado] ?? p.estado}</span>
          {' '}· {prov?.nombre ?? '—'}{p.matricula ? ` · ${p.matricula}` : ''} · {dia(p.creadoEn)}
          {p.enviadoEn ? ` · marcado como enviado el ${dia(p.enviadoEn)}` : ''}</p>
        <div className="tabla-scroll"><table className="tabla-cards">
          <thead><tr><th>Línea</th><th className="num">Pedido</th><th className="num">Recibido</th><th className="num">Falta</th></tr></thead>
          <tbody>
            {lineas.map((l) => {
              const u = (l.unidad === 'ml' ? 'ml' : 'ud') as UnidadStock
              const falta = pendienteDeRecibir({ cantidad: Number(l.cantidad), recibida: Number(l.cantidadRecibida) })
              return (
                <tr key={l.id}>
                  <td>{l.descripcion}{l.referencia ? <span className="tenue"> · ref. {l.referencia}</span> : null}</td>
                  <td className="num" data-label="Pedido">{formatearCantidad(Number(l.cantidad), u)}</td>
                  <td className="num" data-label="Recibido">{formatearCantidad(Number(l.cantidadRecibida), u)}</td>
                  <td className="num" data-label="Falta">{falta === 0 ? '—' : formatearCantidad(falta, u)}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        <h2>Texto del pedido</h2>
        <pre className="texto-pedido" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{texto}</pre>
        <CopiarImprimir texto={texto} />
        <div className="fila no-imprimir">
          {p.estado === 'borrador' && datos.puedeEnviar && (
            <form action={marcarEnviadoAccion}><input type="hidden" name="pedidoId" value={p.id} />
              <button className="btn">Ya lo he enviado (marcar)</button></form>
          )}
          {p.estado === 'borrador' && !datos.puedeEnviar && <p className="tenue">Solo el dueño marca un pedido como enviado.</p>}
          {['enviado', 'parcial'].includes(p.estado) && <a className="btn" href={`/albaranes?pedido=${p.id}`}>Registrar albarán de este pedido</a>}
          {['borrador', 'enviado'].includes(p.estado) && (
            <form action={cancelarPedidoAccion}><input type="hidden" name="pedidoId" value={p.id} /><button className="btn btn-sec">Cancelar pedido</button></form>
          )}
        </div>
        <p className="no-imprimir"><a href="/pedidos" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

import { redirect } from 'next/navigation'
import { formatearCantidad, pendienteDeRecibir, type UnidadStock } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { claseEstado } from '../_ui'
import { Cabecera } from '../_marca'
import { registrarAlbaranAccion } from './acciones'

export const dynamic = 'force-dynamic'
const PAGINA = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dia = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

/** Albaranes de entrada (50 + «Ver más») y formulario de recepción: libre o desde un pedido (`?pedido=`). */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ n?: string; pedido?: string; aviso?: string; ok?: string }> }) {
  const q = await searchParams
  const n = Math.min(Math.max(Number(q.n) || PAGINA, PAGINA), 1000)
  const pedidoId = q.pedido && UUID.test(q.pedido) ? q.pedido : null
  const datos = await paraPagina('almacen', async (tx, c) => {
    const as = await tx.albaran.findMany({ where: { tallerId: c.tallerId }, orderBy: { creadoEn: 'desc' }, take: n + 1 })
    const provs = await tx.proveedor.findMany({ where: { tallerId: c.tallerId }, orderBy: { nombre: 'asc' } })
    const arts = await tx.articulo.findMany({ where: { tallerId: c.tallerId, activo: true }, orderBy: { descripcion: 'asc' }, take: 1000 })
    const pedido = pedidoId ? await tx.pedido.findFirst({ where: { tallerId: c.tallerId, id: pedidoId } }) : null
    const lineasPedido = pedido ? (await tx.pedidoLinea.findMany({ where: { tallerId: c.tallerId, pedidoId: pedido.id }, orderBy: { creadoEn: 'asc' } })).filter((l) => pendienteDeRecibir({ cantidad: Number(l.cantidad), recibida: Number(l.cantidadRecibida) }) > 0) : []
    return {
      hayMas: as.length > n,
      albaranes: as.slice(0, n).map((a) => ({ id: a.id as string, numero: a.numeroProveedor as string, fecha: a.fecha as Date, estado: a.estado as string, proveedor: provs.find((p) => p.id === a.proveedorId)?.nombre ?? '—' })),
      proveedores: provs.filter((p) => p.activo !== false).map((p) => ({ id: p.id as string, nombre: p.nombre as string })),
      articulos: arts.map((a) => ({ id: a.id as string, texto: `${a.descripcion}${a.referencia ? ` · ${a.referencia}` : ''} (${a.unidad === 'ml' ? 'litros' : 'ud'})` })),
      pedido: pedido && ['enviado', 'parcial'].includes(pedido.estado) ? { id: pedido.id as string, proveedorId: pedido.proveedorId as string } : null,
      lineasPedido: lineasPedido.map((l) => ({ id: l.id as string, descripcion: l.descripcion as string, unidad: l.unidad as UnidadStock, falta: pendienteDeRecibir({ cantidad: Number(l.cantidad), recibida: Number(l.cantidadRecibida) }) })),
    }
  })
  if (datos === 'sin_sesion') redirect('/login')
  const hoy = new Date().toISOString().slice(0, 10)
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Albaranes de entrada</h1>
        {q.aviso && <p className={q.ok ? 'ok' : 'aviso-error'} role="alert">{q.aviso}</p>}
        {datos === 'sin_permiso' ? <p className="tenue">Tu perfil no incluye el almacén.</p> : (
          <>
            <details open={!!datos.pedido}>
              <summary className="btn btn-sec">{datos.pedido ? 'Recibir mercancía del pedido' : 'Registrar albarán'}</summary>
              <form action={registrarAlbaranAccion} className="formulario">
                {datos.pedido && <input type="hidden" name="pedidoId" value={datos.pedido.id} />}
                <div className="dos-col">
                  <label className="campo">Proveedor<select name="proveedorId" required defaultValue={datos.pedido?.proveedorId ?? ''}>
                    <option value="" disabled>Elige…</option>{datos.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
                  <label className="campo">Nº de albarán del proveedor<input name="numero" required maxLength={60} /></label>
                  <label className="campo">Fecha<input type="date" name="fecha" required defaultValue={hoy} /></label>
                </div>
                {datos.pedido ? datos.lineasPedido.map((l, i) => (
                  <div className="dos-col" key={l.id}>
                    <input type="hidden" name={`pl${i + 1}`} value={l.id} />
                    <p>{l.descripcion}<span className="tenue"> · falta {formatearCantidad(l.falta, l.unidad)}</span></p>
                    <label className="campo">Llega ahora ({l.unidad === 'ml' ? 'litros' : 'ud'}; vacío = nada)<input name={`cantidad${i + 1}`} inputMode="decimal" defaultValue={l.unidad === 'ml' ? String(l.falta / 1000).replace('.', ',') : String(l.falta)} /></label>
                    <label className="campo">Precio ({l.unidad === 'ml' ? '€/litro' : '€/ud'}; vacío = sin valorar)<input name={`coste${i + 1}`} inputMode="decimal" /></label>
                  </div>
                )) : [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div className="dos-col" key={i}>
                    <label className="campo">Artículo {i}<select name={`articulo${i}`} defaultValue=""><option value="">Texto libre (no entra en stock)</option>{datos.articulos.map((a) => <option key={a.id} value={a.id}>{a.texto}</option>)}</select></label>
                    <label className="campo">Descripción (texto libre)<input name={`descripcion${i}`} maxLength={200} /></label>
                    <label className="campo">Cantidad (ud o litros)<input name={`cantidad${i}`} inputMode="decimal" /></label>
                    <label className="campo">Precio (€/ud o €/litro; vacío = sin valorar)<input name={`coste${i}`} inputMode="decimal" /></label>
                  </div>
                ))}
                <button className="btn">Registrar entrada</button>
                <p className="tenue">Sube el stock y recalcula el coste medio. Un mismo albarán no se puede registrar dos veces.</p>
              </form>
            </details>
            <h2>Registrados</h2>
            {datos.albaranes.length === 0 ? <p className="tenue">Aún no hay albaranes.</p> : (
              <div className="tabla-scroll"><table className="tabla-cards">
                <thead><tr><th>Albarán</th><th>Fecha</th><th>Proveedor</th><th>Estado</th></tr></thead>
                <tbody>
                  {datos.albaranes.map((a) => (
                    <tr key={a.id}>
                      <td><a href={`/albaranes/${a.id}`}>{a.numero}</a></td>
                      <td data-label="Fecha">{dia(a.fecha)}</td>
                      <td data-label="Proveedor">{a.proveedor}</td>
                      <td data-label="Estado"><span className={claseEstado(a.estado === 'valorado' ? 'ok' : 'pendiente')}>{a.estado === 'valorado' ? 'Valorado con factura' : 'Pendiente de factura'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            {datos.hayMas && <p><a className="btn btn-sec" href={`/albaranes?n=${n + PAGINA}`}>Ver más</a></p>}
          </>
        )}
        <p><a href="/articulos" className="btn btn-sec">Artículos</a> <a href="/pedidos" className="btn btn-sec">Pedidos</a> <a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

import { redirect } from 'next/navigation'
import { paraPagina } from '@/lib/contexto'
import { claseEstado } from '../_ui'
import { Cabecera } from '../_marca'
import { crearPedidoAccion } from './acciones'

export const dynamic = 'force-dynamic'
const PAGINA = 50
const fecha = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')
const ETIQUETA: Record<string, string> = { borrador: 'Borrador', enviado: 'Enviado (a mano)', parcial: 'Recibido parcial', recibido: 'Recibido', facturado: 'Facturado', cancelado: 'Cancelado' }

/** Pedidos a proveedor (más recientes primero, 50 + «Ver más»). El pedido se imprime o se copia: la app no envía nada. */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ n?: string; aviso?: string; ok?: string }> }) {
  const q = await searchParams
  const n = Math.min(Math.max(Number(q.n) || PAGINA, PAGINA), 1000)
  const datos = await paraPagina('almacen', async (tx, c) => {
    const ps = await tx.pedido.findMany({ where: { tallerId: c.tallerId }, orderBy: { creadoEn: 'desc' }, take: n + 1 })
    const provs = await tx.proveedor.findMany({ where: { tallerId: c.tallerId }, orderBy: { nombre: 'asc' } })
    const arts = await tx.articulo.findMany({ where: { tallerId: c.tallerId, activo: true }, orderBy: { descripcion: 'asc' }, take: 1000 })
    return {
      hayMas: ps.length > n,
      pedidos: ps.slice(0, n).map((p) => ({ id: p.id as string, estado: p.estado as string, creado: p.creadoEn as Date, matricula: (p.matricula ?? null) as string | null, proveedor: provs.find((x) => x.id === p.proveedorId)?.nombre ?? '—' })),
      proveedores: provs.filter((p) => p.activo !== false).map((p) => ({ id: p.id as string, nombre: p.nombre as string })),
      articulos: arts.map((a) => ({ id: a.id as string, texto: `${a.descripcion}${a.referencia ? ` · ${a.referencia}` : ''} (${a.unidad === 'ml' ? 'litros' : 'ud'})` })),
    }
  })
  if (datos === 'sin_sesion') redirect('/login')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Pedidos a proveedor</h1>
        {q.aviso && <p className={q.ok ? 'ok' : 'aviso-error'} role="alert">{q.aviso}</p>}
        {datos === 'sin_permiso' ? <p className="tenue">Tu perfil no incluye el almacén.</p> : (
          <>
            <p className="tenue">Los pedidos NO se envían desde la app: se imprimen o se copian y los mandas tú. Aquí queda constancia de qué se pidió y qué ha llegado.</p>
            <details>
              <summary className="btn btn-sec">Nuevo pedido</summary>
              {datos.proveedores.length === 0 ? <p className="tenue">Primero da de alta un proveedor en Ajustes.</p> : (
                <form action={crearPedidoAccion} className="formulario">
                  <label className="campo">Proveedor<select name="proveedorId" required defaultValue="">
                    <option value="" disabled>Elige…</option>{datos.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div className="dos-col" key={i}>
                      <label className="campo">Artículo {i}<select name={`articulo${i}`} defaultValue=""><option value="">Texto libre</option>{datos.articulos.map((a) => <option key={a.id} value={a.id}>{a.texto}</option>)}</select></label>
                      <label className="campo">Descripción (si es texto libre)<input name={`descripcion${i}`} maxLength={200} /></label>
                      <label className="campo">Cantidad (ud o litros)<input name={`cantidad${i}`} inputMode="decimal" /></label>
                    </div>
                  ))}
                  <label className="campo">Notas<textarea name="notas" maxLength={500} rows={2} /></label>
                  <button className="btn">Crear borrador</button>
                </form>
              )}
            </details>
            {datos.pedidos.length === 0 ? <p className="tenue">Aún no hay pedidos.</p> : (
              <div className="tabla-scroll"><table className="tabla-cards">
                <thead><tr><th>Pedido</th><th>Fecha</th><th>Proveedor</th><th>Matrícula</th><th>Estado</th></tr></thead>
                <tbody>
                  {datos.pedidos.map((p) => (
                    <tr key={p.id}>
                      <td><a href={`/pedidos/${p.id}`}>{p.id.slice(0, 8).toUpperCase()}</a></td>
                      <td data-label="Fecha">{fecha(p.creado)}</td>
                      <td data-label="Proveedor">{p.proveedor}</td>
                      <td data-label="Matrícula">{p.matricula ?? '—'}</td>
                      <td data-label="Estado"><span className={claseEstado(p.estado === 'parcial' ? 'pendiente' : p.estado === 'recibido' || p.estado === 'facturado' ? 'ok' : p.estado)}>{ETIQUETA[p.estado] ?? p.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            {datos.hayMas && <p><a className="btn btn-sec" href={`/pedidos?n=${n + PAGINA}`}>Ver más</a></p>}
          </>
        )}
        <p><a href="/articulos" className="btn btn-sec">Artículos</a> <a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

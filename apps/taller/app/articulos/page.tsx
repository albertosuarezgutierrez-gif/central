/* eslint-disable @typescript-eslint/no-explicit-any -- filas Prisma sin tipar en la vista */
import { redirect } from 'next/navigation'
import { formatearCantidad, formatearEur, type UnidadStock } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { cargarAvisosStock } from '@/lib/stock'
import { Cabecera } from '../_marca'
import { ajustarInventarioAccion, crearArticuloAccion, editarArticuloAccion } from './acciones'

export const dynamic = 'force-dynamic'
const PAGINA = 50
const cent = (v: unknown) => (v == null ? '' : String(Number(v) / 100).replace('.', ','))
const pct = (pb: number | null) => (pb == null ? '' : String(pb / 100).replace('.', ','))
const unidadTxt = (u: string) => (u === 'ml' ? 'litros' : 'unidades')

function CamposArticulo({ a, ivas }: { a?: any; ivas: { codigo: string; nombre: string }[] }) {
  const ml = a?.unidad === 'ml'
  return (
    <div className="dos-col">
      <label className="campo">Descripción<input name="descripcion" required defaultValue={a?.descripcion ?? ''} maxLength={200} /></label>
      <label className="campo">Referencia propia<input name="referencia" defaultValue={a?.referencia ?? ''} maxLength={60} /></label>
      <label className="campo">Referencia del fabricante<input name="referenciaFabricante" defaultValue={a?.referenciaFabricante ?? ''} maxLength={60} /></label>
      <label className="campo">Marca<input name="marca" defaultValue={a?.marca ?? ''} maxLength={60} /></label>
      <label className="campo">Se mide en
        <select name="unidad" defaultValue={a?.unidad ?? 'ud'} disabled={!!a && (a.stock != null || a.costeMedioCent != null)}>
          <option value="ud">Unidades</option><option value="ml">Litros (granel: aceites, líquidos)</option>
        </select>
        {a && (a.stock != null || a.costeMedioCent != null) && <input type="hidden" name="unidad" value={a.unidad} />}
      </label>
      <label className="campo">PVP ({ml ? '€/litro' : '€/ud'}, IVA no incluido)<input name="pvp" inputMode="decimal" defaultValue={cent(a?.pvpCent)} placeholder="vacío = coste + margen" /></label>
      <label className="campo">Margen por defecto (% sobre coste)<input name="margen" inputMode="decimal" defaultValue={pct(a?.margenPuntosBasicos ?? null)} placeholder="p. ej. 35" /></label>
      <label className="campo">IVA
        <select name="ivaCodigo" defaultValue={a?.ivaCodigo ?? ''}><option value="">El de por defecto</option>{ivas.map((i) => <option key={i.codigo} value={i.codigo}>{i.nombre}</option>)}</select>
      </label>
      <label className="campo">Stock mínimo ({ml ? 'litros' : 'unidades'}; vacío = sin aviso)<input name="minimo" inputMode="decimal" defaultValue={a?.minimo == null ? '' : ml ? String(a.minimo / 1000).replace('.', ',') : a.minimo} /></label>
      <label className="campo">Envase (litros, solo granel)<input name="envase" inputMode="decimal" defaultValue={a?.mlPorEnvase ? String(a.mlPorEnvase / 1000).replace('.', ',') : ''} /></label>
    </div>
  )
}

/** Artículos y almacén: lista (50 + «Ver más»), alta, edición, recuento de inventario con motivo. Los movimientos nunca se editan. */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ n?: string; q?: string; aviso?: string; ok?: string }> }) {
  const q = await searchParams
  const n = Math.min(Math.max(Number(q.n) || PAGINA, PAGINA), 1000)
  const filtro = (q.q ?? '').trim().toLowerCase().slice(0, 60)
  const datos = await paraPagina('almacen', async (tx, c) => {
    const todos = await tx.articulo.findMany({ where: { tallerId: c.tallerId }, orderBy: { descripcion: 'asc' }, take: 5000 })
    const ivas = (await tx.tipoIva.findMany({ where: { tallerId: c.tallerId, activo: true }, orderBy: { codigo: 'asc' } })).map((i) => ({ codigo: i.codigo as string, nombre: i.nombre as string }))
    const lista = todos.filter((a) => !filtro || `${a.descripcion} ${a.referencia ?? ''} ${a.referenciaFabricante ?? ''} ${a.marca ?? ''}`.toLowerCase().includes(filtro))
    return { avisos: await cargarAvisosStock(tx as never, c.tallerId), ivas, total: lista.length, articulos: lista.slice(0, n) }
  })
  if (datos === 'sin_sesion') redirect('/login')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Artículos</h1>
        {q.aviso && <p className={q.ok ? 'ok' : 'aviso-error'} role="alert">{q.aviso}</p>}
        {datos === 'sin_permiso' ? <p className="tenue">Tu perfil no incluye el almacén.</p> : (
          <>
            <div className="fila"><a className="btn btn-sec" href="/pedidos">Pedidos</a><a className="btn btn-sec" href="/albaranes">Albaranes</a></div>
            {datos.avisos.length > 0 && (
              <section aria-label="Avisos de stock">
                <h2>Avisos de stock</h2>
                <ul className="lista-simple">
                  {datos.avisos.map((a) => (
                    <li key={a.articuloId}><span>{a.descripcion}</span>
                      <span className={a.tipo === 'bajo_minimo' ? 'estado estado-aviso' : 'estado estado-alerta'}>
                        {a.tipo === 'negativo' ? 'Stock negativo' : a.tipo === 'agotado' ? 'Agotado' : 'Bajo mínimo'}: {formatearCantidad(a.stock, a.unidad as UnidadStock)}{a.minimo != null ? ` (mín. ${formatearCantidad(a.minimo, a.unidad as UnidadStock)})` : ''}
                      </span></li>
                  ))}
                </ul>
              </section>
            )}
            <form method="get" className="fila"><input name="q" defaultValue={q.q ?? ''} placeholder="Buscar por descripción, referencia o marca" aria-label="Buscar" /><button className="btn btn-sec">Buscar</button></form>
            <details>
              <summary className="btn btn-sec">Nuevo artículo</summary>
              <form action={crearArticuloAccion} className="formulario"><CamposArticulo ivas={datos.ivas} /><button className="btn">Crear artículo</button>
                <p className="tenue">No se lleva a stock hasta el primer recuento (Inventario) o la primera entrada por albarán.</p></form>
            </details>
            <h2>Catálogo ({datos.total})</h2>
            {datos.articulos.length === 0 ? <p className="tenue">No hay artículos.</p> : (
              <div className="tabla-scroll"><table className="tabla-cards">
                <thead><tr><th>Artículo</th><th className="num">Stock</th><th className="num">Coste medio</th><th className="num">PVP</th><th>Acciones</th></tr></thead>
                <tbody>
                  {datos.articulos.map((a) => {
                    const u = a.unidad as UnidadStock
                    const stock = a.stock == null ? null : Number(a.stock)
                    return (
                      <tr key={a.id} style={a.activo === false ? { opacity: 0.6 } : undefined}>
                        <td>{a.descripcion}{a.referencia ? <span className="tenue"> · {a.referencia}</span> : null}{a.activo === false ? ' (inactivo)' : ''}</td>
                        <td className="num" data-label="Stock">{stock == null ? <span className="tenue">no se lleva</span> : <span className={stock < 0 ? 'estado estado-alerta' : ''}>{formatearCantidad(stock, u)}</span>}</td>
                        <td className="num" data-label="Coste medio">{a.costeMedioCent == null ? '—' : `${formatearEur(Number(a.costeMedioCent))}${u === 'ml' ? '/L' : ''}`}</td>
                        <td className="num" data-label="PVP">{a.pvpCent == null ? (a.margenPuntosBasicos == null ? '—' : `coste + ${pct(a.margenPuntosBasicos)} %`) : `${formatearEur(Number(a.pvpCent))}${u === 'ml' ? '/L' : ''}`}</td>
                        <td data-label="Acciones">
                          <details>
                            <summary className="btn btn-sec">Editar / inventario</summary>
                            <form action={editarArticuloAccion} className="formulario">
                              <input type="hidden" name="id" value={a.id} /><CamposArticulo a={a} ivas={datos.ivas} />
                              <label className="check"><input type="checkbox" name="activo" defaultChecked={a.activo !== false} /> Activo</label>
                              <button className="btn">Guardar</button>
                            </form>
                            <form action={ajustarInventarioAccion} className="formulario">
                              <input type="hidden" name="id" value={a.id} />
                              <label className="campo">Recuento real ({unidadTxt(a.unidad)})<input name="contado" inputMode="decimal" required /></label>
                              <label className="campo">Motivo del ajuste<input name="nota" required maxLength={300} placeholder="p. ej. recuento de fin de mes" /></label>
                              <button className="btn btn-sec">Ajustar inventario</button>
                            </form>
                          </details>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
            {datos.total > n && <p><a className="btn btn-sec" href={`/articulos?n=${n + PAGINA}${q.q ? `&q=${encodeURIComponent(q.q)}` : ''}`}>Ver más</a></p>}
          </>
        )}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

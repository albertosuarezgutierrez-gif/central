import { Cabecera } from '../_cabecera'
import { FormCompra } from './FormCompra'
import { Pagar } from './Pagar'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { pendientesDePago } from '@/lib/compras'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'
import { formatearCentimos, fechaEs } from '@/lib/importes'
import { CATEGORIAS_GASTO, etiquetaCategoria, plantillaDe } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

export default async function Compras({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const limite = limiteDe((await searchParams).n)
  const hoy = new Date()
  const pendientes = await conRepo(ctx.empresaId, (r) => pendientesDePago(r, hoy), { timeout: 20_000 })
  // Facturas y proveedores viven en tablas de 0003: si aún no está aplicada, la pantalla lo dice en vez de romper.
  const f3 = await conRepo(ctx.empresaId, async (r) => ({ facturas: await r.facturasRecibidas({ limite: limite + 1 }), proveedores: await r.proveedoresRecientes(200) })).catch(() => null)
  const sector = empresa?.sector ?? 'generico'
  const delSector = Object.keys(plantillaDe(sector).reglas.categorias?.compra ?? {})
  const categorias = [...new Set([...delSector, ...CATEGORIAS_GASTO])].map((clave) => ({ clave, etiqueta: etiquetaCategoria(clave) }))
  const total = pendientes.reduce((t, p) => t + p.pendiente, 0)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Compras</h1>
        <p className="tenue">Facturas recibidas de proveedores y acreedores. Al registrar una se asienta sola (gasto + IVA soportado contra proveedores; con retención, contra acreedores y Hacienda). Un mismo proveedor con el mismo número de factura no se puede registrar dos veces.</p>

        <h2>Pendiente de pago</h2>
        {pendientes.length === 0
          ? <p className="tenue">Sin datos pendientes: no hay facturas recibidas por pagar.</p>
          : (
            <div className="tabla-scroll">
              <table className="tabla-cards">
                <thead><tr><th>Factura</th><th>Desde</th><th className="num">Días</th><th className="num">Pendiente</th><th /></tr></thead>
                <tbody>
                  {pendientes.slice(0, limite).map((p) => (
                    <tr key={`${p.cuenta}|${p.documento}`}>
                      <td>{p.documento}</td>
                      <td data-label="Desde">{fechaEs(p.desde)}</td>
                      <td className="num" data-label="Días">{p.dias}</td>
                      <td className="num" data-label="Pendiente">{formatearCentimos(p.pendiente)}</td>
                      <td><Pagar documento={p.documento} cuenta={p.cuenta} pendiente={p.pendiente} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total pendiente</td><td className="num">{formatearCentimos(total)}</td><td /></tr></tfoot>
              </table>
            </div>
          )}
        {pendientes.length > limite && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={`/compras?n=${limite + PASO}`}>Ver más</a></p>}

        <h2>Registrar factura recibida</h2>
        {f3 === null
          ? <p className="aviso-error">Compras aún no está disponible para esta empresa (falta aplicar el esquema de la fase 3).</p>
          : <FormCompra categorias={categorias} proveedores={f3.proveedores.map((p) => ({ nif: p.nif, nombre: p.nombre }))} />}

        <h2>Últimas facturas recibidas</h2>
        {f3 && f3.facturas.length === 0 && <p className="tenue">Sin datos: todavía no hay facturas recibidas.</p>}
        {f3 && f3.facturas.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla-cards">
              <thead><tr><th>Proveedor</th><th>Nº</th><th>Fecha</th><th className="num">Base</th><th className="num">Total</th><th>Origen</th></tr></thead>
              <tbody>
                {f3.facturas.slice(0, limite).map((f) => (
                  <tr key={f.id}>
                    <td>{f.proveedorNombre}<span className="tenue"> · {f.proveedorNif}</span></td>
                    <td data-label="Nº">{f.numero}</td>
                    <td data-label="Fecha">{fechaEs(f.fecha)}</td>
                    <td className="num" data-label="Base">{formatearCentimos(f.base)}</td>
                    <td className="num" data-label="Total">{formatearCentimos(f.total)}</td>
                    <td data-label="Origen">{f.origen === 'manual' ? 'Manual' : f.origen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {f3 && f3.facturas.length > limite && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={`/compras?n=${limite + PASO}`}>Ver más</a></p>}
        <p className="tenue">La entrada automática de facturas (correo y lectura de PDF) todavía no está conectada: hoy se registran a mano.</p>
      </main>
    </>
  )
}

import { notFound, redirect } from 'next/navigation'
import { formatearCantidad, formatearEur, importeStockCent, type UnidadStock } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { Cabecera } from '../../_marca'
import { valorarAlbaranAccion } from '../acciones'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dia = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

export default async function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; ok?: string }> }) {
  const { id } = await params
  const q = await searchParams
  if (!UUID.test(id)) notFound()
  const datos = await paraPagina('almacen', async (tx, c) => {
    const a = await tx.albaran.findFirst({ where: { tallerId: c.tallerId, id } })
    if (!a) return null
    const [lineas, prov] = await Promise.all([
      tx.albaranLinea.findMany({ where: { tallerId: c.tallerId, albaranId: id }, orderBy: { creadoEn: 'asc' } }),
      tx.proveedor.findFirst({ where: { tallerId: c.tallerId, id: a.proveedorId } }),
    ])
    return { a, lineas, prov }
  })
  if (datos === 'sin_sesion') redirect('/login')
  if (datos === 'sin_permiso') return <main className="contenido"><p className="tenue">Tu perfil no incluye el almacén.</p></main>
  if (!datos) notFound()
  const { a, lineas, prov } = datos
  const hoy = new Date().toISOString().slice(0, 10)
  const sinValorar = lineas.filter((l) => l.costeUnitarioCent == null)
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Albarán {a.numeroProveedor}</h1>
        {q.aviso && <p className={q.ok ? 'ok' : 'aviso-error'} role="alert">{q.aviso}</p>}
        <p>{prov?.nombre ?? '—'} · {dia(a.fecha)} · {a.estado === 'valorado' ? `valorado con la factura ${a.facturaProveedorNumero}` : 'pendiente de factura'}</p>
        <div className="tabla-scroll"><table className="tabla-cards">
          <thead><tr><th>Línea</th><th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Importe</th></tr></thead>
          <tbody>
            {lineas.map((l) => {
              const u = (l.unidad === 'ml' ? 'ml' : 'ud') as UnidadStock
              const c = l.costeUnitarioCent == null ? null : Number(l.costeUnitarioCent)
              return (
                <tr key={l.id}>
                  <td>{l.descripcion}</td>
                  <td className="num" data-label="Cantidad">{formatearCantidad(Number(l.cantidad), u)}</td>
                  <td className="num" data-label="Precio">{c == null ? 'sin valorar' : `${formatearEur(c)}${u === 'ml' ? '/L' : ''}`}</td>
                  <td className="num" data-label="Importe">{c == null ? '—' : formatearEur(importeStockCent(Number(l.cantidad), c, u))}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        {a.estado === 'recibido' && (
          <>
            <h2>Valorar con la factura del proveedor</h2>
            <form action={valorarAlbaranAccion} className="formulario">
              <input type="hidden" name="albaranId" value={a.id} />
              <div className="dos-col">
                <label className="campo">Nº de factura del proveedor<input name="facturaNumero" required maxLength={60} /></label>
                <label className="campo">Fecha de la factura<input type="date" name="facturaFecha" required defaultValue={hoy} /></label>
              </div>
              {sinValorar.map((l) => (
                <label className="campo" key={l.id}>Precio de «{l.descripcion}» ({l.unidad === 'ml' ? '€/litro' : '€/ud'})
                  <input name={`coste_${l.id}`} inputMode="decimal" required /></label>
              ))}
              <button className="btn">Valorar y preparar la compra para contabilidad</button>
              <p className="tenue">Ajusta el coste medio de lo que aún queda en el almacén. Solo deja la compra preparada: no envía nada a nadie.</p>
            </form>
          </>
        )}
        <p><a href="/albaranes" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

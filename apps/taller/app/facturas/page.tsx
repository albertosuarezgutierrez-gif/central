import { redirect } from 'next/navigation'
import { formatearEur } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { Cabecera } from '../_marca'

export const dynamic = 'force-dynamic'
const PAGINA = 50
const fecha = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

/** Listado de facturas emitidas (más recientes primero), con lo cobrado y lo pendiente. ~50 + «Ver más». */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const q = await searchParams
  const n = Math.min(Math.max(Number(q.n) || PAGINA, PAGINA), 1000)
  const datos = await paraPagina('facturar', async (tx, c) => {
    const fs = await tx.factura.findMany({ where: { tallerId: c.tallerId }, orderBy: { emitidaEn: 'desc' }, take: n + 1 })
    const cobros = fs.length
      ? await tx.cobro.findMany({ where: { tallerId: c.tallerId, facturaId: { in: fs.map((f) => f.id) } } })
      : []
    return {
      hayMas: fs.length > n,
      facturas: fs.slice(0, n).map((f) => {
        const total = Number(f.totalCent)
        const cobrado = cobros.filter((x) => x.facturaId === f.id).reduce((s, x) => s + Number(x.importeCent), 0)
        return { id: f.id, numSerie: f.numSerie, tipo: f.tipo, fecha: f.fechaExpedicion as Date, cliente: f.clienteNombre, total, cobrado, estado: f.estado }
      }),
    }
  })
  if (datos === 'sin_sesion') redirect('/login')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Facturas</h1>
        {datos === 'sin_permiso' ? <p className="tenue">Tu perfil no incluye la facturación.</p> : datos.facturas.length === 0 ? (
          <p className="tenue">Aún no hay facturas. Se emiten desde la orden de trabajo terminada.</p>
        ) : (
          <div className="tabla-scroll"><table className="tabla-cards">
            <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th className="num">Total</th><th className="num">Pendiente</th><th>Estado</th></tr></thead>
            <tbody>
              {datos.facturas.map((f) => (
                <tr key={f.id}>
                  <td><a href={`/facturas/${f.id}`}>{f.numSerie}</a>{f.tipo === 'F2' ? ' (simplificada)' : f.tipo.startsWith('R') ? ' (rectificativa)' : ''}</td>
                  <td data-label="Fecha">{fecha(f.fecha)}</td>
                  <td data-label="Cliente">{f.cliente ?? '—'}</td>
                  <td className="num" data-label="Total">{formatearEur(f.total)}</td>
                  <td className="num" data-label="Pendiente">{f.estado === 'anulada' || f.total <= 0 ? '—' : formatearEur(f.total - f.cobrado)}</td>
                  <td data-label="Estado"><span className={f.estado === 'anulada' ? 'estado estado-alerta' : 'estado estado-ok'}>{f.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {datos !== 'sin_permiso' && datos.hayMas && <p><a className="btn btn-sec" href={`/facturas?n=${n + PAGINA}`}>Ver más</a></p>}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

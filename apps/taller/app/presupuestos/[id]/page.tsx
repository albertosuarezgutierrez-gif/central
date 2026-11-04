import { notFound, redirect } from 'next/navigation'
import { paraPagina } from '@/lib/contexto'
import { Cabecera } from '../../_marca'
import { TablaPresupuesto } from '../../_presupuesto'
import { EnlaceCliente } from './EnlaceCliente'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const datos = await paraPagina('presupuestos', async (tx, c) => {
    const p = await tx.presupuesto.findFirst({ where: { tallerId: c.tallerId, id } })
    if (!p) return null
    const [lineas, veh, cli, ot] = await Promise.all([
      tx.presupuestoLinea.findMany({ where: { tallerId: c.tallerId, presupuestoId: id }, orderBy: { orden: 'asc' } }),
      tx.vehiculo.findFirst({ where: { tallerId: c.tallerId, id: p.vehiculoId } }),
      p.clienteId ? tx.cliente.findFirst({ where: { tallerId: c.tallerId, id: p.clienteId } }) : Promise.resolve(null),
      tx.ordenTrabajo.findFirst({ where: { tallerId: c.tallerId, presupuestoId: id } }),
    ])
    return { p, lineas, veh, cli, ot }
  })
  if (datos === 'sin_sesion') redirect('/login')
  if (datos === 'sin_permiso') return <main className="contenido"><p className="tenue">Tu perfil no incluye los presupuestos.</p></main>
  if (!datos) notFound()
  const { p, lineas, veh, cli, ot } = datos
  const fecha = (d: Date | null) => (d ? d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '—')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Presupuesto · {veh?.matricula ?? '—'}</h1>
        <p><span className="estado">{p.estado}</span> {cli?.nombre ?? ''} {ot ? <a href={`/ordenes/${ot.id}`}>· OT {ot.numero}</a> : null}</p>
        <TablaPresupuesto lineas={lineas} baseCent={p.baseCent} cuotaIvaCent={p.cuotaIvaCent} totalCent={p.totalCent} />
        <p className="tenue">Caduca: {fecha(p.caducaEn)}{p.aceptadoEn ? ` · Aceptado: ${fecha(p.aceptadoEn)}` : ''}</p>
        {p.estado === 'borrador' && ot && <p><a className="btn btn-sec" href={`/presupuestos/nuevo?ot=${ot.id}&reemplaza=${p.id}`}>Rehacer el borrador</a></p>}
        {(p.estado === 'borrador' || p.estado === 'enviado') && <EnlaceCliente presupuestoId={p.id} yaGenerado={p.estado === 'enviado'} />}
        <p><a href="/presupuestos" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

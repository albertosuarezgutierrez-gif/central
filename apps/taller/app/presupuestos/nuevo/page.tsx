import { notFound, redirect } from 'next/navigation'
import { paraPagina, configDe } from '@/lib/contexto'
import { Cabecera } from '../../_marca'
import { NuevoPresupuesto } from './NuevoPresupuesto'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Pagina({ searchParams }: { searchParams: Promise<{ ot?: string }> }) {
  const otId = (await searchParams).ot
  if (!otId || !UUID.test(otId)) notFound()
  const datos = await paraPagina('presupuestos', async (tx, c) => {
    const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: c.tallerId, id: otId } })
    if (!ot) return null
    const [config, veh] = await Promise.all([
      configDe(tx, c.tallerId),
      tx.vehiculo.findFirst({ where: { tallerId: c.tallerId, id: ot.vehiculoId } }),
    ])
    const tipo = veh?.tipoVehiculoId ? await tx.tipoVehiculo.findFirst({ where: { tallerId: c.tallerId, id: veh.tipoVehiculoId } }) : null
    return { ot, config, veh, tipoCodigo: tipo?.codigo ?? null }
  })
  if (datos === 'sin_sesion') redirect('/login')
  if (datos === 'sin_permiso') return <main className="contenido"><p className="tenue">Tu perfil no incluye los presupuestos.</p></main>
  if (!datos) notFound()
  const { ot, config, veh, tipoCodigo } = datos
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Nuevo presupuesto · {veh?.matricula ?? '—'}</h1>
        {!config ? <p className="tenue">Este taller aún no tiene configuración de alta.</p>
          : ot.presupuestoId || ot.estado !== 'recepcion' ? <p className="tenue">Esta orden ya no admite un presupuesto nuevo (estado «{ot.estado}»).</p>
          : (
            <NuevoPresupuesto
              otId={ot.id}
              tipoInicial={tipoCodigo}
              litrosInicialMl={veh?.litrosAceiteMl ?? null}
              tipos={config.tiposVehiculo.filter((t) => t.activo).map((t) => ({ codigo: t.codigo, nombre: t.nombre }))}
              paquetes={config.paquetes.filter((p) => p.activo).map((p) => ({ codigo: p.codigo, nombre: p.nombre, requiereAceite: p.requiereAceite }))}
              aceites={config.aceites.filter((a) => a.activo).map((a) => ({ codigo: a.codigo, nombre: a.nombre }))}
            />
          )}
        <p><a href="/presupuestos" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

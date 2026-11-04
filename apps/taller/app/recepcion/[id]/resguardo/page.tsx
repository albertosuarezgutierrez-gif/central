import { notFound, redirect } from 'next/navigation'
import { paraPagina, configDe } from '@/lib/contexto'
import { Cabecera } from '../../../_marca'
import { ImprimirBoton } from '../../ImprimirBoton'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const f = (d: Date | null | undefined) => (d ? d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '—')

/** Resguardo de depósito (RD 1457/1986), imprimible. Los textos del pie salen de la configuración del taller. */
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const datos = await paraPagina('recepcion', async (tx, c) => {
    const rec = await tx.recepcion.findFirst({ where: { tallerId: c.tallerId, id } })
    if (!rec) return null
    const [taller, veh, cli, fotos, ot, config] = await Promise.all([
      tx.taller.findFirst({ where: { id: c.tallerId } }),
      tx.vehiculo.findFirst({ where: { tallerId: c.tallerId, id: rec.vehiculoId } }),
      tx.cliente.findFirst({ where: { tallerId: c.tallerId, id: rec.clienteId } }),
      tx.recepcionFoto.findMany({ where: { tallerId: c.tallerId, recepcionId: id }, orderBy: { orden: 'asc' } }),
      tx.ordenTrabajo.findFirst({ where: { tallerId: c.tallerId, recepcionId: id } }),
      configDe(tx, c.tallerId),
    ])
    return { rec, taller, veh, cli, fotos, ot, pie: config?.textos.pieResguardo ?? '' }
  })
  if (datos === 'sin_sesion') redirect('/login')
  if (datos === 'sin_permiso') return <main className="contenido"><p className="tenue">Tu perfil no incluye la recepción de vehículos.</p></main>
  if (!datos || !datos.taller || !datos.veh || !datos.cli) notFound()
  const { rec, taller, veh, cli, fotos, ot, pie } = datos
  const danos = (rec.danos as { nota?: string } | null)?.nota
  return (
    <>
      <div className="no-imprimir"><Cabecera conSalir /></div>
      <main className="contenido resguardo">
        <h1>Resguardo de depósito{ot ? ` · OT ${ot.numero}` : ''}</h1>
        <p><strong>{taller.nombreComercial}</strong> · {taller.razonSocial}{taller.nif ? ` · NIF ${taller.nif}` : ''}<br />
          {[taller.via, taller.numero, taller.cp, taller.municipio, taller.provincia].filter(Boolean).join(', ')}</p>
        <dl className="datos">
          <dt>Fecha y hora</dt><dd>{f(rec.recibidoEn)}</dd>
          <dt>Matrícula</dt><dd>{veh.matricula}</dd>
          <dt>Vehículo</dt><dd>{[veh.marca, veh.modelo, veh.version].filter(Boolean).join(' ') || '—'}</dd>
          <dt>Kilómetros</dt><dd>{rec.kmEntrada == null ? '—' : `${new Intl.NumberFormat('es-ES').format(rec.kmEntrada)} km`}</dd>
          <dt>Combustible</dt><dd>{rec.nivelCombustible ?? '—'}</dd>
          <dt>Objetos dejados</dt><dd>{rec.objetos ?? '—'}</dd>
          <dt>Motivo</dt><dd>{rec.motivo ?? '—'}</dd>
          <dt>Daños previos</dt><dd>{danos ?? 'Ninguno anotado'}</dd>
          <dt>Cliente</dt><dd>{cli.nombre}{cli.movil ? ` · ${cli.movil}` : ''}{cli.correo ? ` · ${cli.correo}` : ''}</dd>
          <dt>Fotos</dt><dd>{fotos.length === 0 ? 'Sin fotos' : fotos.map((x) => `${x.orden}. ${x.posicion ?? 'foto'} (huella ${x.huellaSha256.slice(0, 12)})`).join(' · ')}</dd>
          <dt>Firma del cliente</dt>
          <dd>{rec.firmadoEn ? `Firmado el ${f(rec.firmadoEn)} (registro ${rec.firmaRuta?.split('/').pop()?.slice(0, 12) ?? ''})` : 'SIN FIRMAR: el taller no podrá facturar hasta que el cliente firme'}</dd>
        </dl>
        {pie && <p className="pie-resguardo">{pie}</p>}
        <ImprimirBoton />
        <p className="no-imprimir"><a className="btn btn-sec" href="/recepcion">Volver</a></p>
      </main>
    </>
  )
}

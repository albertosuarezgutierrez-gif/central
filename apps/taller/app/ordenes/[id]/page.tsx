import { notFound, redirect } from 'next/navigation'
import { formatearEur, TRANSICIONES_OT, type EstadoOt } from '@central/module-taller'
import { configDe, paraPagina } from '@/lib/contexto'
import { tienePermiso } from '@/lib/permisos'
import { horasYMargen, ESTADOS_TRABAJABLES, type TxOrdenes } from '@/lib/ordenes'
import { Cabecera } from '../../_marca'
import { abrirMiParteAccion, cambiarEstadoAccion, cerrarMiParteAccion } from '../acciones'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hm = (min: number | null) => (min === null ? '—' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`)
const hora = (d: Date) => d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })

export default async function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params
  const { aviso } = await searchParams
  if (!UUID.test(id)) notFound()
  const datos = await paraPagina('ordenes_ver', async (tx, c) => {
    const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: c.tallerId, id } })
    if (!ot) return null
    const soloMecanico = c.rol === 'mecanico'
    // Un mecánico solo entra en las órdenes abiertas («mis OT»).
    if (soloMecanico && !['aceptado', 'en_curso', 'ampliacion_pendiente'].includes(ot.estado)) return null
    const verPrecios = tienePermiso(c.rol, 'precios_ver')
    const [veh, rec, lineas, partes, config] = await Promise.all([
      tx.vehiculo.findFirst({ where: { tallerId: c.tallerId, id: ot.vehiculoId } }),
      tx.recepcion.findFirst({ where: { tallerId: c.tallerId, id: ot.recepcionId } }),
      tx.otLinea.findMany({ where: { tallerId: c.tallerId, otId: id }, orderBy: { creadoEn: 'asc' } }),
      tx.parteHoras.findMany({ where: { tallerId: c.tallerId, otId: id }, orderBy: { inicio: 'desc' } }),
      verPrecios || tienePermiso(c.rol, 'margenes_ver') ? configDe(tx, c.tallerId) : Promise.resolve(null),
    ])
    const cli = rec ? await tx.cliente.findFirst({ where: { tallerId: c.tallerId, id: rec.clienteId } }) : null
    const nombres = new Map((await tx.usuarioTaller.findMany({ where: { tallerId: c.tallerId }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]))
    const margen = tienePermiso(c.rol, 'margenes_ver') && config
      ? await horasYMargen(tx as unknown as TxOrdenes, { tallerId: c.tallerId, otId: id, precioHoraCent: config.precioHoraCent })
      : null
    const miParte = (await tx.parteHoras.findMany({ where: { tallerId: c.tallerId, mecanicoId: c.usuarioId, fin: null } }))[0] ?? null
    const pres = ot.presupuestoId && tienePermiso(c.rol, 'presupuestos') ? ot.presupuestoId : null
    return {
      ot, veh, lineas, margen, miParteOtId: miParte?.otId ?? null, pres, verPrecios, soloMecanico,
      verContacto: tienePermiso(c.rol, 'contacto_cliente_ver'),
      puedeParte: tienePermiso(c.rol, 'partes'),
      puedeGestionar: tienePermiso(c.rol, 'ordenes_gestionar'),
      puedePresupuestar: tienePermiso(c.rol, 'presupuestos'),
      cli, firmada: rec?.firmadoEn != null,
      partes: partes
        .filter((p) => !soloMecanico || p.mecanicoId === c.usuarioId)
        .map((p) => ({ id: p.id, quien: nombres.get(p.mecanicoId) ?? '—', inicio: p.inicio as Date, fin: p.fin as Date | null })),
    }
  })
  if (datos === 'sin_sesion') redirect('/login')
  if (datos === 'sin_permiso') return <main className="contenido"><p className="tenue">Tu perfil no incluye las órdenes de trabajo.</p></main>
  if (!datos) notFound()
  const { ot, veh, lineas, margen, cli } = datos
  const estado = ot.estado as EstadoOt
  const trabajable = ESTADOS_TRABAJABLES.includes(estado)
  const abiertoAqui = datos.miParteOtId === ot.id
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>OT {ot.numero} · {veh?.matricula ?? '—'}</h1>
        {aviso && <p className="aviso-error" role="alert">{aviso}</p>}
        <p><span className="estado">{estado.replace('_', ' ')}</span> {[veh?.marca, veh?.modelo].filter(Boolean).join(' ')}</p>
        <p className="tenue">Cliente: {cli?.nombre ?? '—'}
          {datos.verContacto && cli ? ` · ${cli.movil ?? 'sin teléfono'}${cli.correo ? ` · ${cli.correo}` : ''}` : ''}</p>
        {!datos.firmada && <p className="aviso-error">Recepción sin firmar: no se presupuesta ni se factura hasta que el cliente firme.</p>}

        {datos.puedeParte && trabajable && (
          <div className="fila">
            {abiertoAqui ? (
              <form action={cerrarMiParteAccion}><input type="hidden" name="otId" value={ot.id} /><button className="btn">Cerrar mi parte</button></form>
            ) : (
              <form action={abrirMiParteAccion}><input type="hidden" name="otId" value={ot.id} /><button className="btn">{datos.miParteOtId ? 'Pasar mi parte a este coche' : 'Abrir mi parte'}</button></form>
            )}
          </div>
        )}

        <h2>Trabajos</h2>
        {lineas.length === 0 ? <p className="tenue">Aún no hay líneas (se cargan al aceptar el presupuesto).</p> : (
          <div className="tabla-scroll"><table>
            <thead><tr><th>Descripción</th><th className="num">Cant.</th>{datos.verPrecios && <th className="num">Total</th>}</tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id}>
                  <td>{l.descripcion}</td>
                  <td className="num">{l.unidad === 'ml' ? `${l.cantidad / 1000} l` : l.unidad === 'min' ? `${l.cantidad} min` : l.cantidad}</td>
                  {datos.verPrecios && <td className="num">{formatearEur(Number(l.totalCent))}</td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        <h2>Partes de horas</h2>
        {datos.partes.length === 0 ? <p className="tenue">Nadie ha trabajado todavía en esta orden.</p> : (
          <ul className="lista-simple">
            {datos.partes.map((p) => (
              <li key={p.id}>{p.quien}<span className="tenue">{hora(p.inicio)} → {p.fin ? hora(p.fin) : 'abierto'}</span></li>
            ))}
          </ul>
        )}

        {margen && (
          <>
            <h2>Horas: baremo frente a reales</h2>
            <dl className="datos">
              <dt>Baremo</dt><dd>{hm(margen.baremoMinutos)}</dd>
              <dt>Reales</dt><dd>{hm(margen.realesMinutos)}{margen.partesAbiertos > 0 ? ' (hay partes abiertos: aún no es definitivo)' : ''}</dd>
              <dt>Diferencia</dt><dd>{margen.diferenciaMinutos === null ? '—' : hm(Math.abs(margen.diferenciaMinutos)) + (margen.diferenciaMinutos < 0 ? ' de más' : ' de menos')}</dd>
              <dt>Margen</dt><dd>{margen.margenCent === null ? '—' : formatearEur(margen.margenCent)}</dd>
            </dl>
          </>
        )}

        <div className="fila">
          {datos.puedePresupuestar && !ot.presupuestoId && estado === 'recepcion' && <a className="btn" href={`/presupuestos/nuevo?ot=${ot.id}`}>Crear presupuesto</a>}
          {datos.pres && <a className="btn btn-sec" href={`/presupuestos/${datos.pres}`}>Ver presupuesto</a>}
        </div>

        {datos.puedeGestionar && TRANSICIONES_OT[estado].length > 0 && (
          <>
            <h2>Cambiar estado</h2>
            <div className="fila">
              {TRANSICIONES_OT[estado].map((h) => (
                <form key={h} action={cambiarEstadoAccion}>
                  <input type="hidden" name="otId" value={ot.id} /><input type="hidden" name="hacia" value={h} />
                  <button className="btn btn-sec">{h.replace('_', ' ')}</button>
                </form>
              ))}
            </div>
          </>
        )}
        <p><a href="/ordenes" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

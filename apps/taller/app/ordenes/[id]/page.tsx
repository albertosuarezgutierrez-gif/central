import { notFound, redirect } from 'next/navigation'
import { formatearEur, textoFotoPurgada, TRANSICIONES_OT, type EstadoOt } from '@central/module-taller'
import { configDe, paraPagina } from '@/lib/contexto'
import { firmarVarias } from '@/lib/almacen'
import { capacidadParaTransicion, tienePermiso } from '@/lib/permisos'
import { ESTADOS_ABIERTOS } from '@/lib/trabajo-ot'
import { horasYMargen, ESTADOS_TRABAJABLES, type TxOrdenes } from '@/lib/ordenes'
import { ESTADOS_FACTURABLES, facturaVivaDeOt, previsualizarFactura, type TxFacturas } from '@/lib/facturas'
import { Cabecera } from '../../_marca'
import { claseEstado } from '../../_ui'
import { abrirMiParteAccion, cambiarEstadoAccion, cerrarMiParteAccion } from '../acciones'
import { GestionPropuesta, ProponerAmpliacion } from './Ampliaciones'
import { EntregaCliente } from './EntregaCliente'
import { FotosOt } from './FotosOt'
import { NotaDictado } from './NotaDictado'
import { Facturar, type Previa } from './Facturar'
import { anadirRecambioAccion } from '../../articulos/acciones'

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
      configDe(tx, c.tallerId), // precios/márgenes (según rol) y texto de la entrega
    ])
    const cli = rec ? await tx.cliente.findFirst({ where: { tallerId: c.tallerId, id: rec.clienteId } }) : null
    const nombres = new Map((await tx.usuarioTaller.findMany({ where: { tallerId: c.tallerId }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]))
    const margen = tienePermiso(c.rol, 'margenes_ver') && config
      ? await horasYMargen(tx as unknown as TxOrdenes, { tallerId: c.tallerId, otId: id, precioHoraCent: config.precioHoraCent })
      : null
    const miParte = (await tx.parteHoras.findMany({ where: { tallerId: c.tallerId, mecanicoId: c.usuarioId, fin: null } }))[0] ?? null
    const pres = ot.presupuestoId && tienePermiso(c.rol, 'presupuestos') ? ot.presupuestoId : null
    const [notas, fotosOt, propuestas] = await Promise.all([
      tx.otNota.findMany({ where: { tallerId: c.tallerId, otId: id }, orderBy: { creadoEn: 'desc' }, take: 50 }),
      tx.otFoto.findMany({ where: { tallerId: c.tallerId, otId: id }, orderBy: { creadoEn: 'desc' }, take: 60 }),
      tx.otPropuesta.findMany({ where: { tallerId: c.tallerId, otId: id }, orderBy: { creadoEn: 'desc' }, take: 20 }),
    ])
    const lineasProp = propuestas.length
      ? await tx.otPropuestaLinea.findMany({ where: { tallerId: c.tallerId, propuestaId: { in: propuestas.map((p) => p.id) } }, orderBy: { orden: 'asc' } })
      : []
    // Las fotos purgadas ya no están en Storage: no se firman. La firma de la entrega sí (no se purga).
    const urls = await firmarVarias(c.tallerId, [...fotosOt.filter((f) => !f.purgadaEn).map((f) => f.ruta), ...(ot.entregaFirmaRuta ? [ot.entregaFirmaRuta] : [])])
    const vistaProp = propuestas.map((p) => ({
      id: p.id as string, estado: p.estado as string, explicacion: p.explicacion as string, autor: nombres.get(p.autorId) ?? '—',
      lineas: lineasProp.filter((l) => l.propuestaId === p.id).map((l) => ({ orden: l.orden as number, descripcion: l.descripcion as string, referencia: (l.referencia ?? null) as string | null, cantidad: l.cantidad as number })),
      fotos: fotosOt.filter((f) => f.propuestaId === p.id).map((f) => ({ id: f.id as string, url: urls.get(f.ruta) ?? null, nota: (f.nota ?? null) as string | null, purgadaEn: f.purgadaEn ? (f.purgadaEn as Date).toISOString() : null })),
    }))
    // Facturación: factura viva (si la hay) y, si se puede facturar, qué saldría y con qué medios de cobro.
    const puedeFacturar = tienePermiso(c.rol, 'facturar')
    const fx = tx as unknown as TxFacturas
    const viva = puedeFacturar ? await facturaVivaDeOt(fx, c.tallerId, id) : null
    let previa: Previa | null = null
    let medios: { codigo: string; nombre: string; esEfectivo: boolean }[] = []
    if (puedeFacturar && !viva && ESTADOS_FACTURABLES.includes(ot.estado as EstadoOt) && rec?.firmadoEn != null) {
      const p = await previsualizarFactura(fx, { tallerId: c.tallerId, otId: id })
      previa = p.ok ? { ok: true, tipo: p.tipo, totalCent: p.totales.totalCent, lineas: p.lineas.length, excluidas: p.excluidas.length } : p
      medios = (await tx.medioCobro.findMany({ where: { tallerId: c.tallerId, activo: true }, orderBy: { nombre: 'asc' } }))
        .map((m) => ({ codigo: m.codigo, nombre: m.nombre, esEfectivo: m.esEfectivo }))
    }
    // Catálogo para «añadir recambio» (solo quien puede poner precios; sin costes: solo descripción y unidad).
    const articulos = tienePermiso(c.rol, 'ampliaciones') && ESTADOS_ABIERTOS.includes(ot.estado as EstadoOt)
      ? (await tx.articulo.findMany({ where: { tallerId: c.tallerId, activo: true }, orderBy: { descripcion: 'asc' }, take: 1000 }))
          .map((a) => ({ id: a.id as string, texto: `${a.descripcion}${a.referencia ? ` · ${a.referencia}` : ''} (${a.unidad === 'ml' ? 'litros' : 'ud'})` }))
      : []
    return {
      articulos,
      puedeFacturar, previa, medios,
      facturaViva: viva ? { id: viva.id as string, numSerie: viva.numSerie as string } : null,
      notas: notas.map((n) => ({ id: n.id as string, texto: n.texto as string, quien: nombres.get(n.autorId) ?? '—', cuando: n.creadoEn as Date })),
      fotosSueltas: fotosOt.filter((f) => !f.propuestaId).map((f) => ({ id: f.id as string, url: urls.get(f.ruta) ?? null, nota: (f.nota ?? null) as string | null, purgadaEn: (f.purgadaEn ?? null) as Date | null })),
      retirada: config?.retirada ?? null,
      urlFirmaEntrega: ot.entregaFirmaRuta ? urls.get(ot.entregaFirmaRuta) ?? null : null,
      propuestas: vistaProp,
      puedeTrabajar: tienePermiso(c.rol, 'ot_trabajo') && ESTADOS_ABIERTOS.includes(ot.estado as EstadoOt),
      puedeAmpliar: tienePermiso(c.rol, 'ampliaciones'),
      puedeAvanzar: tienePermiso(c.rol, 'ordenes_avanzar'),
      rol: c.rol,
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
        <p><span className={claseEstado(estado)}>{estado.replace('_', ' ')}</span> {[veh?.marca, veh?.modelo].filter(Boolean).join(' ')}</p>
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
          <div className="tabla-scroll"><table className="tabla-cards">
            <thead><tr><th>Descripción</th><th className="num">Cant.</th>{datos.verPrecios && <th className="num">Total</th>}</tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id}>
                  <td>{l.descripcion}</td>
                  <td className="num" data-label="Cant.">{l.unidad === 'ml' ? `${l.cantidad / 1000} l` : l.unidad === 'min' ? `${l.cantidad} min` : l.cantidad}</td>
                  {datos.verPrecios && <td className="num" data-label="Total">{formatearEur(Number(l.totalCent))}</td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        {datos.articulos.length > 0 && (
          <details>
            <summary className="btn btn-sec">Añadir recambio del catálogo</summary>
            <form action={anadirRecambioAccion} className="formulario">
              <input type="hidden" name="otId" value={ot.id} />
              <div className="dos-col">
                <label className="campo">Artículo<select name="articuloId" required defaultValue=""><option value="" disabled>Elige…</option>{datos.articulos.map((a) => <option key={a.id} value={a.id}>{a.texto}</option>)}</select></label>
                <label className="campo">Cantidad (ud o litros)<input name="cantidad" inputMode="decimal" required /></label>
              </div>
              <label className="check"><input type="checkbox" name="aceptado" /> El cliente ya lo ha aceptado (entra en la factura)</label>
              <button className="btn">Añadir a la orden</button>
              <p className="tenue">El precio sale del artículo y el coste medio de hoy queda guardado para el margen. El stock se descuenta al cerrar la orden.</p>
            </form>
          </details>
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

        {datos.puedeFacturar && (datos.facturaViva || datos.previa) && (
          <>
            <h2>Factura</h2>
            {datos.facturaViva
              ? <p><a className="btn btn-sec" href={`/facturas/${datos.facturaViva.id}`}>Ver factura {datos.facturaViva.numSerie}</a></p>
              : datos.previa && <Facturar otId={ot.id} previa={datos.previa} medios={datos.medios} />}
          </>
        )}

        <div className="fila">
          {datos.puedePresupuestar && !ot.presupuestoId && estado === 'recepcion' && <a className="btn" href={`/presupuestos/nuevo?ot=${ot.id}`}>Crear presupuesto</a>}
          {datos.pres && <a className="btn btn-sec" href={`/presupuestos/${datos.pres}`}>Ver presupuesto</a>}
        </div>

        <h2>Notas</h2>
        {datos.puedeTrabajar && <NotaDictado otId={ot.id} />}
        {datos.notas.length === 0 ? <p className="tenue">Sin notas.</p> : (
          <ul className="lista-simple">
            {datos.notas.map((n) => <li key={n.id}><span>{n.texto}</span><span className="tenue">{n.quien} · {hora(n.cuando)}</span></li>)}
          </ul>
        )}

        {estado === 'entregado' && (
          <>
            <h2>Entrega</h2>
            <p className="tenue">Entregado el {ot.entregadoEn ? hora(ot.entregadoEn) : '—'}
              {ot.entregaRetiraNombre ? ` · retira ${ot.entregaRetiraNombre}` : ''}
              {ot.entregaFirmaRuta ? ` · conformidad firmada (texto ${ot.entregaConformidadVersion})` : ' · sin firma de retirada'}</p>
            {datos.urlFirmaEntrega && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={datos.urlFirmaEntrega} alt="Firma de retirada" className="firma-img" /></>}
          </>
        )}

        <h2>Fotos</h2>
        {datos.puedeTrabajar && <FotosOt otId={ot.id} />}
        {datos.fotosSueltas.length === 0 ? <p className="tenue">Sin fotos.</p> : (
          <div className="fotos-mini">
            {datos.fotosSueltas.map((f) => (
              <figure key={f.id}>{/* eslint-disable-next-line @next/next/no-img-element */}
                {f.purgadaEn ? <span className="tenue">{textoFotoPurgada(f.purgadaEn)}</span>
                  : f.url ? <img src={f.url} alt={f.nota ?? 'Foto de la orden'} /> : <span className="tenue">sin imagen</span>}</figure>
            ))}
          </div>
        )}

        <h2>Ampliaciones</h2>
        {datos.puedeTrabajar && <ProponerAmpliacion otId={ot.id} />}
        {datos.propuestas.length === 0 ? <p className="tenue">Sin propuestas.</p> : datos.propuestas.map((p) => <GestionPropuesta key={p.id} p={p} puedeGestionar={datos.puedeAmpliar} />)}

        {(datos.puedeGestionar || datos.puedeAvanzar) && TRANSICIONES_OT[estado].filter((h) => h !== 'facturado' && (datos.puedeGestionar || capacidadParaTransicion(estado, h) === 'ordenes_avanzar')).length > 0 && (
          <>
            <h2>Cambiar estado</h2>
            <div className="fila">
              {TRANSICIONES_OT[estado].filter((h) => h !== 'facturado' && (datos.puedeGestionar || capacidadParaTransicion(estado, h) === 'ordenes_avanzar')).map((h) => h === 'entregado' && datos.retirada ? (
                <EntregaCliente key={h} otId={ot.id} texto={datos.retirada.textoConformidad} version={datos.retirada.versionTextoConformidad} obligatoria={datos.retirada.firmaObligatoria} />
              ) : (
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

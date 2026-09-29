import Link from 'next/link'
import { Bike } from 'lucide-react'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { precalificarMotoNuevaAsegura, catalogoAsegura } from '@/lib/moto-nuevo-asegura'
import { companiasAsegura, interpretarCompanias } from '@/lib/companias-asegura'
import { interpretarOportunidadesCliente, oportunidadesClienteAsegura } from '@/lib/seguimiento-asegura'
import { anteriorParaTarificar } from '@/lib/seguro-anterior'
import { Pagina, PageHeader, cardStyle } from '@/components/ui'
import MotoNuevo from './MotoNuevo'
import { cargarVariante, FranjaVariante, ErrorVariante } from '../../../oportunidad/[id]/cargar-variante'
import { paramTexto } from '../../../oportunidad/[id]/variante'

export const dynamic = 'force-dynamic'

/**
 * ⏱️ La cotización del vendor puede tardar hasta 150 s; mismo margen que el
 * resto de pantallas de pago de la correduría (retarificar, hogar-nuevo, auto-nuevo).
 */
export const maxDuration = 180

/**
 * **Presupuesto de moto SIN póliza, DENTRO de `/correduria`.**
 *
 * Hermana de `.../auto-nuevo`, construida el mismo día por el mismo motivo:
 * Alberto no quiere saltar de pantalla para presupuestar una oportunidad
 * nueva. La cartera viva tiene 1 sola póliza de moto (03/09/2026), así que
 * «nueva» es prácticamente el único caso real de este ramo — igual que auto,
 * el vehículo se identifica con el catálogo de Codeoscopic
 * (marca→modelo→motor→versión, gratis, bajo `/motorcycle/*`) y la matrícula
 * la teclea el corredor.
 *
 * Se cotiza DE CALLE (`aseguradoAntes: false`, ver `precalificarMotoNueva()`
 * en asegura): sin póliza que retarificar no hay compañía anterior que
 * declarar. A diferencia de auto, el vendor exige además la EXPERIENCIA de
 * conducción (`drivingExperience`); se supone «ya ha llevado esta moto» y se
 * enseña como supuesto corregible.
 *
 * A diferencia de auto (`insuranceLine: 'Car'`, ya confirmado), el id del
 * ramo de moto se resuelve SIEMPRE contra `GET /insurance-lines`: por eso
 * esta ficha trae también `pre.moto` y la pantalla avisa si no está disponible.
 */
export default async function MotoNuevoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id: clienteId } = await params
  // Variante de un riesgo (29/09/2026): `?oportunidad=` cuelga la tarificación de esa oportunidad.
  const sp = await searchParams
  const carga = await cargarVariante(paramTexto(sp.oportunidad), paramTexto(sp.tarificacion), clienteId, 'moto')

  const ficha = await fichaAsegura(clienteId)
  const nombreCliente = ficha.estado === 'ok' ? ficha.ficha.nombre : null
  const sub = nombreCliente
    ? <><Link href={`/correduria/cliente/${clienteId}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{nombreCliente}</Link> · presupuesto de moto (oportunidad nueva)</>
    : 'Presupuesto de moto (oportunidad nueva) · sin ninguna póliza en la cartera'

  const cabecera = (
    <div style={{ marginBottom: 14 }}>
      <Link href={`/correduria/cliente/${clienteId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
        ← Ficha del cliente
      </Link>
      <PageHeader titulo="Presupuesto de moto" icono={<Bike size={20} strokeWidth={1.75} />} sub={sub} />
      {carga.estado === 'ok' && <FranjaVariante variante={carga.variante} />}
    </div>
  )

  if (carga.estado === 'error') {
    return (
      <Pagina>
        {cabecera}
        <ErrorVariante oportunidadId={carga.oportunidadId} mensaje={carga.mensaje} />
      </Pagina>
    )
  }
  const variante = carga.estado === 'ok' ? carga.variante : null

  const [garajes, civiles, pre, companiasResp, ops] = await Promise.all([
    catalogoAsegura({ tipo: 'garajes-moto' }),
    catalogoAsegura({ tipo: 'estados-civiles' }),
    precalificarMotoNuevaAsegura({ clienteId }),
    companiasAsegura().then((r) => interpretarCompanias(r.status, r.json)),
    // El seguro que tiene hoy, leído de su póliza (29/09/2026). Si no se puede leer, no se precarga: se teclea.
    oportunidadesClienteAsegura(clienteId).then((r) => interpretarOportunidadesCliente(r.status, r.json)).catch(() => null),
  ])
  const companias = companiasResp.estado === 'ok' ? companiasResp.companias : null
  const anterior = ops?.estado === 'ok'
    ? anteriorParaTarificar(ops.oportunidades, { ramo: 'moto', oportunidadId: variante?.oportunidadId ?? null })
    : null

  if (pre.estado !== 'ok') {
    const tono = pre.estado === 'sin_configurar' ? 'var(--muted)' : 'var(--negative)'
    return (
      <Pagina>
        {cabecera}
        <div style={{ ...cardStyle, borderColor: tono, color: tono, fontSize: 13 }}>
          No se ha podido precalificar: {pre.mensaje}
        </div>
      </Pagina>
    )
  }

  if (pre.pre.moto.estado === 'ausente') {
    return (
      <Pagina>
        {cabecera}
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
          Moto no está entre los ramos que Codeoscopic tiene habilitados para Grupo ASegura hoy
          {pre.pre.moto.ramos.length > 0 ? ` (los disponibles son: ${pre.pre.moto.ramos.join(', ')})` : ''}.
          Hay que pedírselo a Codeoscopic antes de poder cotizar moto por aquí.
        </div>
      </Pagina>
    )
  }

  // 🚨 Sin estos dos catálogos NO hay ids válidos que mandar, así que no se
  // puede cotizar: se dice, en vez de dejar los desplegables vacíos y sin
  // explicación (no es un problema de la ficha del cliente).
  const fallosCatalogo = [garajes, civiles].filter((c) => c.estado !== 'ok')

  return (
    <Pagina>
      {cabecera}
      {pre.pre.moto.estado === 'desconocido' && (
        <div style={{ ...cardStyle, borderColor: 'var(--muted)', color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
          No se ha podido comprobar si moto tarifica para Grupo ASegura (fallo al leer los ramos de Codeoscopic).
          Puedes seguir rellenando el vehículo abajo; el servidor cortará antes de gastar si al final no se puede.
        </div>
      )}
      {fallosCatalogo.length > 0 && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13, marginBottom: 14 }}>
          No se han podido leer los catálogos de garajes o estados civiles de Codeoscopic. Sin ellos no hay ids
          válidos que mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.
        </div>
      )}
      <MotoNuevo
        clienteId={clienteId}
        etiquetaCliente={pre.pre.etiquetaCliente}
        faltanInicial={pre.pre.faltan}
        garajes={garajes.estado === 'ok' ? garajes.opciones : []}
        civiles={civiles.estado === 'ok' ? civiles.opciones : []}
        municipios={pre.pre.municipios}
        municipiosMotivo={pre.pre.municipiosMotivo}
        estadoCivilMoto={pre.pre.estadoCivil}
        consumo={pre.pre.consumo}
        simulacion={pre.pre.simulacion}
        companias={companias}
        variante={variante}
        anterior={anterior?.estado === 'ok' ? anterior.anterior : null}
        anteriorAmbiguo={anterior?.estado === 'ambiguo' ? anterior.n : null}
      />
    </Pagina>
  )
}

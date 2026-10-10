// Servidor: lo que el cotizador de moto necesita leer antes de pintarse (catálogos de garaje y estado civil,
// precalificación de la persona, compañías, seguro que tiene hoy, pack). Lo comparten la página completa
// `moto-nuevo/page.tsx` y el bloque «Pedir precio» de la oportunidad (acción `abrirCotizadorMotoDeOportunidad`),
// para que las dos lean lo MISMO. Todo GRATIS: ninguna llamada aquí cotiza.

import { precalificarMotoNuevaAsegura, catalogoAsegura, type Opcion, type RespuestaPrecalificacionMotoNueva } from '@/lib/moto-nuevo-asegura'
import { companiasAsegura, interpretarCompanias, type Compania } from '@/lib/companias-asegura'
import { interpretarOportunidadesCliente, oportunidadesClienteAsegura } from '@/lib/seguimiento-asegura'
import { anteriorParaTarificar, type AnteriorParaTarificar } from '@/lib/seguro-anterior'
import { otroVehiculoDelCliente, type OtroVehiculo } from '@/lib/correduria/pack-otro-vehiculo'

export type DatosCotizadorMoto = {
  garajes: Opcion[]
  civiles: Opcion[]
  /** Algún catálogo imprescindible (garajes, estados civiles) no se ha podido leer: no hay ids válidos que mandar. */
  falloCatalogo: boolean
  pre: RespuestaPrecalificacionMotoNueva
  companias: Pick<Compania, 'codigoDgs' | 'nombreComun' | 'nombreCima'>[] | null
  anterior: AnteriorParaTarificar | null
  anteriorAmbiguo: number | null
  /** `null` = no se han podido leer sus oportunidades (no «no tiene otro vehículo»). */
  otroVehiculo: OtroVehiculo | null
}

export async function datosCotizadorMoto(clienteId: string, oportunidadId: string | null): Promise<DatosCotizadorMoto> {
  const [garajes, civiles, pre, companiasResp, ops, anteriores] = await Promise.all([
    catalogoAsegura({ tipo: 'garajes-moto' }),
    catalogoAsegura({ tipo: 'estados-civiles' }),
    precalificarMotoNuevaAsegura({ clienteId }),
    companiasAsegura().then((r) => interpretarCompanias(r.status, r.json)),
    // El seguro que tiene hoy, leído de su póliza (29/09/2026). Si no se puede leer, no se precarga: se teclea.
    oportunidadesClienteAsegura(clienteId).then((r) => interpretarOportunidadesCliente(r.status, r.json)).catch(() => null),
    catalogoAsegura({ tipo: 'companias-anteriores-moto' }),
  ])
  // Compañía anterior: catálogo de MERCADO de Avant2 (`/motorcycle/insurance-companies`), como en auto
  // — el directorio de la correduría solo trae las 14 con las que trabaja Alberto, y el cliente puede venir
  // de cualquiera. Su nombre del directorio va de alias para que «Mapfre» leído de una póliza case con el
  // nombre largo del vendor. Si el catálogo falla, se cae al directorio; si falla también, código a mano.
  const directorio = companiasResp.estado === 'ok' ? companiasResp.companias : null
  const companias =
    anteriores.estado === 'ok' && anteriores.opciones.length > 0
      ? anteriores.opciones.map((o) => ({
          codigoDgs: o.id,
          nombreComun: o.nombre,
          nombreCima: directorio?.find((c) => c.codigoDgs.toUpperCase() === o.id.toUpperCase())?.nombreComun ?? null,
        }))
      : directorio
  const anterior = ops?.estado === 'ok' ? anteriorParaTarificar(ops.oportunidades, { ramo: 'moto', oportunidadId }) : null
  return {
    garajes: garajes.estado === 'ok' ? garajes.opciones : [],
    civiles: civiles.estado === 'ok' ? civiles.opciones : [],
    falloCatalogo: garajes.estado !== 'ok' || civiles.estado !== 'ok',
    pre,
    companias,
    anterior: anterior?.estado === 'ok' ? anterior.anterior : null,
    anteriorAmbiguo: anterior?.estado === 'ambiguo' ? anterior.n : null,
    // Pack coche + moto (03/10/2026): el coche del cliente. `null` = no se han podido leer sus oportunidades.
    otroVehiculo: ops?.estado === 'ok' ? otroVehiculoDelCliente(ops.oportunidades, 'moto') : null,
  }
}

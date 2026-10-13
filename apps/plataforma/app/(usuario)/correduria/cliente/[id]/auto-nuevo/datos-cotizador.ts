// Servidor: lo que el cotizador de AUTO necesita leer antes de pintarse (catálogos de garaje, estado civil y carné,
// precalificación de la persona, compañías, seguro que tiene hoy, pack, ficha del tomador). Lo comparten la página
// completa `auto-nuevo/page.tsx` y el bloque «Pedir precio» de la oportunidad (acción
// `abrirCotizadorAutoDeOportunidad`), para que las dos lean lo MISMO (10/10/2026, hermano de
// `moto-nuevo/datos-cotizador.ts`). Todo GRATIS: ninguna llamada aquí cotiza.

import { precalificarAutoNuevaAsegura, catalogoAsegura, type Opcion, type RespuestaPrecalificacionAutoNueva } from '@/lib/auto-nuevo-asegura'
import { companiasAsegura, interpretarCompanias } from '@/lib/companias-asegura'
import { interpretarOportunidadesCliente, oportunidadesClienteAsegura } from '@/lib/seguimiento-asegura'
import { anteriorParaTarificar, type AnteriorParaTarificar } from '@/lib/seguro-anterior'
import { otroVehiculoDelCliente, type OtroVehiculo } from '@/lib/correduria/pack-otro-vehiculo'
import { fichaAsegura, type ContactoFicha } from '@/lib/ficha-asegura'
import type { IdentidadFicha } from '@/lib/cliente-edicion-asegura'
import { personaDeFicha, tienePolizaAllianzEnVigor, type DocumentoResumen } from '@central/module-seguros'

export type DatosCotizadorAuto = {
  /** `null` = no se ha podido leer la ficha (puerto caído): la cabecera no la nombra. */
  nombreCliente: string | null
  garajes: Opcion[]
  civiles: Opcion[]
  /** Catálogos del carnet. `[]` = no se han podido leer: viaja el supuesto B/España (no bloquea). */
  zonasCarnet: Opcion[]
  tiposCarnet: Opcion[]
  /** Algún catálogo imprescindible (garajes, estados civiles) no se ha podido leer: no hay ids válidos que mandar. */
  falloCatalogo: boolean
  pre: RespuestaPrecalificacionAutoNueva
  /** `null` = ni el catálogo de mercado ni el directorio: el código de compañía se teclea a mano. */
  companias: { codigoDgs: string; nombreComun: string }[] | null
  anterior: AnteriorParaTarificar | null
  anteriorAmbiguo: number | null
  /** `null` = no se han podido leer sus oportunidades (no «no tiene otro vehículo»). */
  otroVehiculo: OtroVehiculo | null
  /** `true` = póliza EN VIGOR en Allianz; `null` = no se pudo mirar (nunca «no tiene»). */
  carteraAllianz: boolean | null
  /** Lo que hace falta para corregir la ficha del tomador sin salir. `null` = no se ha podido leer la ficha. */
  fichaTomador: { identidad: IdentidadFicha | null; documentos: DocumentoResumen[] | null; contacto: ContactoFicha; juridica: boolean } | null
}

export async function datosCotizadorAuto(clienteId: string, oportunidadId: string | null): Promise<DatosCotizadorAuto> {
  // Los dos del carnet NO son bloqueantes a propósito: si no se pueden leer, viaja el supuesto de siempre (B, España)
  // y la pantalla lo dice en el hueco del campo. Bloquear la cotización por ellos sería peor que el problema.
  const [ficha, garajes, civiles, zonasCarnet, tiposCarnet, pre, companiasResp, anteriores, ops] = await Promise.all([
    fichaAsegura(clienteId),
    catalogoAsegura({ tipo: 'garajes' }),
    catalogoAsegura({ tipo: 'estados-civiles' }),
    catalogoAsegura({ tipo: 'zonas-carnet' }),
    catalogoAsegura({ tipo: 'tipos-carnet' }),
    precalificarAutoNuevaAsegura({ clienteId }),
    companiasAsegura().then((r) => interpretarCompanias(r.status, r.json)),
    catalogoAsegura({ tipo: 'companias-anteriores' }),
    // El seguro que tiene hoy, leído de su póliza (29/09/2026). Si no se puede leer, no se precarga.
    oportunidadesClienteAsegura(clienteId).then((r) => interpretarOportunidadesCliente(r.status, r.json)).catch(() => null),
  ])
  const anterior = ops?.estado === 'ok' ? anteriorParaTarificar(ops.oportunidades, { ramo: 'auto', oportunidadId }) : null
  // La compañía de la que viene el cliente sale del catálogo de MERCADO de Avant2 (`/car/insurance-companies`,
  // gratis), no del directorio de la correduría, que solo trae las compañías con las que trabaja Alberto. Si el
  // catálogo falla, se cae al directorio; si falla también, código a mano.
  const companias =
    anteriores.estado === 'ok' && anteriores.opciones.length > 0
      ? anteriores.opciones.map((o) => ({ codigoDgs: o.id, nombreComun: o.nombre }))
      : companiasResp.estado === 'ok'
        ? companiasResp.companias.map((c) => ({ codigoDgs: c.codigoDgs, nombreComun: c.nombreComun }))
        : null
  return {
    nombreCliente: ficha.estado === 'ok' ? ficha.ficha.nombre : null,
    garajes: garajes.estado === 'ok' ? garajes.opciones : [],
    civiles: civiles.estado === 'ok' ? civiles.opciones : [],
    zonasCarnet: zonasCarnet.estado === 'ok' ? zonasCarnet.opciones : [],
    tiposCarnet: tiposCarnet.estado === 'ok' ? tiposCarnet.opciones : [],
    falloCatalogo: garajes.estado !== 'ok' || civiles.estado !== 'ok',
    pre,
    companias,
    anterior: anterior?.estado === 'ok' ? anterior.anterior : null,
    anteriorAmbiguo: anterior?.estado === 'ambiguo' ? anterior.n : null,
    // Pack coche + moto (03/10/2026): la otra oportunidad del cliente y, para `insuredFamilyInAllianz`, si tiene
    // póliza EN VIGOR en Allianz. `null` = no se ha podido leer (nunca «no tiene»).
    otroVehiculo: ops?.estado === 'ok' ? otroVehiculoDelCliente(ops.oportunidades, 'auto') : null,
    carteraAllianz: ficha.estado === 'ok' ? tienePolizaAllianzEnVigor(ficha.ficha.polizas) : null,
    fichaTomador: ficha.estado === 'ok'
      ? {
          identidad: ficha.ficha.identidad,
          documentos: ficha.ficha.documentos,
          contacto: ficha.ficha.contacto,
          juridica: personaDeFicha({ tipoPersona: ficha.ficha.identidad?.tipoPersona, dniEnmascarado: ficha.ficha.identidad?.dniEnmascarado, segmento: ficha.ficha.segmento }) === 'juridica',
        }
      : null,
  }
}

// En qué punto está el siniestro de cada PARTE del cliente (03/10/2026, idea 4).
//
// 🔒 Aquí NO hay consulta a la BD, y es a propósito: el siniestro se busca DENTRO de
// la cartera que `carteraDeIdentidad` ya autorizó para esta sesión (misma frontera
// que `/boveda/poliza/[id]`: el id no consulta, filtra un conjunto ya leído). Así el
// estado hereda el filtro de identidad, los fusionados ya filtrados y el nivel: una
// póliza cuyo `siniestros` es `null` (el autorizado no tiene alcance de verlos) NO
// produce estado. Nadie importa `prisma` en este fichero (lo vigila el test).
//
// Traducción y reglas de qué se dice: `seguimientoDeParte` de `@central/module-seguros-portal`.
// A ese helper solo bajan estado, nº de la compañía y dos booleanos: ni reserva, ni
// perito/tramitador, ni notas.
import {
  indemnizadoDe,
  peritoAsignadoDe,
  seguimientoDeParte,
  type SeguimientoParte,
} from '@central/module-seguros-portal'

import type { CarteraPortal, PolizaPortal } from './cartera-lectura'

/** Lo mínimo de un parte que hace falta para cruzarlo. */
export type ParteParaSeguimiento = {
  id: string
  estado: string
  polizaId: string | null
  siniestroId: string | null
}

function polizasAutorizadas(cartera: CarteraPortal): Map<string, PolizaPortal> {
  const m = new Map<string, PolizaPortal>()
  for (const lista of [cartera.propias, cartera.autorizadas, cartera.intervinientes]) {
    for (const t of lista) for (const p of t.polizas) if (!m.has(p.id)) m.set(p.id, p)
  }
  return m
}

/**
 * Parte → seguimiento. `null` = NO se enseña estado (póliza no visible, sin alcance de
 * siniestros o parte sobre póliza aportada): la pantalla cae a su texto de siempre.
 */
export function seguimientosDePartes(
  partes: readonly ParteParaSeguimiento[],
  cartera: CarteraPortal,
): Map<string, SeguimientoParte | null> {
  const polizas = polizasAutorizadas(cartera)
  const out = new Map<string, SeguimientoParte | null>()
  for (const parte of partes) {
    const poliza = parte.polizaId ? polizas.get(parte.polizaId) : undefined
    if (!poliza || poliza.siniestros === null) {
      out.set(parte.id, null)
      continue
    }
    const s = parte.siniestroId ? poliza.siniestros.find((x) => x.id === parte.siniestroId) : undefined
    out.set(
      parte.id,
      seguimientoDeParte({
        estadoParte: parte.estado,
        siniestro: s
          ? {
              estado: s.estado,
              referencia: s.referencia,
              peritoAsignado: peritoAsignadoDe(s.detalle?.perito),
              indemnizado: indemnizadoDe(s.tramitacion?.indemnizacion ?? null, s.tramitacion?.totalPagado ?? null),
            }
          : null,
      }),
    )
  }
  return out
}

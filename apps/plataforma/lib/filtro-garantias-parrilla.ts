// La parrilla de precios del corredor, filtrable por garantías y con «ocultar al cliente» (28/09/2026).
// PURO: lo importa el client component `FiltroGarantias.tsx` y lo vigila su `.test.ts`.
//
// Sale de la tarificación GUARDADA (`GET /api/operador/codeoscopic/tarificacion`, gratis), no de la
// respuesta del POST de tarificar: solo la guardada trae el uuid de cada precio (`precioId`, la clave
// para ocultarlo) y sus garantías, que asegura lee EN SEGUNDO PLANO justo después de tarificar.
//
// 🚨 Tres estados de las garantías que no se colapsan:
//   `undefined` → asegura no manda el campo (versión anterior): no hay filtro, y se dice.
//   `null`      → aún no se han leído sus coberturas: «Leyendo coberturas…», nunca «no incluye».
//   objeto      → el dato.

import { bloqueoCompania, capitalServicio, reparosPorFila, type DescuentoComercial, type GarantiasClasificadas, type OpcionFiltrable } from '@central/module-seguros'
import type { Precio } from './retarificar-asegura.ts'
import type { OcultarPresupuesto } from './presupuesto-asegura.ts'

export type OpcionParrilla = OpcionFiltrable & {
  producto: string | null
  categoria: string | null
  franquiciaEur: number | null
  firmeza: string
  /** Decesos: el capital del servicio leído de los avisos. `null` = no viene o no se entiende (nunca 0). */
  capitalServicioEur: number | null
  /** Motivo con el que la compañía dejará la póliza BLOQUEADA al emitir (`''` sin motivo); `null` = no avisa. */
  bloqueo?: string | null
  /** Descuentos comerciales con los que se tarificó. `null` = no se sabe (no «sin descuento»). */
  descuentos: DescuentoComercial[] | null
  /** Lo que la compañía dice que lleva ESTA opción («TERCEROS AMPLIADO + Robo + …»). `null` = no lo dice. */
  modalidad: string | null
  /** Avisos de la compañía tal cual (aceptación del riesgo, consulta Sinco…). `[]` = ninguno. */
  avisos: string[]
  /** 🔑 `mainQuote.id` del vendor: con él se emite exactamente ESTA opción. `null` = no consta. */
  idVendor: string | null
  /** Lo que no cuadra de esta opción (`revisarCoherenciaCotizacion`). `[]` = revisada y sin reparos. */
  reparos: string[]
}

export type EstadoCoberturas =
  /** Ningún precio trae el campo: asegura no lo manda. */
  | 'no_manda'
  /** Todos con `garantias: null`: se están leyendo. */
  | 'leyendo'
  /** Unos sí y otros todavía no. */
  | 'parcial'
  | 'listas'

/**
 * Los precios guardados → opciones filtrables. Un precio SIN `precioId` no se puede ocultar ni
 * señalar sin inventarse una clave, así que no entra: se cuenta en `sinId` y la pantalla lo dice.
 */
export function opcionesDeParrilla(precios: readonly Precio[]): { opciones: OpcionParrilla[]; sinId: number; estado: EstadoCoberturas } {
  const opciones: OpcionParrilla[] = []
  let sinId = 0
  let conCampo = 0
  let leidas = 0
  // Sobre la lista ENTERA (también las que no entran por no tener `precioId`): la llave repetida
  // y el id repetido se juzgan entre todas.
  const reparos = reparosPorFila(precios)
  for (const [i, p] of precios.entries()) {
    if (!p.precioId) {
      sinId++
      continue
    }
    const garantias: GarantiasClasificadas | null = p.garantias ?? null
    if (p.garantias !== undefined) conCampo++
    if (garantias) leidas++
    opciones.push({
      id: p.precioId,
      compania: p.compania ?? 'Sin compañía',
      primaEur: typeof p.primaEur === 'number' && Number.isFinite(p.primaEur) ? p.primaEur : null,
      garantias,
      producto: p.producto ?? null,
      categoria: p.categoria ?? null,
      franquiciaEur: typeof p.franquiciaEur === 'number' ? p.franquiciaEur : null,
      firmeza: p.firmeza ?? 'estimado',
      capitalServicioEur: capitalServicio(p.avisos ?? null),
      bloqueo: bloqueoCompania(p.avisos ?? null),
      descuentos: p.descuentos ?? null,
      modalidad: typeof p.modalidad === 'string' && p.modalidad.trim() !== '' ? p.modalidad.trim() : null,
      avisos: Array.isArray(p.avisos) ? p.avisos.filter((a): a is string => typeof a === 'string') : [],
      idVendor: typeof p.id === 'string' && p.id.trim() !== '' ? p.id.trim() : null,
      reparos: reparos[i] ?? [],
    })
  }
  const estado: EstadoCoberturas =
    opciones.length === 0 || conCampo === 0 ? 'no_manda' : leidas === 0 ? 'leyendo' : leidas < opciones.length ? 'parcial' : 'listas'
  return { opciones, sinId, estado }
}

/** La compañía sin mayúsculas ni espacios de más (misma regla que `claveCompania` de asegura). */
export function claveCompania(c: string): string {
  return c.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

export function estaOculta(o: { id: string; compania: string }, ocultas: { companias: ReadonlySet<string>; precios: ReadonlySet<string> }): boolean {
  return ocultas.precios.has(o.id) || ocultas.companias.has(claveCompania(o.compania))
}

/**
 * Lo que se manda a preparar. `undefined` = no se oculta nada. Las compañías viajan con el nombre
 * tal cual lo trae la tarificación (asegura las compara sin mayúsculas).
 */
export function ocultarParaPreparar(
  opciones: readonly { id: string; compania: string }[],
  ocultas: { companias: ReadonlySet<string>; precios: ReadonlySet<string> },
): OcultarPresupuesto | undefined {
  const companias = [...new Set(opciones.filter((o) => ocultas.companias.has(claveCompania(o.compania))).map((o) => o.compania))]
  const precios = opciones.filter((o) => ocultas.precios.has(o.id) && !ocultas.companias.has(claveCompania(o.compania))).map((o) => o.id)
  return companias.length === 0 && precios.length === 0 ? undefined : { companias, precios }
}

/** ¿Queda alguna opción CON PRIMA a la vista del cliente? (asegura contestaría 422 `todas_ocultas`). */
export function quedaAlgunaVisible(
  opciones: readonly { id: string; compania: string; primaEur: number | null }[],
  ocultas: { companias: ReadonlySet<string>; precios: ReadonlySet<string> },
): boolean {
  return opciones.some((o) => o.primaEur !== null && !estaOculta(o, ocultas))
}

/**
 * PURO. «Dto. comercial 25 % (CAP) · 25 % (venta cruzada)» para la fila del corredor. `null` si no se
 * sabe o la compañía no manda descuentos (no se pinta nada: no es «sin descuento»). Todos a 0 → lo dice.
 */
export function textoDescuentos(d: readonly DescuentoComercial[] | null): string | null {
  if (!d || d.length === 0) return null
  if (d.every((x) => x.pct === 0)) return 'sin descuento comercial'
  const partes = d.filter((x) => x.pct !== 0).map((x) => `${x.pct.toLocaleString('es-ES')} %${x.etiqueta === 'comercial' ? '' : ` (${x.etiqueta})`}`)
  return `Dto. comercial ${partes.join(' · ')}`
}

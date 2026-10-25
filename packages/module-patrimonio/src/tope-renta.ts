// TOPE a la actualización anual de la renta: catálogo por año + elección del cliente.
//
// Decisión de Alberto (24/10/2026): el CLIENTE puede editar el tope legal de actualización de renta de SU contrato.
// El valor por defecto sale de este catálogo (código, por año del aniversario). Si el cliente fija el suyo, manda el
// suyo; si dice «sin tope», no hay tope; si no toca nada, el catálogo. La pantalla enseña de dónde sale el número.
//
// 🚨 EL CATÁLOGO LO REVISA UN AGENTE FISCAL CADA AÑO (`REVISION_TOPE_RENTA`). Los límites cambian por ley (decretos
// anti-crisis 2022-2024, IRAV desde 2025, zonas tensionadas de la Ley 12/2023) y NO se adivinan: un año sin entrada o
// con `pct: null` significa «sin tope codificado», que es DISTINTO de «sin tope legal». `estado: 'por_verificar'` =
// escrito sin revisión fiscal; el agente lo pasa a `verificado` con fuente y fecha. Cómo se revisa:
//   1. Añadir (o corregir) la entrada del año que viene ANTES de enero: `{ anio, pct, norma, fuente, revisadoEn }`.
//   2. `revisadoEn` = el día que se comprobó contra el BOE; `fuente` = la URL/identificador de la norma.
//   3. Subir `REVISION_TOPE_RENTA.ultimaRevision` y `siguienteRevision`.
// Un test avisa (con `hoy` inyectado, nunca con reloj real) si el año de «hoy» no tiene entrada.
//
// ⚠️ INTENTO DE VERIFICACIÓN 25/10/2026: el sandbox NO alcanza boe.es ni ine.es (DNS/proxy 403), así que NINGUNA entrada
// se ha leído en la fuente primaria y todas siguen `por_verificar`. Lo que sí se vio (WebSearch, secundario): el art. 46 RDL 6/2022
// es la norma base (2 %), con prórrogas por RDL 11/2022 (hasta 31/12/2022) y RDL 20/2022 (hasta 31/12/2023), y la Ley 12/2023
// retoca el art. 46 para 2024 (3 %). Discrepancias a cerrar con el BOE: (a) la entrada 2024 cita RDL 8/2023 y no la Ley 12/2023;
// (b) el matiz gran tenedor/pequeño tenedor de 2022-2023 (tope sobre IGC vs. pacto) NO está modelado: este catálogo es un único
// % por año; (c) el «desde» exacto del 2 % (30/03 o 1/04/2022) y el «hasta» de cada prórroga.
// 2025+: el límite NO es un % fijo sino el IRAV del INE (LAU art. 18.1, redacción Ley 12/2023): por eso `pct: null` ahí significa
// «el límite es el IRAV», no «sin límite». La propuesta de actualización ya usa el IRAV como índice cuando el contrato lo pacta
// (`actualizacion-renta.ts:1,9`, `indices-ine.ts:8,102`); el IRAV no entra aquí como tope %.
//
// 🧭 «SIN TOPE» DEL CLIENTE vs TOPE LEGAL VIGENTE (2022-2024) — recomendación jurídica (NO implementada; la lógica no cambia):
// un tope legal imperativo (art. 46 RDL 6/2022 y prórrogas, orden público en vivienda habitual) NO es renunciable por el
// arrendador-cliente: reclamar de más expone a devolución. Lo correcto: en años con `pct` legal y `estado` verificado,
// «sin tope» no debería anular el catálogo (avisar y aplicar el legal; el `propio` solo puede ser MENOR o igual que el legal).
// «Sin tope» solo vale donde no hay tope legal codificado (2025+, salvo zonas tensionadas).
// IMPLEMENTADO (25/10/2026): `topeAplicable` aplica min(cliente, legal) cuando hay `pct` legal; ver `limitadoPorLey`.
//
// Función PURA: `hoy` entra como parámetro. El % es el tope a la SUBIDA de la renta; una variación negativa no se topa.
import { esFecha, type Fecha } from './fechas.ts'

export interface TopeCatalogo {
  /** Año del ANIVERSARIO (de `aplicableDesde`) al que se aplica. */
  anio: number
  /** Tope en %. `null` = sin tope codificado para ese año (no es «0 %» ni «sin límite legal»). */
  pct: number | null
  /** Qué norma lo fija (o por qué no hay entrada). */
  norma: string
  /** Dónde se comprobó (URL o identificador BOE). */
  fuente: string
  /** Día en que alguien lo comprobó contra la fuente (`YYYY-MM-DD`). */
  revisadoEn: Fecha
  /** `por_verificar` = escrito sin revisión fiscal; `verificado` = comprobado contra la fuente por el agente fiscal. */
  estado: 'por_verificar' | 'verificado'
}

export const REVISION_TOPE_RENTA = Object.freeze({
  ultimaRevision: '2026-10-24' as Fecha,
  siguienteRevision: '2027-01-15' as Fecha,
  responsable: 'agente fiscal (skill fiscal-novedades)',
})

export const CATALOGO_TOPE_RENTA: readonly TopeCatalogo[] = Object.freeze([
  {
    anio: 2022, pct: 2,
    norma: 'RDL 6/2022, art. 46: actualización limitada al 2 % (desde el 1/4/2022).',
    fuente: 'BOE-A-2022-4972', revisadoEn: '2026-10-24', estado: 'por_verificar',
  },
  {
    anio: 2023, pct: 2,
    norma: 'RDL 20/2022 (prórroga del límite del 2 % durante 2023).',
    fuente: 'BOE-A-2022-22685', revisadoEn: '2026-10-24', estado: 'por_verificar',
  },
  {
    anio: 2024, pct: 3,
    norma: 'RDL 8/2023 (límite del 3 % durante 2024).',
    fuente: 'BOE-A-2023-26452', revisadoEn: '2026-10-24', estado: 'por_verificar',
  },
  {
    anio: 2025, pct: null,
    norma: 'Sin tope codificado: el límite anti-crisis acabó el 31/12/2024; desde 2025 el límite no es un % fijo: es el IRAV del INE (LAU art. 18, Ley 12/2023) o el índice pactado. `pct: null` = el límite es el IRAV. Pendiente de BOE/INE.',
    fuente: 'pendiente', revisadoEn: '2026-10-24', estado: 'por_verificar',
  },
  {
    anio: 2026, pct: null,
    norma: 'Sin % codificado: el límite es el IRAV (o el índice pactado); las zonas tensionadas (Ley 12/2023) pueden limitarlo. Pendiente de revisión fiscal.',
    fuente: 'pendiente', revisadoEn: '2026-10-24', estado: 'por_verificar',
  },
  {
    anio: 2027, pct: null,
    norma: 'Sin tope codificado: pendiente de la revisión anual de enero de 2027.',
    fuente: 'pendiente', revisadoEn: '2026-10-24', estado: 'por_verificar',
  },
])

/** La entrada del año, o `null` si el catálogo no lo cubre. */
export function topeCatalogoDe(anio: number): TopeCatalogo | null {
  return CATALOGO_TOPE_RENTA.find((t) => t.anio === anio) ?? null
}

/** ¿El catálogo ya no cubre el año de `hoy`? Es la señal de que toca la revisión anual. */
export function catalogoTopeCaducado(hoy: Fecha): boolean {
  if (!esFecha(hoy)) throw new Error('hoy_invalido')
  return topeCatalogoDe(Number(hoy.slice(0, 4))) === null
}

/** Lo que el cliente dejó guardado en SU contrato. */
export type PreferenciaTope = { modo: 'defecto' } | { modo: 'propio'; pct: number } | { modo: 'sin_tope' }

/** `legal` = el cliente pidió «sin tope» o uno mayor y manda el tope legal del año (`limitadoPorLey`). */
export type OrigenTope = 'cliente' | 'cliente_sin_tope' | 'catalogo' | 'sin_catalogo' | 'legal'

export interface TopeAplicable {
  /** `null` = no se topa. */
  pct: number | null
  origen: OrigenTope
  anio: number
  /** La entrada del catálogo que se habría usado por defecto (la pantalla la enseña aunque mande el cliente). */
  catalogo: TopeCatalogo | null
  /** `true` = el valor del cliente («sin tope» o mayor que el legal) se ha limitado al tope legal del año. */
  limitadoPorLey: boolean
}

/** % de tope válido: número finito entre 0 y 100 con, como mucho, dos decimales. Si no, `null`. */
export function validarTopeCliente(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null
  return Math.abs(Math.round(v * 100) - v * 100) < 1e-6 ? Math.round(v * 100) / 100 : null
}

/**
 * El tope que se aplica a una actualización con efecto en `aplicableDesde`: el del cliente si lo fijó; «sin tope» si
 * lo quitó; el del catálogo del AÑO del aniversario si no tocó nada. Un año sin entrada o con `pct: null` →
 * `sin_catalogo` (no se topa, y la pantalla lo dice: «no tenemos el tope de ese año»).
 */
export function topeAplicable(aplicableDesde: Fecha, pref: PreferenciaTope): TopeAplicable {
  if (!esFecha(aplicableDesde)) throw new Error('aniversario_invalido')
  const anio = Number(aplicableDesde.slice(0, 4))
  const catalogo = topeCatalogoDe(anio)
  const legal = catalogo?.pct ?? null
  // Un tope legal vigente es imperativo: «sin tope» o un valor mayor NO lo anulan; uno menor sí (efectivo = min).
  if (pref.modo === 'sin_tope') {
    return legal === null
      ? { pct: null, origen: 'cliente_sin_tope', anio, catalogo, limitadoPorLey: false }
      : { pct: legal, origen: 'legal', anio, catalogo, limitadoPorLey: true }
  }
  if (pref.modo === 'propio') {
    const pct = validarTopeCliente(pref.pct)
    // Un valor propio roto no se ignora en silencio ni se convierte en 0: se cae al catálogo y se ve.
    if (pct !== null) {
      if (legal !== null && pct > legal) return { pct: legal, origen: 'legal', anio, catalogo, limitadoPorLey: true }
      return { pct, origen: 'cliente', anio, catalogo, limitadoPorLey: false }
    }
  }
  if (catalogo === null || catalogo.pct === null) return { pct: null, origen: 'sin_catalogo', anio, catalogo, limitadoPorLey: false }
  return { pct: catalogo.pct, origen: 'catalogo', anio, catalogo, limitadoPorLey: false }
}

/**
 * La preferencia desde las dos columnas de la BD (`tope_actualizacion_pct`, `tope_actualizacion_sin`):
 * `sin` gana; si no, `pct` válido; si no, el defecto.
 */
export function preferenciaDeColumnas(pct: number | null, sin: boolean | null): PreferenciaTope {
  if (sin === true) return { modo: 'sin_tope' }
  if (pct !== null && validarTopeCliente(pct) !== null) return { modo: 'propio', pct }
  return { modo: 'defecto' }
}

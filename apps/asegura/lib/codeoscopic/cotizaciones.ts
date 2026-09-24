// Persistencia de las COTIZACIONES pedidas a Codeoscopic. Impuro (BD).
//
// Hermano de `consumo.ts`: aquél apunta lo que se GASTA, éste lo que se RECIBE.
// Sin él, los precios de una cotización de 0,50€ viven en la pestaña del
// navegador y recargar es tirar el dinero — y la renovación del año que viene
// no tiene con qué compararse.
//
// El contrato de las dos tablas está en
// `prisma/sql/2026-09-02_tarificaciones_guardadas.sql`, y de ahí salen tres
// invariantes que aquí NO se negocian:
//
//   1. `simulado = (intento_id is null)`. Una cotización real siempre tiene su
//      línea en el libro de consumo; una simulada no la tiene nunca, porque no
//      hubo llamada ni cargo. Está en la BD como CHECK y aquí como guarda: si
//      llega una entrada que lo incumple, se LANZA antes de escribir nada. Que
//      lo cace la BD sería tarde y con un mensaje que no explica nada.
//   2. Cabecera y precios se escriben en UNA transacción. Media cotización
//      guardada es peor que ninguna: una cabecera sin precios se lee como «esa
//      compañía no dio precio», que es exactamente la mentira que la tabla
//      existe para evitar.
//   3. El riesgo desnormalizado sale de la petición y **lo que no venga va a
//      NULL**, jamás a `0` ni a `''`. Un `0` en `metros_cuadrados` no es «no lo
//      sé»: es un piso de cero metros, y la horquilla lo promediaría.
//
// 🔒 Aislamiento: `correduria_id` viaja en TODA escritura y en toda lectura.
// Con `prisma_seguros` en BYPASSRLS, olvidarlo no da error: mezcla la cartera
// de dos corredurías. Lo vigila test/regression-asegura-aislamiento.test.ts.

import { prisma } from '../tenant.ts'
import type { Cotizacion } from './respuesta.ts'

/** Por qué puerta entró la cotización. Es el CHECK de la tabla, en TypeScript. */
export type PuertaCotizacion = 'corredor' | 'agente' | 'web'

export const PUERTAS: readonly PuertaCotizacion[] = ['corredor', 'agente', 'web']

export function esPuerta(v: unknown): v is PuertaCotizacion {
  return typeof v === 'string' && (PUERTAS as readonly string[]).includes(v)
}

/**
 * De dónde viene la cotización. NO se adivina: si el llamante no lo dice, no se
 * guarda (ver `Guardado.no_intentada`). Inventar aquí un `ramo: 'otro'` o una
 * `puerta: 'corredor'` por defecto sería meter en la tabla un «no lo sé»
 * disfrazado de dato — y encima se colaría por todas las guardas de NULL.
 */
export type ContextoCotizacion = {
  /** Ramo tal y como lo entiende la casa: `auto`, `hogar`… */
  ramo: string
  puerta: PuertaCotizacion
  /** De dónde salió, si salió de la cartera. `null` = no venía de una póliza. */
  polizaId?: string | null
  clienteId?: string | null
}

/**
 * El riesgo, aplanado para poder CONSULTARLO.
 *
 * Duplica lo que ya está dentro de `peticion` (que sigue siendo la fuente de
 * verdad) porque la horquilla busca «casos parecidos a éste» y eso no se hace
 * rebuscando en un jsonb. Todos los campos son anulables a propósito: son tres
 * estados, y `null` significa «la petición no lo traía».
 */
export type RiesgoDesnormalizado = {
  codigoPostal: string | null
  municipioId: number | null
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | null
  capitalContenido: number | null
  tipoVivienda: string | null
  uso: string | null
  ocupacion: string | null
}

export type EntradaCotizacion = {
  correduriaId: string
  contexto: ContextoCotizacion
  /** La línea del libro de consumo. `null` ⇔ simulada. Ver invariante 1. */
  intentoId: string | null
  simulado: boolean
  /** El cuerpo EXACTO que viajó (o que habría viajado, al simular). */
  peticion: unknown
  cotizacion: Cotizacion
  solicitadoPor: string
}

/**
 * Qué pasó con el guardado. TRES estados, nunca un booleano optimista:
 *
 *   - `guardada`     → está en la BD, y con qué id.
 *   - `no_guardada`  → se intentó y falló. El precio se enseña igual, pero
 *                      quien lo pinte tiene que poder decir que no quedó copia.
 *   - `no_intentada` → ni se intentó (falta el contexto). No es lo mismo que
 *                      haber fallado, y confundirlos manda a mirar el sitio
 *                      equivocado.
 */
export type Guardado =
  | { estado: 'guardada'; cotizacionId: string }
  | { estado: 'no_guardada'; motivo: string }
  | { estado: 'no_intentada'; motivo: string }

// ─── El doble de la BD: lo mínimo que se usa dentro de la transacción ────────
//
// Se declara aquí (y no se importa de Prisma) para que la transacción se pueda
// doblar en un test sin levantar una base de datos. La implementación real es
// `transaccionPrisma`, cuatro líneas más abajo.

export type ClienteRaw = {
  $queryRaw<T = unknown>(sql: TemplateStringsArray, ...valores: unknown[]): Promise<T>
  $executeRaw(sql: TemplateStringsArray, ...valores: unknown[]): Promise<number>
}

export type EnTransaccion = <T>(fn: (tx: ClienteRaw) => Promise<T>) => Promise<T>

/** La de verdad: una transacción interactiva de Prisma. */
export const transaccionPrisma: EnTransaccion = (fn) => prisma.$transaction((tx) => fn(tx))

// ─── Lectura defensiva del cuerpo ────────────────────────────────────────────
// Lo que entra es el `CreateInsuranceRequest_V1` ya construido; los nombres son
// los del vendor. Cada helper devuelve `null` cuando el dato no está, y ninguno
// tiene un valor de relleno.

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null
const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const entero = (v: unknown): number | null => {
  const n = numero(v)
  return n === null ? null : Math.round(n)
}

/**
 * Un catálogo viaja como `{ id }`, pero a veces el id ya viene suelto. Se
 * aceptan las dos formas y se devuelve SIEMPRE el id, nunca un nombre: un
 * `buildingType` guardado como texto libre no se puede cruzar con nada.
 */
const idTexto = (v: unknown): string | null => {
  if (typeof v === 'string' || typeof v === 'number') return texto(String(v))
  const id = obj(v).id
  return typeof id === 'string' || typeof id === 'number' ? texto(String(id)) : null
}

const idEntero = (v: unknown): number | null => {
  const t = idTexto(v)
  if (t === null) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * Aplana el riesgo de la petición.
 *
 * La dirección vive en `risk.address` (hogar) o en `risk.circulationAddress`
 * (auto): son los dos nombres reales del vendor, y se miran en ese orden. Lo
 * que no esté sale `null` — que es distinto de `0`, y por eso no hay ni un
 * `?? 0` en esta función.
 */
export function riesgoDePeticion(peticion: unknown): RiesgoDesnormalizado {
  const riesgo = obj(obj(peticion).risk)
  const direccion = obj(riesgo.address ?? riesgo.circulationAddress)

  return {
    codigoPostal: texto(direccion.postalCode),
    municipioId: idEntero(direccion.town),
    metrosCuadrados: entero(riesgo.floorArea),
    anioConstruccion: entero(riesgo.yearBuilt),
    capitalContinente: numero(riesgo.buildingsLimit),
    capitalContenido: numero(riesgo.contentsLimit),
    tipoVivienda: idTexto(riesgo.buildingType),
    // 🚨 `use` es el RÉGIMEN (propietario/inquilino) y `occupancy` el USO
    // (habitual/segunda residencia). Los nombres del vendor engañan y están
    // cruzados respecto a los nuestros: ver `peticion-hogar.ts`.
    uso: idTexto(riesgo.use),
    ocupacion: idTexto(riesgo.occupancy),
  }
}

/** La fecha de efecto que confirmó el vendor; si no la dijo, la que se le pidió. */
function fechaEfecto(e: EntradaCotizacion): string | null {
  return e.cotizacion.fechaEfecto ?? texto(obj(e.peticion).effectiveDate)
}

/**
 * Comprueba el invariante ANTES de tocar la BD.
 *
 * Devuelve el motivo, o `null` si la entrada es coherente. Es la misma regla
 * que el CHECK `simulada_sin_libro` de la tabla, pero dicha aquí para que el
 * fallo explique QUÉ está mal en vez de llegar como un error de constraint.
 */
export function reparoDeEntrada(e: EntradaCotizacion): string | null {
  if (e.simulado !== (e.intentoId === null)) {
    return e.simulado
      ? 'una cotización simulada no puede traer intentoId: no hubo llamada ni cargo que anotar'
      : 'una cotización real tiene que traer su intentoId: es su línea en el libro de consumo'
  }
  if (!texto(e.correduriaId)) return 'falta la correduría: sin ella la fila se mezclaría con la de otra'
  if (!texto(e.contexto.ramo)) return 'falta el ramo'
  if (!esPuerta(e.contexto.puerta)) return `puerta desconocida: «${String(e.contexto.puerta)}»`
  return null
}

/**
 * Guarda la cabecera y sus precios EN UNA TRANSACCIÓN.
 *
 * Lanza si algo falla — a propósito: el llamante decide qué hacer con ello, y
 * en el embudo esa decisión es «no tumbar la cotización» (ver `cotizar.ts`).
 * Devuelve el id de la cabecera.
 */
export async function guardarCotizacion(
  e: EntradaCotizacion,
  enTransaccion: EnTransaccion = transaccionPrisma,
): Promise<string> {
  const reparo = reparoDeEntrada(e)
  if (reparo) throw new Error(`cotizacion_no_guardable: ${reparo}`)

  const r = riesgoDePeticion(e.peticion)
  const efecto = fechaEfecto(e)
  const peticionJson = JSON.stringify(e.peticion ?? null)

  return enTransaccion(async (tx) => {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      insert into seguros.tarificaciones (
        correduria_id, intento_id, simulado, project_id_codeoscopic,
        ramo, puerta, poliza_id, cliente_id, fecha_efecto, peticion,
        codigo_postal, municipio_id, metros_cuadrados, anio_construccion,
        capital_continente, capital_contenido, tipo_vivienda, uso, ocupacion,
        solicitado_por
      ) values (
        ${e.correduriaId}::uuid,
        ${e.intentoId}::uuid,
        ${e.simulado},
        ${e.cotizacion.projectId},
        ${e.contexto.ramo},
        ${e.contexto.puerta},
        ${e.contexto.polizaId ?? null}::uuid,
        ${e.contexto.clienteId ?? null}::uuid,
        ${efecto}::date,
        ${peticionJson}::jsonb,
        ${r.codigoPostal},
        ${r.municipioId},
        ${r.metrosCuadrados},
        ${r.anioConstruccion},
        ${r.capitalContinente},
        ${r.capitalContenido},
        ${r.tipoVivienda},
        ${r.uso},
        ${r.ocupacion},
        ${e.solicitadoPor}
      )
      returning id::text as id
    `
    const id = filas[0]?.id
    // Sin id no hay de qué colgar los precios. Se lanza para que la
    // transacción entera se deshaga: nunca una cabecera suelta.
    if (!id) throw new Error('cotizacion_sin_id: el insert de la cabecera no devolvió fila')

    for (const p of e.cotizacion.precios) {
      await tx.$executeRaw`
        insert into seguros.tarificacion_precios (
          tarificacion_id, compania, producto, modalidad, categoria,
          prima_eur, entrada_eur, franquicia_eur, firmeza, requiere_rerate,
          referencia_vendor, avisos
        ) values (
          ${id}::uuid,
          ${p.compania},
          ${p.producto},
          ${p.modalidad},
          ${p.categoria},
          ${p.primaEur},
          ${p.entradaEur},
          ${p.franquiciaEur},
          ${p.firmeza},
          ${p.requiereReRate},
          ${p.referenciaVendor},
          ${JSON.stringify(p.avisos ?? [])}::jsonb
        )
      `
    }

    return id
  })
}

/** El texto de un error, sin suponer que sea un `Error`. */
function motivoDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * El mismo guardado, pero que NO LANZA NUNCA.
 *
 * 🚨 Ésta es la que usa el embudo, y el porqué es de negocio: cuando se llega
 * aquí el cliente YA ha pagado los 0,50€ y YA tiene su precio en pantalla.
 * Perderlo por un error de la BD sería cobrárselo dos veces.
 *
 * Lo que NO hace es mentir: el fallo sale en el estado, con su motivo, para que
 * la pantalla pueda decir «este precio no ha quedado guardado». Un `catch` que
 * devolviera «guardada» sería el fallo más caro que describe `CLAUDE.md`.
 */
export async function guardarSinTumbar(
  e: EntradaCotizacion,
  enTransaccion: EnTransaccion = transaccionPrisma,
): Promise<Guardado> {
  try {
    return { estado: 'guardada', cotizacionId: await guardarCotizacion(e, enTransaccion) }
  } catch (err) {
    return { estado: 'no_guardada', motivo: motivoDe(err) }
  }
}

/** Firma de lo que el embudo llama. Existe para poder doblarla en un test. */
export type GuardarCotizacion = (e: EntradaCotizacion) => Promise<Guardado>

// Catálogos de Codeoscopic. Todo lo de aquí es GRATIS: son `GET` de consulta,
// no cotizaciones. Ninguna función de este fichero gasta los 0,50€.
//
// ─── Por qué importa que esto sea gratis ────────────────────────────────────
// La cotización necesita IDS del vendor, no texto: el municipio es un número,
// el estado civil una cadena de su catálogo y el vehículo un **código de
// versión Base7**. Resolverlos aquí, sin coste, es lo que evita el modo de
// fallo caro: mandar un cuerpo con un id inventado y pagar por el 400.
//
// 🚨 La versión del vehículo se puede obtener por DOS caminos y solo uno cuesta:
//   - `car/brands → models → vehicles`  → NAVEGANDO el catálogo. **Gratis.**
//   - `GET /vehicles?registrationPlate=` → desde la MATRÍCULA. **Exige créditos
//     de pago** (comercial@codeoscopic.com), y hoy no están contratados.
// Por eso la pantalla del corredor navega el catálogo en tres clics en vez de
// buscar por matrícula: hace lo mismo y no hay que comprar nada.

import { peticion } from './cliente.ts'
import type { ConfigCodeoscopic } from './config.ts'

/** Una entrada de catálogo: lo que se pinta en un desplegable. */
export type { Opcion } from './opciones.ts'
export { normalizarTexto, emparejar, elegirDefecto, pareceOpcionPropietario } from './opciones.ts'
import { normalizarTexto, type Opcion } from './opciones.ts'

/**
 * Caché en memoria con TTL. Los catálogos del vendor cambian de año en año, no
 * de minuto en minuto, y cada instancia serverless dura poco: 24 h es de sobra
 * y no requiere tabla. Deliberadamente NO es persistente — un catálogo cacheado
 * en BD que se queda viejo produce ids que ya no existen, y eso sí cuesta.
 */
const TTL_MS = 24 * 3600 * 1000
type Entrada = { valor: unknown; expira: number }
const cache = new Map<string, Entrada>()

/** Vacía la caché. Existe para los tests y para un botón de recarga. */
export function olvidarCatalogos(): void {
  cache.clear()
}

async function catalogo<T>(config: ConfigCodeoscopic, path: string): Promise<T> {
  const ahora = Date.now()
  const hit = cache.get(path)
  if (hit && hit.expira > ahora) return hit.valor as T
  const valor = (await peticion(config, {
    metodo: 'GET',
    path,
    timeoutMs: config.timeoutGenericoMs,
  })) as T
  cache.set(path, { valor, expira: ahora + TTL_MS })
  return valor
}

/**
 * El vendor devuelve las listas con formas distintas según el catálogo
 * (`[{id,name}]`, `{items:[…]}`, `{data:[…]}`). Se normaliza aquí, una vez, en
 * lugar de que cada llamante adivine.
 *
 * Lo que NO se hace es inventar: una entrada sin id se descarta, porque un id
 * vacío en el cuerpo de la cotización es un 400 pagado.
 */
export function normalizarOpciones(raw: unknown): Opcion[] {
  const lista = extraerLista(raw)
  const out: Opcion[] = []
  for (const it of lista) {
    if (typeof it !== 'object' || it === null) continue
    const o = it as Record<string, unknown>
    const id = o.id ?? o.code ?? o.value
    if (id === undefined || id === null || String(id).trim() === '') continue
    const nombre = o.name ?? o.description ?? o.label ?? o.text
    out.push({ id: String(id), nombre: String(nombre ?? id) })
  }
  return out
}

function extraerLista(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object' && raw !== null) {
    for (const k of ['items', 'data', 'results', 'content']) {
      const v = (raw as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v
    }
  }
  return []
}

// ─── Catálogos generales ─────────────────────────────────────────────────────

/**
 * Municipios de un código postal. El vendor quiere `town.id` (un número), nunca
 * el nombre. Un CP puede dar varios municipios: se devuelven todos y decide la
 * pantalla — elegir el primero a ciegas es cómo se manda a otro municipio.
 */
export async function municipiosPorCp(config: ConfigCodeoscopic, cp: string): Promise<Opcion[]> {
  const limpio = cp.trim()
  if (!/^\d{5}$/.test(limpio)) return []
  return normalizarOpciones(await catalogo(config, `/towns?postalCode=${encodeURIComponent(limpio)}`))
}

export async function estadosCiviles(config: ConfigCodeoscopic): Promise<Opcion[]> {
  return normalizarOpciones(await catalogo(config, '/marital-statuses'))
}

export async function tiposDeGaraje(config: ConfigCodeoscopic): Promise<Opcion[]> {
  return normalizarOpciones(await catalogo(config, '/car/garage-types'))
}

/**
 * Las marcas de coche.
 *
 * 🚨 `onlyPopular` va EXPLÍCITO a `false`, y no es cosmético: el portal lo
 * documenta con **`Default: true`**, así que llamar a `/car/brands` a secas
 * devuelve solo las marcas «populares» — el resto sencillamente no aparece, sin
 * error y sin hueco que lo delate. En el desplegable se vería igual que si la
 * marca no existiera, que es la forma silenciosa de mentir que persigue
 * `CLAUDE.md`. Medido en el snapshot del portal el 02/09/2026.
 */
export async function marcas(config: ConfigCodeoscopic): Promise<Opcion[]> {
  return normalizarOpciones(await catalogo(config, '/car/brands?onlyPopular=false'))
}

export async function modelos(config: ConfigCodeoscopic, marcaId: string): Promise<Opcion[]> {
  return normalizarOpciones(
    await catalogo(config, `/car/brands/${encodeURIComponent(marcaId)}/models`),
  )
}

/**
 * Los tipos de motor de coche. Gratis, y hace falta ANTES que las versiones.
 * Ver `versiones()`.
 */
export async function tiposDeMotor(config: ConfigCodeoscopic): Promise<Opcion[]> {
  return normalizarOpciones(await catalogo(config, '/car/engine-types'))
}

/**
 * Las VERSIONES de un modelo. El `id` de cada una es el código Base7.
 *
 * 🚨 **`engine` es OBLIGATORIO también en auto**, y sin él el vendor responde
 * `400 Bad Request`: «Query parameter 'engine' is required on path
 * '/car/brands/{brandId}/models/{modelId}/vehicles' but not found in request.»
 * Medido en producción el 03/09/2026, sobre `/car/brands/731/models/8689`.
 *
 * ⚠️ Esto CORRIGE lo que decía `docs/CODEOSCOPIC-API-PORTAL.md`: que `engine`
 * era obligatorio «en moto, mientras que en auto es texto libre». Libre lo será,
 * pero opcional no es. La lección es la de siempre aquí: el snapshot del portal
 * describe el contrato, y el contrato de verdad lo dicta la respuesta.
 *
 * El valor sale del catálogo `/car/engine-types` (`tiposDeMotor`), no de un
 * literal nuestro: si mañana añaden un combustible, el desplegable lo trae solo.
 */
export async function versiones(
  config: ConfigCodeoscopic,
  marcaId: string,
  modeloId: string,
  motor: string,
): Promise<Opcion[]> {
  return normalizarOpciones(
    await catalogo(
      config,
      `/car/brands/${encodeURIComponent(marcaId)}/models/${encodeURIComponent(modeloId)}` +
        `/vehicles?engine=${encodeURIComponent(motor)}`,
    ),
  )
}

// ─── Catálogos de HOGAR (gratis) ─────────────────────────────────────────────

/**
 * Los diez catálogos de hogar del portal (`docs/CODEOSCOPIC-API-PORTAL.md`).
 * La lista es CERRADA a propósito: el path se construye con el nombre, y un
 * nombre fuera de aquí sería un GET a una ruta inventada. No cuesta dinero
 * (son consultas), pero tampoco se hace: un catálogo que «no existe» y un
 * catálogo que no se ha podido leer tienen que poder distinguirse.
 */
export const CATALOGOS_HOGAR = [
  'property-types',
  'build-materials',
  'build-qualities',
  'door-types',
  'alarm-types',
  'locations',
  'occupancy-types',
  'settlement-types',
  'uses',
  'person-roles',
] as const

export type CatalogoHogar = (typeof CATALOGOS_HOGAR)[number]

export function esCatalogoHogar(nombre: unknown): nombre is CatalogoHogar {
  return typeof nombre === 'string' && (CATALOGOS_HOGAR as readonly string[]).includes(nombre)
}

/** `GET /home/<nombre>`, normalizado. Rechaza con `Error` un nombre fuera de la lista. */
export async function catalogoHogar(config: ConfigCodeoscopic, nombre: CatalogoHogar): Promise<Opcion[]> {
  if (!esCatalogoHogar(nombre)) {
    throw new Error(`codeoscopic_catalogo_hogar_desconocido: «${String(nombre)}» no está entre ${CATALOGOS_HOGAR.join(', ')}`)
  }
  return normalizarOpciones(await catalogo(config, `/home/${nombre}`))
}

// ─── Ramos que tarifican para NUESTRA organización (gratis) ──────────────────

/**
 * `GET /insurance-lines`: los ramos que Codeoscopic tiene habilitados para esta
 * organización. Es la respuesta a «¿se puede cotizar HOGAR?» sin preguntárselo
 * a nadie por email y sin gastar: es un GET de catálogo, no una cotización.
 * Se cachea como el resto (24 h): los ramos contratados no cambian a diario.
 */
export async function lineasDeSeguro(config: ConfigCodeoscopic): Promise<Opcion[]> {
  return normalizarOpciones(await catalogo(config, '/insurance-lines'))
}

/** Ids con los que el vendor nombra el ramo de hogar (`insuranceLine.id`). */
const IDS_HOGAR = new Set(['home', 'hogar', 'household', 'homeowner'])

/**
 * ¿Está hogar entre los ramos disponibles? TRES estados, porque «no está en la
 * lista» y «no se ha podido mirar la lista» no son lo mismo:
 *   `disponible`  → hay un ramo cuyo id o nombre es el de hogar.
 *   `ausente`     → la lista llegó y hogar NO está: hay que pedírselo a Codeoscopic.
 *   `desconocido` → la lista está vacía (o no llegó). No se afirma nada.
 * Devuelve además el id EXACTO con el que hay que mandarlo en `insuranceLine`,
 * porque `'Car'` va con mayúscula y adivinar la de hogar sería un 400 pagado.
 */
export type DisponibilidadHogar =
  | { estado: 'disponible'; id: string; nombre: string }
  | { estado: 'ausente'; ramos: string[] }
  | { estado: 'desconocido' }

export function hogarDisponible(lineas: Opcion[]): DisponibilidadHogar {
  if (lineas.length === 0) return { estado: 'desconocido' }
  const hogar = lineas.find(
    (l) => IDS_HOGAR.has(l.id.toLowerCase()) || IDS_HOGAR.has(normalizarTexto(l.nombre)),
  )
  if (hogar) return { estado: 'disponible', id: hogar.id, nombre: hogar.nombre }
  return { estado: 'ausente', ramos: lineas.map((l) => l.nombre) }
}

// ─── Matrícula → fecha de matriculación (gratis) ─────────────────────────────

/**
 * Fecha de matriculación a partir de la matrícula.
 *
 * TRES estados, y la diferencia importa:
 *   `{ estado: 'ok' }`          → la fecha, que el fabricante advierte que es
 *                                 **aproximada**: orienta, no vale para emitir.
 *   `{ estado: 'no-encontrada' }` → el vendor respondió `null`. Es «no la he
 *                                 encontrado», NO «el coche no tiene fecha».
 *   `{ estado: 'error' }`       → no se pudo preguntar. Tampoco es una ausencia.
 */
export type FechaMatriculacion =
  | { estado: 'ok'; fecha: string }
  | { estado: 'no-encontrada' }
  | { estado: 'error'; detalle: string }

export function normalizarMatricula(m: string): string {
  return m.toUpperCase().replace(/[\s-]/g, '')
}

export async function fechaMatriculacionDeMatricula(
  config: ConfigCodeoscopic,
  matricula: string,
): Promise<FechaMatriculacion> {
  const placa = normalizarMatricula(matricula)
  if (placa === '') return { estado: 'error', detalle: 'matrícula vacía' }
  try {
    const raw = (await peticion(config, {
      metodo: 'GET',
      path: `/car/registration-date?plate=${encodeURIComponent(placa)}`,
      timeoutMs: config.timeoutGenericoMs,
    })) as unknown
    const fecha = leerFecha(raw)
    return fecha === null ? { estado: 'no-encontrada' } : { estado: 'ok', fecha }
  } catch (e) {
    // Un fallo de red NO se degrada a «no encontrada»: diría que el vendor no
    // sabe la fecha cuando lo cierto es que no se le ha podido preguntar.
    return { estado: 'error', detalle: e instanceof Error ? e.message : String(e) }
  }
}

/** `{"date":"2021-10-01"}` → `'2021-10-01'`. Cualquier otra cosa → `null`. */
export function leerFecha(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = (raw as Record<string, unknown>).date ?? (raw as Record<string, unknown>).registrationDate
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// ─── Emparejar texto del CRM con el catálogo del vendor ──────────────────────

// ─── Hogar: tipo de vía y valores por defecto (gratis) ───────────────────────

/** `GET /road-types`: los tipos de vía (`Calle`, `Avenida`…). Van en `risk.address.roadType.id`. */
export async function tiposDeVia(config: ConfigCodeoscopic): Promise<Opcion[]> {
  return normalizarOpciones(await catalogo(config, '/road-types'))
}

/**
 * Los ids que usa el EJEMPLO del portal para cada catálogo de hogar
 * (`docs/CODEOSCOPIC-API-PORTAL.md`, § Hogar). No se mandan a ciegas: solo se
 * preseleccionan si el catálogo vivo los trae (`elegirDefecto`), y siempre
 * como SUPUESTO que la pantalla enseña. Son el «piso normal, sin alarma, sin
 * puerta blindada» — lo conservador, que no abarata el precio.
 */
export const DEFECTOS_HOGAR: Partial<Record<CatalogoHogar, string>> = {
  'property-types': 'MiddleFloor',
  uses: 'Owner',
  'occupancy-types': 'MainResidence',
  locations: 'CityCentre',
  'build-materials': 'NonCombustible',
  'build-qualities': 'Normal',
  'alarm-types': 'NoAlarm',
  'door-types': 'NonReinforcedOtherDoor',
  'settlement-types': 'ReplacementValue',
}
export const DEFECTO_TIPO_VIA = 'Calle'


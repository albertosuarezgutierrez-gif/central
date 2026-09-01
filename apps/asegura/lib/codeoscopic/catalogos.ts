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
export type Opcion = { id: string; nombre: string }

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

export async function marcas(config: ConfigCodeoscopic): Promise<Opcion[]> {
  return normalizarOpciones(await catalogo(config, '/car/brands'))
}

export async function modelos(config: ConfigCodeoscopic, marcaId: string): Promise<Opcion[]> {
  return normalizarOpciones(
    await catalogo(config, `/car/brands/${encodeURIComponent(marcaId)}/models`),
  )
}

/** Las VERSIONES de un modelo. El `id` de cada una es el código Base7. */
export async function versiones(
  config: ConfigCodeoscopic,
  marcaId: string,
  modeloId: string,
): Promise<Opcion[]> {
  return normalizarOpciones(
    await catalogo(
      config,
      `/car/brands/${encodeURIComponent(marcaId)}/models/${encodeURIComponent(modeloId)}/vehicles`,
    ),
  )
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

/** Quita tildes y mayúsculas para comparar «Casado» con «CASADO». */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Busca en un catálogo la opción cuyo nombre coincide con un texto del CRM.
 *
 * 🚫 Solo empareja EXACTO (ya normalizado). Ante la duda devuelve `null`, y el
 * llamante lo trata como «hay que elegirlo a mano». Un emparejamiento por
 * parecido convertiría «Separado» en «Soltero» sin que nadie se entere, y eso
 * cambia el precio. Mismo criterio que `vehicle-catalog-match.ts` del CRM:
 * ante duda, no preselecciona.
 */
export function emparejar(catalogo: Opcion[], texto: string | null): Opcion | null {
  if (texto === null) return null
  const buscado = normalizarTexto(texto)
  if (buscado === '') return null
  const coincidencias = catalogo.filter((o) => normalizarTexto(o.nombre) === buscado)
  return coincidencias.length === 1 ? coincidencias[0] : null
}

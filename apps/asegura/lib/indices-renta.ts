import {
  parsearSerieIne, periodoEsperado, planificarInserciones, validarIndice,
  type IndiceGuardado, type IndiceIne, type InsercionIndice,
} from '@central/module-patrimonio'

/**
 * Índices IPC / IRAV del INE → `seguros.portal_patrimonio_indice` (paso 9b del portal de patrimonio).
 * Orquestación con TODO inyectado (descarga, lectura, inserción, aviso y reloj): los tests no tocan red ni BD.
 *
 * Reglas (de ellas cuelga la renta que se le sube a un inquilino):
 *  - Un índice con CUALQUIER problema (red, formato, validación, serie sin configurar, periodo esperado sin
 *    publicar) NO escribe nada y avisa. Los índices son independientes: el IPC bueno se guarda aunque el IRAV falle.
 *  - Tabla append-only: solo INSERT con ON CONFLICT DO NOTHING (lo hace `insertar`). Una revisión del INE es
 *    una fila NUEVA con `revisado=true`; nunca se pisa nada.
 */

/**
 * Fuentes de la API Tempus del INE. IPC: serie `IPC251852` (Total Nacional, Índice general, Variación anual;
 * código de memoria, el cepo es el nombre). IRAV: TABLA 72975 (`DATOS_TABLA`, mensual, nacional): devuelve varias
 * series y se elige la de «variación anual» POR NOMBRE; si no hay exactamente una, avisa y no escribe.
 * `INE_SERIE_<IDX>` (opcional, código público) fuerza una serie concreta en lugar de la fuente por defecto.
 */
export const SERIES_INE: Record<IndiceIne, { codigo: string | null; tabla: string | null; nombreEsperado: RegExp }> = {
  IPC: { codigo: 'IPC251852', tabla: null, nombreEsperado: /variaci[oó]n anual/i },
  IRAV: { codigo: null, tabla: '72975', nombreEsperado: /variaci[oó]n anual/i },
}

/** Meses pedidos al INE: los suficientes para ver revisiones recientes y que la serie sea consecutiva. */
export const MESES_DESCARGA = 14

const URL_INE = 'https://servicios.ine.es/wstempus/js/ES'

/** Código de serie forzado por env, o el por defecto; `null` si el índice se baja por tabla. */
export function serieDe(indice: IndiceIne, env: Record<string, string | undefined> = process.env): string | null {
  return env[`INE_SERIE_${indice}`]?.trim() || SERIES_INE[indice].codigo
}

export function urlSerie(codigo: string): string {
  return `${URL_INE}/DATOS_SERIE/${encodeURIComponent(codigo)}?nult=${MESES_DESCARGA}`
}

export function urlTabla(tabla: string): string {
  return `${URL_INE}/DATOS_TABLA/${encodeURIComponent(tabla)}?nult=${MESES_DESCARGA}&tip=AM`
}

export interface DepsIndicesRenta {
  /** `hoy` ISO `YYYY-MM-DD`, inyectado. */
  hoy: string
  /** Devuelve el JSON de la URL o lanza (red/HTTP). */
  descargar: (url: string) => Promise<unknown>
  /** Lecturas guardadas del índice, de la más antigua a la más reciente. */
  leerGuardados: (indice: IndiceIne) => Promise<IndiceGuardado[]>
  /** INSERT … ON CONFLICT DO NOTHING. */
  insertar: (indice: IndiceIne, filas: InsercionIndice[], fuenteUrl: string) => Promise<unknown>
  avisar: (texto: string) => Promise<unknown>
  /** Códigos de serie; por defecto `serieDe`. */
  serie?: (indice: IndiceIne) => string | null
}

export type ResultadoIndice =
  | { indice: IndiceIne; estado: 'ok'; nuevas: number; revisiones: number; ultimoPeriodo: string }
  | { indice: IndiceIne; estado: 'error'; causa: string }

export async function ejecutarIndicesRenta(deps: DepsIndicesRenta): Promise<ResultadoIndice[]> {
  const out: ResultadoIndice[] = []
  for (const indice of ['IPC', 'IRAV'] as const) {
    const r = await unIndice(indice, deps)
    if (r.estado === 'error') {
      await Promise.resolve(deps.avisar(`📉 <b>Índice ${indice} (INE)</b> · no se ha guardado nada: ${r.causa}`)).catch(() => null)
    }
    out.push(r)
  }
  return out
}

async function unIndice(indice: IndiceIne, d: DepsIndicesRenta): Promise<ResultadoIndice> {
  const error = (causa: string): ResultadoIndice => ({ indice, estado: 'error', causa })
  const codigo = (d.serie ?? ((i) => serieDe(i)))(indice)
  const tabla = SERIES_INE[indice].tabla
  if (!codigo && !tabla) return error(`fuente del INE sin configurar (INE_SERIE_${indice})`)
  const url = codigo ? urlSerie(codigo) : urlTabla(tabla!)
  let json: unknown
  try {
    json = await d.descargar(url)
  } catch (e) {
    return error(`la descarga ha fallado (${e instanceof Error ? e.message.slice(0, 120) : 'error'})`)
  }
  if (Array.isArray(json)) {
    // DATOS_TABLA: varias series; la buena se elige por nombre y tiene que ser UNA.
    const buenas = json.filter((x) => typeof (x as { Nombre?: unknown })?.Nombre === 'string' &&
      SERIES_INE[indice].nombreEsperado.test((x as { Nombre: string }).Nombre))
    if (buenas.length !== 1) return error(`en la tabla ${tabla ?? ''} hay ${buenas.length} series de variación anual (se esperaba 1)`)
    json = buenas[0]
  }
  const nombre = (json as { Nombre?: unknown } | null)?.Nombre
  if (typeof nombre !== 'string' || !SERIES_INE[indice].nombreEsperado.test(nombre)) {
    return error(`la serie ${codigo ?? tabla} no parece la de ${indice} («${String(nombre).slice(0, 80)}»)`)
  }
  let puntos
  try {
    puntos = parsearSerieIne(json, indice)
  } catch (e) {
    return error(e instanceof Error ? e.message.slice(0, 160) : 'formato ilegible')
  }
  const valida = validarIndice(puntos)
  if (!valida.ok) return error(`serie no válida: ${valida.errores.slice(0, 3).join('; ')}`)
  const ultimo = puntos[puntos.length - 1]!.periodo
  const esperado = periodoEsperado(indice, d.hoy)
  if (ultimo < esperado) return error(`el INE aún no ha publicado ${esperado} (último: ${ultimo})`)
  try {
    const nuevas = planificarInserciones(puntos, await d.leerGuardados(indice))
    if (nuevas.length > 0) await d.insertar(indice, nuevas, url)
    return {
      indice, estado: 'ok', ultimoPeriodo: ultimo,
      nuevas: nuevas.filter((f) => !f.revisado).length,
      revisiones: nuevas.filter((f) => f.revisado).length,
    }
  } catch (e) {
    return error(`la base de datos ha fallado (${e instanceof Error ? e.message.slice(0, 80) : 'error'})`)
  }
}

// El cliente del puerto de HOGAR de una póliza YA EXISTENTE (retarificar).
//
// Hermano de `hogar-nuevo-asegura.ts` (misma disciplina: `pedir()` con Bearer,
// interpretador PURO separado de la llamada) — la diferencia es de dónde sale
// el riesgo: aquí de la ficha de la póliza (`GET
// /api/operador/codeoscopic/precalificar-hogar?polizaId=`), no del Catastro.
//
// La COTIZACIÓN (0,50€) NO tiene función propia aquí: reutiliza
// `retarificarAsegura()` de `retarificar-asegura.ts`, que ya es agnóstica de
// ramo — `POST /api/operador/codeoscopic/retarificar` en asegura rama por
// `origen.tipo` (auto/hogar) con la MISMA función `prepararRetarificacion()`.
// Duplicar el POST aquí solo podría divergir sin avisar.

import {
  leerConsumo,
  type ConsumoPuerto,
} from './retarificar-asegura.ts'
import { describirCausaAsegura, MOTIVOS_PUERTO, type MotivoPuerto } from './correduria-puerto.ts'
import { cabecerasPuerto } from './puerto-actor.ts'

export type { ConsumoPuerto, MotivoPuerto }
export type { Reparo, Supuesto, Precio, Fallo, RespuestaRetarificar } from './retarificar-asegura.ts'

export type Opcion = { id: string; nombre: string }

export type Control = 'texto' | 'numero' | 'euros' | 'fecha' | 'opcion' | 'siNo' | 'siNoNoSe' | 'municipio'
export type Procedencia = 'poliza' | 'volcado' | 'catastro' | 'ficha' | 'supuesto' | 'corregido' | null

/** Una fila de la ficha de hogar, ya formateada por asegura (`resumen-hogar.ts`). */
export type Fila = {
  campo: string
  grupo: string
  etiqueta: string
  valor: unknown
  legible: string
  procedencia: Procedencia
  /** El porqué del supuesto, entero. `null` si no es un supuesto. */
  porque: string | null
  /** El supuesto abarata el precio, así que el real puede subir. */
  optimista: boolean
  /** Motivo por el que falta. `null` si no falta. */
  falta: string | null
  editable: boolean
  control: Control
  /** Solo en los de tipo `opcion`: de qué catálogo se surte (`catalogos[…]`, o `vias`/`estadosCiviles`/`municipios`). */
  catalogo?: string
}

export type ResumenHogar = {
  filas: Fila[]
  faltan: Fila[]
  supuestos: Fila[]
  /** Los supuestos que ABARATAN: si el cliente los desmiente, el precio sube. */
  optimistas: Fila[]
  listo: boolean
}

export type Ramo =
  | { estado: 'disponible'; id: string; nombre: string }
  | { estado: 'ausente'; ramos: string[] }
  | { estado: 'desconocido' }

export type PrecalificacionHogar = {
  polizaId: string
  etiquetaCliente: string
  /** Lo que el cliente paga HOY al año. `null` = no consta en la ficha. */
  primaActual: number | null
  /** El piso del Catastro que se ha usado para los huecos del riesgo. `null` = no se ha consultado. */
  catastro: {
    direccionLegible: string | null
    metrosCuadrados: number | null
    anioConstruccion: number | null
    codigoPostal: string | null
  } | null
  resumen: ResumenHogar
  /** El id por defecto de cada desplegable (o `null` si el catálogo no da nada que suponer). */
  defectos: Record<string, string | null>
  /** `/road-types`. Vacío = no se pudo leer, y el tipo de vía es obligatorio. */
  vias: Opcion[]
  catalogos: Record<string, Opcion[]>
  estadosCiviles: Opcion[]
  municipios: Opcion[]
  /** Catálogos que no se han podido leer (por nombre). Todos son obligatorios: uno bloquea el botón. */
  fallosCatalogo: string[]
  ramo: Ramo
  consumo: ConsumoPuerto
}

export type RespuestaPrecalificacionHogar =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  /** La póliza no es de esta correduría, no es de hogar, o no existe. */
  | { estado: 'no_encontrado'; mensaje: string }
  | { estado: 'ok'; pre: PrecalificacionHogar }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function leerOpciones(v: unknown): Opcion[] {
  if (!Array.isArray(v)) return []
  const out: Opcion[] = []
  for (const o of v) {
    if (typeof o !== 'object' || o === null) continue
    const x = o as Record<string, unknown>
    if ((typeof x.id !== 'string' && typeof x.id !== 'number') || typeof x.nombre !== 'string') continue
    out.push({ id: String(x.id), nombre: x.nombre })
  }
  return out
}

function leerCatalogos(v: unknown): Record<string, Opcion[]> {
  if (typeof v !== 'object' || v === null) return {}
  const out: Record<string, Opcion[]> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = leerOpciones(val)
  return out
}

function leerDefectos(v: unknown): Record<string, string | null> {
  if (typeof v !== 'object' || v === null) return {}
  const out: Record<string, string | null> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = cadena(val)
  return out
}

const CONTROLES = new Set<string>(['texto', 'numero', 'euros', 'fecha', 'opcion', 'siNo', 'siNoNoSe', 'municipio'])
const PROCEDENCIAS = new Set<string>(['poliza', 'volcado', 'catastro', 'ficha', 'supuesto', 'corregido'])

function leerFila(v: unknown): Fila | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  if (typeof x.campo !== 'string' || typeof x.grupo !== 'string' || typeof x.etiqueta !== 'string') return null
  if (typeof x.legible !== 'string' || typeof x.control !== 'string' || !CONTROLES.has(x.control)) return null
  return {
    campo: x.campo,
    grupo: x.grupo,
    etiqueta: x.etiqueta,
    valor: x.valor ?? null,
    legible: x.legible,
    procedencia: typeof x.procedencia === 'string' && PROCEDENCIAS.has(x.procedencia) ? (x.procedencia as Procedencia) : null,
    porque: cadena(x.porque),
    optimista: x.optimista === true,
    falta: cadena(x.falta),
    editable: x.editable !== false,
    control: x.control as Control,
    catalogo: cadena(x.catalogo) ?? undefined,
  }
}

function leerFilas(v: unknown): Fila[] {
  if (!Array.isArray(v)) return []
  const out: Fila[] = []
  for (const f of v) {
    const fila = leerFila(f)
    if (fila) out.push(fila)
  }
  return out
}

/** `null` = no llega o llega con forma rara: NO se degrada a una ficha vacía. */
function leerResumen(v: unknown): ResumenHogar | null {
  if (typeof v !== 'object' || v === null || !Array.isArray((v as Record<string, unknown>).filas)) return null
  const x = v as Record<string, unknown>
  return {
    filas: leerFilas(x.filas),
    faltan: leerFilas(x.faltan),
    supuestos: leerFilas(x.supuestos),
    optimistas: leerFilas(x.optimistas),
    listo: x.listo === true,
  }
}

function leerRamo(v: unknown): Ramo {
  if (typeof v !== 'object' || v === null) return { estado: 'desconocido' }
  const x = v as Record<string, unknown>
  if (x.estado === 'disponible' && typeof x.id === 'string' && typeof x.nombre === 'string') {
    return { estado: 'disponible', id: x.id, nombre: x.nombre }
  }
  if (x.estado === 'ausente') {
    return {
      estado: 'ausente',
      ramos: Array.isArray(x.ramos) ? x.ramos.filter((r): r is string => typeof r === 'string') : [],
    }
  }
  return { estado: 'desconocido' }
}

/** PURO: la respuesta HTTP → los cuatro estados. Sin red, testeable. */
export function interpretarPrecalificacionHogarRetarificar(status: number, json: unknown): RespuestaPrecalificacionHogar {
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado }
  }
  if (typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  const r = json as Record<string, unknown>

  if (r.estado === 'sin_configurar') {
    return {
      estado: 'sin_configurar',
      mensaje: cadena(r.mensaje) ?? 'Codeoscopic no está configurado en central-asegura, así que no se puede precalificar.',
    }
  }
  if (status === 404 || status === 409) {
    return {
      estado: 'no_encontrado',
      mensaje: cadena(r.mensaje) ?? 'No se ha encontrado nada con esos datos.',
    }
  }
  if (r.estado === 'error') {
    const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
    return {
      estado: 'error',
      motivo: 'asegura_error',
      mensaje: [cadena(r.mensaje), detalle].filter((s): s is string => !!s).join(' — ') || MOTIVOS_PUERTO.asegura_error,
    }
  }
  if (r.estado !== 'ok' || typeof r.polizaId !== 'string') {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  const resumen = leerResumen(r.resumen)
  if (resumen === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }

  return {
    estado: 'ok',
    pre: {
      polizaId: r.polizaId,
      etiquetaCliente: cadena(r.etiquetaCliente) ?? '',
      primaActual: numero(r.primaActual),
      catastro:
        typeof r.catastro === 'object' && r.catastro !== null
          ? {
              direccionLegible: cadena((r.catastro as Record<string, unknown>).direccionLegible),
              metrosCuadrados: numero((r.catastro as Record<string, unknown>).metrosCuadrados),
              anioConstruccion: numero((r.catastro as Record<string, unknown>).anioConstruccion),
              codigoPostal: cadena((r.catastro as Record<string, unknown>).codigoPostal),
            }
          : null,
      resumen,
      defectos: leerDefectos(r.defectos),
      vias: leerOpciones(r.vias),
      catalogos: leerCatalogos(r.catalogos),
      estadosCiviles: leerOpciones(r.estadosCiviles),
      municipios: leerOpciones(r.municipios),
      fallosCatalogo: Array.isArray(r.fallosCatalogo) ? r.fallosCatalogo.filter((s): s is string => typeof s === 'string') : [],
      ramo: leerRamo(r.ramo),
      consumo: leerConsumo(r.consumo),
    },
  }
}

// ─── Llamada ─────────────────────────────────────────────────────────────────

const TIMEOUT_PRECALIFICAR_MS = 25_000

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/**
 * La ficha entera de hogar de una póliza YA EXISTENTE. **Gratis**: al otro
 * lado es un `GET` que no pasa por el embudo de pago y corre con el
 * interruptor de tarificación apagado, igual que la precalificación de auto y
 * la de hogar-nuevo.
 *
 * `resueltos`/`correcciones` son lo que el corredor ya haya tocado en
 * pantalla: se mandan para que asegura recalcule la ficha (gratis) con ellos.
 */
export async function precalificarHogarRetarificarAsegura(entrada: {
  polizaId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Referencia catastral de 20 del piso elegido: asegura consulta el Catastro para los huecos. */
  referencia?: string
}): Promise<RespuestaPrecalificacionHogar> {
  const qs = new URLSearchParams({ polizaId: entrada.polizaId })
  if (entrada.referencia) qs.set('referencia', entrada.referencia)
  if (entrada.resueltos) qs.set('resueltos', JSON.stringify(entrada.resueltos))
  if (entrada.correcciones) qs.set('correcciones', JSON.stringify(entrada.correcciones))
  try {
    const r = await pedir(
      `/api/operador/codeoscopic/precalificar-hogar?${qs.toString()}`,
      { method: 'GET' },
      TIMEOUT_PRECALIFICAR_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarPrecalificacionHogarRetarificar(r.status, r.json)
  } catch (e) {
    return {
      estado: 'error',
      motivo: 'red',
      mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})`,
    }
  }
}

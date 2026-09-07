// El cliente del puerto de HOGAR SIN PÓLIZA («oportunidad nueva») de asegura.
//
// Hermano de `retarificar-asegura.ts` (auto y hogar CON póliza), con la misma
// disciplina de dinero: `pedir()` con Bearer, interpretadores PUROS separados
// de la llamada, y `gastoDesconocido` para no confundir un timeout con «no se
// ha gastado». La llamada que COTIZA (`cotizarHogarNuevoAsegura`) reutiliza la
// interpretación de `retarificar-asegura.ts` a propósito: el puerto redacta la
// respuesta de las dos rutas —retarificar una póliza y presupuestar una
// oportunidad nueva— con la MISMA función (`respuestaRetarificacion()` de
// asegura), así que el contrato es idéntico campo por campo y una segunda
// copia solo podría divergir sin que nada avisara.
//
// Lo que SÍ es propio de aquí es la PRECALIFICACIÓN: a diferencia de una
// póliza existente, el riesgo sale del Catastro (dirección o referencia), no
// de una ficha. `GET /api/operador/codeoscopic/precalificar-hogar-nuevo` arma
// la ficha ENTERA en asegura (Catastro + catálogos + resumen con procedencia,
// supuestos y huecos, con la MISMA función `resumen-hogar.ts` que usa su
// propia pantalla) para que plataforma no tenga que reimplementar esa lógica:
// aquí solo se interpreta y se PINTA lo que ya viene calculado.

import {
  interpretarRetarificacion,
  porFalloDeRed,
  leerConsumo,
  TIMEOUT_COTIZAR_MS,
  type RespuestaRetarificar,
  type ConsumoPuerto,
} from './retarificar-asegura.ts'
import { describirCausaAsegura, MOTIVOS_PUERTO, type MotivoPuerto } from './correduria-puerto.ts'

export type { RespuestaRetarificar, ConsumoPuerto, MotivoPuerto }
export type { Reparo, Supuesto, Precio, Fallo } from './retarificar-asegura.ts'

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
  referencia: string
  etiquetaCliente: string
  catastro: {
    direccionLegible: string | null
    metrosCuadrados: number | null
    anioConstruccion: number | null
    codigoPostal: string | null
  }
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
  /** El Catastro no tiene nada con esa referencia (o el cliente no es de esta correduría). */
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
export function interpretarPrecalificacionHogar(status: number, json: unknown): RespuestaPrecalificacionHogar {
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
  if (status === 404) {
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
  if (r.estado !== 'ok' || typeof r.referencia !== 'string') {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  const resumen = leerResumen(r.resumen)
  if (resumen === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  const catastroRaw = (typeof r.catastro === 'object' && r.catastro !== null ? r.catastro : {}) as Record<string, unknown>

  return {
    estado: 'ok',
    pre: {
      referencia: r.referencia,
      etiquetaCliente: cadena(r.etiquetaCliente) ?? '',
      catastro: {
        direccionLegible: cadena(catastroRaw.direccionLegible),
        metrosCuadrados: numero(catastroRaw.metrosCuadrados),
        anioConstruccion: numero(catastroRaw.anioConstruccion),
        codigoPostal: cadena(catastroRaw.codigoPostal),
      },
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

// ─── Llamadas ────────────────────────────────────────────────────────────────

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
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${secret}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/**
 * La ficha entera de hogar sin póliza. **Gratis**: al otro lado es un `GET`
 * que no pasa por el embudo de pago y corre con el interruptor de
 * tarificación apagado, igual que la precalificación de auto.
 *
 * `resueltos`/`correcciones` son lo que el corredor ya haya tocado en
 * pantalla: se mandan para que asegura recalcule la ficha (gratis) con ellos,
 * exactamente igual que hace `retarificador-hogar.tsx` de asegura en el
 * navegador — aquí el recálculo va al servidor porque plataforma no importa
 * las funciones puras de asegura (ver la nota de duplicación al final).
 */
export async function precalificarHogarNuevoAsegura(entrada: {
  clienteId: string
  referencia: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaPrecalificacionHogar> {
  const qs = new URLSearchParams({ clienteId: entrada.clienteId, referencia: entrada.referencia })
  if (entrada.resueltos) qs.set('resueltos', JSON.stringify(entrada.resueltos))
  if (entrada.correcciones) qs.set('correcciones', JSON.stringify(entrada.correcciones))
  try {
    const r = await pedir(
      `/api/operador/codeoscopic/precalificar-hogar-nuevo?${qs.toString()}`,
      { method: 'GET' },
      TIMEOUT_PRECALIFICAR_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarPrecalificacionHogar(r.status, r.json)
  } catch (e) {
    return {
      estado: 'error',
      motivo: 'red',
      mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})`,
    }
  }
}

/**
 * 🚨 **LA LLAMADA QUE CUESTA 0,50€ REALES.** Reutiliza `interpretarRetarificacion`
 * y `porFalloDeRed` de `retarificar-asegura.ts`: el puerto de asegura redacta la
 * respuesta de esta ruta con la MISMA función que la de retarificar una póliza
 * (`respuestaRetarificacion()`), así que el contrato es idéntico campo por
 * campo — una segunda copia del intérprete solo podría divergir sin avisar.
 *
 * `confirmado: true` va SIEMPRE, el booleano exacto, y se manda desde aquí (el
 * servidor) y no desde el navegador — mismo cerrojo que la retarificación de
 * una póliza, mismo motivo: el navegador no tiene el Bearer del puerto.
 *
 * 🚫 **No reintenta.** `POST /insurances` no es idempotente: repetir crea otro
 * proyecto y otro cargo.
 */
export async function cotizarHogarNuevoAsegura(entrada: {
  clienteId: string
  referencia: string
  solicitadoPor?: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/hogar-nuevo',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clienteId: entrada.clienteId,
          referencia: entrada.referencia,
          // 🚨 El booleano exacto. No `'true'`, no `1`: el puerto compara con `===`.
          confirmado: true,
          solicitadoPor: entrada.solicitadoPor ?? 'plataforma',
          ...(entrada.resueltos ? { resueltos: entrada.resueltos } : {}),
          ...(entrada.correcciones ? { correcciones: entrada.correcciones } : {}),
        }),
      },
      TIMEOUT_COTIZAR_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje:
          'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET). No se ha llamado a Codeoscopic.',
      }
    }
    return interpretarRetarificacion(r.status, r.json)
  } catch (e) {
    return porFalloDeRed(e)
  }
}

// ─── Nota sobre los tipos duplicados ─────────────────────────────────────────
//
// `Fila`/`ResumenHogar`/`Ramo` existen también en `apps/asegura/lib/codeoscopic/
// resumen-hogar.ts` y `catalogos.ts`. Duplicados a propósito, mismo motivo que
// el resto del puerto (ver el final de `retarificar-asegura.ts`): las dos apps
// se hablan por HTTP y por nada más. `Reparo`/`Supuesto`/`Precio`/`Fallo` SÍ se
// reexportan de `retarificar-asegura.ts` porque son el mismo contrato exacto
// (la misma función de asegura redacta las dos respuestas de cotización).

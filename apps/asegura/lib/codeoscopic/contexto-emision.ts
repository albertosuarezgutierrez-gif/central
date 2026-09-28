// De quién es un proyecto que se va a emitir, y qué se acuña — 28/09/2026.
//
// Diseño aprobado por Alberto (opción «a» del arquitecto): un proyecto de
// Codeoscopic se emite por UNO de dos caminos, y este fichero decide cuál sin
// tocar BD ni red (lo usa `app/api/operador/codeoscopic/emitir/route.ts` y lo
// prueba `contexto-emision.test.ts`):
//
//   · SUSTITUCIÓN (el de siempre): el proyecto tiene `poliza_id` → es la
//     retarificación de esa póliza. Cliente, ramo, riesgo y fraccionamiento
//     salen de ella, y la nueva la sustituye (`polizaOrigenId`).
//   · NUEVO: sin póliza, pero con `cliente_id` + `tarificacion_id` (los graba
//     `/oferta` desde la tarificación) → cliente sin póliza previa en cartera.
//     Ramo y riesgo salen de la TARIFICACIÓN y la póliza se acuña con
//     `polizaOrigenId = null`: no sustituye a nada, así que no se abre ninguna baja.
//   · Sin ninguna de las dos cosas → el 409 de siempre: no se sabe de quién es.
//
// Lo que ya toleraba `null` y por eso no se toca: `registrarPolizaEmitida`
// (lib/emision.ts), `trasEmision` (solo abre baja si hay origen),
// `cuentaDeFicha(corr, null, clienteId)`, `valoresPersonaDesdeFicha` y el candado
// por proyecto de `emitir-envio.ts`.

import { encryptField } from '@central/module-seguros-pii'
import { normalizarMatricula } from './importar.ts'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * Lista blanca del enum `seguros.tipo_seguro` (DDL + `2026-09-09_tipo_seguro_accidentes.sql`)
 * para `tarificaciones.ramo`, que es TEXTO libre. `otros` se queda fuera a
 * propósito: es el valor de cajón del enum, y un proyecto emitido como «otros»
 * sería un «no lo sé» con forma de dato. Lo que no mapea devuelve `null` y quien
 * llama corta con 422 — nunca se cae a `'auto'`.
 */
const TIPOS_EMITIBLES = [
  'auto',
  'moto',
  'hogar',
  'vida',
  'salud',
  'decesos',
  'responsabilidad_civil',
  'comercio',
  'comunidades',
  'accidentes',
] as const
export type TipoEmitible = (typeof TIPOS_EMITIBLES)[number]

export function tipoDeRamo(ramo: unknown): TipoEmitible | null {
  const r = str(ramo)?.toLowerCase() ?? null
  return r !== null && (TIPOS_EMITIBLES as readonly string[]).includes(r) ? (r as TipoEmitible) : null
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * El riesgo que se guarda en `polizas.datos_especificos` de una póliza NUEVA,
 * leído de la petición que viajó al vendor (`tarificaciones.peticion`). Las claves
 * son las que ya lee la cartera (`matricula`, `fechaMatriculacion`, `cp`,
 * `referenciaCatastral`, `metrosCuadrados`, `anioConstruccion`, `direccion`).
 *
 * - Un dato que no tiene forma válida se OMITE, nunca se inventa ni se rellena.
 * - 🚨 La dirección del riesgo va CIFRADA (`encryptField`), como en el resto de
 *   la cartera. Si el cifrado no produce un `v1:` —sin `PII_ENCRYPTION_KEY`
 *   `encryptField` devuelve el texto TAL CUAL— o lanza, la dirección se omite:
 *   jamás se guarda en claro.
 * - `null` = no hay nada que guardar (ramos de personas, o petición vacía).
 */
export function riesgoDeTarificacion(
  ramo: string | null,
  peticion: unknown,
  cifrar: (texto: string) => string = encryptField,
): Record<string, unknown> | null {
  const tipo = tipoDeRamo(ramo)
  const riesgo = obj(obj(peticion).risk)
  const out: Record<string, unknown> = {}

  if (tipo === 'auto' || tipo === 'moto') {
    const matricula = normalizarMatricula(riesgo.registrationPlate)
    if (matricula) out.matricula = matricula
    const fecha = str(riesgo.registrationDate)
    if (fecha && RE_FECHA.test(fecha)) out.fechaMatriculacion = fecha
  } else if (tipo === 'hogar') {
    const dir = obj(riesgo.address)
    const cp = str(dir.postalCode)
    if (cp && /^\d{5}$/.test(cp)) out.cp = cp
    const rc = (str(dir.cadastralReference) ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    if (rc.length === 20 || rc.length === 14) out.referenciaCatastral = rc
    const m2 = typeof riesgo.floorArea === 'number' ? riesgo.floorArea : Number(riesgo.floorArea)
    if (Number.isFinite(m2) && m2 > 0) out.metrosCuadrados = Math.round(m2)
    const anio = typeof riesgo.yearBuilt === 'number' ? riesgo.yearBuilt : Number(riesgo.yearBuilt)
    if (Number.isInteger(anio) && anio >= 1500 && anio <= new Date().getUTCFullYear() + 1) out.anioConstruccion = anio
    const direccion = direccionEnClaro(dir)
    if (direccion) {
      const cifrada = cifrarSinFugas(direccion, cifrar)
      if (cifrada) out.direccion = cifrada
    }
  }

  return Object.keys(out).length > 0 ? out : null
}

/** `Calle San Vicente, 40 2º-14` a partir de `address`. Sin nombre de vía no hay dirección. */
function direccionEnClaro(dir: Json): string | null {
  const nombre = str(dir.roadName)
  if (!nombre) return null
  const tipoVia = str(obj(dir.roadType).id)
  const numero = str(typeof dir.roadNumber === 'number' ? String(dir.roadNumber) : dir.roadNumber)
  const planta = str(dir.floor)
  const puerta = str(dir.door)
  let s = `${tipoVia ? `${tipoVia} ` : ''}${nombre}`
  if (numero) s += `, ${numero}`
  if (planta) s += ` ${planta}`
  if (puerta) s += `${planta ? '-' : ' '}${puerta}`
  return s
}

function cifrarSinFugas(texto: string, cifrar: (t: string) => string): string | null {
  try {
    const c = cifrar(texto)
    return typeof c === 'string' && c.startsWith('v1:') && !c.includes(texto) ? c : null
  } catch {
    return null
  }
}

// ── El contexto de emisión ──────────────────────────────────────────────────

export type ProyectoParaEmitir = {
  polizaId: string | null
  clienteId: string | null
  tarificacionId: string | null
}

/** La póliza enlazada (camino de SUSTITUCIÓN), leída con correduría y cliente no fusionado. */
export type PolizaParaEmitir = {
  clienteId: string
  tipo: string
  fraccionamiento: string | null
  datosEspecificos: unknown
  dniLookupHash: string | null
  sustituida: boolean
}

/** La tarificación del proyecto (camino NUEVO), leída con correduría y no simulada. */
export type TarificacionParaEmitir = {
  clienteId: string | null
  ramo: string | null
  peticion: unknown
  /**
   * `tarificaciones.poliza_id`: la póliza que esta cotización retarificaba. Si NO es
   * null, el proyecto no es negocio nuevo aunque haya perdido su `poliza_id` (ver
   * `proyecto_liberado` en `resolverContextoEmision`). Obligatorio a propósito: quien
   * llama tiene que leerlo, no puede olvidarse.
   */
  polizaId: string | null
}

/** La ficha del cliente del proyecto (camino NUEVO), leída con correduría y no fusionada. */
export type FichaParaEmitir = {
  clienteId: string
  dniLookupHash: string | null
}

export type ContextoEmision = {
  modo: 'sustitucion' | 'nuevo'
  clienteId: string
  tipo: string
  riesgo: Record<string, unknown> | null
  /** La póliza que se sustituye; `null` en modo nuevo (no se abre ninguna baja). */
  polizaOrigenId: string | null
  /** Fraccionamiento de respaldo si la oferta no lo trae: el de la vieja, o `null` (nunca «anual» inventado). */
  fraccionamientoBase: string | null
  sustituida: boolean
  /** Índice ciego del DNI de la ficha del tomador: contra él se compara el del proyecto. */
  dniLookupHash: string | null
}

export type ResultadoContexto =
  | { ok: true; ctx: ContextoEmision }
  | { ok: false; status: 404 | 409 | 422; causa: string; mensaje: string }

export function resolverContextoEmision(e: {
  proyecto: ProyectoParaEmitir
  poliza: PolizaParaEmitir | null
  tarificacion: TarificacionParaEmitir | null
  ficha?: FichaParaEmitir | null
  /**
   * Solo en sustitución y solo cuando `poliza` no se ha podido leer: `true` si la póliza
   * existe pero su tomador está fusionado en otra ficha (`merged_into_cliente_id`). Así el
   * 404 dice la causa de verdad en vez de «la póliza ya no existe».
   */
  polizaTomadorFusionado?: boolean
  cifrar?: (texto: string) => string
}): ResultadoContexto {
  const { proyecto, poliza } = e

  if (proyecto.polizaId) {
    if (!poliza) {
      if (e.polizaTomadorFusionado === true) {
        return {
          ok: false,
          status: 404,
          causa: 'tomador_fusionado',
          mensaje: 'el tomador de esta póliza se fusionó en otra ficha: retarifica desde la ficha buena',
        }
      }
      return { ok: false, status: 404, causa: 'otro', mensaje: 'la póliza enlazada a este proyecto ya no existe' }
    }
    if (proyecto.clienteId && proyecto.clienteId !== poliza.clienteId) {
      return {
        ok: false,
        status: 409,
        causa: 'cliente_distinto',
        mensaje:
          'la póliza enlazada a este proyecto es de OTRO cliente que el de la tarificación: no se emite ' +
          '(sería el contrato de una persona colgado de la póliza de otra).',
      }
    }
    return {
      ok: true,
      ctx: {
        modo: 'sustitucion',
        clienteId: poliza.clienteId,
        tipo: poliza.tipo,
        riesgo: esObjeto(poliza.datosEspecificos) ? poliza.datosEspecificos : null,
        polizaOrigenId: proyecto.polizaId,
        fraccionamientoBase: poliza.fraccionamiento,
        sustituida: poliza.sustituida,
        dniLookupHash: poliza.dniLookupHash,
      },
    }
  }

  if (proyecto.clienteId && proyecto.tarificacionId) {
    const t = e.tarificacion
    if (!t) {
      return {
        ok: false,
        status: 404,
        causa: 'otro',
        mensaje: 'la tarificación de este proyecto no se encuentra en esta correduría (o es simulada)',
      }
    }
    // 🚨 Proyecto LIBERADO (28/09/2026): `/oferta` e `/importar` ponen a null el
    // `poliza_id` de los demás proyectos no emitidos de una póliza cuando otro la
    // retarifica. Ese proyecto se queda con cliente + tarificación y parecería negocio
    // nuevo; emitirlo acuñaría una póliza SIN baja de la anterior (doble seguro). La
    // tarificación recuerda de qué póliza venía: si la tiene, no es nuevo.
    if (t.polizaId) {
      return {
        ok: false,
        status: 409,
        causa: 'proyecto_liberado',
        mensaje:
          'esta cotización era la retarificación de una póliza y ahora la retarifica otro proyecto: ' +
          'vuelve a confirmar la oferta desde la póliza',
      }
    }
    if (t.clienteId && t.clienteId !== proyecto.clienteId) {
      return {
        ok: false,
        status: 409,
        causa: 'cliente_distinto',
        mensaje: 'la tarificación de este proyecto es de otro cliente que el del proyecto: no se emite',
      }
    }
    const ficha = e.ficha ?? null
    if (!ficha) {
      return {
        ok: false,
        status: 404,
        causa: 'otro',
        mensaje: 'el cliente de este proyecto no existe en esta correduría (o su ficha está fusionada en otra)',
      }
    }
    if (ficha.clienteId !== proyecto.clienteId) {
      return { ok: false, status: 409, causa: 'cliente_distinto', mensaje: 'la ficha leída no es la del cliente del proyecto' }
    }
    const tipo = tipoDeRamo(t.ramo)
    if (!tipo) {
      return {
        ok: false,
        status: 422,
        causa: 'ramo_desconocido',
        mensaje: `el ramo de la tarificación («${t.ramo ?? 'sin ramo'}») no es un tipo de póliza emitible`,
      }
    }
    return {
      ok: true,
      ctx: {
        modo: 'nuevo',
        clienteId: proyecto.clienteId,
        tipo,
        riesgo: riesgoDeTarificacion(tipo, t.peticion, e.cifrar),
        polizaOrigenId: null,
        fraccionamientoBase: null,
        sustituida: false,
        dniLookupHash: ficha.dniLookupHash,
      },
    }
  }

  return {
    ok: false,
    status: 409,
    causa: 'otro',
    mensaje: 'este proyecto no está enlazado a ninguna póliza de la cartera: no se sabe de quién es',
  }
}

// ── Guardas del modo NUEVO ──────────────────────────────────────────────────

/** Interruptor propio del modo nuevo: fail-closed, solo `'1'` lo enciende. */
export function emisionNuevoActiva(env: Record<string, string | undefined> = process.env): boolean {
  return env.CODEOSCOPIC_EMISION_NUEVO?.trim() === '1'
}

/**
 * Identidad FAIL-CLOSED: en modo nuevo no hay una póliza previa que ancle quién
 * es el cliente, así que el DNI del tomador del proyecto TIENE que coincidir con
 * el índice ciego de la ficha — y los dos tienen que existir. Sin dato en un
 * lado no se afirma nada y no se emite (en sustitución, en cambio, solo corta
 * si los dos existen y difieren: ahí la póliza ya prueba de quién es).
 * Devuelve el mensaje del corte, o `null` si pasa.
 */
export function corteIdentidadNuevo(hashTomador: string | null, hashFicha: string | null): string | null {
  if (!hashFicha) {
    return 'la ficha del cliente no tiene DNI: en un cliente nuevo no se emite sin poder comprobar quién es el tomador'
  }
  if (!hashTomador) {
    return 'no se ha podido leer el DNI del tomador del proyecto en Codeoscopic: sin él no se comprueba la identidad y no se emite'
  }
  if (hashTomador !== hashFicha) {
    return 'el DNI del tomador del proyecto no es el de la ficha del cliente: no se emite'
  }
  return null
}

// ── Duplicado del modo NUEVO ────────────────────────────────────────────────

/** Póliza en vigor con la misma matrícula en CUALQUIER ficha de la correduría. */
export type PolizaMismaMatricula = { id: string; numeroPoliza: string | null; mismoCliente: boolean }

export type Duplicado = { causa: 'ya_en_cartera' | 'ya_emitido'; mensaje: string; polizas?: string[] }

/** `••••1186`: basta para que el corredor la reconozca, no identifica a nadie. */
export function enmascararNumeroPoliza(n: string | null): string | null {
  const limpio = (n ?? '').replace(/\s+/g, '')
  if (!limpio) return null
  return `••••${limpio.length > 4 ? limpio.slice(-4) : ''}`
}

/**
 * Decide si un proyecto NUEVO es un duplicado. En auto/moto con matrícula se miran
 * SIEMPRE las dos cosas —póliza en vigor con esa matrícula en toda la correduría Y
 * proyecto `emitida` reciente del cliente y ramo— porque un nuevo que acabó
 * `emitido_sin_acunar` no deja póliza en cartera. Sin matrícula (u otro ramo) solo
 * cuenta el proyecto reciente: `mismaMatricula` tiene que llegar vacío.
 *
 * De una póliza de OTRA ficha solo se dice que existe, su id y su número enmascarado:
 * nada de esa persona.
 */
export function decidirDuplicadoNuevo(e: {
  tipo: string
  matricula: string | null
  mismaMatricula: PolizaMismaMatricula[]
  proyectosRecientes: string[]
}): Duplicado | null {
  const motor = (e.tipo === 'auto' || e.tipo === 'moto') && !!e.matricula
  const partes: string[] = []
  let causa: Duplicado['causa'] | null = null
  let polizas: string[] | undefined

  if (motor && e.mismaMatricula.length > 0) {
    causa = 'ya_en_cartera'
    polizas = e.mismaMatricula.map((m) => m.id)
    const propias = e.mismaMatricula.filter((m) => m.mismoCliente)
    const ajenas = e.mismaMatricula.filter((m) => !m.mismoCliente)
    if (propias.length > 0) {
      const n = propias[0].numeroPoliza
      partes.push(
        `Este cliente ya tiene en vigor ${propias.length === 1 ? 'una póliza' : `${propias.length} pólizas`} de la matrícula ${e.matricula}` +
          `${n ? ` (nº ${n})` : ''}: emite desde esa póliza para que se tramite la baja.`,
      )
    }
    if (ajenas.length > 0) {
      const n = enmascararNumeroPoliza(ajenas[0].numeroPoliza)
      partes.push(
        `La matrícula ${e.matricula} ya está asegurada en OTRA ficha de la cartera ` +
          `(${ajenas.length === 1 ? 'póliza' : `${ajenas.length} pólizas, la primera`} ${n ?? `id ${ajenas[0].id}`}): ` +
          'comprueba si es el mismo vehículo antes de emitir.',
      )
    }
  }
  if (e.proyectosRecientes.length > 0) {
    causa ??= 'ya_emitido'
    partes.push(
      `A este cliente ya se le emitió otra póliza de ${e.tipo} por Codeoscopic en los últimos 30 días ` +
        `(proyecto ${e.proyectosRecientes[0]}): puede ser un duplicado.`,
    )
  }
  if (!causa) return null
  return { causa, mensaje: partes.join(' '), ...(polizas ? { polizas } : {}) }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

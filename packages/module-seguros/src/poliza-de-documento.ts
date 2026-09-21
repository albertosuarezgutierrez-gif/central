// Una póliza que llega DIRECTAMENTE al corredor (WhatsApp, correo, en mano) y
// que sube él mismo desde la pantalla de leer documentos.
//
// ─── Qué es, y sobre todo qué NO es ─────────────────────────────────────────
//
// Es **el mismo dato que un cliente declara en el portal**, entrando por otra
// puerta: la póliza que esa persona tiene HOY, con su compañía, su prima y su
// vencimiento. Por eso aterriza en `seguros.portal_poliza_declarada`
// (`procedencia: 'documento'`) y NO en `seguros.polizas`.
//
// 🚨 Escribirla en `seguros.polizas` sería el error caro, por dos motivos que
// se acumulan:
//   1. Una fila ahí con `import_ref` a NULL **es cartera viva** para
//      `esCarteraViva()` — o sea, contaría como póliza mediada por la casa y
//      como cliente. Las 110 vivas dejarían de significar lo que significan.
//   2. La ingesta de CIMA empareja por número de póliza + nombre de compañía y
//      **pisa**. Una póliza que el corredor aún no ha mediado, guardada con su
//      número real, es exactamente la fila con la que un pull futuro colisiona.
//      Y la compañía del documento no dice nada: el corredor trabaja con varias
//      y puede recolocar esa póliza en cualquier otra.
//
// ─── Lo que este módulo decide, y lo que se niega a decidir ─────────────────
//
// Decide el mapeo de lo leído a los dos destinos (ficha y póliza declarada).
// **No inventa lo que el documento no trae**: cada hueco sale como `null` y,
// cuando ese hueco cambia lo que el corredor puede hacer después, sale además
// como un AVISO con nombre. Un `null` silencioso aquí se pintaría luego como
// «esta póliza no tiene vencimiento», que es una afirmación, no una ausencia.

import { MARCADORES_SIN_DATO } from './documento-auto.ts'

const SIN_DATO = new Set(MARCADORES_SIN_DATO)

export type TipoLecturaDocumento = 'auto' | 'hogar' | 'contrato_solo'

/** Lo que devuelve el lector de pólizas, sin tocar. */
export type LecturaPoliza = {
  ramo: string | null
  tipoLectura: TipoLecturaDocumento
  datos: Record<string, string | number | null>
}

/**
 * Por qué el corredor tendrá que mirar antes de guardar. Cada uno cambia algo
 * que puede hacer después, así que ninguno se calla:
 *
 * - `sin_nombre`     → no hay a quién abrirle ficha. Bloquea el alta.
 * - `sin_dni`        → la ficha se casará por teléfono/email o por nada. El DNI
 *                      es lo único que identifica a una persona: dos parientes
 *                      homónimos se funden sin él.
 * - `nombre_partido` → el corte nombre/apellidos lo ha hecho una heurística
 *                      sobre un texto corrido, no el documento.
 * - `sin_vencimiento`→ es el dato por el que se sube la póliza: sin él no se
 *                      sabe cuándo entrar, y no habrá aviso que dispare.
 * - `sin_compania` / `sin_numero` → no se podrá cotejar contra la cartera para
 *                      saber si esa póliza ya la lleva la casa.
 */
export type AvisoDocumento =
  | 'sin_nombre'
  | 'sin_dni'
  | 'nombre_partido'
  | 'sin_vencimiento'
  | 'sin_compania'
  | 'sin_numero'

export type TipoPersonaDocumento = 'fisica' | 'juridica'

export type AltaDesdeDocumento = {
  nombre: string
  apellidos: string
  dni: string | null
  tipoPersona: TipoPersonaDocumento
  fechaNacimiento: string | null
  /** El canal: llegó directamente al corredor, no por un formulario. */
  fuente: 'venta_directa'
}

export type DeclaradaDesdeDocumento = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  /** `aaaa-mm-dd`, tal y como lo normaliza el lector. */
  fechaVencimiento: string | null
  matricula: string | null
  fechaMatriculacion: string | null
  referenciaCatastral: string | null
  /** Todo lo demás que se leyó, sin perder nada: es lo que se le enseña luego. */
  datosRamo: Record<string, string | number> | null
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || SIN_DATO.has(t.toLowerCase())) return null
  return t
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Formas societarias que hacen que un tomador NO sea una persona. La lista es
 * corta a propósito: ante la duda se dice `fisica`, que es lo que hace que el
 * nombre se parta — y partir mal un nombre se ve en pantalla, mientras que dar
 * una empresa por persona se cuela entero.
 */
const FORMAS_SOCIETARIAS =
  /\b(s\.?l\.?u?\.?|s\.?a\.?u?\.?|s\.?c\.?|s\.?coop\.?|c\.?b\.?|a\.?i\.?e\.?|sociedad|asociacion|asociación|comunidad|fundacion|fundación|ayuntamiento)\b/i

export function tipoPersonaDeNombre(nombre: string): TipoPersonaDocumento {
  return FORMAS_SOCIETARIAS.test(nombre) ? 'juridica' : 'fisica'
}

/**
 * Parte «MARIA DEL CARMEN LOPEZ RUIZ» en nombre y apellidos. Es una HEURÍSTICA
 * (un documento trae el tomador en un solo campo), así que quien la use está
 * obligado a enseñar el resultado antes de guardarlo: el aviso `nombre_partido`
 * existe para eso. Las partículas se pegan a lo que siguen, que es como se
 * escriben los nombres compuestos en español.
 */
export function partirNombre(completo: string): { nombre: string; apellidos: string } {
  const limpio = completo.replace(/\s+/g, ' ').trim()
  if (!limpio) return { nombre: '', apellidos: '' }
  // Un nombre con coma viene ya partido por el documento: «LOPEZ RUIZ, MARIA».
  const coma = limpio.indexOf(',')
  if (coma > 0) {
    return {
      nombre: limpio.slice(coma + 1).trim(),
      apellidos: limpio.slice(0, coma).trim(),
    }
  }
  const trozos = limpio.split(' ')
  if (trozos.length === 1) return { nombre: trozos[0]!, apellidos: '' }
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'van', 'von'])
  // El nombre son los tokens hasta el primero que empieza apellido: con 2 o 3
  // tokens, uno; con 4 o más, dos (el compuesto típico: «Juan Carlos Pérez Gil»).
  let corte = trozos.length >= 4 ? 2 : 1
  // Una partícula NUNCA cierra el nombre: si el corte cae justo detrás de una
  // («María del | Carmen de la Rosa»), el compuesto sigue y el corte avanza.
  while (corte < trozos.length - 1 && PARTICULAS.has(trozos[corte - 1]!.toLowerCase())) corte++
  return {
    nombre: trozos.slice(0, corte).join(' '),
    apellidos: trozos.slice(corte).join(' '),
  }
}

/**
 * La ficha que se abriría con lo leído. `alta: null` cuando el documento no
 * trae tomador: sin nombre no hay ficha, y **inventarse uno** («Titular del
 * documento», el número de póliza…) crearía una persona que no existe.
 */
export function prepararAltaDesdeDocumento(l: LecturaPoliza): {
  alta: AltaDesdeDocumento | null
  avisos: AvisoDocumento[]
} {
  const avisos: AvisoDocumento[] = []
  const tomador = texto(l.datos.tomador)
  const dni = texto(l.datos.dni)
  if (!dni) avisos.push('sin_dni')
  if (!tomador) {
    avisos.push('sin_nombre')
    return { alta: null, avisos }
  }
  const tipoPersona = tipoPersonaDeNombre(tomador)
  if (tipoPersona === 'juridica') {
    return {
      alta: {
        nombre: tomador,
        apellidos: '',
        dni,
        tipoPersona,
        fechaNacimiento: null,
        fuente: 'venta_directa',
      },
      avisos,
    }
  }
  const { nombre, apellidos } = partirNombre(tomador)
  if (apellidos) avisos.push('nombre_partido')
  return {
    alta: {
      nombre,
      apellidos,
      dni,
      tipoPersona,
      fechaNacimiento: texto(l.datos.fechaNacimiento),
      fuente: 'venta_directa',
    },
    avisos,
  }
}

/** Campos de la lectura que ya tienen columna propia y no se repiten en `datosRamo`. */
const CON_COLUMNA_PROPIA = new Set([
  'compania',
  'numeroPoliza',
  'primaAnual',
  'fechaVencimiento',
  'matricula',
  'fechaMatriculacion',
  'referenciaCatastral',
  'tomador',
  'dni',
])

/**
 * La póliza declarada. Lo que no tiene columna propia (marca, modelo, capital
 * de continente, años sin siniestros…) va entero a `datosRamo`: se lee del
 * documento una vez y no se vuelve a tener.
 *
 * `datosRamo: null` cuando no quedó nada, que **no es** `{}` («se miró y el
 * documento no traía más»).
 */
export function prepararDeclaradaDesdeDocumento(l: LecturaPoliza): {
  declarada: DeclaradaDesdeDocumento
  avisos: AvisoDocumento[]
} {
  const avisos: AvisoDocumento[] = []
  const compania = texto(l.datos.compania)
  const numeroPoliza = texto(l.datos.numeroPoliza)
  const fechaVencimiento = texto(l.datos.fechaVencimiento)
  if (!compania) avisos.push('sin_compania')
  if (!numeroPoliza) avisos.push('sin_numero')
  if (!fechaVencimiento) avisos.push('sin_vencimiento')

  const resto: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(l.datos)) {
    if (CON_COLUMNA_PROPIA.has(k)) continue
    const t = typeof v === 'number' ? numero(v) : texto(v)
    if (t !== null) resto[k] = t
  }

  return {
    declarada: {
      compania,
      numeroPoliza,
      ramo: texto(l.ramo),
      primaAnual: numero(l.datos.primaAnual),
      fechaVencimiento,
      matricula: texto(l.datos.matricula),
      fechaMatriculacion: texto(l.datos.fechaMatriculacion),
      referenciaCatastral: texto(l.datos.referenciaCatastral),
      datosRamo: Object.keys(resto).length > 0 ? resto : null,
    },
    avisos,
  }
}

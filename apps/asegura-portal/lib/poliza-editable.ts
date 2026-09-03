// Normalización del PARCHE con el que el cliente corrige a mano una póliza que
// él mismo subió. Módulo PURO a propósito (ni Prisma ni Next): lo que se decide
// aquí es qué es un dato y qué es basura, y eso tiene que poder testearse sin BD.
//
// Las tres reglas que justifican que esto exista:
//
//  1. Cadena vacía NO es un dato: es el usuario BORRANDO el campo. Guardarla como
//     `''` deja una compañía que «existe» y se llama nada — un `NULL` disfrazado
//     de valor, que es justo lo que se cuela por todas las guardas basadas en
//     NULL (`??`, `COALESCE`, `IS NULL`). Se normaliza a `null`.
//  2. Clave AUSENTE ≠ clave a `null`. Ausente = «no lo toques»; `null` = «bórralo».
//     Es la diferencia entre un PATCH y un reemplazo, y sin ella una pantalla que
//     manda solo el campo editado borraría todos los demás.
//  3. Una fecha IMPOSIBLE es peor que ninguna fecha: sobre `fechaVencimiento` se
//     manda un aviso de renovación. Un `2026-02-31` que JS «arregla» solo a
//     2026-03-03, o un 1970 tecleado de más, produce un aviso falso que el
//     cliente sí lee. Se rechaza en la puerta.

/** Campos que el cliente puede corregir. `null` = borrar el dato; ausente = no tocarlo. */
export type ParchePoliza = {
  compania?: string | null
  numeroPoliza?: string | null
  ramo?: string | null
  primaAnual?: number | null
  fechaVencimiento?: Date | null
}

export type ResultadoParche =
  | { ok: true; parche: ParchePoliza }
  | { ok: false; error: string }

/** Campos de texto libre, en el orden en que se pintan en la ficha. */
const CAMPOS_TEXTO = ['compania', 'numeroPoliza', 'ramo'] as const

/** Longitud máxima de un campo de texto: por encima de esto no es un dato, es un pegado. */
const MAX_TEXTO = 200

/** Año mínimo admisible para un vencimiento. Por debajo, es un tecleo, no una póliza. */
export const ANIO_MINIMO = 1990

/** Horizonte máximo: 50 años vista. Una póliza que vence en 2200 no existe. */
export const ANIOS_MAXIMOS_VISTA = 50

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Convierte `YYYY-MM-DD` en un `Date` a medianoche UTC, o devuelve el motivo del
 * rechazo. Se exige el formato EXACTO (nada de `new Date(string)`, que acepta
 * casi cualquier cosa y adivina zona horaria) y se comprueba que la fecha EXISTE:
 * `Date.UTC(2026, 1, 31)` no falla, desborda a marzo. Se reconstruye y se compara.
 */
export function parsearFechaISO(valor: string, hoy: Date = new Date()): { ok: true; fecha: Date } | { ok: false; error: string } {
  const m = RE_FECHA.exec(valor)
  if (!m) return { ok: false, error: 'fecha_formato' }

  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])

  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  // El desbordamiento silencioso: 2026-02-31 se convierte en 2026-03-03 sin avisar.
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return { ok: false, error: 'fecha_inexistente' }
  }

  if (anio < ANIO_MINIMO) return { ok: false, error: 'fecha_fuera_de_rango' }
  if (anio > hoy.getUTCFullYear() + ANIOS_MAXIMOS_VISTA) return { ok: false, error: 'fecha_fuera_de_rango' }

  return { ok: true, fecha }
}

/** `''` y `'   '` son un borrado, no un valor. */
function normalizarTexto(valor: unknown): { ok: true; valor: string | null } | { ok: false; error: string } {
  if (valor === null) return { ok: true, valor: null }
  if (typeof valor !== 'string') return { ok: false, error: 'tipo_invalido' }
  const limpio = valor.trim()
  if (limpio === '') return { ok: true, valor: null }
  if (limpio.length > MAX_TEXTO) return { ok: false, error: 'texto_largo' }
  return { ok: true, valor: limpio }
}

/** Prima: número finito >= 0. Se acepta string numérica (los `<input>` mandan texto). */
function normalizarPrima(valor: unknown): { ok: true; valor: number | null } | { ok: false; error: string } {
  if (valor === null) return { ok: true, valor: null }

  let n: number
  if (typeof valor === 'number') {
    n = valor
  } else if (typeof valor === 'string') {
    const limpio = valor.trim()
    if (limpio === '') return { ok: true, valor: null }
    // `Number('')` es 0 y `Number('12abc')` es NaN: el vacío ya está descartado
    // arriba, así que aquí NaN significa de verdad «no es un número».
    n = Number(limpio.replace(',', '.'))
  } else {
    return { ok: false, error: 'prima_invalida' }
  }

  // Cubre NaN e Infinity de una vez.
  if (!Number.isFinite(n)) return { ok: false, error: 'prima_invalida' }
  if (n < 0) return { ok: false, error: 'prima_negativa' }
  return { ok: true, valor: n }
}

/**
 * Valida y normaliza el cuerpo de un PATCH. Solo se propagan las claves conocidas
 * y presentes: cualquier otra cosa que venga en el JSON se ignora en silencio
 * (que es lo correcto — no es un error del usuario, y propagarla sí lo sería).
 */
export function normalizarParche(entrada: unknown, hoy: Date = new Date()): ResultadoParche {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { ok: false, error: 'cuerpo_invalido' }
  }

  const bruto = entrada as Record<string, unknown>
  const parche: ParchePoliza = {}

  for (const campo of CAMPOS_TEXTO) {
    // AUSENTE ≠ null: `in` distingue las dos cosas, `bruto[campo] === undefined` no.
    if (!(campo in bruto)) continue
    const valor = bruto[campo]
    if (valor === undefined) continue
    const r = normalizarTexto(valor)
    if (!r.ok) return { ok: false, error: `${campo}_${r.error}` }
    parche[campo] = r.valor
  }

  if ('primaAnual' in bruto && bruto.primaAnual !== undefined) {
    const r = normalizarPrima(bruto.primaAnual)
    if (!r.ok) return { ok: false, error: r.error }
    parche.primaAnual = r.valor
  }

  if ('fechaVencimiento' in bruto && bruto.fechaVencimiento !== undefined) {
    const valor = bruto.fechaVencimiento
    if (valor === null) {
      parche.fechaVencimiento = null
    } else if (typeof valor === 'string' && valor.trim() === '') {
      parche.fechaVencimiento = null
    } else if (typeof valor !== 'string') {
      return { ok: false, error: 'fecha_formato' }
    } else {
      const r = parsearFechaISO(valor.trim(), hoy)
      if (!r.ok) return { ok: false, error: r.error }
      parche.fechaVencimiento = r.fecha
    }
  }

  if (Object.keys(parche).length === 0) return { ok: false, error: 'parche_vacio' }

  return { ok: true, parche }
}

// ─── Alta A MANO (sin documento) ─────────────────────────────────────────────
//
// Quien tiene la póliza en papel, o no tiene el PDF a mano, declara los mismos
// cinco campos que puede corregir después. La validación es LA MISMA que la del
// PATCH —se pasa por `normalizarParche`— a propósito: un valor que se rechaza al
// editar no puede colarse al crear, y viceversa. Lo único que añade el alta:
//
//  1. Todas las claves existen en el resultado. En un alta no hay «no lo toques»:
//     lo que no se ha escrito es `null` («no lo sé»), y se guarda así.
//  2. Hace falta al menos compañía O número de póliza. Una fila con ramo y prima
//     pero sin nada que diga DE QUÉ seguro se habla no es una póliza: es ruido
//     que nadie —ni la persona ni el corredor— va a poder reconocer después.

/** Los cinco campos declarables, TODOS presentes. `null` = «no lo sé», y es válido. */
export type DatosAlta = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  fechaVencimiento: Date | null
}

export type ResultadoAlta =
  | { ok: true; datos: DatosAlta }
  | { ok: false; error: string }

/**
 * Valida y normaliza el cuerpo de un alta a mano. Reutiliza `normalizarParche`
 * para que las reglas sean una sola; un cuerpo sin ninguna clave conocida (que
 * para el PATCH es `parche_vacio`) aquí es un alta sin identificar, y se dice así.
 */
export function normalizarAlta(entrada: unknown, hoy: Date = new Date()): ResultadoAlta {
  const r = normalizarParche(entrada, hoy)
  if (!r.ok && r.error !== 'parche_vacio') return r

  const p: ParchePoliza = r.ok ? r.parche : {}
  const datos: DatosAlta = {
    compania: p.compania ?? null,
    numeroPoliza: p.numeroPoliza ?? null,
    ramo: p.ramo ?? null,
    primaAnual: p.primaAnual ?? null,
    fechaVencimiento: p.fechaVencimiento ?? null,
  }

  if (datos.compania === null && datos.numeroPoliza === null) {
    return { ok: false, error: 'sin_identificacion' }
  }

  return { ok: true, datos }
}

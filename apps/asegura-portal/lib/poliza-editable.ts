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
//  4. Aquí viven también las reglas de los IDENTIFICADORES DEL BIEN (matrícula,
//     bastidor y fecha de matriculación), y no en `lib/extraer-poliza.ts`, para
//     que la máquina que lee el PDF y la persona que lo corrige apliquen LA
//     MISMA regla. Este fichero solo importa el módulo PURO
//     `@central/module-seguros-portal`: por eso sigue pudiendo ser la fuente
//     única sin arrastrar `@central/core-ai` a media app (que es justo lo que
//     impide que `node --test` cargue `lib/extraer-poliza.ts`).
//  5. Los campos ESPECÍFICOS DEL RAMO (`datosRamo`, la columna `datos_ramo`)
//     NO se validan aquí a mano: se delegan en `normalizarDatosRamo()` del
//     catálogo (`packages/module-seguros-portal/src/campos-ramo.ts`), que es el
//     mismo que aplica la pantalla y el que aplica el extractor. Lo que sí se
//     decide aquí —y es lo delicado— es QUÉ RAMO manda al validar un parche.
//     Ver el bloque «Datos del RAMO» al final de `normalizarParche`.

import { normalizarDatosRamo, type DatosRamo } from '@central/module-seguros-portal'

/** Campos que el cliente puede corregir. `null` = borrar el dato; ausente = no tocarlo. */
export type ParchePoliza = {
  compania?: string | null
  numeroPoliza?: string | null
  ramo?: string | null
  primaAnual?: number | null
  fechaVencimiento?: Date | null
  /** Del BIEN, no del contrato. Ver la sección de identificadores más abajo. */
  matricula?: string | null
  bastidor?: string | null
  fechaMatriculacion?: Date | null
  /**
   * Campos propios del ramo, ya normalizados contra su catálogo. `null` = vaciar
   * la columna entera (la escritura lo traduce a `Prisma.DbNull`, el NULL de SQL,
   * NUNCA a `JsonNull`, que guardaría un `null` DENTRO del JSON).
   */
  datosRamo?: DatosRamo | null
}

/**
 * Lo que el llamante SABE de la póliza que se está parcheando y el parche no
 * dice. Hoy solo el ramo, y solo hace falta para una cosa: decidir contra qué
 * catálogo se validan los `datosRamo` (ver el bloque del final).
 *
 * ⚠️ La clave AUSENTE significa «no se ha consultado», que NO es lo mismo que
 * `ramoGuardado: null` («se ha mirado y la póliza no tiene ramo»). La diferencia
 * cambia el comportamiento, así que se pasa siempre que se sepa.
 */
export type OpcionesParche = {
  ramoGuardado?: string | null
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
 * Formato EXACTO y fecha que EXISTE, sin opinar sobre el rango. El rango no es
 * de la fecha: es de CADA CAMPO —un vencimiento mira al futuro y una
 * matriculación al pasado—, así que se comprueba en quien llama.
 *
 * Se exige el formato exacto (nada de `new Date(string)`, que acepta casi
 * cualquier cosa y adivina zona horaria) y se comprueba que la fecha existe:
 * `Date.UTC(2026, 1, 31)` no falla, desborda a marzo. Se reconstruye y se compara.
 */
function descomponerFechaISO(
  valor: string,
): { ok: true; fecha: Date } | { ok: false; error: 'formato' | 'inexistente' } {
  const m = RE_FECHA.exec(valor)
  if (!m) return { ok: false, error: 'formato' }

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
    return { ok: false, error: 'inexistente' }
  }

  return { ok: true, fecha }
}

/** Medianoche UTC del día de `d`. Comparar contra `new Date()` a pelo haría que
 *  «hoy» fuera futuro durante casi todo el día. */
function medianocheUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Convierte `YYYY-MM-DD` en un `Date` a medianoche UTC, o devuelve el motivo del
 * rechazo. Es la fecha de VENCIMIENTO: se rechaza lo que no puede ser el
 * vencimiento de una póliza viva (un 1970 tecleado de más, un 2200).
 */
export function parsearFechaISO(valor: string, hoy: Date = new Date()): { ok: true; fecha: Date } | { ok: false; error: string } {
  const r = descomponerFechaISO(valor)
  if (!r.ok) return { ok: false, error: r.error === 'formato' ? 'fecha_formato' : 'fecha_inexistente' }

  const anio = r.fecha.getUTCFullYear()
  if (anio < ANIO_MINIMO) return { ok: false, error: 'fecha_fuera_de_rango' }
  if (anio > hoy.getUTCFullYear() + ANIOS_MAXIMOS_VISTA) return { ok: false, error: 'fecha_fuera_de_rango' }

  return { ok: true, fecha: r.fecha }
}

// ─── Identificadores del BIEN: matrícula, bastidor (VIN) y matriculación ─────
//
// Son datos del VEHÍCULO, no del contrato; viajan dentro de la póliza declarada
// porque es donde el cliente los aporta hoy. Las reglas viven aquí por dos
// razones, y las dos importan:
//
//  1. Son LA MISMA regla para el extractor de IA (`lib/extraer-poliza.ts`) y
//     para la corrección a mano. Dos copias divergen, y entonces el portal
//     acepta al editar lo que rechazó al leer — o al revés.
//  2. La REACCIÓN sí cambia según quién habla, y ese matiz vive en la frontera:
//     · una MÁQUINA que lee mal → `null` («no lo hemos sabido leer»): la póliza
//       se guarda igual y se completa a mano;
//     · una PERSONA que teclea mal → ERROR, para que lo vea y lo corrija.
//       Anularle en silencio lo que ha escrito es peor: se cree que está guardado.
//
// 🚨 Un bastidor mal leído es PEOR que ninguno: identifica OTRO coche, y con él
// se pide precio, se retarifica y se declara un siniestro.

/**
 * Lo que un extractor —o una persona con prisa— escribe cuando NO sabe el dato.
 * Ninguno es un dato: todos significan «no se sabe», y por eso se anulan ANTES
 * de escribir. Un centinela se cuela por TODAS las guardas basadas en NULL
 * (`??`, `COALESCE`, `IS NULL`) y termina pisando dato bueno: es exactamente el
 * caso `'otro'` de `subastas.tipo_bien` que cuenta el `CLAUDE.md` de la raíz.
 * Se compara en minúsculas y recortado.
 */
export const CENTINELAS_SIN_DATO: readonly string[] = [
  '',
  '-',
  '--',
  '---',
  '–',
  '—',
  '.',
  '..',
  '...',
  '?',
  '??',
  '*',
  'n/a',
  'n.a.',
  'na',
  'nc',
  's/n',
  'sn',
  'null',
  'undefined',
  'nan',
  'none',
  'ninguno',
  'ninguna',
  'desconocido',
  'desconocida',
  'sin datos',
  'sin dato',
  'sin matricula',
  'sin matrícula',
  'sin bastidor',
  'no consta',
  'no consta en el documento',
  'no disponible',
  'no especificado',
  'no especificada',
  'no figura',
  'no encontrado',
  'no encontrada',
  'no indicado',
  'no indicada',
  'no aplica',
  'no legible',
  'ilegible',
  'pendiente',
]

const SET_CENTINELAS = new Set(CENTINELAS_SIN_DATO)

/** Lo que separa un identificador escrito a mano: espacios, guiones, puntos, barras. */
const RE_SEPARADORES = /[\s.\-–—_/]/g

/**
 * ¿Es esto un «no lo sé» disfrazado de valor? Dos criterios, y el segundo es el
 * que salva de los centinelas que nadie pone en la lista: un identificador con
 * UN SOLO carácter repetido no identifica nada — `'0000000'`, `'-----'` y,
 * peor, `'00000000000000000'` y `'XXXXXXXXXXXXXXXXX'`, que tienen 17 caracteres
 * y pasarían la forma de un VIN sin despeinarse.
 */
export function esCentinelaSinDato(valor: string): boolean {
  const limpio = valor.trim().toLowerCase()
  if (SET_CENTINELAS.has(limpio)) return true
  const compacto = limpio.replace(RE_SEPARADORES, '')
  if (compacto === '') return true
  if (compacto.length >= 2 && new Set(compacto).size === 1) return true
  return false
}

/** Mayúsculas y sin separadores. `null` si no es texto o si es un centinela. */
export function compactarIdentificador(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  if (esCentinelaSinDato(valor)) return null
  const compacto = valor.toUpperCase().replace(RE_SEPARADORES, '')
  return compacto === '' ? null : compacto
}

/**
 * Forma de un VIN (ISO 3779): 17 caracteres alfanuméricos SIN **I, O ni Q** —
 * la norma las excluye para que no se confundan con 1 y 0 al leerlas, así que
 * un bastidor con una I es una lectura equivocada, no un bastidor raro. Y 16 o
 * 18 caracteres no es «casi»: es otro número.
 *
 * ⚠️ NO se comprueba el dígito de control de la posición 9: es obligatorio en
 * Norteamérica (FMVSS 115) y NO en Europa, así que exigirlo tiraría la mayoría
 * de los bastidores reales de esta cartera. Aquí se valida FORMA, no existencia.
 */
export const RE_BASTIDOR = /^[A-HJ-NPR-Z0-9]{17}$/

export function esBastidorValido(valor: string): boolean {
  return RE_BASTIDOR.test(valor)
}

/**
 * Forma de una matrícula española ya compactada y en mayúsculas. Cubre la
 * actual (`1234BCD`), la provincial (`SE1234BC`, `M123456`) y las especiales de
 * remolque o histórico (`R1234BBB`, `H1234BCD`).
 *
 * No se exige el juego de consonantes de la matrícula moderna
 * (`BCDFGHJKLMNPRSTVWXYZ`) porque la MISMA expresión tiene que dar por buenas
 * las provinciales, donde sí hay vocales (`SE`, `A`, `O`, `MA`…). Lo que sí
 * hace es descartar la prosa: «NO CONSTA EN LA PÓLIZA» no tiene forma de
 * matrícula. Es una comprobación de FORMA, no una consulta a la DGT: dice que
 * eso PUEDE ser una matrícula, nunca que exista ni que sea de este coche.
 */
export const RE_MATRICULA = /^[A-Z]{0,3}[0-9]{3,6}[A-Z]{0,3}$/

/** Las españolas van de 5 (`B1234`, anteriores a 1971) a 9 caracteres. */
export const LONGITUD_MATRICULA = { min: 5, max: 9 } as const

export function esMatriculaValida(valor: string): boolean {
  return (
    valor.length >= LONGITUD_MATRICULA.min &&
    valor.length <= LONGITUD_MATRICULA.max &&
    RE_MATRICULA.test(valor)
  )
}

/** Matrícula normalizada, o `null` («no se sabe») si no la hay o no tiene forma de serlo. */
export function normalizarMatricula(valor: unknown): string | null {
  const compacto = compactarIdentificador(valor)
  if (compacto === null) return null
  return esMatriculaValida(compacto) ? compacto : null
}

/** Bastidor normalizado, o `null`. Ante la duda, `null`: ver el aviso de arriba. */
export function normalizarBastidor(valor: unknown): string | null {
  const compacto = compactarIdentificador(valor)
  if (compacto === null) return null
  return esBastidorValido(compacto) ? compacto : null
}

/** Antes de 1900 no hay vehículos matriculados que aseguremos: es un tecleo. */
export const ANIO_MINIMO_MATRICULACION = 1900

/**
 * La fecha de PRIMERA MATRICULACIÓN. Mira al pasado, al revés que el
 * vencimiento: un coche no se matricula mañana. Una fecha futura es un año
 * tecleado de más, o un extractor que ha leído el vencimiento de la póliza y lo
 * ha puesto aquí — y con ella el vehículo pasa a tener antigüedad negativa, que
 * es justo lo que se usa para tarificar.
 */
export function parsearFechaMatriculacion(
  valor: string,
  hoy: Date = new Date(),
): { ok: true; fecha: Date } | { ok: false; error: string } {
  const r = descomponerFechaISO(valor)
  if (!r.ok) {
    return { ok: false, error: r.error === 'formato' ? 'fecha_matriculacion_formato' : 'fecha_matriculacion_inexistente' }
  }
  if (r.fecha.getUTCFullYear() < ANIO_MINIMO_MATRICULACION) {
    return { ok: false, error: 'fecha_matriculacion_fuera_de_rango' }
  }
  if (r.fecha.getTime() > medianocheUTC(hoy).getTime()) {
    return { ok: false, error: 'fecha_matriculacion_futura' }
  }
  return { ok: true, fecha: r.fecha }
}

/** La misma regla, en la forma que necesita el extractor: `YYYY-MM-DD` o `null`. */
export function normalizarFechaMatriculacionISO(valor: unknown, hoy: Date = new Date()): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  if (esCentinelaSinDato(limpio)) return null
  const r = parsearFechaMatriculacion(limpio, hoy)
  return r.ok ? r.fecha.toISOString().slice(0, 10) : null
}

/** Lo que el extractor dice haber leído del vehículo. `null` = «no se sabe». */
export type VehiculoLeido = {
  matricula: string | null
  bastidor: string | null
  /** `YYYY-MM-DD`, para viajar igual que `fechaVencimiento` de `PolizaLeida`. */
  fechaMatriculacion: string | null
}

/** Los tres campos a «no se sabe». */
export function vehiculoLeidoVacio(): VehiculoLeido {
  return { matricula: null, bastidor: null, fechaMatriculacion: null }
}

/**
 * Normaliza lo que sea que haya devuelto el modelo. Nunca lanza: si la entrada
 * no es un objeto, los tres campos son `null`. Es el espejo de
 * `normalizarPolizaLeida()` de `@central/module-seguros-portal`, y está aquí
 * —y no allí— porque el mismo fichero tiene que servir a la corrección a mano.
 */
export function normalizarVehiculoLeido(bruto: unknown, hoy: Date = new Date()): VehiculoLeido {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return vehiculoLeidoVacio()
  const o = bruto as Record<string, unknown>
  return {
    matricula: normalizarMatricula(o.matricula),
    bastidor: normalizarBastidor(o.bastidor),
    fechaMatriculacion: normalizarFechaMatriculacionISO(o.fechaMatriculacion, hoy),
  }
}

/**
 * Los identificadores que admite el PATCH, con el error que se devuelve cuando
 * la persona escribe algo que NO tiene la forma de ese identificador.
 */
const IDENTIFICADORES_PARCHE = [
  { campo: 'matricula', normaliza: normalizarMatricula, error: 'matricula_invalida' },
  { campo: 'bastidor', normaliza: normalizarBastidor, error: 'bastidor_invalido' },
] as const

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
export function normalizarParche(
  entrada: unknown,
  hoy: Date = new Date(),
  opciones: OpcionesParche = {},
): ResultadoParche {
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

  // Identificadores del bien. Tres reacciones distintas, y ninguna es cosmética:
  //   · `null` o centinela (`'N/A'`, `'no consta'`, `'   '`) → BORRADO. La
  //     persona está diciendo «no lo sé», que es un dato legítimo.
  //   · forma incorrecta → ERROR. Un bastidor de 16 caracteres no es «casi»:
  //     identifica otro coche, y anulárselo en silencio le deja creyendo que lo
  //     ha guardado.
  for (const { campo, normaliza, error } of IDENTIFICADORES_PARCHE) {
    if (!(campo in bruto)) continue
    const valor = bruto[campo]
    if (valor === undefined) continue
    if (valor === null) {
      parche[campo] = null
      continue
    }
    if (typeof valor !== 'string') return { ok: false, error }
    if (esCentinelaSinDato(valor)) {
      parche[campo] = null
      continue
    }
    const limpio = normaliza(valor)
    if (limpio === null) return { ok: false, error }
    parche[campo] = limpio
  }

  if ('fechaMatriculacion' in bruto && bruto.fechaMatriculacion !== undefined) {
    const valor = bruto.fechaMatriculacion
    if (valor === null) {
      parche.fechaMatriculacion = null
    } else if (typeof valor !== 'string') {
      return { ok: false, error: 'fecha_matriculacion_formato' }
    } else if (esCentinelaSinDato(valor)) {
      parche.fechaMatriculacion = null
    } else {
      const r = parsearFechaMatriculacion(valor.trim(), hoy)
      if (!r.ok) return { ok: false, error: r.error }
      parche.fechaMatriculacion = r.fecha
    }
  }

  // ── Datos del RAMO: qué catálogo manda, y qué pasa al cambiar de ramo ──────
  //
  // Los campos específicos NO significan nada sin su ramo: `metrosCuadrados` es
  // de hogar y `cilindrada` de moto, y el catálogo descarta en silencio toda
  // clave que no sea del ramo con el que se valida. De ahí las tres decisiones:
  //
  //  1. **Manda el ramo que la póliza VA A TENER**, no el que tenía. Si el
  //     parche trae `ramo`, se valida contra ese; si no, contra el guardado que
  //     nos pase quien llama. Validar contra el viejo dejaría entrar datos que
  //     la pantalla del ramo nuevo no enseña nunca.
  //  2. **Si el ramo CAMBIA y no vienen datos nuevos, los viejos se BORRAN.**
  //     Los campos del ramo anterior ya no tienen catálogo: quedarse ahí es
  //     enterrarlos —invisibles en pantalla, presentes en la columna— y el día
  //     que alguien vuelva al ramo original reaparecerían como si el cliente los
  //     hubiera declarado hoy. Se prefiere perder un dato descriptivo a
  //     conservar uno que nadie puede ver ni corregir.
  //     Sin `ramoGuardado` no se puede saber si el ramo cambió de verdad, así
  //     que se toma la decisión conservadora (borrar) en vez de la que entierra.
  //  3. **Sin ramo conocido, `datosRamo` es un ERROR, no un `null` silencioso.**
  //     Es el modo de fallo que importa: quien llama al PATCH sin decir el ramo
  //     guardado estaría vaciando la columna a cada corrección de la compañía o
  //     de la prima, sin que nada fallara. Que reviente en la puerta es lo que
  //     obliga a mirarlo. (`datosRamo: null` explícito sigue siendo un borrado
  //     legítimo y no necesita ramo: borrar no exige catálogo.)
  const cambiaRamo = 'ramo' in parche
  const ramoConsultado = 'ramoGuardado' in opciones
  const ramoGuardado = opciones.ramoGuardado ?? null
  const ramoEfectivo = cambiaRamo ? (parche.ramo ?? null) : ramoGuardado

  if ('datosRamo' in bruto && bruto.datosRamo !== undefined) {
    const valor = bruto.datosRamo
    if (valor === null) {
      parche.datosRamo = null
    } else if (ramoEfectivo === null) {
      return { ok: false, error: 'datos_ramo_sin_ramo' }
    } else {
      // La validación campo a campo vive en el catálogo del módulo puro: es la
      // MISMA que aplica la pantalla y la que aplica el extractor. Un `error`
      // suyo (`campo_invalido:<id>`) viaja tal cual, para que la persona vea
      // QUÉ campo ha escrito mal en vez de un «no se ha guardado» genérico.
      const r = normalizarDatosRamo(ramoEfectivo, valor)
      if (!r.ok) return { ok: false, error: r.error }
      // `r.datos === null` cuando no sobrevive ninguna clave: es la columna
      // vacía, y se escribe como tal. Un `{}` sería un objeto que existe y no
      // dice nada, que es otro «no lo sé» disfrazado de dato.
      parche.datosRamo = r.datos
    }
  } else if (cambiaRamo && (!ramoConsultado || (parche.ramo ?? null) !== ramoGuardado)) {
    parche.datosRamo = null
  }

  if (Object.keys(parche).length === 0) return { ok: false, error: 'parche_vacio' }

  return { ok: true, parche }
}

// ─── Alta A MANO (sin documento) ─────────────────────────────────────────────
//
// Quien tiene la póliza en papel, o no tiene el PDF a mano, declara los mismos
// campos que puede corregir después. La validación es LA MISMA que la del
// PATCH —se pasa por `normalizarParche`— a propósito: un valor que se rechaza al
// editar no puede colarse al crear, y viceversa. Lo único que añade el alta:
//
//  1. Todas las claves existen en el resultado. En un alta no hay «no lo toques»:
//     lo que no se ha escrito es `null` («no lo sé»), y se guarda así.
//  2. Hace falta al menos compañía O número de póliza. Una fila con ramo y prima
//     pero sin nada que diga DE QUÉ seguro se habla no es una póliza: es ruido
//     que nadie —ni la persona ni el corredor— va a poder reconocer después.

// 🚧 La forma EXACTA de `DatosAlta` está fijada por `test/regression-portal-poliza-editable.test.ts`
// (raíz del repo), que compara el objeto entero con `deepEqual`: ampliarla y
// actualizar ese guardián van en el MISMO commit, a propósito. Si el guardián
// pudiera quedarse atrás, dejaría de vigilar justo lo que vigila — que nadie
// añada un campo al alta sin mirar qué se le está pidiendo al cliente.
//
// Los tres del VEHÍCULO entran aquí y no solo por el PATCH porque el alta a
// mano es EL sitio donde el cliente teclea la matrícula, y de la matrícula sale
// la fecha de matriculación estimada. Sin ellos en el alta, el autorrelleno no
// tendría de dónde salir hasta que el cliente corrigiera la ficha después.
//
// Y `datosRamo` entra por lo mismo: el formulario del alta es donde se despliegan
// los campos del ramo elegido, así que si no se pudieran declarar al crear, se
// pedirían dos veces (una al alta y otra al corregir) o no se pedirían nunca.
//
// 🚨 Ninguno es obligatorio, y eso no es pereza: la única guarda es que la
// póliza quede IDENTIFICADA (compañía o número). Pedirle a un cliente el
// bastidor para dejarle apuntar su seguro es trasladarle el trabajo de la
// correduría, y el formulario que no se rellena no guarda nada.

/** Los nueve campos declarables, TODOS presentes. `null` = «no lo sé», y es válido. */
export type DatosAlta = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  fechaVencimiento: Date | null
  matricula: string | null
  bastidor: string | null
  fechaMatriculacion: Date | null
  /**
   * Los campos propios del ramo, ya validados contra su catálogo. `null` = no se
   * ha declarado ninguno, que es lo normal: **ninguno es obligatorio**, igual que
   * los del vehículo. Y sin `ramo` en el alta, mandar `datosRamo` es un error
   * (`datos_ramo_sin_ramo`): no hay catálogo contra el que validarlos, y
   * guardarlos a ciegas sería guardar claves que ninguna pantalla enseña.
   */
  datosRamo: DatosRamo | null
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
  // `ramoGuardado: null` explícito y no ausente: en un alta no hay nada guardado
  // que consultar, y eso se SABE. Así el ramo que manda al validar `datosRamo`
  // es el que venga en el cuerpo, y si no viene ninguno el alta falla en la
  // puerta en vez de guardar unos datos que nadie podrá enseñar.
  const r = normalizarParche(entrada, hoy, { ramoGuardado: null })
  if (!r.ok && r.error !== 'parche_vacio') return r

  const p: ParchePoliza = r.ok ? r.parche : {}
  const datos: DatosAlta = {
    compania: p.compania ?? null,
    numeroPoliza: p.numeroPoliza ?? null,
    ramo: p.ramo ?? null,
    primaAnual: p.primaAnual ?? null,
    fechaVencimiento: p.fechaVencimiento ?? null,
    matricula: p.matricula ?? null,
    bastidor: p.bastidor ?? null,
    fechaMatriculacion: p.fechaMatriculacion ?? null,
    datosRamo: p.datosRamo ?? null,
  }

  if (datos.compania === null && datos.numeroPoliza === null) {
    return { ok: false, error: 'sin_identificacion' }
  }

  return { ok: true, datos }
}

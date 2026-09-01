/**
 * Normalización de lo que una máquina dice haber leído en una PÓLIZA DE AUTO.
 *
 * Puro: sin BD, sin red, sin proveedor de IA. Vive aquí y no en la app porque es
 * LA regla que decide si un campo existe, y esa decisión no puede depender de
 * qué modelo respondió.
 *
 * ─── Por qué es distinto del de `@central/module-seguros-portal` ────────────
 * Aquel (`poliza-leida.ts`) lee los CINCO campos que el asegurado necesita ver
 * en su bóveda. Este lee lo que hace falta para **pedir precio**: el vehículo,
 * la antigüedad con la compañía y el historial. Son propósitos distintos, así
 * que son tipos distintos — pero **la regla de qué es un dato y qué es un “no
 * lo sé” tiene que ser la MISMA**, y de eso se encarga un guardián compartido
 * (`test/regression-marcadores-sin-dato.test.ts`), no la disciplina.
 *
 * ─── La regla, entera ───────────────────────────────────────────────────────
 *  - `null` = «no se sabe». Es el estado por defecto de TODO campo.
 *  - Un valor de CAJÓN (`''`, `'desconocido'`, `'no consta'`…) es un «no lo he
 *    sabido leer» disfrazado de dato: se ANULA aquí, antes de que nadie lo
 *    escriba. Si no, se cuela por todas las guardas basadas en NULL.
 *  - Nada se inventa ni se deduce. Lo que no encaje con su forma se anula.
 *  - 🚨 **La confianza se guarda por CAMPO, no por documento.** Una póliza puede
 *    traer la matrícula clarísima y la fecha de efecto borrosa; un «85 % de
 *    confianza» del documento entero no sirve para decidir nada.
 */

/** Marcadores que los modelos escriben cuando NO han encontrado el dato. */
export const MARCADORES_SIN_DATO: readonly string[] = [
  '',
  '-',
  '--',
  '—',
  'n/a',
  'na',
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
  'no consta',
  'no disponible',
  'no especificado',
  'no especificada',
  'no encontrado',
  'no encontrada',
  'no indicado',
  'no indicada',
  'pendiente',
  '?',
]

const SET_MARCADORES = new Set(MARCADORES_SIN_DATO)

/** Lo que se puede leer de una póliza de auto. TODO puede ser `null`. */
export type AutoLeido = {
  // ── Identificación de la póliza ──
  compania: string | null
  /** Código DGS de la entidad, si el documento lo trae (lo llevan muchas). */
  codigoEntidadDgs: string | null
  numeroPoliza: string | null
  fechaEfecto: string | null
  fechaVencimiento: string | null
  primaAnual: number | null

  // ── Vehículo ──
  matricula: string | null
  marca: string | null
  modelo: string | null
  version: string | null
  fechaMatriculacion: string | null

  // ── Tomador / conductor ──
  tomador: string | null
  dni: string | null
  fechaNacimiento: string | null
  fechaCarnet: string | null

  // ── Historial (los bonificadores) ──
  aniosSinSiniestros: number | null
  /** `0` es una respuesta VÁLIDA aquí: «no hubo ninguno». No es un hueco. */
  siniestrosUltimos5: number | null
}

/** Qué campos son de PERSONA. Se tratan aparte: nunca se suponen (regla de la casa). */
export const CAMPOS_PERSONALES: readonly (keyof AutoLeido)[] = [
  'tomador',
  'dni',
  'fechaNacimiento',
  'fechaCarnet',
]

export function autoLeidoVacio(): AutoLeido {
  return {
    compania: null,
    codigoEntidadDgs: null,
    numeroPoliza: null,
    fechaEfecto: null,
    fechaVencimiento: null,
    primaAnual: null,
    matricula: null,
    marca: null,
    modelo: null,
    version: null,
    fechaMatriculacion: null,
    tomador: null,
    dni: null,
    fechaNacimiento: null,
    fechaCarnet: null,
    aniosSinSiniestros: null,
    siniestrosUltimos5: null,
  }
}

/** ¿Se ha leído ALGO? `false` = el documento no se pudo leer, no que esté vacío. */
export function seLeyoAlgo(d: AutoLeido): boolean {
  return Object.values(d).some((v) => v !== null)
}

// ─── Primitivas ──────────────────────────────────────────────────────────────

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const limpio = v.trim()
  if (SET_MARCADORES.has(limpio.toLowerCase())) return null
  return limpio === '' ? null : limpio
}

/**
 * Entero >= 0. El `0` SÍ es un dato (cero siniestros es una respuesta), así que
 * aquí no se puede usar el truco de «<= 0 es que no lo he leído» que sí vale
 * para una prima.
 */
function entero(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const t = texto(v)
    if (t === null) return null
    // 🚨 Aquí NO se puede limpiar y convertir a lo bruto. Quitar lo que no sea
    // dígito de «muchos» deja la cadena vacía, y `Number('')` es **0** — o sea,
    // «muchos siniestros» se guardaría como «CERO siniestros», que además es el
    // error en la dirección más cara. Se exige que la cadena SEA un entero.
    if (!/^\d{1,2}$/.test(t)) return null
    n = Number(t)
  } else return null
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 99) return null
  return n
}

/** Importe en euros. Una prima de 0€ no existe: es un «no lo he leído». */
function importe(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const t = texto(v)
    if (t === null) return null
    n = Number(
      t
        .replace(/[€\s]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(',', '.'),
    )
  } else return null
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** `aaaa-mm-dd` estricto: rechaza los días que `Date` «arregla» solo. */
function fechaIso(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const d = new Date(`${t}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) === t ? t : null
}

/**
 * Matrícula española, en cualquiera de sus dos formatos vivos:
 *   - actual (desde 2000): `1234ABC`
 *   - provincial anterior: `SE1234AB`, `M1234AB`…
 * Lo que no encaje se anula: una matrícula inventada identifica OTRO coche.
 */
function matricula(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const limpia = t.toUpperCase().replace(/[\s-]/g, '')
  if (/^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/.test(limpia)) return limpia
  if (/^[A-Z]{1,2}\d{4}[A-Z]{1,2}$/.test(limpia)) return limpia
  return null
}

/** DNI/NIE. Se comprueba la LETRA: un DNI mal leído es de otra persona. */
function documentoIdentidad(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const limpio = t.toUpperCase().replace(/[\s-]/g, '')
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(limpio)
  if (!m) return null
  const numero = Number((m[1] === '' ? '' : String('XYZ'.indexOf(m[1]))) + m[2])
  if (!Number.isFinite(numero)) return null
  if ('TRWAGMYFPDXBNJZSQVHLCKE'[numero % 23] !== m[3]) return null
  return limpio
}

/** Código DGS de entidad: `C` + 4 dígitos (C0058 Mapfre, C0109 Allianz…). */
function codigoDgs(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const limpio = t.toUpperCase().replace(/\s/g, '')
  return /^C\d{4}$/.test(limpio) ? limpio : null
}

/**
 * Convierte lo que devuelva el modelo en `AutoLeido`.
 *
 * Nunca lanza: una respuesta ilegible produce TODO a `null`, que es la verdad
 * («no se ha leído nada»), no un objeto a medias que la pantalla pintaría como
 * si fuera la póliza.
 */
export function normalizarAutoLeido(raw: unknown): AutoLeido {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return autoLeidoVacio()
  const o = raw as Record<string, unknown>
  return {
    compania: texto(o.compania),
    codigoEntidadDgs: codigoDgs(o.codigoEntidadDgs),
    numeroPoliza: texto(o.numeroPoliza),
    fechaEfecto: fechaIso(o.fechaEfecto),
    fechaVencimiento: fechaIso(o.fechaVencimiento),
    primaAnual: importe(o.primaAnual),
    matricula: matricula(o.matricula),
    marca: texto(o.marca),
    modelo: texto(o.modelo),
    version: texto(o.version),
    fechaMatriculacion: fechaIso(o.fechaMatriculacion),
    tomador: texto(o.tomador),
    dni: documentoIdentidad(o.dni),
    fechaNacimiento: fechaIso(o.fechaNacimiento),
    fechaCarnet: fechaIso(o.fechaCarnet),
    aniosSinSiniestros: entero(o.aniosSinSiniestros),
    siniestrosUltimos5: entero(o.siniestrosUltimos5),
  }
}

/** Los campos que SÍ se han leído. Es lo que la pantalla enseña para revisar. */
export function camposLeidos(d: AutoLeido): (keyof AutoLeido)[] {
  return (Object.keys(d) as (keyof AutoLeido)[]).filter((k) => d[k] !== null)
}

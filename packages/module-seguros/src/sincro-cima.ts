/**
 * Ficha del cliente ↔ lo que manda CIMA de ESA misma persona (25/09/2026).
 *
 * CIMA deja los datos de la persona en el INTERVINIENTE de la póliza
 * (`poliza_intervinientes`, casado por DNI), no en la ficha: la ingesta solo
 * escribe nombre/DNI del tomador. Alberto: «tenemos que tener los datos de CIMA
 * actualizados 100 % con nuestra BBDD» — primero CIMA manda (volcado), y
 * después cada diferencia se AVISA y decide él.
 *
 * Este módulo solo COMPARA; no lee BD ni escribe. Tres desenlaces por campo, y
 * no se colapsan:
 *   - `rellenar`  → la ficha no lo tiene y CIMA sí: se copia sin preguntar.
 *   - `anadir`    → teléfono nuevo de CIMA: se AÑADE como secundario sin
 *                   preguntar (26/09/2026, Alberto: «si son por tlf se añade y
 *                   ya está»). Quien aplica comprueba antes que no esté en OTRA
 *                   ficha; si lo está, lo convierte en `discrepa` con `aviso`.
 *   - `completar` → el nombre de CIMA trae MÁS que el de la ficha y la contiene
 *                   («Maria Gonzalez» → «M Carmen Baena Gonzalez»): se toma el de
 *                   CIMA sin preguntar (26/09/2026, Alberto: «CIMA tiene más
 *                   datos, coge CIMA»). La persona ya está casada por DNI.
 *   - `formatear` → es el mismo nombre pero la ficha lo tiene TODO en mayúsculas
 *                   (o minúsculas): se reescribe «Nombre Propio» sin preguntar.
 *   - `corregir`  → es el mismo nombre con una errata por palabra en la ficha
 *                   («Berta del la fuentes rojas» → «Berta de la Fuente Rojas»,
 *                   28/09/2026): se toma el de CIMA sin preguntar. Solo con las
 *                   mismas palabras, cada una a UNA letra como mucho y al menos
 *                   la mitad idénticas: «Maria Lopez»/«Mario Lopes» sigue preguntando.
 *   - `normalizar`→ es la MISMA fecha escrita en otro formato en la ficha («1980/3/4»
 *                   frente a «1980-03-04», 03/10/2026): se reescribe en ISO sin preguntar.
 *                   Antes de declarar un conflicto se normalizan los dos lados
 *                   (`mismoValorNormalizado`): nombre como conjunto de palabras, fecha a ISO,
 *                   teléfono sin 34, email en minúsculas. Normalizados iguales = NO es conflicto.
 *   - `discrepa`  → los dos lo tienen y NO coinciden: decide Alberto.
 *   - (nada)      → coinciden, o CIMA no lo trae: no hay nada que hacer.
 *
 * No son diferencias (26/09/2026): el nombre que solo cambia en mayúsculas o
 * tildes, el de CIMA al que le falta un nombre que la ficha sí tiene («ALFONSO
 * MONCOSI GOMEZ» frente a «Alfonso Carlos Moncosi Gomez»: la ficha está más
 * completa), y la fecha del carné que se va UN día (desfase de zona horaria).
 * El email nuevo de CIMA se AÑADE como secundario, igual que el teléfono
 * (28/09/2026, Alberto: «si hay dos mail se añade dos mail al cliente»). Un
 * email en la ficha vincula el portal del cliente: por eso quien aplica hace la
 * misma comprobación que con el teléfono, y si ese email está en OTRA ficha
 * pregunta.
 *
 * 🚨 Un valor de la ficha que no se puede leer (cifrado con otra clave) NO es
 * un hueco: `ilegible` en la entrada anula el campo — rellenarlo pisaría un
 * dato que existe y no vemos.
 */

export type CampoCima = 'nombre' | 'fechaNacimiento' | 'fechaCarnet' | 'telefono' | 'email'

export const CAMPOS_CIMA: readonly CampoCima[] = ['nombre', 'fechaNacimiento', 'fechaCarnet', 'telefono', 'email']

export const ROTULO_CAMPO_CIMA: Record<CampoCima, string> = {
  nombre: 'Nombre',
  fechaNacimiento: 'Fecha de nacimiento',
  fechaCarnet: 'Fecha del carné',
  telefono: 'Teléfono',
  email: 'Email',
}

/** Lo que dice la ficha. Listas = todos sus teléfonos/emails; `null` = no se pudo leer. */
export type FichaParaCima = {
  nombre: string | null
  fechaNacimiento: string | null
  fechaNacimientoIlegible: boolean
  /** Fechas de sus carnés B (`null` en la lista = fecha cifrada que no se abre). */
  carnets: (string | null)[] | null
  telefonos: string[] | null
  emails: string[] | null
}

/** Lo que dice CIMA de la persona (el interviniente con su DNI, la póliza más reciente primero). */
export type DatosCima = {
  nombre: string | null
  fechaNacimiento: string | null
  fechaCarnet: string | null
  telefonos: string[]
  emails: string[]
}

export type DiferenciaCima = {
  campo: CampoCima
  accion: 'rellenar' | 'anadir' | 'completar' | 'formatear' | 'corregir' | 'normalizar' | 'discrepa'
  /** Lo que tiene la ficha (para enseñarlo); `null` en `rellenar`. */
  ficha: string | null
  /** El valor que se escribiría, ya normalizado (en `formatear`, el de la ficha en «Nombre Propio»). */
  cima: string
  /** Por qué algo automático pasa a preguntar (p. ej. el teléfono ya está en otra ficha). */
  aviso?: string
}

/** Enlaces que van en minúscula dentro de un nombre («Delgado de Cos», «Olivencia y Calvo»). */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'van', 'von'])

/** «ALFONSO MONCOSI GÓMEZ» → «Alfonso Moncosi Gómez»; «PONT DELGADO DE COS» → «Pont Delgado de Cos». */
export function nombrePropio(v: string): string {
  return v
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-ES')
    .split(' ')
    .map((w, i) =>
      i > 0 && PARTICULAS.has(w) ? w : w.split('-').map((p) => p.charAt(0).toLocaleUpperCase('es-ES') + p.slice(1)).join('-'),
    )
    .join(' ')
}

/** Todo en mayúsculas o todo en minúsculas: no es una grafía que alguien eligiera («McDonald» se respeta). */
export function sinFormatoNombre(v: string | null): boolean {
  if (!v || !/\p{L}/u.test(v)) return false
  return v === v.toLocaleUpperCase('es-ES') || v === v.toLocaleLowerCase('es-ES')
}

/** Misma palabra, o una es la inicial de la otra («m» = «maria»). */
function casaPalabra(a: string, b: string): boolean {
  return a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))
}

/** Cada palabra de `pocas` (al menos dos) casa con una palabra DISTINTA de `muchas`. */
function nombreCubierto(pocas: string | null, muchas: string | null): boolean {
  const kp = claveNombre(pocas)
  const km = claveNombre(muchas)
  if (!kp || !km) return false
  const palabras = kp.split(' ')
  const resto = km.split(' ')
  if (palabras.length < 2) return false
  // Primero las exactas: si no, una inicial podría quedarse la palabra que otra necesita entera.
  const orden = [...palabras].sort((x, y) => y.length - x.length)
  for (const w of orden) {
    let i = resto.indexOf(w)
    if (i < 0) i = resto.findIndex((r) => casaPalabra(w, r))
    if (i < 0) return false
    resto.splice(i, 1)
  }
  return true
}

/** La ficha está contenida en CIMA y CIMA dice más: más palabras, o la palabra entera donde la ficha tiene una inicial. */
function cimaMasCompleta(ficha: string | null, cima: string | null): boolean {
  if (!nombreCubierto(ficha, cima)) return false
  const nf = claveNombre(ficha)!.split(' ')
  const nc = claveNombre(cima)!.split(' ')
  return nc.length > nf.length || nf.some((w) => w.length === 1 && !nc.includes(w))
}

/** Distancia de edición ≤ 1 (una letra cambiada, sobrante o que falta). */
function aUnaLetra(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  const [c, l] = a.length <= b.length ? [a, b] : [b, a]
  let i = 0
  while (i < c.length && c[i] === l[i]) i++
  return c.length === l.length ? c.slice(i + 1) === l.slice(i + 1) : c.slice(i) === l.slice(i + 1)
}

/**
 * Mismas palabras con erratas: igual número de palabras (≥2), cada una casa con
 * una DISTINTA a una letra como mucho (nunca una inicial), y al menos la mitad
 * idénticas. La persona ya está casada por DNI; esto solo decide si es errata.
 */
function nombreConErratas(ficha: string | null, cima: string | null): boolean {
  const kf = claveNombre(ficha)
  const kc = claveNombre(cima)
  if (!kf || !kc) return false
  const pf = kf.split(' ')
  const resto = kc.split(' ')
  if (pf.length < 2 || pf.length !== resto.length) return false
  let distintas = 0
  // Primero las exactas, para que una errata no se quede la palabra que otra necesita entera.
  for (const w of [...pf].sort((x, y) => Number(resto.includes(y)) - Number(resto.includes(x)))) {
    let i = resto.indexOf(w)
    if (i < 0) {
      i = w.length > 1 ? resto.findIndex((r) => r.length > 1 && aUnaLetra(w, r)) : -1
      if (i < 0) return false
      distintas++
    }
    resto.splice(i, 1)
  }
  return distintas > 0 && distintas * 2 <= pf.length
}

/** Dos fechas `YYYY-MM-DD` a un día o menos (el carné guardado con desfase de zona horaria). */
function aUnDia(a: string, b: string): boolean {
  const d = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
  return Number.isFinite(d) && d <= 86_400_000
}

/** Minúsculas, sin tildes ni signos, espacios colapsados: «PÉREZ-LÓPEZ,  Juan» = «perez lopez juan». */
export function claveNombre(v: string | null): string | null {
  if (!v) return null
  const k = v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return k === '' ? null : k
}

/** Mismo nombre aunque cambie el orden de las palabras («Guzman Lozano Pablo» = «Pablo Guzman Lozano»). */
export function mismoNombre(a: string | null, b: string | null): boolean {
  const ka = claveNombre(a)
  const kb = claveNombre(b)
  if (ka === null || kb === null) return false
  return ka.split(' ').sort().join(' ') === kb.split(' ').sort().join(' ')
}

/** `YYYY-MM-DD` o `null`. Acepta `DD/MM/YYYY` y un ISO con hora. */
export function fechaCima(v: string | null): string | null {
  if (!v) return null
  const t = v.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const es = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (es) return `${es[3]}-${es[2].padStart(2, '0')}-${es[1].padStart(2, '0')}`
  return null
}

/**
 * Fecha a `YYYY-MM-DD` aceptando también `YYYY/M/D`, `D-M-YYYY`, `D.M.YYYY`… (año de 4 cifras) y un ISO con hora.
 * Fecha imposible (31/02) → `null`. Más laxa que `fechaCima`, que decide qué es un hueco bien formado.
 */
export function fechaIsoFlexible(v: string | null): string | null {
  if (!v) return null
  const t = v.trim()
  const a = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:$|[T\s])/.exec(t)
  const b = a ? null : /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  const [y, m, d] = a ? [a[1], a[2], a[3]] : b ? [b[3], b[2], b[1]] : [null, null, null]
  if (!y || !m || !d) return null
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const f = new Date(`${iso}T00:00:00Z`)
  return Number.isFinite(f.getTime()) && f.toISOString().slice(0, 10) === iso ? iso : null
}

/** Teléfono comparable: solo los 9 dígitos nacionales si lo es; si no, los dígitos. */
export function claveTelefono(v: string): string {
  const d = v.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('34')) return d.slice(2)
  if (d.length === 13 && d.startsWith('0034')) return d.slice(4)
  return d
}

function claveEmail(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * ¿Es el MISMO dato una vez normalizados los dos lados? Nombre: conjunto de palabras sin tildes ni
 * mayúsculas (`mismoNombre`); fechas: a ISO; teléfono: dígitos sin el 34; email: minúsculas y sin espacios.
 * Un lado vacío nunca coincide. Lo usa `compararConCima` y se prueba aparte.
 */
export function mismoValorNormalizado(campo: CampoCima, a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false
  switch (campo) {
    case 'nombre': return mismoNombre(a, b)
    case 'fechaNacimiento':
    case 'fechaCarnet': {
      const x = fechaIsoFlexible(a)
      return x !== null && x === fechaIsoFlexible(b)
    }
    case 'telefono': {
      const x = claveTelefono(a)
      return x !== '' && x === claveTelefono(b)
    }
    case 'email': {
      const x = claveEmail(a)
      return x !== '' && x === claveEmail(b)
    }
  }
}

/** Por qué se copió algo solo (para el resumen del cron, sin valores). `null` = no se copia solo. */
export function motivoCopiadoCima(accion: DiferenciaCima['accion']): 'hueco' | 'nuevo' | 'mas_completo' | 'formato' | 'errata' | null {
  switch (accion) {
    case 'rellenar': return 'hueco'
    case 'anadir': return 'nuevo'
    case 'completar': return 'mas_completo'
    case 'formatear':
    case 'normalizar': return 'formato'
    case 'corregir': return 'errata'
    case 'discrepa': return null
  }
}

/**
 * Las diferencias entre la ficha y CIMA. Orden estable (el de `CAMPOS_CIMA`).
 * Para teléfono/email se compara el PRIMERO que manda CIMA contra TODOS los de
 * la ficha: si ya lo tiene en cualquier posición, no hay diferencia.
 */
/** Categorías/clases de vehículo de CIMA que son moto o ciclomotor. */
const CLASES_MOTO = new Set(['MO', 'MT', 'CI'])

/**
 * ¿La fecha de carné de esta póliza es la del carné B? Solo si es un COCHE.
 * El `tipo` de la póliza NO basta: CIMA manda las motos en el ramo de autos
 * (DGS 241) y 11 pólizas vivas con moto estaban como `tipo = 'auto'` (28/09/2026,
 * BMW C 400 GT de 0007001052485): su fecha es la del carné A y se comparaba
 * con el B. Manda el vehículo (`categoriaVehiculo`/`claseVehiculo`), en la
 * raíz o en cualquier riesgo; ante una moto, no es del B.
 */
export function esPolizaDeCoche(tipo: string | null | undefined, datosEspecificos: unknown): boolean {
  if (String(tipo) !== 'auto') return false
  const d = datosEspecificos && typeof datosEspecificos === 'object' ? (datosEspecificos as Record<string, unknown>) : {}
  const riesgos = Array.isArray(d.riesgos) ? d.riesgos : []
  for (const r of [d, ...riesgos]) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    for (const k of ['categoriaVehiculo', 'claseVehiculo']) {
      const v = o[k]
      if (typeof v === 'string' && CLASES_MOTO.has(v.trim().toUpperCase())) return false
    }
  }
  return true
}

export function compararConCima(ficha: FichaParaCima, cima: DatosCima): DiferenciaCima[] {
  const out: DiferenciaCima[] = []

  const nombreCima = cima.nombre?.replace(/\s+/g, ' ').trim() || null
  if (nombreCima && claveNombre(nombreCima)) {
    if (!claveNombre(ficha.nombre)) out.push({ campo: 'nombre', accion: 'rellenar', ficha: null, cima: nombrePropio(nombreCima) })
    else if (!mismoNombre(ficha.nombre, nombreCima) && cimaMasCompleta(ficha.nombre, nombreCima)) {
      out.push({ campo: 'nombre', accion: 'completar', ficha: ficha.nombre, cima: nombrePropio(nombreCima) })
    } else if (mismoNombre(ficha.nombre, nombreCima) || nombreCubierto(nombreCima, ficha.nombre)) {
      if (ficha.nombre && sinFormatoNombre(ficha.nombre)) {
        out.push({ campo: 'nombre', accion: 'formatear', ficha: ficha.nombre, cima: nombrePropio(ficha.nombre) })
      }
    } else if (nombreConErratas(ficha.nombre, nombreCima)) {
      out.push({ campo: 'nombre', accion: 'corregir', ficha: ficha.nombre, cima: nombrePropio(nombreCima) })
    } else out.push({ campo: 'nombre', accion: 'discrepa', ficha: ficha.nombre, cima: nombrePropio(nombreCima) })
  }

  const nac = fechaCima(cima.fechaNacimiento)
  if (nac && !ficha.fechaNacimientoIlegible) {
    const propia = fechaCima(ficha.fechaNacimiento)
    // Una fecha guardada en un formato raro NO es un hueco: se enseña tal cual y decide Alberto.
    // Salvo que sea la MISMA fecha en otro formato: entonces se reescribe en ISO sin preguntar.
    if (!propia && ficha.fechaNacimiento?.trim()) {
      const accion = mismoValorNormalizado('fechaNacimiento', ficha.fechaNacimiento, nac) ? 'normalizar' : 'discrepa'
      out.push({ campo: 'fechaNacimiento', accion, ficha: ficha.fechaNacimiento.trim(), cima: nac })
    }
    else if (!propia) out.push({ campo: 'fechaNacimiento', accion: 'rellenar', ficha: null, cima: nac })
    else if (propia !== nac) out.push({ campo: 'fechaNacimiento', accion: 'discrepa', ficha: propia, cima: nac })
  }

  const car = fechaCima(cima.fechaCarnet)
  if (car && ficha.carnets !== null && !ficha.carnets.some((f) => f === null)) {
    const propias = ficha.carnets.map(fechaCima).filter((f): f is string => f !== null)
    if (ficha.carnets.length === 0) out.push({ campo: 'fechaCarnet', accion: 'rellenar', ficha: null, cima: car })
    else if (!propias.some((p) => aUnDia(p, car))) {
      // Un único B guardado en otro formato y de la misma fecha: se reescribe en ISO. Con varios no se sabe cuál tocar.
      const raro = ficha.carnets.length === 1 && propias.length === 0 && mismoValorNormalizado('fechaCarnet', ficha.carnets[0], car)
      out.push({ campo: 'fechaCarnet', accion: raro ? 'normalizar' : 'discrepa', ficha: propias.join(' · ') || ficha.carnets.filter((c): c is string => c !== null).join(' · ') || null, cima: car })
    }
  }

  const tel = cima.telefonos.map((t) => t.trim()).find((t) => claveTelefono(t).length >= 9)
  if (tel && ficha.telefonos !== null) {
    const propias = ficha.telefonos.map(claveTelefono)
    if (ficha.telefonos.length === 0) out.push({ campo: 'telefono', accion: 'rellenar', ficha: null, cima: tel })
    else if (!propias.includes(claveTelefono(tel))) out.push({ campo: 'telefono', accion: 'anadir', ficha: ficha.telefonos.join(' · '), cima: tel })
  }

  const em = cima.emails.map((e) => e.trim()).find((e) => e.includes('@'))
  if (em && ficha.emails !== null) {
    const propias = ficha.emails.map(claveEmail)
    if (ficha.emails.length === 0) out.push({ campo: 'email', accion: 'rellenar', ficha: null, cima: em })
    else if (!propias.includes(claveEmail(em))) out.push({ campo: 'email', accion: 'anadir', ficha: ficha.emails.join(' · '), cima: em })
  }

  return out
}

/**
 * Huella de UNA decisión «mantener el mío»: campo + valor de CIMA normalizado.
 * Si CIMA manda después OTRO valor distinto, la huella cambia y se vuelve a
 * avisar — lo decidido fue sobre ese valor, no sobre el campo para siempre.
 */
export function huellaDecisionCima(campo: CampoCima, valorCima: string): string {
  const v =
    campo === 'telefono' ? claveTelefono(valorCima)
      : campo === 'email' ? claveEmail(valorCima)
        : campo === 'nombre' ? (claveNombre(valorCima) ?? '').split(' ').sort().join(' ')
          : fechaCima(valorCima) ?? valorCima.trim()
  return `${campo}:${v}`
}

export function esCampoCima(v: unknown): v is CampoCima {
  return typeof v === 'string' && (CAMPOS_CIMA as readonly string[]).includes(v)
}

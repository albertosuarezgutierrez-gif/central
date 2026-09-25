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
 *   - `discrepa`  → los dos lo tienen y NO coinciden: decide Alberto.
 *   - (nada)      → coinciden, o CIMA no lo trae: no hay nada que hacer.
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
  accion: 'rellenar' | 'discrepa'
  /** Lo que tiene la ficha (para enseñarlo); `null` en `rellenar`. */
  ficha: string | null
  /** El valor que manda CIMA, ya normalizado: es el que se escribiría. */
  cima: string
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

/** Teléfono comparable: solo los 9 dígitos nacionales si lo es; si no, los dígitos. */
export function claveTelefono(v: string): string {
  const d = v.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('34')) return d.slice(2)
  if (d.length === 13 && d.startsWith('0034')) return d.slice(4)
  return d
}

function claveEmail(v: string): string {
  return v.trim().toLowerCase()
}

/**
 * Las diferencias entre la ficha y CIMA. Orden estable (el de `CAMPOS_CIMA`).
 * Para teléfono/email se compara el PRIMERO que manda CIMA contra TODOS los de
 * la ficha: si ya lo tiene en cualquier posición, no hay diferencia.
 */
export function compararConCima(ficha: FichaParaCima, cima: DatosCima): DiferenciaCima[] {
  const out: DiferenciaCima[] = []

  const nombreCima = cima.nombre?.replace(/\s+/g, ' ').trim() || null
  if (nombreCima && claveNombre(nombreCima)) {
    if (!claveNombre(ficha.nombre)) out.push({ campo: 'nombre', accion: 'rellenar', ficha: null, cima: nombreCima })
    else if (!mismoNombre(ficha.nombre, nombreCima)) out.push({ campo: 'nombre', accion: 'discrepa', ficha: ficha.nombre, cima: nombreCima })
  }

  const nac = fechaCima(cima.fechaNacimiento)
  if (nac && !ficha.fechaNacimientoIlegible) {
    const propia = fechaCima(ficha.fechaNacimiento)
    // Una fecha guardada en un formato raro NO es un hueco: se enseña tal cual y decide Alberto.
    if (!propia && ficha.fechaNacimiento?.trim()) out.push({ campo: 'fechaNacimiento', accion: 'discrepa', ficha: ficha.fechaNacimiento.trim(), cima: nac })
    else if (!propia) out.push({ campo: 'fechaNacimiento', accion: 'rellenar', ficha: null, cima: nac })
    else if (propia !== nac) out.push({ campo: 'fechaNacimiento', accion: 'discrepa', ficha: propia, cima: nac })
  }

  const car = fechaCima(cima.fechaCarnet)
  if (car && ficha.carnets !== null && !ficha.carnets.some((f) => f === null)) {
    const propias = ficha.carnets.map(fechaCima).filter((f): f is string => f !== null)
    if (ficha.carnets.length === 0) out.push({ campo: 'fechaCarnet', accion: 'rellenar', ficha: null, cima: car })
    else if (!propias.includes(car)) out.push({ campo: 'fechaCarnet', accion: 'discrepa', ficha: propias.join(' · ') || null, cima: car })
  }

  const tel = cima.telefonos.map((t) => t.trim()).find((t) => claveTelefono(t).length >= 9)
  if (tel && ficha.telefonos !== null) {
    const propias = ficha.telefonos.map(claveTelefono)
    if (ficha.telefonos.length === 0) out.push({ campo: 'telefono', accion: 'rellenar', ficha: null, cima: tel })
    else if (!propias.includes(claveTelefono(tel))) out.push({ campo: 'telefono', accion: 'discrepa', ficha: ficha.telefonos.join(' · '), cima: tel })
  }

  const em = cima.emails.map((e) => e.trim()).find((e) => e.includes('@'))
  if (em && ficha.emails !== null) {
    const propias = ficha.emails.map(claveEmail)
    if (ficha.emails.length === 0) out.push({ campo: 'email', accion: 'rellenar', ficha: null, cima: em })
    else if (!propias.includes(claveEmail(em))) out.push({ campo: 'email', accion: 'discrepa', ficha: ficha.emails.join(' · '), cima: em })
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

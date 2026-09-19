/**
 * Dirección del RIESGO de un inmueble (dónde está la casa, el local, la
 * comunidad) anotada A MANO por el corredor.
 *
 * Por qué existe (19/09/2026): CIMA NO manda los datos del riesgo de hogar
 * (`apps/asegura/lib/codeoscopic/desde-cartera-hogar.ts` ya lo decía), así que
 * una póliza de hogar que solo ha entrado por CIMA y no tiene gemela en el
 * volcado de junio/2026 no tiene dirección en ninguna parte. Medido ese día en
 * la cartera viva: **32 hogar solo-CIMA, 2 con dirección**. Alberto, con su
 * propio portal delante: «No aparece direccion seguro hogar en ningún lado».
 *
 * Aquí solo vive la REGLA (qué es una dirección válida y qué es basura); quién
 * la guarda y cómo la cifra es cosa de `apps/asegura/lib/cartera-poliza-editar.ts`.
 * Misma separación que `rc-modalidad.ts`.
 */

/**
 * Ramos donde la dirección del riesgo IDENTIFICA el bien y la ficha la pinta
 * (`objetoInmueble` en `objeto.ts`). `comercio` queda fuera a propósito: se
 * describe por actividad/coberturas y `objetoComercio` no lee `direccion`, así
 * que lo anotado se guardaría y nunca se vería — y el botón volvería a salir. */
export const RAMOS_CON_DIRECCION_RIESGO: ReadonlySet<string> = new Set(['hogar', 'comunidades'])

export function admiteDireccionRiesgo(tipo: unknown): boolean {
  return typeof tipo === 'string' && RAMOS_CON_DIRECCION_RIESGO.has(tipo.trim().toLowerCase())
}

export type DireccionRiesgo = { direccion: string; cp: string | null; localidad: string | null }

export type ValidacionDireccionRiesgo =
  | { ok: true; valor: DireccionRiesgo }
  | { ok: false; motivo: string }

const MAX_DIRECCION = 200
const MAX_LOCALIDAD = 80
const MIN_DIRECCION = 5

function limpio(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
}

/**
 * Valida lo que teclea el corredor.
 *
 * - La calle es OBLIGATORIA y con algo de cuerpo: «C/» a secas o un guion no
 *   son una dirección, son un hueco con forma de dato — y `describirBien()`
 *   del portal lo pintaría como título de la póliza.
 * - El CP, si viene, son 5 cifras (los españoles; la cartera es española). Un
 *   CP de 4 cifras es casi siempre un cero perdido y se rechaza en la puerta
 *   en vez de guardarse mal.
 * - Localidad libre y opcional. Cadena vacía = `null`, nunca `''`.
 */
export function validarDireccionRiesgo(entrada: {
  direccion?: unknown
  cp?: unknown
  localidad?: unknown
}): ValidacionDireccionRiesgo {
  const direccion = limpio(entrada.direccion)
  if (direccion === '') return { ok: false, motivo: 'Falta la dirección del inmueble.' }
  if (direccion.length < MIN_DIRECCION || !/[a-záéíóúñ]/i.test(direccion)) {
    return { ok: false, motivo: 'La dirección es demasiado corta para identificar el inmueble.' }
  }
  if (direccion.length > MAX_DIRECCION) return { ok: false, motivo: `La dirección no puede pasar de ${MAX_DIRECCION} caracteres.` }

  const cpTexto = limpio(entrada.cp)
  if (cpTexto !== '' && !/^\d{5}$/.test(cpTexto)) return { ok: false, motivo: 'El código postal son 5 cifras.' }

  const localidadTexto = limpio(entrada.localidad)
  if (localidadTexto.length > MAX_LOCALIDAD) return { ok: false, motivo: `La localidad no puede pasar de ${MAX_LOCALIDAD} caracteres.` }

  return {
    ok: true,
    valor: { direccion, cp: cpTexto === '' ? null : cpTexto, localidad: localidadTexto === '' ? null : localidadTexto },
  }
}

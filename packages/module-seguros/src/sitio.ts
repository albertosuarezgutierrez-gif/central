// Dónde vive una ficha: qué se puede AFIRMAR con el código postal, la ciudad y
// la provincia que hay guardados, sin BD.
//
// 🚨 Por qué existe (05/09/2026). La ficha pintaba el sitio con un `join`:
//
//     [[cp, ciudad].join(' '), provincia].join(', ')
//
// y a Manuel Antonio Piña Franco le salía «41807 34304, Tarragona» — un CP de
// Sevilla, un número donde va la ciudad y una provincia que no es ninguna de
// las dos. Alberto: «a Manuel Piña Franco también le sale Tarragona». Un `join`
// no miente por su cuenta: repite lo que hay. Pero AFIRMA, y ahí está el fallo:
// tres columnas que se contradicen se pintan igual que tres que concuerdan, así
// que quien lee no tiene forma de saber cuál creerse — y esa dirección es la
// que va en una carta o la que se lee por teléfono.
//
// La regla del repo aplicada aquí: ante la duda, el estado conservador. Lo que
// no cuadra NO se afirma; se enseña como reparo, diciendo qué dice cada columna
// para que se pueda corregir. Y «no cuadra» ≠ «no hay»: los reparos son datos
// guardados, no huecos.
//
// Lo que este módulo NO hace: adivinar. No reescribe la provincia a partir del
// CP (el CP puede ser el equivocado), no borra nada y no toca la BD.

import { provinciaPorCp } from './cliente-edicion.ts'

export type Sitio = {
  codigoPostal?: string | null
  ciudad?: string | null
  provincia?: string | null
}

export type ReparoSitio =
  /** El CP no son 5 dígitos de una provincia española: no se pinta como CP. */
  | { tipo: 'cp_invalido'; valor: string }
  /** La ciudad no tiene ni una letra (suele ser otro CP tecleado ahí). */
  | { tipo: 'ciudad_sin_letras'; valor: string }
  /** El CP dice una provincia y la ficha otra. Ninguna de las dos se afirma. */
  | { tipo: 'provincia_no_cuadra'; provincia: string; segunCp: string; codigoPostal: string }

export type SitioLeido = {
  /** Lo que se puede afirmar, ya formateado. `null` = no se puede afirmar nada. */
  texto: string | null
  /** Lo guardado que no cuadra. Vacío = las columnas concuerdan entre sí. */
  reparos: ReparoSitio[]
}

/** Sin acentos, sin signos, en minúscula: «A Coruña» y «a coruna» son la misma. */
function llano(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Los dos nombres de las provincias que tienen dos. El volcado del CRM trae
 * unas y `provinciaPorCp` devuelve otras: sin esto, «Vizcaya» contra «Bizkaia»
 * se leería como una contradicción y la ficha marcaría un fallo que no existe.
 * Es el error caro de este módulo: un reparo falso enseña a ignorar los reparos.
 */
const MISMA_PROVINCIA: Record<string, string> = {
  alava: 'araba', araba: 'araba',
  vizcaya: 'bizkaia', bizkaia: 'bizkaia',
  guipuzcoa: 'gipuzkoa', gipuzkoa: 'gipuzkoa',
  'la coruna': 'a coruna', 'a coruna': 'a coruna', coruna: 'a coruna',
  gerona: 'girona', girona: 'girona',
  lerida: 'lleida', lleida: 'lleida',
  orense: 'ourense', ourense: 'ourense',
  baleares: 'illes balears', 'islas baleares': 'illes balears', 'illes balears': 'illes balears',
  'las palmas': 'las palmas', 'las palmas de gran canaria': 'las palmas',
  tenerife: 'santa cruz de tenerife', 'santa cruz de tenerife': 'santa cruz de tenerife',
  castello: 'castellon', castellon: 'castellon',
  alacant: 'alicante', alicante: 'alicante',
  valencia: 'valencia',
  asturias: 'asturias', oviedo: 'asturias',
  cantabria: 'cantabria', santander: 'cantabria',
  'la rioja': 'la rioja', logrono: 'la rioja',
  navarra: 'navarra', 'nafarroa': 'navarra',
}

function mismaProvincia(a: string, b: string): boolean {
  const na = llano(a)
  const nb = llano(b)
  if (na === nb) return true
  return (MISMA_PROVINCIA[na] ?? na) === (MISMA_PROVINCIA[nb] ?? nb)
}

function texto(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

/**
 * El CP en su forma de 5 dígitos, o `null` si lo guardado no es uno español.
 *
 * 🚨 Los de CUATRO dígitos se rellenan con el cero de delante en vez de
 * rechazarse: son **602 fichas** del volcado (medido 05/09/2026) que perdieron
 * el cero en una hoja de cálculo, y un CP español de 4 dígitos solo puede ser
 * `0XXXX` — Barcelona, Álava, Baleares, Almería. Eso no es adivinar: es la
 * única lectura posible. Rechazarlos marcaría como sospechosas 602 fichas cuyo
 * dato está bien, y un reparo falso enseña a ignorar los reparos.
 *
 * Y afecta al cruce con la provincia: sin el cero, `left(cp,2)` de un `8830`
 * es «88», que no es ninguna provincia, y Barcelona parecería contradecirse.
 */
function cpNormal(cp: string): string | null {
  const s = /^\d{4}$/.test(cp) ? `0${cp}` : cp
  if (!/^\d{5}$/.test(s)) return null
  const p = Number(s.slice(0, 2))
  return p >= 1 && p <= 52 ? s : null
}

/**
 * Qué se puede decir del sitio de una ficha.
 *
 * - CP que no es un CP español → reparo, y no se pinta como código postal.
 * - Ciudad sin ninguna letra (un «34304») → reparo: eso no es una ciudad.
 * - Provincia que contradice al CP → reparo, y **no se afirma ninguna de las
 *   dos**: el equivocado puede ser cualquiera de los dos, y elegir uno sería
 *   inventarse el domicilio de una persona.
 *
 * La provincia sí se afirma cuando no hay CP con el que contrastarla: es lo
 * único que se sabe, y callarla sería perder el único dato que hay.
 */
export function leerSitio(s: Sitio): SitioLeido {
  const reparos: ReparoSitio[] = []
  const cpBruto = texto(s.codigoPostal)
  const ciudadBruta = texto(s.ciudad)
  const provinciaBruta = texto(s.provincia)

  const cp = cpBruto === null ? null : cpNormal(cpBruto)
  if (cpBruto !== null && cp === null) reparos.push({ tipo: 'cp_invalido', valor: cpBruto })

  const ciudad = ciudadBruta !== null && /\p{L}/u.test(ciudadBruta) ? ciudadBruta : null
  if (ciudadBruta !== null && ciudad === null) reparos.push({ tipo: 'ciudad_sin_letras', valor: ciudadBruta })

  let provincia = provinciaBruta
  const segunCp = cp === null ? null : provinciaPorCp(cp)
  if (provinciaBruta !== null && segunCp !== null && !mismaProvincia(provinciaBruta, segunCp)) {
    reparos.push({ tipo: 'provincia_no_cuadra', provincia: provinciaBruta, segunCp, codigoPostal: cp! })
    provincia = null
  }

  const cabeza = [cp, ciudad].filter((x): x is string => x !== null).join(' ')
  const partes = [cabeza === '' ? null : cabeza, provincia].filter((x): x is string => x !== null)
  return { texto: partes.length === 0 ? null : partes.join(', '), reparos }
}

/** El reparo, en una frase para la pantalla. Dice qué columna dice qué. */
export function textoReparoSitio(r: ReparoSitio): string {
  switch (r.tipo) {
    case 'cp_invalido':
      return `El código postal guardado («${r.valor}») no es un código postal español de 5 dígitos.`
    case 'ciudad_sin_letras':
      return `En la ciudad hay guardado «${r.valor}», que es un número y no un nombre de ciudad (el volcado dejó ahí el identificador de población del CRM viejo).`
    case 'provincia_no_cuadra':
      return `La provincia guardada es «${r.provincia}», pero el código postal ${r.codigoPostal} es de ${r.segunCp}. No se sabe cuál de los dos está mal, así que no se da ninguna por buena.`
  }
}

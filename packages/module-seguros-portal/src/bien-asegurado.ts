// Qué cosa está asegurada: el coche, el piso, la moto.
//
// 🚨 POR QUÉ EXISTE ESTE FICHERO (05/09/2026). La bóveda enseñaba compañía,
// ramo, número de póliza y prima — y nada más. Alberto, con su propia pantalla
// delante: «poca informacion... ni direccion en hogar, ni datos coche en auto».
// Sus DOS pólizas de hogar de Occident salían como dos tarjetas idénticas
// distinguibles solo por el número de póliza, que es un dato que nadie se sabe
// de memoria. El dato SÍ estaba en la BD (`polizas.datos_especificos`, jsonb) y
// el rol del portal ya tenía el GRANT: no se enseñaba, sin más.
//
// Medido contra la cartera VIVA el 05/09/2026: `auto` trae `marca`, `modelo` y
// `matricula` en 81 de 81 filas; `moto` en 1 de 1; `hogar` trae `direccion`,
// `localidad` y `cp` en 2 de 2 (y `metrosCuadrados`/`anioConstruccion` en 1).
// El resto de ramos vivos no traen ninguna clave.
//
// 🚨 RE-MEDIDO el 07/09/2026, y el «2 de 2» era engañoso: son 2 de **19** hogar
// vivas. Las otras 17 no traen NADA, y en 11 de ellas la dirección sí existe —
// pero en una fila GEMELA del volcado (misma póliza, mismo cliente, otra
// aseguradora), que la cartera viva no mira. De ahí `describirBienConGemela`.
//
// 🔐 Y las 2 que sí traen `direccion` la traen **CIFRADA** (`v1:iv:cipher:tag`,
// `@central/module-seguros-pii`). Este fichero es puro y no descifra: descifra
// quien lee la BD (`lib/cartera-lectura.ts`). Lo que hace este fichero es negarse
// a pintar un criptograma: ver `campo()`.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 LA LÍNEA QUE SEPARA LOS DOS CAMPOS DE SALIDA, y no es una sutileza:
//
//   `cosa`      = QUÉ está asegurado (marca, modelo, matrícula). Es un dato del
//                 CONTRATO, y por eso lo ve hasta el nivel más bajo: quien
//                 conduce la furgoneta de su padre necesita saber cuál es la
//                 furgoneta. Es literalmente el ejemplo con el que se escribió
//                 `acceso.ts`.
//
//   `ubicacion` = DÓNDE está el riesgo: la dirección del inmueble asegurado.
//                 Es la IDENTIFICACIÓN del bien en un hogar, el papel que juega
//                 la matrícula en un auto — y por eso desde el **07/09/2026**
//                 también se ve desde el nivel más bajo (decisión de Alberto;
//                 el porqué, en el docblock de `direccionRiesgo` en `acceso.ts`,
//                 y lo que se quitó, en `NUNCA_A_UN_TERCERO` de
//                 `autorizacion.ts`). Antes de esa fecha era lo contrario.
//
// Siguen siendo DOS campos y no uno, aunque hoy los dos se vean en el mismo
// nivel: `direccionRiesgo` es la palanca para volver a cerrar la dirección sin
// tocar nada más, y un solo campo la haría inseparable de la matrícula para
// siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { textoConDato } from './poliza-leida.ts'

/** La cosa asegurada, ya legible y ya troceada por quién puede ver cada parte. */
export interface BienAsegurado {
  /** Marca, modelo, matrícula… `null` = la compañía no lo ha informado. */
  cosa: string | null
  /** La dirección del riesgo. `null` = no informada **o** no visible. */
  ubicacion: string | null
  /** Detalles neutros ya formateados (metros, año de construcción). */
  detalles: string[]
}

export const BIEN_VACIO: BienAsegurado = { cosa: null, ubicacion: null, detalles: [] }

/** ¿Trae algo que enseñar? Para que la pantalla no pinte un hueco. */
export function bienTieneAlgo(b: BienAsegurado): boolean {
  return b.cosa !== null || b.ubicacion !== null || b.detalles.length > 0
}

/**
 * Un objeto plano, o `null`.
 *
 * Un `jsonb` puede traer un array, un número o `null`, y aguas arriba nadie lo
 * ha validado. Lo que no sea un objeto plano no es «un bien sin datos»: es algo
 * que no sabemos leer, y se trata igual que no tener nada.
 */
function objeto(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

/**
 * Una clave del jsonb como texto legible.
 *
 * 🚨 Las claves que empiezan por `_` NO se leen nunca. En la cartera real hay un
 * `_avant` (residuo del CRM de origen) y mañana habrá otro: un volcado externo
 * es exactamente el sitio donde aparecen campos internos, y enseñarlos en la
 * pantalla del cliente es enseñarle las tripas de la migración.
 */
function campo(d: Record<string, unknown>, clave: string): string | null {
  if (clave.startsWith('_')) return null
  const v = d[clave]
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  const t = textoConDato(v)
  // 🚨 Un valor que sigue siendo el SOBRE CIFRADO (`v1:iv:cipher:tag`) no es un
  // dato: es un «no he podido leerlo» con forma de texto, o sea exactamente el
  // valor de cajón que la regla de la casa manda anular antes de que nadie lo
  // pinte. Sin esto, un portal SIN `PII_ENCRYPTION_KEY` titularía la póliza de
  // hogar con `v1:FUMEZniYx4Hh2jjo:...` — y no fallaría nada: saldría.
  if (t !== null && VERSION_CIFRADO.test(t)) return null
  return t
}

/** El sobre de `@central/module-seguros-pii`: `v1:iv:cipher:tag` en base64. */
const VERSION_CIFRADO = /^v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/

/** Un entero positivo, o `null`. Un 0 metros cuadrados es un hueco, no un piso. */
function entero(d: Record<string, unknown>, clave: string): number | null {
  const t = campo(d, clave)
  if (t === null) return null
  const n = Number(t.replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Los ramos cuyo bien es un VEHÍCULO: su identidad es la matrícula. */
const RAMOS_VEHICULO = new Set(['auto', 'moto', 'camion', 'furgoneta', 'flota'])

/** Los ramos cuyo bien es un INMUEBLE: su identidad es la dirección. */
const RAMOS_INMUEBLE = new Set(['hogar', 'comercio', 'comunidad', 'alquiler'])

/**
 * Describe el bien asegurado a partir del `datos_especificos` de la póliza.
 *
 * 🚨 Nunca inventa y nunca lanza: lo que no venga informado sale `null`, y eso
 * significa **«la compañía no nos lo ha dicho»**, jamás «no tiene». La pantalla
 * no pinta nada en ese caso — es la regla de visibilidad del portal: la
 * ausencia de la matrícula no cambia nada de lo que el cliente pueda hacer, y
 * un «matrícula: —» solo genera una pregunta que Alberto tiene que contestar.
 *
 * No se filtra por nivel aquí: esta función solo LEE. Quién puede ver `cosa` y
 * quién `ubicacion` lo decide `camposVisibles()`, y lo aplica
 * `lib/cartera-lectura.ts` — la misma separación que con la prima y los recibos.
 */
export function describirBien(ramo: string | null | undefined, datosEspecificos: unknown): BienAsegurado {
  const d = objeto(datosEspecificos)
  if (d === null) return BIEN_VACIO

  const r = (ramo ?? '').trim().toLowerCase()
  const detalles: string[] = []

  // Los detalles neutros van con la COSA (son del inmueble, no de quien vive en
  // él), así que se calculan igual sea cual sea el ramo.
  const metros = entero(d, 'metrosCuadrados')
  if (metros !== null) detalles.push(`${metros} m²`)
  const anio = entero(d, 'anioConstruccion')
  // Un año de cuatro cifras o no es un año. Sin esto, un `1` de una columna mal
  // migrada saldría como «Construido en 1».
  if (anio !== null && anio >= 1000 && anio <= 2999) detalles.push(`Construido en ${anio}`)

  // ── Vehículo ──────────────────────────────────────────────────────────────
  if (RAMOS_VEHICULO.has(r) || campo(d, 'matricula') !== null) {
    const marcaModelo = [campo(d, 'marca'), campo(d, 'modelo')].filter(Boolean).join(' ')
    const matricula = campo(d, 'matricula')
    const cosa = [marcaModelo || null, matricula].filter(Boolean).join(' · ')
    return { cosa: cosa || null, ubicacion: null, detalles }
  }

  // ── Inmueble ──────────────────────────────────────────────────────────────
  // La dirección se compone AQUÍ y sale como un solo campo: partirla en calle,
  // CP y localidad dejaría a quien aplica el nivel decidiendo cuál de los tres
  // trozos es personal, y la respuesta es que los tres lo son juntos.
  if (RAMOS_INMUEBLE.has(r) || campo(d, 'direccion') !== null) {
    const ubicacion = componerUbicacion(campo(d, 'direccion'), campo(d, 'cp'), campo(d, 'localidad'))
    return { cosa: null, ubicacion, detalles }
  }

  // Un ramo sin bien descriptible (vida, decesos, salud…). No es un error: es
  // que no hay una cosa que enseñar, y se dice callando.
  return { cosa: null, ubicacion: null, detalles }
}

/**
 * El bien, rescatando los datos de la fila GEMELA cuando la viva no dice nada.
 *
 * 🚨 Por qué hace falta (medido el 07/09/2026). En la cartera hay pólizas
 * DUPLICADAS: la misma (mismo cliente, mismo número, mismo ramo, misma fecha de
 * efecto) entró dos veces —una por el volcado del CRM (`import_ref`, con
 * `datos_especificos` completos) y otra por CIMA (`eiac_xml_hash`, con las
 * fechas al día pero SIN `datos_especificos`)— porque el nombre de la
 * aseguradora no coincidía y la ingesta no las emparejó. `esCarteraViva()` sirve
 * la de CIMA, que es la correcta en todo… menos en el único campo que dice qué
 * casa es. Le pasa a **11 de las 19 hogar vivas**.
 *
 * La regla es de TODO o NADA, nunca clave a clave: si los datos de la fila viva
 * ya describen algo, se usan tal cual; si no describen nada, se usan los de la
 * gemela ENTEROS. Mezclarlas cruzaría dos contratos, y el resultado sería
 * plausible —una dirección de una y unos metros de la otra— que es la forma cara
 * de equivocarse.
 *
 * Esto NO arregla el duplicado, solo deja de esconder el dato. El duplicado se
 * arregla en la ingesta.
 */
export function describirBienConGemela(
  ramo: string | null | undefined,
  datosEspecificos: unknown,
  datosGemela: unknown,
): BienAsegurado {
  const propio = describirBien(ramo, datosEspecificos)
  if (bienTieneAlgo(propio)) return propio
  return describirBien(ramo, datosGemela)
}

/**
 * La forma de un texto para COMPARARLO, nunca para enseñarlo.
 *
 * Minúsculas, sin acentos y con todo lo que no sea letra o número convertido en
 * un espacio: así «11520 Costa Ballena» y «11520 costa ballena,» son el mismo
 * texto a efectos de «¿está ya dicho?». Lo que se pinta es SIEMPRE el original.
 */
function paraComparar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

/**
 * La dirección del inmueble, en una línea y SIN repetir lo que la calle ya dice.
 *
 * 🚨 Por qué existe (08/09/2026). Se componía `calle, cp localidad` a ciegas, y
 * en la cartera real la calle del volcado a veces trae ya el CP dentro: Alberto
 * vio en su portal **«MARINA GOLF 82, 11520 costa ballena, 11520 ROTA»**. El
 * código postal dos veces, en el título de la tarjeta.
 *
 * Las dos reglas son distintas a propósito, y la asimetría es lo importante:
 *
 * - **El CP se omite si aparece en cualquier parte de la calle.** Es un número
 *   de cinco cifras: que el MISMO CP salga dentro de la calle por casualidad es
 *   casi imposible, así que quitarlo es seguro.
 * - **La localidad solo se omite si la calle TERMINA con ella.** Aquí sí hay
 *   homónimos que muerden: «Avenida de Sevilla 4» en Dos Hermanas no puede
 *   perder su localidad porque la calle mencione Sevilla. Duplicar al final es
 *   el único caso que se ve feo, y es el único que se corrige.
 *
 * Y nada más: la calle se pinta TAL CUAL. No se normalizan mayúsculas,
 * abreviaturas ni comas — es el dato del cliente, no nuestro, y «arreglarlo»
 * sería inventar sobre una dirección que puede estar en una póliza.
 */
export function componerUbicacion(
  calle: string | null,
  cp: string | null,
  localidad: string | null,
): string | null {
  const c = calle === null ? null : paraComparar(calle)

  const cpFuera = cp !== null && c !== null && new RegExp(`(^| )${paraComparar(cp)}( |$)`).test(c)
  const locComp = localidad === null ? null : paraComparar(localidad)
  const locFuera = locComp !== null && locComp !== '' && c !== null && (c === locComp || c.endsWith(` ${locComp}`))

  const cola = [cpFuera ? null : cp, locFuera ? null : localidad].filter(Boolean).join(' ')
  // Si la calle se lo lleva todo, la calle basta; y si no hay calle, la cola
  // sola sigue diciendo el pueblo, que es más que nada.
  return [calle, cola || null].filter(Boolean).join(', ') || null
}

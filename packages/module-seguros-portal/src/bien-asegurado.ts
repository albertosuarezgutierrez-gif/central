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
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 LA LÍNEA QUE SEPARA LOS DOS CAMPOS DE SALIDA, y no es una sutileza:
//
//   `cosa`      = QUÉ está asegurado (marca, modelo, matrícula). Es un dato del
//                 CONTRATO, y por eso lo ve hasta el nivel más bajo: quien
//                 conduce la furgoneta de su padre necesita saber cuál es la
//                 furgoneta. Es literalmente el ejemplo con el que se escribió
//                 `acceso.ts`.
//
//   `ubicacion` = DÓNDE está el riesgo, o sea **la dirección donde duerme el
//                 titular**. Eso no es un dato del contrato: es un dato de la
//                 PERSONA, del mismo lado que su DNI. Un tercero no lo ve
//                 NUNCA cuando quien cede es una persona física — ni con
//                 `ver_economico`—, exactamente por la misma razón por la que
//                 no ve sus siniestros abiertos (04/09/2026). Cuando quien cede
//                 es una SOCIEDAD sí: la dirección de una nave es un dato de la
//                 empresa, y quien la representa lo necesita para su trabajo.
//
// Quien colapse los dos en un solo campo estará regalando la dirección de una
// casa a quien solo pidió ver de qué compañía es el seguro. No fallaría nada:
// saldría.
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
  return textoConDato(v)
}

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
    const calle = campo(d, 'direccion')
    const cp = campo(d, 'cp')
    const localidad = campo(d, 'localidad')
    const cola = [cp, localidad].filter(Boolean).join(' ')
    const ubicacion = [calle, cola || null].filter(Boolean).join(', ')
    return { cosa: null, ubicacion: ubicacion || null, detalles }
  }

  // Un ramo sin bien descriptible (vida, decesos, salud…). No es un error: es
  // que no hay una cosa que enseñar, y se dice callando.
  return { cosa: null, ubicacion: null, detalles }
}

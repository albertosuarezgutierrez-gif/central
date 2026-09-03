// Autorizar a un TERCERO a ver tus seguros — las reglas, sin BD.
//
// El caso de Alberto: José deja que su mujer María vea su póliza del coche.
// Hasta el 03/09/2026 eso vivía en un booleano del CRM
// (`cliente_relaciones.puede_ver_polizas`) y ese booleano no podía sostenerse:
//
//   - No decía QUIÉN lo concedió, ni CUÁNDO, ni con qué texto, ni cómo se
//     revoca. El art. 7.1 RGPD no pide tener el consentimiento: pide poder
//     DEMOSTRARLO, y una casilla suelta no demuestra nada.
//   - Las 104 filas que lo tenían a `true` se crearon TODAS el 21/06/2026, el
//     día del volcado del CRM. Ninguna la otorgó un cliente en una pantalla.
//   - No tenía alcance: se leía como nivel `completo`, que enseña el IBAN y el
//     DNI del otorgante. Eso no es «ver mis seguros», es ver a la PERSONA.
//
// Este fichero es el contrato de la tabla que lo sustituye
// (`seguros.portal_autorizacion`). Cuatro decisiones que fija, y por qué:
//
//   1. **Nace apagada y con fecha de fin.** Art. 25.2 RGPD (protección de datos
//      POR DEFECTO). Nada se hereda: una autorización que nadie otorgó no
//      existe. Y `caduca_en` no es una cortesía — es lo único que resuelve el
//      caso que de verdad revienta esto, que es el divorcio: nadie entra al
//      portal a revocar el día que se separa.
//   2. **Doble aceptación.** El otorgante concede y el autorizado ACEPTA. Sin
//      la segunda mitad, María entra en los datos de otro sin saber que hay un
//      registro con su nombre — y ese registro es justo lo que la hace
//      responsable de lo que mire. Es el modelo del Registro de
//      Apoderamientos de la AEAT, no un invento.
//   3. **Leer no es actuar.** Ver es una cesión de datos bajo el
//      consentimiento del otorgante. Dar un parte o modificar en nombre de
//      otro es REPRESENTACIÓN, y un tick en una pantalla no es un poder: si
//      María declara mal, la compañía discute la cobertura (art. 16 LCS) y hay
//      que poder decir quién firmó. Por eso los alcances `partes` y
//      `documentos` existen en el vocabulario —son los que enumeró Alberto—
//      pero NO se conceden en Fase 1 (`ALCANCES_CONCEDIBLES`), y el puerto lo
//      dice con una razón, no lo ignora en silencio.
//   4. **Un tercero nunca ve al otorgante, solo a sus seguros.** IBAN y DNI
//      quedan fuera de CUALQUIER alcance (`camposDeAlcance`), pase lo que pase
//      con los niveles. Es minimización (art. 5.1.c) y es la misma línea que
//      ya traza `acceso.ts`: dato de la COSA ≠ dato de la PERSONA.
import { camposVisibles, type CamposVisibles, type Nivel } from './acceso.ts'

/** Lo que Alberto enumeró que se podía autorizar, en su orden. */
export const ALCANCES = ['ver', 'ver_economico', 'partes', 'documentos'] as const
export type Alcance = (typeof ALCANCES)[number]

/**
 * Los que se pueden conceder HOY. Los otros dos son apoderamiento (ver cabecera)
 * y entran cuando exista dónde grabar la identidad de quien ejecuta cada acto.
 */
export const ALCANCES_CONCEDIBLES: readonly Alcance[] = ['ver', 'ver_economico']

/** Un año. Se renueva; no se prorroga sola. */
export const DIAS_VIGENCIA = 365

export const ESTADOS_AUTORIZACION = ['pendiente', 'vigente', 'caducada', 'revocada'] as const
export type EstadoAutorizacion = (typeof ESTADOS_AUTORIZACION)[number]

export type AutorizacionFechas = {
  aceptadoEn: Date | null
  caducaEn: Date
  revocadoEn: Date | null
}

/**
 * El estado de UNA autorización a una fecha. El orden importa y no es
 * arbitrario: revocar es definitivo, así que gana a todo; una que caducó sin
 * aceptarse ya no puede llegar a valer, así que se dice «caducada» y no
 * «pendiente» — decir «pendiente» invitaría a esperar algo que no va a pasar.
 */
export function estadoAutorizacion(a: AutorizacionFechas, hoy: Date): EstadoAutorizacion {
  if (a.revocadoEn !== null) return 'revocada'
  if (a.caducaEn.getTime() <= hoy.getTime()) return 'caducada'
  if (a.aceptadoEn === null) return 'pendiente'
  return 'vigente'
}

/** La ÚNICA pregunta que abre datos ajenos. Todo lo demás es información. */
export function autorizacionVigente(a: AutorizacionFechas, hoy: Date): boolean {
  return estadoAutorizacion(a, hoy) === 'vigente'
}

export function caducidadPorDefecto(desde: Date): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA * 24 * 60 * 60 * 1000)
}

/**
 * Quién puede conceder sobre una ficha.
 *
 * El consentimiento para ceder tus datos es tuyo, así que lo concede quien es
 * dueño de la ficha — y en `portal_vinculo` eso son los niveles que el alta da
 * al tomador (`gestionar` por defecto). `tarjeta` y `completo` son los niveles
 * de quien NO es dueño (el conductor de la furgoneta, un autorizado): ese no
 * puede regalar los datos de otro.
 *
 * Deliberadamente NO se toca `camposVisibles.autorizarTerceros`, que solo es
 * `true` en `administrar`: aquella escalera dice qué se VE de una póliza, y
 * esto es otra pregunta.
 */
export function puedeAutorizar(nivel: Nivel): boolean {
  return nivel === 'gestionar' || nivel === 'administrar'
}

/** `null` = no es un alcance, o no es de los que hoy se pueden conceder. */
export function alcanceConcedible(v: unknown): Alcance | null {
  if (typeof v !== 'string') return null
  const a = v.trim().toLowerCase()
  return (ALCANCES_CONCEDIBLES as readonly string[]).includes(a) ? (a as Alcance) : null
}

export function esAlcance(v: unknown): v is Alcance {
  return typeof v === 'string' && (ALCANCES as readonly string[]).includes(v)
}

/**
 * Suelo duro de toda autorización a un tercero. No depende del alcance ni del
 * nivel: son datos de la PERSONA (IBAN, DNI, sus documentos) o son ACTOS en su
 * nombre. Que estén aquí y no en la escalera de `acceso.ts` es a propósito —
 * así ningún alcance nuevo los puede reabrir por descuido.
 */
const NUNCA_A_UN_TERCERO = {
  iban: false,
  dniTomador: false,
  documentos: false,
  abrirParte: false,
  crearPeticiones: false,
  autorizarTerceros: false,
} as const

const NIVEL_DE_ALCANCE: Record<Alcance, Nivel> = {
  ver: 'tarjeta',
  ver_economico: 'completo',
  partes: 'completo',
  documentos: 'completo',
}

/** Qué enseña un alcance concreto, ya capado. */
export function camposDeAlcance(alcance: Alcance): CamposVisibles {
  return { ...camposVisibles(NIVEL_DE_ALCANCE[alcance]), ...NUNCA_A_UN_TERCERO }
}

/**
 * Qué enseña el CONJUNTO de alcances vigentes de una persona sobre una ficha:
 * la unión campo a campo, con el mismo suelo. Sin alcances vigentes no se
 * enseña nada — y «nada» aquí significa nada, no la tarjeta por cortesía.
 */
export function camposDeAlcances(alcances: readonly Alcance[]): CamposVisibles | null {
  if (alcances.length === 0) return null
  const base = camposDeAlcance(alcances[0])
  const union = { ...base }
  for (const a of alcances.slice(1)) {
    const c = camposDeAlcance(a)
    for (const k of Object.keys(union) as (keyof CamposVisibles)[]) union[k] ||= c[k]
  }
  return { ...union, ...NUNCA_A_UN_TERCERO }
}

/**
 * Etiqueta de nivel para pintar («ve la tarjeta» / «ve también lo económico»).
 * Es SOLO para el texto: lo que de verdad decide qué se sirve es
 * `camposDeAlcances`, que va capado. Nunca uses esto para autorizar nada.
 */
export function etiquetaNivelAlcances(alcances: readonly Alcance[]): Nivel {
  return alcances.includes('ver_economico') ? 'completo' : 'tarjeta'
}

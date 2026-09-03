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
 * Qué es quien cede. **No es cosmético: es la línea que parte esta regla en dos.**
 *
 * El RGPD protege a las personas FÍSICAS. Una sociedad no tiene datos personales,
 * así que «Pilar gestiona las pólizas de GLOBAL 2» no es un problema de
 * consentimiento: es **representación mercantil**, la misma figura que un
 * apoderado en un banco. Por eso una jurídica puede delegar lo que una física no.
 *
 * Lo que NO desaparece con una jurídica: que conste **con qué título** actúa
 * (`tituloRepresentacion`), porque si da un parte, la que queda obligada es la
 * sociedad. Y que la ficha de la sociedad puede arrastrar datos de personas
 * físicas (conductores, empleados): eso lo tapa la vista, no esta regla.
 */
export type TipoOtorgante = 'fisica' | 'juridica'

/**
 * De una persona FÍSICA solo se puede delegar mirar.
 *
 * `partes` y `documentos` son apoderamiento: actuar en nombre de otro. Si María
 * declara mal, la compañía discute la cobertura (art. 16 LCS) y hay que poder
 * decir quién firmó — y un tick en una pantalla no es un poder.
 */
export const ALCANCES_CONCEDIBLES: readonly Alcance[] = ['ver', 'ver_economico']

/** Una sociedad delega TODO: quien la representa actúa por ella, no «en nombre de un tercero». */
export function alcancesConcedibles(tipo: TipoOtorgante): readonly Alcance[] {
  return tipo === 'juridica' ? ALCANCES : ALCANCES_CONCEDIBLES
}

/** Títulos con los que se puede representar a una sociedad. Se guarda cuál. */
export const TITULOS_REPRESENTACION = ['administrador', 'apoderado', 'empleado_autorizado'] as const
export type TituloRepresentacion = (typeof TITULOS_REPRESENTACION)[number]

export function tituloRepresentacion(v: unknown): TituloRepresentacion | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return (TITULOS_REPRESENTACION as readonly string[]).includes(t) ? (t as TituloRepresentacion) : null
}

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

/**
 * `null` = no es un alcance, o no es de los que se pueden conceder para ESE tipo
 * de otorgante. `tipo` por defecto `'fisica'`: quien no diga qué es, se trata
 * como persona, que es el lado restrictivo. Un default permisivo aquí abriría
 * apoderamientos por omisión.
 */
export function alcanceConcedible(v: unknown, tipo: TipoOtorgante = 'fisica'): Alcance | null {
  if (typeof v !== 'string') return null
  const a = v.trim().toLowerCase()
  return (alcancesConcedibles(tipo) as readonly string[]).includes(a) ? (a as Alcance) : null
}

export function esAlcance(v: unknown): v is Alcance {
  return typeof v === 'string' && (ALCANCES as readonly string[]).includes(v)
}

/**
 * Suelo duro cuando quien cede es una persona FÍSICA. No depende del alcance ni
 * del nivel: son datos de la PERSONA (IBAN, DNI, sus documentos) o son ACTOS en
 * su nombre. Que estén aquí y no en la escalera de `acceso.ts` es a propósito —
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

/**
 * Suelo cuando quien cede es una SOCIEDAD. Casi no hay: su IBAN y su CIF son
 * datos de la empresa, y quien la representa los necesita para su trabajo.
 *
 * Lo único que no se delega nunca es **reautorizar a un cuarto**: que la
 * sociedad amplíe el círculo es una decisión suya, y tiene que pasar por su
 * propio camino de representación, no heredarse de una autorización.
 */
const NUNCA_NI_REPRESENTANDO = { autorizarTerceros: false } as const

const NIVEL_DE_ALCANCE: Record<Alcance, Nivel> = {
  ver: 'tarjeta',
  ver_economico: 'completo',
  partes: 'gestionar',
  documentos: 'completo',
}

/** Qué enseña un alcance concreto, ya capado según quién cede. */
export function camposDeAlcance(alcance: Alcance, tipo: TipoOtorgante = 'fisica'): CamposVisibles {
  const base = camposVisibles(NIVEL_DE_ALCANCE[alcance])
  if (tipo === 'fisica') return { ...base, ...NUNCA_A_UN_TERCERO }
  // Una sociedad delega su gestión, pero `documentos` y `partes` son alcances
  // distintos: tener uno no da el otro. Se abren de uno en uno, no en bloque.
  return {
    ...base,
    documentos: alcance === 'documentos' || alcance === 'partes' ? base.documentos : false,
    abrirParte: alcance === 'partes' ? base.abrirParte : false,
    crearPeticiones: alcance === 'partes' ? base.crearPeticiones : false,
    ...NUNCA_NI_REPRESENTANDO,
  }
}

/**
 * Qué enseña el CONJUNTO de alcances vigentes de una persona sobre una ficha:
 * la unión campo a campo, con el mismo suelo. Sin alcances vigentes no se
 * enseña nada — y «nada» aquí significa nada, no la tarjeta por cortesía.
 */
export function camposDeAlcances(
  alcances: readonly Alcance[],
  tipo: TipoOtorgante = 'fisica',
): CamposVisibles | null {
  if (alcances.length === 0) return null
  const base = camposDeAlcance(alcances[0], tipo)
  const union = { ...base }
  for (const a of alcances.slice(1)) {
    const c = camposDeAlcance(a, tipo)
    for (const k of Object.keys(union) as (keyof CamposVisibles)[]) union[k] ||= c[k]
  }
  return tipo === 'fisica'
    ? { ...union, ...NUNCA_A_UN_TERCERO }
    : { ...union, ...NUNCA_NI_REPRESENTANDO }
}

/**
 * Etiqueta de nivel para pintar («ve la tarjeta» / «ve también lo económico»).
 * Es SOLO para el texto: lo que de verdad decide qué se sirve es
 * `camposDeAlcances`, que va capado. Nunca uses esto para autorizar nada.
 */
export function etiquetaNivelAlcances(alcances: readonly Alcance[]): Nivel {
  if (alcances.includes('partes')) return 'gestionar'
  return alcances.includes('ver_economico') || alcances.includes('documentos') ? 'completo' : 'tarjeta'
}

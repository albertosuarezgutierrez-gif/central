/**
 * La fecha que se le dice al usuario NO es la del vencimiento: es la última en
 * la que todavía puede oponerse a la prórroga (art. 22 LCS). Decirle «vence el
 * 15 de marzo» le deja creer que tiene hasta el 15; el plazo se le pasó el 13
 * de febrero.
 *
 * Se resta en DÍAS, no en meses: `setUTCMonth(m - 1)` sobre un 31 de marzo da
 * un 31 de febrero, que JavaScript normaliza al 3 de marzo sin avisar.
 */
import { esCarteraViva } from '@central/module-seguros'

export const DIAS_PREAVISO_TOMADOR = 30

const MS_DIA = 86_400_000

/** Medianoche UTC del día de `d`. Las columnas `date` ya llegan así; esto lo garantiza. */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function fechaAccionable(fechaEvento: Date): Date {
  return new Date(diaUtc(fechaEvento).getTime() - DIAS_PREAVISO_TOMADOR * MS_DIA)
}

/**
 * Cuánto antes de la fecha accionable puede haber salido, como mucho, un aviso de ESTE ciclo: la mayor
 * antelación elegible en «Configuración» (`DIAS_ANTELACION_MAX` = 30, en `preferencias-avisos.ts`) + 1
 * de margen. Literal y no importado para no cerrar un ciclo de imports; un test vigila que coincidan.
 */
export const DIAS_VIGENCIA_SELLO = 31

/**
 * ¿Este sello (`avisadaAt`/`avisadaPushAt`) es de ESTE ciclo de la obligación? (14/10/2026). Un sello
 * anterior a `fechaAccionable − DIAS_VIGENCIA_SELLO` es del vencimiento del año pasado: no prueba que se
 * haya avisado de este. `null` = no hay sello.
 */
export function selloDeEsteCiclo(sello: Date | null, fechaAccionableActual: Date): boolean {
  if (sello === null) return false
  return sello.getTime() >= diaUtc(fechaAccionableActual).getTime() - DIAS_VIGENCIA_SELLO * MS_DIA
}

/**
 * Los sellos que hay que SOLTAR al re-sincronizar una obligación de cartera (14/10/2026).
 *
 * 🚨 Una obligación de cartera es UNA fila por (identidad, póliza, tipo) que se reutiliza año tras año:
 * al renovar, el upsert le cambia las fechas. Si los sellos del año pasado siguen puestos, ningún cron
 * vuelve a avisar: el año 2 el preaviso del art. 22 LCS no sale por NINGÚN canal, y nada falla.
 *
 * Criterio por ANTIGÜEDAD del sello y no por «cambió la fecha»: así también se cura sola una fila cuya
 * fecha ya se renovó antes de este arreglo (la sincronización siguiente no ve cambio, pero el sello es
 * viejo). Un sello de este ciclo se conserva: reabrirlo repetiría un aviso ya mandado.
 * Fila nueva (`previa` ausente) → `{}`.
 */
export function sellosAReiniciar(
  previa: { avisadaAt: Date | null; avisadaPushAt: Date | null } | undefined,
  fechaAccionableNueva: Date,
): { avisadaAt?: null; avisadaPushAt?: null } {
  if (!previa) return {}
  const out: { avisadaAt?: null; avisadaPushAt?: null } = {}
  if (previa.avisadaAt !== null && !selloDeEsteCiclo(previa.avisadaAt, fechaAccionableNueva)) out.avisadaAt = null
  if (previa.avisadaPushAt !== null && !selloDeEsteCiclo(previa.avisadaPushAt, fechaAccionableNueva)) out.avisadaPushAt = null
  return out
}

/**
 * El id del vencimiento que el correo de la intranet DERIVA de la póliza cuando el cliente no tiene
 * obligación en el portal (nunca ha abierto su bóveda: 27/09/2026). Es la clave con la que se sella
 * (`obligacion_en_ventana:<esto>`), y el cron de vencimientos la mira antes de mandar la suya: si el
 * cliente entra después y nace la obligación, no le llega el mismo vencimiento dos veces.
 */
export function idVencimientoDerivado(polizaId: string, fechaVencimiento: Date): string {
  return `pv:${polizaId}:${diaUtc(fechaVencimiento).toISOString().slice(0, 10)}`
}

/**
 * Un ÚNICO disparo, a 7 días o menos de la fecha accionable (más UN recordatorio
 * si no ha entrado: `debeRecordarVencimiento`, 27/09/2026). Una cadencia de
 * recordatorios («a 30, a 15, a 7…») es una decisión de producto que necesita
 * datos de apertura que hoy no existen; empezar con tres avisos y descubrir
 * después que sobraban dos ya ha quemado la bandeja del cliente.
 */
export const DIAS_VENTANA_AVISO = 7

/**
 * `dias` (13/10/2026): la antelación que la persona eligió para SUS avisos push en «Configuración»
 * (`resolverPreferenciasAvisos()` de `preferencias-avisos.ts`). Sin él, los 7 de siempre. El correo de
 * `apps/asegura`, el digest y la campana pasan `diasVentanaVencimiento()` (nunca menos de 7; 14/10/2026).
 */
export function entraEnVentana(x: { fechaAccionable: Date; hoy: Date; dias?: number }): boolean {
  const faltan = Math.round((diaUtc(x.fechaAccionable).getTime() - diaUtc(x.hoy).getTime()) / MS_DIA)
  return faltan >= 0 && faltan <= (x.dias ?? DIAS_VENTANA_AVISO)
}

/**
 * Días antes de la fecha accionable en los que se RECUERDA el vencimiento (27/09/2026).
 *
 * El primer aviso sale a 7 días. Si el cliente no ha entrado al portal desde entonces, a 2 días se le
 * escribe UNA vez más: pasada la fecha accionable ya no puede oponerse a la prórroga (art. 22 LCS),
 * así que es el último momento útil. Solo uno: más sería cómo un canal útil deja de abrirse.
 */
export const DIAS_RECORDATORIO_VENCIMIENTO = 2

/** Días mínimos entre el primer aviso y el recordatorio: dos correos seguidos no son un recordatorio. */
export const DIAS_MIN_ENTRE_AVISOS = 2

export function debeRecordarVencimiento(x: {
  fechaAccionable: Date
  /** Cuándo salió el primer aviso por correo. */
  avisadoEn: Date
  /** Último acceso al portal de cualquiera de sus identidades. `null` = nunca ha entrado. */
  ultimoAcceso: Date | null
  hoy: Date
}): boolean {
  const faltan = Math.round((diaUtc(x.fechaAccionable).getTime() - diaUtc(x.hoy).getTime()) / MS_DIA)
  if (faltan < 0 || faltan > DIAS_RECORDATORIO_VENCIMIENTO) return false
  if (x.hoy.getTime() - x.avisadoEn.getTime() < DIAS_MIN_ENTRE_AVISOS * MS_DIA) return false
  // Entró después del primer aviso: lo ha visto. No se le insiste.
  return x.ultimoAcceso === null || x.ultimoAcceso.getTime() < x.avisadoEn.getTime()
}

/**
 * 🚨 La regla que evita el desastre. Solo generan obligación las pólizas de la
 * CARTERA VIVA; las del volcado histórico se consultan y nada más.
 *
 * Qué es «viva» NO se decide aquí: es `esCarteraViva()` de
 * `@central/module-seguros` (`cartera-viva.ts`), y no basta con
 * `import_ref IS NULL`. Una fila del volcado que la ingesta de CIMA mantiene al
 * día conserva su `import_ref` viejo y se marca con `eiac_xml_hash`: es cartera
 * de hoy y su vencimiento SÍ hay que avisarlo. Medido el 03/09/2026 sobre la
 * cartera real; con la regla de un solo brazo se caía un cliente entero.
 *
 * `importRef: ''` sigue contando como volcado a propósito: la cadena vacía es el
 * valor de cajón que se cuela por `IS NULL`, `??` y `COALESCE`. Ante la duda, el
 * estado conservador es NO avisar.
 */
export function polizaGeneraObligacion(p: {
  importRef: string | null
  /** OBLIGATORIO a propósito: si fuera opcional, quien olvide pedirlo a la BD
   *  volvería a la regla vieja de un solo brazo sin que nada fallase. */
  eiacXmlHash: string | null
  fechaVencimiento: Date | null
}): boolean {
  if (!esCarteraViva(p)) return false
  return p.fechaVencimiento !== null
}

/**
 * 🚨 El segundo cepo, y el que faltaba — medido contra la cartera real el
 * 02/09/2026. `import_ref IS NULL` NO significa «viva y actual»: de las 109
 * pólizas que entran por CIMA,
 *
 *   · **42 están `cancelada`** (5 de ellas con vencimiento futuro), y
 *   · **18 están `activa` con el vencimiento ya pasado** — la más vieja, de
 *     **enero de 2013**.
 *
 * Sin este cepo el calendario del cliente diría «tienes hasta el 13/02/2015
 * para decidir si la renuevas» de una póliza muerta, y las 5 canceladas con
 * fecha futura llegarían a disparar un correo real. Las dos cosas son la misma
 * mentira: un dato viejo presentado como actual.
 *
 * `vigencia` la decide `vigenciaPoliza()` de `@central/module-seguros`, que ya
 * es de tres estados: `'pendiente'` («no se sabe», sin fecha) tampoco deriva —
 * pero NO se calla, se cuenta aparte para que la pantalla lo diga.
 */
export type VigenciaObligacion = 'vigente' | 'no_vigente' | 'pendiente'

export function obligacionDerivable(p: {
  importRef: string | null
  eiacXmlHash: string | null
  fechaVencimiento: Date | null
  vigencia: VigenciaObligacion
}): boolean {
  if (!polizaGeneraObligacion(p)) return false
  return p.vigencia === 'vigente'
}

/**
 * Por qué una póliza DECLARADA por la persona todavía no genera obligación.
 * `null` = sí la genera.
 *
 * Es la hermana de `obligacionDerivable()` y NO comparte sus cepos a propósito:
 * aquellos preguntan de dónde salió la fila en la CARTERA (`import_ref`,
 * `eiac_xml_hash`, `vigencia`), y una póliza declarada no sale de la cartera —
 * la ha traído su dueño, que puede no ser cliente de la correduría.
 *
 * Devuelve el MOTIVO y no un booleano porque la pantalla tiene que poder
 * decirlo. Una póliza que se guarda pero de la que nadie va a avisar, sin que
 * se diga, es la mentira de siempre: la persona cree que está cubierta por un
 * aviso que no va a llegar nunca.
 */
export type ReparoDeclarada = 'sin_fecha' | 'sin_confirmar'

export function reparoDeclarada(p: {
  fechaVencimiento: Date | null
  confirmadaPorUsuario: boolean
}): ReparoDeclarada | null {
  // `sin_fecha` manda sobre `sin_confirmar`: sin fecha no hay nada que contar
  // hacia atrás, así que es lo primero que la persona tiene que arreglar —
  // confirmar una póliza a la que le falta la fecha no la haría avisable.
  if (p.fechaVencimiento === null) return 'sin_fecha'
  // Una póliza subida en PDF nace con `confirmadaPorUsuario: false`: las fechas
  // las ha adivinado un extractor. Avisar sobre una fecha que leyó una IA y que
  // nadie ha mirado es PEOR que no avisar — el correo llega, la persona se fía,
  // y el día bueno era otro. Ante la duda, el estado conservador es callar, la
  // misma regla que `polizaGeneraObligacion` aplica a `importRef: ''`.
  if (!p.confirmadaPorUsuario) return 'sin_confirmar'
  return null
}

/**
 * Atajo para quien solo necesita el sí/no. Se define SOBRE `reparoDeclarada()`
 * y no al revés: así no pueden separarse el día que se añada un tercer motivo.
 */
export function declaradaGeneraObligacion(p: {
  fechaVencimiento: Date | null
  confirmadaPorUsuario: boolean
}): boolean {
  return reparoDeclarada(p) === null
}

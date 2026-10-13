/**
 * Preferencias de avisos del portal (13/10/2026): por qué canal, con cuánta antelación y en qué
 * franja NO molestar. Fila en `seguros.portal_preferencias_avisos` (una por identidad), DDL en
 * `apps/asegura-portal/prisma/sql/2026-10-13_configuracion_avisos.sql`.
 *
 * 🚨 `null` = «no lo ha configurado», NUNCA «no quiere»: sin fila, o con la columna a `null`, manda lo
 * que el portal hacía antes de que existiera esta pantalla (push activo, 7 días, sin franja). Así el
 * despliegue no cambia nada a quien no entre en «Configuración».
 *
 * Qué respeta cada canal HOY (y la pantalla lo dice tal cual):
 *  · Los dos crons de push del portal (`avisos-push`, `avisos-cima`) leen el canal, la antelación y
 *    la franja.
 *  · El CORREO de vencimiento lo manda `apps/asegura` y todavía NO lee esta tabla: elegir «solo en el
 *    móvil» no lo detiene. Pendiente, anotado en el informe de la fase A.
 */

export const CANALES_AVISO = ['movil', 'correo', 'ambos'] as const
export type CanalAviso = (typeof CANALES_AVISO)[number]

/** Lo que se puede elegir de antelación para el aviso de vencimiento, en días. */
export const DIAS_ANTELACION_OPCIONES = [3, 7, 15, 30] as const
export type DiasAntelacion = (typeof DIAS_ANTELACION_OPCIONES)[number]

/** El mayor de los anteriores: la criba SQL del cron tiene que llegar hasta aquí. */
export const DIAS_ANTELACION_MAX: DiasAntelacion = 30

/** Lo de antes de esta pantalla (= `DIAS_VENTANA_AVISO`): un `null` vale esto. */
export const DIAS_ANTELACION_POR_DEFECTO: DiasAntelacion = 7

/** «Ahora no» en la bienvenida de avisos: no se vuelve a preguntar hasta pasados estos días. */
export const DIAS_POSPONER_BIENVENIDA = 14

/** La hora de «no molestar» es la de España peninsular, no la del servidor (UTC). */
export const ZONA_HORARIA_AVISOS = 'Europe/Madrid'

const MINUTOS_DIA = 24 * 60

/** Lo guardado, tal cual sale de la BD (todo `null` = sin configurar). */
export interface PreferenciasAvisosGuardadas {
  canal: string | null
  diasAntelacion: number | null
  /** Minutos desde medianoche (0..1439), hora de Madrid. */
  noMolestarDesde: number | null
  noMolestarHasta: number | null
}

export interface FranjaNoMolestar {
  desde: number
  hasta: number
}

/** Lo que los crons y la pantalla usan: con los valores por defecto ya puestos. */
export interface PreferenciasAvisosEfectivas {
  canal: CanalAviso
  diasAntelacion: DiasAntelacion
  noMolestar: FranjaNoMolestar | null
}

export function esCanalAviso(v: unknown): v is CanalAviso {
  return typeof v === 'string' && (CANALES_AVISO as readonly string[]).includes(v)
}

export function esDiasAntelacion(v: unknown): v is DiasAntelacion {
  return typeof v === 'number' && (DIAS_ANTELACION_OPCIONES as readonly number[]).includes(v)
}

function esMinutoDelDia(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < MINUTOS_DIA
}

/**
 * De la fila (o su ausencia) a lo efectivo. Un valor que no se reconoce (un CHECK que se amplió en la
 * BD y no aquí, por ejemplo) vale como no configurado: se vuelve a lo de antes, no se inventa.
 * La franja exige las DOS horas y distintas; media franja no silencia nada.
 */
export function resolverPreferenciasAvisos(g: PreferenciasAvisosGuardadas | null): PreferenciasAvisosEfectivas {
  const canal: CanalAviso = g && esCanalAviso(g.canal) ? g.canal : 'ambos'
  const diasAntelacion: DiasAntelacion = g && esDiasAntelacion(g.diasAntelacion) ? g.diasAntelacion : DIAS_ANTELACION_POR_DEFECTO
  const desde = g?.noMolestarDesde
  const hasta = g?.noMolestarHasta
  const noMolestar = esMinutoDelDia(desde) && esMinutoDelDia(hasta) && desde !== hasta ? { desde, hasta } : null
  return { canal, diasAntelacion, noMolestar }
}

/** Minutos desde medianoche de `ahora` en hora de Madrid (cambia sola con el horario de verano). */
export function minutoEnMadrid(ahora: Date): number {
  const partes = new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA_HORARIA_AVISOS,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora)
  const h = Number(partes.find((p) => p.type === 'hour')?.value)
  const m = Number(partes.find((p) => p.type === 'minute')?.value)
  return (h % 24) * 60 + m
}

/**
 * ¿Cae `ahora` dentro de la franja? `desde` incluido, `hasta` excluido. Si `desde > hasta` la franja
 * cruza la medianoche (22:00–08:00), que es el caso normal de «no molestar».
 */
export function enNoMolestar(franja: FranjaNoMolestar | null, ahora: Date): boolean {
  if (!franja) return false
  const m = minutoEnMadrid(ahora)
  if (franja.desde < franja.hasta) return m >= franja.desde && m < franja.hasta
  return m >= franja.desde || m < franja.hasta
}

export type MotivoSinPush = 'canal_correo' | 'no_molestar'

/**
 * Por qué NO se manda ahora un push a esta persona, o `null` si se manda.
 *  · `canal_correo`: eligió «solo por correo». Los crons tratan sus tipos como silenciados.
 *  · `no_molestar`: estamos dentro de su franja. El cron NO sella: se reintenta en la pasada siguiente.
 */
export function motivoSinPush(p: PreferenciasAvisosEfectivas, ahora: Date): MotivoSinPush | null {
  if (p.canal === 'correo') return 'canal_correo'
  if (enNoMolestar(p.noMolestar, ahora)) return 'no_molestar'
  return null
}

/** `"HH:MM"` → minutos, o `null` si no es una hora válida. */
export function minutosDeHora(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Minutos → `"HH:MM"`. */
export function horaDeMinutos(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Lo que llega de la pantalla. Cada campo ausente se deja como está. */
export interface CambioPreferenciasAvisos {
  canal?: unknown
  diasAntelacion?: unknown
  /** `null` = quitar la franja; `{desde, hasta}` en `"HH:MM"`. */
  noMolestar?: unknown
}

export type ResultadoCambioPreferencias =
  | { ok: true; datos: Partial<PreferenciasAvisosGuardadas> }
  | { ok: false; error: 'canal_invalido' | 'dias_invalidos' | 'franja_invalida' | 'sin_cambios' }

/** Valida el cambio y lo deja en la forma de las columnas. Nada se escribe que no se haya validado. */
export function validarCambioPreferencias(c: CambioPreferenciasAvisos): ResultadoCambioPreferencias {
  const datos: Partial<PreferenciasAvisosGuardadas> = {}
  if (c.canal !== undefined) {
    if (!esCanalAviso(c.canal)) return { ok: false, error: 'canal_invalido' }
    datos.canal = c.canal
  }
  if (c.diasAntelacion !== undefined) {
    if (!esDiasAntelacion(c.diasAntelacion)) return { ok: false, error: 'dias_invalidos' }
    datos.diasAntelacion = c.diasAntelacion
  }
  if (c.noMolestar !== undefined) {
    if (c.noMolestar === null) {
      datos.noMolestarDesde = null
      datos.noMolestarHasta = null
    } else {
      const f = c.noMolestar as { desde?: unknown; hasta?: unknown }
      const desde = typeof f?.desde === 'string' ? minutosDeHora(f.desde) : null
      const hasta = typeof f?.hasta === 'string' ? minutosDeHora(f.hasta) : null
      if (desde === null || hasta === null || desde === hasta) return { ok: false, error: 'franja_invalida' }
      datos.noMolestarDesde = desde
      datos.noMolestarHasta = hasta
    }
  }
  if (Object.keys(datos).length === 0) return { ok: false, error: 'sin_cambios' }
  return { ok: true, datos }
}

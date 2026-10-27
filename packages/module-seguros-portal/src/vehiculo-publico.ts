/**
 * El QR del VEHÍCULO (27/10/2026, F1) — lo que ve quien lo escanea SIN sesión.
 *
 * Spec: `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §3.2. Un QR pegado en la guantera de un
 * coche (o bajo el asiento de una moto), de un PARTICULAR o de una EMPRESA. Lo escanea cualquiera: un agente,
 * el contrario de un golpe, el del taller. Por eso esta pieza no se escribe «quitando» campos de un objeto
 * grande, sino al revés:
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LA ALLOW-LIST ES DE SALIDA.
 *
 * `vistaPublicaVehiculo()` construye un objeto NUEVO copiando, uno a uno, los campos de una lista cerrada.
 * Nunca hace `...entrada` ni recorre las claves de lo que recibe: lo que llegue de más (la prima, el NIF, la
 * dirección, una fecha exacta, el nombre del titular) no tiene por dónde salir, aunque alguien lo meta mañana en
 * la lectura. Los interruptores solo ENCIENDEN trozos de esa lista; ninguno puede hacer salir algo de fuera.
 *
 * Y un interruptor mal guardado (no booleano, fila ausente, columna de más) no se interpreta: se aplica el
 * DEFECTO de ese interruptor. Resolución: fila del vehículo → defecto del dueño → defecto del código.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tres trozos, decididos por Alberto (spec §3.2), y nada más:
 *  - **Datos para carretera** (ON): matrícula, compañía, nº de póliza, teléfonos de la compañía (catálogo único,
 *    `canal-compania.ts`) y la razón social SOLO si el dueño es una persona JURÍDICA. 🚨 En el vehículo de un
 *    particular el nombre no sale nunca, sin interruptor; un autónomo es persona física → tampoco.
 *  - **Estado al día** (ON): un semáforo de ITV y otro de seguro, con cuatro valores y SIN fechas exactas.
 *  - **Recordatorios pendientes** (OFF): solo el TIPO y si está pendiente o vencido, sin título libre ni autor.
 *
 * 🚨 `no_sabemos` NO es un color de relleno: es la respuesta honesta cuando no lo sabemos, y nunca se colapsa en
 * `al_dia`. Sin fecha de matriculación no hay ITV que calcular; una ITV que sale de un ciclo SUPUESTO (o de una
 * matriculación estimada por la serie de la matrícula) tampoco es un «al día» que se pueda enseñar a un tercero;
 * y una póliza que no encontramos no es «sin seguro» (puede estar en otra correduría).
 */
import type { CanalCompania } from './canal-compania.ts'
import type { TipoFicha } from './dueno-empresa.ts'
import { DIAS_PRONTO_FLOTA, vencimientoFlota, type ItvVehiculo } from './flota.ts'

// ─── Interruptores ───────────────────────────────────────────────────────────

/** Los tres interruptores, con el nombre de su columna en Prisma (`portal_vehiculo_publico`). */
export type InterruptoresPublicos = {
  datosCarretera: boolean
  estadoAlDia: boolean
  recordatoriosPendientes: boolean
}

export const CLAVES_INTERRUPTORES = ['datosCarretera', 'estadoAlDia', 'recordatoriosPendientes'] as const

/** El defecto del CÓDIGO (spec §3.2): carretera y estado encendidos; recordatorios apagados. */
export const INTERRUPTORES_DEFECTO: Readonly<InterruptoresPublicos> = Object.freeze({
  datosCarretera: true,
  estadoAlDia: true,
  recordatoriosPendientes: false,
})

/** Qué revela cada interruptor, dicho en la pantalla JUNTO a la casilla (es una afirmación sobre esta función). */
export const TEXTO_INTERRUPTOR: Readonly<Record<keyof InterruptoresPublicos, string>> = Object.freeze({
  datosCarretera:
    'Datos para carretera: matrícula, compañía, número de póliza y teléfonos de asistencia. Nunca tu nombre (en una sociedad, solo su razón social).',
  estadoAlDia: 'Estado al día: si la ITV y el seguro están al día, vencen pronto o no lo sabemos. Sin fechas exactas.',
  recordatoriosPendientes: 'Recordatorios pendientes: solo de qué tipo son (neumáticos, revisión…) y si están vencidos. Ni el texto ni quién lo apuntó.',
})

function valorDe(fila: unknown, clave: keyof InterruptoresPublicos): boolean | null {
  if (typeof fila !== 'object' || fila === null || Array.isArray(fila)) return null
  const v = (fila as Record<string, unknown>)[clave]
  // 🚨 Solo un booleano DE VERDAD. `'true'`, `1` o `null` no se interpretan: se cae al siguiente nivel.
  return typeof v === 'boolean' ? v : null
}

/**
 * Los interruptores que valen para ESTE vehículo. Campo a campo: el de la fila del vehículo (excepción) si es
 * un booleano; si no, el del defecto de su dueño (persona o empresa); si no, el del código. Las claves que no
 * son de la lista se ignoran (una «columna extra» no abre nada).
 */
export function interruptoresEfectivos(filaVehiculo: unknown, filaDueno: unknown): InterruptoresPublicos {
  const out = { ...INTERRUPTORES_DEFECTO }
  for (const k of CLAVES_INTERRUPTORES) {
    out[k] = valorDe(filaVehiculo, k) ?? valorDe(filaDueno, k) ?? INTERRUPTORES_DEFECTO[k]
  }
  return out
}

/**
 * Lo que manda el formulario. Exige los TRES booleanos: un cuerpo a medias no se completa con defectos (eso
 * sería decidir por el dueño qué se enseña). `null` = datos inválidos (400).
 */
export function interruptoresDelCuerpo(v: unknown): InterruptoresPublicos | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const out: Partial<InterruptoresPublicos> = {}
  for (const k of CLAVES_INTERRUPTORES) {
    if (typeof o[k] !== 'boolean') return null
    out[k] = o[k] as boolean
  }
  return out as InterruptoresPublicos
}

// ─── Semáforos ───────────────────────────────────────────────────────────────

export const SEMAFOROS = ['al_dia', 'vence_pronto', 'vencido', 'no_sabemos'] as const
export type Semaforo = (typeof SEMAFOROS)[number]

/** Texto del semáforo (la pantalla NO se apoya solo en el color). */
export const TEXTO_SEMAFORO: Readonly<Record<Semaforo, string>> = Object.freeze({
  al_dia: 'Al día',
  vence_pronto: 'Vence pronto',
  vencido: 'Vencido',
  no_sabemos: 'No lo sabemos',
})

function semaforoValido(v: unknown): Semaforo {
  return typeof v === 'string' && (SEMAFOROS as readonly string[]).includes(v) ? (v as Semaforo) : 'no_sabemos'
}

/**
 * El semáforo PÚBLICO de la ITV.
 *
 * 🚨 Solo hay color cuando la fecha es FIRME: la PRIMERA inspección (todavía no le ha tocado ninguna, así que
 * no depende de ninguna anterior) calculada desde una matriculación que dio la compañía o anotó el dueño. Todo
 * lo demás —sin matriculación, matriculación estimada por la serie, o un ciclo que SUPONE que pasó las
 * anteriores en su aniversario— es `no_sabemos`: en pantalla del dueño eso se explica con su letra pequeña; a un
 * tercero que mira un semáforo sin letra pequeña, un «al día» calculado sería una afirmación que no podemos hacer.
 */
export function semaforoItv(itv: ItvVehiculo | null): Semaforo {
  if (itv === null || itv.estado !== 'calculada') return 'no_sabemos'
  if (itv.fiabilidad !== 'primera' || itv.fuente === 'estimada') return 'no_sabemos'
  if (itv.diasHasta < 0) return 'vencido'
  return itv.diasHasta <= DIAS_PRONTO_FLOTA ? 'vence_pronto' : 'al_dia'
}

/** La póliza del vehículo tal como la necesita el semáforo. `null` = NO la hemos encontrado (≠ «sin seguro»). */
export type PolizaParaSemaforo = {
  /** `true` = la póliza que nos consta NO está en vigor (un hecho, no una duda). */
  noVigente: boolean
  /** `YYYY-MM-DD…` ya corregido por recibos; `null` = la compañía no lo ha informado. */
  fechaVencimiento: string | null
}

/**
 * El semáforo PÚBLICO del seguro. Póliza no encontrada → `no_sabemos` (puede estar asegurado en otra parte).
 * Sin fecha o con la renovación sin confirmar (en vigor según la compañía, fecha ya pasada) → `no_sabemos`:
 * el portal nunca llama vencido a lo que la compañía sigue dando en vigor.
 */
export function semaforoSeguro(p: PolizaParaSemaforo | null, hoy: Date): Semaforo {
  if (p === null) return 'no_sabemos'
  if (p.noVigente === true) return 'vencido'
  const v = vencimientoFlota(p.fechaVencimiento, hoy)
  if (v.estado === 'vigente') return 'al_dia'
  if (v.estado === 'pronto') return 'vence_pronto'
  return 'no_sabemos'
}

// ─── Recordatorios (la fuente llega en F2) ──────────────────────────────────

export const TIPOS_RECORDATORIO_VEHICULO = ['neumaticos', 'revision', 'kilometraje', 'otro'] as const
export type TipoRecordatorioVehiculo = (typeof TIPOS_RECORDATORIO_VEHICULO)[number]

export const TEXTO_TIPO_RECORDATORIO: Readonly<Record<TipoRecordatorioVehiculo, string>> = Object.freeze({
  neumaticos: 'Neumáticos',
  revision: 'Revisión',
  kilometraje: 'Kilometraje',
  otro: 'Otro',
})

export type RecordatorioPublico = { tipo: TipoRecordatorioVehiculo; estado: 'pendiente' | 'vencido' }

// ─── La vista ────────────────────────────────────────────────────────────────

/** Un teléfono de la compañía, con SOLO lo que se puede pintar. */
export type TelefonoPublico =
  | { tipo: 'telefono'; uso: 'siniestros' | 'asistencia'; para: string | null; numero: string; horario: string | null }
  | { tipo: 'whatsapp'; numero: string; enlace: string; horario: string | null }

/**
 * Lo que la página pública recibe. NO hay más campos que estos, y la página no recibe nada más.
 * `null` en un trozo = el interruptor está apagado (no se pinta, ni siquiera el hueco).
 */
export type VistaPublicaVehiculo = {
  carretera: {
    matricula: string | null
    /** Solo la razón social de una persona JURÍDICA. Particular o autónomo: siempre `null`. */
    titular: string | null
    compania: string | null
    numeroPoliza: string | null
    /** `null` = no lo tenemos VERIFICADO (la página dice «pídenoslo»), nunca «no tiene». */
    telefonos: TelefonoPublico[] | null
  } | null
  estado: { itv: Semaforo; seguro: Semaforo } | null
  /** `null` = apagado O sin fuente (F1 aún no tiene notas del vehículo): la página calla. */
  recordatorios: RecordatorioPublico[] | null
}

/** Lo que la lectura (con BD) prepara. Puede traer de más: no sale nada que no esté en la allow-list. */
export type EntradaVistaPublica = {
  dueno: { tipo: 'persona' } | { tipo: 'empresa'; razonSocial: string | null; tipoFicha: TipoFicha }
  matricula: string | null
  poliza: { compania: string | null; numeroPoliza: string | null } | null
  canal: CanalCompania | null
  semaforos: { itv: Semaforo; seguro: Semaforo }
  /** `null` = no hay fuente de recordatorios (F1). */
  recordatorios: readonly { tipo: unknown; vencido: unknown }[] | null
}

/**
 * Campos que NUNCA salen en la vista pública (spec §3.2). La función no los copia porque no los conoce; esta
 * lista es para el cepo, que comprueba que ninguno aparece en la salida aunque llegue en la entrada.
 */
export const CAMPOS_PROHIBIDOS_EN_VEHICULO_PUBLICO = [
  'prima',
  'primaAnual',
  'recibos',
  'siniestros',
  'dni',
  'nif',
  'iban',
  'direccion',
  'ubicacion',
  'documentos',
  'fechaVencimiento',
  'fechaMatriculacion',
  'fechaItv',
  'autor',
  'autorNombre',
  'km',
  'nombre',
  'apellidos',
  'nombreTitular',
  'email',
  'identidadId',
  'clienteId',
] as const

function texto(v: unknown, max = 120): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t === '' ? null : t.slice(0, max)
}

function telefonosPublicos(canal: CanalCompania | null): TelefonoPublico[] | null {
  if (canal === null || canal.sinDatos === true || !Array.isArray(canal.vias) || canal.vias.length === 0) return null
  const out: TelefonoPublico[] = []
  for (const v of canal.vias) {
    const numero = texto(v?.numero, 40)
    if (numero === null) continue
    if (v.tipo === 'telefono') {
      out.push({
        tipo: 'telefono',
        uso: v.uso === 'asistencia' ? 'asistencia' : 'siniestros',
        para: texto(v.para, 60),
        numero,
        horario: texto(v.horario, 80),
      })
    } else if (v.tipo === 'whatsapp') {
      const enlace = typeof v.enlace === 'string' && v.enlace.startsWith('https://wa.me/') ? v.enlace : null
      if (enlace === null) continue
      out.push({ tipo: 'whatsapp', numero, enlace, horario: texto(v.horario, 80) })
    }
  }
  return out.length === 0 ? null : out
}

/** La razón social, SOLO de una jurídica explícita. Un `NULL` de tipo no inventa una sociedad. */
function titularPublico(d: EntradaVistaPublica['dueno'] | null | undefined): string | null {
  if (!d || d.tipo !== 'empresa' || d.tipoFicha !== 'juridica') return null
  return texto(d.razonSocial, 120)
}

/** La vista pública, por ALLOW-LIST de salida. Ver la cabecera. */
export function vistaPublicaVehiculo(e: EntradaVistaPublica, interruptores: unknown): VistaPublicaVehiculo {
  // Lo que llega como interruptores se vuelve a resolver: aunque quien llama mande un objeto raro, solo valen
  // booleanos de verdad, y el resto es el defecto del código.
  const i = interruptoresEfectivos(interruptores, null)
  return {
    carretera: i.datosCarretera
      ? {
          matricula: texto(e.matricula, 16),
          titular: titularPublico(e.dueno),
          compania: e.poliza ? texto(e.poliza.compania, 80) : null,
          numeroPoliza: e.poliza ? texto(e.poliza.numeroPoliza, 40) : null,
          telefonos: telefonosPublicos(e.canal),
        }
      : null,
    estado: i.estadoAlDia
      ? { itv: semaforoValido(e.semaforos?.itv), seguro: semaforoValido(e.semaforos?.seguro) }
      : null,
    recordatorios:
      i.recordatoriosPendientes && Array.isArray(e.recordatorios)
        ? e.recordatorios.flatMap((r): RecordatorioPublico[] =>
            typeof r?.tipo === 'string' && (TIPOS_RECORDATORIO_VEHICULO as readonly string[]).includes(r.tipo)
              ? [{ tipo: r.tipo as TipoRecordatorioVehiculo, estado: r.vencido === true ? 'vencido' : 'pendiente' }]
              : [],
          )
        : null,
  }
}

/**
 * Hilo de conversación por siniestro y plazos legales — reglas PURAS (sin BD, sin reloj).
 *
 * `hoy` SIEMPRE inyectado (`YYYY-MM-DD`, día de Madrid): un test con reloj real es una bomba de tiempo.
 *
 * Plazos (todos en días NATURALES, cómputo de fecha a fecha; si el mes de llegada no tiene ese día, el último del mes):
 *   - Prescripción, art. 23 LCS: 2 años en seguros de DAÑOS y 5 en seguros de PERSONAS, desde la ocurrencia. Lo que
 *     decide es el tipo de SEGURO (ramo de la póliza), no si hubo heridos. Ramo desconocido o mixto → 2 años
 *     (el conservador: avisa antes) y se DICE en `nota`.
 *   - Art. 18 LCS: 40 días desde la recepción de la declaración para pagar o consignar el importe mínimo.
 *   - Art. 20 LCS: 3 meses desde el siniestro sin pago → intereses de demora.
 *   - Servicio de atención al cliente de la compañía (Orden ECO/734/2004): 2 meses desde que se le presenta la queja
 *     o reclamación. `verificado: false`: la norma de atención a la clientela está en revisión y el plazo puede haber
 *     cambiado. Arranca SOLO desde un mensaje `enviado` marcado `meta.reclamacionSac === true`.
 *
 * Fecha base que falta → ese plazo con `fecha: null` (no se inventa). `null` = «no se sabe», nunca «no hay».
 */

export const AUTORES_MENSAJE_SINIESTRO = ['compania', 'ia', 'corredor', 'interna'] as const
export type AutorMensajeSiniestro = (typeof AUTORES_MENSAJE_SINIESTRO)[number]

/** Los que puede escribir el puerto de operador. `ia` SOLO lo escribe el servidor (endpoint de IA). */
export const AUTORES_MENSAJE_OPERADOR = ['compania', 'corredor', 'interna'] as const satisfies readonly AutorMensajeSiniestro[]

export const TIPOS_MENSAJE_SINIESTRO = ['comentario', 'rehuse', 'analisis', 'borrador', 'enviado', 'nota'] as const
export type TipoMensajeSiniestro = (typeof TIPOS_MENSAJE_SINIESTRO)[number]

export const RESULTADOS_SINIESTRO = ['ganado', 'perdido', 'parcial'] as const
export type ResultadoCierreSiniestro = (typeof RESULTADOS_SINIESTRO)[number]

export const TEXTO_MENSAJE_SINIESTRO_MAX = 50_000
export const MOTIVO_RESULTADO_MAX = 2_000

export type EntradaMensajeSiniestro = {
  autor: unknown
  tipo: unknown
  texto: unknown
  /** `true` solo con `tipo: 'enviado'`: la reclamación al servicio de atención al cliente de la compañía. */
  reclamacionSac?: unknown
}

export type MensajeValidado = {
  autor: AutorMensajeSiniestro
  tipo: TipoMensajeSiniestro
  texto: string
  reclamacionSac: boolean
}

/**
 * Valida un mensaje. `canal: 'operador'` (lo que llega por el puerto) rechaza `autor: 'ia'`; `'servidor'` lo admite.
 * Coherencia autor↔tipo: `enviado` solo del corredor (es lo que arranca la espera), `rehuse` solo de la compañía,
 * `analisis` solo de la IA. El texto se recorta por los extremos; vacío o > 50.000 caracteres → error.
 */
export function validarMensajeSiniestro(
  e: EntradaMensajeSiniestro,
  canal: 'operador' | 'servidor',
): { ok: true; mensaje: MensajeValidado } | { ok: false; motivo: string } {
  const autores: readonly string[] = canal === 'operador' ? AUTORES_MENSAJE_OPERADOR : AUTORES_MENSAJE_SINIESTRO
  if (typeof e.autor !== 'string' || !autores.includes(e.autor)) {
    return {
      ok: false,
      motivo: e.autor === 'ia' && canal === 'operador'
        ? 'autor «ia» solo lo escribe el servidor'
        : `autor no válido (${autores.join(' | ')})`,
    }
  }
  if (typeof e.tipo !== 'string' || !(TIPOS_MENSAJE_SINIESTRO as readonly string[]).includes(e.tipo)) {
    return { ok: false, motivo: `tipo no válido (${TIPOS_MENSAJE_SINIESTRO.join(' | ')})` }
  }
  const autor = e.autor as AutorMensajeSiniestro
  const tipo = e.tipo as TipoMensajeSiniestro
  if (tipo === 'enviado' && autor !== 'corredor') return { ok: false, motivo: 'un «enviado» solo lo escribe el corredor' }
  if (tipo === 'rehuse' && autor !== 'compania') return { ok: false, motivo: 'un «rehuse» solo lo escribe la compañía' }
  if (tipo === 'analisis' && autor !== 'ia') return { ok: false, motivo: 'un «analisis» solo lo escribe la IA' }
  if (typeof e.texto !== 'string') return { ok: false, motivo: 'falta texto' }
  const texto = e.texto.trim()
  if (texto === '') return { ok: false, motivo: 'el texto está vacío' }
  if (texto.length > TEXTO_MENSAJE_SINIESTRO_MAX) {
    return { ok: false, motivo: `el texto supera ${TEXTO_MENSAJE_SINIESTRO_MAX} caracteres` }
  }
  if (e.reclamacionSac !== undefined && e.reclamacionSac !== null && typeof e.reclamacionSac !== 'boolean') {
    return { ok: false, motivo: 'reclamacionSac tiene que ser true o false' }
  }
  const reclamacionSac = e.reclamacionSac === true
  if (reclamacionSac && tipo !== 'enviado') return { ok: false, motivo: 'reclamacionSac solo vale con tipo «enviado»' }
  return { ok: true, mensaje: { autor, tipo, texto, reclamacionSac } }
}

/** Valida el cierre con resultado. El motivo es obligatorio (lo que se aprende de cada cierre). */
export function validarCierreSiniestro(
  resultado: unknown,
  motivo: unknown,
): { ok: true; resultado: ResultadoCierreSiniestro; motivo: string } | { ok: false; motivo: string } {
  if (typeof resultado !== 'string' || !(RESULTADOS_SINIESTRO as readonly string[]).includes(resultado)) {
    return { ok: false, motivo: `resultado no válido (${RESULTADOS_SINIESTRO.join(' | ')})` }
  }
  if (typeof motivo !== 'string' || motivo.trim() === '') return { ok: false, motivo: 'falta el motivo del resultado' }
  const m = motivo.trim()
  if (m.length > MOTIVO_RESULTADO_MAX) return { ok: false, motivo: `el motivo supera ${MOTIVO_RESULTADO_MAX} caracteres` }
  return { ok: true, resultado: resultado as ResultadoCierreSiniestro, motivo: m }
}

// ─── Fechas (puras, sin zona: el llamador ya da días de Madrid) ──────────────

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` válido → sus partes; cualquier otra cosa → null. */
function partes(dia: string | null | undefined): { a: number; m: number; d: number } | null {
  if (typeof dia !== 'string') return null
  const r = RE_DIA.exec(dia.trim())
  if (!r) return null
  const a = Number(r[1]), m = Number(r[2]), d = Number(r[3])
  const t = new Date(Date.UTC(a, m - 1, d))
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return { a, m, d }
}

const iso = (t: Date): string => t.toISOString().slice(0, 10)

/** Suma meses de fecha a fecha; si el mes de llegada no tiene ese día, el último del mes (31/01 + 1 mes = 28/02). */
export function sumarMeses(dia: string, meses: number): string | null {
  const p = partes(dia)
  if (!p) return null
  const destino = new Date(Date.UTC(p.a, p.m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate()
  destino.setUTCDate(Math.min(p.d, ultimo))
  return iso(destino)
}

export function sumarDias(dia: string, dias: number): string | null {
  const p = partes(dia)
  if (!p) return null
  return iso(new Date(Date.UTC(p.a, p.m - 1, p.d + dias)))
}

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). null si alguna no es un día válido. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = partes(desde), b = partes(hasta)
  if (!a || !b) return null
  return Math.round((Date.UTC(b.a, b.m - 1, b.d) - Date.UTC(a.a, a.m - 1, a.d)) / 86_400_000)
}

// ─── Plazos ──────────────────────────────────────────────────────────────────

/** Ramos que son seguro de PERSONAS a efectos del art. 23 LCS (`polizas.tipo`). */
export const RAMOS_SEGURO_PERSONAS = ['vida', 'salud', 'decesos', 'accidentes'] as const

/**
 * Ramos que son seguro de DAÑOS sin duda. Lo que no esté en ninguna lista (`viaje`, `otros`, `null`, uno nuevo) es
 * «no se sabe» → se usa el plazo corto y se dice.
 */
export const RAMOS_SEGURO_DANOS = [
  'auto', 'moto', 'hogar', 'responsabilidad_civil', 'comercio', 'comunidades', 'empresas', 'rc_profesional', 'dyo',
  'flotas', 'transporte_mercancias', 'ciberriesgos', 'decenal', 'embarcaciones', 'mascotas', 'impago_alquiler',
  'caucion', 'patinete',
] as const

export type ClavePlazoSiniestro = 'prescripcion_art23' | 'pago_minimo_art18' | 'intereses_demora_art20' | 'respuesta_sac'

export type PlazoSiniestro = {
  clave: ClavePlazoSiniestro
  etiqueta: string
  /** `YYYY-MM-DD` del vencimiento. `null` = falta la fecha base: no se sabe (no se inventa). */
  fecha: string | null
  /** Días de `hoy` a `fecha` (negativo = vencido). `null` si `fecha` es null. */
  diasRestantes: number | null
  base_legal: string
  /** `false` = plazo no contrastado con la norma vigente: mostrarlo como orientativo. */
  verificado: boolean
  /** Por qué falta la fecha, o qué se ha supuesto. `null` si nada. */
  nota: string | null
}

export type SiniestroParaPlazos = {
  /** Día de ocurrencia (`YYYY-MM-DD`, Madrid). `siniestros.fecha_hora`. */
  fechaOcurrencia: string | null
  /** Día en que la compañía recibió la declaración (`siniestros.fecha_declaracion`). */
  fechaDeclaracion: string | null
  /** `polizas.tipo` (ramo de la póliza). */
  ramo: string | null
}

/** Mensaje mínimo para las reglas del hilo. `creadoAt` en ISO (instante); `diaMadrid` lo da el llamador si hace falta. */
export type MensajeParaPlazos = {
  autor: string
  tipo: string
  /** Instante ISO de creación. */
  creadoAt: string
  /** Día de Madrid de `creadoAt` (`YYYY-MM-DD`). */
  dia: string
  meta?: Record<string, unknown> | null
}

function plazo(
  clave: ClavePlazoSiniestro,
  etiqueta: string,
  base_legal: string,
  fecha: string | null,
  hoy: string,
  verificado: boolean,
  nota: string | null,
): PlazoSiniestro {
  return { clave, etiqueta, fecha, diasRestantes: fecha === null ? null : diasEntre(hoy, fecha), base_legal, verificado, nota }
}

/** Tipo de seguro a efectos del art. 23 LCS. `null` = no se sabe. */
export function claseSeguroArt23(ramo: string | null | undefined): 'personas' | 'danos' | null {
  if (typeof ramo !== 'string') return null
  if ((RAMOS_SEGURO_PERSONAS as readonly string[]).includes(ramo)) return 'personas'
  if ((RAMOS_SEGURO_DANOS as readonly string[]).includes(ramo)) return 'danos'
  return null
}

/** Último `enviado` del corredor marcado como reclamación al SAC. `null` si no hay. */
function ultimaReclamacionSac(mensajes: readonly MensajeParaPlazos[]): MensajeParaPlazos | null {
  let ultimo: MensajeParaPlazos | null = null
  for (const m of mensajes) {
    if (m.autor !== 'corredor' || m.tipo !== 'enviado' || m.meta?.reclamacionSac !== true) continue
    if (ultimo === null || m.creadoAt > ultimo.creadoAt) ultimo = m
  }
  return ultimo
}

/**
 * Plazos legales del siniestro.
 * `mensajes`: el hilo; `null` = no se pudo leer → el plazo del SAC sale con fecha null y se dice. Sin reclamación al
 * SAC en el hilo, ese plazo NO sale (no hay nada que contar).
 */
export function plazosSiniestro(
  s: SiniestroParaPlazos,
  hoy: string,
  mensajes: readonly MensajeParaPlazos[] | null = [],
): PlazoSiniestro[] {
  const ocurrencia = partes(s.fechaOcurrencia) ? s.fechaOcurrencia : null
  const declaracion = partes(s.fechaDeclaracion) ? s.fechaDeclaracion : null
  const sinOcurrencia = 'Falta la fecha de ocurrencia del siniestro.'
  const out: PlazoSiniestro[] = []

  const clase = claseSeguroArt23(s.ramo)
  const anios = clase === 'personas' ? 5 : 2
  const notaClase = clase === null
    ? `No se sabe si la póliza${s.ramo ? ` (${s.ramo})` : ''} es de daños o de personas: se usa el plazo corto (2 años), el conservador.`
    : null
  out.push(plazo(
    'prescripcion_art23',
    `Prescripción de la acción (${anios} años${clase === 'personas' ? ', seguro de personas' : clase === 'danos' ? ', seguro de daños' : ''})`,
    'Art. 23 Ley 50/1980, de Contrato de Seguro',
    ocurrencia ? sumarMeses(ocurrencia, anios * 12) : null,
    hoy,
    true,
    ocurrencia ? notaClase : [sinOcurrencia, notaClase].filter(Boolean).join(' '),
  ))

  out.push(plazo(
    'pago_minimo_art18',
    'Pago o consignación del importe mínimo (40 días desde la declaración)',
    'Art. 18 Ley 50/1980, de Contrato de Seguro',
    declaracion ? sumarDias(declaracion, 40) : null,
    hoy,
    true,
    declaracion ? null : 'Falta la fecha en que la compañía recibió la declaración.',
  ))

  out.push(plazo(
    'intereses_demora_art20',
    'Intereses de demora si no ha pagado (3 meses desde el siniestro)',
    'Art. 20 Ley 50/1980, de Contrato de Seguro',
    ocurrencia ? sumarMeses(ocurrencia, 3) : null,
    hoy,
    true,
    ocurrencia ? null : sinOcurrencia,
  ))

  const BASE_SAC = 'Orden ECO/734/2004 (servicio de atención al cliente), art. 10'
  const ETIQUETA_SAC = 'Respuesta del servicio de atención al cliente de la compañía (2 meses)'
  if (mensajes === null) {
    out.push(plazo('respuesta_sac', ETIQUETA_SAC, BASE_SAC, null, hoy, false, 'No se pudo leer el hilo: no se sabe si hay una reclamación al SAC.'))
  } else {
    const sac = ultimaReclamacionSac(mensajes)
    if (sac) {
      out.push(plazo(
        'respuesta_sac',
        ETIQUETA_SAC,
        BASE_SAC,
        sumarMeses(sac.dia, 2),
        hoy,
        false,
        'Plazo sin verificar contra la norma vigente: compruébalo antes de usarlo frente a la compañía.',
      ))
    }
  }
  return out
}

/**
 * Días que lleva el corredor esperando a la compañía: desde el ÚLTIMO `enviado` del corredor, si no hay después
 * ningún mensaje de la compañía. `null` si no aplica (nunca se envió nada, la compañía ya contestó) o si el hilo
 * no se pudo leer (`mensajes === null`).
 */
export function diasEsperandoCompania(mensajes: readonly MensajeParaPlazos[] | null, hoy: string): number | null {
  if (mensajes === null) return null
  let enviado: MensajeParaPlazos | null = null
  for (const m of mensajes) {
    if (m.autor === 'corredor' && m.tipo === 'enviado' && (enviado === null || m.creadoAt > enviado.creadoAt)) enviado = m
  }
  if (enviado === null) return null
  const ultimo = enviado
  if (mensajes.some((m) => m.autor === 'compania' && m.creadoAt > ultimo.creadoAt)) return null
  const d = diasEntre(ultimo.dia, hoy)
  return d === null ? null : Math.max(0, d)
}

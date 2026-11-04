// Fase 2 del canal WhatsApp: qué se le manda a la IA y qué se acepta de vuelta. PURO (Zod).
//
// Minimización ANTES de la IA (core-ai no redacta nada):
//   · solo el TEXTO de la conversación, pasado por `redactarPii` (DNI, IBAN, tarjetas, emails,
//     teléfonos, matrículas, números largos) y con el nombre conocido del contacto tapado;
//   · del CRM, lo mínimo para decidir: si tiene ficha, si es cliente o lead, su lead_estado, los
//     ramos que ya tiene y sus oportunidades abiertas (ramo + estado). Nunca nombre, teléfono,
//     NIF ni ids: los ids salen del contexto del servidor al ejecutar, no de la IA.
//
// Salida: JSON validado con Zod `.strict()` (un campo inventado invalida el análisis entero). Un
// campo AUSENTE es `null` = «no se sabe», nunca 0 ni [] (regla del repo).

import { z } from 'zod'
import { RAMOS_OPORTUNIDAD, redactarPii } from '@central/module-seguros'

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const nulo = <T extends z.ZodTypeAny>(t: T) => t.nullable().default(null)
const ramo = z.enum(RAMOS_OPORTUNIDAD)

export const INTENCIONES = ['nuevo_seguro', 'renovacion', 'mejorar_precio', 'siniestro', 'consulta_poliza', 'baja', 'queja', 'pago_recibo', 'otro'] as const
export const ESTADOS_LEAD_IA = ['contactado', 'cualificado', 'propuesta'] as const
export const ESTADOS_OPORTUNIDAD_IA = ['competencia', 'en_negociacion', 'pendiente_cliente'] as const
export const TIPOS_TAREA_IA = ['llamada', 'tarea', 'email', 'whatsapp'] as const

/**
 * La LISTA BLANCA de acciones. Cualquier otro `tipo` se rechaza y queda anotado como rechazado.
 * Las tres `proponer*` (04/11/2026, D1) NUNCA escriben: dejan una propuesta que Alberto aplica con su botón de Telegram.
 * No llevan ids: el recibo/oportunidad lo pone el SERVIDOR (saliente vinculado o único candidato), nunca la IA.
 */
export const TIPOS_ACCION = [
  'updateLead', 'createOpportunity', 'updateOpportunity', 'createTask', 'updateContact', 'addConversationNote',
  'proponerFechaCobro', 'proponerPagado', 'proponerVencimiento',
] as const
export type TipoAccion = (typeof TIPOS_ACCION)[number]

const valorDato = z.union([z.string().max(300), z.number(), z.boolean(), z.null()])

export const zAccion = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('updateLead'), lead_estado: z.enum(ESTADOS_LEAD_IA) }).strict(),
  z
    .object({
      tipo: z.literal('createOpportunity'),
      ramo,
      fecha_vencimiento: nulo(fechaIso),
      compania_actual: nulo(z.string().min(1).max(120)),
      nota: nulo(z.string().min(1).max(500)),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('updateOpportunity'),
      ramo,
      fecha_vencimiento: nulo(fechaIso),
      estado: nulo(z.enum(ESTADOS_OPORTUNIDAD_IA)),
      info_riesgo: nulo(z.record(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), valorDato)),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('createTask'),
      tipo_tarea: z.enum(TIPOS_TAREA_IA),
      descripcion: z.string().min(3).max(500),
      fecha_limite: nulo(fechaIso),
      prioridad: z.enum(['alta', 'media', 'baja']).default('media'),
    })
    .strict(),
  z.object({ tipo: z.literal('updateContact'), nombre: z.string().min(2).max(120) }).strict(),
  z.object({ tipo: z.literal('addConversationNote'), texto: z.string().min(3).max(1000) }).strict(),
  z.object({ tipo: z.literal('proponerFechaCobro'), fecha: fechaIso }).strict(),
  z.object({ tipo: z.literal('proponerPagado') }).strict(),
  z.object({ tipo: z.literal('proponerVencimiento'), ramo, fecha: fechaIso }).strict(),
])
export type Accion = z.infer<typeof zAccion>

export const zAnalisis = z
  .object({
    es_comercial: z.boolean(),
    intencion: nulo(z.enum(INTENCIONES)),
    producto: nulo(ramo),
    urgencia: nulo(z.enum(['alta', 'media', 'baja'])),
    interes: nulo(z.enum(['alto', 'medio', 'bajo'])),
    presupuesto: nulo(z.number().nonnegative().max(1_000_000)),
    fecha_renovacion: nulo(fechaIso),
    compania_actual: nulo(z.string().min(1).max(120)),
    objeciones: nulo(z.array(z.string().min(1).max(200)).max(10)),
    riesgo_abandono: nulo(z.enum(['alto', 'medio', 'bajo'])),
    resumen: nulo(z.string().min(1).max(1000)),
    datos_extraidos: nulo(z.record(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), valorDato)),
    // Cada acción se valida APARTE: una mal formada se rechaza sin tirar el análisis.
    acciones: z.array(z.unknown()).max(10).default([]),
  })
  .strict()
export type Analisis = z.infer<typeof zAnalisis>

export type ResultadoParseo = { ok: true; analisis: Analisis } | { ok: false; motivo: string }

/** Texto de la IA → análisis validado. `limpiar` es `cleanJSON` de core-ai (inyectado para test). */
export function parsearAnalisis(crudo: string, limpiar: (s: string) => string = (s) => s): ResultadoParseo {
  let json: unknown
  try {
    json = JSON.parse(limpiar(crudo))
  } catch {
    return { ok: false, motivo: 'json_invalido' }
  }
  const r = zAnalisis.safeParse(json)
  if (!r.success) return { ok: false, motivo: `esquema: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.code}`).join('; ')}` }
  return { ok: true, analisis: r.data }
}

// ── Lo que entra en el prompt ──────────────────────────────────────────────────

export type MensajeTranscripcion = { direccion: 'entrante' | 'saliente'; texto: string; fecha: Date }

export const MAX_MENSAJES = 40
export const MAX_CARACTERES = 6000

/**
 * Los últimos `maxMensajes`, REDACTADOS, en orden, y recortando por arriba (los más viejos fuera)
 * hasta caber en `maxCaracteres`. Nunca lleva el número ni el nombre del contacto.
 */
export function construirTranscripcion(
  mensajes: readonly MensajeTranscripcion[],
  opciones: { nombres?: readonly (string | null | undefined)[]; maxMensajes?: number; maxCaracteres?: number } = {},
): string {
  const max = opciones.maxMensajes ?? MAX_MENSAJES
  const tope = opciones.maxCaracteres ?? MAX_CARACTERES
  const ordenados = [...mensajes].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()).slice(-max)
  const lineas = ordenados.map((m) => {
    const quien = m.direccion === 'entrante' ? 'Contacto' : 'Corredor'
    const texto = redactarPii(m.texto, { nombres: opciones.nombres }).replace(/\s+/g, ' ').trim().slice(0, 1500)
    return `[${m.fecha.toISOString().slice(0, 16).replace('T', ' ')}] ${quien}: ${texto}`
  })
  const out: string[] = []
  let total = 0
  for (let i = lineas.length - 1; i >= 0; i--) {
    if (total + lineas[i].length + 1 > tope) break
    out.unshift(lineas[i])
    total += lineas[i].length + 1
  }
  return out.join('\n')
}

/** Lo mínimo del CRM que ve la IA. Sin identificadores ni datos personales. */
export type ContextoParaIA = {
  tiene_ficha: boolean
  tipo_ficha: 'cliente' | 'lead' | 'beneficiario' | null
  lead_estado: string | null
  ramos_contratados: string[] | null
  oportunidades_abiertas: { ramo: string; estado: string; vencimiento: string | null }[]
  /**
   * Lo último que el corredor le MANDÓ por WhatsApp (saliente vinculado, ≤14 días antes de la respuesta): de qué iba,
   * sin ids ni datos personales. `null` = no hay vínculo (o no se pudo leer): se interpreta sin él, como antes.
   */
  ultimo_saliente?: { origen: string; ramo: string | null; fecha: string | null; importe: number | null } | null
  /** Recibos devueltos/pendientes de pólizas EN VIGOR (D4: un lead o ex-cliente no lleva ninguno). `null` = no se sabe. */
  recibos_pendientes?: { ramo: string; estado: string; efecto: string | null; importe: number | null }[] | null
}

export const SISTEMA = `Eres el analista comercial de una correduría de seguros española. Lees una conversación de WhatsApp entre la correduría (Corredor) y una persona (Contacto) y devuelves SOLO un objeto JSON, sin texto alrededor.

El texto viene minimizado: [DNI], [IBAN], [TELEFONO], [NOMBRE]… son datos tapados a propósito. No intentes reconstruirlos ni los pidas en el JSON.

Reglas:
- es_comercial = true si la conversación trata de seguros o de la relación con la correduría (contratar, renovar, precio, póliza, recibo, siniestro, baja). false si es personal (familia, amigos, quedadas) o publicidad.
- Lo que la conversación no dice es null. No inventes fechas, importes ni compañías. objeciones: null si no se habla de ello, [] si se habló y no hay.
- producto/ramo: auto, moto, hogar, vida, salud, decesos, responsabilidad_civil, comercio, comunidades, accidentes, otros.
- fechas en formato aaaa-mm-dd.
- acciones: como mucho 5, solo de esta lista y solo si la conversación las justifica:
  {"tipo":"updateLead","lead_estado":"contactado|cualificado|propuesta"}
  {"tipo":"createOpportunity","ramo":"…","fecha_vencimiento":null,"compania_actual":null,"nota":null}
  {"tipo":"updateOpportunity","ramo":"…","fecha_vencimiento":null,"estado":"competencia|en_negociacion|pendiente_cliente","info_riesgo":null}
  {"tipo":"createTask","tipo_tarea":"llamada|tarea|email|whatsapp","descripcion":"…","fecha_limite":null,"prioridad":"alta|media|baja"}
  {"tipo":"updateContact","nombre":"…"}  (solo si la persona dice cómo se llama y no está tapado)
  {"tipo":"addConversationNote","texto":"…"}
  {"tipo":"proponerFechaCobro","fecha":"aaaa-mm-dd"}  (el contacto dice CUÁNDO pagará un recibo devuelto/pendiente)
  {"tipo":"proponerPagado"}  (el contacto dice que YA ha pagado un recibo)
  {"tipo":"proponerVencimiento","ramo":"…","fecha":"aaaa-mm-dd"}  (el contacto da la fecha de vencimiento de su seguro)
  Las tres «proponer…» no cambian nada: las revisa el corredor. Úsalas solo si el contacto lo dice claramente; para las de recibo, solo si hay recibos_pendientes o ultimo_saliente trata de un recibo.
- ultimo_saliente es lo que el corredor le escribió antes (p. ej. un recibo devuelto): interpreta la respuesta en ese contexto.
- Nunca uses ids. Nunca marques una venta como ganada ni perdida. Nunca des un recibo por cobrado.

Formato exacto:
{"es_comercial":true,"intencion":"nuevo_seguro|renovacion|mejorar_precio|siniestro|consulta_poliza|baja|queja|pago_recibo|otro|null","producto":null,"urgencia":"alta|media|baja|null","interes":"alto|medio|bajo|null","presupuesto":null,"fecha_renovacion":null,"compania_actual":null,"objeciones":null,"riesgo_abandono":"alto|medio|bajo|null","resumen":"…","datos_extraidos":null,"acciones":[]}`

export function construirPrompt(contexto: ContextoParaIA, transcripcion: string): string {
  return `Contexto del CRM (sin datos personales):\n${JSON.stringify(contexto)}\n\nConversación:\n${transcripcion}`
}

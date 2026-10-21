// lib/correo/extractor-llm.ts — F2 del agente corredor de correo (21/10/2026): el EXTRACTOR LLM en MODO SOMBRA.
//
// Para los correos de compañía (`correduria` / `correduria-recibo`) que NINGÚN lector determinista reconoce (la «cola
// larga»), el modelo propone una ficha (tipo, nºs, importes, fechas, estado) que se valida LITERAL contra el texto
// (`validarFichaLLM` de @central/module-seguros) y se GUARDA en asegura para medirla. Cuando un lector SÍ lo reconoce, el
// modelo corre igual (si hay presupuesto) y se compara campo a campo: es la métrica de precisión. Gana SIEMPRE el lector.
//
// 🚨 Modo sombra: nada de aquí escribe en la cartera, crea tareas ni avisa por Telegram. El interruptor es
// `CORREO_LLM_MODO` (`sombra` | cualquier otra cosa = `off`); sin poner → APAGADO.
// 🚨 Orden de seguridad: la exclusión de credenciales (`exclusionSeguridad`) va ANTES de todo, también sobre el texto de
// los adjuntos: un correo excluido no llega al modelo. El texto que sí va pasa por `sinDatosSensibles` (IBAN/NIF fuera).
// Topes: por pasada (`CORREO_LLM_TOPE_PASADA`, 2) y por día (`CORREO_LLM_TOPE_DIA`, 25; la mitad como mucho para la
// comparación); un contador del día que no se puede leer = no se llama (no se sabe cuánto se ha gastado).
//
// PURO y sin `@/` (corre con `node --test`): la llamada al modelo, el contador y el guardado se INYECTAN (los reales en
// `extractor-llm-proceso.ts`).

import {
  SYSTEM_EXTRACTOR, compararConLector, fichaParaGuardar, parsearRespuestaExtractor, textoParaExtractor, validarFichaLLM,
  type EventoAseguradora, type LecturaCorreoDevolucion,
} from '@central/module-seguros'
import { esDominioAseguradora, exclusionSeguridad } from './keywords.ts'

/** App con la que se registra cada llamada en `ai_usos` (y con la que se cuenta el tope diario). */
export const APP_EXTRACTOR = 'correo-extractor'
export const ENDPOINT_EXTRACTOR = 'extraer'

export type ModoExtractorLLM = 'off' | 'sombra'

/** `CORREO_LLM_MODO`: solo `sombra` lo enciende. Cualquier otro valor (o ninguno) = apagado. */
export function modoExtractorLLM(v: string | undefined = process.env.CORREO_LLM_MODO): ModoExtractorLLM {
  return (v ?? '').trim().toLowerCase() === 'sombra' ? 'sombra' : 'off'
}

export const TOPE_PASADA_DEFECTO = 2
export const TOPE_DIA_DEFECTO = 25
const TOPE_PASADA_MAX = 5
const TOPE_DIA_MAX = 200

export type TopesLLM = { pasada: number; dia: number }

function entero(v: string | undefined, defecto: number, max: number): number {
  const n = Number((v ?? '').trim())
  return (v ?? '').trim() !== '' && Number.isInteger(n) && n >= 0 ? Math.min(n, max) : defecto
}

/** Topes desde el entorno (`CORREO_LLM_TOPE_PASADA`, `CORREO_LLM_TOPE_DIA`). Un valor ilegible = el por defecto. */
export function topesLLM(env: Record<string, string | undefined> = process.env): TopesLLM {
  return {
    pasada: entero(env.CORREO_LLM_TOPE_PASADA, TOPE_PASADA_DEFECTO, TOPE_PASADA_MAX),
    dia: entero(env.CORREO_LLM_TOPE_DIA, TOPE_DIA_DEFECTO, TOPE_DIA_MAX),
  }
}

/** Pasado este tiempo de la pasada del triaje (que muere a los 300 s) no se empieza una llamada (≤20 s). */
export const LLM_HASTA_MS = 150_000

export const CATEGORIAS_EXTRACTOR = ['correduria', 'correduria-recibo'] as const

export type MotivoNoLlamar =
  | 'apagado' | 'excluido' | 'categoria' | 'cliente' | 'remitente' | 'sin_texto' | 'sin_tiempo'
  | 'tope_pasada' | 'tope_dia' | 'tope_comparacion' | 'sin_contador'

export type Proposito = 'cola_larga' | 'comparacion'

export type CorreoParaExtractor = {
  messageId: string
  from: string
  subject: string
  /** Cuerpo en texto plano (o el extracto si no hay texto). */
  cuerpo: string
  categoria: string
  /** El remitente casó con una ficha de CLIENTE: su correo no es de compañía y no va al modelo. */
  deCliente: boolean
}

/**
 * Filtro previo, sin gastar nada: modo, exclusión de seguridad, categoría, cliente, remitente de aseguradora, tope de la
 * pasada y tiempo. `null` = sigue. El orden importa: APAGADO y EXCLUIDO van primero.
 */
export function filtroPrevioLLM(
  c: CorreoParaExtractor,
  ctx: { modo: ModoExtractorLLM; topes: TopesLLM; usadasPasada: number; transcurridoMs: number },
): MotivoNoLlamar | null {
  if (ctx.modo !== 'sombra') return 'apagado'
  if (exclusionSeguridad(c.from, c.subject, c.cuerpo)) return 'excluido'
  if (!(CATEGORIAS_EXTRACTOR as readonly string[]).includes(c.categoria)) return 'categoria'
  if (c.deCliente) return 'cliente'
  if (!esDominioAseguradora(c.from)) return 'remitente'
  if (ctx.usadasPasada >= ctx.topes.pasada) return 'tope_pasada'
  if (ctx.transcurridoMs > LLM_HASTA_MS) return 'sin_tiempo'
  return null
}

/**
 * Tope diario. `usadasHoy = null` (el contador no se pudo leer) → no se llama: no se sabe lo gastado. La comparación
 * (un lector ya lo leyó) solo usa la MITAD del tope: la cola larga, que es lo que aporta, nunca se queda sin cupo por medir.
 */
export function topeDiarioLLM(proposito: Proposito, usadasHoy: number | null, topes: TopesLLM): MotivoNoLlamar | null {
  if (usadasHoy === null) return 'sin_contador'
  if (usadasHoy >= topes.dia) return 'tope_dia'
  if (proposito === 'comparacion' && usadasHoy >= Math.floor(topes.dia / 2)) return 'tope_comparacion'
  return null
}

export type DepsExtractor = {
  /** Una llamada al modelo. Lanza si falla. */
  llamar: (system: string, user: string) => Promise<{ texto: string; modelo: string }>
  /** Llamadas de hoy del extractor (`ai_usos`). `null` = no se pudo leer. */
  usadasHoy: () => Promise<number | null>
  /** Guarda la lectura en asegura. `true` = guardada (o ya estaba). */
  guardar: (lectura: Record<string, unknown>) => Promise<boolean>
  /** Texto de los PDF del correo, si lo hay. */
  textoAdjuntos?: () => Promise<string | null>
}

export type ResultadoExtractor =
  | { llamado: false; motivo: MotivoNoLlamar }
  | { llamado: true; proposito: Proposito; ok: false; motivo: 'fallo_modelo' }
  | { llamado: true; proposito: Proposito; ok: true; guardado: boolean; noLiterales: number; aciertos: number | null; fallos: number | null }

/** Contador de la pasada: se incrementa ANTES de llamar (una llamada que falla también cuenta). */
export type PasadaLLM = { usadas: number }

/**
 * Lee un correo con el modelo en MODO SOMBRA. Nunca lanza. `lector` = lo que leyó un lector determinista del MISMO
 * correo (`null` = ninguno lo reconoce → cola larga). No devuelve nada que el triaje deba aplicar: solo el resultado.
 */
export async function extraerEnSombra(
  c: CorreoParaExtractor,
  lector: EventoAseguradora | LecturaCorreoDevolucion | null,
  ctx: { modo: ModoExtractorLLM; topes: TopesLLM; pasada: PasadaLLM; transcurridoMs: number },
  deps: DepsExtractor,
): Promise<ResultadoExtractor> {
  const previo = filtroPrevioLLM(c, { modo: ctx.modo, topes: ctx.topes, usadasPasada: ctx.pasada.usadas, transcurridoMs: ctx.transcurridoMs })
  if (previo) return { llamado: false, motivo: previo }
  const proposito: Proposito = lector ? 'comparacion' : 'cola_larga'

  const adjuntos = deps.textoAdjuntos ? await deps.textoAdjuntos().catch(() => null) : null
  // Segunda pasada del detector de secretos, ahora con el texto de los ADJUNTOS: lo que vaya al modelo, todo, limpio.
  if (adjuntos && exclusionSeguridad(c.from, c.subject, adjuntos)) return { llamado: false, motivo: 'excluido' }
  const texto = textoParaExtractor({ remitente: c.from, asunto: c.subject, cuerpoTexto: c.cuerpo, textoAdjuntos: adjuntos })
  if (!texto) return { llamado: false, motivo: 'sin_texto' }

  const tope = topeDiarioLLM(proposito, await deps.usadasHoy().catch(() => null), ctx.topes)
  if (tope) return { llamado: false, motivo: tope }

  ctx.pasada.usadas++
  let respuesta: { texto: string; modelo: string }
  try {
    respuesta = await deps.llamar(SYSTEM_EXTRACTOR, texto)
  } catch {
    return { llamado: true, proposito, ok: false, motivo: 'fallo_modelo' }
  }
  const { ficha, noLiterales } = validarFichaLLM(parsearRespuestaExtractor(respuesta.texto), texto)
  const comparacion = lector ? compararConLector(ficha, lector) : null
  const guardado = await deps.guardar({
    mensajeId: c.messageId,
    proposito,
    modelo: respuesta.modelo,
    ficha: fichaParaGuardar(ficha),
    noLiterales,
    comparacion: comparacion ? { tipoLector: comparacion.tipoLector, campos: comparacion.campos } : null,
  }).catch(() => false)
  return {
    llamado: true, proposito, ok: true, guardado, noLiterales: noLiterales.length,
    aciertos: comparacion?.aciertos ?? null, fallos: comparacion?.fallos ?? null,
  }
}

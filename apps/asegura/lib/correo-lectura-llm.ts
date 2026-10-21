// apps/asegura/lib/correo-lectura-llm.ts
//
// Validación de la ENTRADA del puerto `POST /api/operador/correo/lectura-llm` (F2 del agente de correo, 21/10/2026). PURO.
//
// Plataforma manda la lectura del extractor LLM en modo sombra (ficha ya validada literal contra el texto). Aquí se vuelve
// a construir la ficha SOLO con los campos conocidos y con su forma: lo que no encaja se queda en `null`, nunca se
// arregla. Defensa en profundidad de la regla de PII: un `tomador` que llegue se IGNORA (solo cuenta `tomadorLeido`) y
// todo texto pasa otra vez por `sinDatosSensibles`; un nº que contenía un NIF/IBAN se anula entero.

import {
  CAMPOS_COMPARADOS, CAMPOS_LITERALES, CONCEPTOS_IMPORTE, TIPOS_FICHA_LLM, sinDatosSensibles,
  type CampoComparado, type CampoLiteral, type FichaGuardable, type ResultadoCampo,
} from '@central/module-seguros'

export const PROPOSITOS_LECTURA_LLM = ['cola_larga', 'comparacion'] as const
export type PropositoLecturaLLM = (typeof PROPOSITOS_LECTURA_LLM)[number]

export type EntradaLecturaLLM = {
  mensajeId: string
  proposito: PropositoLecturaLLM
  modelo: string
  ficha: FichaGuardable | null
  noLiterales: CampoLiteral[]
  comparacion: { tipoLector: string; campos: Record<CampoComparado, ResultadoCampo>; aciertos: number; fallos: number } | null
}

const RESULTADOS: readonly ResultadoCampo[] = ['acierto', 'fallo', 'omitido', 'sin_referencia']
const RE_MODELO = /^[a-z0-9][a-z0-9._:/-]{0,119}$/i
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  if (!s || s.length > max) return null
  return s
}

/** Nº de póliza/recibo/…: si el filtro de datos sensibles lo toca, no era un nº limpio → `null`. */
function numero(v: unknown): string | null {
  const s = texto(v, 40)
  return s && sinDatosSensibles(s) === s ? s : null
}

function enLista<T extends string>(v: unknown, lista: readonly T[]): T | null {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : null
}

function fecha(v: unknown): string | null {
  return typeof v === 'string' && RE_ISO.test(v) ? v : null
}

function ficha(v: unknown): FichaGuardable | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const f = v as Record<string, unknown>
  const importes = Array.isArray(f.importes)
    ? f.importes.slice(0, 5).flatMap((i) => {
        const o = i && typeof i === 'object' ? (i as Record<string, unknown>) : null
        const valor = o && typeof o.valor === 'number' && Number.isFinite(o.valor) && o.valor >= 0 && o.valor < 10_000_000 ? Math.round(o.valor * 100) / 100 : null
        return valor === null ? [] : [{ concepto: enLista(o?.concepto, CONCEPTOS_IMPORTE) ?? 'otro', valor }]
      })
    : []
  const estado = texto(f.estado, 80)
  const confianza = typeof f.confianza === 'number' && f.confianza >= 0 && f.confianza <= 1 ? Math.round(f.confianza * 100) / 100 : null
  return {
    tipo: enLista(f.tipo, TIPOS_FICHA_LLM),
    numeroPoliza: numero(f.numeroPoliza),
    numeroSolicitud: numero(f.numeroSolicitud),
    numeroRecibo: numero(f.numeroRecibo),
    numeroSiniestro: numero(f.numeroSiniestro),
    fechaEfecto: fecha(f.fechaEfecto),
    fechaVencimiento: fecha(f.fechaVencimiento),
    fechaLimite: fecha(f.fechaLimite),
    importes,
    estado: estado ? sinDatosSensibles(estado) : null,
    confianza,
    tomadorLeido: f.tomadorLeido === true,
  }
}

export function validarEntradaLecturaLLM(b: unknown): { ok: true; entrada: EntradaLecturaLLM } | { ok: false; motivo: string } {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no es un objeto' }
  const o = b as Record<string, unknown>
  const mensajeId = texto(o.mensajeId, 300)
  if (!mensajeId) return { ok: false, motivo: 'mensajeId' }
  const proposito = enLista(o.proposito, PROPOSITOS_LECTURA_LLM)
  if (!proposito) return { ok: false, motivo: 'proposito' }
  const modelo = typeof o.modelo === 'string' && RE_MODELO.test(o.modelo.trim()) ? o.modelo.trim() : null
  if (!modelo) return { ok: false, motivo: 'modelo' }
  const noLiterales = Array.isArray(o.noLiterales)
    ? [...new Set(o.noLiterales.filter((c): c is CampoLiteral => (CAMPOS_LITERALES as readonly unknown[]).includes(c)))]
    : []
  let comparacion: EntradaLecturaLLM['comparacion'] = null
  if (proposito === 'comparacion') {
    const c = o.comparacion && typeof o.comparacion === 'object' ? (o.comparacion as Record<string, unknown>) : null
    const tipoLector = texto(c?.tipoLector, 40)
    const camposIn = c?.campos && typeof c.campos === 'object' ? (c.campos as Record<string, unknown>) : null
    if (!tipoLector || !camposIn) return { ok: false, motivo: 'comparacion' }
    const campos = {} as Record<CampoComparado, ResultadoCampo>
    for (const k of CAMPOS_COMPARADOS) campos[k] = enLista(camposIn[k], RESULTADOS) ?? 'sin_referencia'
    const vals = Object.values(campos)
    // Los contadores se RECALCULAN aquí: no se fía de los que mande el llamante.
    comparacion = { tipoLector, campos, aciertos: vals.filter((r) => r === 'acierto').length, fallos: vals.filter((r) => r === 'fallo').length }
  }
  return { ok: true, entrada: { mensajeId, proposito, modelo, ficha: ficha(o.ficha), noLiterales, comparacion } }
}

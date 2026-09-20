// El puente entre un correo de aseguradora y una póliza de la cartera (20/09/2026).
//
// ── Por qué existe ───────────────────────────────────────────────────────────
//
// El triaje de correo de `apps/plataforma` ya sabe distinguir un correo de aseguradora
// (comisiones, recibos devueltos…) — lo etiqueta y avisa a Alberto por Telegram. Lo que
// no hacía hasta hoy es decir DE QUÉ CLIENTE es ese correo, así que nunca quedaba nada
// en la ficha: el aviso vivía y moría en Telegram.
//
// Este módulo es la mitad PURA del puente: qué candidatos a número de póliza hay en un
// texto libre, y cuál de ellos (si alguno) es EXACTAMENTE una póliza de la cartera. La
// mitad con BD (leer las pólizas vivas de la correduría) vive en `apps/asegura`, porque
// solo esa app tiene el cliente Prisma de la cartera.
//
// 🚨 Regla que no se negocia: la resolución es EXACTA, nunca por parecido. «Agrupar
// personas por identidad, no por la etiqueta» (regla de la casa) vale igual para un
// texto libre que para dos filas de una tabla — un candidato que no case letra a letra
// (tras normalizar) con ningún número de póliza de la cartera NO resuelve nada, y eso es
// preferible a colgar una nota en la ficha equivocada.

import { normalizarNumeroPoliza } from './lead-declarada.ts'

/**
 * Candidatos a número de póliza en un texto libre (asunto + cuerpo de un correo).
 * Puro y deliberadamente PERMISIVO: cualquier token con forma de código (letras y
 * dígitos, con guiones/puntos/barras admitidos, mínimo 5 caracteres) es candidato.
 * No hace falta que sea preciso — la precisión la da el match EXACTO contra la
 * cartera, no esta extracción. Tope de 20 candidatos: la firma legal de un correo
 * de aseguradora trae más basura con forma de código que número de póliza real.
 */
const PATRON_CANDIDATO = /\b[A-Za-z0-9][A-Za-z0-9./-]{3,23}[A-Za-z0-9]\b/g

export function candidatosNumeroPoliza(texto: string): string[] {
  if (!texto) return []
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const m of texto.matchAll(PATRON_CANDIDATO)) {
    const t = m[0]
    if (!/\d/.test(t)) continue // un número de póliza siempre lleva algún dígito
    if (vistos.has(t)) continue
    vistos.add(t)
    salida.push(t)
    if (salida.length >= 20) break
  }
  return salida
}

export type ResolucionPoliza = { clienteId: string; polizaId: string; numeroPoliza: string }

/** Una póliza de la cartera, lo mínimo que hace falta para poder resolver contra ella. */
export type PolizaResoluble = { id: string; clienteId: string; numeroPoliza: string }

/**
 * De una lista de candidatos YA normalizados y una lista de pólizas de la cartera,
 * TODAS las que casan exacto — nunca solo la primera. Puro: sin BD, sin red,
 * testeable a secas.
 *
 * 🚨 Un correo de `correduria` (liquidación de comisiones) puede nombrar pólizas de
 * VARIOS clientes a la vez: quedarse con un único match escogido por el orden en que
 * llegó la fila de la BD perdería en silencio la nota de los demás — el mismo fallo
 * que la regla de la casa prohíbe para «dato que no se ha mirado». Se anota UNA vez
 * por cliente (si un cliente tiene dos pólizas que casan, la primera que se encuentra
 * en `polizas` decide, mismo criterio que el resto del repo: orden estable, no azar).
 */
export function elegirPolizasResueltas(
  candidatosNormalizados: readonly string[],
  polizas: readonly PolizaResoluble[],
): ResolucionPoliza[] {
  if (candidatosNormalizados.length === 0) return []
  const candidatos = new Set(candidatosNormalizados)
  const vistos = new Set<string>()
  const salida: ResolucionPoliza[] = []
  for (const p of polizas) {
    if (vistos.has(p.clienteId)) continue
    const norm = normalizarNumeroPoliza(p.numeroPoliza)
    if (norm && candidatos.has(norm)) {
      vistos.add(p.clienteId)
      salida.push({ clienteId: p.clienteId, polizaId: p.id, numeroPoliza: p.numeroPoliza })
    }
  }
  return salida
}

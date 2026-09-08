// lib/seo-correduria/informe.ts — redacción del informe semanal y elección de la acción propuesta.
//
// Las dos funciones son PURAS: reciben los `Resultados` tri-estado y devuelven texto. La acción
// la decide una regla, no un LLM (spec §5.4), y el informe NUNCA pinta un 0 donde una fuente está
// en `error`/`no_configurado` («dato que NO hay ≠ dato que NO se ha mirado», CLAUDE.md).
// Spec: docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md §5
// Plan: docs/superpowers/plans/2026-09-08-seo-correduria-conectores.md Task 5

import { escapeHtml } from '@central/core-telegram'
import type { Accion, ConsultaSerp, DatosGsc, DatosPosthog, DatosSerp, Fuente, Resultados } from './tipos.ts'

/** Misma forma que `CONSULTAS` de `./consultas.ts`; se recibe por parámetro para no acoplar. */
export type ConsultaObjetivo = { consulta: string; pagina: string | null; grupo: 'ramo' | 'problema' }

/** Telegram corta en 4.096; nos quedamos con margen. */
export const MAX_CARACTERES_INFORME = 3500
const MAX_CONSULTAS_SERP_RECORTADO = 8

const NOMBRE_FUENTE: Record<Fuente, string> = {
  gsc: 'Search Console',
  serp: 'SERP (Serper)',
  posthog: 'PostHog',
}
const ORDEN_FUENTES: Fuente[] = ['gsc', 'serp', 'posthog']

/** minúsculas, sin tildes, trim, espacios colapsados — para casar consultas de GSC con las objetivo. */
export function normalizarConsulta(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// ───────────────────────────── acción propuesta ─────────────────────────────

export function accionPropuesta(r: Resultados, consultas: ConsultaObjetivo[]): Accion {
  // (1) Una fuente que no está `ok` se arregla antes que nada: sin datos no se escribe contenido a ciegas.
  for (const f of ORDEN_FUENTES) {
    const res = r[f]
    if (res.estado !== 'ok') {
      const motivo = res.estado === 'no_configurado' ? 'sin configurar' : 'con error'
      return {
        tipo: 'arreglar_fuente',
        texto: `Arreglar la fuente ${NOMBRE_FUENTE[f]} (${motivo}): ${res.detalle}`,
      }
    }
  }

  // (2) La consulta con más impresiones en posición 8-30 que ya tiene página objetivo: es la de mayor retorno.
  const objetivosConPagina = new Map<string, ConsultaObjetivo>()
  for (const c of consultas) {
    if (c.pagina !== null) objetivosConPagina.set(normalizarConsulta(c.consulta), c)
  }
  let mejor: { fila: DatosGsc['actual']['consultas'][number]; objetivo: ConsultaObjetivo } | null = null
  // La regla (1) ya ha devuelto si gsc no está ok; el ternario solo contenta al narrowing de TS.
  const filasGsc = r.gsc.estado === 'ok' ? r.gsc.datos.actual.consultas : []
  for (const fila of filasGsc) {
    if (fila.impresiones <= 0 || fila.posicion < 8 || fila.posicion > 30) continue
    const objetivo = objetivosConPagina.get(normalizarConsulta(fila.clave))
    if (!objetivo) continue
    if (!mejor || fila.impresiones > mejor.fila.impresiones) mejor = { fila, objetivo }
  }
  if (mejor) {
    return {
      tipo: 'mejorar_pagina',
      texto:
        `Mejorar ${mejor.objetivo.pagina}: «${mejor.fila.clave}» está en posición ` +
        `${posicion1(mejor.fila.posicion)} con ${num(mejor.fila.impresiones)} impresiones — ya aparece, ` +
        `no llega a la primera página`,
    }
  }

  // (3) Una consulta de intención de problema sin página que la cubra.
  const sinPagina = consultas.find((c) => c.grupo === 'problema' && c.pagina === null)
  if (sinPagina) {
    return {
      tipo: 'escribir_pagina',
      texto: `Escribir la página que cubra «${sinPagina.consulta}» (hoy no la cubre ninguna)`,
    }
  }

  // (4) Si no hay nada mejor, enlazado interno hacia el ramo prioritario.
  return {
    tipo: 'enlazado_interno',
    texto: 'Enlazado interno hacia /seguros/hogar desde las páginas de ramo y de problema',
  }
}

// ───────────────────────────── informe ─────────────────────────────

/** Formato español, con miles también en 4 cifras (`1.543`): `es-ES` a secas no agrupa hasta 5. */
function num(n: number): string {
  return n.toLocaleString('es-ES', { useGrouping: 'always' })
}
function posicion1(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: 'always' })
}
/** «+12» / «−3» / «±0» en formato español. */
function delta(actual: number, anterior: number, decimales = 0): string {
  const d = actual - anterior
  const abs = Math.abs(d).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: 'always',
  })
  const signo = d > 0 ? '+' : d < 0 ? '−' : '±'
  return `${signo}${abs}`
}

function lineaFuenteNoOk(fuente: Fuente, res: { estado: 'error' | 'no_configurado'; detalle: string }): string {
  const motivo = res.estado === 'no_configurado' ? 'sin configurar' : 'con error'
  return `⚠️ ${NOMBRE_FUENTE[fuente]} ${motivo}: ${escapeHtml(res.detalle)}`
}

function bloqueGsc(res: Resultados['gsc']): string[] {
  const lineas = ['<b>Search Console</b>']
  if (res.estado !== 'ok') {
    lineas.push(lineaFuenteNoOk('gsc', res))
    return lineas
  }
  const { actual, anterior } = res.datos
  const t = actual.total
  const pos = t.posicion === null ? 'sin posición media (sin impresiones)' : `posición media ${posicion1(t.posicion)}`
  if (anterior === null) {
    lineas.push(`${num(t.clics)} clics · ${num(t.impresiones)} impresiones · ${pos} (sin semana anterior)`)
  } else {
    const a = anterior.total
    const dPos =
      t.posicion !== null && a.posicion !== null
        ? ` (${delta(t.posicion, a.posicion, 1)}${t.posicion < a.posicion ? ' ▲' : t.posicion > a.posicion ? ' ▼' : ''})`
        : ''
    lineas.push(
      `${num(t.clics)} clics (${delta(t.clics, a.clics)}) · ${num(t.impresiones)} impresiones ` +
        `(${delta(t.impresiones, a.impresiones)}) · ${pos}${dPos}`,
    )
  }
  const top = [...actual.consultas].sort((x, y) => y.impresiones - x.impresiones).slice(0, 5)
  for (const c of top) {
    lineas.push(`· «${escapeHtml(c.clave)}» — pos. ${posicion1(c.posicion)} · ${num(c.impresiones)} impr. · ${num(c.clics)} clics`)
  }
  return lineas
}

function lineaSerp(c: ConsultaSerp): string {
  const propia = c.propia === null ? 'fuera del top-10' : `posición ${num(c.propia)}`
  const podio = c.top
    .slice(0, 3)
    .map((t) => escapeHtml(t.dominio))
    .join(', ')
  return `· «${escapeHtml(c.consulta)}» — ${propia}${podio ? ` · ${podio}` : ''}`
}

function bloqueSerp(res: Resultados['serp'], maxConsultas: number | null): string[] {
  if (res.estado !== 'ok') return ['<b>SERP</b>', lineaFuenteNoOk('serp', res)]
  const d: DatosSerp = res.datos
  const todas = d.consultas
  const visibles = maxConsultas === null ? todas : todas.slice(0, maxConsultas)
  const lineas = [`<b>SERP</b> (top-10 de Google para ${escapeHtml(d.dominio)}, ${num(todas.length)} consultas)`]
  for (const c of visibles) lineas.push(lineaSerp(c))
  if (visibles.length < todas.length) lineas.push(`(+${num(todas.length - visibles.length)} consultas en BD)`)
  return lineas
}

function bloquePosthog(res: Resultados['posthog']): string[] {
  const titulo = '<b>Visitas medidas, sobre quien consintió</b>'
  if (res.estado !== 'ok') return [titulo, lineaFuenteNoOk('posthog', res)]
  const d: DatosPosthog = res.datos
  const lineas = [
    `${titulo} (${num(d.dias)} días)`,
    `${num(d.visitantes)} visitantes · ${num(d.paginasVistas)} páginas vistas`,
  ]
  const paginas = d.topPaginas.slice(0, 3).map((p) => `${escapeHtml(p.ruta)} (${num(p.vistas)})`)
  if (paginas.length) lineas.push(`Páginas: ${paginas.join(' · ')}`)
  const origenes = d.origenes.slice(0, 3).map((o) => `${escapeHtml(o.dominio)} (${num(o.sesiones)})`)
  if (origenes.length) lineas.push(`Orígenes: ${origenes.join(' · ')}`)
  return lineas
}

function montar(semana: string, r: Resultados, accion: Accion, dominio: string, maxSerp: number | null): string {
  const partes = [
    `🔎 <b>SEO ${escapeHtml(dominio)}</b> · semana ${escapeHtml(semana)}`,
    bloqueGsc(r.gsc).join('\n'),
    bloqueSerp(r.serp, maxSerp).join('\n'),
    bloquePosthog(r.posthog).join('\n'),
    `➡️ <b>Acción</b>: ${escapeHtml(accion.texto)}`,
  ]
  return partes.join('\n\n')
}

/** HTML de Telegram (`parse_mode: 'HTML'`). Todo texto externo pasa por `escapeHtml`. */
export function redactarInforme(semana: string, r: Resultados, accion: Accion, dominio: string): string {
  const completo = montar(semana, r, accion, dominio, null)
  if (completo.length < MAX_CARACTERES_INFORME) return completo
  // Si se pasa, lo que crece con la BD es el bloque SERP: se recorta a 8 consultas y se dice cuántas quedan.
  return montar(semana, r, accion, dominio, MAX_CONSULTAS_SERP_RECORTADO)
}

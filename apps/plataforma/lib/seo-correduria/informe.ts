// lib/seo-correduria/informe.ts — redacción del informe semanal y elección de la acción propuesta.
//
// Las dos funciones son PURAS: reciben los `Resultados` tri-estado y devuelven texto. La acción
// la decide una regla, no un LLM (spec §5.4), y el informe NUNCA pinta un 0 donde una fuente está
// en `error`/`no_configurado` («dato que NO hay ≠ dato que NO se ha mirado», CLAUDE.md).
// Spec: docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md §5
// Plan: docs/superpowers/plans/2026-09-08-seo-correduria-conectores.md Task 5

import { escapeHtml } from '@central/core-telegram'
import type { Accion, DatosGsc, DatosPosthog, Fuente, Resultados, VerdictoCobertura } from './tipos.ts'

/** Misma forma que `CONSULTAS` de `./consultas.ts`; se recibe por parámetro para no acoplar. */
export type ConsultaObjetivo = { consulta: string; pagina: string | null; grupo: 'ramo' | 'problema' }

const NOMBRE_FUENTE: Record<Fuente, string> = {
  gsc: 'Search Console',
  posthog: 'PostHog',
  cobertura: 'Cobertura de indexación',
}
const ORDEN_FUENTES: Fuente[] = ['gsc', 'posthog', 'cobertura']

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

  // (1.5) Una página PROPIA que Search Console marca fuera del índice (404, bloqueada, no indexada
  // por Google...) se arregla antes que escribir nada nuevo: no tiene sentido perseguir una consulta
  // nueva mientras la página que ya la cubre ni siquiera está en el índice.
  if (r.cobertura.estado === 'ok') {
    const conProblema = r.cobertura.datos.paginas.find(p => p.estado === 'ok' && p.verdicto !== 'PASS')
    if (conProblema) {
      return {
        tipo: 'arreglar_indexacion',
        texto:
          `Arreglar la indexación de ${conProblema.url}: Search Console la marca ` +
          `«${conProblema.cobertura ?? conProblema.verdicto ?? 'sin cobertura'}»`,
      }
    }
    // Una página que NO se ha podido inspeccionar no es una página sin problema: es una que no se
    // ha mirado. Tratarla como PASS por omisión sería la regla NULL≠0 incumplida en este mismo sitio.
    const sinComprobar = r.cobertura.datos.paginas.find(p => p.estado === 'error')
    if (sinComprobar) {
      return {
        tipo: 'arreglar_indexacion',
        texto: `Comprobar la indexación de ${sinComprobar.url}: no se pudo inspeccionar (${sinComprobar.detalle ?? 'motivo desconocido'})`,
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

const ETIQUETA_VERDICTO: Record<VerdictoCobertura, string> = {
  PASS: '✅ indexada',
  PARTIAL: '🟡 indexada con reparos',
  FAIL: '🔴 fuera del índice',
  NEUTRAL: '⚪ neutral',
  DESCONOCIDO: '❔ desconocido',
}

function bloqueCobertura(res: Resultados['cobertura']): string[] {
  const lineas = ['<b>Indexación de páginas propias</b>']
  if (res.estado !== 'ok') {
    lineas.push(lineaFuenteNoOk('cobertura', res))
    return lineas
  }
  const leidas = res.datos.paginas.filter(p => p.estado === 'ok')
  const sinLeer = res.datos.paginas.filter(p => p.estado === 'error')
  const conProblema = leidas.filter(p => p.verdicto !== 'PASS')

  if (!conProblema.length && !sinLeer.length) {
    lineas.push(`${leidas.length} página(s) comprobadas, todas indexadas.`)
    return lineas
  }
  for (const p of conProblema) {
    const etiqueta = ETIQUETA_VERDICTO[p.verdicto ?? 'DESCONOCIDO']
    lineas.push(`${etiqueta} ${escapeHtml(p.url)}${p.cobertura ? ` — ${escapeHtml(p.cobertura)}` : ''}`)
  }
  // Una línea POR página sin comprobar, con su propio motivo — un recuento con un solo motivo
  // citado le atribuiría a todas la causa de la primera aunque cada una fallara por algo distinto.
  for (const p of sinLeer) {
    lineas.push(`❔ ${escapeHtml(p.url)} — sin comprobar (${escapeHtml(p.detalle ?? 'motivo desconocido')})`)
  }
  return lineas
}

/** HTML de Telegram (`parse_mode: 'HTML'`). Todo texto externo pasa por `escapeHtml`. */
export function redactarInforme(semana: string, r: Resultados, accion: Accion, dominio: string): string {
  const partes = [
    `🔎 <b>SEO ${escapeHtml(dominio)}</b> · semana ${escapeHtml(semana)}`,
    bloqueGsc(r.gsc).join('\n'),
    bloquePosthog(r.posthog).join('\n'),
    bloqueCobertura(r.cobertura).join('\n'),
    `➡️ <b>Acción</b>: ${escapeHtml(accion.texto)}`,
  ]
  return partes.join('\n\n')
}

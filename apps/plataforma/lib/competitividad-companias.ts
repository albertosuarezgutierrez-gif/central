// Competitividad de precio por compañía (07/11/2026) — lo PURO del lado de plataforma: leer la respuesta del puerto de
// asegura (`/api/operador/companias/competitividad`) y decidir qué texto va con cada cifra. El cálculo vive en
// `@central/module-seguros` (`competitividad-precio.ts`). Sin red ni React: `node --test lib/competitividad-companias.test.ts`.
//
// 🚨 Tres estados: sin tarificaciones → «sin datos» (jamás 0 %); puerto caído → «no se ha podido calcular» (≠ sin datos);
// con datos → cifras con su tamaño de muestra.

import { etiquetaRamo, frasesCompetitividad, type FilaPareja, type FilaSegmento } from '@central/module-seguros'

export type FilaSinPrecio = {
  companiaCodigo: string
  ramo: string
  anio: number
  tarificaciones: number
  conPrecio: number
  rechazos: number
  errores: number
}

export type CompetitividadLeida = {
  anio: number
  hoy: string
  truncado: boolean
  tarificaciones: { avant2: number; bot: number }
  excluidas: { sinPrima: number; fueraDeRango: number; incoherentes: number }
  descartadas: { invalidas: number; sinNivel: number }
  pareja: FilaPareja[]
  segmento: FilaSegmento[]
  sinPrecio: FilaSinPrecio[]
  nombres: Record<string, string>
}

export type RespuestaCompetitividad =
  | { estado: 'ok'; competitividad: CompetitividadLeida }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parejaLegible(v: unknown): v is FilaPareja {
  const o = obj(v)
  return !!o && typeof o.companiaCodigo === 'string' && typeof o.ramo === 'string' && typeof o.nivel === 'string' && esNum(o.anio)
    && esNum(o.tarificaciones) && esNum(o.masBarata) && esNum(o.pctMedianoSobreBarata) && Array.isArray(o.pierdeContra) && !!obj(o.canales)
}
function segmentoLegible(v: unknown): v is FilaSegmento {
  const o = obj(v)
  return !!o && typeof o.companiaCodigo === 'string' && typeof o.ramo === 'string' && typeof o.nivel === 'string' && esNum(o.anio) && esNum(o.n) && esNum(o.nResto) && esNum(o.pct)
}
function sinPrecioLegible(v: unknown): v is FilaSinPrecio {
  const o = obj(v)
  return !!o && typeof o.companiaCodigo === 'string' && typeof o.ramo === 'string' && esNum(o.anio) && esNum(o.tarificaciones) && esNum(o.conPrecio) && esNum(o.rechazos) && esNum(o.errores)
}

export function interpretarCompetitividad(status: number, json: unknown): RespuestaCompetitividad {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = obj(json) ?? {}
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'error', motivo: 'puerto_sin_desplegar' }
  if (status !== 200 || o.estado !== 'ok') {
    return { estado: 'error', motivo: typeof o.causa === 'string' ? o.causa : typeof o.motivo === 'string' ? o.motivo : `HTTP ${status}` }
  }
  // Una lista con elementos ilegibles NO se pinta recortada: sería una comparación con compañías que faltan.
  if (!esNum(o.anio) || !Array.isArray(o.pareja) || !Array.isArray(o.segmento) || !Array.isArray(o.sinPrecio)
    || !o.pareja.every(parejaLegible) || !o.segmento.every(segmentoLegible) || !o.sinPrecio.every(sinPrecioLegible)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const t = obj(o.tarificaciones), e = obj(o.excluidas), d = obj(o.descartadas)
  return {
    estado: 'ok',
    competitividad: {
      anio: o.anio,
      hoy: typeof o.hoy === 'string' ? o.hoy : '',
      truncado: o.truncado === true,
      tarificaciones: { avant2: esNum(t?.avant2) ? t.avant2 : 0, bot: esNum(t?.bot) ? t.bot : 0 },
      excluidas: { sinPrima: esNum(e?.sinPrima) ? e.sinPrima : 0, fueraDeRango: esNum(e?.fueraDeRango) ? e.fueraDeRango : 0, incoherentes: esNum(e?.incoherentes) ? e.incoherentes : 0 },
      descartadas: { invalidas: esNum(d?.invalidas) ? d.invalidas : 0, sinNivel: esNum(d?.sinNivel) ? d.sinNivel : 0 },
      pareja: o.pareja as FilaPareja[],
      segmento: o.segmento as FilaSegmento[],
      sinPrecio: o.sinPrecio as FilaSinPrecio[],
      nombres: (obj(o.nombres) ?? {}) as Record<string, string>,
    },
  }
}

// ─── Texto ───────────────────────────────────────────────────────────────────

export type TextoCompetitividad =
  | { tipo: 'sin_datos'; texto: string }
  | { tipo: 'datos'; frases: string[]; sinPrecio: string[] }

/** «Sin precio» de una compañía, una línea por ramo: cuántas veces no dio precio, y por qué. */
export function lineasSinPrecio(c: CompetitividadLeida, codigo: string): string[] {
  return c.sinPrecio
    .filter((s) => s.companiaCodigo === codigo && s.tarificaciones > 0)
    .sort((a, b) => a.ramo.localeCompare(b.ramo))
    .map((s) => {
      const sin = s.rechazos + s.errores
      const detalle = [s.rechazos ? `${s.rechazos} por rechazar el riesgo` : null, s.errores ? `${s.errores} por error` : null].filter(Boolean).join(' y ')
      return sin === 0
        ? `${etiquetaRamo(s.ramo)}: dio precio en las ${s.tarificaciones} tarificaciones de Avant2 con detalle.`
        : `${etiquetaRamo(s.ramo)}: sin precio en ${sin} de ${s.tarificaciones} tarificaciones de Avant2 con detalle (${detalle}).`
    })
}

/**
 * Lo que se dice de UNA compañía en el año: las frases de competitividad y las líneas de «sin precio».
 * Sin una sola comparación ni «sin precio» → «sin datos» (jamás 0 %).
 */
export function textoCompetitividad(c: CompetitividadLeida, codigo: string): TextoCompetitividad {
  const frases = frasesCompetitividad(c, codigo, c.anio)
  const sinPrecio = lineasSinPrecio(c, codigo)
  if (frases.length === 0 && sinPrecio.length === 0) {
    return { tipo: 'sin_datos', texto: `Sin tarificaciones comparables de esta compañía en ${c.anio}.` }
  }
  return { tipo: 'datos', frases, sinPrecio }
}

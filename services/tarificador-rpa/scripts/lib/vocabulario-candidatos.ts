// Candidatos al VOCABULARIO COMÚN (`src/vocabulario.ts`) a partir de los avisos y errores reales (26/10/2026). PURO: sin red, sin base de datos.
//
// Entrada: filas `{ texto, compania?, ramo? }` con los avisos de `seguros.tarificacion_precios.avisos` y el mensaje de
// `seguros.tarificacion_trabajos.error->>'mensaje'` (NUNCA la columna `riesgo`: lleva datos personales). Los textos ya salen redactados por el worker.
// Extrae los rótulos de los diagnósticos «controles a la vista: «A», «B»», «etiquetas: «A»», «Botones: a, b» y «Tablas: [Cab|Cab] · Importes: Etiqueta 1,00 €»,
// quita los que YA están en el vocabulario y propone el resto clasificado por concepto con una heurística pura:
//   · LECTURA (etiquetas, cabeceras)  → `auto_aplicable` (equivocarse es un dato mal leído, no un clic; un humano lo ve en el PR).
//   · ACCIÓN (botones que se pulsan)   → `requiere_revision` (pulsar es cosa del guard; nunca se aplica solo).
//   · lo que casa la LISTA DE BLOQUEO  → `descartado` (emitir, contratar, pagar, firmar…; el bloqueo siempre gana).
//   · sin concepto claro               → `sin_concepto` (solo informativo).
// NADA se aplica en runtime: la salida es una lista para que una persona (o un PR draft) añada los términos a `vocabulario.ts`.

import {
  casaBloqueo,
  clasificarRotulo,
  normalizarRotulo,
  sinAdornos,
  terminosConocidos,
  type GrupoBloqueo,
  type Termino,
} from '../../src/vocabulario.ts'

export type FuenteRotulo = 'controles' | 'etiquetas' | 'botones' | 'tablas' | 'importes'
export type FilaAviso = { texto: string; compania?: string | null; ramo?: string | null }
export type EstadoCandidato = 'auto_aplicable' | 'requiere_revision' | 'descartado' | 'sin_concepto'

export type Candidato = {
  rotulo: string
  fuente: FuenteRotulo
  clase: 'lectura' | 'accion' | null
  /** Id del concepto del vocabulario al que parece pertenecer (`null` si ninguno claro). */
  concepto: string | null
  estado: EstadoCandidato
  motivo: string
  veces: number
  companias: string[]
}

const MAX_ROTULO = 60

// ───────────────────────── extracción ─────────────────────────

const RE_ENTRE_COMILLAS = /«([^»]{1,120})»/g

/** Rótulos de un texto de aviso/error, con la sección de la que salen. PURA. */
export function extraerRotulos(texto: string | null | undefined): { rotulo: string; fuente: FuenteRotulo }[] {
  const t = String(texto ?? '')
  const out: { rotulo: string; fuente: FuenteRotulo }[] = []

  const comillas = (desde: number, hasta: number, fuente: FuenteRotulo) => {
    for (const m of t.slice(desde, hasta).matchAll(RE_ENTRE_COMILLAS)) out.push({ rotulo: m[1]!.trim(), fuente })
  }
  // «controles a la vista: «A», «B»» / «etiquetas: «A», «B»»: hasta el siguiente «;» o fin de línea.
  for (const [re, fuente] of [[/controles a la vista:/gi, 'controles'], [/\betiquetas:/gi, 'etiquetas']] as const) {
    for (const m of t.matchAll(re)) {
      const ini = m.index! + m[0].length
      const fin = t.slice(ini).search(/[;\n]/)
      comillas(ini, fin < 0 ? t.length : ini + fin, fuente)
    }
  }
  // «Botones: texto #id v=valor, texto2» (separador «, »; «—» = ninguno).
  for (const m of t.matchAll(/\bBotones:\s*([^\n]*)/g)) {
    const resto = m[1]!.replace(/\s*·.*$/, '')
    for (const it of resto.split(/,\s+/)) {
      const nombre = it.replace(/\s+(?:#|v=).*$/, '').replace(/^\[|\]$/g, '').trim()
      if (nombre !== '' && nombre !== '—') out.push({ rotulo: nombre, fuente: 'botones' })
    }
  }
  // «Tablas: [Cab|Cab] [Cab|Cab] · Importes: Etiqueta 1.234,56 € ; …»
  const tablas = /\bTablas:\s*([^\n]*?)(?:\s*·\s*Importes:|$)/m.exec(t)
  if (tablas) for (const g of tablas[1]!.matchAll(/\[([^\]]*)\]/g)) for (const c of g[1]!.split('|')) if (c.trim() !== '') out.push({ rotulo: c.trim(), fuente: 'tablas' })
  const importes = /\bImportes:\s*([^\n]*)/m.exec(t)
  if (importes) {
    for (const it of importes[1]!.split(/\s;\s/)) {
      const m = /^(.*?)\s+€?\s?\d[\d.,]*\s?€?\s*$/.exec(it.trim())
      if (m && m[1]!.trim() !== '') out.push({ rotulo: m[1]!.trim(), fuente: 'importes' })
    }
  }
  return out
}

/** Un rótulo que NO se propone nunca: vacío, demasiado largo, marcador, o con forma de dato personal (cifras largas, correo, NIF, matrícula). PURA. */
export function rotuloDescartable(rotulo: string): boolean {
  const r = rotulo.trim()
  if (r.length < 2 || r.length > MAX_ROTULO) return true
  if (/^\(otra\)$/i.test(r) || r === '∅') return true
  if (/\d{4,}/.test(r) || /@/.test(r)) return true
  if (/\b[XYZ]?\d{7,8}[A-Z]\b/i.test(r) || /\b\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/i.test(r)) return true
  if (/^[\d.,\s€%]+$/.test(r)) return true
  return false
}

// ───────────────────────── heurística de concepto ─────────────────────────

const RE_PRECIO = /\b(prima|primas|precio|importe|recibo|recibos|cuota|cuotas|anualidad|total|coste|a pagar|contado|anual)\b/
const RE_AJENO = /\b(franquicia|capital|suma asegurada|limite|valor|accesorios|indemnizacion|km|kilometros)\b/

/** Concepto de ACCIÓN que parece un rótulo de botón (heurística; siempre se revisa). */
export function sugerirAccion(n: string): string | null {
  const s = sinAdornos(n)
  if (/^(siguiente|continuar|avanzar)$/.test(s)) return 'avanzar'
  if (/^(calcular|recalcular|tarificar)\b/.test(s)) return 'calcular'
  if (/\b(imprim\w*|descarg\w*|print\w*|download\w*|pdf)\b/.test(s) && /\b(proyecto|presupuesto|oferta|propuesta|cotizacion|documento)s?\b/.test(s)) return 'descargar_documento'
  if (/\b(guardar|generar)\b/.test(s) && /\b(proyecto|presupuesto|oferta)s?\b/.test(s)) return /\bgenerar\b/.test(s) ? 'generar_proyecto' : 'guardar_proyecto'
  return null
}

/** Concepto de LECTURA que parece una etiqueta/cabecera (heurística). */
export function sugerirLectura(n: string): string | null {
  const s = sinAdornos(n)
  if (RE_AJENO.test(s)) return 'importe_ajeno'
  if (/\bcompan\w*\b/.test(s) && !/\b(anos|años|tiempo)\b/.test(s)) return 'compania_anterior'
  if (/\bnacimiento\b/.test(s)) return 'fecha_nacimiento'
  if (/\b(fecha|expedicion)\b/.test(s) && /\b(carne|carnet|permiso|licencia)\b/.test(s)) return 'fecha_carne'
  if (/\bcodigo postal\b|^c ?p$/.test(s)) return 'codigo_postal'
  if (/\bsiniestr\w*\b/.test(s)) return 'siniestros_5_anios'
  if (/\banos?\b/.test(s) && /\b(asegurad\w*|aseguramiento|compania)\b/.test(s)) return 'anios_asegurado'
  if (/\bmodalidad\w*\b/.test(s)) return 'modalidades'
  if (/\brecibo\b/.test(s) && /\banual\b/.test(s)) return 'recibo_anual'
  if (/\banualidad\b/.test(s)) return 'prima_anualidad'
  if (/\btotal anual\b|\banual total\b|\bprima anual\b|\bcuota anual\b/.test(s)) return 'precio_total_anual'
  if (RE_PRECIO.test(s)) return 'precio'
  return null
}

export type OpcionesCandidatos = {
  /** Términos de bloqueo que solo puede nombrar `guard.ts` (`TERMINOS_BLOQUEO_SOLO_GUARD`). */
  extraBloqueo?: readonly Termino[]
  /** Mínimo de apariciones para proponer (por defecto 1). */
  minVeces?: number
}

/** Candidatos nuevos a partir de filas de avisos/errores, ya agregados por rótulo+fuente. PURA. */
export function proponerCandidatos(filas: readonly FilaAviso[], opts: OpcionesCandidatos = {}): Candidato[] {
  const conocidos = terminosConocidos()
  const acum = new Map<string, Candidato>()
  for (const f of filas) {
    for (const { rotulo, fuente } of extraerRotulos(f.texto)) {
      if (rotuloDescartable(rotulo)) continue
      const n = normalizarRotulo(rotulo)
      const sin = sinAdornos(n)
      const cl = clasificarRotulo(rotulo, { extraBloqueo: opts.extraBloqueo })
      // Ya conocido: está en el vocabulario (término literal, o lo reconocen sus reglas compuestas). El bloqueo NO cuenta como conocido: se descarta abajo.
      if (conocidos.has(sin) || (cl !== null && cl.clase !== 'bloqueado')) continue
      const clave = `${fuente}|${n}`
      const previo = acum.get(clave)
      if (previo) {
        previo.veces++
        if (f.compania && !previo.companias.includes(f.compania)) previo.companias.push(f.compania)
        continue
      }
      acum.set(clave, { ...clasificarCandidato(rotulo, n, fuente, opts), rotulo, fuente, veces: 1, companias: f.compania ? [f.compania] : [] })
    }
  }
  const orden: Record<EstadoCandidato, number> = { auto_aplicable: 0, requiere_revision: 1, sin_concepto: 2, descartado: 3 }
  return [...acum.values()]
    .filter((c) => c.veces >= (opts.minVeces ?? 1))
    .sort((a, b) => orden[a.estado] - orden[b.estado] || b.veces - a.veces || a.rotulo.localeCompare(b.rotulo, 'es'))
}

function clasificarCandidato(rotulo: string, n: string, fuente: FuenteRotulo, opts: OpcionesCandidatos): Pick<Candidato, 'clase' | 'concepto' | 'estado' | 'motivo'> {
  const esBoton = fuente === 'botones' || fuente === 'controles'
  const accion = esBoton ? sugerirAccion(n) : null
  const lectura = accion ? null : sugerirLectura(n)
  // El bloqueo SIEMPRE gana. Una etiqueta de LECTURA no se descarta por «recibo» (es un importe), un botón sí.
  const excepto: GrupoBloqueo[] = lectura && !esBoton ? ['economico_ajeno'] : []
  const b = casaBloqueo(n, { extra: opts.extraBloqueo, excepto })
  if (b) return { clase: null, concepto: null, estado: 'descartado', motivo: `lista de bloqueo (${b.grupo}: «${b.termino}»)` }
  if (accion) return { clase: 'accion', concepto: accion, estado: 'requiere_revision', motivo: `rótulo de botón parecido a «${accion}»: pulsarlo es decisión del guard, revisar a mano` }
  if (lectura) return { clase: 'lectura', concepto: lectura, estado: 'auto_aplicable', motivo: `etiqueta parecida al concepto de lectura «${lectura}»` }
  return { clase: null, concepto: null, estado: 'sin_concepto', motivo: esBoton ? 'botón sin concepto conocido (solo informativo)' : 'etiqueta sin concepto conocido (solo informativo)' }
}

// ───────────────────────── informe ─────────────────────────

/** Informe en Markdown para el PR draft: agrupado por estado, sin datos personales. PURA. */
export function informeMarkdown(cs: readonly Candidato[], fecha: string): string {
  const grupos: [EstadoCandidato, string][] = [
    ['auto_aplicable', 'Lectura — auto-aplicables (añadir al concepto indicado de `src/vocabulario.ts`)'],
    ['requiere_revision', 'Acción — REQUIEREN REVISIÓN (nunca se aplican solos; pulsar es del guard)'],
    ['sin_concepto', 'Sin concepto claro (informativo)'],
    ['descartado', 'Descartados por la lista de bloqueo'],
  ]
  const l: string[] = [`# Candidatos al vocabulario común (${fecha})`, '', `Rótulos nuevos extraídos de avisos y errores de los trabajos: ${cs.length}. Nada se ha aplicado.`, '']
  for (const [estado, titulo] of grupos) {
    const lista = cs.filter((c) => c.estado === estado)
    l.push(`## ${titulo} (${lista.length})`, '')
    if (lista.length === 0) l.push('_ninguno_', '')
    else {
      l.push('| Rótulo | Concepto | Fuente | Veces | Compañías | Motivo |', '|---|---|---|---|---|---|')
      for (const c of lista) l.push(`| «${c.rotulo.replace(/\|/g, '/')}» | ${c.concepto ?? '—'} | ${c.fuente} | ${c.veces} | ${c.companias.join(', ') || '—'} | ${c.motivo.replace(/\|/g, '/')} |`)
      l.push('')
    }
  }
  return l.join('\n')
}

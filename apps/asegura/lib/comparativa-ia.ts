// «Resumen de tus opciones» y «Comparar dos opciones con la IA» del presupuesto del portal.
// PURO: construye el prompt, calcula las cifras y valida lo que devuelve la IA. Sin BD ni red
// (eso vive en `comparativa-ia-servicio.ts`), para que los cepos corran con `node --test`.
//
// Reglas, y por qué cada una:
//   · 🚨 El prompt lleva SOLO datos de las opciones (compañía, producto, modalidad, prima,
//     franquicia, coberturas). Nunca el tomador: ni nombre, ni DNI, ni correo, ni fecha de
//     nacimiento, ni matrícula, ni dirección. Se serializa campo a campo (lista blanca), no el
//     objeto entero: un campo nuevo en la opción no puede colarse en el prompt sin que alguien
//     lo escriba aquí a propósito.
//   · Las CIFRAS las calcula el código (primas, diferencias, franquicias) y se pasan hechas. La IA
//     no suma ni resta: un modelo de lenguaje haciendo cuentas con el dinero de alguien es la
//     regla «el dato que SÍ está pero se lee mal» servida en bandeja.
//   · Describe, no recomienda (RDL 3/2020: recomendar exige análisis objetivo e IPID). No inventa:
//     lo que no consta, lo dice. Cita «Según: <compañía> · <cobertura>».
//   · La salida se VALIDA y se descarta si nombra una compañía que no está entre las opciones, si
//     trae un importe que no está entre los calculados o en el texto de una cobertura, o si
//     recomienda. Descartar es barato; enseñar una cifra inventada, no.

export const AVISO_IA =
  'Resumen hecho por IA a partir de las coberturas que nos manda cada compañía. No es una recomendación ni asesoramiento personalizado.'

export const MAX_PREGUNTAS_DIA = 10
export const MAX_LONGITUD_PREGUNTA = 300
export const MAX_OPCIONES_IA = 8
export const MAX_COBERTURAS_POR_OPCION = 40
export const MAX_TEXTO_COBERTURA = 240

export type CoberturaIA = { nombre: string; incluida: boolean | null; texto: string | null }

/** Una opción tal como la puede ver la IA. `coberturas: null` = no se han podido leer. */
export type OpcionIA = {
  id: string
  compania: string
  producto: string
  modalidad: string | null
  primaEur: number
  franquiciaEur: number | null
  coberturas: CoberturaIA[] | null
}

type OpcionConEtiqueta = OpcionIA & { etiqueta: string }

// ─── Cifras (las hace el código) ─────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100

/** Formato español `2.162,49€` (regla del repo). Local para no arrastrar dependencias. */
export function eurIA(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)}€`
}

function etiquetar(opciones: readonly OpcionIA[]): OpcionConEtiqueta[] {
  return opciones.slice(0, MAX_OPCIONES_IA).map((o, i) => ({ ...o, etiqueta: `Opción ${i + 1}` }))
}

/** Normaliza un nombre de cobertura o compañía: sin tildes, sin mayúsculas, espacios simples. */
export function normalizarNombre(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const estadoCob = (c: CoberturaIA) => (c.incluida === true ? 'incluida' : c.incluida === false ? 'no incluida' : 'ver texto')

/** Serializa UNA opción campo a campo (lista blanca). Nada de `JSON.stringify(o)`. */
function bloqueOpcion(o: OpcionConEtiqueta, masBarata: number): string {
  const lineas = [
    `${o.etiqueta}: ${limpiarLinea(o.compania)} · ${limpiarLinea(o.producto)}${o.modalidad ? ` (${limpiarLinea(o.modalidad)})` : ''}`,
    `  Prima anual: ${eurIA(o.primaEur)}${o.primaEur > masBarata ? ` (${eurIA(r2(o.primaEur - masBarata))} más que la más barata)` : ' (la más barata)'}`,
    `  Franquicia: ${o.franquiciaEur === null ? 'no consta' : eurIA(o.franquiciaEur)}`,
  ]
  if (o.coberturas === null) {
    lineas.push('  Coberturas: NO CONSTAN (la compañía no nos las ha mandado o no se han podido leer)')
  } else if (o.coberturas.length === 0) {
    lineas.push('  Coberturas: la compañía mandó la lista vacía')
  } else {
    lineas.push('  Coberturas:')
    for (const c of o.coberturas.slice(0, MAX_COBERTURAS_POR_OPCION)) {
      const texto = c.texto ? ` — «${limpiarLinea(c.texto).slice(0, MAX_TEXTO_COBERTURA)}»` : ''
      lineas.push(`   - ${limpiarLinea(c.nombre)}: ${estadoCob(c)}${texto}`)
    }
  }
  return lineas.join('\n')
}

const limpiarLinea = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Diferencias de coberturas entre A y B, calculadas por el código (no por la IA). */
export function diferenciasEntre(a: OpcionIA, b: OpcionIA): string[] {
  const out: string[] = []
  if (a.coberturas === null || b.coberturas === null) {
    const falta = a.coberturas === null ? a.compania : b.compania
    out.push(`No se pueden comparar las coberturas: las de ${falta} no constan.`)
    return out
  }
  const mapa = (l: CoberturaIA[]) => new Map(l.map((c) => [normalizarNombre(c.nombre), c]))
  const ma = mapa(a.coberturas), mb = mapa(b.coberturas)
  const claves = [...new Set([...ma.keys(), ...mb.keys()])]
  for (const k of claves) {
    const ca = ma.get(k), cb = mb.get(k)
    const nombre = (ca ?? cb)!.nombre
    const ea = ca ? estadoCob(ca) : 'no aparece en su lista'
    const eb = cb ? estadoCob(cb) : 'no aparece en su lista'
    if (ea !== eb || (ea === 'ver texto' && (ca?.texto ?? '') !== (cb?.texto ?? ''))) {
      out.push(`${limpiarLinea(nombre)}: en ${a.compania} ${ea}; en ${b.compania} ${eb}.`)
    }
  }
  return out
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

export const SISTEMA_IA = [
  'Eres el asistente de una correduría de seguros española. Explicas a un cliente, en español claro y breve, en qué se diferencian unas opciones de seguro.',
  'REGLAS OBLIGATORIAS:',
  '1. Describe diferencias. NO recomiendes ninguna opción, no digas cuál es mejor, más conveniente o la que debería elegir.',
  '2. Usa SOLO los datos que te doy. No inventes coberturas, límites, capitales ni condiciones. Si algo no consta, di «no consta».',
  '3. No hagas cuentas. Si mencionas un importe, cópialo EXACTAMENTE como aparece en los datos (formato 1.234,56€).',
  '4. No menciones ninguna compañía que no esté en los datos.',
  '5. Cada afirmación sobre una cobertura va con su cita, así: (Según: <compañía> · <cobertura>).',
  '6. Sin markdown, sin emojis, sin listas largas. Tuteo.',
].join('\n')

export function promptResumen(opciones: readonly OpcionIA[]): string {
  const et = etiquetar(opciones)
  const masBarata = Math.min(...et.map((o) => o.primaEur))
  return [
    'Estas son las opciones que ha recibido el cliente:',
    '',
    ...et.map((o) => bloqueOpcion(o, masBarata)),
    '',
    'Escribe UN párrafo (máximo 120 palabras) que resuma en qué se parecen y en qué se diferencian: precio, franquicia y coberturas. Sin recomendar.',
  ].join('\n')
}

/**
 * Quita de la pregunta lo que parezca un dato personal antes de mandarla a la IA: correo, DNI/NIE,
 * matrícula, fechas, teléfonos y —si se pasan— las palabras del nombre del propio tomador (el
 * servicio las conoce; la IA no tiene por qué).
 */
export function limpiarPregunta(p: string, nombres: readonly string[] = []): string {
  let t = p.slice(0, MAX_LONGITUD_PREGUNTA)
  const palabras = new Set(nombres.flatMap((n) => normalizarNombre(n).split(' ')).filter((w) => w.length >= 3))
  if (palabras.size > 0) {
    t = t.replace(/[\p{L}]+/gu, (w) => (palabras.has(normalizarNombre(w)) ? '[dato omitido]' : w))
  }
  return t
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[dato omitido]')
    .replace(/\b[XYZxyz]?\d{7,8}[-\s]?[A-Za-z]\b/g, '[dato omitido]')
    .replace(/\b\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/gi, '[dato omitido]')
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '[dato omitido]')
    .replace(/(\+?\d[\d\s]{8,}\d)/g, '[dato omitido]')
    .replace(/[\r\n]+/g, ' ')
    .trim()
}

export function promptPregunta(a: OpcionIA, b: OpcionIA, pregunta: string, nombresARedactar: readonly string[] = []): string {
  const et = etiquetar([a, b])
  const masBarata = Math.min(a.primaEur, b.primaEur)
  const dif = r2(Math.abs(a.primaEur - b.primaEur))
  const diferencias = diferenciasEntre(a, b)
  return [
    'El cliente compara estas DOS opciones:',
    '',
    ...et.map((o) => bloqueOpcion(o, masBarata)),
    '',
    `Diferencia de prima (ya calculada): ${dif === 0 ? 'ninguna, cuestan lo mismo' : `${eurIA(dif)} al año`}.`,
    'Diferencias de coberturas (ya calculadas):',
    ...(diferencias.length > 0 ? diferencias.map((d) => `- ${d}`) : ['- Ninguna en la lista de coberturas.']),
    '',
    `Pregunta del cliente: «${limpiarPregunta(pregunta, nombresARedactar)}»`,
    '',
    'Responde en 2-4 frases, solo con estos datos y citando la cobertura de la que sale cada afirmación. Si la respuesta no está en los datos, dilo y sugiere preguntarlo al corredor.',
  ].join('\n')
}

// ─── Límites en servidor ─────────────────────────────────────────────────────

export type DecisionPregunta = { estado: 'ok'; pregunta: string } | { estado: 'limite' } | { estado: 'invalida' }

/** Se decide ANTES de llamar a la IA: tope por presupuesto y día, y longitud. */
export function decidirPregunta(e: { hechasHoy: number; pregunta: unknown }): DecisionPregunta {
  if (typeof e.pregunta !== 'string') return { estado: 'invalida' }
  const p = e.pregunta.trim()
  if (p.length < 3 || p.length > MAX_LONGITUD_PREGUNTA) return { estado: 'invalida' }
  if (!Number.isFinite(e.hechasHoy) || e.hechasHoy >= MAX_PREGUNTAS_DIA) return { estado: 'limite' }
  return { estado: 'ok', pregunta: p }
}

// ─── Validación de la salida ─────────────────────────────────────────────────

/** Aseguradoras que operan en España. Si la IA nombra una que NO está en las opciones, se descarta. */
export const ASEGURADORAS_CONOCIDAS = [
  'Mapfre', 'Allianz', 'AXA', 'Generali', 'Reale', 'Liberty', 'Zurich', 'Mutua Madrileña', 'Línea Directa',
  'Pelayo', 'Caser', 'Catalana Occidente', 'Occident', 'Helvetia', 'Santalucía', 'Plus Ultra', 'FIATC',
  'Verti', 'Regal', 'Direct Seguros', 'Génesis', 'Hilo Directo', 'Balumba', 'Qualitas', 'Segurcaixa', 'Adeslas',
  'Asisa', 'Sanitas', 'DKV', 'Fidelidade', 'Ocaso', 'Mutua General', 'Soliss', 'Nationale Suisse', 'Sura',
  'Aegon', 'Bankinter Seguros', 'Mutua Levante', 'Race', 'Admiral', 'Arag', 'Nueva Mutua Sanitaria', 'Markel',
  'Hiscox', 'Chubb', 'Lagun Aro', 'Seguros Bilbao', 'Previsión Mallorquina', 'Divina Pastora', 'Agropelayo',
]

const RECOMIENDA = /\b(te recomiendo|te recomendamos|recomendar[ií]a|la mejor opci[oó]n|es la mejor|deber[ií]as (elegir|contratar|quedarte)|te conviene|elige la|mi consejo)\b/i

/** Importes en euros del texto: `1.234,56€`, `84,80 €`, `300 euros`, `2162.49€`. */
export function importesDe(texto: string): number[] {
  const out: number[] = []
  const re = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)/gi
  for (const m of texto.matchAll(re)) {
    let s = m[1]
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(',', '.')
    const n = Number(s)
    if (Number.isFinite(n)) out.push(r2(n))
  }
  return out
}

/** Los importes que la IA PUEDE citar: primas, franquicias, diferencias y los de los textos de cobertura. */
export function importesPermitidos(opciones: readonly OpcionIA[]): Set<number> {
  const s = new Set<number>()
  const et = opciones.slice(0, MAX_OPCIONES_IA)
  const masBarata = Math.min(...et.map((o) => o.primaEur))
  for (const o of et) {
    s.add(r2(o.primaEur))
    s.add(r2(o.primaEur - masBarata))
    if (o.franquiciaEur !== null) s.add(r2(o.franquiciaEur))
    for (const c of o.coberturas ?? []) for (const n of importesDe(`${c.texto ?? ''} ${c.nombre}`)) s.add(n)
    for (const p of et) s.add(r2(Math.abs(o.primaEur - p.primaEur)))
  }
  return s
}

export type Validacion = { ok: true; texto: string } | { ok: false; motivo: 'vacia' | 'compania_ajena' | 'cifra_no_cuadra' | 'recomienda' | 'cita_ajena' }

/**
 * ¿Se puede enseñar lo que ha escrito la IA? Descarta si:
 *   · nombra una aseguradora conocida que NO está entre las opciones;
 *   · cita «Según: X · …» con una X que no es ninguna de las opciones;
 *   · trae un importe en euros que no sale de los datos;
 *   · recomienda.
 */
export function validarSalidaIA(texto: string, opciones: readonly OpcionIA[]): Validacion {
  const t = (texto ?? '').trim()
  if (t.length < 20) return { ok: false, motivo: 'vacia' }
  const propias = opciones.map((o) => normalizarNombre(o.compania))
  const nt = ` ${normalizarNombre(t)} `

  for (const a of ASEGURADORAS_CONOCIDAS) {
    const na = normalizarNombre(a)
    if (!nt.includes(` ${na} `)) continue
    const esPropia = propias.some((p) => p.includes(na) || na.includes(p))
    if (!esPropia) return { ok: false, motivo: 'compania_ajena' }
  }

  for (const m of t.matchAll(/Seg[uú]n:\s*([^·)\n]+?)\s*·/gi)) {
    const citada = normalizarNombre(m[1])
    if (!propias.some((p) => p === citada || p.includes(citada) || citada.includes(p))) return { ok: false, motivo: 'cita_ajena' }
  }

  const permitidos = importesPermitidos(opciones)
  for (const n of importesDe(t)) {
    if (![...permitidos].some((p) => Math.abs(p - n) < 0.011)) return { ok: false, motivo: 'cifra_no_cuadra' }
  }

  if (RECOMIENDA.test(t)) return { ok: false, motivo: 'recomienda' }
  return { ok: true, texto: t }
}

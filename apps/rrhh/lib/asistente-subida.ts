// IA de asistencia a la SUBIDA de documentos (admin RR.HH.): reglas PURAS, sin BD ni red.
//
// La IA solo PROPONE; el responsable confirma en una pantalla prellenada. Todo lo que la IA no
// sabe (o devuelve fuera de catálogo / mal formado) queda en `null` — nunca se inventa.
//
// Privacidad: a la IA NO se le manda la plantilla (ni NIF ni nombres de empleados). Solo el texto
// del documento. El emparejamiento con empleados se hace AQUÍ, de forma determinista, por
// IDENTIDAD: NIF > nombre completo único. Dos identificadores distintos no se funden jamás.

export const CATEGORIAS_DOC = [
  'contrato', 'anexo', 'nomina', 'prl_formacion', 'protocolo_politica',
  'sancion', 'vacaciones', 'certificado', 'otro',
] as const
export type CategoriaDoc = (typeof CATEGORIAS_DOC)[number]

export const ETIQUETA_CATEGORIA: Record<CategoriaDoc, string> = {
  contrato: 'Contrato',
  anexo: 'Anexo / modificación de contrato',
  nomina: 'Nómina',
  prl_formacion: 'PRL / formación',
  protocolo_politica: 'Protocolo / política interna',
  sancion: 'Sanción / amonestación',
  vacaciones: 'Vacaciones',
  certificado: 'Certificado',
  otro: 'Otro',
}

/** Carpeta del expediente que se propone por categoría (ids de `@central/module-rrhh`). */
export const CARPETA_POR_CATEGORIA: Record<CategoriaDoc, string> = {
  contrato: 'contratos',
  anexo: 'contratos',
  nomina: 'nominas',
  prl_formacion: 'prevencion_riesgos',
  protocolo_politica: 'otros',
  sancion: 'otros',
  vacaciones: 'otros',
  certificado: 'otros',
  otro: 'otros',
}

export function esCategoria(v: unknown): v is CategoriaDoc {
  return typeof v === 'string' && (CATEGORIAS_DOC as readonly string[]).includes(v)
}

export function carpetaSugerida(c: CategoriaDoc | null): string | null {
  return c ? CARPETA_POR_CATEGORIA[c] : null
}

// ── NIF / NIE ────────────────────────────────────────────────────────────────

const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** Normaliza un NIF/NIE: mayúsculas, sin espacios/puntos/guiones. No valida. */
export function normalizarNif(v: string | null | undefined): string | null {
  if (!v) return null
  const n = String(v).toUpperCase().replace(/[\s.\-]/g, '')
  return n || null
}

/** ¿DNI (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra) con letra de control correcta? */
export function nifValido(v: string | null | undefined): boolean {
  const n = normalizarNif(v)
  if (!n) return false
  let num: string
  if (/^\d{8}[A-Z]$/.test(n)) num = n.slice(0, 8)
  else if (/^[XYZ]\d{7}[A-Z]$/.test(n)) num = String('XYZ'.indexOf(n[0])) + n.slice(1, 8)
  else return false
  return LETRAS[Number(num) % 23] === n[8]
}

/** NIF/NIE válidos (letra de control correcta) que aparecen en el texto, sin repetir. */
export function detectarNifs(texto: string): string[] {
  const out = new Set<string>()
  const re = /\b([XYZ]?[\s.]?\d{1,2}[\s.]?\d{3}[\s.]?\d{3}[\s.\-]?[A-Za-z])\b/g
  for (const m of texto.matchAll(re)) {
    const n = normalizarNif(m[1])
    if (n && nifValido(n)) out.add(n)
  }
  return [...out]
}

// ── Nombres ──────────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes ni signos, espacios simples. */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()
}

function nombreCompleto(e: { nombre: string; apellidos: string | null }): string {
  return normalizarTexto(`${e.nombre} ${e.apellidos ?? ''}`)
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export const MAX_TEXTO_IA = 6000

export function promptAnalisis(texto: string): { system: string; user: string } {
  const system = [
    'Eres un asistente de RR.HH. en España. Analizas UN documento laboral y devuelves SOLO un objeto JSON, sin texto alrededor.',
    'Formato exacto:',
    '{"categoria": <una de: ' + CATEGORIAS_DOC.join(', ') + ' | null>,',
    ' "titulo": <título corto y claro para el empleado, máx. 80 caracteres | null>,',
    ' "requiere_firma": <true si el documento pide la firma o el «recibí» del trabajador; false si es solo informativo | null>,',
    ' "resumen": <2-3 frases para el trabajador explicando qué es y qué debe hacer | null>,',
    ' "personas": [{"nombre": <nombre completo del TRABAJADOR destinatario | null>, "nif": <su DNI/NIE tal como aparece | null>}]}',
    'Reglas: si no estás seguro de un campo, pon null. No inventes nombres ni NIF que no aparezcan en el texto.',
    'En "personas" pon solo trabajadores destinatarios, nunca la empresa, su representante ni el firmante por la empresa.',
  ].join('\n')
  const user = `Texto del documento:\n"""\n${texto.slice(0, MAX_TEXTO_IA)}\n"""`
  return { system, user }
}

// ── Parseo de la respuesta ───────────────────────────────────────────────────

export type PersonaIA = { nombre: string | null; nif: string | null }
export type PropuestaIA = {
  categoria: CategoriaDoc | null
  titulo: string | null
  requiere_firma: boolean | null
  resumen: string | null
  personas: PersonaIA[]
  /** false si la respuesta no se pudo interpretar (todo queda en null). */
  ia_ok: boolean
}

export const PROPUESTA_VACIA: PropuestaIA = {
  categoria: null, titulo: null, requiere_firma: null, resumen: null, personas: [], ia_ok: false,
}

function textoLimpio(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t || /^(null|n\/a|desconocido|ninguno|-)$/i.test(t)) return null
  return t.length > max ? t.slice(0, max).trimEnd() : t
}

/** Saca el primer objeto JSON del texto (admite ```json … ``` y prosa alrededor). */
function extraerJson(raw: string): unknown {
  const sinFence = raw.replace(/```(?:json)?/gi, '')
  const i = sinFence.indexOf('{')
  const j = sinFence.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try { return JSON.parse(sinFence.slice(i, j + 1)) } catch { return null }
}

/**
 * Valida la respuesta de la IA campo a campo. Lo que no encaja → null (o [] en personas cuando la
 * respuesta SÍ se entendió pero no trae personas válidas). Si no hay JSON, `PROPUESTA_VACIA`.
 */
export function parsearRespuestaIA(raw: string | null | undefined): PropuestaIA {
  if (!raw) return { ...PROPUESTA_VACIA }
  const j = extraerJson(raw)
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ...PROPUESTA_VACIA }
  const o = j as Record<string, unknown>
  const cat = typeof o.categoria === 'string' ? o.categoria.trim().toLowerCase() : null
  const personas: PersonaIA[] = []
  if (Array.isArray(o.personas)) {
    for (const p of o.personas.slice(0, 200)) {
      if (!p || typeof p !== 'object') continue
      const q = p as Record<string, unknown>
      const nif = typeof q.nif === 'string' && nifValido(q.nif) ? normalizarNif(q.nif) : null
      const nombre = textoLimpio(q.nombre, 120)
      if (nif || nombre) personas.push({ nombre, nif })
    }
  }
  return {
    categoria: esCategoria(cat) ? cat : null,
    titulo: textoLimpio(o.titulo, 120),
    requiere_firma: typeof o.requiere_firma === 'boolean' ? o.requiere_firma : null,
    resumen: textoLimpio(o.resumen, 600),
    personas,
    ia_ok: true,
  }
}

// ── Emparejamiento con la plantilla ──────────────────────────────────────────

export type EmpleadoMatch = { id: string; nombre: string; apellidos: string | null; dni: string | null }
export type Destinatario = { empleado_id: string; motivo: 'nif' | 'nombre' }
export type ResultadoEmparejo = {
  destinatarios: Destinatario[]
  /** Identificadores vistos en el documento que no casan (o casan con más de uno): para revisar a mano. */
  sin_emparejar: { nombre: string | null; nif: string | null; motivo: 'no_en_plantilla' | 'ambiguo' }[]
}

/**
 * Propone destinatarios. NIF del texto (con letra válida, o el que dé la IA SI aparece en el texto)
 * → empleado con ese DNI. Si no hay NIF, nombre completo (≥2 palabras) que aparezca en el texto y
 * sea ÚNICO en la plantilla. Un NIF que casa con dos fichas, o un nombre repetido → ambiguo, no se
 * asigna. Un empleado cuyo DNI conocido difiere del NIF que la IA atribuye a ese nombre → no se funde.
 */
export function emparejarDestinatarios(texto: string, personasIA: PersonaIA[], empleados: EmpleadoMatch[]): ResultadoEmparejo {
  const textoNorm = ` ${normalizarTexto(texto)} `
  const nifsTexto = new Set(detectarNifs(texto))
  const destinatarios: Destinatario[] = []
  const sin: ResultadoEmparejo['sin_emparejar'] = []
  const ya = new Set<string>()
  const add = (id: string, motivo: Destinatario['motivo']) => { if (!ya.has(id)) { ya.add(id); destinatarios.push({ empleado_id: id, motivo }) } }

  const porNif = new Map<string, EmpleadoMatch[]>()
  for (const e of empleados) {
    const n = normalizarNif(e.dni)
    if (!n) continue
    porNif.set(n, [...(porNif.get(n) ?? []), e])
  }
  const porNombre = new Map<string, EmpleadoMatch[]>()
  for (const e of empleados) {
    // «Nombre Apellidos» y «Apellidos Nombre» (las nóminas y contratos suelen ir al revés).
    const formas = new Set([nombreCompleto(e), normalizarTexto(`${e.apellidos ?? ''} ${e.nombre}`)])
    for (const n of formas) {
      if (n.split(' ').length < 2) continue
      porNombre.set(n, [...(porNombre.get(n) ?? []), e])
    }
  }

  // 1) NIF: los del texto + los de la IA que de verdad aparecen en el texto (anti-alucinación).
  const nifs = new Set(nifsTexto)
  for (const p of personasIA) if (p.nif && nifsTexto.has(p.nif)) nifs.add(p.nif)
  const nifsUsados = new Set<string>()
  for (const nif of nifs) {
    const c = porNif.get(nif) ?? []
    if (c.length === 1) { add(c[0].id, 'nif'); nifsUsados.add(nif) }
    else if (c.length > 1) sin.push({ nombre: null, nif, motivo: 'ambiguo' })
    // NIF sin ficha: puede ser de la empresa o del representante → se informa solo si la IA lo marcó como persona
  }
  for (const p of personasIA) {
    if (p.nif && nifsTexto.has(p.nif) && !porNif.has(p.nif)) sin.push({ nombre: p.nombre, nif: p.nif, motivo: 'no_en_plantilla' })
  }

  // 2) Nombre completo: candidatos = nombres que da la IA + nombres de la plantilla presentes en el texto.
  const nombresIA = new Map<string, string>() // normalizado → como lo escribió la IA
  for (const p of personasIA) if (p.nombre && !(p.nif && nifsUsados.has(p.nif))) nombresIA.set(normalizarTexto(p.nombre), p.nombre)
  for (const [nombre, lista] of porNombre) {
    // Solo por nombre si el nombre completo está EN EL TEXTO (lo que diga la IA no basta).
    if (!textoNorm.includes(` ${nombre} `)) continue
    if (lista.length > 1) { if (!lista.some(e => ya.has(e.id))) sin.push({ nombre, nif: null, motivo: 'ambiguo' }); continue }
    const e = lista[0]
    if (ya.has(e.id)) continue
    // Si la IA atribuye a este nombre un NIF del texto distinto al de la ficha → son dos identidades.
    const nifIA = personasIA.find(p => p.nombre && normalizarTexto(p.nombre) === nombre && p.nif && nifsTexto.has(p.nif))?.nif
    const dniFicha = normalizarNif(e.dni)
    if (nifIA && dniFicha && nifIA !== dniFicha) { sin.push({ nombre, nif: nifIA, motivo: 'ambiguo' }); continue }
    add(e.id, 'nombre')
  }
  for (const [n, original] of nombresIA) {
    if (!porNombre.has(n) && !sin.some(s => s.nombre && normalizarTexto(s.nombre) === n)) {
      sin.push({ nombre: original, nif: null, motivo: 'no_en_plantilla' })
    }
  }
  return { destinatarios, sin_emparejar: sin }
}

/**
 * Qué coincidencias se PRESELECCIONAN. Que un NIF o nombre de la plantilla aparezca en el texto no
 * basta: en un contrato también aparece el representante de la empresa, que puede estar en plantilla.
 * Solo se marca a quien la IA (respuesta válida, `iaOk`) identifica como TRABAJADOR destinatario en
 * `personas` (por NIF o por nombre completo). El resto va a «revisa a mano», sin marcar. Sin IA
 * (no configurada o respuesta inválida) no se preselecciona a nadie: estado conservador.
 */
export function clasificarDestinatarios(
  destinatarios: Destinatario[], personasIA: PersonaIA[], iaOk: boolean, empleados: EmpleadoMatch[],
): { preseleccionados: Destinatario[]; a_revisar: Destinatario[] } {
  if (!iaOk) return { preseleccionados: [], a_revisar: [...destinatarios] }
  const porId = new Map(empleados.map(e => [e.id, e]))
  const preseleccionados: Destinatario[] = []
  const a_revisar: Destinatario[] = []
  for (const d of destinatarios) {
    const e = porId.get(d.empleado_id)
    const dni = normalizarNif(e?.dni)
    const formas = e ? new Set([nombreCompleto(e), normalizarTexto(`${e.apellidos ?? ''} ${e.nombre}`)]) : new Set<string>()
    // Por NIF; o por nombre completo si no hay dos NIF distintos de por medio (nunca fundir identidades).
    const trabajador = !!e && personasIA.some(p =>
      (!!p.nif && !!dni && p.nif === dni)
      || (!!p.nombre && !(p.nif && dni && p.nif !== dni) && normalizarTexto(p.nombre).split(' ').length >= 2 && formas.has(normalizarTexto(p.nombre))))
    ;(trabajador ? preseleccionados : a_revisar).push(d)
  }
  return { preseleccionados, a_revisar }
}

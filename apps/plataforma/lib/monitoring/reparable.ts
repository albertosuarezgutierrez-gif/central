// 🔧 ¿Este latido rojo se puede intentar reparar solo? — decisión PURA (sin BD ni red).
//
// Hermano de `latidos.ts`: aquel decide si un agente ha dejado de latir, y este decide si esa avería
// tiene pinta de arreglarse TOCANDO CÓDIGO. Lo consume el disparador de `latido-reparar.yml`, que
// manda el caso al orquestador (`scripts/ai-programar.mjs`).
//
// ── LAS DOS LECCIONES QUE LO GOBIERNAN (20/08/2026, cron `sivra_canal`) ─────────────────────────
//
// 1. NO TODO LATIDO ROJO ES UN BUG. El histórico de esta casa está lleno de rojos que no se arreglan
//    en el repo: IMAP caído, Nominatim bloqueando la IP de Vercel, Serper devolviendo `organic: []`,
//    el conector de Booking mudo. Disparar un orquestador contra esos escribe un parche para un
//    problema que no está aquí. Es la doctrina «no lo sé ≠ no hay» del CLAUDE.md raíz aplicada al
//    disparador: una excepción es «el código revienta»; el resto es «no he podido mirar».
//
// 2. EL AVISO NO ES EL DIAGNÓSTICO. La `nota` de `sivra_canal` en `AGENTES_VIGILADOS` afirmaba que
//    un fallo ahí significaba que «el problema está aguas arriba, en la rutina de Booking y en el
//    plan de escaparate, no en este cron». Era FALSO: las 22 mediciones de escaparate estaban en la
//    tabla y el cron moría en su primera consulta (`42883 date - bigint`). Lo único cierto del parte
//    era la cadena de la excepción. Por eso aguas abajo se manda la EVIDENCIA (el `detalle` crudo) y
//    NUNCA la narración: un reparador que lea la nota va derecho al fichero equivocado.

/** Estados en los que una reparación se considera VIVA (no se dispara otra encima). */
export const ESTADOS_VIVOS = ['intentando', 'pr_abierto', 'mergeada'] as const

/** Intentos por agente dentro de la ventana. Agotados, se rinde y avisa UNA vez. */
export const MAX_INTENTOS = 3
/** Ventana en días sobre la que se cuentan los intentos. */
export const VENTANA_DIAS = 30

/**
 * Marcadores de fallo TÉCNICO en tiempo de ejecución que no llevan `*Error` en el nombre.
 * Lista corta a propósito: cada entrada tiene que ser inequívoca. Un marcador ambiguo mete en el
 * carril automático averías que no están en el repo, que es el error caro de este módulo.
 */
const MARCADORES_RUNTIME = [
  'econnrefused', 'econnreset', 'enotfound', 'etimedout', 'epipe',
  'is not a function', 'cannot read prop', 'undefined is not',
  'invalid `prisma.', 'unhandled rejection', 'segmentation fault',
]

/** Palabras vacías que no aportan identidad al fallo. */
const VACIAS = new Set([
  'error', 'the', 'and', 'for', 'with', 'from', 'que', 'con', 'los', 'las', 'del', 'por',
  'una', 'uno', 'este', 'esta',
  // Andamiaje que Prisma repite IGUAL en todos sus errores: si entra en la firma, la diluye y dos
  // averías distintas acaban pareciéndose («invalid-code-…» en las dos).
  'invocation', 'failed', 'query', 'raw', 'message', 'invalid', 'code', 'prisma', 'queryraw',
  'executeraw',
])

function normalizar(detalle: string | null | undefined): string {
  return String(detalle ?? '').toLowerCase()
}

/**
 * ¿El parte describe una EXCEPCIÓN (reparable aquí) o un «no he podido mirar» (reparable fuera)?
 *
 * 🚨 Un `error:` suelto NO basta. En castellano aparece en partes que describen degradaciones
 * perfectamente normales («sin errores», «error de red al consultar el portal»), y colarlas por el
 * carril automático es exactamente lo que este módulo existe para evitar. Hace falta un nombre
 * COMPUESTO de excepción (`PrismaClientKnownRequestError`, `TypeError`…), un SQLSTATE, o uno de los
 * marcadores de runtime de arriba.
 */
export function esExcepcion(detalle: string | null | undefined): boolean {
  const txt = normalizar(detalle)
  if (!txt) return false
  if (sqlstateDe(txt)) return true
  if (nombreExcepcion(txt)) return true
  return MARCADORES_RUNTIME.some(m => txt.includes(m))
}

/** SQLSTATE de Postgres tal y como lo publica Prisma (`Code: \`42883\``) o un log en castellano. */
function sqlstateDe(txt: string): string | null {
  const m =
    txt.match(/code:\s*`?([0-9a-z]{5})`?/) ??
    txt.match(/\b(?:sqlstate|c[oó]digo)[:\s]+`?([0-9a-z]{5})`?/)
  // Un SQLSTATE siempre empieza por dígito (clases 00-HV): así no se cuela cualquier palabra de 5.
  return m && /^[0-9]/.test(m[1]) ? m[1] : null
}

/**
 * Nombre compuesto de excepción. Se queda con el MÁS LARGO: en `error: PrismaClientKnownRequestError`
 * el primer match sería el `error` de cabecera, que no identifica nada.
 */
function nombreExcepcion(txt: string): string | null {
  const todos = txt.match(/\b[a-z]{2,}(?:error|exception)\b/g)
  if (!todos?.length) return null
  const mejor = todos.sort((a, b) => b.length - a.length)[0]
  return mejor === 'error' || mejor === 'exception' ? null : mejor
}

/**
 * Huella ESTABLE del fallo. No vale la frase entera: los partes llevan horas, contadores y rutas que
 * cambian en cada pasada, y con eso la misma avería parecería nueva cada día y dispararía un intento
 * diario para siempre.
 *
 * Se queda con lo que identifica al fallo y no varía: SQLSTATE + nombre de excepción + las primeras
 * palabras significativas del mensaje. Cinco palabras, no más: el `detalle` se guarda TRUNCADO a 160
 * caracteres, así que las últimas pueden venir partidas («date - big» por «date - bigint») y meterlas
 * en la firma la volvería inestable justo en el borde.
 */
export function firmaError(detalle: string | null | undefined): string | null {
  const txt = normalizar(detalle)
  if (!txt) return null
  const partes: string[] = []
  const sqlstate = sqlstateDe(txt)
  if (sqlstate) partes.push(sqlstate)
  const excepcion = nombreExcepcion(txt)
  if (excepcion) partes.push(excepcion)

  // 🚨 NO se pueden recortar los tramos entre backticks (que es donde Prisma mete el mensaje de
  // Postgres): el `detalle` se guarda TRUNCADO, así que el backtick de apertura del mensaje llega
  // sin su pareja y un recorte por pares dejaría fuera el mensaje en la pasada truncada y dentro en
  // la completa — misma avería, dos firmas. Se tokeniza el parte ENTERO y el andamiaje se filtra por
  // `VACIAS`, que no depende de dónde caiga el corte.
  const palabras = txt
    .replace(/[^a-záéíóúñ\s-]+/g, ' ') // fuera backticks, dígitos y puntuación (horas, ids, contadores)
    .split(/[\s-]+/)
    .filter(p => p.length >= 3 && !VACIAS.has(p) && p !== excepcion)
    // Cinco palabras: la sexta es justo la que el truncado parte por la mitad
    // («date - big» por «date - bigint») y volvería inestable la firma en el borde.
    .slice(0, 5)

  if (palabras.length) partes.push(palabras.join('-'))
  return partes.length ? partes.join(':') : null
}

export type IntentoPrevio = {
  firma: string
  estado: string
  intentoAt: Date
}

export type DecisionReparacion = {
  reparar: boolean
  firma: string | null
  motivo: string
  /** true = se han consumido los intentos; el llamador avisa UNA vez y se rinde. */
  agotado: boolean
}

/**
 * ¿Se dispara una reparación para este agente?
 *
 * `alerta` viene de `evaluarLatido` (no se duplica aquí la lógica de frescura). `historial` son los
 * intentos previos de ESTE agente, más recientes primero.
 */
export function decidirReparacion(params: {
  ahora: Date
  detalle: string | null
  alerta: boolean
  historial: IntentoPrevio[]
  maxIntentos?: number
  ventanaDias?: number
}): DecisionReparacion {
  const {
    ahora, detalle, alerta, historial,
    maxIntentos = MAX_INTENTOS, ventanaDias = VENTANA_DIAS,
  } = params
  const no = (motivo: string, agotado = false): DecisionReparacion =>
    ({ reparar: false, firma: firmaError(detalle), motivo, agotado })

  if (!alerta) return no('el latido no está en rojo')
  if (!esExcepcion(detalle)) {
    return no(
      'el parte no describe una excepción: un «no he podido mirar» (servicio externo caído, corpus ' +
      'vacío, búsqueda sin resultados) no se arregla tocando este repo',
    )
  }
  const firma = firmaError(detalle)
  if (!firma) return no('no se ha podido extraer una firma estable del parte')

  const vivo = historial.find(h => (ESTADOS_VIVOS as readonly string[]).includes(h.estado))
  if (vivo) {
    return no(`ya hay una reparación viva para este agente (${vivo.estado}, firma ${vivo.firma})`)
  }
  // Una firma = un intento. Que siga rojo con el MISMO síntoma no es información nueva: es la misma
  // avería que ya no se supo arreglar, y reintentarla a diario solo quema presupuesto y abre PRs.
  if (historial.some(h => h.firma === firma)) {
    return no('esta misma firma de error ya se intentó; hace falta un síntoma NUEVO para reintentar')
  }
  const desde = new Date(ahora.getTime() - ventanaDias * 86_400_000)
  const recientes = historial.filter(h => h.intentoAt >= desde).length
  if (recientes >= maxIntentos) {
    return no(
      `agotados los ${maxIntentos} intentos de los últimos ${ventanaDias} días: esto necesita ojo humano`,
      true,
    )
  }
  return { reparar: true, firma, motivo: `excepción reparable (${firma})`, agotado: false }
}

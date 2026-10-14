// A QUIÉN se le manda el correo de «presentación de la app» — lógica PURA (sin BD ni red), para que
// `node --test` la vigile sin `prisma generate`.
//
// La SQL de `presentacion-app.ts` ya deja fuera, con datos de la BD: fichas fusionadas o descartadas,
// bajas de correo, quien tiene póliza EN VIGOR (`sqlCarteraEnVigor`, la regla de `esCarteraEnVigor`),
// quien ya entra al portal (`portal_vinculo` que no sea del corredor), rebotes/quejas/suprimidos previos,
// quien recibió recaptación hace poco y quien ya está en esta campaña. Aquí se decide lo que solo se ve
// con el correo DESCIFRADO: forma, dominio muerto, duplicados y el tope.
//
// 🚨 Conservador por diseño: el dominio de envío ya va con ~10,8% de rebote. Ante la duda, NO se manda.

export type CandidatoPresentacion = {
  clienteId: string
  nombre: string | null
  /** Correo ya descifrado. `null` = no se pudo descifrar (≠ «no tiene»): no se manda. */
  email: string | null
  /**
   * Índice ciego del correo (`clientes.email_lookup_hash`). `null` = la ficha no lo tiene: sin él no se
   * puede saber si la MISMA persona está en otra ficha dada de baja, cliente en vigor o ya escrita otro
   * día (la SQL y el índice único de `campana_envio` deduplican por él) → no se manda. Ausente (`undefined`)
   * = quien llama no lo aporta (tests de forma).
   */
  emailHash?: string | null
}

export type MotivoDescarte = 'ilegible' | 'sin_indice' | 'invalido' | 'dominio_muerto' | 'duplicado'

export type SeleccionPresentacion = {
  elegidos: (CandidatoPresentacion & { email: string })[]
  descartes: Record<MotivoDescarte, number>
  /** Válidos que se quedan fuera SOLO por el tope de hoy (saldrán otro día). */
  fueraPorTope: number
}

/**
 * Proveedores de correo españoles CERRADOS (sus buzones ya no existen: todo lo que se les mande rebota)
 * y erratas evidentes de dominios grandes. Lista corta y segura; ampliarla con lo que devuelvan los
 * rebotes reales, nunca a ojo.
 */
export const DOMINIOS_MUERTOS: readonly string[] = [
  'wanadoo.es', 'ya.com', 'terra.es', 'eresmas.com', 'eresmas.net', 'mixmail.com', 'jazzfree.com',
  'teleline.es', 'lycos.es', 'navegalia.com',
  // Erratas: no son buzones de nadie.
  'gmail.es', 'gmial.com', 'gmai.com', 'gamil.com', 'hotmial.com', 'hotmal.com', 'hotmail.co', 'homail.com',
]

const TLD_ERRATA = /\.(con|cmo|ocm|comm|es\.)$/i

export function normalizarEmail(e: string): string {
  return e.trim().toLowerCase()
}

/**
 * Forma de un correo que se puede usar. Más estricta que la RFC a propósito: el volcado trae «-», «no
 * tiene», dos correos en un campo, espacios… Todo eso es NO.
 */
export function emailSintacticoValido(e: string): boolean {
  const v = normalizarEmail(e)
  if (v.length < 6 || v.length > 254) return false
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v)) return false
  const [usuario, dominio] = v.split('@') as [string, string]
  if (usuario.startsWith('.') || usuario.endsWith('.') || usuario.includes('..')) return false
  if (dominio.split('.').some((t) => t === '' || t.startsWith('-') || t.endsWith('-'))) return false
  if (TLD_ERRATA.test(dominio)) return false
  return true
}

export function dominioMuerto(e: string): boolean {
  const dominio = normalizarEmail(e).split('@')[1] ?? ''
  return DOMINIOS_MUERTOS.includes(dominio)
}

/**
 * Buzones PERSONALES de los grandes proveedores: son los que más probablemente sigan vivos años después
 * (un correo de empresa muere cuando la persona cambia de trabajo; uno de proveedor local, cuando cierra).
 */
export const DOMINIOS_PERSONALES: readonly string[] = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.es',
  'msn.com', 'yahoo.es', 'yahoo.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me',
]

/** 0 = buzón personal de un gran proveedor (primero); 1 = el resto. */
export function prioridadDominio(e: string): 0 | 1 {
  const dominio = normalizarEmail(e).split('@')[1] ?? ''
  return DOMINIOS_PERSONALES.includes(dominio) ? 0 : 1
}

/**
 * Filtra, deduplica por CORREO (dos fichas con el mismo correo = una persona = un correo) y corta en
 * `tope` personas. ORDEN (goteo medido, 15/10/2026): primero los buzones personales de grandes
 * proveedores y, dentro de cada grupo, el orden de entrada (la SQL los trae de la ficha más reciente a la
 * más antigua). El primero de cada correo es el que se queda.
 */
export function seleccionarDestinatariosPresentacion(
  candidatos: readonly CandidatoPresentacion[],
  tope: number,
): SeleccionPresentacion {
  const descartes: Record<MotivoDescarte, number> = { ilegible: 0, sin_indice: 0, invalido: 0, dominio_muerto: 0, duplicado: 0 }
  const vistos = new Set<string>()
  const elegidos: SeleccionPresentacion['elegidos'] = []
  let fueraPorTope = 0
  const max = Math.max(0, Math.floor(tope))
  // `sort` es estable: dentro de cada prioridad se conserva el orden de llegada (más reciente primero).
  const ordenados = [...candidatos].sort(
    (a, b) => (a.email === null ? 1 : prioridadDominio(a.email)) - (b.email === null ? 1 : prioridadDominio(b.email)),
  )
  for (const c of ordenados) {
    if (c.email === null) { descartes.ilegible++; continue }
    if (c.emailHash === null) { descartes.sin_indice++; continue }
    if (!emailSintacticoValido(c.email)) { descartes.invalido++; continue }
    if (dominioMuerto(c.email)) { descartes.dominio_muerto++; continue }
    const clave = normalizarEmail(c.email)
    if (vistos.has(clave)) { descartes.duplicado++; continue }
    vistos.add(clave)
    if (elegidos.length >= max) { fueraPorTope++; continue }
    elegidos.push({ ...c, email: clave })
  }
  return { elegidos, descartes, fueraPorTope }
}

// ── Interruptores (env) ─────────────────────────────────────────────────────────────────────────────

export const TOPE_DIARIO_POR_DEFECTO = 20
export const TOPE_DIARIO_MAXIMO = 500

/** APAGADO salvo `ASEGURA_PRESENTACION_APP_ACTIVA=1` exacto. */
export function presentacionAppActiva(env: Partial<Record<string, string | undefined>> = process.env): boolean {
  return env.ASEGURA_PRESENTACION_APP_ACTIVA?.trim() === '1'
}

/**
 * Tope de correos POR DÍA (no por pasada). Un valor ilegible o ≤0 cae al defecto (20, goteo), nunca a «sin
 * tope»; por arriba se corta en 500 para que una errata (`5000`) no queme el dominio en una mañana.
 */
export function topeDiarioPresentacion(env: Partial<Record<string, string | undefined>> = process.env): number {
  const n = Number.parseInt(env.ASEGURA_PRESENTACION_APP_TOPE_DIARIO?.trim() ?? '', 10)
  if (!Number.isFinite(n) || n <= 0) return TOPE_DIARIO_POR_DEFECTO
  return Math.min(n, TOPE_DIARIO_MAXIMO)
}

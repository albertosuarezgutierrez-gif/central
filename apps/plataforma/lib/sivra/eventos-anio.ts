// lib/sivra/eventos-anio.ts — ¿la evidencia habla del MISMO año que la fecha registrada?
//
// POR QUÉ (04/10/2026). La búsqueda web dio de alta un evento con rate_date=2027-09-26 cuando su
// evidencia decía «26 de septiembre de 2026» (ya pasado), y el verificador lo CONFIRMÓ. Con
// factor ≥2 la regla de vísperas del motor infla además las noches vecinas saltándose el raíl.
// La IA acierta día y mes y se equivoca de año: la evidencia que ella misma cita lo delata.
//
// REGLA: incoherente = la evidencia cita EXPLÍCITAMENTE al menos un año y NINGUNO es el de la
// fecha. Sin año en la evidencia → no se sabe → NO se bloquea por esto (dato que no hay ≠ «no»).
//
// Módulo PURO: sin Prisma, sin `@/`, testeable con `node --test`.

/** Años plausibles para un evento (evita leer aforos o importes como años). */
const ANIO = /(?<![\d.,])(20[2-3]\d)(?:\s*[-/]\s*(\d{2}))?(?![\d.,]?\d)/g

/** Años que la evidencia cita explícitamente. «2026/27» o «2026-27» cuentan los dos. */
export function aniosCitados(texto: string | null | undefined): number[] {
  const out = new Set<number>()
  for (const m of String(texto ?? '').matchAll(ANIO)) {
    const a = Number(m[1])
    out.add(a)
    // Temporada abreviada («2026/27»): el segundo año solo si es el siguiente, no un día/mes.
    if (m[2] != null && Number(m[2]) === (a + 1) % 100) out.add(a + 1)
  }
  return [...out].sort((x, y) => x - y)
}

/**
 * ¿La evidencia contradice el AÑO de `rateDate` (YYYY-MM-DD)? `false` si no cita ningún año o si
 * la fecha no es legible: sin con qué comparar, esta guarda no opina.
 */
export function anioIncoherente(
  rateDate: string | null | undefined,
  evidencia: string | null | undefined,
): boolean {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(String(rateDate ?? '').trim())
  if (!m) return false
  const citados = aniosCitados(evidencia)
  if (!citados.length) return false
  return !citados.includes(Number(m[1]))
}

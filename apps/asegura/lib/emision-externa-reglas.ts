// Reglas puras de `emision-externa.ts` (sin BD ni red), aparte para poder testearlas con `node --test`.

/**
 * La misma coincidencia que `/emitir`: nombre común del catálogo vs el del vendor.
 * Un nombre vacío (tras trim) NO coincide con nada: `includes('')` es siempre true y acuñaría con
 * cualquier compañía del catálogo.
 */
export function coincideCompania(nombreComun: string, aseguradora: string): boolean {
  const a = nombreComun.trim().toLowerCase()
  const b = aseguradora.trim().toLowerCase()
  if (a === '' || b === '') return false
  return a === b || a.includes(b) || b.includes(a)
}

const normalizarNumero = (n: string): string => n.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * ¿Ya hay en la cartera de ese cliente una póliza con el mismo nº y la misma compañía? Si la hay, el
 * cron NO acuña otra (duplicaría la póliza): manda el caso a revisión. Sin nº o sin compañía no se
 * puede demostrar que sea la misma → `false` (el acuñado ya exige ambas cosas).
 */
export function hayPolizaDuplicada(
  existentes: readonly { aseguradora: string | null; numeroPoliza: string | null }[],
  compania: string | null,
  numeroPoliza: string | null,
): boolean {
  if (!compania || !numeroPoliza) return false
  const n = normalizarNumero(numeroPoliza)
  if (n === '') return false
  return existentes.some((p) => !!p.aseguradora && !!p.numeroPoliza && normalizarNumero(p.numeroPoliza) === n && coincideCompania(p.aseguradora, compania))
}

/** Ramos de personas: el crudo del vendor trae nombres, fechas de nacimiento y datos de salud de los asegurados. */
export const RAMOS_PERSONAS: readonly string[] = ['vida', 'salud', 'decesos']

const contarAsegurados = (v: unknown): number => {
  if (Array.isArray(v)) return v.reduce<number>((a, x) => a + contarAsegurados(x), 0)
  if (!v || typeof v !== 'object') return 0
  let n = 0
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/^insureds?$/i.test(k)) n += Array.isArray(val) ? val.length : val && typeof val === 'object' ? 1 : 0
    else n += contarAsegurados(val)
  }
  return n
}

/**
 * Lo que se guarda en `codeoscopic_projects.quote_data` (jsonb SIN cifrar). Auto/moto/hogar: el crudo
 * ya redactado (DNI/IBAN/email/móvil). Vida/salud/decesos: SOLO una lista blanca (línea, la emisión
 * ya resumida y cuántos asegurados) — ni nombres, ni apellidos, ni fechas de nacimiento, ni
 * cuestionarios o datos médicos. Nada lee de ahí más campos: la lectura de la emisión se hace sobre
 * el crudo en memoria.
 */
export function quoteDataAGuardar(
  ramo: string,
  crudo: unknown,
  resumenEmision: unknown,
  redactar: (v: unknown) => unknown,
): unknown {
  if (!RAMOS_PERSONAS.includes(ramo)) return redactar(crudo)
  const linea = (crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>).insuranceLine : null) as Record<string, unknown> | null
  return redactar({
    insuranceLine: { id: typeof linea?.id === 'string' ? linea.id : null },
    emision: resumenEmision,
    asegurados: contarAsegurados(crudo),
    datosPersonalesOmitidos: true,
  })
}

// El HISTORIAL DEL RIESGO (Alberto, 23/09/2026: «¿realmente es historial de la póliza, no?» — no:
// es el del BIEN). Un coche o una casa pasa por varias pólizas: renovaciones con número nuevo,
// cambios de compañía. La ficha de una póliza sola no lo cuenta; esto ordena la cadena.
//
// Puro: recibe los eslabones ya leídos (en asegura) y decide el orden y cómo se nombra cada uno.

export type EslabonRiesgo = {
  id: string
  aseguradora: string | null
  numeroPoliza: string | null
  fechaInicio: string | null
  fechaVencimiento: string | null
  estado: string
  sustituida: boolean
  /** Cartera viva (la mantiene CIMA). La copia del volcado de la MISMA póliza se descarta a favor de esta. */
  viva: boolean
  /** Por qué está en la cadena: enlace explícito (sustitución/renovación) o solo misma matrícula. */
  via: 'enlace' | 'matricula'
}

export type EslabonHistorial = EslabonRiesgo & { actual: boolean }

/**
 * De la más antigua a la más reciente por fecha de efecto. Sin fecha va al final: una fecha que
 * no se sabe no es «la más antigua». Sin duplicados. Con un solo eslabón no hay historial: `[]`.
 */
/** La misma póliza escrita de dos formas («0007001518236» / «7001518236»): el volcado y CIMA. */
function clavePoliza(e: EslabonRiesgo): string | null {
  const n = (e.numeroPoliza ?? '').replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toUpperCase()
  return n ? `${(e.aseguradora ?? '').trim().toLowerCase()}|${n}` : null
}

export function ordenarHistorialRiesgo(eslabones: readonly EslabonRiesgo[], actualId: string): EslabonHistorial[] {
  const vistos = new Map<string, EslabonRiesgo>()
  for (const e of eslabones) {
    const ya = vistos.get(e.id)
    // Si llega por las dos vías, manda el enlace explícito.
    if (!ya || (ya.via === 'matricula' && e.via === 'enlace')) vistos.set(e.id, e)
  }
  // La copia gemela (mismo número y compañía) no es otro eslabón: se queda la viva, o la que se mira.
  const porPoliza = new Map<string, EslabonRiesgo>()
  const sueltas: EslabonRiesgo[] = []
  for (const e of vistos.values()) {
    const k = clavePoliza(e)
    if (!k) { sueltas.push(e); continue }
    const ya = porPoliza.get(k)
    const gana = (x: EslabonRiesgo) => (x.id === actualId ? 2 : 0) + (x.viva ? 1 : 0)
    if (!ya || gana(e) > gana(ya)) porPoliza.set(k, e)
  }
  const unicos = [...porPoliza.values(), ...sueltas]
  if (unicos.length < 2 || !unicos.some((e) => e.id === actualId)) return []
  return unicos
    .sort((a, b) => {
      if (a.fechaInicio === b.fechaInicio) return a.id.localeCompare(b.id)
      if (a.fechaInicio === null) return 1
      if (b.fechaInicio === null) return -1
      return a.fechaInicio.localeCompare(b.fechaInicio)
    })
    .map((e) => ({ ...e, actual: e.id === actualId }))
}

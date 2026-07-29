// Parte PURA del agente de empresas: serializa el dataset a un contexto compacto para la IA.
// Sin imports de runtime (solo `import type`) → testeable con `node --test`.

// Forma mínima que necesita el contexto (EmpresaFila de ./empresas es asignable a esto).
export interface EmpresaCtx {
  empresa: string
  provincia: string | null
  motivo: string
  score: number
  cnae?: string | null
  facturacion?: number | null
  enriquecida?: boolean
  preconcurso?: boolean
}
export interface RadarCtx {
  clave: string
  concursos: number
  disoluciones: number
}
export interface DatosAgente {
  empresas: EmpresaCtx[]
  radar: RadarCtx[]
  total: number
  provincias: string[]
}

export const SYSTEM = `Eres un analista que ayuda a encontrar empresas en dificultad financiera a partir de eventos del BORME.
REGLAS ESTRICTAS:
- Responde SOLO con empresas que aparezcan en la lista de CONTEXTO. NUNCA inventes empresas ni cifras.
- Puedes filtrar/ordenar por provincia, tipo de señal (concurso, disolución, ampliación de capital), score (0-100) y, cuando la empresa esté ENRIQUECIDA, por sector (CNAE) y facturación.
- Las empresas sin enriquecer NO tienen CNAE ni facturación: si te preguntan por eso para una empresa sin dato, dilo y ofrece enriquecerla.
- Sé conciso. Al listar empresas, pon: nombre · provincia · señal · score (y CNAE/facturación si constan). Si no hay coincidencias, dilo.`

/** Formatea una facturación en € de forma compacta para el contexto (p.ej. 1,25M€). Puro. */
function factCompacta(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace('.', ',')}M€`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k€`
  return `${Math.round(n)}€`
}

/** Serializa el dataset a un contexto compacto y acotado para la IA. */
export function construirContexto(d: DatosAgente, maxEmpresas: number): string {
  const radar = d.radar
    .slice(0, 30)
    .map((r) => `${r.clave}: ${r.concursos} concursos, ${r.disoluciones} disoluciones`)
    .join('\n')
  const empresas = d.empresas
    .slice(0, maxEmpresas)
    .map((e) => {
      let linea = `- ${e.empresa} · ${e.provincia ?? '—'} · ${e.motivo} · ${e.score}/100`
      if (e.cnae) linea += ` · CNAE ${e.cnae}`
      if (typeof e.facturacion === 'number') linea += ` · fact. ${factCompacta(e.facturacion)}`
      if (e.preconcurso) linea += ` · preconcurso`
      return linea
    })
    .join('\n')
  return `# Radar por provincia\n${radar || '(sin datos)'}\n\n# Empresas (${d.total})\n${empresas || '(sin empresas)'}\n\n# Provincias con datos\n${d.provincias.join(', ')}`
}

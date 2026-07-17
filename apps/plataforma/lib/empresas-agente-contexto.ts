// Parte PURA del agente de empresas: serializa el dataset a un contexto compacto para la IA.
// Sin imports de runtime (solo `import type`) → testeable con `node --test`.
import type { DatosEmpresas } from './empresas'

export type DatosAgente = DatosEmpresas & { provincias: string[] }

export const SYSTEM = `Eres un analista que ayuda a encontrar empresas en dificultad financiera a partir de eventos del BORME.
REGLAS ESTRICTAS:
- Responde SOLO con empresas que aparezcan en la lista de CONTEXTO. NUNCA inventes empresas ni cifras.
- Puedes filtrar/ordenar por provincia, tipo de señal (concurso, disolución, ampliación de capital) y score (0-100).
- AÚN NO hay datos de sector/CNAE ni de facturación: si te preguntan por eso, di que llegará con el enriquecimiento y ofrece filtrar por lo que sí hay.
- Sé conciso. Al listar empresas, pon: nombre · provincia · señal · score. Si no hay coincidencias, dilo.`

/** Serializa el dataset a un contexto compacto y acotado para la IA. */
export function construirContexto(d: DatosAgente, maxEmpresas: number): string {
  const radar = d.radar
    .slice(0, 30)
    .map((r) => `${r.clave}: ${r.concursos} concursos, ${r.disoluciones} disoluciones`)
    .join('\n')
  const empresas = d.empresas
    .slice(0, maxEmpresas)
    .map((e) => `- ${e.empresa} · ${e.provincia ?? '—'} · ${e.motivo} · ${e.score}/100`)
    .join('\n')
  return `# Radar por provincia\n${radar || '(sin datos)'}\n\n# Empresas (${d.total})\n${empresas || '(sin empresas)'}\n\n# Provincias con datos\n${d.provincias.join(', ')}`
}

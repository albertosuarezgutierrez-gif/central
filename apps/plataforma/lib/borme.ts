// Parser puro de BORME (Boletín Oficial del Registro Mercantil). Sin red ni BD → testeable.
// Recibe anuncios ya descargados (ver lib/borme-ingesta.ts) y clasifica los "actos" registrales
// en señales de dificultad/financiación. Runner de tests: `node --test` (type-stripping).

export type TipoEvento = 'concurso' | 'disolucion' | 'ampliacion_capital' | 'cese' | 'otro'

const REGLAS: Array<[RegExp, TipoEvento]> = [
  [/concurso/i, 'concurso'],
  [/disoluci[oó]n|extinci[oó]n|liquidaci[oó]n/i, 'disolucion'],
  [/ampliaci[oó]n de capital|aumento de capital/i, 'ampliacion_capital'],
  [/cese|nombramiento|dimisi[oó]n|revocaci[oó]n/i, 'cese'],
]

/** Clasifica el texto de un acto registral en un tipo de evento. */
export function clasificarActo(acto: string): TipoEvento {
  for (const [re, tipo] of REGLAS) if (re.test(acto)) return tipo
  return 'otro'
}

/** Normaliza el nombre de una empresa para agrupar variantes (mayúsculas, sin puntuación ni forma societaria). */
export function normalizarEmpresa(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita diacríticos (LÓPEZ → LOPEZ) para agrupar variantes
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(S\s*L\s*U|S\s*L|S\s*A\s*U|S\s*A|SOCIEDAD LIMITADA(?: UNIPERSONAL)?|SOCIEDAD ANONIMA|SLU|SL|SAU|SA)\b/g, ' ')
    .replace(/[^A-ZÑ0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Evento normalizado que consume la ingesta.
export interface EventoBorme {
  dedupeKey: string
  fecha: string
  empresa: string
  empresaNorm: string
  provincia: string | null
  tipo: TipoEvento
  actoRaw: string
  bormeId: string
  url: string | null
}

/**
 * Convierte un anuncio BORME (ya descargado) en sus eventos.
 * El shape del anuncio del feed real se fija en el spike de la ingesta; aquí se leen los campos
 * de forma defensiva (varios alias posibles) para tolerar variaciones del feed.
 */
export function parseAnuncio(a: Record<string, unknown>, fecha: string): EventoBorme[] {
  const empresa = String((a.titulo ?? a.empresa ?? a.title ?? '') as string).trim()
  if (!empresa) return []
  const provincia = (a.provincia ?? a.province ?? null) as string | null
  const bormeId = String((a.identificador ?? a.id ?? a.control ?? '') as string)
  const url = (a.url_xml ?? a.urlXml ?? a.url ?? null) as string | null
  const actos: string[] = Array.isArray(a.actos)
    ? (a.actos as unknown[]).map((x) => String(x))
    : [String((a.acto ?? a.texto ?? a.titulo ?? '') as string)]
  const empresaNorm = normalizarEmpresa(empresa)

  return actos
    .map((actoRaw) => actoRaw.trim())
    .filter(Boolean)
    .map((actoRaw) => {
      const tipo = clasificarActo(actoRaw)
      return {
        dedupeKey: `${bormeId}::${tipo}::${empresaNorm}`,
        fecha,
        empresa,
        empresaNorm,
        provincia,
        tipo,
        actoRaw,
        bormeId,
        url,
      }
    })
}

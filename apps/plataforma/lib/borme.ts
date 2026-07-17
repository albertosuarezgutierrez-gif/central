// Parser puro de BORME (Boletín Oficial del Registro Mercantil). Sin red ni BD → testeable.
// Estructura real: el sumario lista, por Sección A, un item POR PROVINCIA con su url_xml; el XML de
// cada provincia trae en <texto> pares <p class="articulo">Nº - EMPRESA SL.</p> +
// <p class="parrafo">acto…</p>. Aquí se clasifican los actos en señales de dificultad/financiación.
// Runner de tests: `node --test` (type-stripping).

export type TipoEvento = 'concurso' | 'disolucion' | 'ampliacion_capital' | 'cese' | 'otro'

const REGLAS: Array<[RegExp, TipoEvento]> = [
  [/concurs/i, 'concurso'], // concurso, concursal, concursado, "declaración de concurso"
  [/disoluci[oó]n|extinci[oó]n|liquidaci[oó]n/i, 'disolucion'],
  [/ampliaci[oó]n de capital|aumento de capital/i, 'ampliacion_capital'],
  [/cese|dimisi[oó]n|nombramiento|revocaci[oó]n/i, 'cese'],
]

/** Clasifica el texto de un acto (parrafo) en un tipo de evento. Orden = prioridad de la señal. */
export function clasificarActo(acto: string): TipoEvento {
  for (const [re, tipo] of REGLAS) if (re.test(acto)) return tipo
  return 'otro'
}

/** Normaliza el nombre de una empresa para agrupar variantes (mayúsculas, sin tildes, puntuación ni forma societaria). */
export function normalizarEmpresa(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita diacríticos (LÓPEZ → LOPEZ)
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(S\s*L\s*U|S\s*L|S\s*A\s*U|S\s*A|SOCIEDAD LIMITADA(?: UNIPERSONAL)?|SOCIEDAD ANONIMA|SLU|SL|SAU|SA)\b/g, ' ')
    .replace(/[^A-ZÑ0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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

// Un párrafo <p> ya extraído del XML: su clase ('articulo' | 'parrafo') y su texto.
export interface PElem {
  clazz: string
  text: string
}

/**
 * Convierte los <p> del <texto> de un boletín provincial en eventos.
 * Empareja cada <p class="articulo"> (Nº - EMPRESA) con el <p class="parrafo"> siguiente (sus actos).
 * `bormeId` = identificador del boletín provincial; `provincia` = su título.
 */
export function parseActosProvincia(ps: PElem[], provincia: string | null, bormeId: string, fecha: string): EventoBorme[] {
  const eventos: EventoBorme[] = []
  let empresa = ''
  let numero = ''
  for (const p of ps) {
    if (p.clazz === 'articulo') {
      const m = p.text.match(/^\s*(\d+)\s*[-–]\s*(.+?)\.?\s*$/)
      numero = m ? m[1] : ''
      empresa = (m ? m[2] : p.text).trim()
    } else if (p.clazz === 'parrafo' && empresa) {
      const tipo = clasificarActo(p.text)
      if (tipo === 'otro') continue
      eventos.push({
        dedupeKey: `${bormeId}::${numero || normalizarEmpresa(empresa)}::${tipo}`,
        fecha,
        empresa,
        empresaNorm: normalizarEmpresa(empresa),
        provincia,
        tipo,
        actoRaw: p.text.slice(0, 500),
        bormeId,
        url: null,
      })
    }
  }
  return eventos
}

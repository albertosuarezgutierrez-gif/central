// Agente "especialista en convenios": construye el prompt y parsea la respuesta. Módulo PURO
// (sin prisma) para poder testearlo. Reutilizable por CUALQUIER empresa: solo cambia el código.
import { cleanJSON } from '@central/core-ai'

export type ConvenioDatos = {
  resumen: string
  /** Días que corresponden por permiso retribuido, según el convenio (clave → días/texto). */
  dias_permisos?: Record<string, number | string>
  jornada_anual_horas?: number | string | null
  vacaciones?: number | string | null
  /** Fuente citada (URL del BOP/BOE o referencia). */
  fuente?: string | null
}

const SYSTEM = [
  'Eres un especialista en convenios colectivos españoles. Te dan el código REGCON de un convenio',
  '(y a veces su nombre) y debes localizar el convenio VIGENTE y extraer sus datos clave.',
  'Reglas:',
  '- Usa solo datos que puedas verificar de fuentes oficiales (BOE/BOP/REGCON). Si no estás seguro de',
  '  un valor, ponlo como null o como texto con la salvedad. NO inventes cifras.',
  '- Responde EXCLUSIVAMENTE con un objeto JSON válido (sin texto alrededor, sin markdown), con esta forma:',
  '{',
  '  "resumen": "1-2 frases: nombre del convenio, ámbito y vigencia",',
  '  "dias_permisos": { "matrimonio": 15, "fallecimiento_familiar": 3, "hospitalizacion_familiar": 5,',
  '     "enfermedad_grave_familiar": 5, "mudanza": 1, "deber_inexcusable": "el necesario", "lactancia": "..." },',
  '  "jornada_anual_horas": 1780,',
  '  "vacaciones": "30 días naturales",',
  '  "fuente": "URL o referencia del BOP/BOE"',
  '}',
  '- Los días son los del convenio; si el convenio remite al Estatuto de los Trabajadores, indícalo en el valor.',
].join('\n')

export function construirPromptConvenio(codigo: string, nombre: string | null): { system: string; user: string } {
  const user = [
    `Código REGCON del convenio: ${codigo}.`,
    nombre ? `Nombre indicado por la empresa: ${nombre}.` : '',
    'Localiza este convenio colectivo vigente en España y devuelve el JSON con sus datos clave.',
  ].filter(Boolean).join('\n')
  return { system: SYSTEM, user }
}

/** Parsea la respuesta de la IA a ConvenioDatos. Si no es JSON válido, devuelve el texto como resumen. */
export function parsearConvenio(texto: string): ConvenioDatos {
  try {
    const obj = JSON.parse(cleanJSON(texto))
    if (obj && typeof obj === 'object') {
      return {
        resumen: typeof obj.resumen === 'string' ? obj.resumen : String(texto).slice(0, 400),
        dias_permisos: obj.dias_permisos && typeof obj.dias_permisos === 'object' ? obj.dias_permisos : undefined,
        jornada_anual_horas: obj.jornada_anual_horas ?? null,
        vacaciones: obj.vacaciones ?? null,
        fuente: typeof obj.fuente === 'string' ? obj.fuente : null,
      }
    }
  } catch {
    /* cae al fallback */
  }
  return { resumen: String(texto).slice(0, 600) }
}

// Verificador de citas de la IA de siniestros (PURO). La IA puede citar la póliza entre «» y copiar mal o inventar:
// aquí se comprueba que cada fragmento entre «» existe en el texto de la póliza. Sin texto de póliza no se puede
// verificar nada: todas las citas salen como no encontradas.

export type VerificacionCitas = { verificadas: string[]; noEncontradas: string[] }

/** Normaliza para comparar: minúsculas, comillas tipográficas y guiones unificados, sin espacios/saltos de más. */
export function normalizarParaCita(s: string): string {
  return s
    .replace(/(\p{L})[-­]\s*\n\s*(\p{L})/gu, '$1$2') // guion de corte de línea: «indemni-\nzación»
    .replace(/­/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’“”«»"']/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fragmentos entre «» (sin anidar), sin vacíos, en orden y sin repetir. */
export function extraerCitas(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(/«([^«»]+)»/g)) {
    const c = m[1].trim()
    if (c !== '' && !out.includes(c)) out.push(c)
  }
  return out
}

export function verificarCitas(respuesta: string, textoPoliza: string): VerificacionCitas {
  const base = normalizarParaCita(textoPoliza)
  // También sin espacios: el PDF a veces parte palabras o pega líneas sin espacio.
  const baseCompacta = base.replace(/ /g, '')
  const verificadas: string[] = []
  const noEncontradas: string[] = []
  for (const cita of extraerCitas(respuesta)) {
    // Una cita con «…» o «[...]» se verifica por trozos: cada trozo tiene que existir.
    const trozos = cita.split(/\s*(?:…|\.{3}|\[\s*(?:…|\.{3})\s*\])\s*/).map(normalizarParaCita).filter((t) => t !== '')
    const ok = base !== '' && trozos.length > 0 && trozos.every((t) => base.includes(t) || baseCompacta.includes(t.replace(/ /g, '')))
    ;(ok ? verificadas : noEncontradas).push(cita)
  }
  return { verificadas, noEncontradas }
}

/** Aviso visible que se añade al texto guardado si hay citas que no están en la póliza; `''` si no hay. */
export function avisoCitasNoEncontradas(noEncontradas: string[]): string {
  if (noEncontradas.length === 0) return ''
  return `\n\n⚠️ Estas citas NO aparecen en la póliza: ${noEncontradas.map((c) => `«${c}»`).join('; ')}. No las uses sin comprobarlas contra el documento.`
}

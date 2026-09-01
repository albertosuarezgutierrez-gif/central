// Qué ficheros aceptamos y por qué se rechaza uno. PURO: sin red, sin IA.
//
// Vive aparte de `extraer-auto.ts` a propósito: aquel importa `@central/core-ai`
// —que usa imports sin extensión y por tanto no se puede cargar desde
// `node --test`— y esta decisión sí hay que poder probarla. Separar lo puro de
// la cola de red es además la única forma de que el rechazo de un fichero esté
// verificado, que es justo lo que evita subir 40 MB para nada.

/** Tipos que sabemos abrir. Cualquier otro se rechaza ANTES de subir nada. */
export const TIPOS_ACEPTADOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const

/** 12 MB: una póliza escaneada cabe de sobra y un vídeo no entra por error. */
export const TAMANO_MAXIMO_BYTES = 12 * 1024 * 1024

/**
 * Comprueba el fichero ANTES de gastar nada. Devuelve el motivo o `null`.
 *
 * El motivo es un texto para leer en pantalla, no un código: quien sube una
 * póliza necesita saber qué hacer a continuación, y «tipo no admitido» a secas
 * no lo dice.
 */
export function revisarFichero(f: { type: string; size: number; name?: string }): string | null {
  const esPdfPorNombre = (f.name ?? '').toLowerCase().endsWith('.pdf')
  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(f.type) && !esPdfPorNombre) {
    return `Tipo de fichero no admitido (${f.type || 'desconocido'}). Sube un PDF o una foto.`
  }
  if (f.size <= 0) return 'El fichero está vacío.'
  if (f.size > TAMANO_MAXIMO_BYTES) {
    return `El fichero pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB.`
  }
  return null
}

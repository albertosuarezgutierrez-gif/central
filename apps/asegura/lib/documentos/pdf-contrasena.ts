// PDFs de póliza protegidos con contraseña (29/09/2026, Alberto: «las compañías
// están metiendo PDF con contraseña… siempre son los DNI»). Si la póliza se
// sube a la ficha de un cliente, se prueba SU DNI antes de rendirse.
//
// - El DNI se descifra y se prueba DENTRO de asegura: nunca viaja a plataforma
//   ni al navegador, y nunca sale en la respuesta.
// - `pdf-parse` NO acepta contraseña (medido en el portal el 19/09/2026, ver
//   `apps/asegura-portal/lib/extraer-poliza.ts`): el intento va por `pdfjs-dist`
//   directo, con el mismo patrón (sin worker, sin eval).

/**
 * El PDF está cifrado (trae diccionario `/Encrypt`). No vale fiarse del error de
 * `pdf-parse`: su pdf.js (1.10) ni reconoce el cifrado AES-256 moderno y falla con
 * «bad XRef entry» en vez de `PasswordException` (medido el 29/09/2026).
 */
export function pdfCifrado(buffer: Buffer): boolean {
  return buffer.includes('/Encrypt')
}

/**
 * Las formas en que una compañía escribe el DNI como contraseña: tal cual en
 * mayúsculas («12345678Z»), en minúsculas y sin la letra. Sin espacios, puntos
 * ni guiones. `[]` si no hay documento.
 */
export function contrasenasDesdeDni(dni: string | null | undefined): string[] {
  const base = (dni ?? '').toUpperCase().replace(/[\s.\-/]/g, '')
  if (base === '') return []
  const sinLetraFinal = base.replace(/[A-Z]$/, '')
  return [...new Set([base, base.toLowerCase(), sinLetraFinal].filter((c) => c.length >= 5))]
}

export type LecturaProtegida =
  | { ok: true; texto: string }
  | { ok: false; motivo: 'sin_candidatas' | 'ninguna_vale' | 'ilegible' }

/**
 * Abre el PDF cifrado con `pdfjs-dist`: primero sin contraseña (los que solo tienen
 * la de PROPIETARIO se leen así) y luego cada candidata en orden.
 */
export async function leerPdfProbando(buffer: Buffer, candidatas: string[]): Promise<LecturaProtegida> {
  // Import dinámico: `pdfjs-dist` solo publica ESM. El worker se carga A MANO en
  // `globalThis.pdfjsWorker` (el «fake worker» de pdf.js lo busca ahí): con
  // `workerSrc = ''` —el patrón de rrhh y del portal— pdfjs 4 falla en Node con
  // «Setting up fake worker failed» (medido el 29/09/2026), y un import estático
  // del worker además hace que el trazado de Vercel lo incluya.
  let pdfjsLib: typeof import('pdfjs-dist/legacy/build/pdf.mjs')
  try {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ])
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
    pdfjsLib = lib
  } catch (e) {
    // Nunca lanza: quien llama tiene que poder decir «no se ha podido abrir» (422), no un 500.
    console.warn('[asegura] pdfjs-dist no carga:', e)
    return { ok: false, motivo: 'ilegible' }
  }
  for (const password of ['', ...candidatas]) {
    const tarea = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      password,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    try {
      const doc = await tarea.promise
      let texto = ''
      for (let i = 1; i <= doc.numPages; i++) {
        const contenido = await (await doc.getPage(i)).getTextContent()
        texto += contenido.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
      }
      return { ok: true, texto }
    } catch (e) {
      // code 1 = hace falta contraseña, 2 = no es esta → siguiente. Otro fallo = el PDF no se abre.
      const codigo = e && typeof e === 'object' && 'code' in e ? (e as { code: unknown }).code : null
      if (codigo !== 1 && codigo !== 2) return { ok: false, motivo: 'ilegible' }
    } finally {
      // Libera la tarea (y el documento, si llegó a abrirse) en TODOS los caminos, no solo en el bueno.
      await tarea.destroy().catch(() => undefined)
    }
  }
  return { ok: false, motivo: candidatas.length === 0 ? 'sin_candidatas' : 'ninguna_vale' }
}

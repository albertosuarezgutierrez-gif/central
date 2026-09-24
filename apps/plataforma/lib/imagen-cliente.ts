// apps/plataforma/lib/imagen-cliente.ts
// Encoge en el NAVEGADOR la foto de una factura antes de subirla.
//
// POR QUÉ EXISTE (07/09/2026). Alberto subió la foto de una factura desde el móvil y recibió «se me
// ha cortado la conexión», dos veces, sin que la función llegara a ejecutarse. Una foto de un móvil
// actual pesa 3-8 MB, y el adjunto viaja en base64 dentro del JSON, que abulta ×1,37 más: el cuerpo
// de la petición se planta en 5-11 MB. El tope del código era 11 MB — inalcanzable, porque **una
// Serverless Function de Vercel rechaza el cuerpo mucho antes**, en la plataforma y sin invocar la
// función, así que no hay ni traza en los logs ni JSON en la respuesta: solo un `r.json()` que
// revienta y un mensaje genérico que no dice nada.
//
// La foto se encoge aquí, en el móvil, ANTES de salir: 4 MB pasan a ~300 KB. Con eso el cuerpo cabe
// de sobra, el OCR va más rápido (menos riesgo de agotar el tiempo de la función) y se gastan menos
// datos móviles. Un lado de 2200 px sobre un A4 son ~190 ppp: de sobra para leer importes y fechas —
// encoger más barato saldría caro en lo único que importa, que es que el OCR acierte.
//
// Lo que NO hace: tocar un PDF. Un PDF no se rasteriza aquí (perdería su capa de texto, que es
// justo lo que hace que se lea bien). Si un PDF no cabe, se dice; no se degrada en silencio.

/** Tope del cuerpo que aceptamos enviar, en caracteres de base64. Por debajo del límite real de la
 *  plataforma (4,5 MB de cuerpo), con holgura para el resto del JSON. */
export const TOPE_BASE64 = 3_500_000

const LADO_MAX = 2200
const CALIDAD_INICIAL = 0.82
const CALIDAD_MINIMA = 0.45

export type Adjunto = {
  base64: string
  mimeType: string
  fileName: string
  /** Bytes del fichero original, para poder decir cuánto se ha encogido. */
  bytesOriginal: number
  /** Bytes tras encoger. Igual a `bytesOriginal` si no se tocó (PDF, o ya era pequeño). */
  bytesEnviados: number
  /** true si se rasterizó y recomprimió. */
  comprimida: boolean
}

export function esImagen(tipo: string, nombre = ''): boolean {
  return tipo.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(nombre)
}

const base64De = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1)

function leerComoDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const rd = new FileReader()
    rd.onload = () => resolve(String(rd.result || ''))
    rd.onerror = () => reject(new Error('No se pudo leer el archivo'))
    rd.readAsDataURL(file)
  })
}

/** Escala manteniendo la proporción, sin AGRANDAR nunca (una foto pequeña se queda como está). */
export function medidas(w: number, h: number, ladoMax = LADO_MAX): { w: number; h: number } {
  const mayor = Math.max(w, h)
  if (mayor <= ladoMax) return { w, h }
  const k = ladoMax / mayor
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/**
 * Devuelve el adjunto listo para enviar. Nunca lanza por culpa de la compresión: si algo del canvas
 * falla (navegador viejo, imagen que no decodifica), cae al original — que como mucho será rechazado
 * arriba con un mensaje claro, y eso es mejor que perder la subida por un fallo del apaño.
 */
export async function prepararAdjunto(
  file: File,
  opts: { ladoMax?: number; tope?: number } = {},
): Promise<Adjunto> {
  const tope = opts.tope ?? TOPE_BASE64
  const bytesOriginal = file.size
  const nombre = file.name || 'documento'
  const tipo = file.type || (nombre.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')

  const original = async (): Promise<Adjunto> => {
    const b64 = base64De(await leerComoDataURL(file))
    return { base64: b64, mimeType: tipo, fileName: nombre, bytesOriginal, bytesEnviados: bytesOriginal, comprimida: false }
  }

  if (!esImagen(tipo, nombre)) return await original()

  try {
    const bitmap = await createImageBitmap(file)
    const { w, h } = medidas(bitmap.width, bitmap.height, opts.ladoMax ?? LADO_MAX)
    const lienzo = document.createElement('canvas')
    lienzo.width = w
    lienzo.height = h
    const ctx = lienzo.getContext('2d')
    if (!ctx) { bitmap.close?.(); return await original() }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    // Baja la calidad por escalones hasta caber. Se para en CALIDAD_MINIMA: por debajo, el texto de
    // una factura empieza a romperse y el OCR deja de leer bien — enviar algo ilegible no es enviar.
    let calidad = CALIDAD_INICIAL
    let b64 = base64De(lienzo.toDataURL('image/jpeg', calidad))
    while (b64.length > tope && calidad > CALIDAD_MINIMA) {
      calidad = Math.max(CALIDAD_MINIMA, calidad - 0.12)
      b64 = base64De(lienzo.toDataURL('image/jpeg', calidad))
    }

    // Si ni así cabe (una panorámica enorme), se reduce el lado a la mitad y se reintenta una vez.
    if (b64.length > tope) {
      const chico = document.createElement('canvas')
      chico.width = Math.max(1, Math.round(w / 2))
      chico.height = Math.max(1, Math.round(h / 2))
      const ctx2 = chico.getContext('2d')
      if (ctx2) {
        ctx2.drawImage(lienzo, 0, 0, chico.width, chico.height)
        b64 = base64De(chico.toDataURL('image/jpeg', CALIDAD_INICIAL))
      }
    }

    const bytesEnviados = Math.round((b64.length * 3) / 4)
    // Si el apaño no mejora nada (una imagen ya pequeña y optimizada), se manda la original: no tiene
    // sentido recomprimir un JPEG bueno y perder nitidez a cambio de nada.
    if (bytesEnviados >= bytesOriginal) return await original()

    const base = nombre.replace(/\.[^.]+$/, '') || 'factura'
    return { base64: b64, mimeType: 'image/jpeg', fileName: `${base}.jpg`, bytesOriginal, bytesEnviados, comprimida: true }
  } catch {
    return await original()
  }
}

/** «3,4 MB» / «812 KB». Para poder decirle a Alberto cuánto pesaba y cuánto se envió. */
export function pesoLegible(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

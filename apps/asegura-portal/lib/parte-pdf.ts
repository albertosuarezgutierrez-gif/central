// El parte de siniestro en PDF, montado EN EL NAVEGADOR del cliente con sus propias fotos.
//
// Por qué en el navegador y no en el servidor: las fotos ya están en el móvil (las acaba
// de elegir) y el navegador sabe leer lo que el móvil hace — HEIC incluido en el iPhone —,
// mientras que el servidor tendría que volver a bajarlas de la BD y no sabría convertir un
// HEIC. El PDF no se guarda en ningún sitio: lo comparte el cliente con su compañía.
//
// 🚨 Lo que no se puede incluir se DICE en el propio PDF («no se ha podido incluir»): un PDF
// que se come una foto en silencio es un parte al que le falta justo la del otro coche.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type DatosPdfParte = {
  compania: string | null
  numeroPoliza: string | null
  titular: string | null
  bien: string | null
  fechaHecho: string
  horaAproximada: string | null
  lugar: string | null
  descripcion: string
  hayHeridos: boolean | null
  hayTerceros: boolean | null
}

export type ResultadoPdf = { fichero: File; incluidos: number; omitidos: string[] }

const A4: [number, number] = [595.28, 841.89]
const MARGEN = 48
const LADO_MAX = 1600

function triestado(v: boolean | null): string {
  return v === true ? 'Sí' : v === false ? 'No' : 'No lo sé'
}

/** Helvetica solo sabe WinAnsi: lo que no está (emojis, algunos símbolos) se cambia por «?» en vez de romper el PDF. */
function paraFuente(font: PDFFont, t: string): string {
  const validos = new Set(font.getCharacterSet())
  return Array.from(t.replace(/\r/g, '')).map((c) => (c === '\n' || validos.has(c.codePointAt(0)!) ? c : '?')).join('')
}

function partirLineas(font: PDFFont, texto: string, tam: number, ancho: number): string[] {
  const salida: string[] = []
  for (const parrafo of texto.replace(/\t/g, ' ').split('\n')) {
    let linea = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (font.widthOfTextAtSize(prueba, tam) <= ancho) { linea = prueba; continue }
      if (linea) salida.push(linea)
      linea = palabra
      // Una «palabra» más ancha que la línea (una URL) se corta a la fuerza.
      while (font.widthOfTextAtSize(linea, tam) > ancho && linea.length > 1) {
        let n = linea.length - 1
        while (n > 1 && font.widthOfTextAtSize(linea.slice(0, n), tam) > ancho) n--
        salida.push(linea.slice(0, n))
        linea = linea.slice(n)
      }
    }
    salida.push(linea)
  }
  return salida
}

/** Una foto a JPEG ≤1600 px por el canvas. `null` si el navegador no sabe leerla. */
async function aJpeg(f: File): Promise<Uint8Array | null> {
  try {
    // `from-image`: la foto sale derecha también en navegadores que no aplican el EXIF solos.
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * escala))
    c.height = Math.max(1, Math.round(bmp.height * escala))
    const ctx = c.getContext('2d')
    if (!ctx) {
      bmp.close?.()
      return null
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close?.()
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.8))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

export async function pdfDelParte(datos: DatosPdfParte, ficheros: readonly File[]): Promise<ResultadoPdf> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const ancho = A4[0] - MARGEN * 2
  let pagina: PDFPage = doc.addPage(A4)
  let y = A4[1] - MARGEN

  const escribir = (texto: string, tam = 11, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    for (const l of partirLineas(f, paraFuente(f, texto), tam, ancho)) {
      if (y < MARGEN + tam) { pagina = doc.addPage(A4); y = A4[1] - MARGEN }
      pagina.drawText(l, { x: MARGEN, y: y - tam, size: tam, font: f, color })
      y -= tam * 1.45
    }
  }

  const [a, m, d] = datos.fechaHecho.split('-')
  escribir('Parte de siniestro', 18, negrita)
  y -= 6
  const filas: [string, string | null][] = [
    ['Compañía', datos.compania],
    ['Póliza', datos.numeroPoliza],
    ['Titular', datos.titular],
    ['Asegurado', datos.bien],
    ['Fecha', `${d}/${m}/${a}${datos.horaAproximada ? `, hacia las ${datos.horaAproximada}` : ''}`],
    ['Lugar', datos.lugar],
    ['¿Hay heridos?', triestado(datos.hayHeridos)],
    ['¿Hay otros implicados?', triestado(datos.hayTerceros)],
  ]
  for (const [k, v] of filas) if (v && v.trim()) escribir(`${k}: ${v.trim()}`)
  y -= 8
  escribir('Qué ha pasado', 13, negrita)
  escribir(datos.descripcion.trim())

  let incluidos = 0
  const omitidos: string[] = []
  for (const f of ficheros) {
    const nombre = f.name || 'fichero'
    if (f.type === 'application/pdf' || /\.pdf$/i.test(nombre)) {
      try {
        // Sin `ignoreEncryption`: un PDF protegido lanza y se declara omitido. Con él, pdf-lib
        // copiaría páginas cifradas que salen en blanco y contarían como incluidas.
        const otro = await PDFDocument.load(await f.arrayBuffer())
        const paginas = await doc.copyPages(otro, otro.getPageIndices())
        paginas.forEach((p) => doc.addPage(p))
        incluidos++
      } catch {
        omitidos.push(nombre)
      }
      continue
    }
    const jpeg = await aJpeg(f)
    if (!jpeg) { omitidos.push(nombre); continue }
    const img = await doc.embedJpg(jpeg)
    const p = doc.addPage(A4)
    const esc = Math.min(ancho / img.width, (A4[1] - MARGEN * 2 - 24) / img.height, 1)
    const w = img.width * esc
    const h = img.height * esc
    p.drawText(paraFuente(font, `Foto: ${nombre}`), { x: MARGEN, y: A4[1] - MARGEN - 10, size: 10, font, color: rgb(0.35, 0.35, 0.35) })
    p.drawImage(img, { x: MARGEN + (ancho - w) / 2, y: A4[1] - MARGEN - 24 - h, width: w, height: h })
    incluidos++
  }

  if (omitidos.length > 0) {
    pagina = doc.addPage(A4)
    y = A4[1] - MARGEN
    escribir('Ficheros que no se han podido incluir', 13, negrita)
    escribir(`Mándalos aparte: ${omitidos.join(', ')}`)
  }

  const bytes = await doc.save()
  const fichero = new File([bytes as BlobPart], `parte-siniestro-${datos.fechaHecho}.pdf`, { type: 'application/pdf' })
  return { fichero, incluidos, omitidos }
}

/** Comparte el PDF (menú del móvil) o, si el navegador no sabe, lo descarga. */
export async function compartirODescargar(f: File, titulo: string): Promise<'compartido' | 'cancelado' | 'descargado'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [f] })) {
    try {
      await nav.share({ files: [f], title: titulo })
      return 'compartido'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
      // Cualquier otro fallo del menú de compartir: se cae a descargar, que siempre funciona.
    }
  }
  const url = URL.createObjectURL(f)
  const a = document.createElement('a')
  a.href = url
  a.download = f.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'descargado'
}

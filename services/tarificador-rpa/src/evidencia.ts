// HTML de evidencia de un fallo, CON el contenido de los marcos (06/10/2026).
//
// ePAC carga la aplicación de cotización en `<iframe id="appArea">`; `page.content()` solo trae la
// carcasa (el iframe sale vacío) y el HTML guardado no servía para ver el formulario. Aquí se añade,
// tras el HTML de la página, el de cada marco hijo precedido de una marca `<!-- tarificador:marco … -->`
// con su ruta de nombres. `separarMarcos()` lo deshace (lo usa el harness `scripts/probar-formulario.ts`
// para volver a montar los marcos con `srcdoc`). El conjunto sale por `redactarHtml` en el runner.

import type { Frame, Page } from 'playwright'

const MARCA = '<!-- tarificador:marco ruta="'
const FIN_MARCA = '" -->'

/** Ruta de un marco desde la página: nombres (o `#índice` si no tiene) separados por «/». */
export function rutaMarco(f: Frame): string {
  const trozos: string[] = []
  let actual: Frame | null = f
  while (actual && actual.parentFrame()) {
    const padre: Frame = actual.parentFrame()!
    const nombre = actual.name() || `#${padre.childFrames().indexOf(actual)}`
    trozos.unshift(nombre.replace(/["/]/g, '_'))
    actual = padre
  }
  return trozos.join('/')
}

/** Quita `<style>` y `<script>` (para no pasar del tope de tamaño). */
function sinEstilosNiScripts(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

/** HTML de la página + el de cada marco. `null` si ni la página se puede leer. Cabe en `maxBytes` o recorta. */
export async function htmlConMarcos(page: Page, maxBytes: number): Promise<string | null> {
  const principal = await page.content().catch(() => null)
  if (principal === null) return null
  const marcos: string[] = []
  for (const f of page.frames()) {
    if (f === page.mainFrame() || f.isDetached()) continue
    const html = await f.content().catch(() => null)
    if (html !== null) marcos.push(`\n${MARCA}${rutaMarco(f)}${FIN_MARCA}\n${html}`)
  }
  const completo = principal + marcos.join('')
  if (Buffer.byteLength(completo) <= maxBytes) return completo
  // Lo valioso son los marcos (el formulario): se recorta primero la carcasa, luego todo.
  const recortado = sinEstilosNiScripts(principal) + marcos.join('')
  if (Buffer.byteLength(recortado) <= maxBytes) return recortado
  return sinEstilosNiScripts(recortado)
}

/** Deshace `htmlConMarcos`: la página y cada marco con su ruta. Un HTML sin marcas → sin marcos. */
export function separarMarcos(html: string): { principal: string; marcos: { ruta: string[]; html: string }[] } {
  const partes = html.split(MARCA)
  const marcos = partes.slice(1).map((p) => {
    const fin = p.indexOf(FIN_MARCA)
    const ruta = p.slice(0, fin)
    return { ruta: ruta === '' ? [] : ruta.split('/'), html: p.slice(fin + FIN_MARCA.length).replace(/^\n/, '') }
  })
  return { principal: partes[0], marcos }
}

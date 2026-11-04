// ENTORNO DEL NAVEGADOR (0.3.39, 04/11/2026). SOLO LECTURA. Hecho real (Pelayo): a Alberto, en su navegador, nunca le sale el modal que tapa las tarjetas
// en el worker. Hipótesis a descartar con datos: (a) aviso de «navegador no soportado» por UA HeadlessChrome / navigator.webdriver, (b) un recurso
// (JS/CSS de otro origen o CDN) fallido o bloqueado que deja el componente abierto o sin estilos, (c) el tamaño del viewport.
//
// Aquí: (1) el observador de red del contexto (solo host + tipo de recurso + estado, SIN ruta ni query); (2) la lectura del entorno de la página
// (UA solo como boolean «Headless», navigator.webdriver, viewport); (3) las líneas cerradas para el `detalle` del pilotaje. Nada pulsa ni escribe.

import type { Browser, BrowserContext, Page } from 'playwright'

const MAX_FALLOS = 30

export type FalloRed = { host: string; tipo: string; estado: string }
export type EntornoNavegador = { headless: boolean; webdriver: boolean | null; vw: number; vh: number }

const OBSERVADORES = new WeakMap<BrowserContext, FalloRed[]>()

const limpio = (x: unknown, max: number): string => String(x ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, max)

/** Host de una URL (sin puerto, usuario, ruta ni query). `-` si no se puede leer. Pura. */
export function hostDeUrl(url: string): string {
  try {
    return limpio(new URL(url).hostname, 60) || '-'
  } catch {
    return '-'
  }
}

/** Estado cerrado de un fallo de red de Playwright: `blocked` (lo abortó el guard o el navegador), `net` (resto) o `http<nnn>`. Pura. */
export function estadoFallo(texto: unknown): string {
  const t = String(texto ?? '')
  if (/blockedbyclient|blocked_by_client|err_blocked/i.test(t)) return 'blocked'
  if (/aborted|cancel/i.test(t)) return 'aborted'
  return 'net'
}

/** Anota (sin duplicar) un fallo en la lista, con tope. Pura sobre la lista dada. */
export function anotarFallo(lista: FalloRed[], url: string, tipo: unknown, estado: string): void {
  const f: FalloRed = { host: hostDeUrl(url), tipo: limpio(tipo, 16) || 'x', estado: limpio(estado, 12) || 'x' }
  if (lista.length >= MAX_FALLOS) return
  if (lista.some((o) => o.host === f.host && o.tipo === f.tipo && o.estado === f.estado)) return
  lista.push(f)
}

/** Instala el observador en el contexto (idempotente). Solo escucha `requestfailed` y respuestas HTTP ≥ 400. Nunca lanza. */
export function observarRed(context: BrowserContext): void {
  if (OBSERVADORES.has(context)) return
  const lista: FalloRed[] = []
  OBSERVADORES.set(context, lista)
  try {
    context.on('requestfailed', (req) => {
      try { const est = estadoFallo(req.failure()?.errorText); if (est !== 'aborted') anotarFallo(lista, req.url(), req.resourceType(), est) } catch { /* nunca rompe la página */ }
    })
    context.on('response', (res) => {
      try {
        const s = res.status()
        if (s >= 400) anotarFallo(lista, res.url(), res.request().resourceType(), `http${s}`)
      } catch { /* idem */ }
    })
  } catch { /* contexto ya cerrado */ }
}

/** Fallos vistos hasta ahora en el contexto (copia). */
export function fallosDeRed(context: BrowserContext): FalloRed[] {
  return [...(OBSERVADORES.get(context) ?? [])]
}

/** UA «de Chrome normal» coherente con la versión REAL del navegador lanzado (sin la marca `HeadlessChrome`). Pura. */
export function uaChromeNormal(versionNavegador: string): string {
  const v = /^\d+(?:\.\d+){0,3}$/.test(versionNavegador) ? versionNavegador : '0.0.0.0'
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`
}

/** Opciones de contexto con el UA normal del navegador lanzado (el explorador y el pilotaje: NO la emisión). */
export function opcionesUaNormal(browser: Browser): { userAgent: string } {
  return { userAgent: uaChromeNormal(browser.version()) }
}

/** Lee el entorno de la página: UA solo como boolean «Headless», webdriver y viewport. Nunca lanza (`null` si la página no responde). */
export async function leerEntornoNavegador(page: Page): Promise<EntornoNavegador | null> {
  try {
    const r = (await page.evaluate(() => ({
      hl: /Headless/i.test(navigator.userAgent),
      wd: typeof navigator.webdriver === 'boolean' ? navigator.webdriver : null,
      w: window.innerWidth,
      h: window.innerHeight,
    }), undefined)) as { hl: boolean; wd: boolean | null; w: number; h: number }
    const n = (x: unknown) => Math.max(0, Math.min(99999, Math.round(Number(x)) || 0))
    return { headless: r.hl === true, webdriver: r.wd, vw: n(r.w), vh: n(r.h) }
  } catch {
    return null
  }
}

/** Líneas cerradas del entorno y de la red fallida para el `detalle` del pilotaje (≤ 2 líneas, cada una ≤ 160). Pura. */
export function lineasEntorno(e: EntornoNavegador | null, fallos: readonly FalloRed[]): string[] {
  const b = (x: boolean | null) => (x === null ? '?' : x ? 1 : 0)
  const out = [e ? `entorno: headless=${b(e.headless)} webdriver=${b(e.webdriver)} vp=${e.vw}x${e.vh}` : 'entorno: ilegible']
  if (fallos.length === 0) out.push('red-fallida: 0')
  else {
    let s = `red-fallida: ${fallos.length}`
    for (const f of fallos) {
      const trozo = ` ${f.host}/${f.tipo}/${f.estado}`
      if ((s + trozo).length > 158) { s += ' …'; break }
      s += trozo
    }
    out.push(s.slice(0, 160))
  }
  return out
}

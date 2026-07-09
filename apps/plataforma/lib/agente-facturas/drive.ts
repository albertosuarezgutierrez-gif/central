// Cliente del Apps Script de Drive (DRIVE_SCRIPT_URL). list/get/archive/subir.
// El contrato del script: action + campos; respuestas con { ok, ... }.

function scriptUrl(): string {
  return (
    process.env.DRIVE_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbwYMhD_7MpiytpoM3fYVW5dRlCUiQgMeTYLvI-5WGfcL-OAdXZEsa3UD7KdZa1PpQ/exec'
  )
}

// Error transitorio (5xx del proxy de Google, timeout, red caída, o el web-app devolviendo
// una página HTML de login/cuota en vez de JSON): merece reintento. Un `data.ok===false` o un
// 4xx es un fallo real del contrato y NO se reintenta (perdería el tiempo del cron).
class DriveTransitorio extends Error {}

function esTransitorio(e: unknown): boolean {
  if (e instanceof DriveTransitorio) return true
  const name = (e as { name?: string })?.name
  // AbortSignal.timeout → 'TimeoutError'; fetch sin red → TypeError 'fetch failed'.
  return name === 'TimeoutError' || name === 'AbortError' || e instanceof TypeError
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function call(payload: Record<string, unknown>): Promise<any> {
  // Timeout obligatorio: el web-app de Apps Script a veces tarda mucho; sin límite, una
  // llamada colgada agotaba los 60s del cron (504) y tumbaba toda la pasada de facturas.
  // Reintentos con backoff (400ms, 800ms): Apps Script devuelve fallos transitorios con
  // frecuencia (5xx del proxy, redirección de login, cuota) — un reintento suele resolverlo.
  const MAX_INTENTOS = 3
  let ultimo: unknown
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const res = await fetch(scriptUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status >= 500) throw new DriveTransitorio(`Drive script HTTP ${res.status}`)
      if (!res.ok) throw new Error(`Drive script HTTP ${res.status}`)
      // Apps Script a veces responde una página HTML (login/cuota) con 200 → JSON.parse falla.
      // Lo tratamos como transitorio para reintentar en vez de tumbar el ítem con un error opaco.
      const texto = await res.text()
      let data: any
      try {
        data = JSON.parse(texto)
      } catch {
        throw new DriveTransitorio(`Drive script: respuesta no-JSON (${texto.slice(0, 80)})`)
      }
      if (!data.ok) throw new Error(`Drive script: ${data.error || 'error desconocido'}`)
      return data
    } catch (e) {
      ultimo = e
      if (!esTransitorio(e) || intento === MAX_INTENTOS) throw e
      console.warn(`[drive] intento ${intento}/${MAX_INTENTOS} falló (${String(e).slice(0, 80)}), reintento`)
      await esperar(400 * 2 ** (intento - 1))
    }
  }
  throw ultimo
}

export interface DriveFile {
  id: string
  nombre: string
  mime: string
}

// PDFs/imágenes en la raíz de la carpeta, aún sin archivar por año/mes.
export async function listNuevos(): Promise<DriveFile[]> {
  const data = await call({ action: 'list' })
  return (data.files || []) as DriveFile[]
}

export async function getContenido(fileId: string): Promise<{ buffer: Buffer; mimeType: string; nombre: string }> {
  const data = await call({ action: 'get', fileId })
  return { buffer: Buffer.from(data.fileBase64, 'base64'), mimeType: data.mimeType, nombre: data.nombre }
}

export async function archivar(fileId: string, fecha: string): Promise<string> {
  const data = await call({ action: 'archive', fileId, fecha })
  return data.carpeta as string
}

// Sube un fichero nuevo (p.ej. adjunto de email) y lo archiva por año/mes.
export async function subir(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  fecha?: string,
): Promise<{ fileId: string; url: string; carpeta: string; nombre: string }> {
  const data = await call({
    action: 'upload',
    fileBase64: buffer.toString('base64'),
    fileName,
    mimeType,
    fecha: fecha || new Date().toISOString().slice(0, 10),
  })
  return { fileId: data.fileId, url: data.url, carpeta: data.carpeta, nombre: data.nombre }
}

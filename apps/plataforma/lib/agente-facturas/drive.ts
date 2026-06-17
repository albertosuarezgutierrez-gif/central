// Cliente del Apps Script de Drive (DRIVE_SCRIPT_URL). list/get/archive/subir.
// El contrato del script: action + campos; respuestas con { ok, ... }.

function scriptUrl(): string {
  return (
    process.env.DRIVE_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbwYMhD_7MpiytpoM3fYVW5dRlCUiQgMeTYLvI-5WGfcL-OAdXZEsa3UD7KdZa1PpQ/exec'
  )
}

async function call(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(scriptUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Drive script HTTP ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(`Drive script: ${data.error || 'error desconocido'}`)
  return data
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

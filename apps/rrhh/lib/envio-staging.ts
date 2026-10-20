// Rutas de «staging» de la subida asistida/masiva (puras). El PDF se sube UNA vez a
// `staging/<empresa_id>/<uuid>.<ext>`; al confirmar se copia a cada expediente y se borra.
// 🚨 Aislamiento: toda ruta que recibe un path del cliente lo valida con `esPathStagingDe`
// contra el empresa_id de la SESIÓN — si no, un responsable podría leer o copiar el staging
// (o cualquier objeto del bucket) de otra empresa.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export function extensionDe(nombre: string): string {
  const i = nombre.lastIndexOf('.')
  const e = i > 0 ? nombre.slice(i + 1).toLowerCase() : ''
  return /^[a-z0-9]{1,8}$/.test(e) ? e : ''
}

export function pathStaging(empresaId: string, nombre: string, uuid: string): string {
  const ext = extensionDe(nombre)
  return `staging/${empresaId}/${uuid}${ext ? `.${ext}` : ''}`
}

export function esPathStagingDe(empresaId: string, path: unknown): path is string {
  if (typeof path !== 'string') return false
  return new RegExp(`^staging/${empresaId.replace(/[^0-9a-f-]/gi, '')}/${UUID}(\\.[a-z0-9]{1,8})?$`).test(path)
}

/** Título confirmado → nombre de archivo con la extensión del original (si el título no la trae). */
export function nombreConExtension(titulo: string, nombreOriginal: string): string {
  const t = titulo.trim().replace(/[\\/]+/g, '-')
  const ext = extensionDe(nombreOriginal)
  if (!ext || extensionDe(t) === ext) return t
  return `${t}.${ext}`
}

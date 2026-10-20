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

/**
 * Carpetas donde NO se pide firma (misma regla que el expediente, `ExpedienteClient`): los datos
 * personales y la formación los aporta/consulta el empleado, no se le reclama firma sobre ellos.
 */
export const CARPETAS_SIN_FIRMA: readonly string[] = ['datos_personales', 'formacion']

export function carpetaAdmiteFirma(carpeta: string): boolean {
  return !CARPETAS_SIN_FIRMA.includes(carpeta)
}

export const HORAS_CADUCIDAD_STAGING = 48

/**
 * Objetos del staging de UNA empresa que llevan más de `horas` sin confirmarse (subidas abandonadas).
 * Solo devuelve rutas que superan `esPathStagingDe(empresaId, …)`: nada fuera de `staging/<empresa>/`
 * puede acabar borrado. Sin fecha conocida → no se borra (no se sabe su edad).
 */
export function stagingCaducados(
  empresaId: string, objetos: { path: string; creado_at: string | null }[], ahora: Date, horas = HORAS_CADUCIDAD_STAGING,
): string[] {
  const limite = ahora.getTime() - horas * 3_600_000
  return objetos.filter(o => {
    if (!esPathStagingDe(empresaId, o.path) || !o.creado_at) return false
    const t = Date.parse(o.creado_at)
    return Number.isFinite(t) && t < limite
  }).map(o => o.path)
}

/**
 * El enlace que va DENTRO del QR de la hoja de la nevera.
 *
 * 🚨 En el QR va este enlace, no los datos. Un QR no caduca —es una imagen con
 * un texto dentro— pero lo que se mete dentro sí: con los datos escritos, la
 * imagen miente en cuanto cambie la póliza, y encima cualquiera que fotografíe
 * la hoja se los lleva. Con una URL, la imagen es permanente y la página detrás
 * está siempre al día.
 *
 * Devuelve `null` cuando no hay dominio https configurado, y quien llama
 * convierte eso en un 503 **sin escribir la fila**: una hoja cuyo enlace no se
 * puede formar es un papel que no lleva a ningún sitio, y el QR impreso no se
 * puede arreglar después. Misma regla que `enlace-acceso.ts`: no se inventa un
 * dominio.
 */
export function enlaceDeHoja(token: string): string | null {
  const base = process.env.PORTAL_PUBLIC_URL?.trim()
  if (!base) return null

  let url: URL
  try {
    url = new URL(base)
  } catch {
    console.error('[portal] PORTAL_PUBLIC_URL no es una URL válida: no se puede formar la hoja')
    return null
  }

  // Solo https: el token viaja en la URL y un http lo pondría en claro en la red.
  if (url.protocol !== 'https:') {
    console.error('[portal] PORTAL_PUBLIC_URL no es https: no se puede formar la hoja')
    return null
  }

  // El token va en la RUTA y no en un `?query`: los proxies, los historiales y
  // los registros de servidor guardan la query con más alegría, y además una
  // ruta limpia hace el QR más corto (menos módulos = se lee mejor impreso).
  url.pathname = `/hoja/${token}`
  url.search = ''
  return url.toString()
}

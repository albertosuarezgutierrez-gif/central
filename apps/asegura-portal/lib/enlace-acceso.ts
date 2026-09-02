/**
 * El enlace de un clic que acompaña al código en el correo.
 *
 * 🚨 El enlace **NO canjea el código**: solo lo lleva pre-rellenado a la
 * pantalla de entrada, y la persona pulsa «Entrar». Es deliberado. Un enlace
 * que canjea con un GET lo consumen los escáneres antivirus y los prefetch de
 * los clientes de correo antes de que el usuario llegue a tocarlo: el código
 * aparece como `ya_usado` y la culpa parece del usuario. Un clic sigue siendo
 * un clic, y de paso nadie tiene que copiar seis dígitos entre dos apps.
 *
 * Devuelve `null` cuando no hay dominio configurado. NO se inventa uno: un
 * enlace a un dominio adivinado es peor que no mandar enlace, porque el correo
 * sale igual y el usuario aterriza en ningún sitio.
 */
export function enlaceDeAcceso(destino: string, codigo: string): string | null {
  const base = process.env.PORTAL_PUBLIC_URL?.trim()
  if (!base) return null

  let url: URL
  try {
    url = new URL(base)
  } catch {
    console.error('[portal] PORTAL_PUBLIC_URL no es una URL válida: no se manda enlace')
    return null
  }

  // Solo https. Un enlace http mandaría el código de acceso en claro por la red.
  if (url.protocol !== 'https:') {
    console.error('[portal] PORTAL_PUBLIC_URL no es https: no se manda enlace')
    return null
  }

  url.pathname = '/'
  url.searchParams.set('d', destino)
  url.searchParams.set('c', codigo)
  return url.toString()
}

import { CARPETA_EXTENSION_GRABADOR, VERSION_EXTENSION_GRABADOR, zipExtension } from '@central/module-tarificacion'

import { exigirCorreduria } from '@/lib/correduria-acceso'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/tarificador/grabaciones/extension — el .zip de la extensión de Chrome «Grabador ASegura» (MV3), para
 * portales con el formulario en un iframe de OTRO origen (Mapfre) que el marcador no puede leer. Se GENERA desde
 * `@central/module-tarificacion` (el mismo grabador y la misma redacción que el marcador; sin secretos, sin red): el fichero
 * que baja se sube aquí como siempre. Solo con sesión de la correduría.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const zip = zipExtension()
  return new Response(zip as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${CARPETA_EXTENSION_GRABADOR}-${VERSION_EXTENSION_GRABADOR}.zip"`,
      'cache-control': 'private, no-store',
    },
  })
}

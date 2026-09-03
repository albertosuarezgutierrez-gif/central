import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { resolverCatalogo } from '@/lib/retarificar-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Catálogos de Codeoscopic para los desplegables de la pantalla.
 *
 * 🚨 **Nada de aquí cuesta dinero.** Son `GET` de consulta; la cotización es
 * otra ruta. El `switch` con los once catálogos vive en
 * `lib/retarificar-cartera.ts` porque lo comparte con el puerto de operador
 * (`/api/operador/codeoscopic/catalogos`): una copia que se quedara sin el
 * `onlyPopular=false` de las marcas, o sin exigir el combustible en las
 * versiones, no daría error — daría una lista recortada.
 *
 * Aquí solo queda **quién autoriza** (la cookie de sesión de asegura) y la
 * forma exacta de la respuesta que ya consume esta app.
 */
export async function GET(req: Request) {
  await requireSession()

  const r = await resolverCatalogo(new URL(req.url).searchParams)
  switch (r.estado) {
    case 'ok':
      return NextResponse.json(r.hogar ? { opciones: r.opciones, hogar: r.hogar } : { opciones: r.opciones })
    case 'invalido':
      return NextResponse.json({ error: r.mensaje }, { status: 400 })
    case 'sin_configurar':
      return NextResponse.json({ error: r.mensaje }, { status: 503 })
    case 'error':
      // Un catálogo que no se puede leer NO se devuelve como lista vacía: eso
      // pintaría «esta marca no tiene modelos» sobre un fallo de red.
      return NextResponse.json(
        { error: `No se pudo leer el catálogo: ${r.mensaje}`, causa: r.causa },
        { status: 502 },
      )
  }
}

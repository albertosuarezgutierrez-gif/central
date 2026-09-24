import { NextResponse } from 'next/server'
import { exigirAccesoCartera } from '@/lib/session'
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
 * Aquí solo queda **quién autoriza** (la cookie de sesión de asegura, y que esa
 * cuenta sea de esta correduría) y la forma exacta de la respuesta que ya
 * consume esta app.
 */
export async function GET(req: Request) {
  // 🛡️ Sesión **Y ÁMBITO DE CORREDURÍA**, fail-closed y ANTES de nada.
  //
  // `requireSession()` LANZA (500 con traza) en vez de contestar 401, y además
  // solo acredita «tiene cuenta en la casa de marcas», no «es de esta
  // correduría»: `public.cuentas` la comparten plataforma, alquiler, transporte,
  // mariscos, rrhh y almacén. Ver `lib/session.ts`.
  const acceso = await exigirAccesoCartera()
  if (!acceso.ok) return NextResponse.json(acceso.cuerpo, { status: acceso.status })

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

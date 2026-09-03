import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverCatalogo } from '@/lib/retarificar-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/codeoscopic/catalogos` — los desplegables de la
 * retarificación, servidos a `apps/plataforma` → `/correduria`.
 *
 * Nace el 03/09/2026 al unificar la correduría en una sola pantalla: hasta
 * entonces estos catálogos solo se podían pedir desde dentro de `apps/asegura`
 * con su cookie, así que Alberto saltaba de dominio y **le echaba al login**.
 *
 * 🚨 **No gasta NADA.** Son consultas (`GET` del vendor), y por eso —igual que
 * `/lineas` y `/sonda`— se resuelven con el interruptor de tarificación
 * APAGADO: elegir marca, modelo y versión tiene que poder hacerse antes de que
 * nadie decida pagar 0,50€. El `switch` está en `lib/retarificar-cartera.ts`,
 * compartido con la ruta de sesión.
 *
 * Mismos parámetros que la de sesión: `tipo` y, según el tipo, `marcaId`,
 * `modeloId`, `motor`, `cp` o `nombre`.
 *
 * Tres estados, los del resto del puerto:
 *   `{ estado:'ok', opciones }` (y `hogar` en `tipo=lineas`) · 200
 *   `{ estado:'sin_configurar', mensaje }` · 503 — NO es «no hay opciones»
 *   `{ estado:'error', causa, mensaje }` · 400 si el parámetro está mal, 502 si
 *   no se pudo leer. La `causa` la clasifica `lib/error-cartera.ts`, como en
 *   las otras nueve rutas: un fallo de lectura nunca sale pelado.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const r = await resolverCatalogo(new URL(req.url).searchParams)
  switch (r.estado) {
    case 'ok':
      return NextResponse.json({
        estado: 'ok',
        opciones: r.opciones,
        ...(r.hogar ? { hogar: r.hogar } : {}),
        gastado: '0,00€',
      })
    case 'invalido':
      // El parámetro que falta, con su nombre. No se ha mirado nada, así que no
      // se devuelve una lista vacía que se leería como «no hay opciones».
      return NextResponse.json(
        { estado: 'error', causa: 'otro', mensaje: r.mensaje },
        { status: 400 },
      )
    case 'sin_configurar':
      return NextResponse.json({ estado: 'sin_configurar', mensaje: r.mensaje }, { status: 503 })
    case 'error':
      return NextResponse.json(
        { estado: 'error', causa: r.causa, mensaje: r.mensaje },
        { status: 502 },
      )
  }
}

import { NextResponse } from 'next/server'
import { exigirAccesoCartera } from '@/lib/session'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import {
  prepararRetarificacion,
  respuestaRetarificacion,
  type CuerpoRetarificacion,
} from '@/lib/retarificar-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La cotización del vendor puede tardar hasta 150 s (documentado). Sin este
// margen Vercel corta antes y nos quedamos sin saber si nos han cobrado — que
// es justo el estado que el libro de consumo tiene que contar como gasto.
export const maxDuration = 180

/**
 * Retarifica una póliza de la cartera. **Esta ruta GASTA 0,50€ por llamada.**
 *
 * Es la única de `/api/cartera/*` que cuesta dinero, y por eso es `POST`, nunca
 * un `GET` que un prefetch del navegador pueda disparar.
 *
 * Todo lo que se puede hacer mal —mapear la ficha, revisar los datos GRATIS
 * antes de llamar, construir el cuerpo del vendor, redactar la respuesta— vive
 * en `lib/retarificar-cartera.ts`, compartido con la gemela del puerto de
 * operador (`/api/operador/codeoscopic/retarificar`, la que sirve a
 * `plataforma` → `/correduria`). Dos copias de lo que gasta dinero divergen, y
 * la que diverge es la que nadie mira.
 *
 * Lo que esta ruta decide, y es lo ÚNICO que la distingue de su gemela: **quién
 * autoriza** —la cookie de sesión de asegura MÁS el ámbito de correduría de esa
 * cuenta— y de dónde sale `solicitadoPor`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ polizaId: string }> }) {
  // 🛡️ Sesión **Y ÁMBITO DE CORREDURÍA**, fail-closed y ANTES de nada.
  //
  // `requireSession()` LANZA (500 con traza) en vez de contestar 401, y además
  // solo acredita «tiene cuenta en la casa de marcas», no «es de esta
  // correduría»: `public.cuentas` la comparten plataforma, alquiler, transporte,
  // mariscos, rrhh y almacén. Ver `lib/session.ts`.
  const acceso = await exigirAccesoCartera()
  if (!acceso.ok) return NextResponse.json(acceso.cuerpo, { status: acceso.status })
  const session = acceso.session
  const { polizaId } = await ctx.params

  const cuerpo = (await req.json().catch(() => ({}))) as CuerpoRetarificacion

  const p = await prepararRetarificacion({
    polizaId,
    solicitadoPor: session.nombre ?? 'desconocido',
    cuerpo,
  })
  // Corta ANTES del vendor (422 faltan datos · 409 ramo · 404 póliza · 503):
  // esas respuestas llevan `gastado: '0,00€'` y son el caso normal.
  if (p.estado === 'corte') {
    return NextResponse.json(p.respuesta.cuerpo, { status: p.respuesta.status })
  }

  // ── La única línea que cuesta dinero, por el único embudo ────────────────
  const r = await cotizar(p.peticion)

  const res = respuestaRetarificacion(r, p)
  return NextResponse.json(res.cuerpo, { status: res.status })
}

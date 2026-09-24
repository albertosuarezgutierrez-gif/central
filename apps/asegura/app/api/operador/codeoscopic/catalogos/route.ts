import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverCatalogo, resolverCatalogoCrudo } from '@/lib/retarificar-cartera'

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

  const params = new URL(req.url).searchParams

  // `?crudo=1` — el payload del vendor SIN recortar, solo para `tipo=versiones`.
  // Misma autorización, mismo `GET` de catálogo y **0,00€**: lo único que
  // cambia es que no se tira lo que `normalizarOpciones` descarta. Sirve para
  // medir qué manda de verdad el vendor (p. ej. si cada versión trae sus años
  // de fabricación) en vez de suponerlo. Ver `lib/codeoscopic/crudo.ts`.
  // 🚨 `has`, no `get`: basta con que el parámetro VENGA, con valor o sin él.
  // `crudo=si`, `crudo=xxx` y **`?crudo` a secas** entran igual y los valida la
  // rama. Las dos versiones anteriores de esta guarda dejaban caer en silencio
  // al catálogo normalizado —`=== '1'` cualquier valor mal escrito, y
  // `(get() ?? '') !== ''` el parámetro sin `=`, porque ahí `get` devuelve `''`
  // y no `null`— con un 200 `ok` que se leería como «he mirado el crudo y no
  // hay nada más». Es la afirmación que este endpoint existe para no tener que
  // hacer, así que la guarda no puede tener ni un hueco por el que se cuele.
  if (params.has('crudo')) {
    const c = await resolverCatalogoCrudo(params)
    switch (c.estado) {
      case 'ok':
        return NextResponse.json({
          estado: 'ok',
          path: c.path,
          resumen: c.resumen,
          opciones: c.opciones,
          ...(c.completo !== undefined ? { completo: c.completo } : {}),
          gastado: '0,00€',
        })
      case 'invalido':
        return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: c.mensaje }, { status: 400 })
      case 'sin_configurar':
        return NextResponse.json({ estado: 'sin_configurar', mensaje: c.mensaje }, { status: 503 })
      case 'error':
        return NextResponse.json({ estado: 'error', causa: c.causa, mensaje: c.mensaje }, { status: 502 })
    }
  }

  const r = await resolverCatalogo(params)
  switch (r.estado) {
    case 'ok':
      return NextResponse.json({
        estado: 'ok',
        opciones: r.opciones,
        ...(r.hogar ? { hogar: r.hogar } : {}),
        ...(r.moto ? { moto: r.moto } : {}),
        ...(r.vida ? { vida: r.vida } : {}),
        ...(r.salud ? { salud: r.salud } : {}),
        ...(r.decesos ? { decesos: r.decesos } : {}),
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

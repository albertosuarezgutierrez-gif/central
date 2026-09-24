import { NextResponse } from 'next/server'

import { COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'
import { cerrarVistaCorredorDeSesion } from '@/lib/vista-corredor'

export const runtime = 'nodejs'

/**
 * Cerrar sesión. **Solo POST, y eso no es purismo REST.**
 *
 * ── Por qué no hay GET ──────────────────────────────────────────────────────
 *
 * La cookie del portal es `sameSite: 'lax'`, que SÍ viaja en una navegación de
 * primer nivel por GET. Con un `GET /api/salir`:
 *
 *   - cualquier página ajena podría cerrarle la sesión a quien pinche un enlace
 *     («mira esto») sin que la persona entienda por qué ha salido;
 *   - y peor, porque no hace falta ni el clic: los navegadores, los antivirus y
 *     el propio `<Link>` de Next **precargan** enlaces. Un GET que destruye la
 *     sesión se dispara al pasar el ratón por encima.
 *
 * Por eso la única puerta es un `<form method="post">` (ver `SalirDelPortal`),
 * que no se precarga ni se dispara desde un `<img>` de otro sitio.
 *
 * ── Y por qué 303 ───────────────────────────────────────────────────────────
 *
 * Un 302 deja al navegador repetir el POST contra el destino; el 303 le obliga
 * a pasar a GET, que es lo que hace falta para acabar en la portada.
 *
 * 🚨 La cookie se borra con **las MISMAS opciones con las que se puso**
 * (`COOKIE_OPTS`, y de ahí `path: '/'`). Un `delete` con otro `path` o sin
 * `secure` no falla: responde 303, la persona ve la portada y se cree fuera —
 * mientras la cookie sigue en el navegador y la sesión sigue viva. Es el fallo
 * más caro que puede tener esta ruta porque su síntoma es el éxito.
 */
export async function POST(req: Request) {
  // Si quien sale es el CORREDOR mirando una ficha, se suelta el vínculo
  // temporal antes de borrar la cookie. Best-effort: la cookie se borra igual.
  await cerrarVistaCorredorDeSesion()
  const res = NextResponse.redirect(new URL('/', req.url), 303)
  res.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 })
  return res
}

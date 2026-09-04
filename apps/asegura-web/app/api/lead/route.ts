import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/lead — el único camino por el que sale algo de esta web.
//
// 🚨 Aquí NO se valida el lead, NO se toca la base de datos y NO se avisa a
// nadie: todo eso ya lo hace `POST /api/publico/correduria/lead` de
// `apps/plataforma`, que además da de alta la ficha por el puerto de asegura y
// manda el Telegram. Este endpoint es un REENVÍO y nada más. Duplicar aquí la
// validación o el alta significaría dos reglas de negocio que se separan solas
// con el tiempo, y una web de marketing no debe tener credenciales de BD.
//
// 🔑 Por qué existe este salto en vez de que el formulario llame directamente a
// plataforma desde el navegador: son dominios distintos, así que sería una
// petición cross-origin y habría que abrir CORS en un endpoint público. Con el
// reenvío desde el servidor no hay CORS que abrir ni origen que mantener en una
// lista blanca.
//
// 🚨 Y la trampa que resuelve el `x-forwarded-for` de abajo: el endpoint de
// plataforma limita a 6 intentos por hora POR IP. Si reenviáramos sin más, la
// IP que vería sería la del servidor de esta app — la MISMA para todos los
// visitantes—, así que el séptimo lead legítimo de la hora se rechazaría y el
// formulario diría «demasiadas solicitudes» a alguien que nunca lo había
// enviado. Se propaga la IP real del visitante para que el límite siga siendo
// por persona. No abre ningún agujero nuevo: quien quisiera falsear esa
// cabecera ya puede llamar al endpoint público directamente.

/** URL base de plataforma. Sin ella no hay canal, y eso se dice, no se traga. */
const PLATAFORMA_URL = (process.env.PLATAFORMA_URL || '').replace(/\/+$/, '')

/** IP real del visitante, tal y como la ve esta app (Vercel la pone al frente). */
function ipVisitante(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  const primera = fwd?.split(',')[0]?.trim()
  return primera && primera.length > 0 ? primera : null
}

export async function POST(req: NextRequest) {
  if (!PLATAFORMA_URL) {
    // Tres estados, no dos: esto NO es «el envío falló», es «no hay canal
    // configurado». Si se colapsaran en el mismo error, un despliegue sin la
    // variable de entorno se vería igual que una caída pasajera y nadie
    // buscaría en el sitio correcto. El visitante ve un teléfono humano.
    console.error('[lead] PLATAFORMA_URL sin configurar: el formulario no tiene a dónde enviar')
    return NextResponse.json(
      { ok: false, motivo: 'Ahora mismo no podemos recoger tu solicitud por la web. Escríbenos por correo y te llamamos.' },
      { status: 503 },
    )
  }

  const cuerpo = await req.text()
  const ip = ipVisitante(req)

  try {
    const res = await fetch(`${PLATAFORMA_URL}/api/publico/correduria/lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Ver la nota de arriba: sin esto el límite por IP se vuelve global.
        ...(ip ? { 'x-forwarded-for': ip } : {}),
      },
      body: cuerpo,
      // Un formulario que se queda colgado es un lead perdido sin rastro: mejor
      // fallar a los 10 s y que la persona pueda reintentar o llamar.
      signal: AbortSignal.timeout(10_000),
    })
    const json = await res.json().catch(() => ({ ok: false, motivo: 'Respuesta no válida del servidor.' }))
    return NextResponse.json(json, { status: res.status })
  } catch {
    // Sin `console.log` del cuerpo: lleva nombre, teléfono y correo de una
    // persona, y los logs de una app pública no son sitio para eso.
    console.error('[lead] el reenvío a plataforma no llegó a completarse')
    return NextResponse.json(
      { ok: false, motivo: 'No hemos podido enviar tu solicitud. Inténtalo de nuevo en un momento o escríbenos por correo.' },
      { status: 502 },
    )
  }
}

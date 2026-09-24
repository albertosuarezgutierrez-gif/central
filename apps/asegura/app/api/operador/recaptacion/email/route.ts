import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { pulirConIA } from '@/lib/recaptacion-ia'
import { enviarEmailRecaptacion } from '@/lib/cartera-recaptacion'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

// POST /api/operador/recaptacion/email — envía de verdad por Resend (con
// tracking de apertura/clic) y deja el registro en `recaptacion_envios` +
// `historial_interno`. `{ clienteId, polizaId, asunto, texto, email? }`.
//
// 🚨 `email` es OPCIONAL y NO enruta nada: el destinatario lo resuelve el
// servidor desde la ficha del `clienteId` (ver `enviarEmailRecaptacion`). Si
// viene y no coincide con el de la ficha, no se manda nada (422
// `destinatario_distinto`) — la pantalla estaba enseñando otra dirección.
// 🚨 Y `actor` ya NO se lee del cuerpo: lo pone el servidor. Este puerto se
// autentica con un secreto compartido, así que un nombre que mande el llamante
// es una firma falsificable en la pista de auditoría.
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as
      | { clienteId?: string; polizaId?: string; email?: string; asunto?: string; texto?: string }
      | null
    if (!body?.clienteId || !body?.polizaId || !body?.asunto || !body?.texto) {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan_campos' }, { status: 422 })
    }

    const textoFinal = await pulirConIA(body.texto)
    const r = await enviarEmailRecaptacion(correduria.id, {
      clienteId: body.clienteId,
      polizaId: body.polizaId,
      // Solo como confirmación de lo que había en pantalla; ver arriba.
      emailDeclarado: body.email ?? null,
      asunto: body.asunto,
      texto: textoFinal,
    })
    if (!r.ok) {
      return NextResponse.json(
        // `resuelto` deja decir en pantalla a qué dirección SÍ se le escribiría,
        // en vez de un «no se pudo» sin salida. No es un dato nuevo: es el
        // correo de la ficha que esa misma pantalla ya muestra en la cola.
        { estado: estadoPara(r.status), motivo: r.motivo, destinatario: r.resuelto },
        { status: r.status },
      )
    }

    return NextResponse.json({ estado: 'ok', destinatario: r.destinatario })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/recaptacion/email', e) }, { status: 500 })
  }
})

/**
 * Cada desenlace se arregla en un sitio distinto y por eso no se colapsan:
 * 404 = esa ficha/póliza no es de esta correduría · 422 = el cuerpo o los datos
 * del cliente no permiten escribirle · 503 = falta el proveedor de correo (se
 * arregla en Vercel, reintentar NO lo arregla) · 502 = el proveedor rechazó el
 * mensaje (ahí sí tiene sentido reintentar). Misma separación que el aviso de
 * acceso (`sin_correo_configurado` / `error_envio`).
 */
function estadoPara(status: 404 | 422 | 502 | 503): string {
  if (status === 404) return 'no_encontrado'
  if (status === 422) return 'invalido'
  if (status === 503) return 'sin_configurar'
  return 'error'
}

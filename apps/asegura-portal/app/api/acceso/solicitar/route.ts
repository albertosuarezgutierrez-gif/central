import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generarCodigo, destinoValido, MAX_DESTINO } from '@central/module-seguros-portal'
import { prisma } from '@/lib/db'
import { hashCanal } from '@/lib/auth'
import { obtenerCanal, registrarCanal, type TipoCanal } from '@/lib/canal'
import { canalEmail } from '@/lib/canal-email'
import { canalConsola } from '@/lib/canal-consola'
import { getIp, rateLimit } from '@/lib/rate-limit'

registrarCanal(process.env.NODE_ENV === 'production' ? canalEmail : canalConsola)

const Entrada = z.object({
  tipo: z.enum(['whatsapp', 'email']),
  destino: z.string().min(3).max(MAX_DESTINO),
})

/**
 * Topes de esta ruta. Es PÚBLICA y SIN SESIÓN, así que sin ellos cualquiera
 * podía escribir filas en `portal_codigo` y disparar envíos a un tercero: un
 * amplificador de correo con nuestra factura y nuestro dominio en el remitente.
 *
 * 6/h por IP es la misma cifra que `/api/publico/correduria/lead` de plataforma
 * — el mismo tipo de formulario público, el mismo criterio.
 */
const MAX_POR_IP = 6
const MAX_POR_DESTINO = 5
const VENTANA_MS = 60 * 60 * 1000

function demasiadas(retryAfter: number) {
  return NextResponse.json(
    { error: 'demasiadas_peticiones', retryAfter },
    { status: 429, headers: { 'retry-after': String(retryAfter) } },
  )
}

export async function POST(req: Request) {
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const { tipo, destino } = parsed.data
  const canal = obtenerCanal(tipo as TipoCanal)

  // «Este canal no está montado» NO es «no hemos podido enviarlo». Decirle al
  // usuario que falló el envío cuando WhatsApp aún no existe es mentirle.
  //
  // Va ANTES de validar el destino y antes de los topes: si el canal no existe,
  // el problema es nuestro y no tiene sentido ni gastarle cuota ni echarle la
  // culpa a lo que ha escrito. Y no abre un agujero, porque un 503 no escribe
  // fila ni envía nada.
  if (!canal) return NextResponse.json({ error: 'canal_no_disponible', tipo }, { status: 503 })

  // Tope por IP: barato y en memoria, así que va antes de tocar la BD. Frena al
  // bot torpe; el límite REAL es el de abajo (ver `lib/rate-limit.ts`).
  const porIp = rateLimit(`solicitar:${getIp(req)}`, MAX_POR_IP, VENTANA_MS)
  if (!porIp.allowed) return demasiadas(porIp.retryAfter ?? 60)

  // El destino se valida DESPUÉS del tope por IP: una ristra de peticiones con
  // basura es abuso igual, y así no sale gratis.
  if (!destinoValido(tipo, destino)) {
    return NextResponse.json({ error: 'destino_invalido', tipo }, { status: 400 })
  }

  const valorHash = hashCanal(destino)

  // Tope por DESTINO, y este sí es global: cuenta filas en la BD, así que lo ven
  // todas las instancias. Es el único que impide de verdad llenarle el buzón a
  // una persona desde muchas IPs.
  //
  // No filtra por `tipo`: el hash ya lleva el valor, y da igual por dónde se
  // intente — lo que se protege es el buzón de esa persona.
  //
  // 🔎 Esto NO es un oráculo de «¿es cliente?»: la fila se escribe para
  // CUALQUIER destino que se pida, sea o no de la cartera, así que el contador
  // solo dice cuántos códigos se han pedido para ese destino. No revela nada
  // sobre quién está en la cartera.
  const desde = new Date(Date.now() - VENTANA_MS)
  const recientes = await prisma.portalCodigo.count({ where: { valorHash, creadoEn: { gte: desde } } })
  if (recientes >= MAX_POR_DESTINO) return demasiadas(Math.ceil(VENTANA_MS / 1000))

  const codigo = generarCodigo()
  await prisma.portalCodigo.create({
    data: { tipo, valorHash, codigo },
  })

  const enviado = await canal.enviarCodigo(destino, codigo)
  if (!enviado) return NextResponse.json({ error: 'envio_fallido' }, { status: 502 })

  return NextResponse.json({ ok: true })
}

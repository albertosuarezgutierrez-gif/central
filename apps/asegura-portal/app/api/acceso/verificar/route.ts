import { NextResponse } from 'next/server'
import { z } from 'zod'
import { estadoCodigo, necesitaRegistro, normalizarIp, normalizarUserAgent } from '@central/module-seguros-portal'
import { VERSION_TEXTOS_LEGALES } from '@central/module-seguros'
import { prisma } from '@/lib/db'
import { COOKIE_NAME, COOKIE_OPTS, crearSesion, hashCanal } from '@/lib/auth'
import { vincularIdentidad } from '@/lib/vinculo'

const Entrada = z.object({
  tipo: z.enum(['whatsapp', 'email']),
  destino: z.string().min(3).max(200),
  codigo: z.string().length(6),
})

export async function POST(req: Request) {
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const { tipo, destino, codigo } = parsed.data
  const valorHash = hashCanal(destino)

  const guardado = await prisma.portalCodigo.findFirst({
    where: { tipo, valorHash },
    orderBy: { creadoEn: 'desc' },
  })
  if (!guardado) return NextResponse.json({ error: 'sin_codigo' }, { status: 400 })

  const estado = estadoCodigo(
    { codigo: guardado.codigo, creadoEn: guardado.creadoEn, intentos: guardado.intentos, usadoEn: guardado.usadoEn },
    codigo,
    new Date(),
  )

  if (estado !== 'valido') {
    // El intento se cuenta SIEMPRE que el código exista y no esté ya bloqueado:
    // si solo contáramos los aciertos, el tope de intentos no serviría de nada.
    if (estado === 'incorrecto') {
      await prisma.portalCodigo.update({ where: { id: guardado.id }, data: { intentos: { increment: 1 } } })
    }
    return NextResponse.json({ error: estado }, { status: 401 })
  }

  const canalExistente = await prisma.portalCanal.findUnique({ where: { tipo_valorHash: { tipo, valorHash } } })

  const identidadId =
    canalExistente?.identidadId ??
    (
      await prisma.portalIdentidad.create({
        data: { canales: { create: { tipo, valorHash, verificadoEn: new Date() } } },
        select: { id: true },
      })
    ).id

  // Acreditación del art. 19 LDS. La pantalla de entrada dice, encima del botón,
  // que al entrar se da por leída la información del mediador y aceptadas las
  // condiciones, con los tres enlaces al lado: por eso esta fila afirma algo que
  // de verdad ocurrió. Si alguien quita esa línea de la UI, esta escritura pasa
  // a ser una prueba fabricada — lo vigila `test/regression-portal-consentimiento.test.ts`.
  //
  // Se sella con la versión EXACTA del texto: un consentimiento sin saber QUÉ se
  // aceptó no acredita nada. Solo se escribe si no consta ya esa versión, así
  // que entrar cien veces no deja cien filas, pero cambiar el texto sí pide una
  // acreditación nueva.
  const yaAcreditado = await prisma.portalConsentimiento.findMany({
    where: { identidadId, tipo: 'lds_art19' },
    select: { tipo: true, otorgado: true, versionTexto: true },
  })
  const registrar = necesitaRegistro(yaAcreditado, 'lds_art19', VERSION_TEXTOS_LEGALES)

  // Va DENTRO de la transacción del canje a propósito: si no se puede dejar
  // constancia, tampoco se consume el código. El usuario reintenta y no queda un
  // acceso concedido sin la prueba de que se le informó, que es justo el estado
  // que no se puede distinguir después de uno correcto.
  await prisma.$transaction([
    prisma.portalCodigo.update({ where: { id: guardado.id }, data: { usadoEn: new Date() } }),
    prisma.portalIdentidad.update({ where: { id: identidadId }, data: { ultimoAccesoEn: new Date() } }),
    ...(registrar
      ? [
          prisma.portalConsentimiento.create({
            data: {
              identidadId,
              tipo: 'lds_art19',
              otorgado: true,
              versionTexto: VERSION_TEXTOS_LEGALES,
              ip: normalizarIp(req.headers.get('x-forwarded-for')),
              userAgent: normalizarUserAgent(req.headers.get('user-agent')),
            },
          }),
        ]
      : []),
  ])

  // Fase 4: ¿esta identidad es una ficha de la cartera? Es el ÚNICO momento en
  // que se tiene el email en claro (el portal solo guarda su hash con pimienta
  // propia). El resultado NO bloquea el login: se devuelve para que la pantalla
  // pueda decirlo («hay varias fichas», «no se ha podido comprobar»).
  const vinculo = await vincularIdentidad(identidadId, destino, tipo)

  const token = await crearSesion(identidadId)
  const res = NextResponse.json({ ok: true, vinculo: vinculo.estado })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}

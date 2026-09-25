import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { MAX_INTENTOS, destinoSeguro, estadoCodigo, estadoEnlace, hashTokenEnlace, necesitaRegistro, normalizarIp, normalizarUserAgent, tokenEnlaceValido } from '@central/module-seguros-portal'
import { computeEmailLookupHash } from '@central/module-seguros-pii'
import { VERSION_TEXTOS_LEGALES } from '@central/module-seguros'
import { prisma } from '@/lib/db'
import { avisarPrimerAcceso } from '@/lib/aviso-acceso'
import { COOKIE_NAME, COOKIE_OPTS, crearSesion, hashCanal, hashCodigo } from '@/lib/auth'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { vincularIdentidad } from '@/lib/vinculo'

/** Verificaciones por IP cada 15 min. Holgado para una familia tras un mismo router. */
const MAX_VERIFICAR_POR_IP = 30

const Entrada = z.union([
  z.object({
    tipo: z.enum(['whatsapp', 'email']),
    destino: z.string().min(3).max(200),
    codigo: z.string().length(6),
  }),
  // El ENLACE DIRECTO del correo de avisos (`enlace-directo.ts` de module-seguros-portal): el mismo
  // canje, con una llave larga de un solo uso en vez de seis dígitos. Solo por correo.
  z.object({
    tipo: z.literal('email'),
    destino: z.string().min(3).max(200),
    enlace: z.string().refine(tokenEnlaceValido),
  }),
])

/** `null` = vale; si no, el error que se devuelve (401). Un solo mensaje para «no existe» y «no es tu correo». */
async function canjearEnlace(destino: string, enlace: string): Promise<{ error: string } | { destino: string; marcar: () => Promise<boolean> }> {
  const fila = await prisma.portalEnlaceDirecto.findUnique({ where: { tokenHash: await hashTokenEnlace(enlace) } })
  // El correo del enlace tiene que ser el de la ficha a la que se mandó: un token suelto no abre nada.
  let hash: string | null = null
  try {
    hash = computeEmailLookupHash(destino)
  } catch {
    hash = null
  }
  if (!fila || hash === null || hash !== fila.emailLookupHash) return { error: 'incorrecto' }
  const estado = estadoEnlace({ usadoEn: fila.usadoEn, expiraAt: fila.expiraEn }, new Date())
  if (estado !== 'valido') return { error: estado === 'usado' ? 'ya_usado' : 'caducado' }
  return {
    destino: destinoSeguro(fila.destino),
    // Se marca ANTES de abrir la sesión y solo si nadie lo gastó entre medias: si luego algo
    // falla, la llave queda gastada y se entra con el código de siempre (falla cerrado).
    marcar: async () =>
      (await prisma.portalEnlaceDirecto.updateMany({ where: { id: fila.id, usadoEn: null, expiraEn: { gt: new Date() } }, data: { usadoEn: new Date() } })).count === 1,
  }
}

export async function POST(req: Request) {
  // Por IP y además del tope por código: sin esto, cada código nuevo trae otros 5
  // intentos y nada frena a quien pide y prueba en bucle desde la misma máquina.
  if (!rateLimit(`verificar:${getIp(req)}`, MAX_VERIFICAR_POR_IP, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  }
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const { tipo, destino } = parsed.data
  const valorHash = hashCanal(destino)

  let irA = '/boveda'
  if ('enlace' in parsed.data) {
    const e = await canjearEnlace(destino, parsed.data.enlace)
    if ('error' in e) return NextResponse.json({ error: e.error }, { status: 401 })
    if (!(await e.marcar())) return NextResponse.json({ error: 'ya_usado' }, { status: 401 })
    irA = e.destino
    return abrirSesion(req, tipo, destino, valorHash, null, irA)
  }
  const { codigo } = parsed.data

  const guardado = await prisma.portalCodigo.findFirst({
    where: { tipo, valorHash },
    orderBy: { creadoEn: 'desc' },
  })
  if (!guardado) return NextResponse.json({ error: 'sin_codigo' }, { status: 400 })

  // 🚨 El intento se RESERVA antes de comparar, en una sola escritura condicionada
  // (24/09/2026). Leer `intentos`, comparar y luego sumar dejaba que una ráfaga de
  // peticiones en paralelo evaluara todas con el contador viejo: el tope de 5 no
  // limitaba nada. Si no hay intento que reservar, el código está gastado o
  // bloqueado y no se compara. Gastar uno al acertar, o sobre un código caducado, es
  // inocuo: ese código ya no vuelve a valer.
  const reservado = await prisma.portalCodigo.updateMany({
    where: { id: guardado.id, usadoEn: null, intentos: { lt: MAX_INTENTOS } },
    data: { intentos: { increment: 1 } },
  })
  if (reservado.count === 0) {
    // Sin intento que reservar: gastado (quizá entre la lectura y ahora) o agotado.
    const ahora = await prisma.portalCodigo.findFirst({ where: { id: guardado.id }, select: { usadoEn: true } })
    return NextResponse.json({ error: ahora?.usadoEn ? 'ya_usado' : 'bloqueado' }, { status: 401 })
  }

  // 🚨 Se comparan HASHES, y la comparación la hace `estadoCodigo` en tiempo
  // constante. La columna `codigo` de la BD guarda el hash (ver
  // `/api/acceso/solicitar`): lo que se le pasa aquí es `hashCodigo(entrada)`,
  // nunca los 6 dígitos tecleados. Una fila anterior al hasheado (código en
  // claro) sale `caducado` —«pide otro»—, no `incorrecto`.
  const estado = estadoCodigo(
    { codigoHash: guardado.codigo, creadoEn: guardado.creadoEn, intentos: guardado.intentos, usadoEn: guardado.usadoEn },
    hashCodigo(codigo),
    new Date(),
  )

  // El intento ya quedó contado arriba, antes de comparar.
  if (estado !== 'valido') return NextResponse.json({ error: estado }, { status: 401 })
  return abrirSesion(req, tipo, destino, valorHash, guardado.id, irA)
}

/**
 * Lo común a los dos canjes (código o enlace directo), ya validados: identidad, acreditación del
 * art. 19 LDS, rastro del acceso, vínculo con la ficha, aviso de primer acceso y sesión.
 * `codigoId` = el código a gastar en la misma transacción (`null` si se entró por enlace, que ya
 * quedó gastado antes).
 */
async function abrirSesion(req: Request, tipo: 'whatsapp' | 'email', destino: string, valorHash: string, codigoId: string | null, irA: string) {
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
  // ¿Es la PRIMERA vez que entra? Se mira ANTES de la transacción, porque el
  // `update` de abajo pisa `ultimoAccesoEn` y después ya no hay forma de
  // saberlo. Es el dato que decide si esto merece un aviso.
  const antes = await prisma.portalIdentidad.findUnique({
    where: { id: identidadId },
    select: { ultimoAccesoEn: true, nombre: true },
  })
  const primeraVez = antes !== null && antes.ultimoAccesoEn === null

  // 🚨 El código se gasta SOLO si nadie lo gastó entre medias (`usadoEn: null` en el
  // `where`, 24/09/2026): dos canjes simultáneos del mismo código abrían dos sesiones.
  // Si otro llegó antes, el `update` no encuentra fila (P2025), la transacción entera
  // se deshace y se responde `ya_usado` — mismo criterio que `marcar()` del enlace.
  try {
    await prisma.$transaction([
    ...(codigoId ? [prisma.portalCodigo.update({ where: { id: codigoId, usadoEn: null }, data: { usadoEn: new Date() } })] : []),
    prisma.portalIdentidad.update({ where: { id: identidadId }, data: { ultimoAccesoEn: new Date() } }),
    // 🚨 DENTRO de la transacción, por la misma razón que el consentimiento de
    // aquí abajo: si no se puede dejar constancia de la entrada, tampoco se
    // consume el código. Un acceso sin rastro es indistinguible después de uno
    // que nunca ocurrió, y `ultimoAccesoEn` no vale como historial — es un solo
    // timestamp que se pisa en cada login.
    prisma.portalAcceso.create({
      data: {
        identidadId,
        ip: normalizarIp(req.headers.get('x-forwarded-for')),
        userAgent: normalizarUserAgent(req.headers.get('user-agent')),
      },
    }),
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
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'ya_usado' }, { status: 401 })
    }
    throw e
  }

  // Fase 4: ¿esta identidad es una ficha de la cartera? Es el ÚNICO momento en
  // que se tiene el email en claro (el portal solo guarda su hash con pimienta
  // propia). El resultado NO bloquea el login: se devuelve para que la pantalla
  // pueda decirlo («hay varias fichas», «no se ha podido comprobar»).
  const vinculo = await vincularIdentidad(identidadId, destino, tipo)

  // El aviso va AQUÍ y no después de responder: en serverless, lo que se lanza
  // sin esperar después de devolver la respuesta puede morir con la función. Se
  // espera, y `avisarPrimerAcceso` no lanza nunca — un fallo del aviso no puede
  // impedir que un cliente entre.
  //
  // 🚨 Y es el NUDGE, no el registro: la fila de `portal_acceso` ya está escrita
  // arriba, dentro de la transacción. Si Telegram no está configurado en este
  // proyecto no se pierde nada, solo la inmediatez (queda un warn en el log).
  if (primeraVez) {
    await avisarPrimerAcceso({
      identidadId,
      nombre: antes?.nombre ?? null,
      // Los seis estados del vínculo, mapeados a los tres que sabe decir el
      // aviso. `ambiguo`/`sin_clave`/`error` NO son «no tiene ficha».
      vinculo:
        vinculo.estado === 'ok' || vinculo.estado === 'ya_vinculada'
          ? 'si'
          : vinculo.estado === 'sin_ficha'
            ? 'no'
            : 'no_se_sabe',
    })
  }

  const token = await crearSesion(identidadId)
  const res = NextResponse.json({ ok: true, vinculo: vinculo.estado, irA })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}

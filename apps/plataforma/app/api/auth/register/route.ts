// Alta de cuenta. **CERRADA A INTERNET desde el 20/09/2026.**
//
// Por qué: esta ruta estaba en la lista `PUBLIC` del middleware, no pedía nada
// para crear la cuenta y devolvía la cookie de sesión EN LA MISMA RESPUESTA.
// Como ninguna pantalla de la casa gateaba por rol (las tres cuentas reales
// tienen `rol = null`), cualquiera con un navegador se registraba y pedía
// `/api/correduria/cartera-lista?formato=csv`: hasta 2.000 fichas con DNI,
// teléfono, correo y dirección descifrados. El agujero no era el alta en sí:
// era el alta ABIERTA. Por eso el código del alta NO se borra — se exige una
// invitación para llegar a él.
//
// La invitación es `REGISTRO_INVITACION_CODIGO`, y **fail-closed**: sin esa env
// no se crea ninguna cuenta, tampoco en desarrollo. Un olvido de configuración
// tiene que dejar la puerta cerrada, nunca abierta; las cuentas existentes se
// dan de alta desde el god-panel (`/admin`), que tiene su propia auth.
//
// Además `/register` salió de `PUBLIC` en `middleware.ts`, así que esta ruta ya
// solo es alcanzable con sesión. La comprobación de aquí es defensa en
// profundidad: si alguien volviera a meter la ruta en `PUBLIC`, seguiría
// pidiendo la invitación.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword, createSessionToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'
import { registrarSesion } from '@/lib/sesiones-db'

const Body = z.object({
  nombre: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8),
  invitacion: z.string().min(1).optional(),
})

export const ENV_INVITACION = 'REGISTRO_INVITACION_CODIGO'

/**
 * Comparación en tiempo (aproximadamente) constante: el código de invitación es
 * un secreto corto, y un `===` sobre cadenas filtra su longitud y su prefijo.
 */
function codigoValido(dado: string | undefined, esperado: string): boolean {
  if (typeof dado !== 'string' || dado.length !== esperado.length) return false
  let dif = 0
  for (let i = 0; i < esperado.length; i++) dif |= dado.charCodeAt(i) ^ esperado.charCodeAt(i)
  return dif === 0
}

export async function POST(req: NextRequest) {
  // 🔒 Fail-closed: sin código configurado, el registro NO existe.
  const esperado = process.env[ENV_INVITACION]
  if (!esperado) {
    return NextResponse.json(
      { error: 'El registro está cerrado. Pide el alta al administrador.', motivo: 'registro_cerrado' },
      { status: 403 },
    )
  }

  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { nombre, email, password, invitacion } = body.data

  if (!codigoValido(invitacion, esperado)) {
    return NextResponse.json(
      { error: 'Código de invitación no válido.', motivo: 'invitacion_invalida' },
      { status: 403 },
    )
  }

  const existe = await prisma.cuenta.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    select: { id: true },
  })
  if (existe) return NextResponse.json({ error: 'Email ya registrado' }, { status: 409 })

  const passwordHash = await hashPassword(password)
  const cuenta = await prisma.cuenta.create({
    data: { nombre, email: email.toLowerCase(), passwordHash },
  })

  const { token, jti } = await createSessionToken(cuenta.id, cuenta.email)
  await registrarSesion(cuenta.id, jti)

  const res = NextResponse.json({ ok: true, nombre: cuenta.nombre }, { status: 201 })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const nombre = body.nombre !== undefined ? String(body.nombre).trim() : null
    if (body.nombre !== undefined && !nombre) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const str = (k: string) => body[k] !== undefined ? (String(body[k]).trim() || null) : undefined
    const apellidos        = str('apellidos')
    const email            = str('email')
    const telefono         = str('telefono')
    const dni              = str('dni')
    const nss              = str('nss')
    const puesto           = str('puesto')
    const estado           = body.estado !== undefined ? String(body.estado) : undefined
    const domicilio        = str('domicilio')
    const localidad        = str('localidad')
    const provincia        = str('provincia')
    const fecha_nacimiento = body.fecha_nacimiento !== undefined ? (String(body.fecha_nacimiento).trim() || null) : undefined
    const estado_civil     = str('estado_civil')
    const tipo_contrato    = str('tipo_contrato')
    const centro_trabajo   = str('centro_trabajo')
    const cuenta_cotizacion = str('cuenta_cotizacion')
    const categoria        = str('categoria')
    const grupo_cotizacion = str('grupo_cotizacion')
    const tipo_jornada     = str('tipo_jornada')
    const fecha_alta       = body.fecha_alta !== undefined ? (String(body.fecha_alta).trim() || null) : undefined
    const fecha_reconocimiento_medico = body.fecha_reconocimiento_medico !== undefined ? (String(body.fecha_reconocimiento_medico).trim() || null) : undefined

    const c = (val: string | null | undefined, colName: string) =>
      val === undefined ? Prisma.sql`${Prisma.raw(colName)}` : Prisma.sql`${val}`
    // Las columnas DATE necesitan cast explícito: Prisma manda el parámetro como `text`
    // y Postgres rechaza `date = text` (ERROR 42804) — incluso cuando el valor es NULL —
    // haciendo fallar TODO el UPDATE. Igual que los `::uuid` del WHERE.
    const cDate = (val: string | null | undefined, colName: string) =>
      val === undefined ? Prisma.sql`${Prisma.raw(colName)}` : Prisma.sql`${val}::date`

    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.empleados SET
        nombre            = COALESCE(${nombre}, nombre),
        apellidos         = ${c(apellidos, 'apellidos')},
        email             = ${c(email, 'email')},
        telefono          = ${c(telefono, 'telefono')},
        dni               = ${c(dni, 'dni')},
        nss               = ${c(nss, 'nss')},
        puesto            = ${c(puesto, 'puesto')},
        estado            = COALESCE(${estado}, estado),
        domicilio         = ${c(domicilio, 'domicilio')},
        localidad         = ${c(localidad, 'localidad')},
        provincia         = ${c(provincia, 'provincia')},
        fecha_nacimiento  = ${cDate(fecha_nacimiento, 'fecha_nacimiento')},
        estado_civil      = ${c(estado_civil, 'estado_civil')},
        tipo_contrato     = ${c(tipo_contrato, 'tipo_contrato')},
        centro_trabajo    = ${c(centro_trabajo, 'centro_trabajo')},
        cuenta_cotizacion = ${c(cuenta_cotizacion, 'cuenta_cotizacion')},
        categoria         = ${c(categoria, 'categoria')},
        grupo_cotizacion  = ${c(grupo_cotizacion, 'grupo_cotizacion')},
        tipo_jornada      = ${c(tipo_jornada, 'tipo_jornada')},
        fecha_alta        = ${cDate(fecha_alta, 'fecha_alta')},
        fecha_reconocimiento_medico = ${cDate(fecha_reconocimiento_medico, 'fecha_reconocimiento_medico')}
      WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('obligatorio')) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const firmas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM rrhh.firmas WHERE empleado_id=${id}::uuid AND empresa_id=${empresa_id}::uuid LIMIT 1`)
    if (firmas[0]) {
      return NextResponse.json(
        { error: 'Este empleado tiene documentos firmados: no puede borrarse (se conserva por evidencia legal). Dale de baja en su lugar.' },
        { status: 409 })
    }
    await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.documentos WHERE empleado_id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.empleados WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

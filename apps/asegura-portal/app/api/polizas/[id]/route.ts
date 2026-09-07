import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { puedeBorrarDeclarada } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { normalizarParche } from '@/lib/poliza-editable'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Corrección a mano de una póliza que el propio cliente subió.
 *
 * 🚨 El aislamiento de este portal NO lo da RLS (el rol `prisma_asegura_portal`
 * consulta sin políticas que resuelvan `auth.uid()`): lo da ESTE código. Por eso
 * la escritura va por `updateMany` filtrando por `identidadId` ADEMÁS de por `id`,
 * y no por `update({ where: { id } })`: con el uuid de una póliza ajena —que viaja
 * en la URL— un `update` a secas dejaría a cualquiera reescribir la bóveda de otro,
 * y el fallo no se vería en ningún log porque la operación sería un éxito.
 *
 * `count === 0` cubre a la vez «no existe» y «no es tuya». Se responden igual (404)
 * a propósito: distinguirlas confirmaría al que prueba uuids cuáles existen.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo ni de la URL.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }

  // El RAMO GUARDADO, antes de validar. Los campos específicos (`datosRamo`) solo
  // significan algo contra el catálogo de SU ramo, y en un PATCH ese ramo puede
  // no venir en el cuerpo: sin leerlo, una corrección de la prima que arrastrara
  // los campos del ramo se rechazaría (`datos_ramo_sin_ramo`) o —peor— vaciaría
  // la columna. Se lee con el MISMO filtro por `identidadId`: aquí no hay
  // consulta sin identidad de la cookie, ni siquiera para leer un ramo.
  const actual = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id },
    select: { ramo: true },
  })
  if (!actual) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })

  const normalizado = normalizarParche(cuerpo, new Date(), { ramoGuardado: actual.ramo })
  if (!normalizado.ok) return NextResponse.json({ error: normalizado.error }, { status: 400 })

  // Las dos columnas de JSON salen del resto: Prisma NO admite `null` en una
  // columna `Json?`. Un borrado tiene que llegar como `DbNull` (el NULL de SQL),
  // nunca como `JsonNull`, que escribiría el literal `null` DENTRO del JSON y se
  // colaría por todas las guardas de NULL. `referenciaCatastral` viaja en el
  // resto: es `text`, y ahí `null` sí es el NULL de SQL.
  const { datosRamo, datosRamoOrigen, ...parche } = normalizado.parche

  const { count } = await prisma.portalPolizaDeclarada.updateMany({
    where: { id, identidadId: identidad.id },
    data: {
      ...parche,
      ...('datosRamo' in normalizado.parche ? { datosRamo: datosRamo ?? Prisma.DbNull } : {}),
      // El origen se escribe cuando el normalizador lo ha puesto en el parche, y
      // eso ocurre SIEMPRE que los datos del ramo cambian: los orígenes viejos
      // hablaban de los datos viejos, así que o se reescriben o se borran. Fuera
      // de ese caso la clave no viaja y la columna no se toca (ausente ≠ borrado).
      ...('datosRamoOrigen' in normalizado.parche
        ? { datosRamoOrigen: datosRamoOrigen ?? Prisma.DbNull }
        : {}),
      // El usuario ha revisado estos datos con sus ojos: eso es lo único que
      // `confirmadaPorUsuario` significa.
      confirmadaPorUsuario: true,
      // Sigue siendo un dato APORTADO por el cliente, no verificado contra la
      // compañía. Que lo haya tecleado él no lo asciende de categoría.
      procedencia: 'declarado',
      actualizadaEn: new Date(),
    },
  })

  if (count === 0) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })

  const poliza = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id },
    select: {
      id: true,
      compania: true,
      numeroPoliza: true,
      ramo: true,
      primaAnual: true,
      fechaVencimiento: true,
      confirmadaPorUsuario: true,
    },
  })

  if (!poliza) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })

  return NextResponse.json({
    ...poliza,
    // `Decimal` serializa a string; la pantalla espera un número o `null`.
    // NULL sigue siendo NULL: «no se sabe la prima» no es «la prima es 0».
    primaAnual: poliza.primaAnual === null ? null : Number(poliza.primaAnual),
    fechaVencimiento: poliza.fechaVencimiento
      ? poliza.fechaVencimiento.toISOString().slice(0, 10)
      : null,
  })
}

/**
 * Quitar de la bóveda una póliza que aportó el propio cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 SOLO TOCA `portal_poliza_declarada`, Y ESO ES EL PERMISO.
 *
 * Las pólizas de la CARTERA (las que entran por CIMA) no se pueden borrar desde
 * el portal, y no porque aquí haya un `if` que lo compruebe: es que ninguna ruta
 * del portal escribe en `polizas`. Lo que el cliente puede quitar es lo que él
 * mismo metió — que es justo lo que confunde cuando ya no vale (Alberto,
 * 07/09/2026: «las que no son nuestras el cliente sí puede»).
 *
 * El aislamiento, igual que en el PATCH: `deleteMany` con `identidadId` DENTRO
 * del `where`. Un `delete({ where: { id } })` con el uuid de otro —que viaja en
 * la URL— borraría la póliza de un tercero con un 200 en el log.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🚨 El reparo del parte NO es cosmético. La FK
 * `portal_parte_siniestro.poliza_declarada_id` es `ON DELETE SET NULL`: borrar
 * una póliza con parte no falla, deja el parte apuntando a nada (el CHECK admite
 * las dos columnas nulas) y la correduría se queda con un siniestro ilegible sin
 * que nada avise. Por eso se comprueba ANTES y dentro de la MISMA transacción:
 * comprobar fuera deja la ventana abierta a que el parte entre justo en medio.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params

  const resultado = await prisma.$transaction(async (tx) => {
    // Existe Y es suya: las dos cosas en la misma consulta. Si no, 404 — nunca
    // un 403, que confirmaría que esa póliza existe.
    const suya = await tx.portalPolizaDeclarada.findFirst({
      where: { id, identidadId: identidad.id },
      select: { id: true },
    })
    if (!suya) return { estado: 404 as const, cuerpo: { error: 'no_encontrada' } }

    const partes = await tx.portalParteSiniestro.count({
      where: { polizaDeclaradaId: id, identidadId: identidad.id },
    })
    const veredicto = puedeBorrarDeclarada({ partes })
    if (!veredicto.puede) {
      return { estado: 409 as const, cuerpo: { error: veredicto.reparo, mensaje: veredicto.mensaje } }
    }

    const { count } = await tx.portalPolizaDeclarada.deleteMany({
      where: { id, identidadId: identidad.id },
    })
    // 0 aquí solo puede ser una carrera (otra pestaña la borró en medio). No es
    // un error que el cliente pueda arreglar, y el resultado que ve es el mismo
    // que quería: la póliza ya no está.
    if (count === 0) return { estado: 404 as const, cuerpo: { error: 'no_encontrada' } }

    return { estado: 200 as const, cuerpo: { ok: true } }
  })

  return NextResponse.json(resultado.cuerpo, { status: resultado.estado })
}

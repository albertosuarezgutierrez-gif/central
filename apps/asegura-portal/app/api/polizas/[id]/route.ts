import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { fotoDeLaPoliza, puedeBorrarDeclarada } from '@central/module-seguros-portal'

import { registrarUso } from '@/lib/autorizaciones'
import { accesoADeclarada } from '@/lib/declarada-ajena'
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

  // 🔒 De QUÉ identidad es la fila (12/10/2026). La propia, o la del titular
  // cuando quien mira tiene «Total» sobre su ficha ENTERA (`accesoADeclarada`,
  // fail-closed). Consulta, Gestión, sin concesión o id ajeno → `null` → 404,
  // la misma respuesta que «no existe». Todo lo de abajo escribe con ESA
  // identidad dentro del `where`, igual que antes con la de la cookie.
  const acceso = await accesoADeclarada(identidad.id, id, 'editar')
  if (acceso === null) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  const duenaId = acceso.identidadId

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
    where: { id, identidadId: duenaId },
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
    where: { id, identidadId: duenaId },
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

  // Quién lo hizo EN NOMBRE de quién: hoy el único registro que existe es el uso
  // de la autorización (el titular lo ve en «quién ha mirado»). La columna de
  // autor de la fila está propuesta, sin aplicar
  // (`prisma/sql/2026-10-12_portal_poliza_declarada_autor.sql`).
  if (!acceso.propia) await registrarUso(identidad.id, acceso.autorizacionIds)

  const poliza = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: duenaId },
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
 * 🚨 Y LOS PARTES DE SINIESTRO NO SE VAN CON ELLA. Un parte es la prueba de que
 * esa persona nos comunicó un siniestro y de cuándo (art. 16 LCS), así que ni se
 * borra en cascada —eso destruiría la prueba— ni se deja huérfano, que es lo que
 * haría el `ON DELETE SET NULL` de la FK por su cuenta: un siniestro que no dice
 * de qué póliza habla, sin que nada falle. Se CONGELA: la compañía, el número y
 * el ramo se copian dentro del parte y el vínculo se corta a mano.
 *
 * Lo único que bloquea el borrado es un parte que la compañía YA tramita
 * (`abierto_en_compania` o con `siniestroId`): ahí hay un expediente vivo con un
 * tercero. La regla vive en `puedeBorrarDeclarada()`.
 *
 * Todo ocurre en la MISMA transacción: comprobar fuera dejaría la ventana
 * abierta a que un parte entre justo entre la comprobación y el borrado, y ese
 * sí se quedaría huérfano.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params

  // 🔒 Mismo criterio que el PATCH: la propia, o la del titular con «Total».
  const acceso = await accesoADeclarada(identidad.id, id, 'quitar')
  if (acceso === null) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  const duenaId = acceso.identidadId

  const resultado = await prisma.$transaction(async (tx) => {
    // Existe Y es suya: las dos cosas en la misma consulta. Si no, 404 — nunca
    // un 403, que confirmaría que esa póliza existe.
    // Se leen ADEMÁS los tres campos que hay que congelar en los partes: si se
    // pidieran después del `deleteMany` ya no existirían, y esta es la única
    // ventana en la que la póliza y sus partes están vivos a la vez.
    const suya = await tx.portalPolizaDeclarada.findFirst({
      where: { id, identidadId: duenaId },
      select: { id: true, compania: true, numeroPoliza: true, ramo: true },
    })
    if (!suya) return { estado: 404 as const, cuerpo: { error: 'no_encontrada' } }

    // El ESTADO de cada parte, no solo cuántos hay: lo que bloquea no es tener
    // partes, es tener uno que la compañía ya está tramitando.
    // 🚨 TODOS los partes de esta póliza, no solo los de su dueña: desde el
    // 12/10/2026 quien tiene Gestión/Total puede dar un parte sobre ella (fila con
    // SU identidad). Filtrarlos por la dueña dejaría el suyo fuera de la
    // congelación y el `ON DELETE SET NULL` lo dejaría huérfano sin avisar.
    // La póliza ya está autorizada arriba (`suya`), así que esto no abre nada.
    const partes = await tx.portalParteSiniestro.findMany({
      where: { polizaDeclaradaId: suya.id },
      select: { estado: true, siniestroId: true },
    })
    const veredicto = puedeBorrarDeclarada({ partes })
    if (!veredicto.puede) {
      return { estado: 409 as const, cuerpo: { error: veredicto.reparo, mensaje: veredicto.mensaje } }
    }

    // 🚨 CONGELAR ANTES DE BORRAR, y en esta misma transacción.
    //
    // La FK es `ON DELETE SET NULL`: si se borrara primero, el `poliza_declarada_id`
    // de cada parte se pondría a NULL solo y ya no habría forma de saber de qué
    // póliza hablaba. Aquí se copian compañía, número y ramo DENTRO del parte y
    // se corta el vínculo a mano, para que el borrado de abajo no tenga nada que
    // poner a NULL. El CHECK `portal_parte_desligada_coherente` de la BD exige
    // justo eso: fecha presente y `poliza_declarada_id` ya nulo.
    const foto = fotoDeLaPoliza(suya)
    if (partes.length > 0) {
      await tx.portalParteSiniestro.updateMany({
        where: { polizaDeclaradaId: suya.id },
        data: {
          polizaDeclaradaId: null,
          // La fecha SIEMPRE, aunque la foto venga vacía: es lo que distingue
          // «se desligó y la póliza no decía nada» de «nunca se desligó».
          polizaDesligadaAt: new Date(),
          polizaDesligadaCompania: foto?.compania ?? null,
          polizaDesligadaNumero: foto?.numeroPoliza ?? null,
          polizaDesligadaRamo: foto?.ramo ?? null,
        },
      })
    }

    const { count } = await tx.portalPolizaDeclarada.deleteMany({
      where: { id, identidadId: duenaId },
    })
    // 0 aquí solo puede ser una carrera (otra pestaña la borró en medio). No es
    // un error que el cliente pueda arreglar, y el resultado que ve es el mismo
    // que quería: la póliza ya no está.
    if (count === 0) return { estado: 404 as const, cuerpo: { error: 'no_encontrada' } }

    return { estado: 200 as const, cuerpo: { ok: true, partesDesligados: partes.length } }
  })

  if (resultado.estado === 200 && !acceso.propia) await registrarUso(identidad.id, acceso.autorizacionIds)
  return NextResponse.json(resultado.cuerpo, { status: resultado.estado })
}

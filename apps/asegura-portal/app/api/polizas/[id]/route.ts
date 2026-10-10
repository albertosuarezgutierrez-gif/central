import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { fotoDeLaPoliza, puedeBorrarDeclarada } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import {
  cambiosDeEdicion,
  DECLARADA_NO_ELIMINADA,
  fotoHistorial,
  guardarObligaciones,
  SELECT_HISTORIAL,
} from '@/lib/declaradas-eliminadas'
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
  // Una eliminada no se corrige: primero se restaura (404 igual que «no existe»).
  const actual = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
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

  // 🚨 Antes, escritura, después e historial en la MISMA transacción: un historial escrito fuera
  // podría contar un «antes» que ya no era (otra pestaña guardó en medio) o faltar del todo si la
  // segunda escritura falla — y entonces «nada se pierde» sería mentira justo en la edición.
  const resultado = await prisma.$transaction(async (tx) => {
    const previa = await tx.portalPolizaDeclarada.findFirst({
      where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
      select: SELECT_HISTORIAL,
    })
    if (!previa) return null

    const { count } = await tx.portalPolizaDeclarada.updateMany({
      where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
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

    if (count === 0) return null

    const poliza = await tx.portalPolizaDeclarada.findFirst({
      where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
      select: { id: true, ...SELECT_HISTORIAL },
    })
    if (!poliza) return null

    // Solo lo que CAMBIÓ, y solo de la lista blanca (`CAMPOS_HISTORIAL`): ni la fila entera ni el
    // volcado de la IA. Si la persona guardó sin cambiar nada, no hay nada que contar.
    const cambios = cambiosDeEdicion(previa, poliza)
    if (cambios !== null) {
      await tx.portalPolizaDeclaradaHistorial.create({
        data: { polizaId: id, identidadId: identidad.id, accion: 'editada', antes: cambios.antes, despues: cambios.despues },
      })
    }
    return poliza
  })

  if (!resultado) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  const poliza = resultado

  return NextResponse.json({
    id: poliza.id,
    compania: poliza.compania,
    numeroPoliza: poliza.numeroPoliza,
    ramo: poliza.ramo,
    confirmadaPorUsuario: poliza.confirmadaPorUsuario,
    // `Decimal` serializa a string; la pantalla espera un número o `null`.
    // NULL sigue siendo NULL: «no se sabe la prima» no es «la prima es 0».
    primaAnual: poliza.primaAnual === null ? null : Number(poliza.primaAnual),
    fechaVencimiento: poliza.fechaVencimiento
      ? poliza.fechaVencimiento.toISOString().slice(0, 10)
      : null,
  })
}

/**
 * Quitar de la bóveda una póliza que aportó el propio cliente — SIN PERDERLA (10/10/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 BORRADO LÓGICO. Alberto: «lo que el cliente sube puede modificarlo y eliminarlo, pero NADA se
 * pierde: todo queda registrado para poder restaurar si se equivoca». La fila NO se borra: se le
 * pone `eliminadaEn`, sale de la bóveda (todas las lecturas filtran `DECLARADA_NO_ELIMINADA`) y
 * aparece en «Eliminadas», de donde `POST /api/polizas/[id]/restaurar` la devuelve tal cual.
 * Ninguna ruta del portal hace `portalPolizaDeclarada.deleteMany` (cepo en
 * `test/regression-portal-borrado.test.ts`).
 *
 * 🚨 SOLO TOCA `portal_poliza_declarada`, Y ESO ES EL PERMISO. Las pólizas de la CARTERA (CIMA) no
 * se pueden quitar desde el portal porque ninguna ruta del portal escribe en `polizas`.
 *
 * El aislamiento, igual que en el PATCH: `updateMany` con `identidadId` DENTRO del `where`. Con el
 * uuid de otro —que viaja en la URL— un `update({ where: { id } })` quitaría la póliza de un
 * tercero con un 200 en el log.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🚨 LOS PARTES DE SINIESTRO SE CONGELAN Y SE DESLIGAN, como antes. Un parte es la prueba de que
 * esa persona nos comunicó un siniestro y de cuándo (art. 16 LCS): se copian compañía, número y
 * ramo DENTRO del parte y se corta el vínculo, para que la bandeja del corredor siga sabiendo de
 * qué póliza habla aunque la persona ya no la vea. Restaurar NO los vuelve a ligar (una
 * comunicación ya sellada no se reescribe); sus ids quedan en el historial.
 * Bloquea el quitarla un parte que la compañía YA tramita (`puedeBorrarDeclarada()`, 409).
 *
 * 🚨 LAS OBLIGACIONES (vencimiento, recibo, recordatorios propios colgados de ella) SE APARTAN:
 * se guardan en el historial con sus sellos de aviso y se quitan de `portal_obligacion`, que leen
 * también el correo y la intranet de `apps/asegura` (ver `lib/declaradas-eliminadas.ts`). Así dejan
 * de avisar en TODOS los lectores, y al restaurar vuelven con los mismos ids y sellos.
 *
 * Todo en la MISMA transacción: si algo falla, la póliza sigue en la bóveda como estaba.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params

  const resultado = await prisma
    .$transaction(async (tx) => {
      // Existe, es suya Y está en la bóveda: las tres cosas en la misma consulta. Si no, 404 —
      // nunca un 403, que confirmaría que esa póliza existe. Quitar dos veces es «no encontrada».
      // Se lee ADEMÁS lo que va a la foto de los partes y al historial.
      const suya = await tx.portalPolizaDeclarada.findFirst({
        where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
        select: { id: true, ...SELECT_HISTORIAL },
      })
      if (!suya) return { estado: 404 as const, cuerpo: { error: 'no_encontrada' } }

      // El ESTADO de cada parte, no solo cuántos hay: lo que bloquea no es tener
      // partes, es tener uno que la compañía ya está tramitando.
      const partes = await tx.portalParteSiniestro.findMany({
        where: { polizaDeclaradaId: id, identidadId: identidad.id },
        select: { id: true, estado: true, siniestroId: true },
      })
      const veredicto = puedeBorrarDeclarada({ partes })
      if (!veredicto.puede) {
        return { estado: 409 as const, cuerpo: { error: veredicto.reparo, mensaje: veredicto.mensaje } }
      }

      // 🚨 CONGELAR ANTES DE MARCARLA, y en esta misma transacción. El CHECK
      // `portal_parte_desligada_coherente` exige fecha presente y `poliza_declarada_id` ya nulo.
      const foto = fotoDeLaPoliza(suya)
      if (partes.length > 0) {
        await tx.portalParteSiniestro.updateMany({
          where: { polizaDeclaradaId: id, identidadId: identidad.id },
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

      // Las obligaciones colgadas de ella se APARTAN (se guardan enteras en el historial).
      const obligaciones = await tx.portalObligacion.findMany({
        where: { identidadId: identidad.id, polizaDeclaradaId: id },
        select: {
          id: true,
          tipo: true,
          titulo: true,
          fechaEvento: true,
          fechaAccionable: true,
          procedencia: true,
          confirmadaAt: true,
          avisadaAt: true,
          avisadaPushAt: true,
          repiteCadaMeses: true,
          bienId: true,
          creadaAt: true,
        },
      })
      if (obligaciones.length > 0) {
        await tx.portalObligacion.deleteMany({ where: { identidadId: identidad.id, polizaDeclaradaId: id } })
      }

      const ahora = new Date()
      const { count } = await tx.portalPolizaDeclarada.updateMany({
        where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
        data: { eliminadaEn: ahora },
      })
      // 0 aquí solo puede ser una carrera (otra pestaña la quitó en medio): se DESHACE todo lo de
      // arriba lanzando, para no dejar partes desligados de una póliza que sigue viva.
      if (count === 0) throw new CarreraAlQuitar()

      await tx.portalPolizaDeclaradaHistorial.create({
        data: {
          polizaId: id,
          identidadId: identidad.id,
          accion: 'eliminada',
          antes: {
            ...fotoHistorial(suya),
            obligaciones: guardarObligaciones(obligaciones),
            partesDesligados: partes.map((p) => p.id),
          },
          despues: { eliminadaEn: ahora.toISOString() },
        },
      })

      return {
        estado: 200 as const,
        cuerpo: { ok: true, partesDesligados: partes.length, recuperable: true },
      }
    })
    .catch((e: unknown) => {
      if (e instanceof CarreraAlQuitar) return { estado: 404 as const, cuerpo: { error: 'no_encontrada' } }
      throw e
    })

  return NextResponse.json(resultado.cuerpo, { status: resultado.estado })
}

/** La póliza se quitó en otra pestaña entre la lectura y la marca: se revierte la transacción. */
class CarreraAlQuitar extends Error {}

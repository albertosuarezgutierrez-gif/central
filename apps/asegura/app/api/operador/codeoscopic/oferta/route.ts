import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { prisma } from '@/lib/tenant'
import { ErrorCodeoscopic } from '@/lib/codeoscopic/cliente'
import {
  resolverConfigEmision,
  refrescarProyecto,
  encontrarPrecio,
  reRate,
  actualizarFechaEfecto,
} from '@/lib/codeoscopic/emitir'
import { opcionesPorDefecto } from '@/lib/codeoscopic/opciones-producto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/operador/codeoscopic/oferta` — confirma con la compañía (ReRate)
 * el precio que ya se enseñó en pantalla desde una cotización REAL de
 * `seguros.tarificaciones`.
 *
 * 🚨 **Construida el 11/09/2026, sin sandbox y sin fixture del fabricante**
 * para esta operación (`docs/CODEOSCOPIC-API-PORTAL.md` solo la describe en
 * prosa). Un fallo aquí es SEGURO en dinero: `POST /insurances/{id}/offers`
 * no está documentado como facturable, y si el vendor rechaza el cuerpo con
 * 400/422 no ha tarificado nada — el mensaje del vendor viaja tal cual.
 *
 * Detrás de `CODEOSCOPIC_EMISION_ACTIVA`, NO del interruptor de tarificar: es
 * el primer paso de un compromiso de contrato, no una simple consulta.
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { tarificacionId, compania, categoria, confirmado: true }
 *
 * `tarificacionId` es el id de `seguros.tarificaciones` (la cabecera que
 * `guardarCotizacion` escribió al cotizar); `compania`/`categoria` identifican
 * QUÉ precio de esa cotización se confirma (p. ej. «Allianz» / «Terceros
 * Ampliado»), tal y como se enseñaron en la tabla de precios.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>

  if (cuerpo.confirmado !== true) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'sin_confirmar',
        mensaje:
          'Hay que mandar `confirmado: true` (booleano) para pedir el ReRate: es una llamada real ' +
          'a la compañía, sin sandbox, y no se dispara sin una confirmación explícita.',
      },
      { status: 400 },
    )
  }

  const tarificacionId = cadena(cuerpo.tarificacionId)
  const compania = cadena(cuerpo.compania)
  const categoria = cadena(cuerpo.categoria)
  if (!tarificacionId || !compania || !categoria) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'faltan tarificacionId, compania y categoria' },
      { status: 400 },
    )
  }

  // 🚨 Corrección MANUAL de la fecha de efecto (11/09/2026, cuarto 400 real):
  // el vendor la rechaza si está mal — p.ej. «más de 90 días en el futuro» — y
  // qué fecha poner es una decisión de negocio, nunca una suposición del
  // código. Opcional: sin ella, el ReRate usa la fecha ya guardada en el proyecto.
  const fechaEfectoCorregida = cadena(cuerpo.fechaEfectoCorregida)
  if (fechaEfectoCorregida && !/^\d{4}-\d{2}-\d{2}$/.test(fechaEfectoCorregida)) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'fechaEfectoCorregida tiene que ser aaaa-mm-dd' },
      { status: 400 },
    )
  }

  const filas = await prisma.$queryRaw<
    { correduria_id: string; project_id_codeoscopic: string | null; poliza_id: string | null }[]
  >`
    select correduria_id::text as correduria_id, project_id_codeoscopic, poliza_id::text as poliza_id
    from tarificaciones
    where id = ${tarificacionId}::uuid and simulado = false
  `
  const t = filas[0]
  if (!t || !t.project_id_codeoscopic) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje: 'no se encuentra esa cotización real (o es una simulada, que no se puede confirmar)',
      },
      { status: 404 },
    )
  }

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'apagado',
        mensaje: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}`,
      },
      { status: 503 },
    )
  }

  try {
    // GRATIS: recupera el `id` real del precio (el vendor no lo devuelve al
    // guardar la cotización en nuestra BD, solo el precio en euros) y de paso
    // el `insuranceLine` que exige el PATCH de abajo.
    let cotizacion = await refrescarProyecto(r.config, t.project_id_codeoscopic)

    // 🔬 Diagnóstico GRATIS (12/09/2026, octavo fallo real, mismo mensaje otra
    // vez): con el PATCH+reread ya en producción, el ReRate volvió a rechazar
    // por fecha. Antes de suponer un fallo nuevo hay que saber CUÁL de las dos
    // ramas se ejecutó — si `fechaEfectoCorregida` llegó vacía (p. ej. una
    // pestaña de plataforma abierta desde antes del PR #2732), esta rama ni
    // se entra y se re-tarifica sobre la fecha original sin tocar. Log, no
    // cambia comportamiento: se borra en cuanto de la respuesta.
    console.log(
      `[oferta] fechaEfectoCorregida recibida: ${fechaEfectoCorregida ? fechaEfectoCorregida : '(vacía — no se corrige nada)'}`,
    )

    if (fechaEfectoCorregida) {
      // GRATIS. El PATCH corrige effectiveDate pero el vendor exige
      // `insuranceLine` en el mismo cuerpo (quinto 400 real, 12/09/2026) —
      // se relee del proyecto, nunca se supone por ramo.
      await actualizarFechaEfecto(
        r.config,
        t.project_id_codeoscopic,
        fechaEfectoCorregida,
        cotizacion.insuranceLineId,
      )
      // 🚨 Sexto 400 real, mismo proyecto (12/09/2026): con el PATCH ya sin
      // fallos, el ReRate SIGUIÓ rechazando la fecha con el MISMO mensaje —
      // en `/insurances/{id}/offers`, no en el PATCH. `docs/CODEOSCOPIC-API-
      // PORTAL.md` avisa de que tocar un campo del proyecto DESPUÉS de
      // cotizar «invalida las cotizaciones anteriores (se re-tarifican)»: el
      // `precio.id` de la lectura de ARRIBA es de ANTES del PATCH, así que
      // se re-tarificaba una cotización ya invalidada. Se relee (GRATIS,
      // sigue siendo un `GET`) para que `encontrarPrecio` casé sobre el
      // proyecto YA corregido.
      cotizacion = await refrescarProyecto(r.config, t.project_id_codeoscopic)
      console.log(
        `[oferta] fechaEfecto del proyecto tras PATCH+reread: ${cotizacion.fechaEfecto ?? '(el vendor no la trae)'}`,
      )
    }

    const precio = encontrarPrecio(cotizacion, compania, categoria)
    if (!precio) {
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'otro',
          mensaje: `el proyecto ${t.project_id_codeoscopic} ya no trae un precio de «${compania}» / «${categoria}» — puede haber caducado`,
        },
        { status: 404 },
      )
    }

    // El vendor nunca devuelve `product.options` al cotizar (ver
    // `Precio.productOptions`), así que casi siempre hay que rellenarlas con
    // el catálogo estático por defecto — hoy solo cubre Allianz auto, ver
    // `opciones-producto.ts`. Para el resto sigue mandándose `[]` (dentro de
    // `reRate`) hasta que un 400 real diga qué le hace falta.
    const oferta = await reRate(
      r.config,
      t.project_id_codeoscopic,
      precio.id,
      precio.productId,
      precio.productOptions ?? opcionesPorDefecto(compania),
    )

    // Puente hacia `codeoscopic_projects`, que es lo que lee `registrarPolizaEmitida`
    // (D2) al acuñar la póliza. Esta cotización nació en `tarificaciones` (tabla
    // nueva del 03/09), así que hasta este ReRate no tenía fila ahí.
    await prisma.$executeRaw`
      insert into codeoscopic_projects (
        correduria_id, project_id_codeoscopic, producto, poliza_id, aseguradora,
        accepted_offer_id_codeoscopic, estado
      ) values (
        ${t.correduria_id}::uuid, ${t.project_id_codeoscopic}, 'auto'::tipo_seguro,
        ${t.poliza_id}::uuid, ${compania}, ${oferta.offerId}, 'preemision'
      )
      on conflict (correduria_id, project_id_codeoscopic) do update
        set poliza_id = coalesce(codeoscopic_projects.poliza_id, excluded.poliza_id),
            aseguradora = excluded.aseguradora,
            accepted_offer_id_codeoscopic = excluded.accepted_offer_id_codeoscopic,
            estado = 'preemision'
    `

    return NextResponse.json({ estado: 'ok', projectId: t.project_id_codeoscopic, oferta })
  } catch (e) {
    if (e instanceof ErrorCodeoscopic) {
      return NextResponse.json(
        { estado: 'error', causa: 'vendor', clase: e.clase, mensaje: e.message },
        { status: 502 },
      )
    }
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

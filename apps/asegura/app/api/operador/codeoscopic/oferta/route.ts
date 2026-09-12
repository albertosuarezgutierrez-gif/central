import { NextResponse } from 'next/server'
import { decryptField } from '@central/module-seguros-pii'
import { operadorAutorizado } from '@/lib/operador'
import { prisma } from '@/lib/tenant'
import { ErrorCodeoscopic } from '@/lib/codeoscopic/cliente'
import {
  resolverConfigEmision,
  refrescarProyecto,
  encontrarPrecio,
  reRate,
  actualizarFechaEfecto,
  completarPersonas,
  type ResultadoCompletar,
} from '@/lib/codeoscopic/emitir'
import { opcionesPorDefecto } from '@/lib/codeoscopic/opciones-producto'
import {
  interpretarError400,
  reparosDe,
  esCampoPersona,
  type CampoPersona,
} from '@/lib/codeoscopic/interprete-400'
import { partirDireccion } from '@/lib/codeoscopic/direccion'

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

  // Lo que el corredor teclea tras un `faltan_vendor`: solo campos de la PERSONA
  // que sabemos escribir en el proyecto (lista blanca), nunca claves arbitrarias.
  const correcciones = leerCorrecciones(cuerpo.correcciones)
  if (correcciones === null) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'correcciones tiene que ser un objeto {campo: texto} con campos de la persona' },
      { status: 400 },
    )
  }

  const filas = await prisma.$queryRaw<
    { correduria_id: string; project_id_codeoscopic: string | null; poliza_id: string | null; cliente_id: string | null }[]
  >`
    select correduria_id::text as correduria_id, project_id_codeoscopic,
           poliza_id::text as poliza_id, cliente_id::text as cliente_id
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

      // 🔬 Octavo fallo real (12/09/2026), evidencia YA recogida: con
      // `fechaEfectoCorregida` recibida correctamente (measured: llegó bien)
      // y el PATCH sin lanzar error, el reread INMEDIATO seguía devolviendo
      // la fecha ORIGINAL sin tocar (2027-09-10 en vez de 2026-09-12) — el
      // PATCH "tiene éxito" pero no se aplica, al menos no al instante.
      // Hipótesis a descartar GRATIS (sin gastar nada más): que el vendor
      // procese el PATCH de forma asíncrona y una relectura inmediata quede
      // desfasada por una ventana de segundos. Se comprueba con una segunda
      // relectura tras una pausa corta; si TAMBIÉN sale sin corregir, la
      // hipótesis async queda descartada y el PATCH de `effectiveDate` no
      // sirve de nada (haría falta re-cotizar de cero, con coste real).
      if (cotizacion.fechaEfecto !== fechaEfectoCorregida) {
        await new Promise((resolve) => setTimeout(resolve, 2500))
        const relectura = await refrescarProyecto(r.config, t.project_id_codeoscopic)
        console.log(
          `[oferta] fechaEfecto tras una 2ª relectura (+2,5s): ${relectura.fechaEfecto ?? '(el vendor no la trae)'}`,
        )
        if (relectura.fechaEfecto === fechaEfectoCorregida) cotizacion = relectura
      }
    }

    // ── Lo que el corredor ya tecleó (respuesta a un `faltan_vendor` anterior) ──
    // Se escribe en el proyecto ANTES del ReRate, gratis, y se verifica releyendo.
    if (Object.keys(correcciones).length > 0) {
      const c = await completarPersonas(r.config, t.project_id_codeoscopic, correcciones)
      if (c.estado === 'no_aplicado') return respuestaNoAplicado(c)
      cotizacion = c.cotizacion
    }

    // ── El bucle de reparación (12/09/2026) ─────────────────────────────────
    // Un 400 de validación del ReRate es GRATIS (`pruebaQueNoHuboCargo`) y
    // semi-estructurado: se traduce a nuestros campos, se busca el valor en la
    // FICHA (nunca se inventa) y, si la ficha lo tiene todo, se completa el
    // proyecto y se repite UNA vez. Lo que la ficha no tiene vuelve a la
    // pantalla como huecos (422 `faltan_vendor`), con lo que sí tenía como
    // `sugeridos`, para que el corredor lo teclee y esta ruta lo escriba.
    let oferta: Awaited<ReturnType<typeof reRate>> | null = null
    let reparadoDesdeFicha = false
    while (oferta === null) {
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

      try {
        // El vendor nunca devuelve `product.options` al cotizar (ver
        // `Precio.productOptions`), así que casi siempre hay que rellenarlas con
        // el catálogo estático por defecto — hoy solo cubre Allianz auto, ver
        // `opciones-producto.ts`. Para el resto sigue mandándose `[]` (dentro de
        // `reRate`) hasta que un 400 real diga qué le hace falta.
        oferta = await reRate(
          r.config,
          t.project_id_codeoscopic,
          precio.id,
          precio.productId,
          precio.productOptions ?? opcionesPorDefecto(compania),
        )
      } catch (e) {
        if (!(e instanceof ErrorCodeoscopic) || e.clase !== 'validacion') throw e
        const interp = interpretarError400(e.detalle)
        // Nada que reparar (ninguna línea se reconoce): sale como fallo del
        // vendor, con el texto entero, igual que hasta hoy.
        if (interp.campos.length === 0) throw e

        const pedidos = interp.campos.map((c) => c.campo).filter(esCampoPersona)
        const deFicha = reparadoDesdeFicha ? {} : await valoresDesdeFicha(t, pedidos)
        const cubiertos = Object.keys(deFicha)
        const todosSonDePersona = pedidos.length === interp.campos.length
        const fichaLoCubreTodo = todosSonDePersona && pedidos.length > 0 && pedidos.every((c) => cubiertos.includes(c))

        if (!fichaLoCubreTodo) {
          return NextResponse.json(
            {
              estado: 'faltan_vendor',
              projectId: t.project_id_codeoscopic,
              faltan: reparosDe(interp),
              sugeridos: deFicha,
              noReconocidos: interp.noReconocidos,
              mensaje: e.message,
            },
            { status: 422 },
          )
        }

        reparadoDesdeFicha = true
        const c = await completarPersonas(r.config, t.project_id_codeoscopic, deFicha)
        if (c.estado === 'no_aplicado') return respuestaNoAplicado(c)
        cotizacion = c.cotizacion
        // Y vuelta al ReRate, una sola vez: si vuelve a fallar por validación,
        // `reparadoDesdeFicha` ya no deja repararlo solo y sale como `faltan_vendor`.
      }
    }

    // 🚨 Noveno fallo real (12/09/2026): `uq_codeoscopic_projects_poliza` es un
    // índice ÚNICO parcial sobre `poliza_id` — solo UN proyecto puede tenerlo
    // enlazado a la vez. El flujo "Descartar y pedir precio de cero" (PR #2770)
    // crea un proyecto Codeoscopic NUEVO en cada reintento, pero el proyecto
    // VIEJO seguía reteniendo el `poliza_id` de la póliza que se está
    // retarificando — así que el segundo intento reventaba aquí con
    // `23505 unique_violation`, sin llegar siquiera a devolver el precio ya
    // confirmado por la compañía. Se libera el `poliza_id` de cualquier OTRO
    // proyecto de esta póliza que no haya llegado a emitirse: uno ya
    // `emitida` no se toca nunca, es un contrato real.
    if (t.poliza_id) {
      await prisma.$executeRaw`
        update codeoscopic_projects
        set poliza_id = null
        where correduria_id = ${t.correduria_id}::uuid
          and poliza_id = ${t.poliza_id}::uuid
          and project_id_codeoscopic <> ${t.project_id_codeoscopic}
          and estado <> 'emitida'
      `
    }

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

/** `null` = cuerpo mal formado. `{}` = no venían. Solo claves de la lista blanca. */
function leerCorrecciones(v: unknown): Partial<Record<CampoPersona, string>> | null {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const salida: Partial<Record<CampoPersona, string>> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!esCampoPersona(k)) return null
    const s = cadena(val)
    if (s !== null) salida[k] = s
  }
  return salida
}

function respuestaNoAplicado(c: Extract<ResultadoCompletar, { estado: 'no_aplicado' }>) {
  const lista = c.sinAplicar.map((x) => `${x.campo} (${x.papel})`).join(', ')
  return NextResponse.json(
    {
      estado: 'error',
      causa: 'patch_no_aplicado',
      sinAplicar: c.sinAplicar,
      mensaje:
        `El PATCH al proyecto no ha dado error pero, al releerlo, sigue sin traer: ${lista}. ` +
        'Es la misma trampa que effectiveDate: la única vía segura es pedir precio de cero (0,50€, puede variar).',
    },
    { status: 409 },
  )
}

/**
 * La cascada ANTES de preguntar al corredor: lo que ya está en la ficha.
 * Hoy solo la calle (`clientes.direccion`, cifrada, troceada con
 * `partirDireccion`): es el único dato que el ReRate pide y la cotización no.
 * El resto de campos de persona ya iban en el proyecto al cotizar, así que si
 * el vendor los echa en falta es que la ficha tampoco los tiene.
 * Nunca lanza: si la ficha no se puede leer, devuelve `{}` y se pregunta.
 */
async function valoresDesdeFicha(
  t: { correduria_id: string; poliza_id: string | null; cliente_id: string | null },
  pedidos: CampoPersona[],
): Promise<Partial<Record<CampoPersona, string>>> {
  if (!pedidos.includes('nombreVia')) return {}
  if (!t.cliente_id && !t.poliza_id) return {}
  try {
    const filas = await prisma.$queryRaw<{ direccion: string | null }[]>`
      select c.direccion
      from clientes c
      where c.correduria_id = ${t.correduria_id}::uuid
        and c.id = coalesce(
          ${t.cliente_id}::uuid,
          (select p.cliente_id from polizas p where p.id = ${t.poliza_id}::uuid limit 1)
        )
      limit 1
    `
    const cifrada = filas[0]?.direccion ?? null
    if (!cifrada) return {}
    let direccion: string | null
    try {
      direccion = decryptField(cifrada)
    } catch {
      return {}
    }
    const nombre = partirDireccion(direccion).nombre
    return nombre ? { nombreVia: nombre } : {}
  } catch {
    return {}
  }
}

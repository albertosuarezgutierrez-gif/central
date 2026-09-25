import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cuentaDeFicha, describirOrigenCuenta } from '@/lib/codeoscopic/cuenta-ficha'
import { ibanEnmascarado } from '@/lib/codeoscopic/emitir-iban'
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
  interpretarCamposProducto,
  lineasDelVendor,
  reparosDe,
  esCampoPersona,
  type CampoPersona,
  type CampoProducto,
} from '@/lib/codeoscopic/interprete-400'
import { valoresPersonaDesdeFicha } from '@/lib/codeoscopic/valores-ficha'
import { conLibroDeEmision, type GastoEmision } from '@/lib/codeoscopic/libro-emision'
import { RE_FECHA, RE_TELEFONO } from '@/lib/codeoscopic/persona'
import { fechaEfectoCaducada, reparoFechaCaducada, mensajeFechaCaducada, motivoFechaEfectoInvalida } from '@/lib/codeoscopic/fecha-efecto'
import { auditado } from '@/lib/auditoria'

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
export const POST = auditado(async (req: Request) => {
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
  // 📅 25/09/2026: la fecha nueva viaja en el ReRate (`mainQuote.effectiveDate`),
  // así que se valida con la MISMA regla que antes de pagar ([hoy, hoy+90]) —
  // un 400 aquí no gasta nada; uno del vendor, sí cuenta en el libro.
  if (fechaEfectoCorregida) {
    const motivo = motivoFechaEfectoInvalida(fechaEfectoCorregida)
    if (motivo) {
      return NextResponse.json(
        { estado: 'error', causa: 'otro', mensaje: `La fecha de efecto ${fechaEfectoCorregida} ${motivo}.` },
        { status: 400 },
      )
    }
  }

  // Lo que el corredor teclea tras un `faltan_vendor`: solo campos de la PERSONA
  // que sabemos escribir en el proyecto (lista blanca), nunca claves arbitrarias.
  const lectura = leerCorrecciones(cuerpo.correcciones)
  if ('error' in lectura) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: lectura.error }, { status: 400 })
  }
  const correcciones = lectura.valores

  // Lo que el corredor ha rellenado en el Product Form Library del vendor
  // (`ProductFormWidget`, montado sobre `precio.quoteCrudo`) tras un
  // `faltan_producto` anterior — el `product.options` REAL del ReRate, para
  // cualquier compañía. Sustituye ENTERO a `opcionesPorDefecto(compania)`
  // cuando llega: es más de fiar que el catálogo estático (solo Allianz, y
  // adivinado tras 3 errores reales) porque sale del formulario oficial.
  // Se reenvía TAL CUAL, sin interpretar su forma (igual que `productOptions`
  // en `respuesta.ts`): es Codeoscopic quien decide qué lleva cada opción.
  const productOptionsCorredor = Array.isArray(cuerpo.productOptions) ? cuerpo.productOptions : undefined

  // Quién pide el ReRate, para poder explicar la factura línea a línea (igual
  // que `solicitadoPor` en `cotizar()`).
  const actor = cadena(cuerpo.actor) ?? 'plataforma'

  const filas = await prisma.$queryRaw<
    {
      correduria_id: string
      project_id_codeoscopic: string | null
      poliza_id: string | null
      cliente_id: string | null
      producto: string | null
    }[]
  >`
    select t.correduria_id::text as correduria_id, t.project_id_codeoscopic,
           t.poliza_id::text as poliza_id, t.cliente_id::text as cliente_id,
           pol.tipo::text as producto
    from tarificaciones t
    left join polizas pol on pol.id = t.poliza_id
    where t.id = ${tarificacionId}::uuid and t.simulado = false
  `
  const t = filas[0]
  // Se captura en una const: `projectId` es una propiedad
  // mutable y TypeScript pierde el estrechamiento dentro de los callbacks que
  // usa el embudo del libro.
  const projectId = t?.project_id_codeoscopic ?? null
  if (!t || !projectId) {
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
    let cotizacion = await refrescarProyecto(r.config, projectId)

    // ── Fecha de efecto ya PASADA (13/09/2026, décimo 400 real) ────────────
    // El proyecto 40685666 se cotizó el 12/09 con efecto 12/09; al día
    // siguiente la compañía contestó al ReRate «The effective date cannot be
    // before today.» y `effectiveDate` es de solo lectura (ver
    // `actualizarFechaEfecto`): ese proyecto está muerto y ningún PATCH lo
    // resucita. Se detecta AQUÍ, sobre la relectura gratis de arriba y sin
    // llamar al ReRate, con el mismo 422 `faltan_vendor` que la pantalla ya
    // sabe pintar como «hay que descartar y pedir precio de cero». Si el
    // vendor no trae la fecha no se afirma nada: sigue el camino normal.
    // 📅 Desde el 25/09/2026 esto solo corta si NO viene fecha nueva: con ella,
    // el ReRate la manda en `mainQuote.effectiveDate` (la vía documentada) y es
    // el vendor quien dice si una cotización caducada se deja rescatar.
    if (fechaEfectoCaducada(cotizacion.fechaEfecto) && !fechaEfectoCorregida) {
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'faltan_vendor',
          projectId: projectId,
          faltan: [reparoFechaCaducada(cotizacion.fechaEfecto!)],
          sugeridos: {},
          noReconocidos: [],
          mensaje: mensajeFechaCaducada(cotizacion.fechaEfecto!, projectId),
        },
        { status: 422 },
      )
    }

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
        projectId,
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
      cotizacion = await refrescarProyecto(r.config, projectId)
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
        const relectura = await refrescarProyecto(r.config, projectId)
        console.log(
          `[oferta] fechaEfecto tras una 2ª relectura (+2,5s): ${relectura.fechaEfecto ?? '(el vendor no la trae)'}`,
        )
        if (relectura.fechaEfecto === fechaEfectoCorregida) cotizacion = relectura
      }
    }

    // ── Lo que el corredor ya tecleó (respuesta a un `faltan_vendor` anterior) ──
    // Se escribe en el proyecto ANTES del ReRate, gratis, y se verifica releyendo.
    // Lo que se ha escrito Y VERIFICADO en el proyecto durante esta petición. Si
    // el vendor lo vuelve a pedir, no es que falte: es que el PATCH no le vale
    // (la trampa de `effectiveDate`), y pedírselo otra vez al corredor sería
    // un bucle sin salida.
    const aplicados = new Set<CampoPersona>()
    if (Object.keys(correcciones).length > 0) {
      const c = await completarPersonas(r.config, projectId, correcciones)
      if (c.estado === 'no_aplicado') return respuestaNoAplicado(c)
      cotizacion = c.cotizacion
      for (const k of Object.keys(correcciones) as CampoPersona[]) aplicados.add(k)
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
      const precio = encontrarPrecio(cotizacion, compania, categoria, {
        producto: cadena(cuerpo.producto),
        primaEur: typeof cuerpo.primaEur === 'number' ? cuerpo.primaEur : null,
      })
      if (!precio) {
        return NextResponse.json(
          {
            estado: 'error',
            causa: 'otro',
            mensaje: `el proyecto ${projectId} ya no trae un precio de «${compania}» / «${categoria}» — puede haber caducado`,
          },
          { status: 404 },
        )
      }

      try {
        // El vendor nunca devuelve `product.options` al cotizar (ver
        // `Precio.productOptions`). Orden de preferencia: lo que el corredor
        // ha rellenado en el Product Form Library (el formulario REAL de la
        // compañía, para cualquiera) > lo que el propio precio ya trajera >
        // el catálogo estático por defecto (hoy solo Allianz auto, adivinado
        // tras 3 errores reales — ver `opciones-producto.ts`). Para el resto
        // sigue mandándose `[]` (dentro de `reRate`) hasta que un 400 real
        // diga qué le hace falta.
        //
        // 🚨 21/09/2026: el ReRate abre su PROPIA línea en
        // `seguros.codeoscopic_consumo` (`motivo: 'rerate'`). Hasta hoy no
        // escribía ninguna, así que `puedeCotizar()` no lo veía y el tope no
        // lo contaba — y el CRM de Manuel trata esta llamada como facturable y
        // `noRetry`. El coste va en una env y arranca en 0 (no está confirmado
        // que facture), pero la LÍNEA se abre igual: lo conservador es contarla.
        // Un 400 del vendor es `pruebaQueNoHuboCargo` y el embudo la descarta
        // con evidencia; un 5xx o un corte se quedan contados.
        const gasto = await conLibroDeEmision(
          { correduriaId: t.correduria_id, operacion: 'rerate', solicitadoPor: actor, projectId },
          () =>
            reRate(
              r.config,
              projectId,
              precio.id,
              precio.productId,
              productOptionsCorredor ?? precio.productOptions ?? opcionesPorDefecto(compania, t.producto),
              fechaEfectoCorregida,
            ),
        )
        if (!gasto.ok) return respuestaGastoBloqueado(gasto)
        oferta = gasto.valor
      } catch (e) {
        if (!(e instanceof ErrorCodeoscopic) || e.clase !== 'validacion') throw e
        const interp = interpretarError400(e.detalle)
        // Nada que reparar como campo de PERSONA. Antes de rendirse, ¿es un
        // hueco de `product.options` (formulario de la compañía, no de la
        // persona)? Si el corredor YA mandó unas opciones y el vendor las
        // sigue rechazando, no se vuelve a ofrecer el mismo formulario en
        // bucle: sale como fallo del vendor, igual que hasta hoy.
        if (interp.campos.length === 0) {
          const deProducto = productOptionsCorredor ? [] : interpretarCamposProducto(interp.lineas)
          if (deProducto.length > 0) {
            await registrarFaltaProducto(t.correduria_id, tarificacionId, deProducto)
            return NextResponse.json(
              {
                estado: 'faltan_producto',
                projectId: projectId,
                campos: deProducto.map((c) => c.campo),
                quoteCrudo: precio.quoteCrudo,
                mensaje: deProducto.map((c) => c.texto).join('\n'),
              },
              { status: 422 },
            )
          }
          throw e
        }

        const pedidos = interp.campos.map((c) => c.campo).filter(esCampoPersona)
        const yaEscritos = pedidos.filter((c) => aplicados.has(c))
        if (yaEscritos.length > 0) return respuestaSigueFaltando(yaEscritos, e.message)
        const deFicha = reparadoDesdeFicha ? {} : await valoresPersonaDesdeFicha(t, pedidos, r.config)
        const cubiertos = Object.keys(deFicha)
        const todosSonDePersona = pedidos.length === interp.campos.length
        const fichaLoCubreTodo = todosSonDePersona && pedidos.length > 0 && pedidos.every((c) => cubiertos.includes(c))

        if (!fichaLoCubreTodo) {
          return NextResponse.json(
            {
              estado: 'faltan_vendor',
              projectId: projectId,
              faltan: reparosDe(interp),
              sugeridos: deFicha,
              noReconocidos: interp.noReconocidos,
              mensaje: e.message,
            },
            { status: 422 },
          )
        }

        reparadoDesdeFicha = true
        const c = await completarPersonas(r.config, projectId, deFicha)
        if (c.estado === 'no_aplicado') return respuestaNoAplicado(c)
        cotizacion = c.cotizacion
        for (const k of Object.keys(deFicha) as CampoPersona[]) aplicados.add(k)
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
          and project_id_codeoscopic <> ${projectId}
          and estado <> 'emitida'
      `
    }

    // Puente hacia `codeoscopic_projects`, que es lo que lee `registrarPolizaEmitida`
    // (D2) al acuñar la póliza. Esta cotización nació en `tarificaciones` (tabla
    // nueva del 03/09), así que hasta este ReRate no tenía fila ahí.
    //
    // 🚨 `producto` sale de LA PÓLIZA (`t.producto`, `polizas.tipo`), no de un
    // literal: hasta el 12/09/2026 esto llevaba `'auto'` fijo, así que un
    // ReRate de hogar/RC dejaba esta fila de bookkeeping mintiendo sobre el
    // ramo (nadie la relee hoy para decidir nada, pero es el mismo fallo que
    // el resto del repo llama «basura con forma de dato»). Sin póliza enlazada
    // (`t.producto` NULL) cae a `'auto'` — el placeholder de siempre, nunca un
    // ramo inventado sobre datos que sí existen.
    await prisma.$executeRaw`
      insert into codeoscopic_projects (
        correduria_id, project_id_codeoscopic, producto, poliza_id, aseguradora,
        accepted_offer_id_codeoscopic, estado
      ) values (
        ${t.correduria_id}::uuid, ${projectId}, ${t.producto ?? 'auto'}::tipo_seguro,
        ${t.poliza_id}::uuid, ${compania}, ${oferta.offerId}, 'preemision'
      )
      on conflict (correduria_id, project_id_codeoscopic) do update
        set poliza_id = coalesce(codeoscopic_projects.poliza_id, excluded.poliza_id),
            producto = excluded.producto,
            aseguradora = excluded.aseguradora,
            accepted_offer_id_codeoscopic = excluded.accepted_offer_id_codeoscopic,
            estado = case when codeoscopic_projects.estado = 'emitida' then codeoscopic_projects.estado
                          else 'preemision'::codeoscopic_project_estado end
    `

    // La cuenta de cargo que YA conocemos del cliente (póliza, recibos de CIMA,
    // ficha), ENMASCARADA y con su origen, para que la pantalla la enseñe
    // ANTES del Submit: el Submit es el contrato, y con qué cuenta se domicilia
    // no puede ser una sorpresa del mensaje de «emitida». Gratis (BD).
    const cuenta = await cuentaDeFicha(t.correduria_id, t.poliza_id, t.cliente_id)
    return NextResponse.json({
      estado: 'ok',
      projectId: projectId,
      oferta,
      // TRES formas, no dos: la cuenta (enmascarada) · un aviso de por qué no
      // hay una utilizable (`ilegible` / `invalida` / `no_comprobada`) · null =
      // se miró y no hay ninguna guardada.
      cuenta: cuenta.iban
        ? { enmascarada: ibanEnmascarado(cuenta.iban), origen: cuenta.origen, descripcion: cuenta.origen ? describirOrigenCuenta(cuenta.origen) : null }
        : cuenta.aviso
          ? { aviso: cuenta.aviso }
          : null,
    })
  } catch (e) {
    if (e instanceof ErrorCodeoscopic) {
      // El corredor no tiene que leer JSON: si el vendor trae un `message`
      // legible (aunque sea un rechazo de negocio sin campo que rellenar,
      // como «Reale: NO SE PERMITEN POLIZAS CON MALUS»), se enseña ESE texto
      // en vez del `codeoscopic_validacion: {...}` recortado a 300 caracteres.
      const lineas = lineasDelVendor(e.message)
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'vendor',
          clase: e.clase,
          mensaje: lineas.length > 0 ? lineas.join(' · ') : e.message,
        },
        { status: 502 },
      )
    }
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
})

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * El libro dijo que no. **Sin llamada al vendor**, y por eso se contesta con
 * dos códigos distintos: se arreglan en sitios distintos.
 *
 * - `sin_libro` (503): no se ha podido leer `codeoscopic_consumo`. Es una
 *   avería nuestra y es fail-closed a propósito — un tope que no se puede
 *   comprobar no es un tope, y reintentar no lo arregla.
 * - `tope` (429): se ha llegado al límite de ReRates. Se sube la env o se
 *   espera; el precio sigue ahí.
 *
 * En los dos casos la frase dice que NO se ha confirmado nada con la compañía:
 * dejar la duda abierta mandaría al corredor a mirar el proyecto en Avant2 sin
 * motivo.
 */
function respuestaGastoBloqueado(gasto: Extract<GastoEmision<never>, { ok: false }>) {
  return NextResponse.json(
    {
      estado: 'error',
      causa: gasto.razon === 'tope' ? 'tope' : 'sin_libro',
      mensaje: `${gasto.mensaje} NO se ha llamado a la compañía: el precio no se ha confirmado.`,
    },
    { status: gasto.razon === 'tope' ? 429 : 503 },
  )
}

/**
 * Solo claves de la lista blanca y valores con la forma que el vendor acepta
 * (mismas reglas que `revisarPersona`): un municipio no numérico o una fecha
 * en formato español llegarían al PATCH y volverían como un 400 sin pista, o
 * como un 409 que manda a pagar 0,50€ por un dato mal tecleado.
 */
function leerCorrecciones(
  v: unknown,
): { valores: Partial<Record<CampoPersona, string>> } | { error: string } {
  if (v === undefined || v === null) return { valores: {} }
  if (typeof v !== 'object' || Array.isArray(v)) {
    return { error: 'correcciones tiene que ser un objeto {campo: texto}' }
  }
  const valores: Partial<Record<CampoPersona, string>> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!esCampoPersona(k)) return { error: `correcciones: «${k}» no es un campo de la persona que se pueda escribir` }
    const s = cadena(val)
    if (s === null) continue
    const mal = valorInvalido(k, s)
    if (mal) return { error: `correcciones.${k}: ${mal}` }
    valores[k] = s
  }
  return { valores }
}

function valorInvalido(campo: CampoPersona, s: string): string | null {
  switch (campo) {
    case 'municipioResidenciaId':
      return /^\d+$/.test(s) ? null : 'tiene que ser el id numérico del catálogo de municipios'
    case 'cpResidencia':
      return /^\d{5}$/.test(s) ? null : 'tiene que ser un código postal de 5 cifras'
    case 'fechaNacimiento':
    case 'fechaCarnet':
      return RE_FECHA.test(s) ? null : 'la fecha tiene que ser aaaa-mm-dd'
    case 'telefono':
      return RE_TELEFONO.test(s.replace(/\s/g, '')) ? null : 'tiene que ser un móvil español de 9 cifras'
    case 'sexo':
      return s === 'hombre' || s === 'mujer' ? null : 'tiene que ser «hombre» o «mujer»'
    default:
      return null
  }
}

function respuestaSigueFaltando(campos: CampoPersona[], mensajeVendor: string) {
  return NextResponse.json(
    {
      estado: 'error',
      causa: 'patch_no_aplicado',
      sinAplicar: campos.map((campo) => ({ campo, papel: 'holder' })),
      mensaje:
        `El proyecto ya trae ${campos.join(', ')} (escrito y comprobado en esta misma petición) y la compañía ` +
        `lo sigue pidiendo: el PATCH no le vale para este campo. La única vía segura es pedir precio de cero ` +
        `(0,50€, puede variar). Mensaje de la compañía: ${mensajeVendor}`,
    },
    { status: 409 },
  )
}

/**
 * Telemetría de `faltan_producto` por COMPAÑÍA (20/09/2026): saber a qué
 * compañías les falta cobertura del Product Form Library, no solo que
 * «alguna vez pasa». Reutiliza `seguros.operational_events` (genérica, ya
 * escrita por la ingesta de CIMA con `cima_pull_started/completed` y por el
 * webhook con `codeoscopic_webhook_invalid_payload`): no hace falta tabla ni
 * migración nueva. `source_event_id` es un UUID por llamada, no por
 * proyecto — el mismo proyecto puede repetir el mismo hueco.
 *
 * 🚨 Best-effort a propósito: un fallo al escribir la telemetría NUNCA puede
 * tirar el 422 que el corredor está esperando. Si falla, se traga en
 * silencio (no hay canal de aviso para "no se pudo contar una métrica").
 */
async function registrarFaltaProducto(correduriaId: string, tarificacionId: string, campos: CampoProducto[]) {
  try {
    await prisma.$executeRaw`
      insert into operational_events (
        event_name, source, source_event_id, correduria_id, cotizacion_id,
        missing_fields_count, payload
      ) values (
        'codeoscopic_oferta_faltan_producto', 'codeoscopic-oferta', ${randomUUID()},
        ${correduriaId}::uuid, ${tarificacionId}::uuid, ${campos.length},
        ${JSON.stringify({ compania: campos[0]?.compania ?? null, campos: campos.map((c) => c.campo) })}::jsonb
      )
    `
  } catch {
    // No bloquea nunca la respuesta al corredor. Sin canal de aviso: es una
    // métrica, no una operación de negocio.
  }
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
      crudo: c.crudo,
    },
    { status: 409 },
  )
}


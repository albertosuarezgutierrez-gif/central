import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { prisma } from '@/lib/tenant'
import { correduriaUnica } from '@/lib/cartera'
import { catalogoCompanias, registrarPolizaEmitida } from '@/lib/emision'
import {
  resolverConfigEmision,
  camposDeEmision,
  completarPersonas,
  leerProyectoCrudo,
  papelesDeLaMismaPersona,
  huecosPersonaParaEmitir,
  redactarCrudoVendor,
} from '@/lib/codeoscopic/emitir'
import { fechaEfectoCaducada, reparoFechaCaducada, mensajeFechaCaducada, fechaEfectoDeOferta } from '@/lib/codeoscopic/fecha-efecto'
import { consejoTrasFallo, intentoQuizaEmitido, rastroSolicitudEmision, solicitudViva, solicitudesEmision } from '@/lib/codeoscopic/reintento-emision'
import { enviarEmision } from '@/lib/codeoscopic/emitir-envio'
import {
  conCuentaBancaria,
  decidirCuentaEnvio,
  describirOrigenCuenta,
  esFalloDeCuentaBancaria,
  extraerIbanTecleado,
  ibanEnCampos,
  ibanEnmascarado,
  ibanValido,
} from '@/lib/codeoscopic/emitir-iban'
import { cuentaDeFicha, SIN_CUENTA } from '@/lib/codeoscopic/cuenta-ficha'
import { conProductoPorDefecto } from '@/lib/codeoscopic/opciones-producto'
import { documentoTomador, fraccionamientoDeOferta } from '@/lib/codeoscopic/importar'
import { computeDniLookupHash } from '@central/module-seguros-pii'
import { archivarDocumentoEmitido } from '@/lib/codeoscopic/archivar-documento'
import { trasEmisionConTope } from '@/lib/tras-emision'
import { interpretarError400, reparosDe, esCampoPersona, type Interpretacion, type CampoPersona } from '@/lib/codeoscopic/interprete-400'
import { valoresPersonaDesdeFicha } from '@/lib/codeoscopic/valores-ficha'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// ⏱️ Fila 5 (26/09/2026): el Submit lleva el reloj largo del vendor (150 s) y antes
// van lecturas de 15 s cada una. 240 deja que corte SIEMPRE el reloj del vendor,
// que sabe decir «sin confirmación», y no Vercel, que mata la función en seco.
export const maxDuration = 240

/**
 * `POST /api/operador/codeoscopic/emitir` — el Submit de verdad
 * (`POST /insurances/{id}/policy-applications`), y el acuñado en nuestra BD
 * si el vendor lo acepta.
 *
 * 🚨 **Construida el 11/09/2026, sin sandbox y sin fixture del fabricante.**
 * El propio portal avisa de que esta operación puede aceptar el producto
 * principal y fallar en los addons, sin decir cómo reanudarlo — por eso
 * `crudo` (la respuesta ENTERA del vendor) viaja siempre en la respuesta,
 * salga bien o mal. Detrás de `CODEOSCOPIC_EMISION_ACTIVA` y con un candado
 * de un solo intento por proyecto (`lib/codeoscopic/emitir.ts::enviarEmision`).
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { projectId, confirmado: true, campos?: Record<string, unknown>, cuentaConfirmada?: string }
 *   `reintentoConfirmado: true` solo tras un intento que acabó en 5xx/corte de red (ver 409
 *   `reintento_sin_confirmar`): el corredor ha mirado el proyecto y no hay póliza.
 *   `acunarExistente: true` cuando el proyecto YA cuenta una `policyApplication` aprobada con
 *   nº de póliza (`solicitudes[]` del 409): se acuña ESA en la cartera y NO se envía nada.
 *
 * `cuentaConfirmada` es la MÁSCARA (`ES91…1332`) de la cuenta de cargo que la
 * pantalla enseñó tras el ReRate (`/oferta` → `cuenta`). Sin ella, una cuenta
 * que la ficha ya conoce NO viaja: se contesta 422 pidiendo confirmarla o
 * teclear otra (`campos.iban`), ANTES de llamar al vendor. Dictado de Alberto
 * (12/09/2026): «iban importante siempre confirmar».
 *
 * `projectId` tiene que tener ya una oferta confirmada por
 * `POST .../oferta` (ReRate) — si no, se corta con 409 antes de llamar a
 * nadie. `campos` son los datos que pida `policy-application-fields` (se
 * consulta aquí mismo, gratis, y viaja en la respuesta de error si faltan).
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
          'Hay que mandar `confirmado: true` (booleano) para emitir de verdad: sin sandbox, esta ' +
          'llamada compromete un contrato real y no se dispara sin una confirmación explícita.',
      },
      { status: 400 },
    )
  }

  const projectId = cadena(cuerpo.projectId)
  if (!projectId) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: 'falta projectId' }, { status: 400 })
  }
  const camposCliente = esObjeto(cuerpo.campos) ? cuerpo.campos : {}
  const actor = cadena(cuerpo.actor) ?? 'plataforma'

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'no se ha podido resolver la correduría' },
      { status: 503 },
    )
  }

  const filas = await prisma.$queryRaw<
    {
      poliza_id: string | null
      aseguradora: string | null
      accepted_offer_id_codeoscopic: string | null
      estado: string | null
      error_mensaje: string | null
    }[]
  >`
    select poliza_id::text as poliza_id, aseguradora, accepted_offer_id_codeoscopic,
           estado::text as estado, error_mensaje
    from codeoscopic_projects
    where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
  `
  const p = filas[0]
  if (!p || !p.accepted_offer_id_codeoscopic || !p.aseguradora) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje:
          'este proyecto no tiene una oferta confirmada todavía: primero POST .../oferta (ReRate), ' +
          'y solo con esa respuesta en la mano se llama a esto.',
      },
      { status: 409 },
    )
  }
  if (!p.poliza_id) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje: 'este proyecto no está enlazado a ninguna póliza de la cartera: no se sabe de quién es',
      },
      { status: 409 },
    )
  }

  const polizas = await prisma.$queryRaw<
    { cliente_id: string; tipo: string; fraccionamiento: string | null; datos_especificos: unknown; dni_lookup_hash: string | null; sustituida: boolean }[]
  >`
    select pol.cliente_id::text as cliente_id, pol.tipo::text as tipo, pol.fraccionamiento::text as fraccionamiento,
           pol.datos_especificos, c.dni_lookup_hash,
           (pol.sustituida_at is not null or exists (select 1 from polizas s where s.poliza_origen_id = pol.id)) as sustituida
    from polizas pol join clientes c on c.id = pol.cliente_id
    where pol.id = ${p.poliza_id}::uuid and pol.correduria_id = ${correduria.id}::uuid
  `
  const poliza = polizas[0]
  if (!poliza) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'la póliza enlazada a este proyecto ya no existe' },
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


  const crudoPrevio = await leerProyectoCrudo(r.config, projectId).catch((e: unknown) => {
    console.log(`[emitir] no se pudo leer el proyecto ${projectId} antes del Submit —`, e instanceof Error ? e.message : String(e))
    return null
  })
  // ── Fail-closed ante un «quizá emitido» (13/09/2026, proyecto 40685793) ──
  // Si el proyecto YA cuenta una solicitud de emisión, no se manda otra: el
  // vendor no deduplica y un segundo Submit puede ser la segunda póliza del
  // mismo coche. Y si el ÚLTIMO intento acabó en 5xx o en corte de red —
  // «Unknown error while waiting for the operation to complete» — tampoco se
  // reenvía a ciegas: el corredor tiene que mirar el estado (aquí va el
  // proyecto crudo, gratis) y decirlo con `reintentoConfirmado: true`.
  // La póliza NUEVA se paga como diga la oferta aceptada (anual/semestral…), no como
  // pagaba la que sustituye; sin dato en el proyecto se conserva el de la vieja.
  const fraccionamientoAcunado =
    (crudoPrevio ? fraccionamientoDeOferta(crudoPrevio, p.accepted_offer_id_codeoscopic) : null) ?? poliza.fraccionamiento
  const rastro = crudoPrevio ? rastroSolicitudEmision(crudoPrevio) : []
  // La forma que el portal SÍ documenta: `policyApplications[]` con `status.id` y
  // `policyNumber`. Es la única reconciliación posible (no hay webhook real).
  const solicitudes = crudoPrevio ? solicitudesEmision(crudoPrevio) : []
  const viva = solicitudViva(solicitudes)
  const quizaEmitidoAntes = intentoQuizaEmitido(p.error_mensaje)
  const consejo = quizaEmitidoAntes ? consejoTrasFallo(p.error_mensaje) : null
  const cargaReintento = () => ({
    ultimoError: quizaEmitidoAntes ? p.error_mensaje : null,
    consejo: consejo?.texto ?? null,
    solicitudes,
    rastro: redactarCrudoVendor(rastro),
    proyectoLegible: crudoPrevio !== null,
    crudo: crudoPrevio ? redactarCrudoVendor(crudoPrevio) : null,
  })

  // ── La compañía YA aprobó una solicitud: se acuña ESA, no se envía otra ──
  // Es el caso del 500 «Unknown error while waiting»: Codeoscopic dejó de
  // esperar pero la solicitud siguió su curso en la compañía. Con nº de póliza
  // en `policyApplications[]` no hay nada que reenviar — se registra en la
  // cartera con ese número (mismo acuñado que el camino normal, sin Submit).
  if (cuerpo.acunarExistente === true) {
    const aprobada = solicitudes.find((s) => s.veredicto === 'aprobada')
    if (!aprobada) {
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'sin_solicitud_aprobada',
          mensaje: crudoPrevio
            ? 'El proyecto no cuenta ninguna solicitud APROBADA: no hay nada que acuñar.'
            : 'No se ha podido leer el proyecto en Codeoscopic: no se puede acuñar lo que no se ve.',
          ...cargaReintento(),
        },
        { status: 409 },
      )
    }
    const catalogoAc = await catalogoCompanias()
    const codigoDgsAc = catalogoAc?.find((c) => coincideCompania(c.nombreComun, p.aseguradora!))?.codigoDgs ?? null
    if (!codigoDgsAc) {
      return NextResponse.json(
        { estado: 'emitido_sin_acunar', mensaje: `«${p.aseguradora}» no tiene código DGS en companias_dgs: acúñala a mano${aprobada.numeroPoliza ? ` con el nº ${aprobada.numeroPoliza}` : ' (la compañía aún no ha dado número)'}.`, referenciaVendor: aprobada.numeroPoliza },
        { status: 200 },
      )
    }
    const acunadoAc = await registrarPolizaEmitida(correduria.id, {
      clienteId: poliza.cliente_id,
      actor,
      catalogo: catalogoAc ?? undefined,
      polizaOrigenId: p.poliza_id,
      proyecto: {
        projectIdCodeoscopic: projectId,
        producto: poliza.tipo,
        codigoDgs: codigoDgsAc,
        numeroPoliza: aprobada.numeroPoliza,
        primaAnual: numero(cuerpo.primaAnual),
        emitidaEn: aprobada.creadaEn ?? new Date().toISOString(),
        riesgo: esObjeto(poliza.datos_especificos) ? poliza.datos_especificos : null,
        fraccionamiento: fraccionamientoAcunado,
      },
    })
    console.log(
      `[emitir] proyecto ${projectId}: solicitud ${aprobada.id ?? '?'} ya aprobada por la compañía (póliza ${aprobada.numeroPoliza ?? 'sin número'}) — ` +
        (acunadoAc.ok ? 'acuñada sin reenviar' : `NO acuñada: ${acunadoAc.motivo}`),
    )
    // Best-effort: el PDF de la póliza puede venir ya en `issuedDocuments[]` del
    // proyecto que se acaba de leer (`crudoPrevio`) — sin gastar un GET extra.
    const archivadoAc = acunadoAc.ok
      ? await archivarDocumentoEmitido(r.config, { correduriaId: correduria.id, polizaId: acunadoAc.polizaId, crudo: crudoPrevio })
      : { documentoGuardado: null, avisoDocumento: null }
    // Baja de la anterior abierta YA y correo al cliente (la pulsación de «Emitir» es su OK).
    const trasAc = acunadoAc.ok ? await trasEmisionConTope(correduria.id, { clienteId: poliza.cliente_id, polizaOrigenId: p.poliza_id }) : null
    return NextResponse.json({
      estado: acunadoAc.ok ? 'ok' : 'emitido_sin_acunar',
      trasEmision: trasAc,
      // Aquí no se ha enviado nada: si no se acuña, el motivo real es lo único útil.
      ...(acunadoAc.ok ? {} : { mensaje: `La compañía ya tiene la póliza${aprobada.numeroPoliza ? ` nº ${aprobada.numeroPoliza}` : ''} pero no se ha podido registrar en la cartera: ${acunadoAc.motivo}` }),
      referenciaVendor: aprobada.numeroPoliza,
      acunado: acunadoAc,
      cuenta: null,
      documentoGuardado: archivadoAc.documentoGuardado,
      avisoDocumento: archivadoAc.avisoDocumento,
      crudo: redactarCrudoVendor(crudoPrevio),
    })
  }

  // Con una solicitud VIVA en la compañía no hay reintento que valga: ni con
  // `reintentoConfirmado` (un cliente viejo, o un POST directo al puerto, no
  // pueden mandar la «segunda póliza del mismo coche»). Solo sin ninguna viva
  // decide el corredor.
  if (viva !== null || ((rastro.length > 0 || quizaEmitidoAntes) && cuerpo.reintentoConfirmado !== true)) {
    console.log(
      `[emitir] proyecto ${projectId}: ${rastro.length > 0 ? `ya cuenta una solicitud (${rastro.map((r) => r.ruta).join(', ')})` : 'el último Submit acabó sin respuesta clara'} y no hay confirmación de reintento — no se envía`,
    )
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'reintento_sin_confirmar',
        mensaje:
          (viva
            ? `La compañía ya tiene una solicitud ${viva.veredicto === 'aprobada' ? 'APROBADA' : 'en curso'} de este proyecto${viva.numeroPoliza ? ` (póliza ${viva.numeroPoliza})` : ''}. `
            : rastro.length > 0
              ? 'El proyecto YA cuenta una solicitud de emisión en Codeoscopic. '
              : 'El último envío de este proyecto acabó sin respuesta clara del vendor, así que NO se sabe si la compañía llegó a emitir. ') +
          'No se reenvía a ciegas: comprueba el estado del proyecto (abajo va tal cual lo devuelve Codeoscopic; ' +
          'si no cuenta ninguna solicitud, mira también Avant2) y, solo si no hay póliza, confirma el reintento.',
        ...cargaReintento(),
      },
      { status: 409 },
    )
  }


  // ── Póliza ya sustituida por otra: no se emite una segunda encima (26/09/2026) ──
  // Solo en el camino del Submit: acuñar una solicitud ya aprobada (arriba) no manda nada nuevo.
  if (poliza.sustituida) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'esta póliza ya está sustituida por otra: no se emite una segunda encima' },
      { status: 409 },
    )
  }

  // ── El tomador del proyecto sigue siendo el cliente de la póliza (26/09/2026) ──
  // Un proyecto hecho en la web de Avant2 (import, fila 13) se puede editar allí
  // después de importarlo. Si el DNI del tomador ya no es el de la ficha, no se
  // emite: sería el contrato de otra persona colgado de esta póliza. Solo corta
  // cuando los DOS hashes existen y difieren — sin dato en un lado no se afirma.
  const docTomador = crudoPrevio ? documentoTomador(crudoPrevio) : null
  const hashTomador = docTomador ? computeDniLookupHash(docTomador) : null
  if (hashTomador && poliza.dni_lookup_hash && hashTomador !== poliza.dni_lookup_hash) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje: 'el tomador del proyecto en Avant2 ya no es el cliente de esta póliza (DNI distinto): no se emite',
      },
      { status: 409 },
    )
  }

  // ── La cuenta bancaria del Submit (duodécimo 400 real, 12/09/2026) ────────
  // Orden: lo tecleado en plataforma (`campos.iban`) > lo que ya viniera en
  // `payment.bankAccount.iban` > lo que YA sabemos del cliente (`cuentaDeFicha`:
  // póliza, recibos de CIMA, ficha, recibos de otras pólizas). Nunca se
  // inventa: si no está en ningún sitio, se manda sin ella y, si la compañía
  // la exige, su 400 vuelve como hueco `iban` (más abajo).
  const { iban: ibanTecleado, resto: camposBase } = extraerIbanTecleado(camposCliente)
  const ibanJson = ibanEnCampos(camposBase)
  // Lo que venga de una persona se valida ANTES de gastar el único intento de
  // Submit: el tecleado en la caja y también el del JSON avanzado.
  const ibanHumano = ibanTecleado ?? ibanJson
  if (ibanHumano !== null && !ibanValido(ibanHumano)) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'faltan_campos',
        mensaje: `El IBAN ${ibanTecleado !== null ? 'tecleado' : 'del JSON avanzado'} (${ibanEnmascarado(ibanHumano)}) no pasa los dígitos de control: revísalo.`,
        faltan: ['iban'],
        campos: null,
      },
      { status: 422 },
    )
  }
  const ficha = ibanHumano === null ? await cuentaDeFicha(correduria.id, p.poliza_id, poliza.cliente_id) : SIN_CUENTA
  const decision = decidirCuentaEnvio({ ibanTecleado, ibanJson, ficha, cuentaConfirmada: cuerpo.cuentaConfirmada })
  if (decision.tipo === 'confirmar') {
    // La ficha tiene cuenta y nadie la ha confirmado: se pide ANTES de gastar
    // el único intento de Submit. No es un fallo del vendor ni un hueco
    // vacío: es un dato que existe y que el corredor tiene que ver y aprobar.
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'faltan_campos',
        mensaje:
          `Confirma la cuenta de cargo ${ibanEnmascarado(decision.iban)} (${describirOrigenCuenta(decision.origen)}) ` +
          'o teclea otra: la cuenta del recibo no se manda sin confirmarla. No se ha emitido nada.',
        faltan: ['iban'],
        campos: null,
        cuenta: {
          enmascarada: ibanEnmascarado(decision.iban),
          origen: decision.origen,
          descripcion: describirOrigenCuenta(decision.origen),
        },
        confirmar: true,
      },
      { status: 422 },
    )
  }
  const ibanEnvio = decision.tipo === 'enviar' ? decision.iban : null
  const cuentaRespuesta =
    decision.tipo === 'enviar'
      ? {
          enmascarada: ibanEnmascarado(decision.iban),
          origen: decision.origen,
          descripcion:
            decision.origen === 'tecleada'
              ? 'la cuenta tecleada en plataforma'
              : decision.origen === 'json_avanzado'
                ? 'la cuenta del JSON avanzado'
                : describirOrigenCuenta(decision.origen),
        }
      : null
  // `forzar`: la precedencia ya está decidida aquí, y así lo que viaja va normalizado.
  const camposEnvio = ibanEnvio ? conCuentaBancaria(camposBase, ibanEnvio, true) : camposBase

  // 🚨 14º 400/500 real (17/09/2026, proyecto 40685793): el Submit exige su
  // PROPIO `product.options` — consentimientos legales del tomador, DISTINTOS
  // del `product.options` del ReRate (comisiones/dtos) — y nunca se mandaba.
  // Confirmado por Juan Manuel Fernández (Codeoscopic): los dos 500 «Unknown
  // error while waiting…» del 13/09 no eran un fallo del vendor, era este
  // hueco (`opciones-producto.ts`, `conProductoPorDefecto`). Solo se rellena
  // si NADIE ya puso `product` (JSON avanzado del corredor manda).
  // `familiaEnAllianz`: el corredor confirma explícitamente que el tomador YA
  // tiene familiares asegurados en Allianz (bonificación real) — nunca se
  // asume por defecto, ver comentario de `conProductoPorDefecto`.
  const camposConProducto = conProductoPorDefecto(camposEnvio, p.aseguradora, {
    familiaAllianz: cuerpo.familiaEnAllianz === true,
  })

  // GRATIS: lo que el vendor dice que hace falta. Informativo — no bloquea el
  // Submit si no se pudo leer (un endpoint sin fixture puede tener otra forma
  // de la que se ha adivinado); lo que sí decide si algo faltaba de verdad es
  // la respuesta del propio Submit.
  const campos = await camposDeEmision(r.config, projectId, p.accepted_offer_id_codeoscopic).catch(
    () => null,
  )
  // Sin fixture del fabricante para esta lectura: se deja constancia de qué
  // devuelve (ids y si son obligatorios, nunca valores) para saber si algún
  // día puede pintar los huecos ella sola en vez de descubrirlos por 400.
  console.log(
    `[emitir] policy-application-fields de ${projectId}: ` +
      (campos === null ? 'no se pudo leer' : campos.map((c) => `${c.id}${c.obligatorio ? '*' : ''}`).join(', ') || '(vacío)'),
  )
  // `iban` ya no es una clave de primer nivel (viaja en `payment.bankAccount`):
  // si el vendor lo listara con ese id, contarlo como ausente dejaría la
  // pantalla pidiendo un IBAN que ya está puesto, sin salida.
  const faltan = (campos ?? [])
    .filter((c) => c.obligatorio && !(c.id in camposConProducto) && !(c.id === 'iban' && ibanEnvio))
    .map((c) => c.id)
  if (faltan.length > 0) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'faltan_campos',
        mensaje: 'el vendor pide estos campos para emitir y no han llegado en `campos`',
        faltan,
        campos,
      },
      { status: 422 },
    )
  }

  // ── Reparación PREVIA de la persona (13/09/2026) — GRATIS, antes del intento ─
  // Los 7 proyectos pagados de Pilar Franco Ruz nacieron sin correo, y por el
  // camino de los 400 el correo solo se descubría DESPUÉS de gastar el Submit.
  // Aquí se lee el proyecto (`GET`, gratis), se mira qué le falta a la persona
  // de lo que el Submit exige (`huecosPersonaParaEmitir`) y se completa por
  // PATCH desde la ficha (gratis, con relectura). Lo que la ficha no tenga sale
  // como `faltan_vendor` SIN haber enviado nada: el corredor lo teclea, el
  // ReRate lo escribe (`/oferta` aplica `correcciones`) y se vuelve a Emitir.
  // Es también donde se fija la forma de `emails[]` (ver `completarPersonas`).
  if (p.estado === 'emitida') {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'ya_emitida',
        mensaje: `El proyecto ${projectId} ya consta como EMITIDO en nuestra BD: no se envía otro Submit.`,
      },
      { status: 409 },
    )
  }

  if (crudoPrevio) {
    // Fecha de efecto ya PASADA (13/09/2026): la compañía no emite con una
    // fecha de efecto anterior a hoy y el proyecto no la deja cambiar — el
    // mismo cepo que `/oferta`, aquí sobre la lectura gratis previa al Submit.
    // El intento NO se gasta.
    // 📅 25/09/2026: la fecha se mueve en el ReRate, así que manda la de la
    // OFERTA aceptada si el crudo la trae; si no, la del proyecto (lo de siempre).
    const fechaEfectoProyecto =
      fechaEfectoDeOferta(crudoPrevio, p.accepted_offer_id_codeoscopic) ?? cadena(crudoPrevio.effectiveDate)
    if (fechaEfectoCaducada(fechaEfectoProyecto)) {
      console.log(`[emitir] proyecto ${projectId} con fecha de efecto pasada (${fechaEfectoProyecto}): no se envía nada`)
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'faltan_vendor',
          mensaje: `Antes de enviar: ${mensajeFechaCaducada(fechaEfectoProyecto!, projectId)} NO se ha enviado nada.`,
          faltan: [reparoFechaCaducada(fechaEfectoProyecto!)],
          sugeridos: {},
          noReconocidos: [],
          crudo: null,
        },
        { status: 422 },
      )
    }
    const huecos = huecosPersonaParaEmitir(crudoPrevio)
    if (huecos.length > 0) {
      const pedidos = huecos.map((h) => h.campo)
      console.log(`[emitir] a la persona del proyecto ${projectId} le falta para emitir: ${pedidos.join(', ')}`)
      const deFicha = await valoresPersonaDesdeFicha(
        { correduria_id: correduria.id, poliza_id: p.poliza_id, cliente_id: poliza.cliente_id },
        pedidos,
        r.config,
      )
      const sinCubrir = pedidos.filter((c) => !Object.prototype.hasOwnProperty.call(deFicha, c))
      if (sinCubrir.length > 0) {
        return NextResponse.json(
          {
            estado: 'error',
            causa: 'faltan_vendor',
            mensaje:
              'Antes de enviar: al proyecto le faltan datos de la persona que la compañía exige para emitir ' +
              `(${sinCubrir.join(', ')}) y la ficha no los tiene. NO se ha enviado nada. Rellénalos y confirma el ` +
              'precio otra vez: se escriben en el proyecto sin coste.',
            faltan: huecos.map((h) => ({
              campo: h.campo,
              motivo: `la compañía lo exige para emitir (${h.papeles.join(', ')}) y el proyecto no lo tiene`,
            })),
            sugeridos: deFicha,
            noReconocidos: [],
            crudo: null,
          },
          { status: 422 },
        )
      }
      const c = await completarPersonas(r.config, projectId, deFicha)
      if (c.estado === 'no_aplicado') {
        const lista = c.sinAplicar.map((x) => `${x.campo} (${x.papel})`).join(', ')
        return NextResponse.json(
          {
            estado: 'error',
            causa: 'patch_no_aplicado',
            sinAplicar: c.sinAplicar,
            mensaje:
              `Antes de enviar: el PATCH al proyecto no ha dado error pero, al releerlo, sigue sin traer: ${lista}. ` +
              'NO se ha enviado nada (el intento de Submit no se ha gastado). El vendor no acepta ese campo por ' +
              'PATCH con ninguna de las formas conocidas: `crudo` enseña cómo devuelve la persona.',
            crudo: c.crudo,
          },
          { status: 409 },
        )
      }
      console.log(`[emitir] persona del proyecto ${projectId} completada antes del Submit: ${Object.keys(deFicha).join(', ')}`)
    }
  }

  let envio = await enviarEmision(r.config, {
    correduriaId: correduria.id,
    projectId,
    offerId: p.accepted_offer_id_codeoscopic,
    campos: camposConProducto,
    producto: poliza.tipo,
    solicitadoPor: actor,
    reintentoConfirmado: cuerpo.reintentoConfirmado === true,
  })

  // ── 13º 400 real (12/09/2026): el Submit exige campos de PERSONA (email,
  // calle) que el ReRate no pedía — «policy-application-fields devuelve lo que
  // hace falta PARA COTIZAR, no para EMITIR» (docs/CODEOSCOPIC-API-PORTAL.md).
  // Se repara UNA vez, igual que `/oferta` con la calle: interpreta el 400 →
  // si TODO lo que falta es un campo de persona, la ficha lo tiene Y
  // `completarPersonas` va a poder escribirlo en TODOS los papeles que el
  // vendor pidió → PATCH gratis (que relee y comprueba campo a campo) →
  // repite el Submit. El candado ya libera `submit_in_flight_at` en el fallo
  // (`cerrarEnvio`), así que este segundo intento no choca con el «un solo
  // intento en vuelo»: es la reparación de un 400 ya resuelto, no un segundo
  // envío a ciegas. Si la ficha no cubre algo, algún papel pedido no es
  // reparable, o el PATCH no cuaja, se rinde en el siguiente bloque — NUNCA
  // un tercer intento.
  //
  // `interp`/`deFicha` se guardan para el bloque de abajo: si NO se reintenta
  // (nada cambió), recalcularlos ahí sería la misma consulta a la ficha (con
  // descifrado PII) dos veces por el mismo motivo. Se invalidan si SÍ hay
  // reintento, porque entonces `envio.mensaje` puede ser un 400 distinto.
  let interpPrevio: Interpretacion | null = null
  let deFichaPrevio: Partial<Record<CampoPersona, string>> | null = null
  if (!envio.ok && envio.razon === 'vendor' && !esFalloDeCuentaBancaria(envio.mensaje)) {
    const interp = interpretarError400(envio.mensaje)
    interpPrevio = interp
    const pedidos = interp.campos.map((c) => c.campo).filter(esCampoPersona)
    const todosSonDePersona = interp.campos.length > 0 && pedidos.length === interp.campos.length
    if (todosSonDePersona) {
      const deFicha = await valoresPersonaDesdeFicha(
        { correduria_id: correduria.id, poliza_id: p.poliza_id, cliente_id: poliza.cliente_id },
        pedidos,
        r.config,
      )
      deFichaPrevio = deFicha
      const fichaLoCubreTodo = pedidos.every((c) => Object.prototype.hasOwnProperty.call(deFicha, c))
      // 🚨 `completarPersonas` solo escribe en `holder` + los papeles del
      // `risk` con el MISMO DNI que el tomador (`papelesDeLaMismaPersona`).
      // Si el vendor pide el campo para un `owner`/`primaryDriver` con OTRO
      // DNI (coche de empresa, vehículo familiar…), el PATCH ni lo intenta y
      // el Submit fallaría IGUAL una segunda vez — comprobarlo antes evita
      // gastar un segundo intento real (no sandboxed) en algo que ya se sabe
      // que no puede funcionar.
      const todosCubribles =
        fichaLoCubreTodo &&
        (await (async () => {
          const crudo = await leerProyectoCrudo(r.config, projectId)
          const cubribles = new Set(['holder', ...papelesDeLaMismaPersona(crudo)])
          return interp.campos.every((c) => c.papeles.every((papel) => cubribles.has(papel)))
        })())
      if (fichaLoCubreTodo && todosCubribles) {
        const c = await completarPersonas(r.config, projectId, deFicha)
        if (c.estado === 'no_aplicado') {
          const lista = c.sinAplicar.map((x) => `${x.campo} (${x.papel})`).join(', ')
          return NextResponse.json(
            {
              estado: 'error',
              causa: 'patch_no_aplicado',
              sinAplicar: c.sinAplicar,
              mensaje:
                `El PATCH al proyecto no ha dado error pero, al releerlo, sigue sin traer: ${lista}. ` +
                'El Submit que dio pie a esta reparación YA se envió y la compañía lo rechazó (ese intento ' +
                'real está gastado); esta reparación gratuita no ha cuajado, así que NO se ha reintentado un ' +
                'segundo Submit. Es la misma trampa que effectiveDate: el PATCH no vale para este campo — la ' +
                'única vía segura es pedir precio de cero (0,50€, puede variar).',
              crudo: c.crudo,
            },
            { status: 409 },
          )
        }
        envio = await enviarEmision(r.config, {
          correduriaId: correduria.id,
          projectId,
          offerId: p.accepted_offer_id_codeoscopic,
          campos: camposConProducto,
          producto: poliza.tipo,
          solicitadoPor: actor,
          // El primer intento acabó en 400 (rechazo, no «quizá emitido»), así
          // que el candado deja pasar; el flag viaja igual por coherencia.
          reintentoConfirmado: cuerpo.reintentoConfirmado === true,
        })
        interpPrevio = null
        deFichaPrevio = null
      }
    }
  }

  if (!envio.ok) {
    // ── El LIBRO dijo que no, y no se ha enviado nada (21/09/2026) ─────────
    // Dos códigos distintos porque se arreglan en sitios distintos:
    // `sin_libro` (503) es una avería nuestra —no se ha podido leer
    // `codeoscopic_consumo` y un tope que no se puede comprobar no es un
    // tope—, y `tope` (429) es el límite de Submits, que se sube por env o se
    // espera. Lo que NO puede pasar es que se lean como un rechazo del vendor:
    // ahí el corredor iría a mirar Avant2 buscando una póliza que no existe.
    if (envio.razon === 'sin-libro' || envio.razon === 'tope') {
      return NextResponse.json(
        {
          estado: 'error',
          causa: envio.razon === 'tope' ? 'tope' : 'sin_libro',
          mensaje: envio.mensaje,
          quizaEmitido: false,
        },
        { status: envio.razon === 'tope' ? 429 : 503 },
      )
    }
    // «The bank account is mandatory according to the selected companies and
    // payment types.» — no es un fallo del vendor: es un dato que falta. Se
    // devuelve como hueco para que plataforma pinte la caja del IBAN. Si YA se
    // mandó una cuenta y la compañía sigue pidiéndola, se dice cuál (enmascarada)
    // para que nadie crea que no viajó.
    if (envio.razon === 'vendor' && esFalloDeCuentaBancaria(envio.mensaje)) {
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'faltan_campos',
          mensaje: ibanEnvio
            ? `La compañía exige cuenta bancaria para esta forma de pago y se le mandó ${ibanEnmascarado(ibanEnvio)}` +
              `${cuentaRespuesta ? ` (${cuentaRespuesta.descripcion})` : ''}, ` +
              'pero la sigue pidiendo: revisa la respuesta completa (`crudo`) antes de repetir.'
            : ficha.aviso === 'ilegible'
              ? 'La compañía exige una cuenta bancaria (IBAN) para esta forma de pago. La ficha TIENE una cuenta ' +
                'guardada pero no se ha podido descifrar (clave PII de central-asegura): tecléala aquí para emitir, ' +
                'y revisa la clave — no se ha emitido nada.'
              : ficha.aviso === 'invalida'
                ? 'La compañía exige una cuenta bancaria (IBAN) para esta forma de pago. La ficha tiene una cuenta ' +
                  'guardada que no es un IBAN válido (CCC antiguo o errata): tecléala y vuelve a emitir — no se ha emitido nada.'
                : ficha.aviso === 'no_comprobada'
                  ? 'La compañía exige una cuenta bancaria (IBAN) para esta forma de pago y NO se ha podido leer la ficha ' +
                    'del cliente para buscarla: tecléala y vuelve a emitir — no se ha emitido nada.'
                  : 'La compañía exige una cuenta bancaria (IBAN) para esta forma de pago, y ni la póliza ni la ficha ' +
                    'del cliente la tienen. Tecléala y vuelve a emitir: no se ha emitido nada.',
          faltan: ['iban'],
          campos: null,
          cuenta: cuentaRespuesta ?? (ficha.aviso ? { aviso: ficha.aviso } : null),
          crudo: redactarCrudoVendor(envio.crudo) ?? null,
        },
        { status: 422 },
      )
    }
    // El resto de campos de persona que el 400 pida y la ficha NO tenga (o
    // que el intérprete no reconozca) se enseñan enteros — es un hallazgo,
    // como en `/oferta`, no un fallo que se calle. `sugeridos` es lo que la
    // ficha SÍ pudo dar (aunque no cubriera todo): ahorra teclear lo que ya
    // se sabe. No hay reintento automático de aquí en adelante.
    if (envio.razon === 'vendor') {
      // Reutiliza lo ya calculado arriba si no hubo reintento (mismo mensaje):
      // sin esto se repetiría la consulta a la ficha —con descifrado PII— por
      // el mismo motivo. Si SÍ hubo reintento, `envio.mensaje` es un 400
      // distinto y `interpPrevio`/`deFichaPrevio` ya se invalidaron arriba.
      const interp = interpPrevio ?? interpretarError400(envio.mensaje)
      if (interp.campos.length > 0) {
        const pedidos = interp.campos.map((c) => c.campo).filter(esCampoPersona)
        const sugeridos =
          deFichaPrevio ??
          (await valoresPersonaDesdeFicha(
            { correduria_id: correduria.id, poliza_id: p.poliza_id, cliente_id: poliza.cliente_id },
            pedidos,
            r.config,
          ))
        return NextResponse.json(
          {
            estado: 'error',
            causa: 'faltan_vendor',
            mensaje: redactarCrudoVendor(envio.mensaje),
            faltan: reparosDe(interp),
            sugeridos,
            noReconocidos: interp.noReconocidos,
            crudo: redactarCrudoVendor(envio.crudo) ?? null,
          },
          { status: 422 },
        )
      }
    }
    return NextResponse.json(
      {
        estado: 'error',
        causa: envio.razon,
        mensaje: redactarCrudoVendor(envio.mensaje),
        // Un 5xx del Submit no es un rechazo: Codeoscopic dejó de esperar a la
        // compañía y no se sabe si emitió. La pantalla lo dice y el siguiente
        // intento exige `reintentoConfirmado` (ver arriba).
        quizaEmitido: envio.razon === 'vendor' && intentoQuizaEmitido(envio.mensaje),
        // Lo que el portal manda hacer con ESE código: 500 → reportar; 502/503/504 → reintentar.
        consejo: envio.razon === 'vendor' ? (consejoTrasFallo(envio.mensaje)?.texto ?? null) : null,
        // El candado en SQL (`bloquearEnvio`) ha visto lo que la lectura de
        // arriba no pudo (carrera entre dos peticiones): mismo contrato de 409.
        ...(envio.razon === 'quiza-emitido'
          ? { causa: 'reintento_sin_confirmar', ...cargaReintento(), ultimoError: p.error_mensaje }
          : {}),
        ...(envio.razon === 'ya-emitida' ? { causa: 'ya_emitida' } : {}),
      },
      { status: envio.razon === 'vendor' ? 502 : 409 },
    )
  }

  // ── El vendor aceptó: se acuña la póliza en NUESTRA BD ──────────────────
  // Persiste la respuesta CRUDA del Submit (incluido `issuedDocuments[]`, si
  // el vendor lo manda aquí) en `quote_data` — hasta el 17/09/2026 se
  // descartaba tras esta petición y no había forma de saber qué documentos
  // había devuelto una emisión ya pasada. Best-effort: nunca bloquea el acuñado.
  // 🚨 SIEMPRE `redactarCrudoVendor` antes de guardar: `crudo` trae IBAN/DNI/
  // email/teléfono del tomador en texto plano (`quote`/`payment`/persona), y
  // `quote_data` es jsonb sin cifrar (a diferencia de `clientes.iban/dni`).
  await prisma.$executeRaw`
    update codeoscopic_projects set quote_data = ${JSON.stringify(redactarCrudoVendor(envio.crudo))}::jsonb
    where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
  `.catch((e: unknown) => {
    console.log(`[emitir] no se pudo guardar quote_data del proyecto ${projectId} —`, e instanceof Error ? e.message : String(e))
  })

  const catalogo = await catalogoCompanias()
  const codigoDgs = catalogo?.find((c) => coincideCompania(c.nombreComun, p.aseguradora!))?.codigoDgs ?? null
  if (!codigoDgs) {
    // El vendor YA aceptó el Submit: esto NO se pierde. Se deja constancia del
    // aviso y de la respuesta cruda para que se acuñe a mano — un dato de
    // nuestro catálogo que falta no puede borrar una emisión real.
    return NextResponse.json({
      estado: 'emitido_sin_acunar',
      mensaje:
        `Codeoscopic aceptó la emisión pero «${p.aseguradora}» no tiene código DGS en companias_dgs: ` +
        'la póliza NO se ha acuñado sola. Añade el código y acúñala a mano con este `crudo`.',
      referenciaVendor: envio.referenciaVendor,
      crudo: redactarCrudoVendor(envio.crudo),
    })
  }

  const acunado = await registrarPolizaEmitida(correduria.id, {
    clienteId: poliza.cliente_id,
    actor,
    catalogo: catalogo ?? undefined,
    polizaOrigenId: p.poliza_id,
    proyecto: {
      projectIdCodeoscopic: projectId,
      producto: poliza.tipo,
      codigoDgs,
      numeroPoliza: envio.referenciaVendor,
      primaAnual: numero(cuerpo.primaAnual),
      emitidaEn: new Date().toISOString(),
      riesgo: esObjeto(poliza.datos_especificos) ? poliza.datos_especificos : null,
      fraccionamiento: fraccionamientoAcunado,
    },
  })

  // Best-effort: el propio Submit puede traer ya `issuedDocuments[]` en su
  // respuesta (`envio.crudo`) — se descarga y archiva sin gastar otro GET.
  // Un fallo aquí nunca deshace el acuñado que ya se hizo arriba.
  const archivado = acunado.ok
    ? await archivarDocumentoEmitido(r.config, { correduriaId: correduria.id, polizaId: acunado.polizaId, crudo: envio.crudo })
    : { documentoGuardado: null, avisoDocumento: null }

  // Baja de la anterior abierta YA y correo al cliente (la pulsación de «Emitir» es su OK). Después
  // del archivado: si el PDF ha llegado, el cliente ya lo encuentra al entrar.
  const tras = acunado.ok ? await trasEmisionConTope(correduria.id, { clienteId: poliza.cliente_id, polizaOrigenId: p.poliza_id }) : null

  return NextResponse.json({
    estado: acunado.ok ? 'ok' : 'emitido_sin_acunar',
    trasEmision: tras,
    referenciaVendor: envio.referenciaVendor,
    acunado,
    // Con qué cuenta se ha emitido (enmascarada) y de dónde salió: la póliza
    // nueva se cobrará ahí, y eso tiene que verse sin abrir el `crudo`.
    cuenta: cuentaRespuesta,
    documentoGuardado: archivado.documentoGuardado,
    avisoDocumento: archivado.avisoDocumento,
    crudo: redactarCrudoVendor(envio.crudo),
  })
})

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}


function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function coincideCompania(nombreComun: string, aseguradora: string): boolean {
  const a = nombreComun.trim().toLowerCase()
  const b = aseguradora.trim().toLowerCase()
  return a === b || a.includes(b) || b.includes(a)
}

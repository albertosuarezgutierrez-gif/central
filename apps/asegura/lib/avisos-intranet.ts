/**
 * El emisor GENÉRICO de la intranet: un correo cuando el cliente tiene algo
 * esperándole en su área de clientes.
 *
 * ── 🚨 La decisión de diseño que lo hace genérico ───────────────────────────
 *
 * **No hay cola de notificaciones.** Este emisor no espera a que nadie encole
 * nada: DERIVA lo que hay que avisar del mismo catálogo que pinta la campana del
 * portal, `avisosDe()` de `@central/module-seguros-portal`. Consecuencia buscada:
 * el día que la campana aprenda a avisar de algo nuevo —un recibo devuelto, una
 * revisión de extintores, un documento que falta— **sale por correo sin tocar
 * este fichero**. Con una cola habría que acordarse de encolar en cada sitio, y
 * el que se olvidara no rompería nada: simplemente, ese aviso no saldría nunca.
 *
 * Y de paso, lo que el cliente ve dentro y lo que le llega por correo no pueden
 * divergir, porque es la misma función.
 *
 * ── 🚨 Por qué vive aquí y no en el portal ──────────────────────────────────
 *
 * La de siempre en esta app: el portal guarda **solo hashes** del canal
 * (`portal_canal.valor_hash`) y su rol no tiene GRANT sobre el email cifrado de
 * la cartera. Un hash no se revierte — desde allí no hay destinatario. Esta app
 * corre con `prisma_seguros` y sí lee `cliente_emails`.
 *
 * ── Los cerrojos, los mismos que el cron de vencimientos ────────────────────
 *
 *   1. Sin `CRON_SECRET` no se autoriza a nadie, tampoco en desarrollo.
 *   2. **Modo cuenta por defecto**: sin `ASEGURA_AVISOS_ACTIVOS === '1'` no sale
 *      ni un correo, se cuenta y se informa. Se comparte interruptor con el cron
 *      de vencimientos a propósito: es UN solo «¿escribimos ya a clientes?».
 *   3. Una obligación de póliza del volcado histórico no es candidata (lo
 *      garantiza el propio portal al crearlas, y se vuelve a filtrar aquí).
 *
 * ── Y lo que NO se hace ─────────────────────────────────────────────────────
 *
 * 🚨 **Si una de las fuentes de un cliente no se puede leer, a ese cliente NO se
 * le escribe en esta pasada.** Es la regla de la casa: un correo que dice «tienes
 * 2 avisos» cuando en realidad hay 5 es peor que no mandarlo, porque el cliente
 * entra, resuelve dos y se va tranquilo. Se cuenta en `ilegibles` y se reintenta
 * en la pasada siguiente.
 */
import { estadoPeticion, DIAS_VENTANA_AVISO } from '@central/module-seguros-portal'
import { WHERE_CARTERA_VIVA, leerSitio, textoReparoSitio } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { avisosActivos, destinatarioDeCliente, esSoloContar } from './avisos-vencimiento'
import { cuerpoAvisosIntranet, enviarAvisosIntranet } from './correo-avisos-intranet'
import { avisosNuevos, claveAviso, enlacePortal, type Pendiente } from './avisos-intranet-reglas'

const MS_DIA = 86_400_000

export type ResumenAvisosIntranet = {
  /** Clientes con al menos un aviso nuevo (sin sellar). */
  clientes: number
  /** Avisos nuevos en total. */
  avisos: number
  /** Correos aceptados por el proveedor. En modo cuenta es siempre 0. */
  enviados: number
  /** Clientes con avisos y sin dirección utilizable (o de baja de correo). */
  sinCanal: number
  /** Clientes con destinatario a los que el proveedor rechazó el mensaje. */
  fallidos: number
  /** Clientes a los que NO se escribe porque alguna de sus fuentes no se pudo leer. */
  ilegibles: number
  /** true = no se ha enviado nada, solo se ha contado. */
  soloContar: boolean
}

function nombreDe(c: { nombre: string | null; apellidos: string | null } | null | undefined): string | null {
  if (!c) return null
  const n = `${c.nombre ?? ''}`.trim()
  return n === '' ? null : n
}

/**
 * Reúne, por cliente, las fuentes del catálogo. Una consulta por fuente (no
 * una por cliente): con 80 clientes vivos el bucle N+1 sería gratuito igual, pero
 * el día que la cartera crezca esto ya está bien escrito.
 *
 * Lanza si alguna consulta falla — quien llama lo convierte en 503. Es
 * deliberado: «hoy no tocaba nadie» y «no he podido mirar» no pueden dar la
 * misma respuesta.
 */
export async function reunirPendientes(correduriaId: string, hoy: Date): Promise<Pendiente[]> {
  const db = prismaAsegura()
  const limiteVentana = new Date(hoy.getTime() + DIAS_VENTANA_AVISO * MS_DIA)

  const pendienteSinAceptar = { correduriaId, aceptadoEn: null, revocadoEn: null, caducaEn: { gt: hoy } }

  const [autorizaciones, aInvitados, peticiones, obligaciones] = await Promise.all([
    // Solo las que la campana puede llegar a enseñar: sin aceptar y sin revocar.
    //
    // 🚨 `autorizado_cliente_id` es NULLABLE en la BD desde el 04/09/2026 (se
    // puede autorizar a una IDENTIDAD del portal que no es cliente de nadie),
    // pero el modelo Prisma lo declara obligatorio — leer una de esas filas
    // aquí reventaría la pasada ENTERA y ese día no se avisaría a nadie. Hoy
    // son 0 filas, así que el fallo sería el día que Alberto invite al primer
    // no-cliente. Se parte en dos consultas en vez de arreglar el modelo
    // porque `lib/cartera-relaciones.ts` también lo lee como obligatorio y eso
    // es otro cambio; aquí NO se lee esa columna cuando es nula.
    db.portalAutorizacion.findMany({
      where: { ...pendienteSinAceptar, autorizadoClienteId: { not: null } },
      select: { id: true, otorganteClienteId: true, autorizadoClienteId: true },
    }),
    // Las que apuntan a una identidad invitada: del otorgante sí hay que avisar
    // («X aún no ha aceptado tu acceso»). Al invitado no: no tiene ficha en la
    // cartera, o sea no hay correo al que escribirle desde aquí.
    db.portalAutorizacion.findMany({
      where: { ...pendienteSinAceptar, autorizadoClienteId: null },
      select: { id: true, otorganteClienteId: true },
    }),
    db.portalPeticionAcceso.findMany({
      where: {
        correduriaId,
        destinatarioClienteId: { not: null },
        concedidaEn: null,
        rechazadaEn: null,
        retiradaEn: null,
        caducaEn: { gt: hoy },
      },
      select: {
        id: true,
        destinatarioClienteId: true,
        solicitanteClienteId: true,
        creadaEn: true,
        caducaEn: true,
        concedidaEn: true,
        rechazadaEn: true,
        retiradaEn: true,
      },
    }),
    // La ventana exacta la decide el módulo; aquí solo se acota para no traerlo todo.
    db.portalObligacion.findMany({
      where: {
        avisadaAt: null,
        polizaId: { not: null },
        fechaAccionable: { gte: new Date(hoy.getTime() - MS_DIA), lte: limiteVentana },
      },
      select: { id: true, titulo: true, fechaAccionable: true, polizaId: true },
    }),
  ])

  // Las fichas que intervienen, de una vez: nombre para el saludo y, en las
  // autorizaciones, el nombre del OTRO, que es lo que la campana pinta.
  const ids = new Set<string>()
  for (const a of autorizaciones) {
    ids.add(a.otorganteClienteId)
    if (a.autorizadoClienteId) ids.add(a.autorizadoClienteId)
  }
  for (const a of aInvitados) ids.add(a.otorganteClienteId)
  for (const p of peticiones) {
    if (p.destinatarioClienteId) ids.add(p.destinatarioClienteId)
    if (p.solicitanteClienteId) ids.add(p.solicitanteClienteId)
  }

  // Obligación → póliza → cliente. `portal_obligacion` no tiene relación
  // declarada con la póliza, así que se resuelve en dos pasos. Se re-filtra por
  // cartera viva: sin eso, un error aguas arriba son 28.728 avisos de pólizas
  // de 2013-2018.
  const polizaIds = obligaciones.map((o) => o.polizaId).filter((x): x is string => x !== null)
  const polizas =
    polizaIds.length === 0
      ? []
      : await db.poliza.findMany({
          where: { id: { in: polizaIds }, correduriaId, ...WHERE_CARTERA_VIVA, mergedIntoPolizaId: null },
          select: { id: true, clienteId: true },
        })
  const clientePorPoliza = new Map(polizas.map((p) => [p.id, p.clienteId]))
  for (const c of clientePorPoliza.values()) ids.add(c)

  // 🚨 La cuarta fuente NO parte de una fila pendiente: los reparos de la
  // dirección hay que IR A MIRARLOS ficha por ficha. Por eso se acota a la
  // CARTERA VIVA (80 fichas hoy) y no a `clientes` (32.600): las otras 32.520
  // son leads de un volcado de 2013-2018, y escribirles «revisa tu dirección»
  // no sería un aviso de su intranet — sería un mailing a gente que no tiene
  // intranet.
  const titularesVivos = new Set(
    (
      await db.poliza.findMany({
        where: { correduriaId, ...WHERE_CARTERA_VIVA, mergedIntoPolizaId: null },
        select: { clienteId: true },
        distinct: ['clienteId'],
      })
    ).map((p) => p.clienteId),
  )
  for (const c of titularesVivos) ids.add(c)

  const fichas =
    ids.size === 0
      ? []
      : await db.cliente.findMany({
          where: { id: { in: [...ids] }, correduriaId, mergedIntoClienteId: null },
          select: {
            id: true,
            nombre: true,
            apellidos: true,
            codigoPostal: true,
            ciudad: true,
            provincia: true,
          },
        })
  const fichaPorId = new Map(fichas.map((f) => [f.id, f]))

  const por = new Map<string, Pendiente>()
  const dame = (clienteId: string): Pendiente => {
    const ya = por.get(clienteId)
    if (ya) return ya
    const nuevo: Pendiente = {
      clienteId,
      nombre: nombreDe(fichaPorId.get(clienteId)),
      autorizaciones: { otorgadas: [], recibidas: [] },
      obligaciones: [],
      peticiones: [],
      datos: [],
    }
    por.set(clienteId, nuevo)
    return nuevo
  }

  for (const a of autorizaciones) {
    // Solo fichas de ESTA correduría y no fusionadas: una lápida no recibe correo.
    const otorgante = fichaPorId.get(a.otorganteClienteId)
    const autorizado = a.autorizadoClienteId === null ? undefined : fichaPorId.get(a.autorizadoClienteId)
    const comun = {
      id: a.id,
      estado: 'pendiente' as const,
      otorganteNombre: nombreDe(otorgante),
      autorizadoNombre: nombreDe(autorizado),
    }
    if (otorgante) dame(a.otorganteClienteId).autorizaciones.otorgadas.push(comun)
    if (autorizado && a.autorizadoClienteId) dame(a.autorizadoClienteId).autorizaciones.recibidas.push(comun)
  }

  for (const a of aInvitados) {
    if (!fichaPorId.has(a.otorganteClienteId)) continue
    dame(a.otorganteClienteId).autorizaciones.otorgadas.push({
      id: a.id,
      estado: 'pendiente',
      otorganteNombre: nombreDe(fichaPorId.get(a.otorganteClienteId)),
      // Sin ficha no hay nombre, y el catálogo dice «La persona invitada». No
      // se inventa uno: el correo del invitado vive hasheado en el portal.
      autorizadoNombre: null,
    })
  }

  for (const p of peticiones) {
    if (!p.destinatarioClienteId || !fichaPorId.has(p.destinatarioClienteId)) continue
    // El estado lo decide el módulo sobre las cuatro fechas, no el `where`: una
    // sin resolver que ya pasó su fecha está caducada, no pendiente.
    const estado = estadoPeticion(
      {
        creadaEn: p.creadaEn,
        concedidaEn: p.concedidaEn,
        rechazadaEn: p.rechazadaEn,
        retiradaEn: p.retiradaEn,
        caducaEn: p.caducaEn,
      },
      hoy,
    )
    dame(p.destinatarioClienteId).peticiones.push({
      id: p.id,
      estado,
      solicitanteNombre: p.solicitanteClienteId ? nombreDe(fichaPorId.get(p.solicitanteClienteId)) : null,
    })
  }

  for (const o of obligaciones) {
    const clienteId = o.polizaId ? clientePorPoliza.get(o.polizaId) : undefined
    if (!clienteId || !fichaPorId.has(clienteId)) continue
    dame(clienteId).obligaciones.push({ id: o.id, titulo: o.titulo, fechaAccionable: o.fechaAccionable })
  }

  // El MISMO juicio que pinta la ficha del corredor (`leerSitio`), para que las
  // dos pantallas no discrepen sobre si un dato está bien. `[]` = las columnas
  // concuerdan; un reparo es un dato guardado que no cuadra, nunca un hueco.
  for (const f of fichas) {
    if (!titularesVivos.has(f.id)) continue
    const { reparos } = leerSitio({ codigoPostal: f.codigoPostal, ciudad: f.ciudad, provincia: f.provincia })
    if (reparos.length === 0) continue
    dame(f.id).datos.push(...reparos.map((r) => ({ tipo: r.tipo, texto: textoReparoSitio(r) })))
  }

  return [...por.values()]
}

/**
 * Una pasada. Devuelve el resumen; **lanza** si falta el proveedor de correo o
 * el portal, porque «no he podido» no puede leerse como «hoy no tocaba nadie».
 */
export async function avisarIntranet(
  correduriaId: string,
  opciones: { hoy?: Date; forzarContar?: boolean } = {},
): Promise<ResumenAvisosIntranet> {
  const hoy = opciones.hoy ?? new Date()
  const soloContar = esSoloContar({ activos: avisosActivos(), forzarContar: opciones.forzarContar ?? false })

  const enlace = enlacePortal()
  if (!enlace) throw new Error('sin_portal')

  const db = prismaAsegura()
  const pendientes = await reunirPendientes(correduriaId, hoy)

  const resumen: ResumenAvisosIntranet = {
    clientes: 0,
    avisos: 0,
    enviados: 0,
    sinCanal: 0,
    fallidos: 0,
    ilegibles: 0,
    soloContar,
  }

  for (const p of pendientes) {
    const sellos = await db.portalAvisoEnviado.findMany({
      where: { clienteId: p.clienteId },
      select: { clave: true },
    })
    const cuenta = avisosNuevos(p, hoy, new Set(sellos.map((s) => s.clave)))
    if (cuenta === null) {
      resumen.ilegibles += 1
      continue
    }
    const { nuevos, total } = cuenta
    if (nuevos.length === 0) continue

    resumen.clientes += 1
    resumen.avisos += nuevos.length

    // El destinatario sale SIEMPRE de la ficha, nunca de un parámetro.
    const ficha = await db.cliente.findFirst({
      where: { id: p.clienteId, correduriaId },
      select: {
        emailOptOutAt: true,
        email: true,
        emails: { select: { email: true, esPrincipal: true, createdAt: true } },
      },
    })
    const destino = ficha ? destinatarioDeCliente(ficha) : null
    if (!destino) {
      resumen.sinCanal += 1
      continue
    }

    if (soloContar) continue

    const resultado = await enviarAvisosIntranet(destino, {
      nombre: p.nombre,
      avisos: nuevos.map((a) => ({ tipo: a.tipo })),
      // El TOTAL de su campana, no el de los nuevos: si no, un correo que dice
      // «tienes 1 aviso» sobre una campana que marca 4 manda a resolver uno y
      // deja los otros tres donde estaban.
      total,
      enlace,
    })
    if (resultado === 'sin_proveedor') throw new Error('sin_correo_configurado')
    if (resultado !== 'enviado') {
      resumen.fallidos += 1
      continue
    }
    resumen.enviados += 1

    // El sello va INMEDIATAMENTE después del envío aceptado: es lo único que
    // impide que la pasada de mañana mande lo mismo otra vez. `skipDuplicates`
    // porque dos pasadas solapadas podrían intentar sellar la misma clave.
    try {
      await db.portalAvisoEnviado.createMany({
        data: nuevos.map((a) => ({
          correduriaId,
          clienteId: p.clienteId,
          clave: claveAviso(a),
          tipo: a.tipo,
        })),
        skipDuplicates: true,
      })
    } catch (e) {
      console.error(
        '[asegura/avisos-intranet] ENVIADO PERO NO SELLADO para el cliente',
        p.clienteId,
        e instanceof Error ? e.message : e,
      )
    }
  }

  return resumen
}

/** Se re-exportan para quien ya los importaba de aquí: el cuerpo (ensayo sin
 *  enviar) y las reglas puras, que ahora viven en `avisos-intranet-reglas.ts`. */
export { cuerpoAvisosIntranet }
export { avisosNuevos, claveAviso, enlacePortal }
export type { Pendiente }

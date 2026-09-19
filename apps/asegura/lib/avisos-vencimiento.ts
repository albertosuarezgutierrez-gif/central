/**
 * Aviso de vencimiento del calendario del portal — el ENVÍO, que vive aquí y no
 * en `apps/asegura-portal`.
 *
 * 🚨 Por qué aquí: el portal guarda **solo hashes**. `portal_canal.valor_hash` es
 * un SHA-256 con pimienta y el `ClienteEmail` de su schema solo declara
 * `email_lookup_hash`; su rol (`prisma_asegura_portal`) ni siquiera puede leer la
 * columna del email. Un hash no se revierte: desde el portal **no hay
 * destinatario al que escribir**. El panel del corredor corre con
 * `prisma_seguros` (BYPASSRLS) y sí lee `cliente_emails` cifrado, así que el
 * correo sale de aquí y el portal se queda con el aviso en pantalla.
 *
 * Cuatro reglas que no se negocian:
 *   1. La ventana y la fecha accionable las decide `@central/module-seguros-portal`
 *      (`entraEnVentana`, `DIAS_VENTANA_AVISO`). Aquí NO se hace aritmética de
 *      fechas de negocio: duplicarla es cómo se acaba avisando el día equivocado.
 *   2. **Modo cuenta por defecto.** Sin `ASEGURA_AVISOS_ACTIVOS === '1'` NO sale
 *      ni un correo: se cuenta y se informa. Un cron de avisos no se estrena a
 *      ciegas sobre una cartera ya cargada.
 *   3. El destinatario sale SIEMPRE de la fila de la obligación (su póliza → su
 *      cliente → sus emails). Nunca de un parámetro de la petición.
 *   4. `avisada_at` se sella INMEDIATAMENTE tras un envío aceptado: es lo único
 *      que impide que un reintento del cron mande el mismo aviso dos veces.
 *
 * Y la de siempre: **ninguna póliza del volcado histórico avisa**. Las
 * obligaciones ya nacen filtradas por `import_ref IS NULL` en el portal, pero el
 * filtro se repite aquí porque este es el proceso que gasta la bandeja del
 * cliente. Sin él, un error aguas arriba son 28.729 «se te venció el seguro» de
 * pólizas de 2013-2018.
 *
 * 🚨 **Y desde el 19/09/2026, si el TOMADOR no tiene ninguna dirección propia,
 * el correo se manda a su PERSONA DE REFERENCIA** — dictado de Alberto viendo
 * «Instituto Studium» y «Grupo ELCA 83» en «Clientes sin canal»: «suele tener
 * persona de contacto… es la persona de referencia sobre esta póliza». Mismas
 * dos fuentes que la pantalla `clientes-sin-canal.ts` (su propio dato colgado
 * de la póliza, un interviniente ajeno de la MISMA póliza, o un allegado
 * declarado en `cliente_relaciones`), decididas por `emailAlternativo()` de
 * `@central/module-seguros`. El correo a un tercero SIEMPRE dice de qué
 * tomador es la póliza y con qué rol se dirige a él — nunca se manda como si
 * fuera al propio tomador.
 */
import { createMailTransporter } from '@central/core-email'
import { decryptField } from '@central/module-seguros-pii'
import {
  emailAlternativo,
  etiquetaRol,
  POLIZA_ESTADOS_VIGENTES,
  WHERE_CARTERA_VIVA,
  remitenteCorreo,
  type IntervinienteFicha,
} from '@central/module-seguros'
import { DIAS_VENTANA_AVISO, entraEnVentana } from '@central/module-seguros-portal'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { textoAviso, type ParaTercero } from './texto-vencimiento'

const MS_DIA = 86_400_000

export type ResumenAvisos = {
  /** Obligaciones que TOCA avisar hoy (en ventana, sin sellar, no del volcado). */
  candidatas: number
  /** Correos aceptados por el proveedor. En modo cuenta es siempre 0. */
  enviados: number
  /** De los `enviados`, cuántos fueron a la PERSONA DE REFERENCIA porque el
   *  tomador no tenía ninguna dirección propia. Subconjunto de `enviados`,
   *  no aparte: sigue siendo un envío aceptado, solo que a otro destinatario. */
  enviadosATercero: number
  /** Candidatas sin dirección utilizable: ni póliza viva, ni email legible, ni
   *  persona de referencia con email, o baja de correo. */
  sinCanal: number
  /** Candidatas con destinatario que el proveedor rechazó. */
  fallidos: number
  /** true = no se ha enviado nada, solo se ha contado. */
  soloContar: boolean
}

/**
 * El interruptor, puro y aparte para poder razonarlo de un vistazo: cualquier
 * valor que no sea exactamente `'1'` (incluido `undefined`, `'true'` o `'0'`)
 * deja el cron en modo cuenta. La ambigüedad se resuelve hacia NO enviar.
 */
export function avisosActivos(env: string | undefined = process.env.ASEGURA_AVISOS_ACTIVOS): boolean {
  return env === '1'
}

/** `?contar=1` fuerza el ensayo aunque los avisos estén activos. */
export function esSoloContar(p: { activos: boolean; forzarContar: boolean }): boolean {
  return p.forzarContar || !p.activos
}

/** Medianoche UTC: las columnas `date` de Postgres llegan así. */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Descifra sin convertir un fallo en una ausencia silenciosa: `null` significa
 * «no se ha podido leer», y quien llama lo cuenta como «sin canal» en vez de
 * como «este cliente no tiene email». Mismo criterio que `lib/cartera-ficha.ts`.
 */
function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v.trim()
  try {
    const claro = decryptField(v)
    return typeof claro === 'string' && claro.trim() !== '' && !claro.startsWith('v1:') ? claro.trim() : null
  } catch {
    return null
  }
}

/** Una dirección que no tiene forma de dirección no es un canal: es basura con forma de dato. */
function pareceEmail(v: string | null): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

type ClienteConEmails = {
  emailOptOutAt: Date | null
  email: string | null
  emails: { email: string; esPrincipal: boolean; createdAt: Date }[]
}

/**
 * El email al que escribir: principal → el más antiguo de `cliente_emails` → la
 * columna suelta de la ficha. `null` = no hay a quién escribir (o está de baja).
 */
export function destinatarioDeCliente(c: ClienteConEmails): string | null {
  // Baja de correo: no se le escribe, y no es un fallo. Es un «no».
  if (c.emailOptOutAt) return null
  const orden = [...c.emails].sort((a, b) => {
    if (a.esPrincipal !== b.esPrincipal) return a.esPrincipal ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
  for (const e of orden) {
    const claro = descifrar(e.email)
    if (pareceEmail(claro)) return claro
  }
  const suelto = descifrar(c.email)
  return pareceEmail(suelto) ? suelto : null
}

// ── Persona de referencia (19/09/2026) ───────────────────────────────────────
// Solo se consultan estas dos fuentes cuando `destinatarioDeCliente()` de la
// ficha del tomador ya ha dado `null` — es un puñado de candidatas por pasada,
// no el grueso del cron.

/**
 * Los intervinientes de ESTA póliza, ya descifrados, en la forma que espera
 * `contactoEfectivo()`. Copia deliberadamente acotada de `leerIntervinientes`
 * de `cartera-ficha.ts` (no exportada desde allí): aquí solo hace falta email +
 * quién es, no el resto de la ficha que pinta esa pantalla. `null` = la
 * consulta falló — se trata como «no se ha podido mirar», nunca como «no hay
 * nadie más».
 */
async function leerIntervinientesDePoliza(
  db: ReturnType<typeof prismaAsegura>,
  correduriaId: string,
  tomadorId: string,
  polizaId: string,
): Promise<IntervinienteFicha[] | null> {
  try {
    const filas = await db.polizaInterviniente.findMany({
      where: { correduriaId, polizaId },
      // 🚨 Mismo orden que `leerIntervinientes` de `cartera-ficha.ts`, y por el
      // mismo motivo (02/09/2026): sin él, una póliza con varios intervinientes
      // del MISMO rol (GLOBAL 2, tres conductores habituales) le pasaba a
      // `contactoEfectivo` un orden distinto en cada lectura de Postgres, y el
      // correo podía salir a una persona distinta en cada pasada del cron.
      orderBy: [{ rol: 'asc' }, { id: 'asc' }],
      select: {
        id: true, polizaId: true, rol: true, clienteId: true, origen: true,
        nombre: true, apellidos: true, email: true,
        cliente: { select: { nombre: true, apellidos: true, email: true, emailOptOutAt: true } },
      },
    })
    return filas.map((f) => {
      const propio = [descifrar(f.nombre), descifrar(f.apellidos)].filter(Boolean).join(' ').trim() || null
      const deFicha = f.cliente ? `${f.cliente.nombre} ${f.cliente.apellidos}`.trim() || null : null
      // 🚨 `descifrar()` solo comprueba que el cifrado se abrió, no que lo de
      // dentro TENGA FORMA de email — a diferencia de `destinatarioDeCliente`,
      // que pasa todo por `pareceEmail()` antes de devolverlo. Esta fila puede
      // acabar como destinatario de un `sendMail`, así que se valida aquí
      // también: un valor que no parece email es tan «sin canal» como uno vacío.
      // Y si el interviniente está enlazado a SU PROPIA ficha de cliente y esa
      // ficha se dio de baja de correo, su email de ficha no cuenta — la baja
      // es suya, igual que la del tomador (`destinatarioDeCliente` ya la respeta).
      const emailDeFicha = f.cliente && !f.cliente.emailOptOutAt ? descifrar(f.cliente.email) : null
      const crudo = descifrar(f.email) ?? emailDeFicha
      const email = crudo !== null && pareceEmail(crudo) ? crudo : null
      return {
        id: f.id, polizaId: f.polizaId, rol: String(f.rol),
        nombre: propio ?? deFicha, nombreIlegible: false,
        telefono: null, email, telefonoIlegible: false, emailIlegible: false,
        fichaId: f.clienteId ?? null, personaClave: null,
        esTomador: f.clienteId === tomadorId, origen: String(f.origen),
      }
    })
  } catch {
    return null
  }
}

/**
 * Las personas de referencia declaradas en `cliente_relaciones` del tomador,
 * con SU PROPIO email ya resuelto (mismas reglas que `destinatarioDeCliente`:
 * baja de correo respetada, principal primero). Excluye el tipo `Sin vínculo`
 * (05/09/2026 — «no tiene vinculación ninguna» no es una persona de
 * referencia) y las fichas descartadas o fusionadas. `[]` en error: a
 * diferencia de los intervinientes, un fallo aquí no impide que
 * `emailAlternativo()` siga probando la vía de la póliza — se degrada, no se
 * bloquea el cron entero por esta consulta secundaria.
 */
async function leerAllegadosDeTomador(
  db: ReturnType<typeof prismaAsegura>,
  correduriaId: string,
  tomadorId: string,
): Promise<{ fichaId: string; nombre: string; parentesco: string; email: string }[]> {
  try {
    const vinculos = await db.clienteRelacion.findMany({
      where: {
        correduriaId,
        tipoRelacion: { not: 'Sin vínculo' },
        OR: [{ clienteAId: tomadorId }, { clienteBId: tomadorId }],
      },
      select: { clienteAId: true, clienteBId: true, tipoRelacion: true },
    })
    if (vinculos.length === 0) return []
    const parentescoPorId = new Map<string, string>()
    for (const v of vinculos) {
      const otroId = v.clienteAId === tomadorId ? v.clienteBId : v.clienteAId
      if (!parentescoPorId.has(otroId)) parentescoPorId.set(otroId, v.tipoRelacion)
    }
    const fichas = await db.cliente.findMany({
      where: {
        id: { in: [...parentescoPorId.keys()] },
        correduriaId,
        mergedIntoClienteId: null,
        activo: true,
      },
      select: {
        id: true, nombre: true, apellidos: true, emailOptOutAt: true, email: true,
        emails: { select: { email: true, esPrincipal: true, createdAt: true } },
      },
    })
    const out: { fichaId: string; nombre: string; parentesco: string; email: string }[] = []
    for (const f of fichas) {
      const destino = destinatarioDeCliente(f)
      if (!destino) continue
      out.push({
        fichaId: f.id,
        nombre: `${f.nombre} ${f.apellidos}`.trim(),
        parentesco: parentescoPorId.get(f.id) ?? 'persona de referencia',
        email: destino,
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Una pasada del cron. Lanza (no devuelve un resumen tranquilizador) cuando el
 * proceso NO puede hacer su trabajo —sin cartera, sin proveedor de correo, sin
 * remitente—, para que el endpoint responda 503 en vez de un `enviados: 0` que
 * se lee igual que «hoy no tocaba nadie».
 */
export async function ejecutarAvisosVencimiento(opts: {
  hoy?: Date
  forzarContar?: boolean
} = {}): Promise<ResumenAvisos> {
  if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')

  const hoy = diaUtc(opts.hoy ?? new Date())
  const soloContar = esSoloContar({ activos: avisosActivos(), forzarContar: opts.forzarContar === true })
  const db = prismaAsegura()

  // El rango en SQL es una CRIBA (para no traerse decenas de miles de filas);
  // quien decide de verdad es `entraEnVentana` del módulo puro, más abajo.
  const filas = await db.portalObligacion.findMany({
    where: {
      avisadaAt: null,
      fechaAccionable: { gte: hoy, lte: new Date(hoy.getTime() + DIAS_VENTANA_AVISO * MS_DIA) },
    },
    orderBy: { fechaAccionable: 'asc' },
    take: 500,
  })
  const enVentana = filas.filter((f) => entraEnVentana({ fechaAccionable: f.fechaAccionable, hoy }))

  // Las pólizas de las obligaciones, EN VIVO y solo las de CIMA (`import_ref IS
  // NULL`). Una obligación cuya póliza es del volcado —o ya no está— no es
  // candidata: no se avisa de un vencimiento de 2015.
  //
  // 🚨 Y el estado, que NO es redundante con el derivador del portal: aquel
  // poda cuando el cliente entra en su bóveda, y un cliente puede no entrar
  // nunca. Medido el 02/09/2026: 42 de las 109 pólizas de CIMA están
  // canceladas y 5 tienen vencimiento futuro. Sin este filtro, una póliza
  // cancelada DESPUÉS de derivarse su obligación mandaría un correo diciéndole
  // a alguien que decida sobre un seguro que ya no tiene.
  const polizaIds = [...new Set(enVentana.map((f) => f.polizaId).filter((id): id is string => id !== null))]
  const polizas = polizaIds.length
    ? await db.poliza.findMany({
        where: {
          id: { in: polizaIds },
          ...WHERE_CARTERA_VIVA,
          mergedIntoPolizaId: null,
          estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
          // 🚨 Y la ficha del TOMADOR tiene que seguir viva. `activo = false` son
          // las ~26.800 fichas descartadas del volcado (leads sin ningún dato de
          // contacto): escribirle a una es mandar un correo de vencimiento a
          // alguien que la correduría ya dio por bueno no tener. Es el único
          // camino de esta app con efecto EXTERNO, así que el filtro va aquí y
          // no solo en las pantallas.
          cliente: { activo: true },
        },
        select: {
          id: true,
          correduriaId: true,
          aseguradora: true,
          numeroPoliza: true,
          primaAnual: true,
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellidos: true,
              emailOptOutAt: true,
              email: true,
              emails: { select: { email: true, esPrincipal: true, createdAt: true } },
            },
          },
        },
      })
    : []
  const porId = new Map(polizas.map((p) => [p.id, p]))

  // Candidata = en ventana Y no encadenada a una póliza del volcado. Una
  // obligación SIN póliza (declarada por el usuario) sí es candidata: toca
  // avisar y sencillamente no hay por dónde — eso se cuenta como `sinCanal`,
  // que es la verdad, y no se esconde restándola del total.
  const candidatas = enVentana.filter((f) => f.polizaId === null || porId.has(f.polizaId))

  const resumen: ResumenAvisos = {
    candidatas: candidatas.length, enviados: 0, enviadosATercero: 0, sinCanal: 0, fallidos: 0, soloContar,
  }
  if (candidatas.length === 0) return resumen

  // Sin proveedor no se «envía 0 correos»: es una avería de configuración y
  // tiene que verse como tal. El remitente ya no puede faltar (tiene defecto).
  let envio: { transporter: NonNullable<ReturnType<typeof createMailTransporter>>; from: string } | null = null
  if (!soloContar) {
    const transporter = createMailTransporter()
    if (!transporter) throw new Error('sin_proveedor_email')
    const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
    envio = { transporter, from }
  }

  for (const o of candidatas) {
    const poliza = o.polizaId ? porId.get(o.polizaId) : undefined
    let destino = poliza ? destinatarioDeCliente(poliza.cliente) : null
    let paraTercero: ParaTercero | null = null

    // El tomador no tiene NADA propio en su ficha: antes de darlo por «sin
    // canal», se mira su póliza (su propio dato mal guardado, o un
    // interviniente ajeno) y, si tampoco, su persona de referencia declarada.
    // 🚨 PERO si el tomador se dio de BAJA de correo, no se le rodea escribiendo
    // a un tercero sobre su póliza: la baja es una decisión suya, no «no tengo
    // dirección». `sinCanal` ya documenta este caso («...o baja de correo»).
    if (!destino && poliza && o.polizaId && !poliza.cliente.emailOptOutAt) {
      const [intervinientes, allegados] = await Promise.all([
        leerIntervinientesDePoliza(db, poliza.correduriaId, poliza.cliente.id, o.polizaId),
        leerAllegadosDeTomador(db, poliza.correduriaId, poliza.cliente.id),
      ])
      const alt = emailAlternativo(intervinientes, allegados)
      if (alt) {
        destino = alt.email
        if (alt.quien) {
          paraTercero = {
            nombreTomador: `${poliza.cliente.nombre} ${poliza.cliente.apellidos}`.trim(),
            rol: alt.via === 'interviniente' ? etiquetaRol(alt.quien.rol) : alt.quien.rol,
          }
        }
        // `alt.via === 'tomador_en_poliza'` no deja `quien`: es el tomador
        // mismo, así que `paraTercero` se queda en `null` y el correo se lee
        // exactamente como si viniera de su propia ficha — porque lo es.
      }
    }

    if (!destino) {
      resumen.sinCanal += 1
      console.warn(`[avisos] obligación ${o.id} sin canal (${o.polizaId ? 'ni ficha, ni póliza, ni persona de referencia' : 'sin póliza de cartera'})`)
      continue
    }
    // El ensayo resuelve el destinatario a propósito (para saber cuántas irían
    // de verdad) pero NO lo escribe en ningún sitio ni lo manda.
    if (soloContar || !envio) continue

    const { asunto, texto, html } = textoAviso({
      titulo: o.titulo,
      fechaAccionable: o.fechaAccionable,
      fechaEvento: o.fechaEvento,
      aseguradora: poliza?.aseguradora ?? null,
      numeroPoliza: poliza?.numeroPoliza ?? null,
      primaAnual: poliza?.primaAnual != null ? Number(poliza.primaAnual) : null,
      paraTercero,
    })

    try {
      await envio.transporter.sendMail({ from: envio.from, to: destino, subject: asunto, text: texto, html })
    } catch (e) {
      resumen.fallidos += 1
      console.error(`[avisos] fallo enviando la obligación ${o.id}:`, e instanceof Error ? e.message : e)
      continue
    }
    resumen.enviados += 1
    if (paraTercero) resumen.enviadosATercero += 1
    // El sello va INMEDIATAMENTE después del envío aceptado. Si esto falla, el
    // correo ya salió: se grita, porque un reintento lo mandaría otra vez.
    try {
      await db.portalObligacion.update({ where: { id: o.id }, data: { avisadaAt: new Date() } })
    } catch (e) {
      console.error(`[avisos] ENVIADO PERO NO SELLADO — obligación ${o.id} puede repetir aviso:`, e instanceof Error ? e.message : e)
    }
  }

  return resumen
}

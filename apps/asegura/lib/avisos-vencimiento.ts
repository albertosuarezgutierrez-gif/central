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
 *      (`entraEnVentana`, `DIAS_VENTANA_AVISO`, y la antelación de la ficha con
 *      `diasVentanaVencimiento`). Aquí NO se hace aritmética de
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
import {
  emailAlternativo,
  etiquetaRol,
  POLIZA_ESTADOS_VIGENTES,
  primaConRecibos,
  WHERE_CARTERA_VIVA,
  type IntervinienteFicha,
  type ReciboVigencia,
} from '@central/module-seguros'
import { DIAS_ANTELACION_MAX, DIAS_VENTANA_AVISO, entraEnVentana, idVencimientoDerivado, TIPOS_RECORDATORIO_PROPIO } from '@central/module-seguros-portal'
import { ORIGEN_VINCULO_CORREDOR } from '@central/module-seguros-portal'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'
import { canalesPorFicha, decidirAvisoVencimiento, diasEfectivosDeFicha, type CanalesDeFichas } from './avisos-vencimiento-canal.ts'
import {
  LIMITE_OBLIGACIONES,
  MARGEN_CANDIDATA_MS,
  PRESUPUESTO_MS,
  cribaTruncada,
  quedaPresupuesto,
} from './avisos-presupuesto'
import { textoAviso, type ParaTercero } from './texto-vencimiento'
import { recibosVigenciaDe } from './recibos-vigencia'

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
  /**
   * La criba SQL tocó su techo (`LIMITE_OBLIGACIONES`): puede haber MÁS
   * obligaciones que avisar hoy y esta pasada no las ha visto. NO es «hay
   * exactamente 500»: es un «no lo sé» que antes viajaba como si fuera el total.
   * La criba mira 30 días (la mayor antelación) en orden ascendente: lo no visto
   * es siempre lo más lejano, y vuelve en pasadas siguientes al acercarse.
   */
  truncado: boolean
  /**
   * Candidatas que ni se intentaron porque se agotó el presupuesto de tiempo.
   * No se pierden —sin `avisada_at` vuelven en la pasada siguiente— pero se
   * dicen: un `enviados` corto sin esto se lee como «hoy tocaban pocas».
   */
  pendientes: number
  /**
   * Candidatas que NO se mandan porque su push ya salió a una persona de la ficha y todas las de la
   * ficha eligieron «solo en el móvil» (`decidirAvisoVencimiento`). No se sellan: si cambia de opinión dentro de la
   * ventana, el correo sale en la pasada siguiente (y sin `avisada_at` tampoco hay recordatorio).
   */
  omitidosSoloMovil: number
  /**
   * `false` = no se pudieron leer los vínculos/preferencias del portal y se ha mandado como antes de
   * existir la preferencia (fail-open; antelación de 7 días). `true` cuando se leyeron o no hizo falta mirar.
   */
  preferenciasLeidas: boolean
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

import { descifrar, pareceEmail, emailAvisable, destinatarioDeCliente, type ClienteConEmails } from './avisos-vencimiento-reglas.ts'
export { destinatarioDeCliente, type ClienteConEmails }

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
      // que pasa todo por `emailAvisable()` antes de devolverlo. Esta fila puede
      // acabar como destinatario de un `sendMail`, así que se valida aquí
      // también: un valor que no parece email es tan «sin canal» como uno vacío.
      // Y si el interviniente está enlazado a SU PROPIA ficha de cliente y esa
      // ficha se dio de baja de correo, su email de ficha no cuenta — la baja
      // es suya, igual que la del tomador (`destinatarioDeCliente` ya la respeta).
      // 🚨 El fallback es por VALIDEZ, no por null: un `??` se habría quedado
      // con un email propio con formato roto (dato sucio, no ausente) y nunca
      // habría probado el de la ficha, que puede ser el bueno.
      const emailPropio = descifrar(f.email)
      const emailDeFicha = f.cliente && !f.cliente.emailOptOutAt ? descifrar(f.cliente.email) : null
      const email = emailAvisable(emailPropio) ? emailPropio : emailAvisable(emailDeFicha) ? emailDeFicha : null
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
 * Las identidades vinculadas a estas fichas y el canal y la antelación que eligió cada una en el portal
 * (14/10/2026), para `decidirAvisoVencimiento()` y `diasEfectivosDeFicha()` (UNA lectura para las dos). La usan también los correos de vencimiento de `avisos-intranet.ts`.
 * Solo LEE. Sin el vínculo temporal del CORREDOR (apunta a la ficha que Alberto tuviera abierta, no
 * es una persona de esa ficha). Lápidas: no hace falta mirarlas, `fusionar_clientes()` re-apunta los
 * vínculos a la superviviente (ver la cabecera de `avisos-vencimiento-canal.ts`).
 * `null` = la lectura falló (fail-open en quien llama, y se dice).
 */
export async function leerCanalesDeFichas(
  db: ReturnType<typeof prismaAsegura>,
  fichaIds: string[],
  contexto = 'avisos-vencimiento',
): Promise<CanalesDeFichas> {
  if (fichaIds.length === 0) return new Map()
  try {
    const vinculos = await db.portalVinculo.findMany({
      where: { clienteId: { in: fichaIds }, origen: { not: ORIGEN_VINCULO_CORREDOR } },
      select: { identidadId: true, clienteId: true },
    })
    const identidadIds = [...new Set(vinculos.map((v) => v.identidadId))]
    const prefs = identidadIds.length
      ? await db.portalPreferenciasAvisos.findMany({
          where: { identidadId: { in: identidadIds } },
          select: { identidadId: true, canal: true, diasAntelacion: true },
        })
      : []
    return canalesPorFicha({ vinculos, prefsDe: new Map(prefs.map((p) => [p.identidadId, { canal: p.canal, diasAntelacion: p.diasAntelacion }])) })
  } catch (e) {
    registrarErrorCartera(`${contexto}/preferencias-portal`, e)
    return null
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
  /** Presupuesto de envío en ms. Por debajo del `maxDuration` de la ruta. */
  presupuestoMs?: number
  /** Reloj inyectable (tests). Por defecto `Date.now`. */
  ahoraMs?: () => number
} = {}): Promise<ResumenAvisos> {
  if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')

  const hoy = diaUtc(opts.hoy ?? new Date())
  const soloContar = esSoloContar({ activos: avisosActivos(), forzarContar: opts.forzarContar === true })
  const db = prismaAsegura()

  // El rango en SQL es una CRIBA (para no traerse decenas de miles de filas);
  // quien decide de verdad es `entraEnVentana` del módulo puro, más abajo, con
  // los días de CADA ficha (`diasEfectivosDeFicha`, 14/10/2026). La criba llega
  // hasta la mayor antelación elegible (30) y va en orden ASCENDENTE de fecha:
  // si toca el techo, lo que se queda fuera es lo MÁS lejano, nunca un aviso de
  // 7 días mientras quepa uno de 30 (el mismo patrón que `avisos-push`).
  const filas = await db.portalObligacion.findMany({
    where: {
      avisadaAt: null,
      // 🚨 Los recordatorios que el cliente se pone a SÍ MISMO (ITV, carné,
      // caldera…) NO son el vencimiento de un seguro, y este cron solo sabe
      // escribir de eso: su correo dice «es la última fecha para comunicar que
      // no quieres renovar; el seguro vence el X» (art. 22 LCS). Mandado sobre
      // una ITV, le está diciendo a alguien que se queda sin cobertura cuando
      // no es verdad.
      //
      // Y la PÓLIZA no sirve para distinguirlos: desde el 13/09/2026 un
      // recordatorio propio puede colgar de una (para decir de qué coche es), y
      // desde el 21/09 la precarga de la ITV se la asigna sola — o sea que
      // justo los que más se van a crear son los que tienen `polizaId`. Lo que
      // los distingue es el TIPO.
      //
      // `notIn` y no `in: ['poliza','recibo']` a propósito: si algún día se
      // deriva un tipo NUEVO de la cartera, lo correcto es que se avise (el
      // comportamiento de hoy) y no que enmudezca sin que nadie se entere.
      tipo: { notIn: [...TIPOS_RECORDATORIO_PROPIO] },
      fechaAccionable: { gte: hoy, lte: new Date(hoy.getTime() + DIAS_ANTELACION_MAX * MS_DIA) },
    },
    orderBy: [{ fechaAccionable: 'asc' }, { id: 'asc' }],
    take: LIMITE_OBLIGACIONES,
  })
  // El techo se DECLARA. Antes se recortaba en silencio y el resumen presentaba
  // el recorte como el total de lo que tocaba avisar hoy.
  const truncado = cribaTruncada(filas.length)
  // Primera puerta, la ANCHA (la mayor antelación posible); la de cada ficha va después de leer sus
  // preferencias.
  const enCriba = filas.filter((f) => entraEnVentana({ fechaAccionable: f.fechaAccionable, hoy, dias: DIAS_ANTELACION_MAX }))

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
  const polizaIds = [...new Set(enCriba.map((f) => f.polizaId).filter((id): id is string => id !== null))]
  const polizas = polizaIds.length
    ? await db.poliza.findMany({
        where: {
          id: { in: polizaIds },
          ...WHERE_CARTERA_VIVA,
          mergedIntoPolizaId: null,
          estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
          // Sustituida por otra (cambio de compañía emitido): no se renueva, no se le avisa.
          sustituidaAt: null,
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
          primaBruta: true,
          fraccionamiento: true,
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

  // «Configuración → Avisos» del portal (14/10/2026): UNA lectura para toda la pasada (canal y
  // antelación). También en el ensayo, para que el recuento diga cuántos saldrían de verdad.
  const canalesDeFicha = await leerCanalesDeFichas(db, [...new Set(polizas.map((p) => p.cliente.id))])

  // Candidata = en la ventana de SU ficha Y no encadenada a una póliza del
  // volcado. Una obligación SIN póliza (declarada por el usuario) sí es
  // candidata, con los 7 de siempre: toca avisar y sencillamente no hay por
  // dónde — eso se cuenta como `sinCanal`, que es la verdad, y no se esconde
  // restándola del total.
  const candidatas = enCriba.filter((f) => {
    if (f.polizaId === null) return entraEnVentana({ fechaAccionable: f.fechaAccionable, hoy, dias: DIAS_VENTANA_AVISO })
    const p = porId.get(f.polizaId)
    return p !== undefined && entraEnVentana({ fechaAccionable: f.fechaAccionable, hoy, dias: diasEfectivosDeFicha(canalesDeFicha, p.cliente.id) })
  })

  const resumen: ResumenAvisos = {
    candidatas: candidatas.length, enviados: 0, enviadosATercero: 0, sinCanal: 0, fallidos: 0,
    soloContar, truncado, pendientes: 0, omitidosSoloMovil: 0, preferenciasLeidas: canalesDeFicha !== null,
  }
  if (canalesDeFicha === null) {
    console.error('[avisos] preferencias del portal NO leídas: se manda como antes (fail-open) y con 7 días de antelación')
  }
  if (candidatas.length === 0) return resumen

  // Sin proveedor no se «envía 0 correos»: es una avería de configuración y
  // tiene que verse como tal. El envío real va por `enviarCorreoSeguido`
  // (Resend HTTP si hay `RESEND_API_KEY`, si no SMTP), así que la detección
  // previa comprueba el mismo par de caminos que usará ese punto único.
  let hayProveedor = false
  if (!soloContar) {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    if (!apiKey && !createMailTransporter()) throw new Error('sin_proveedor_email')
    hayProveedor = true
  }

  // Allianz no manda la prima en la póliza, solo en el recibo anual
  // (27/09/2026): sin esto su correo sale sin la línea «Prima anual». Una
  // consulta por correduría (en la práctica, una), nunca por póliza. En el
  // ensayo no se escribe ningún correo, así que no se lee.
  const recibosAnuales = new Map<string, ReciboVigencia[]>()
  if (!soloContar) {
    const porCorreduria = new Map<string, string[]>()
    for (const p of polizas) porCorreduria.set(p.correduriaId, [...(porCorreduria.get(p.correduriaId) ?? []), p.id])
    for (const [correduriaId, ids] of porCorreduria) {
      for (const [id, recs] of await recibosVigenciaDe(correduriaId, ids)) recibosAnuales.set(id, recs)
    }
  }

  const arranque = opts.ahoraMs ?? (() => Date.now())
  const t0 = arranque()
  const presupuestoMs = opts.presupuestoMs ?? PRESUPUESTO_MS

  for (const [i, o] of candidatas.entries()) {
    // 🚨 Antes de nada: ¿da tiempo? Quedarse a medio envío es peor que no
    // empezarlo (el correo sale, el sello no, y la pasada siguiente lo repite).
    // El ensayo no consulta ni manda, así que no gasta presupuesto.
    if (!soloContar && !quedaPresupuesto(arranque() - t0, presupuestoMs, MARGEN_CANDIDATA_MS)) {
      resumen.pendientes = candidatas.length - i
      console.warn(`[avisos] presupuesto agotado: ${resumen.pendientes} candidata(s) sin intentar, vuelven mañana`)
      break
    }
    const poliza = o.polizaId ? porId.get(o.polizaId) : undefined
    // Ya se le avisó de ESTE vencimiento por el correo de la intranet cuando aún no tenía obligación
    // (`idVencimientoDerivado`, 27/09/2026): se sella sin mandarle el mismo aviso otra vez.
    if (poliza && o.polizaId && !soloContar) {
      const clave = `obligacion_en_ventana:${idVencimientoDerivado(o.polizaId, o.fechaEvento)}`
      const ya = await db.portalAvisoEnviado.findFirst({ where: { clienteId: poliza.cliente.id, clave }, select: { id: true } })
      if (ya) {
        await db.portalObligacion.update({ where: { id: o.id }, data: { avisadaAt: new Date() } })
        continue
      }
    }
    // 🚨 Antes de resolver destinatario: «solo en el móvil» calla también el correo a la persona de
    // referencia, que es el mismo aviso sobre la misma póliza. Sin sello (ver `omitidosSoloMovil`).
    if (poliza) {
      const decision = decidirAvisoVencimiento({
        origen: { tipo: 'obligacion', identidadId: o.identidadId, avisadaPushAt: o.avisadaPushAt, fechaAccionable: o.fechaAccionable },
        fichaId: poliza.cliente.id,
        canales: canalesDeFicha,
      })
      if (!decision.enviar) {
        resumen.omitidosSoloMovil += 1
        console.info(`[avisos] obligación ${o.id} omitida: ${decision.motivo}`)
        continue
      }
    }
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
    if (soloContar || !hayProveedor) continue
    // Invariante: `destino` solo se resuelve cuando hay `poliza` (directo o vía
    // tercero, arriba). Sin ella no habría `correduriaId` al que atribuir el envío.
    if (!poliza) continue

    const { asunto, texto, html } = textoAviso({
      titulo: o.titulo,
      fechaAccionable: o.fechaAccionable,
      fechaEvento: o.fechaEvento,
      aseguradora: poliza?.aseguradora ?? null,
      numeroPoliza: poliza?.numeroPoliza ?? null,
      // Siempre la prima TOTAL (bruta, impuestos incluidos): la de la póliza
      // si la trae y, si no, la del recibo anual (pago anual). Antes salía la
      // neta de la póliza o el total del recibo bajo el mismo rótulo — dos
      // magnitudes distintas como si fueran una. Un 0 guardado no es prima.
      primaAnual: primaConRecibos(
        {
          primaAnual: poliza.primaAnual == null ? null : Number(poliza.primaAnual),
          primaBruta: poliza.primaBruta == null ? null : Number(poliza.primaBruta),
          fraccionamiento: poliza.fraccionamiento === null ? null : String(poliza.fraccionamiento),
        },
        recibosAnuales.get(poliza.id) ?? [],
        hoy.toISOString(),
      ).prima,
      paraTercero,
    })

    // Import dinámico: como el resto de correos de esta app, los cepos puros
    // corren con `node --test`, que no resuelve el punto único de envío.
    const { enviarCorreoSeguido } = await import('./correo-envio')
    const r = await enviarCorreoSeguido({
      correduriaId: poliza.correduriaId,
      // A un tercero (interviniente/allegado) no se le conoce el id de ficha
      // desde aquí: `EmailAlternativo.quien` no lo lleva.
      // Aunque vaya a un tercero, el aviso es de la póliza de ESTE cliente: se ve en su ficha, con la dirección a la que salió.
      clienteId: poliza.cliente.id,
      tipo: 'vencimiento',
      to: destino,
      asunto, texto, html,
    })
    if (r.resultado !== 'enviado') {
      resumen.fallidos += 1
      console.error(`[avisos] fallo enviando la obligación ${o.id}:`, r.motivo ?? r.codigo ?? '')
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

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
 */
import { createMailTransporter } from '@central/core-email'
import { decryptField } from '@central/module-seguros-pii'
import { POLIZA_ESTADOS_VIGENTES, WHERE_CARTERA_VIVA } from '@central/module-seguros'
import { DIAS_VENTANA_AVISO, entraEnVentana } from '@central/module-seguros-portal'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { eur } from './dinero'

const MS_DIA = 86_400_000

export type ResumenAvisos = {
  /** Obligaciones que TOCA avisar hoy (en ventana, sin sellar, no del volcado). */
  candidatas: number
  /** Correos aceptados por el proveedor. En modo cuenta es siempre 0. */
  enviados: number
  /** Candidatas sin dirección utilizable: ni póliza viva, ni email legible, o baja de correo. */
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

function fechaEs(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type DatosCorreo = {
  titulo: string
  fechaAccionable: Date
  fechaEvento: Date
  aseguradora: string | null
  numeroPoliza: string | null
  primaAnual: number | null
}

/**
 * La fecha que se le dice al cliente es la ACCIONABLE, no la del vencimiento
 * (art. 22 LCS). Decirle «vence el 15 de marzo» le deja creer que tiene hasta el
 * 15, cuando el plazo para oponerse se le pasó 30 días antes.
 */
export function textoAviso(d: DatosCorreo): { asunto: string; texto: string; html: string } {
  const accionable = fechaEs(d.fechaAccionable)
  const vence = fechaEs(d.fechaEvento)
  const detalle = [
    d.aseguradora ? `Compañía: ${d.aseguradora}` : null,
    d.numeroPoliza ? `Nº de póliza: ${d.numeroPoliza}` : null,
    d.primaAnual !== null ? `Prima anual: ${eur(d.primaAnual)}` : null,
  ].filter((x): x is string => x !== null)

  const asunto = `Tienes hasta el ${accionable} para decidir sobre ${d.titulo}`
  const texto =
    `${d.titulo}\n\n` +
    `Puedes actuar hasta el ${accionable}. Es la última fecha para comunicar que no quieres ` +
    `renovar; después la póliza se prorroga sola. El seguro vence el ${vence}.\n\n` +
    (detalle.length ? detalle.join('\n') + '\n\n' : '') +
    `Si quieres que lo revisemos juntos, responde a este correo.\n\n— Grupo ASegura`
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">` +
    `<p style="margin:0 0 12px"><strong>${esc(d.titulo)}</strong></p>` +
    `<p style="margin:0 0 12px">Puedes actuar hasta el <strong>${esc(accionable)}</strong>. ` +
    `Es la última fecha para comunicar que no quieres renovar; después la póliza se prorroga sola. ` +
    `El seguro vence el ${esc(vence)}.</p>` +
    (detalle.length
      ? `<ul style="margin:0 0 12px;padding-left:18px;color:#444">${detalle.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      : '') +
    `<p style="margin:0;color:#666;font-size:13px">Si quieres que lo revisemos juntos, responde a este correo.</p>` +
    `</div>`
  return { asunto, texto, html }
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
        },
        select: {
          id: true,
          aseguradora: true,
          numeroPoliza: true,
          primaAnual: true,
          cliente: {
            select: {
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

  const resumen: ResumenAvisos = { candidatas: candidatas.length, enviados: 0, sinCanal: 0, fallidos: 0, soloContar }
  if (candidatas.length === 0) return resumen

  // Sin proveedor o sin remitente no se «envía 0 correos»: es una avería de
  // configuración y tiene que verse como tal.
  let envio: { transporter: NonNullable<ReturnType<typeof createMailTransporter>>; from: string } | null = null
  if (!soloContar) {
    const transporter = createMailTransporter()
    if (!transporter) throw new Error('sin_proveedor_email')
    const from = process.env.ASEGURA_MAIL_FROM
    if (!from) throw new Error('sin_remitente')
    envio = { transporter, from }
  }

  for (const o of candidatas) {
    const poliza = o.polizaId ? porId.get(o.polizaId) : undefined
    const destino = poliza ? destinatarioDeCliente(poliza.cliente) : null
    if (!destino) {
      resumen.sinCanal += 1
      console.warn(`[avisos] obligación ${o.id} sin canal (${o.polizaId ? 'email no legible o de baja' : 'sin póliza de cartera'})`)
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
    })

    try {
      await envio.transporter.sendMail({ from: envio.from, to: destino, subject: asunto, text: texto, html })
    } catch (e) {
      resumen.fallidos += 1
      console.error(`[avisos] fallo enviando la obligación ${o.id}:`, e instanceof Error ? e.message : e)
      continue
    }
    resumen.enviados += 1
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

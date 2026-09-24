// Reglas PURAS del «avísame antes de que venza» de la web pública (sin Prisma ni red, para que
// `node --test` las pruebe). La parte de BD vive en `aviso-web.ts`.
//
// Los dos plazos del art. 22 LCS mandan en todo: la compañía comunica cambios con 2 meses (60 días)
// y el tomador se opone a la prórroga hasta 1 mes antes (30 días, la misma cuenta en UTC que el
// portal y la calculadora de la web). Los avisos salen ANTES de esos plazos, no en ellos:
//   · aviso 1, a 70 días: «tu compañía tiene hasta el X para comunicarte cambios; si te llega, súbelo»;
//   · aviso 2, a 45 días: «quedan N días para el último día para decir que no».
// Un correo a 30 días llegaría cuando ya no se puede cambiar este año.
//
// 🚨 Los textos citan plazos y nada más. No prometen ahorro ni afirman qué pasa si la compañía no
// avisa a tiempo: eso no está confirmado jurídicamente y sería asesorar.

import { normalizarEmail, normalizarNombre } from '@central/module-seguros'

export const DIAS_AVISO_1 = 70
export const DIAS_AVISO_2 = 45
export const DIAS_COMPANIA = 60
export const DIAS_TOMADOR = 30
/** Horas que vale el enlace de confirmación. Pasado ese tiempo la fila se queda sin confirmar y no cuenta. */
export const HORAS_CONFIRMACION = 72
/** Máximo de solicitudes por correo en 24 h: frena que alguien use el formulario para bombardear un buzón ajeno. */
export const MAX_SOLICITUDES_DIA = 3
/**
 * Tope GLOBAL por hora de solicitudes (todas las direcciones). El límite por IP de plataforma es por
 * instancia y se esquiva rotando IPs; sin este techo el formulario serviría para mandar miles de
 * correos firmados por Grupo ASegura y quemar el dominio del que salen también los del portal.
 */
export const MAX_SOLICITUDES_HORA = 30
/** Días que se guarda una solicitud que nunca se confirmó antes de borrarla. */
export const DIAS_PURGA_SIN_CONFIRMAR = 30
/**
 * El nombre va dentro de un correo que sale a una dirección que tecleó un desconocido: solo letras,
 * espacios y signos de nombre, sin URLs ni texto libre. Si no, sería un campo para meter phishing.
 */
const NOMBRE_SEGURO = /^[\p{L} .'-]{1,60}$/u
/** Versión del texto de consentimiento que muestra la web. Si cambia el texto, cambia la versión. */
export const CONSENTIMIENTO_VERSION = 'web-aviso-v1'

const MS_DIA = 86_400_000

/**
 * Slug de página de ramo de la web → `tipo_seguro` de la cartera. Vida y salud no está: su
 * renovación tiene reglas propias y la web no pinta el widget ahí.
 */
export const RAMO_WEB_A_TIPO: Readonly<Record<string, string>> = {
  auto: 'auto',
  flota: 'auto',
  hogar: 'hogar',
  comunidades: 'comunidades',
  comercio: 'comercio',
  'responsabilidad-civil': 'responsabilidad_civil',
  'responsabilidad-civil-fontaneros': 'responsabilidad_civil',
  'responsabilidad-civil-autonomos': 'responsabilidad_civil',
  otro: 'otros',
}

/** Slug del «Otro seguro» del selector de la portada: el visitante escribe cuál. */
export const RAMO_WEB_OTRO = 'otro'
/**
 * Lo que escribe en «¿Cuál?» también acaba dentro de un correo a una dirección ajena, así que
 * tiene la misma regla que el nombre: solo letras y espacios, corto. Nada de URLs ni cifras.
 */
const SEGURO_OTRO = /^[\p{L} '-]{2,40}$/u

export const NOMBRE_RAMO: Readonly<Record<string, string>> = {
  auto: 'auto',
  hogar: 'hogar',
  comunidades: 'comunidad',
  comercio: 'comercio',
  responsabilidad_civil: 'responsabilidad civil',
}

/**
 * Cómo se nombra el seguro en correos, historial y Telegram. Para «otro» es lo que escribió el
 * visitante (guardado en `ramo_web` como `otro:<texto>`); para el resto, el nombre del ramo.
 */
export function nombreDelSeguro(ramo: string, ramoWeb: string): string {
  if (ramoWeb.startsWith(`${RAMO_WEB_OTRO}:`)) return ramoWeb.slice(RAMO_WEB_OTRO.length + 1)
  return NOMBRE_RAMO[ramo] ?? ramo
}

export type SolicitudAviso = { nombre: string; email: string; ramoWeb: string; ramo: string; vence: string }

export type Revision = { ok: true; solicitud: SolicitudAviso } | { ok: false; motivo: string; campo: string }

/** `AAAA-MM-DD` → medianoche UTC, o `null` si no es una fecha real. */
export function parsearFecha(iso: unknown): Date | null {
  if (typeof iso !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  return d
}

export function revisarSolicitud(body: unknown): Revision {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const nombre = normalizarNombre(b.nombre, 'nombre')
  if (!nombre.ok) return { ok: false, motivo: nombre.motivo, campo: 'nombre' }
  if (!NOMBRE_SEGURO.test(nombre.valor)) return { ok: false, motivo: 'Escribe solo tu nombre, con letras.', campo: 'nombre' }
  const email = normalizarEmail(b.email)
  if (!email.ok) return { ok: false, motivo: email.motivo, campo: 'email' }
  const ramoWeb = typeof b.ramo === 'string' ? b.ramo.trim() : ''
  const ramo = RAMO_WEB_A_TIPO[ramoWeb]
  if (!ramo) return { ok: false, motivo: 'Ramo no válido.', campo: 'ramo' }
  let ramoWebGuardado = ramoWeb
  if (ramoWeb === RAMO_WEB_OTRO) {
    const cual = typeof b.cual === 'string' ? b.cual.replace(/\s+/g, ' ').trim().toLowerCase() : ''
    if (!SEGURO_OTRO.test(cual)) return { ok: false, motivo: 'Escribe qué seguro es, solo con letras (p. ej. «patinete»).', campo: 'cual' }
    ramoWebGuardado = `${RAMO_WEB_OTRO}:${cual}`
  }
  const vence = parsearFecha(b.vence)
  if (!vence) return { ok: false, motivo: 'Fecha de vencimiento no válida.', campo: 'vence' }
  const anio = vence.getUTCFullYear()
  if (anio < 1990 || anio > new Date().getUTCFullYear() + 2) return { ok: false, motivo: 'Fecha de vencimiento no válida.', campo: 'vence' }
  // El consentimiento tiene que venir marcado de forma EXPLÍCITA: `true`, no «algo que parezca sí».
  if (b.consentimiento !== true) return { ok: false, motivo: 'Tienes que aceptar que te escribamos para avisarte.', campo: 'consentimiento' }
  return { ok: true, solicitud: { nombre: nombre.valor, email: email.valor, ramoWeb: ramoWebGuardado, ramo, vence: String(b.vence).trim() } }
}

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Mismo día y mes en otro año; un 29 de febrero cae al 28 si el año no es bisiesto. */
function enAnio(d: Date, anio: number): Date {
  const mes = d.getUTCMonth()
  const x = new Date(Date.UTC(anio, mes, d.getUTCDate()))
  return x.getUTCMonth() === mes ? x : new Date(Date.UTC(anio, mes + 1, 0))
}

/**
 * El vencimiento del ciclo que todavía se puede decidir: el primer aniversario cuyo último día para
 * oponerse (vence − 30) no ha pasado. Una póliza se prorroga cada año el mismo día.
 */
export function vencimientoDelCiclo(vence: Date, hoy: Date): Date {
  const h = diaUtc(hoy)
  let v = enAnio(vence, h.getUTCFullYear() - 1)
  while (v.getTime() - DIAS_TOMADOR * MS_DIA < h.getTime()) v = enAnio(vence, v.getUTCFullYear() + 1)
  return v
}

export const restarDias = (d: Date, n: number): Date => new Date(d.getTime() - n * MS_DIA)

const iso = (d: Date): string => d.toISOString().slice(0, 10)

export type AvisoQueToca = { tipo: 'aviso1' | 'aviso2'; para: string } | null

/**
 * Qué aviso toca hoy, o `null`. `aviso1Para`/`aviso2Para` son los vencimientos (`AAAA-MM-DD`) para
 * los que ya salió cada uno. Si alguien se apunta tarde (a menos de 45 días) solo recibe el 2; si
 * se apunta con menos de 31 días, ninguno este año: el plazo para oponerse ya se le ha pasado o se
 * le pasa en horas, y un correo así solo le diría que ya no llega.
 */
export function avisoQueToca(p: { vence: Date; hoy: Date; aviso1Para: string | null; aviso2Para: string | null }): AvisoQueToca {
  const h = diaUtc(p.hoy)
  const v = vencimientoDelCiclo(p.vence, h)
  const para = iso(v)
  const dias = Math.round((v.getTime() - h.getTime()) / MS_DIA)
  if (dias <= DIAS_TOMADOR) return null
  if (dias <= DIAS_AVISO_2) return p.aviso2Para === para ? null : { tipo: 'aviso2', para }
  if (dias <= DIAS_AVISO_1) return p.aviso1Para === para ? null : { tipo: 'aviso1', para }
  return null
}

// ─── Correos ────────────────────────────────────────────────────────────────

export type CuerpoCorreo = { asunto: string; texto: string; html: string }

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function fechaLarga(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function exigirHttps(...urls: string[]): void {
  // Error de PROGRAMACIÓN (los enlaces no los teclea nadie): se lanza, no se degrada.
  for (const u of urls) if (!/^https:\/\//.test(u)) throw new Error('enlace_no_https')
}

function html(parrafos: string[], boton: { href: string; texto: string } | null, pie: string[]): string {
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    ...parrafos.map((p) => `<p>${p}</p>`),
    ...(boton
      ? [`<p><a href="${escapar(boton.href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">${escapar(boton.texto)}</a></p>`]
      : []),
    ...pie.map((p) => `<p style="color:#555;font-size:13px">${p}</p>`),
    '</div>',
  ].join('')
}

export function cuerpoConfirmacion(d: { nombre: string; ramo: string; vence: Date; enlaceConfirmar: string }): CuerpoCorreo {
  exigirHttps(d.enlaceConfirmar)
  const ramo = NOMBRE_RAMO[d.ramo] ?? d.ramo
  const saludo = `Hola, ${d.nombre}:`
  const que = `Has pedido que te avisemos antes de que venza tu seguro de ${ramo} (vencimiento: ${fechaLarga(d.vence)}).`
  const confirma = `Para activar los avisos, confirma tu correo en las próximas ${HORAS_CONFIRMACION} horas.`
  const noFuiste = 'Si no lo has pedido tú, ignora este mensaje: sin confirmar no te escribiremos más, no te damos de alta en nuestra cartera y borramos la solicitud.'
  return {
    asunto: 'Confirma tu correo para recibir el aviso de vencimiento',
    texto: [saludo, '', que, '', confirma, `Confirmar: ${d.enlaceConfirmar}`, '', noFuiste, '', 'Un saludo,', 'Grupo ASegura'].join('\n'),
    html: html(
      [escapar(saludo), escapar(que), escapar(confirma)],
      { href: d.enlaceConfirmar, texto: 'Confirmar mi correo' },
      [escapar(noFuiste), 'Un saludo,<br>Grupo ASegura'],
    ),
  }
}

export function cuerpoAviso(d: {
  tipo: 'aviso1' | 'aviso2'
  nombre: string
  ramo: string
  vence: Date
  hoy: Date
  enlacePortal: string
  directo: boolean
  enlaceBaja: string
}): CuerpoCorreo {
  exigirHttps(d.enlacePortal, d.enlaceBaja)
  const ramo = NOMBRE_RAMO[d.ramo] ?? d.ramo
  const limiteCompania = restarDias(d.vence, DIAS_COMPANIA)
  const limiteTomador = restarDias(d.vence, DIAS_TOMADOR)
  const quedan = Math.round((limiteTomador.getTime() - diaUtc(d.hoy).getTime()) / MS_DIA)
  const saludo = `Hola, ${d.nombre}:`
  const parrafos =
    d.tipo === 'aviso1'
      ? [
          `Tu seguro de ${ramo} vence el ${fechaLarga(d.vence)}.`,
          `Tu compañía tiene hasta el ${fechaLarga(limiteCompania)} para comunicarte cualquier cambio de precio o de condiciones (art. 22 de la Ley de Contrato de Seguro). Tú puedes decir que no quieres renovar hasta el ${fechaLarga(limiteTomador)}.`,
          'Si te llega la comunicación o el recibo nuevo, súbelo a tu área de clientes y lo revisamos contigo.',
        ]
      : [
          `Quedan ${quedan} días para el ${fechaLarga(limiteTomador)}, el último día para comunicar a tu compañía que no quieres renovar tu seguro de ${ramo} (vence el ${fechaLarga(d.vence)}).`,
          '¿Te ha llegado ya el recibo o la comunicación de la renovación? Súbelo a tu área de clientes y lo revisamos contigo antes de esa fecha.',
        ]
  const comoSeEntra = d.directo
    ? 'Con este enlace entras directamente, una sola vez y durante 24 horas. Si ya lo usaste o ha caducado, entras con tu correo y un código. No lo reenvíes.'
    : 'Se entra con tu correo y un código de un solo uso; no hay contraseña que recordar.'
  const baja = 'Recibes este correo porque pediste en grupoasegura.es que te avisáramos del vencimiento.'
  return {
    asunto:
      d.tipo === 'aviso1'
        ? `Tu seguro de ${ramo} vence el ${fechaLarga(d.vence)}`
        : `Quedan ${quedan} días para decidir si renuevas tu seguro de ${ramo}`,
    texto: [
      saludo,
      '',
      ...parrafos.flatMap((p) => [p, '']),
      `Tu área de clientes: ${d.enlacePortal}`,
      comoSeEntra,
      '',
      'Un saludo,',
      'Grupo ASegura',
      '',
      `${baja} Para no recibir más avisos: ${d.enlaceBaja}`,
    ].join('\n'),
    html: html(
      [escapar(saludo), ...parrafos.map(escapar)],
      { href: d.enlacePortal, texto: 'Entrar en mi área de clientes' },
      [
        escapar(comoSeEntra),
        'Un saludo,<br>Grupo ASegura',
        `${escapar(baja)} <a href="${escapar(d.enlaceBaja)}">No quiero recibir más avisos</a>.`,
      ],
    ),
  }
}

/** URL pública de la web (donde viven las páginas de confirmar y darse de baja). */
export function urlWeb(base: string | undefined = process.env.ASEGURA_WEB_URL): string {
  return (base?.trim() || 'https://grupoasegura.es').replace(/\/+$/, '')
}

/** El token va en el fragmento `#`: no viaja en la petición HTTP, así que no queda en ningún log. */
export function enlaceWeb(base: string, ruta: '/aviso/confirmar' | '/aviso/baja', token: string): string {
  return `${base}${ruta}#t=${encodeURIComponent(token)}`
}

export function avisosWebActivos(env: string | undefined = process.env.ASEGURA_AVISOS_WEB_ACTIVOS): boolean {
  return env === '1'
}

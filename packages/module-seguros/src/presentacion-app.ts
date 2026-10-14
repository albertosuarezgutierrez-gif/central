// Campaña «presentación de la app» (14/10/2026): un correo a los LEADS antiguos de la cartera para
// recordarles que Alberto sigue ahí y presentarles el portal del cliente (gratis, seas cliente o no).
// NO es recaptación (no pregunta por un seguro concreto) ni renovación.
//
// Aquí lo PURO y compartido por las dos apps:
//  · el texto y el HTML del correo (asegura lo manda),
//  · la forma del enlace personal `?r=` y de la cookie que lo lleva hasta el alta (el portal la lee),
//  · el embudo de la campaña (enviado → entregado → abierto → clic → visita → registrado).
// El token en sí (aleatorio + hash) vive en `presentacion-app-ref.ts`: usa `node:crypto` y este fichero
// se exporta desde el índice, que también consumen pantallas de cliente.
import { MEDIADOR, telefonoLegible } from './mediador.ts'
import { nombreDePila } from './nombre-de-pila.ts'
import { conMarcaCorreo } from './correo-marca.ts'

/** Valor de `campana_envio.campana` y del tag `categoria` de Resend. */
export const CAMPANA_PRESENTACION_APP = 'presentacion_app'

/** Parámetro de la URL del portal que lleva el identificador OPACO del envío (nunca el cliente_id). */
export const PARAMETRO_REF = 'r'

/** Cookie (httpOnly) que el portal pone al registrar la visita y lee al crear la identidad. */
export const COOKIE_REF_CAMPANA = 'asegura_ref'
/** Días que la cookie sobrevive: quien abre el correo y se registra a la semana sigue contando. */
export const DIAS_COOKIE_REF = 30

/** 16 bytes en base64url = 22 caracteres. Cualquier otra cosa no es un `?r=` nuestro. */
const REF_RE = /^[A-Za-z0-9_-]{22}$/

/** `true` solo si tiene FORMA de ref; no dice si existe. */
export function esRefValido(r: unknown): r is string {
  return typeof r === 'string' && REF_RE.test(r)
}

/** Enlace personal al portal. Aterriza en la entrada («pon tu correo»); el `?r=` solo atribuye. */
export function enlacePresentacion(ref: string, portal: string = MEDIADOR.identidad.portal): string {
  return `${portal.replace(/\/$/, '')}/?${PARAMETRO_REF}=${encodeURIComponent(ref)}`
}

/** Lee el ref de una cabecera `Cookie` cruda. `null` si no está o no tiene forma de ref. */
export function refDeCabeceraCookie(cabecera: string | null | undefined): string | null {
  if (!cabecera) return null
  for (const trozo of cabecera.split(';')) {
    const i = trozo.indexOf('=')
    if (i < 0) continue
    if (trozo.slice(0, i).trim() !== COOKIE_REF_CAMPANA) continue
    const valor = trozo.slice(i + 1).trim()
    return esRefValido(valor) ? valor : null
  }
  return null
}

// ── El correo ─────────────────────────────────────────────────────────────────────────────────────

export type CorreoPresentacion = { asunto: string; texto: string; html: string; variante: VariantePresentacion }

/**
 * Variantes A/B (asunto + primer párrafo; el resto del correo es idéntico, para que la diferencia que se
 * mida sea SOLO esa). La variante se guarda en cada envío (`campana_envio.variante`) y el embudo se parte
 * por ella. Añadir una variante = una entrada aquí; NUNCA cambiar el texto de una ya enviada (el embudo
 * de esa letra mezclaría dos mensajes): se crea otra letra.
 */
export const VARIANTES_PRESENTACION = {
  A: {
    asunto: 'Sigo aquí, y te presento una app gratis para tus seguros',
    intro: { texto: 'Hace tiempo hablamos de tus seguros y solo quería recordarte que sigo aquí para lo que necesites.', fuerte: 'sigo aquí para lo que necesites' },
    puente: 'Y aprovecho para presentarte nuestra nueva app, que es GRATUITA:',
  },
  B: {
    asunto: 'Una app gratis para tener todos tus seguros a mano',
    intro: { texto: 'Te escribo para presentarte nuestra nueva app y, de paso, recordarte que sigo aquí para lo que necesites.', fuerte: 'sigo aquí para lo que necesites' },
    puente: 'Es GRATUITA y sirve para esto:',
  },
} as const
export type VariantePresentacion = keyof typeof VARIANTES_PRESENTACION
export const LETRAS_VARIANTE: readonly VariantePresentacion[] = Object.keys(VARIANTES_PRESENTACION) as VariantePresentacion[]

export function esVariantePresentacion(v: unknown): v is VariantePresentacion {
  return typeof v === 'string' && (LETRAS_VARIANTE as readonly string[]).includes(v)
}

/**
 * Variantes activas desde una env tipo `A,B` (o `A`). Vacía, ilegible o sin ninguna letra conocida →
 * todas. Repartir por turno (`varianteDeTurno`) deja los grupos del mismo tamaño en cada lote.
 */
export function variantesActivas(env: string | null | undefined): VariantePresentacion[] {
  const pedidas = (env ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(esVariantePresentacion)
  const unicas = [...new Set(pedidas)]
  return unicas.length > 0 ? unicas : [...LETRAS_VARIANTE]
}

export function varianteDeTurno(i: number, activas: readonly VariantePresentacion[]): VariantePresentacion {
  const lista = activas.length > 0 ? activas : LETRAS_VARIANTE
  return lista[Math.abs(Math.floor(i)) % lista.length]!
}

/** Asunto de la variante A (la de referencia). */
export const ASUNTO_PRESENTACION_APP = VARIANTES_PRESENTACION.A.asunto

const VENTAJAS = [
  'Controla todos tus seguros en un sitio, estén con nosotros o no.',
  'Sin darte de alta: pones tu correo, metes el código que te llega y listo.',
  'Te avisa de la ITV, de los vencimientos y de lo que tú quieras recordar.',
  'Está pensada para el móvil.',
] as const

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Pie LSSI/RGPD: quién escribe, por qué, cómo darse de baja. Datos SIEMPRE de `MEDIADOR`. */
export function pieLegalPresentacion(bajaUrl: string): string {
  const m = MEDIADOR.identidad
  return [
    `Te escribo porque en su día tuvimos contacto por un seguro y tu correo quedó en nuestra agenda.`,
    `Responsable: ${m.nombre} (${MEDIADOR.marca}), ${m.figura.replace(/\s*\(.*\)$/, '').toLowerCase()} inscrito en la DGSFP con la clave ${m.claveDgsfp}. ${m.domicilio}. ${m.email}.`,
    `Si no quieres recibir más correos como este, date de baja con un clic: ${bajaUrl}`,
    `Privacidad: ${m.web}/legal/privacidad`,
  ].join('\n')
}

/**
 * El correo de presentación. `nombre` puede venir vacío o roto del volcado: sin nombre de pila
 * reconocible se saluda sin nombre (nunca «Hola null»).
 */
export function correoPresentacionApp(d: {
  nombre: string | null | undefined
  enlace: string
  bajaUrl: string
  variante?: VariantePresentacion
}): CorreoPresentacion {
  const variante: VariantePresentacion = d.variante ?? 'A'
  const v = VARIANTES_PRESENTACION[variante]
  const pila = nombreDePila(d.nombre)
  const saludo = pila ? `Hola ${pila}:` : 'Hola:'
  const firmaNombre = MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')
  const contacto = `${MEDIADOR.marca} · ${telefonoLegible()} · ${MEDIADOR.identidad.email}`

  const texto = [
    saludo,
    '',
    `Soy Alberto, de ${MEDIADOR.marca}. ${v.intro.texto}`,
    '',
    v.puente,
    '',
    ...VENTAJAS.map((v) => `· ${v}`),
    '',
    `Entra aquí: ${d.enlace}`,
    '',
    'Un saludo,',
    firmaNombre,
    contacto,
    '',
    '—',
    pieLegalPresentacion(d.bajaUrl),
  ].join('\n')

  const titular = "font-family:Quicksand,'Nunito Sans',system-ui,sans-serif;font-weight:700"
  const p = 'margin:0 0 14px;font-size:16px;line-height:1.55'
  const pieHtml = pieLegalPresentacion(d.bajaUrl)
    .split('\n')
    .map((l) => escapar(l))
    .map((l) => l.replace(escapar(d.bajaUrl), `<a href="${escapar(d.bajaUrl)}" style="color:#5a6280">${escapar(d.bajaUrl)}</a>`))
    .join('<br>')
  const cuerpo = [
    `<p style="${p}">${escapar(saludo)}</p>`,
    `<p style="${p}">Soy Alberto, de ${escapar(MEDIADOR.marca)}. ${escapar(v.intro.texto).replace(escapar(v.intro.fuerte), `<strong>${escapar(v.intro.fuerte)}</strong>`)}</p>`,
    `<p style="${p}">${escapar(v.puente).replace('GRATUITA', '<strong>gratuita</strong>')}</p>`,
    `<ul style="margin:0 0 18px;padding-left:20px;font-size:16px;line-height:1.55">${VENTAJAS.map((v) => `<li style="margin:0 0 6px">${escapar(v)}</li>`).join('')}</ul>`,
    `<p style="margin:0 0 22px"><a href="${escapar(d.enlace)}" style="display:inline-block;background:#3364ee;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-size:16px;${titular}">Abrir la app</a></p>`,
    `<p style="${p}">Un saludo,<br><span style="${titular}">${escapar(firmaNombre)}</span><br><span style="font-size:14px;color:#5a6280">${escapar(contacto)}</span></p>`,
    `<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e6e9f5;font-size:12px;line-height:1.5;color:#5a6280">${pieHtml}</p>`,
  ].join('')

  return { asunto: v.asunto, texto, html: conMarcaCorreo(cuerpo), variante }
}

/** Cabeceras de baja de un clic (RFC 2369 + RFC 8058). Gmail/Yahoo las exigen a remitentes masivos. */
export function cabecerasBaja(bajaUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${bajaUrl}>, <mailto:${MEDIADOR.identidad.email}?subject=Baja>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

// ── El embudo ─────────────────────────────────────────────────────────────────────────────────────

export type FilaEmbudo = {
  /** `false` = el envío falló al salir (no cuenta como enviado). */
  enviado: boolean
  /**
   * Tipos de evento de Resend recibidos para ese correo (`email.delivered`, `email.opened`…).
   * `null` = sin id de Resend o no se pudieron leer: NO se sabe, no es «nada».
   */
  eventos: readonly string[] | null
  visita: boolean
  registrado: boolean
  baja: boolean
}

export type EmbudoCampana = {
  enviados: number
  fallidos: number
  /** `null` = algún enviado no tiene eventos legibles: no se puede afirmar la cifra. */
  entregados: number | null
  abiertos: number | null
  clics: number | null
  visitas: number
  registrados: number
  rebotados: number | null
  bajas: number
}

const ETAPA_ENTREGADO = 1
const ETAPA_ABIERTO = 2
const ETAPA_CLIC = 3
const ETAPA_VISITA = 4
const ETAPA_REGISTRADO = 5

/**
 * Etapa MÁS AVANZADA con prueba. Cada etapa implica las anteriores: un registrado con `?r=` visitó, una
 * visita con `?r=` es un clic (aunque Resend no lo viera: bloqueadores, o el enlace copiado a mano), un
 * clic implica abrir (el píxel de apertura lo bloquean muchos clientes de correo) y abrir implica entregar.
 * Así el embudo nunca «crece» hacia abajo.
 */
function etapa(f: FilaEmbudo): number {
  if (f.registrado) return ETAPA_REGISTRADO
  if (f.visita) return ETAPA_VISITA
  const ev = f.eventos ?? []
  if (ev.includes('email.clicked')) return ETAPA_CLIC
  if (ev.includes('email.opened')) return ETAPA_ABIERTO
  if (ev.includes('email.delivered')) return ETAPA_ENTREGADO
  return 0
}

export function embudoCampana(filas: readonly FilaEmbudo[]): EmbudoCampana {
  const enviados = filas.filter((f) => f.enviado)
  // Un enviado sin eventos legibles deja las etapas de Resend en «no se sabe»… salvo que la visita o
  // el registro ya prueben esas etapas por sí solos.
  const hayDesconocidos = enviados.some((f) => f.eventos === null && !f.visita && !f.registrado)
  const cuenta = (min: number) => enviados.filter((f) => etapa(f) >= min).length
  return {
    enviados: enviados.length,
    fallidos: filas.length - enviados.length,
    entregados: hayDesconocidos ? null : cuenta(ETAPA_ENTREGADO),
    abiertos: hayDesconocidos ? null : cuenta(ETAPA_ABIERTO),
    clics: hayDesconocidos ? null : cuenta(ETAPA_CLIC),
    visitas: cuenta(ETAPA_VISITA),
    registrados: cuenta(ETAPA_REGISTRADO),
    rebotados: hayDesconocidos
      ? null
      : enviados.filter((f) => (f.eventos ?? []).some((t) => t === 'email.bounced' || t === 'email.complained' || t === 'email.suppressed')).length,
    bajas: enviados.filter((f) => f.baja).length,
  }
}

export type EtapaPersona = 'fallido' | 'sin_datos' | 'enviado' | 'entregado' | 'abierto' | 'clic' | 'visita' | 'registrado'

/**
 * Hasta dónde llegó UNA persona, con la misma regla de implicación que el embudo. `sin_datos` = salió pero
 * no hay eventos legibles: no se afirma ni que llegara ni que no.
 */
export function etapaPersona(f: FilaEmbudo): EtapaPersona {
  if (!f.enviado) return 'fallido'
  const e = etapa(f)
  if (e === ETAPA_REGISTRADO) return 'registrado'
  if (e === ETAPA_VISITA) return 'visita'
  if (e === ETAPA_CLIC) return 'clic'
  if (e === ETAPA_ABIERTO) return 'abierto'
  if (e === ETAPA_ENTREGADO) return 'entregado'
  return f.eventos === null ? 'sin_datos' : 'enviado'
}

/** El embudo partido por una clave (lote, variante…), ordenado por ella. Para comparar día a día y A/B. */
export function embudoPorGrupo<T extends FilaEmbudo>(filas: readonly T[], clave: (f: T) => string): { grupo: string; embudo: EmbudoCampana }[] {
  const grupos = new Map<string, T[]>()
  for (const f of filas) {
    const k = clave(f)
    const g = grupos.get(k)
    if (g) g.push(f)
    else grupos.set(k, [f])
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([grupo, fs]) => ({ grupo, embudo: embudoCampana(fs) }))
}

// «El inquilino PIDE precio» (27/10/2026, punto 5 de docs/ESTUDIO-PATRIMONIO-MERCADO.md §7) — reglas PURAS del puente
// `POST /api/portal/patrimonio/inquilino-precio`. Sin BD ni red.
//
// Modelo aprobado por Alberto: el inquilino PULSA «¿Quieres precio de un seguro para tus cosas y tu responsabilidad civil?»
// en «Mi alquiler» y deja su nombre y UN contacto. Es una petición expresa del interesado (medidas precontractuales,
// art. 6.1.b RGPD): sirve SOLO para contestar a esa petición. NO es un consentimiento comercial (ese vive en el portal,
// en `portal_patrimonio_inquilino_consentimiento`, y NO cruza este puente).
//
// 🚨 Lo que NO acepta ni escribe, a propósito:
//  · Nada del PROPIETARIO: ni `clienteId`, ni titular, ni inmueble, ni contrato, ni renta, ni dirección. La oportunidad
//    cuelga de una ficha NUEVA del propio inquilino, y `info_riesgo` no lleva ninguna clave que la ate a un inmueble o a un
//    contrato (`CLAVES_INFO_RIESGO`, cepo en el test): así ningún lector de peticiones del propietario
//    (`peticionesPedirPrecioAbiertas`, `origen = 'portal:patrimonio'` exacto; señales, `like 'portal:patrimonio%'`) la ve.
//  · Ningún contacto con una ficha que ya exista: el alta va SIEMPRE con `forzar` (ficha nueva). Un móvil o un correo
//    pueden ser de un HOGAR (el del propietario, por ejemplo): fundir por ese dato sería atribuirle la petición a otro.
//    Si coincide, el historial del alta lo dice («comparte teléfono/email con otra ficha, a sabiendas») y la tarea avisa.
//  · Ningún envío: crea una ficha de lead, una oportunidad y una tarea para la correduría. Telegram, solo ids.
//  · Ni la nota libre ni el consentimiento comercial: no existen en este cuerpo.

export const ORIGEN_INQUILINO_PRECIO = 'portal:inquilino'
export const TIPO_INQUILINO_PRECIO = 'inquilino_hogar'

/** Lo que pide, lista CERRADA (espejo de `QUE_PIDE_INQUILINO` del portal, que lo valida antes). */
export const QUE_PIDE_INQUILINO = ['contenido', 'rc', 'ambos'] as const
export type QuePideInquilino = (typeof QUE_PIDE_INQUILINO)[number]

/** Canal preferido para que la correduría le conteste. Uno solo: es el que escribió. */
export const CANALES_INQUILINO = ['correo', 'telefono'] as const
export type CanalInquilino = (typeof CANALES_INQUILINO)[number]

/** Las ÚNICAS claves de `info_riesgo` de esta oportunidad. Ninguna ata al propietario (cepo en el test). */
export const CLAVES_INFO_RIESGO = ['origen', 'tipo', 'que', 'canal', 'identidadPortal'] as const

/** Una petición más vieja que esto ya no impide pedir otra. */
export const DIAS_SOLICITUD_VIVA = 120

export type SolicitudInquilino = {
  identidadId: string
  que: QuePideInquilino
  nombre: string
  canal: CanalInquilino
  /** Tal como lo escribió (el alta lo vuelve a normalizar y lo cifra). */
  contacto: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/gu, '').replace(/\s+/g, ' ').trim()
  return t.length >= 1 && t.length <= max ? t : null
}

/**
 * El cuerpo del puente. Se leen SOLO cinco campos; cualquier otro (un `clienteId`, un `contratoId`, `ofertas`…) se ignora.
 * La forma fina del nombre y del contacto la vuelve a revisar `revisarAlta` al dar de alta la ficha.
 */
export function validarSolicitudInquilino(cuerpo: unknown): { ok: true; datos: SolicitudInquilino } | { ok: false; campo: string } {
  const b = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : {}
  if (typeof b.identidadId !== 'string' || !UUID.test(b.identidadId.trim())) return { ok: false, campo: 'identidadId' }
  if (typeof b.que !== 'string' || !(QUE_PIDE_INQUILINO as readonly string[]).includes(b.que)) return { ok: false, campo: 'que' }
  const nombre = texto(b.nombre, 80)
  if (nombre === null) return { ok: false, campo: 'nombre' }
  if (typeof b.canal !== 'string' || !(CANALES_INQUILINO as readonly string[]).includes(b.canal)) return { ok: false, campo: 'canal' }
  const contacto = texto(b.contacto, 120)
  if (contacto === null) return { ok: false, campo: 'contacto' }
  return {
    ok: true,
    datos: { identidadId: b.identidadId.trim().toLowerCase(), que: b.que as QuePideInquilino, nombre, canal: b.canal as CanalInquilino, contacto },
  }
}

/** Ramo de la oportunidad: solo RC → `responsabilidad_civil`; contenido (con o sin RC) → `hogar` (el de inquilino lo lleva). */
export function ramoSolicitudInquilino(que: QuePideInquilino): 'hogar' | 'responsabilidad_civil' {
  return que === 'rc' ? 'responsabilidad_civil' : 'hogar'
}

const QUE_LEGIBLE: Record<QuePideInquilino, string> = {
  contenido: 'sus cosas (contenido)',
  rc: 'su responsabilidad civil como inquilino',
  ambos: 'sus cosas (contenido) y su responsabilidad civil como inquilino',
}

/** Cuerpo del alta de la ficha: nombre + el contacto en su campo, `fuente='portal'` y SIEMPRE ficha nueva (`forzar`). */
export function cuerpoAltaInquilino(d: SolicitudInquilino): Record<string, unknown> {
  return {
    nombre: d.nombre,
    ...(d.canal === 'correo' ? { email: d.contacto } : { telefono: d.contacto }),
    fuente: 'portal',
    forzar: true,
    notas: notasSolicitudInquilino(d.que),
  }
}

/** `notas` de la ficha (y del historial del alta). Sin dirección, sin propietario, sin renta. */
export function notasSolicitudInquilino(que: QuePideInquilino): string {
  return `Inquilino que pide precio desde «Mi alquiler» del portal: seguro para ${QUE_LEGIBLE[que]}. Solo para contestar a su petición (no ha dado consentimiento comercial por esta vía).`
}

export function infoRiesgoSolicitud(d: Pick<SolicitudInquilino, 'que' | 'canal' | 'identidadId'>): Record<(typeof CLAVES_INFO_RIESGO)[number], string> {
  return { origen: ORIGEN_INQUILINO_PRECIO, tipo: TIPO_INQUILINO_PRECIO, que: d.que, canal: d.canal, identidadPortal: d.identidadId }
}

export function textoTareaInquilino(x: { que: QuePideInquilino; canal: CanalInquilino; contactoEnOtraFicha: boolean }): string {
  const via = x.canal === 'correo' ? 'por correo' : 'por teléfono'
  const aviso = x.contactoEnOtraFicha ? ' ⚠️ Ese contacto ya está en OTRA ficha: no es necesariamente la misma persona, revísalo antes de contestar.' : ''
  return `Inquilino (portal, «Mi alquiler») pide precio de seguro para ${QUE_LEGIBLE[x.que]}. Prefiere que le contestemos ${via} (el dato está en la ficha). Solo para responder a esta petición; su propietario no sabe que lo ha pedido.${aviso}`
}

/** Telegram: SOLO ids (ni nombre, ni contacto, ni dirección). */
export function textoAvisoInquilino(x: { oportunidadId: string; que: QuePideInquilino }): string {
  return `🔑 Un inquilino pide precio desde el portal (${x.que})\nOportunidad ${x.oportunidadId}\nMírala en plataforma /correduria → Hoy.`
}

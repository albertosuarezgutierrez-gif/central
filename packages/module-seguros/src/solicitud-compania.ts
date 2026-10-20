// packages/module-seguros/src/solicitud-compania.ts
//
// «En la compañía» (20/10/2026): una oportunidad cuyo proyecto/solicitud está en el portal de la compañía, a la
// espera de que lo libere (suscripción, documentación, prima). PURO: decide, no escribe.
//
// 🚨 «En la compañía» NO es un valor del enum `estado_comercial` (como «Aparcada»): es la marca
// `compania_solicitud_num` sobre una oportunidad ABIERTA. Por qué (decisión de arquitectura, 20/10/2026): hay ~35
// listas de «estado abierto» escritas a mano en asegura y plataforma (`in ('competencia','en_negociacion',
// 'pendiente_cliente')`); un valor nuevo del enum habría dejado estas oportunidades FUERA de todas ellas (sin tareas
// colgadas, sin expediente en Mi mesa, una segunda abierta del mismo ramo permitida…). Y un valor de enum no se
// puede quitar después. Así la oportunidad conserva su estado y Mi mesa la pinta en su bloque.
//
// El nº de solicitud solo es único DENTRO de una compañía: se guarda con su compañía (`compania_solicitud_compania`).

/** Compañías cuyo nº de solicitud se puede apuntar (las mismas claves que los eventos de correo). */
export const COMPANIAS_SOLICITUD = ['occident', 'reale', 'mapfre', 'allianz'] as const
export type CompaniaSolicitud = (typeof COMPANIAS_SOLICITUD)[number]

export const ROTULO_COMPANIA_SOLICITUD: Record<CompaniaSolicitud, string> = {
  occident: 'Occident', reale: 'Reale', mapfre: 'Mapfre', allianz: 'Allianz',
}

const ABIERTOS: ReadonlySet<string> = new Set(['competencia', 'en_negociacion', 'pendiente_cliente'])

/** Sin espacios, puntos ni guiones y sin ceros de relleno (el enlace de Occident lleva `00<nº>`). `null` = no es un nº. */
export function normalizarNumeroSolicitud(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = String(v).replace(/[\s.\-/]/g, '').replace(/^0+/, '')
  return /^\d{6,12}$/.test(t) ? t : null
}

export type PeticionSolicitud = { numero?: unknown; compania?: unknown }

/** Lo que hay que escribir. `numero: null` = quitar la marca (vuelve a ser una oportunidad normal). */
export type CambioSolicitud = {
  numero: string | null
  compania: CompaniaSolicitud | null
  /** Estado del enum tras el cambio: `competencia` (sin trabajar) pasa a `en_negociacion`; el resto se queda. */
  estado: string
  /** El nº cambia (o se quita): el último estado/enlace leídos eran de OTRA solicitud y se borran. */
  reiniciarEstado: boolean
}

/**
 * Apuntar / cambiar / quitar el nº de solicitud de una oportunidad. Solo sobre una ABIERTA: una ganada o perdida no
 * está «en la compañía». Apuntarlo es trabajo hecho: una `competencia` (por contactar) pasa a `en_negociacion`.
 */
export function validarSolicitudCompania(
  actual: { estado: string; numero: string | null; compania: string | null },
  p: PeticionSolicitud,
): { ok: true; cambio: CambioSolicitud } | { ok: false; motivo: string } {
  if (!ABIERTOS.has(actual.estado)) return { ok: false, motivo: `Una oportunidad «${actual.estado}» no está en la compañía: reábrela antes.` }
  const quitar = p.numero === null || p.numero === ''
  if (quitar) {
    if (actual.numero === null) return { ok: false, motivo: 'No tiene nº de solicitud que quitar.' }
    return { ok: true, cambio: { numero: null, compania: null, estado: actual.estado, reiniciarEstado: true } }
  }
  const numero = normalizarNumeroSolicitud(p.numero)
  if (numero === null) return { ok: false, motivo: 'El nº de solicitud son de 6 a 12 cifras.' }
  const compania = COMPANIAS_SOLICITUD.find((c) => c === p.compania)
  if (!compania) return { ok: false, motivo: `Falta la compañía (una de: ${COMPANIAS_SOLICITUD.join(', ')}).` }
  const mismo = actual.numero === numero && actual.compania === compania
  return {
    ok: true,
    cambio: {
      numero, compania,
      estado: actual.estado === 'competencia' ? 'en_negociacion' : actual.estado,
      reiniciarEstado: !mismo,
    },
  }
}

/** ¿Está «en la compañía»? Abierta y con nº de solicitud. Una cerrada con nº guardado ya no lo está. */
export function estaEnCompania(o: { estado: string; companiaSolicitudNum: string | null }): boolean {
  return ABIERTOS.has(o.estado) && o.companiaSolicitudNum !== null && o.companiaSolicitudNum !== ''
}

/** ¿El estado que dice la compañía pide que le mandemos documentación? («PRIMA / PROY * PTE DOCUMENTACION»). */
export function pideDocumentacion(estado: string | null | undefined): boolean {
  return /\bPTE\.?\s+DOCUMENTACI[OÓ]N\b|\bPENDIENTE\s+(?:DE\s+)?DOCUMENTACI[OÓ]N\b/i.test(estado ?? '')
}

/** Texto (y llave de idempotencia) de la tarea «enviar documentación». */
export function textoTareaDocumentacion(compania: string, numero: string): string {
  const nombre = ROTULO_COMPANIA_SOLICITUD[compania as CompaniaSolicitud] ?? compania
  return `Enviar documentación a ${nombre} — Solicitud ${numero}`
}

/**
 * El enlace al proyecto, solo si es del portal de ESA compañía, por https y del MISMO nº. Cualquier otra cosa →
 * `null` (la pantalla lo pinta como enlace: nunca un `javascript:` ni otro dominio colado por un correo).
 */
export function urlSolicitudValida(url: unknown, compania: string, numero: string): string | null {
  if (typeof url !== 'string' || url.length > 1000) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:') return null
  const hosts: Record<string, readonly string[]> = { occident: ['portaloccident.gco.global'] }
  if (!(hosts[compania] ?? []).includes(u.hostname.toLowerCase())) return null
  const id = /[?&]idSubscripcio=0*(\d{6,12})\b/i.exec(url)?.[1]
  return id !== undefined && id === numero.replace(/^0+/, '') ? url : null
}

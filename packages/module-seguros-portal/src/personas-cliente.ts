// Lo que el CLIENTE ve de las personas de su póliza y de los terceros de sus siniestros
// (04/10/2026, datos de CIMA de asegura#880).
//
// Puro y por LISTA BLANCA: cada salida se construye campo a campo desde una lista cerrada; lo que no
// está en la lista no existe para el portal, aunque mañana la ingesta añada otro campo a la figura.
// Se aplica DOS veces: en el borde de `apps/asegura` (`/api/portal/personas-poliza`, lo que cruza
// el puente) y otra vez en el portal al recibirlo (una pantalla no es un control de acceso, y un
// asegura viejo o roto no debe poder colar nada).
//
// ─── Las reglas, enteras ────────────────────────────────────────────────────
//  1. SUS PROPIAS figuras, completas (para que confirme sus datos): nombre, domicilio, teléfono,
//     email, fecha de nacimiento, orden/%. Del documento solo «consta» (el NIF no cruza).
//     «Propia» = identidad, no nombre: el papel `tomador` de una póliza cuyo tomador es una ficha
//     suya (salvo que CIMA traiga un documento DISTINTO al de sus fichas), o el MISMO documento que
//     una de sus fichas. Dos documentos distintos no se funden
//     jamás, y sin documento un nombre igual NO basta (una homónima no le enseña sus datos).
//  2. Las DEMÁS personas de una póliza suya (es el tomador): solo papel y nombre. Nunca su
//     contacto ni su domicilio. En una póliza ajena (la ve por figurar en ella), las demás no salen.
//  3. TERCEROS del siniestro: SOLO papel, nombre, matrícula y compañía del contrario. NUNCA
//     documento, teléfono, email ni domicilio de un tercero (ni responsabilidad, nº de póliza ni
//     código DGS de su compañía). La compañía solo si es el contrario o su conductor.

import type { FiguraFicha, TerceroFicha } from '@central/module-seguros'

// ─── Terceros ───────────────────────────────────────────────────────────────

/** Lo ÚNICO que el portal enseña de un tercero. Añadir un campo aquí es una decisión legal, no técnica. */
export const CAMPOS_TERCERO_CLIENTE = ['papel', 'etiqueta', 'nombre', 'matricula', 'compania'] as const
export type CampoTerceroCliente = (typeof CAMPOS_TERCERO_CLIENTE)[number]
export type TerceroCliente = { [K in CampoTerceroCliente]: K extends 'papel' | 'etiqueta' ? string : string | null }

/** Campos de un tercero que NUNCA llegan al cliente (el cepo los recorre uno a uno). */
export const CAMPOS_TERCERO_PROHIBIDOS = [
  'documentoConsta', 'documentoFinal', 'documentoCifrado', 'documento', 'tipoDocumento',
  'telefono', 'email', 'domicilio', 'fechaNacimiento',
  'responsabilidad', 'numeroPoliza', 'codigoEntidadDgs', 'claseFigura', 'tipoPersona', 'orden', 'porcentaje',
] as const

const PAPELES_CON_COMPANIA = new Set(['contrario', 'conductor_contrario'])

const texto = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' || t.startsWith('v1:') ? null : t.slice(0, max)
}

/** Un tercero → lo que ve el cliente. Lista blanca: se copia SOLO lo de `CAMPOS_TERCERO_CLIENTE`. */
export function terceroParaCliente(t: Partial<TerceroFicha> | Record<string, unknown>): TerceroCliente | null {
  const r = t as Record<string, unknown>
  const papel = texto(r.papel, 60) ?? 'otro'
  const salida = {} as Record<CampoTerceroCliente, string | null>
  for (const k of CAMPOS_TERCERO_CLIENTE) salida[k] = texto(r[k])
  salida.papel = papel
  salida.etiqueta = texto(r.etiqueta, 80) ?? 'Tercero'
  if (!PAPELES_CON_COMPANIA.has(papel)) salida.compania = null
  if (salida.nombre === null && salida.matricula === null && salida.compania === null) return null
  return salida as TerceroCliente
}

export function tercerosParaCliente(lista: unknown): TerceroCliente[] {
  if (!Array.isArray(lista)) return []
  return lista
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x))
    .map(terceroParaCliente)
    .filter((x): x is TerceroCliente => x !== null)
}

// ─── Figuras de la póliza ───────────────────────────────────────────────────

/** Lo que ve el cliente de SU propia figura. Sin `documentoCifrado` ni documento entero. */
export const CAMPOS_FIGURA_PROPIA = [
  'papel', 'etiqueta', 'nombre', 'domicilio', 'telefono', 'email',
  'documentoConsta', 'fechaNacimiento', 'orden', 'porcentaje',
] as const
export type FiguraPropiaCliente = Pick<FiguraFicha, (typeof CAMPOS_FIGURA_PROPIA)[number]>

/** Lo que ve el cliente de OTRA persona de su póliza. */
export const CAMPOS_FIGURA_AJENA = ['papel', 'etiqueta', 'nombre'] as const
export type FiguraAjenaCliente = { papel: string; etiqueta: string; nombre: string | null }

const DOMICILIO = ['direccion', 'claseVia', 'cp', 'localidad', 'provincia', 'pais'] as const

function domicilio(v: unknown): FiguraFicha['domicilio'] {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const d = Object.fromEntries(DOMICILIO.map((k) => [k, texto(o[k])])) as NonNullable<FiguraFicha['domicilio']>
  return Object.values(d).some((x) => x !== null) ? d : null
}

export function figuraPropiaParaCliente(f: Partial<FiguraFicha> | Record<string, unknown>): FiguraPropiaCliente {
  const r = f as Record<string, unknown>
  return {
    papel: texto(r.papel, 60) ?? 'otro',
    etiqueta: texto(r.etiqueta, 80) ?? 'Figura',
    nombre: texto(r.nombre),
    domicilio: domicilio(r.domicilio),
    telefono: texto(r.telefono, 40),
    email: texto(r.email),
    documentoConsta: r.documentoConsta === true,
    fechaNacimiento: texto(r.fechaNacimiento, 10),
    orden: texto(r.orden, 20),
    porcentaje: texto(r.porcentaje, 20),
  }
}

export function figuraAjenaParaCliente(f: Partial<FiguraFicha> | Record<string, unknown>): FiguraAjenaCliente | null {
  const r = f as Record<string, unknown>
  const nombre = texto(r.nombre)
  if (nombre === null) return null
  return { papel: texto(r.papel, 60) ?? 'otro', etiqueta: texto(r.etiqueta, 80) ?? 'Figura', nombre }
}

/** Documento normalizado para comparar identidad (no se guarda ni se enseña así). */
export function documentoIdentidad(d: string | null | undefined): string | null {
  const t = typeof d === 'string' ? d.replace(/[\s.-]/g, '').toUpperCase() : ''
  return t === '' || /^NOIDENTIFICADO$/.test(t) ? null : t
}

/** Una figura con su documento EN CLARO (solo en el servidor de asegura; nunca cruza). */
export type FiguraConDocumento = { figura: FiguraFicha; documento: string | null }

export type PersonasParaCliente = {
  /** Las figuras que SON él (regla 1). */
  propias: FiguraPropiaCliente[]
  /** El resto de personas de una póliza SUYA, solo papel y nombre (regla 2). */
  otras: FiguraAjenaCliente[]
}

/**
 * Reparte las figuras de una póliza entre «tú» y «los demás».
 *  - `tomadorEsPropio`: el tomador de la póliza (`polizas.cliente_id`) es una ficha vinculada a la identidad.
 *  - `documentosPropios`: documentos (en claro) de sus fichas vinculadas.
 * Sin tomador propio (la ve por figurar en ella), `otras` sale vacía.
 */
export function personasParaCliente(
  entradas: readonly FiguraConDocumento[],
  ctx: { tomadorEsPropio: boolean; documentosPropios: readonly (string | null)[] },
): PersonasParaCliente {
  const docs = new Set(ctx.documentosPropios.map(documentoIdentidad).filter((x): x is string => x !== null))
  const propias: FiguraPropiaCliente[] = []
  const otras: FiguraAjenaCliente[] = []
  for (const { figura, documento } of entradas) {
    const doc = documentoIdentidad(documento)
    // El papel `tomador` con tomador propio es él SOLO si no hay documentos que se contradigan: con
    // documento de CIMA distinto del suyo (suplemento con otro tomador, mal emparejamiento) NO lo es.
    const tomadorSuyo = figura.papel === 'tomador' && ctx.tomadorEsPropio && (doc === null || docs.size === 0 || docs.has(doc))
    const esSuya = tomadorSuyo || (doc !== null && docs.has(doc))
    if (esSuya) propias.push(figuraPropiaParaCliente(figura))
    else if (ctx.tomadorEsPropio) {
      const a = figuraAjenaParaCliente(figura)
      if (a) otras.push(a)
    }
  }
  return { propias, otras }
}

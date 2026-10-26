// P17 (26/10/2026) — lado del INQUILINO: lógica PURA (puertos inyectados, sin prisma ni sesión). La BD real está en
// `inquilino-bd.ts`; las rutas son `app/api/inquilino/*` y las pantallas `app/inquilino/[token]` y `app/mi-alquiler/*`.
//
// 🚨 El token NO abre sesión: dice QUÉ contrato; el código al canal de la persona dice QUIÉN. El canje exige SESIÓN (identidad ya
// probada con código, como cualquier identidad) y un gesto explícito (POST). Un enlace es de UN USO.
// 🚨 AISLAMIENTO: el contrato de la URL es una PETICIÓN. Se busca DENTRO de los accesos VIVOS de la identidad de la cookie
// (`accesoParaContrato`); otro contrato, uno revocado o uno inexistente son la MISMA 404 (nunca 403). Lo que se lee después lleva
// SIEMPRE el par (contrato, inquilino) del acceso, nunca un id de la request.
// 🚨 Enlace muerto (no existe, anulado, gastado, caducado) = UNA respuesta: ni oráculo de tokens ni "ya lo usó otro".
// 🚨 Consentimiento comercial PROPIO: opcional, no premarcado, versionado y retirable; sin él, cero ofertas
// (`puedeRecibirOfertasInquilino`). Retirar el acceso no es retirar el consentimiento, pero sin acceso no hay ofertas.
import { createHash } from 'node:crypto'

import {
  TEXTO_CONSENTIMIENTO_INQUILINO,
  VERSION_CONSENTIMIENTO_INQUILINO,
  accesoParaContrato,
  consentimientoAdmisible,
  enlaceCanjeable,
  estadoConsentimiento,
  normalizarTokenEnlaceInquilino,
  puedeRecibirOfertasInquilino,
  type AccesoInquilino,
  type ConsentimientoInquilino,
  type VistaContratoInquilino,
} from '@central/module-patrimonio'

import { MAX_BYTES_DOCUMENTO, nombreSeguro, nombreConExtension } from '../patrimonio/documentos-api.ts'
import type { Respuesta } from '../patrimonio/gastos-api.ts'
import { tipoRealFactura, type TipoFactura } from '../patrimonio/tipo-fichero.ts'

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
/** UNA sola respuesta para los cuatro finales del enlace. */
const ENLACE_MUERTO: Respuesta = { status: 404, body: { error: 'enlace_no_valido' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MAX_JUSTIFICANTES_DIA = 10

export type EnlaceLeido = {
  id: string
  contratoId: string
  inquilinoId: string
  anuladoEn: Date | null
  caducaEn: Date | null
  usado: boolean
}

export type FicheroJustificante = { nombre: string; tamano: number; contenido: Buffer }
export type DescargaInquilino = { nombre: string; mime: TipoFactura; contenido: Buffer }

export interface PuertosInquilino {
  /** La identidad de la COOKIE (no del cuerpo). */
  identidadId: string
  ahora(): Date
  /** Único acceso por token: busca por HASH del token, sin filtrar por nadie. Solo devuelve el estado del enlace. */
  enlacePorHash(tokenHash: string): Promise<EnlaceLeido | null>
  hashToken(token: string): string
  /** Escribe el acceso (identidad ↔ enlace) y sella el uso. `ya_usado` = el índice único del enlace lo rechazó. */
  canjear(enlaceId: string): Promise<{ ok: true; contratoId: string } | { ok: false; motivo: 'ya_usado' | 'no_valido' }>
  /** TODOS los accesos de esta identidad (vivos y revocados); `accesoParaContrato` filtra. */
  accesos(): Promise<AccesoInquilino[]>
  /** La vista del contrato del acceso ya resuelto (par contrato+inquilino del ACCESO). */
  vista(acceso: AccesoInquilino): Promise<VistaContratoInquilino | null>
  /** Mis subidas (de esta identidad, de este inquilino). */
  misJustificantes(acceso: AccesoInquilino): Promise<Array<{ id: string; nombre: string; creadoEn: string }>>
  guardarJustificante(x: { acceso: AccesoInquilino; nombre: string; mime: TipoFactura; sha256: string; contenido: Buffer; ahora: Date }): Promise<
    { ok: true; id: string } | { ok: false; motivo: 'tope' | 'no_encontrado' }
  >
  /** Descarga SOLO de un recibo compartido con este acceso o de una subida mía. */
  descargar(acceso: AccesoInquilino, documentoId: string): Promise<DescargaInquilino | null>
  consentimientos(): Promise<ConsentimientoInquilino[]>
  registrarConsentimiento(x: { acceso: AccesoInquilino; concedido: boolean; versionTexto: string }): Promise<void>
  /** Sella la revocación `revocadoPor='inquilino'` de ESTE acceso (de esta identidad). */
  revocar(acceso: AccesoInquilino): Promise<boolean>
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** ¿Es canjeable este token? (la página sin sesión solo necesita un sí/no, sin datos). */
export async function enlaceVigente(p: Pick<PuertosInquilino, 'enlacePorHash' | 'hashToken' | 'ahora'>, tokenCrudo: unknown): Promise<boolean> {
  const token = normalizarTokenEnlaceInquilino(tokenCrudo)
  if (token === null) return false
  const e = await p.enlacePorHash(p.hashToken(token))
  return e !== null && enlaceCanjeable(e, p.ahora())
}

export async function responderCanjear(p: PuertosInquilino, tokenCrudo: unknown): Promise<Respuesta> {
  const token = normalizarTokenEnlaceInquilino(tokenCrudo)
  if (token === null) return ENLACE_MUERTO
  const e = await p.enlacePorHash(p.hashToken(token))
  if (e === null || !enlaceCanjeable(e, p.ahora())) return ENLACE_MUERTO
  const r = await p.canjear(e.id)
  if (!r.ok) return ENLACE_MUERTO
  return { status: 200, body: { contratoId: r.contratoId } }
}

/** Mis contratos (vivos) para la pantalla de inicio del inquilino. */
export async function responderMisContratos(p: PuertosInquilino): Promise<Respuesta> {
  const vivos = (await p.accesos()).filter((a) => a.identidadId === p.identidadId && a.revocadoEn === null)
  const contratos: Array<{ contratoId: string; inmueble: string | null }> = []
  for (const a of vivos) {
    const v = await p.vista(a)
    if (v) contratos.push({ contratoId: a.contratoId, inmueble: v.inmueble })
  }
  return { status: 200, body: { contratos } }
}

async function acceso(p: PuertosInquilino, contratoId: unknown): Promise<AccesoInquilino | null> {
  if (typeof contratoId !== 'string' || !UUID.test(contratoId)) return null
  return accesoParaContrato(await p.accesos(), p.identidadId, contratoId)
}

export async function responderMiContrato(p: PuertosInquilino, contratoId: unknown): Promise<Respuesta> {
  const a = await acceso(p, contratoId)
  if (!a) return NO_ENCONTRADO
  const vista = await p.vista(a)
  if (!vista) return NO_ENCONTRADO
  const consentimientos = await p.consentimientos()
  return {
    status: 200,
    body: {
      vista,
      justificantes: await p.misJustificantes(a),
      consentimiento: {
        estado: estadoConsentimiento(consentimientos),
        version: VERSION_CONSENTIMIENTO_INQUILINO,
        texto: TEXTO_CONSENTIMIENTO_INQUILINO,
      },
    },
  }
}

export async function responderConsentimiento(p: PuertosInquilino, contratoId: unknown, cuerpo: unknown): Promise<Respuesta> {
  const a = await acceso(p, contratoId)
  if (!a) return NO_ENCONTRADO
  const b = obj(cuerpo)
  if (typeof b.concedido !== 'boolean') return { status: 400, body: { error: 'datos_invalidos', campo: 'concedido' } }
  // Un «sí» exige haber visto la versión ACTUAL del texto; retirar se admite siempre.
  if (b.concedido && !consentimientoAdmisible(b.version)) return { status: 409, body: { error: 'texto_cambiado' } }
  await p.registrarConsentimiento({ acceso: a, concedido: b.concedido, versionTexto: VERSION_CONSENTIMIENTO_INQUILINO })
  return { status: 200, body: { estado: b.concedido ? 'concedido' : 'retirado' } }
}

/** La puerta de las ofertas al inquilino (para quien en el futuro las sirva): acceso vivo Y consentimiento vigente. */
export async function inquilinoAceptaOfertas(p: PuertosInquilino, contratoId: unknown): Promise<boolean> {
  const a = await acceso(p, contratoId)
  return puedeRecibirOfertasInquilino({ acceso: a, consentimientos: a ? await p.consentimientos() : [] })
}

export async function responderRevocar(p: PuertosInquilino, contratoId: unknown): Promise<Respuesta> {
  const a = await acceso(p, contratoId)
  if (!a) return NO_ENCONTRADO
  return (await p.revocar(a)) ? { status: 200, body: { ok: true } } : NO_ENCONTRADO
}

export async function responderSubirJustificante(p: PuertosInquilino, contratoId: unknown, fichero: FicheroJustificante | null): Promise<Respuesta> {
  const a = await acceso(p, contratoId)
  if (!a) return NO_ENCONTRADO
  if (!fichero) return { status: 400, body: { error: 'fichero_requerido' } }
  if (Math.max(fichero.tamano, fichero.contenido.length) > MAX_BYTES_DOCUMENTO) return { status: 413, body: { error: 'fichero_grande' } }
  const mime = tipoRealFactura(fichero.contenido)
  if (mime === null) return { status: 415, body: { error: 'formato_no_admitido' } }
  const nombre = nombreConExtension(nombreSeguro(fichero.nombre) || 'justificante', mime)
  const sha256 = createHash('sha256').update(fichero.contenido).digest('hex')
  const r = await p.guardarJustificante({ acceso: a, nombre, mime, sha256, contenido: fichero.contenido, ahora: p.ahora() })
  if (!r.ok) return r.motivo === 'tope' ? { status: 429, body: { error: 'tope_diario' } } : NO_ENCONTRADO
  return { status: 201, body: { id: r.id, nombre } }
}

export type RespuestaDescargaInquilino = Respuesta | { status: 200; fichero: DescargaInquilino }

export async function responderDescarga(p: PuertosInquilino, contratoId: unknown, documentoId: unknown): Promise<RespuestaDescargaInquilino> {
  const a = await acceso(p, contratoId)
  if (!a || typeof documentoId !== 'string' || !UUID.test(documentoId)) return NO_ENCONTRADO
  const f = await p.descargar(a, documentoId)
  return f ? { status: 200, fichero: f } : NO_ENCONTRADO
}

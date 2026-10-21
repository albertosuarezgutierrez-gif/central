// apps/asegura/lib/correo-documento.ts
//
// F1 del agente corredor de correo (21/10/2026, docs/CORREDURIA-AGENTE-CORREO.md §4.3): los PDF adjuntos de los correos
// de compañía pasan a `seguros.documentos`. PURO (sin BD ni red, `node --test`): validar lo que llega por el puerto y
// DECIDIR a qué ficha va. La escritura vive en `correo-documento-bd.ts`.
//
// Reglas:
// - El destino lo decide ASEGURA, no quien llama: sale de lo que ya se resolvió para ESE correo (las filas de
//   `correo_evento_entrante` del mismo Message-ID). Una sola póliza → póliza (y su cliente); varias pólizas del MISMO
//   cliente → solo el cliente; nada, o más de un cliente → SIN asignar (bandeja «Correos de compañía»).
// - 🚨 NUNCA por el nombre del tomador: ni aquí ni en la BD. Un correo sin nº que case se queda sin asignar y lo
//   asigna Alberto a mano (la sugerencia por nombre es solo eso, una sugerencia en pantalla que él confirma).
// - Solo PDF (la lista cerrada de `mimeDocumento`; nunca el `type` de quien llama) y ≤ 10 MB.

import { MAX_BYTES_DOCUMENTO, mimeDocumento, sinDatosSensibles } from '@central/module-seguros'

/** Lo que el triaje manda por cada adjunto. */
export type EntradaDocumentoCorreo = {
  mensajeId: string
  nombre: string
  mime: 'application/pdf'
  contenido: Buffer
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/

/** Nombre de fichero seguro para guardar (sin rutas, saltos ni nulos). */
export function nombreFicheroSeguro(v: unknown): string {
  const t = typeof v === 'string' ? v.replace(/[\r\n\0/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  return t === '' ? 'adjunto.pdf' : t
}

/**
 * Cuerpo de `POST /api/operador/correo/documento`: `{ mensajeId, nombre, mime, base64 }`. Un PDF de verdad (cabecera
 * `%PDF-`) de hasta 10 MB. No se fía del `mime` de quien llama: lo decide `mimeDocumento` y además se exige la firma.
 */
export function validarDocumentoCorreo(b: unknown): { ok: true; valor: EntradaDocumentoCorreo } | { ok: false; motivo: string } {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no válido' }
  const o = b as Record<string, unknown>
  const mensajeId = typeof o.mensajeId === 'string' ? o.mensajeId.trim() : ''
  if (mensajeId === '' || mensajeId.length > 300) return { ok: false, motivo: 'falta mensajeId (Message-ID del correo)' }
  const nombre = nombreFicheroSeguro(o.nombre)
  const mime = mimeDocumento({ type: typeof o.mime === 'string' ? o.mime : '', name: nombre })
  if (mime !== 'application/pdf') return { ok: false, motivo: 'solo se guardan PDF de los correos de compañía' }
  const b64 = typeof o.base64 === 'string' ? o.base64.replace(/\s+/g, '') : ''
  if (b64 === '' || !B64.test(b64)) return { ok: false, motivo: 'falta el fichero (base64)' }
  // Antes de decodificar: un base64 de más de 10 MB no se llega a cargar en memoria.
  if (Math.floor((b64.length * 3) / 4) > MAX_BYTES_DOCUMENTO + 2) return { ok: false, motivo: 'el fichero pasa de 10 MB' }
  const contenido = Buffer.from(b64, 'base64')
  if (contenido.length === 0 || contenido.length > MAX_BYTES_DOCUMENTO) return { ok: false, motivo: 'el fichero está vacío o pasa de 10 MB' }
  if (contenido.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, motivo: 'no es un PDF' }
  return { ok: true, valor: { mensajeId, nombre, mime, contenido } }
}

/** Lo resuelto para un elemento del correo (`correo_evento_entrante`). */
export type EventoResuelto = {
  estado: string
  clienteId: string | null
  polizaId: string | null
  siniestroId: string | null
}

export type DestinoDocumento =
  | { asignado: true; clienteId: string; polizaId: string | null; siniestroId: string | null; motivo: string }
  | { asignado: false; motivo: string }

const RESUELTOS: ReadonlySet<string> = new Set(['aplicado', 'duplicado_cima'])

/**
 * A qué ficha va el adjunto, a partir de lo que ya se resolvió del MISMO correo. Solo cuentan los elementos con
 * desenlace confirmado (`aplicado`/`duplicado_cima`) y con cliente. Sin elementos → sin asignar (no se adivina).
 */
export function elegirDestinoDocumento(eventos: readonly EventoResuelto[]): DestinoDocumento {
  const ok = eventos.filter((e) => RESUELTOS.has(e.estado) && e.clienteId)
  if (eventos.length === 0) return { asignado: false, motivo: 'el correo no trae ningún aviso que se haya podido leer' }
  if (ok.length === 0) return { asignado: false, motivo: 'el aviso del correo no casó con ninguna ficha' }
  const clientes = new Set(ok.map((e) => e.clienteId as string))
  if (clientes.size > 1) return { asignado: false, motivo: 'el correo habla de varios clientes: asígnalo a mano' }
  // Un elemento sin resolver en el mismo correo también puede ser de OTRO cliente: entonces no se elige.
  if (ok.length < eventos.length) return { asignado: false, motivo: 'parte del correo no casó con ninguna ficha: asígnalo a mano' }
  const clienteId = [...clientes][0]
  const polizas = new Set(ok.map((e) => e.polizaId).filter((p): p is string => !!p))
  const siniestros = new Set(ok.map((e) => e.siniestroId).filter((s): s is string => !!s))
  if (polizas.size === 1) {
    const polizaId = [...polizas][0]
    return { asignado: true, clienteId, polizaId, siniestroId: siniestros.size === 1 ? [...siniestros][0] : null, motivo: 'la póliza del aviso' }
  }
  return { asignado: true, clienteId, polizaId: null, siniestroId: null, motivo: polizas.size > 1 ? 'varias pólizas del mismo cliente: a su ficha' : 'el cliente del aviso' }
}

/**
 * ¿Se pueden mover TODOS los adjuntos sin asignar de un correo a la ficha de UNO de sus avisos? Solo si ese Message-ID
 * trae exactamente UN aviso (filas de `correo_evento_entrante` + devoluciones de `recibo_devolucion`). Con varios, un
 * PDF puede ser de otro cliente: se quedan en «Documentos sin asignar». `null` (no se ha podido contar) → no se mueve.
 */
export function puedeMoverAdjuntosDelCorreo(avisosDelCorreo: number | null): boolean {
  return avisosDelCorreo === 1
}

/** Nota de la ficha al archivar un adjunto: compañía y nombre del fichero, sin NIF/IBAN (el nombre puede llevarlos). */
export function notaDocumentoCorreo(compania: string | null, nombre: string, aMano: boolean): string {
  const cia = compania ? ` de ${compania}` : ''
  return `${aMano ? 'Asignado a mano: ' : ''}documento del correo${cia} archivado en la ficha — ${sinDatosSensibles(nombre).slice(0, 200)}`
}

// ── Asignar a mano desde la bandeja ──────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AsignacionEvento = { id: string; clienteId: string; oportunidadId: string | null }

/**
 * Cuerpo de `POST /api/operador/correo/evento/asignar`: `{ id, clienteId, oportunidadId? }`. El cliente es obligatorio;
 * la oportunidad, opcional (y obligatoria para una SOLICITUD: es lo que la engancha). El actor lo pone el servidor.
 */
export function validarAsignacionEvento(b: unknown): { ok: true; valor: AsignacionEvento } | { ok: false; motivo: string } {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no válido' }
  const o = b as Record<string, unknown>
  if (typeof o.id !== 'string' || !UUID.test(o.id)) return { ok: false, motivo: 'id de aviso no válido' }
  if (typeof o.clienteId !== 'string' || !UUID.test(o.clienteId)) return { ok: false, motivo: 'falta el cliente' }
  const op = o.oportunidadId === undefined || o.oportunidadId === null || o.oportunidadId === '' ? null : o.oportunidadId
  if (op !== null && (typeof op !== 'string' || !UUID.test(op))) return { ok: false, motivo: 'id de oportunidad no válido' }
  return { ok: true, valor: { id: o.id, clienteId: o.clienteId, oportunidadId: op as string | null } }
}

/** Cuerpo del PATCH de un documento sin asignar: `{ id, clienteId }`. */
export function validarAsignacionDocumento(b: unknown): { ok: true; id: string; clienteId: string } | { ok: false; motivo: string } {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no válido' }
  const o = b as Record<string, unknown>
  if (typeof o.id !== 'string' || !UUID.test(o.id)) return { ok: false, motivo: 'id de documento no válido' }
  if (typeof o.clienteId !== 'string' || !UUID.test(o.clienteId)) return { ok: false, motivo: 'falta el cliente' }
  return { ok: true, id: o.id, clienteId: o.clienteId }
}

export type DecisionAsignacion =
  | { ok: true; via: 'solicitud' | 'ficha' }
  | { ok: false; status: 404 | 409 | 422; motivo: string }

/**
 * ¿Se puede asignar ESTE aviso a mano? Solo uno `sin_resolver` (lo demás ya tiene desenlace: reasignarlo pisaría una
 * nota o una tarea ya escritas). Una solicitud se engancha a una OPORTUNIDAD del cliente elegido (apuntando su nº);
 * el resto, a la ficha del cliente (nota en el historial, sin tareas ni siniestros: el aviso no casó solo).
 */
export function decidirAsignacion(
  evento: { tipo: string; estado: string } | null,
  pedido: { oportunidadId: string | null },
  oportunidad: { clienteId: string; abierta: boolean } | null,
  clienteId: string,
): DecisionAsignacion {
  if (!evento) return { ok: false, status: 404, motivo: 'ese aviso no existe en esta correduría' }
  if (evento.estado !== 'sin_resolver') return { ok: false, status: 409, motivo: 'solo se asignan a mano los avisos sin resolver' }
  if (evento.tipo === 'solicitud') {
    if (!pedido.oportunidadId) return { ok: false, status: 422, motivo: 'una solicitud se engancha a una oportunidad: elige cuál' }
    if (!oportunidad || oportunidad.clienteId !== clienteId) return { ok: false, status: 422, motivo: 'esa oportunidad no es de ese cliente' }
    if (!oportunidad.abierta) return { ok: false, status: 409, motivo: 'esa oportunidad ya está cerrada' }
    return { ok: true, via: 'solicitud' }
  }
  if (pedido.oportunidadId && (!oportunidad || oportunidad.clienteId !== clienteId)) return { ok: false, status: 422, motivo: 'esa oportunidad no es de ese cliente' }
  return { ok: true, via: 'ficha' }
}

/** Nota de la ficha cuando Alberto asigna a mano un aviso que no casó. Sin el nombre del tomador. */
export function notaAsignacionEvento(e: { tipo: string; compania: string; clave: string; numeroPoliza: string | null; resumen: string | null }, actor: string): string {
  const que = e.tipo === 'siniestro' ? `siniestro ${e.clave}` : e.numeroPoliza ? `póliza ${e.numeroPoliza}` : e.clave
  return sinDatosSensibles(`Aviso de ${e.compania} por correo (${e.tipo}: ${que}) asignado a mano a esta ficha por ${actor}${e.resumen ? ` — ${e.resumen}` : ''}`).slice(0, 2000)
}

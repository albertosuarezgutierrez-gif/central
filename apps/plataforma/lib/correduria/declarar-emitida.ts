// «Póliza emitida» declarada a mano desde la oportunidad (22/10/2026, Alberto). PURO (importable desde 'use client' y
// desde `node --test`). Para los ramos que no se tarifican aquí (`comoSeTarifica` ≠ avant2: accidentes, RC, comercios…,
// y comunidades, que el bot tarifica pero no emite): nº de póliza + compañía (obligatorios), fecha de efecto y nota. La
// compañía, del catálogo `companias_dgs` (con su código DGS real) o «otra» por nombre SIN código. El puerto valida con la
// MISMA regla (`validarDeclaracionEmitida` de module-seguros) y el mismo catálogo.
//
// 🚨 Lo declarado NO es cartera: la pantalla dice «Emitida · pendiente de confirmar con CIMA» y nunca «En vigor».

import { validarDeclaracionEmitida, type CompaniaDeclarable } from '@central/module-seguros'
import type { DeclaracionVista } from '../seguimiento-asegura.ts'

/** `codigoDgs` = el del catálogo elegido · `OTRA` = compañía fuera del catálogo (se escribe su nombre en `companiaLibre`). */
export const OTRA = 'otra'
export type FormDeclaracion = { numeroPoliza: string; codigoDgs: string; companiaLibre: string; fechaEfecto: string; nota: string }

/** El catálogo de `/api/correduria/companias` (código + nombre). `null` = no se pudo leer (≠ catálogo vacío). */
export function leerCatalogoCompanias(status: number, json: unknown): CompaniaDeclarable[] | null {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
  if (status !== 200 || o?.estado !== 'ok' || !Array.isArray(o.companias)) return null
  const out: CompaniaDeclarable[] = []
  for (const c of o.companias) {
    const r = typeof c === 'object' && c !== null ? (c as Record<string, unknown>) : null
    const codigoDgs = typeof r?.codigoDgs === 'string' ? r.codigoDgs.trim().toUpperCase() : ''
    const nombreComun = typeof r?.nombreComun === 'string' ? r.nombreComun.trim() : ''
    if (/^[A-Z]\d{4}$/.test(codigoDgs) && nombreComun !== '') out.push({ codigoDgs, nombreComun })
  }
  return out.sort((a, b) => a.nombreComun.localeCompare(b.nombreComun, 'es'))
}

/** El formulario de partida: vacío, o la declaración vigente (para corregirla). */
export function formInicial(d: DeclaracionVista | null): FormDeclaracion {
  if (!d) return { numeroPoliza: '', codigoDgs: '', companiaLibre: '', fechaEfecto: '', nota: '' }
  return { numeroPoliza: d.numeroPoliza, codigoDgs: d.codigoDgs ?? OTRA, companiaLibre: d.codigoDgs ? '' : d.compania, fechaEfecto: d.fechaEfecto ?? '', nota: '' }
}

/** ¿Qué se puede hacer? `declarar` (abierta, o ganada sin póliza y sin declaración) · `corregir` · `nada`. */
export function modoDeclaracion(o: { estado: string; polizaGanadaId: string | null; declaracion: DeclaracionVista | null }): 'declarar' | 'corregir' | 'nada' {
  if (o.estado === 'perdida') return 'nada'
  if (o.estado === 'ganada') return o.polizaGanadaId ? 'nada' : o.declaracion ? 'corregir' : 'declarar'
  return 'declarar'
}

/** ¿Se ofrece «Anular la declaración»? Solo ganada SIN póliza de CIMA y con declaración vigente (la regla del puerto). */
export function puedeAnular(o: { estado: string; polizaGanadaId: string | null; declaracion: DeclaracionVista | null }): boolean {
  return o.estado === 'ganada' && !o.polizaGanadaId && o.declaracion !== null
}

/**
 * Comprueba en el navegador con la regla del puerto (no la sustituye) y arma el cuerpo. El `actor` NO va: lo pone el
 * servidor de plataforma desde la sesión.
 */
export function cuerpoDeclaracion(
  oportunidadId: string, actual: { estado: string; polizaGanadaId: string | null }, f: FormDeclaracion, hoy: string,
  catalogo: readonly CompaniaDeclarable[] | null,
): { ok: true; cuerpo: Record<string, unknown> } | { ok: false; motivo: string } {
  const otra = f.codigoDgs === OTRA
  const peticion = {
    numeroPoliza: f.numeroPoliza,
    ...(otra ? { compania: f.companiaLibre } : f.codigoDgs !== '' ? { codigoDgs: f.codigoDgs } : {}),
    fechaEfecto: f.fechaEfecto.trim() === '' ? null : f.fechaEfecto.trim(),
    nota: f.nota.trim() === '' ? null : f.nota,
  }
  const v = validarDeclaracionEmitida(actual, peticion, hoy, catalogo)
  if (!v.ok) return v
  return { ok: true, cuerpo: { id: oportunidadId, accion: 'declarar_emitida', ...peticion, numeroPoliza: v.declaracion.numeroPoliza } }
}

export function cuerpoAnulacion(oportunidadId: string): Record<string, unknown> {
  return { id: oportunidadId, accion: 'anular_declaracion' }
}

/** El resultado del POST, en una frase. Un 0 (sin conexión) no es «guardado»: se dice que no se sabe. */
export function textoResultado(status: number, json: unknown, que: 'declarar' | 'anular' = 'declarar'): { ok: boolean; texto: string } {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
  if (status === 200 && o?.estado === 'ok') {
    if (que === 'anular') return { ok: true, texto: 'Declaración anulada: la oportunidad vuelve a «en negociación». Ponle el siguiente paso en «Gestionar».' }
    if (o.sinCambios === true) return { ok: true, texto: 'Ya estaba declarada exactamente así: no se ha cambiado nada.' }
    return { ok: true, texto: 'Guardada: «Emitida · pendiente de confirmar con CIMA». Cuando CIMA traiga esa póliza se enlazará sola.' }
  }
  const motivo = typeof o?.motivo === 'string' && o.motivo.trim() !== '' ? o.motivo : null
  if (status === 0) return { ok: false, texto: 'Sin conexión: no se sabe si se guardó. Recarga antes de repetir.' }
  return { ok: false, texto: `No se ha guardado: ${motivo ?? `HTTP ${status}`}` }
}

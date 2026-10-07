// GRABADOR del tarificador RPA — la RED (solo servidor, 07/10/2026). Mismo puente que el resto del
// tarificador (`puerto()` de tarificador-asegura.ts: ASEGURA_URL + Bearer + x-actor). El navegador habla con
// `/api/correduria/tarificador/grabaciones*`, que exigen la sesión de correduría.
import { puerto } from './tarificador-asegura.ts'

const base = (id?: string) => (id ? `grabaciones/${encodeURIComponent(id)}` : 'grabaciones')

export function listarGrabacionesAsegura() {
  return puerto(base(), { method: 'GET' }, 15_000)
}

export function crearGrabacionAsegura(alta: { compania: unknown; ramo: unknown; producto: unknown; nota: unknown }) {
  return puerto(base(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(alta) }, 15_000)
}

export function leerGrabacionAsegura(id: string) {
  return puerto(base(id), { method: 'GET' }, 15_000)
}

export function validarGrabacionAsegura(id: string, validado: boolean) {
  return puerto(base(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ validado }) }, 15_000)
}

export function borrarGrabacionAsegura(id: string) {
  return puerto(base(id), { method: 'DELETE' }, 15_000)
}

/** El HTML va tal cual (text/html), no en JSON: así asegura no lo duplica en memoria para auditar. */
export function subirPantallaAsegura(id: string, nombre: string, html: string) {
  const q = new URLSearchParams({ nombre })
  return puerto(`${base(id)}/pantallas?${q}`, { method: 'POST', headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }, 60_000)
}

export function analizarGrabacionAsegura(id: string, modo: string) {
  return puerto(`${base(id)}/analizar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modo }) }, 290_000)
}

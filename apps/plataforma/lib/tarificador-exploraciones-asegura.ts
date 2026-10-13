// EXPLORADOR IA del tarificador — la RED (solo servidor, 13/10/2026). Mismo puente que el resto del tarificador
// (`puerto()` de tarificador-asegura.ts: ASEGURA_URL + Bearer + x-actor). El navegador habla con
// `/api/correduria/tarificador/exploraciones*`, que exigen la sesión de correduría.
import { puerto } from './tarificador-asegura.ts'

const base = (id?: string) => (id ? `exploraciones/${encodeURIComponent(id)}` : 'exploraciones')

export function listarExploracionesAsegura() {
  return puerto(base(), { method: 'GET' }, 15_000)
}

export function leerExploracionAsegura(id: string) {
  return puerto(base(id), { method: 'GET' }, 15_000)
}

export function revisarExploracionAsegura(id: string, estado: 'revisado' | 'descartado' | 'borrador') {
  return puerto(base(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado }) }, 15_000)
}

/** Encola una exploración (fase B). Asegura re-exige sus cerrojos; aquí viaja la entrada de la lista cerrada y, opcional, la oportunidad (clave omitida si no hay). */
export function encolarExploracionAsegura(entrada: string, oportunidadId?: string) {
  const cuerpo = oportunidadId ? { entrada, oportunidadId } : { entrada }
  return puerto('exploracion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }, 30_000)
}

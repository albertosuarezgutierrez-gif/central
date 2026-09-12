// Anotar a mano la MODALIDAD de una RC cuando la compañía no manda coberturas
// por CIMA (09-12/09/2026). Es el único camino de escritura sobre
// `polizas.datos_especificos` para este caso concreto — no un editor genérico
// de la póliza.
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// - Solo sobre pólizas de ramo `responsabilidad_civil` de ESTA correduría
//   (comprobado ANTES de escribir: con BYPASSRLS un id ajeno no falla, escribe
//   en otra correduría).
// - Se guarda `rcModalidad` (el id del catálogo) Y `rcModalidadTitulo` (el
//   texto ya compuesto) dentro del MISMO `datos_especificos` JSON, sin tocar
//   el resto de claves que ya traiga (fusión, no sustitución) — ese campo
//   puede llevar la dirección cifrada del riesgo y otros datos de la ingesta.
// - Si en algún momento CIMA manda coberturas reales para esta póliza,
//   `objetoAsegurado()` las antepone siempre: lo manual nunca pisa lo oficial.
// - Deja fila en `historial_interno` del cliente titular.

import { validarModalidadRc, tituloModalidadRc } from '@central/module-seguros'
import { prismaAsegura, aseguraConfigurada } from './asegura-db'

export type ResultadoModalidadRc =
  | { ok: true; estado: 'ok'; status: 200; titulo: string }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'sin_configurar' | 'error'; motivo: string; status: 400 | 404 | 422 | 503 | 500 }

export async function establecerModalidadRc(
  correduriaId: string,
  polizaId: string,
  entrada: { modalidad?: unknown; nota?: unknown; actor: string },
): Promise<ResultadoModalidadRc> {
  if (!aseguraConfigurada()) {
    return { ok: false, estado: 'sin_configurar', motivo: 'La conexión a la cartera no está configurada.', status: 503 }
  }
  if (polizaId.trim() === '') {
    return { ok: false, estado: 'invalido', motivo: 'Falta el id de la póliza.', status: 422 }
  }
  const v = validarModalidadRc(entrada.modalidad, entrada.nota)
  if (!v.ok) return { ok: false, estado: 'invalido', motivo: v.motivo, status: 422 }
  const titulo = tituloModalidadRc(v.id, v.nota)
  if (titulo === null) return { ok: false, estado: 'invalido', motivo: 'Modalidad sin etiqueta conocida.', status: 422 }

  try {
    const db = prismaAsegura()
    const poliza = await db.poliza.findFirst({
      where: { id: polizaId, correduriaId },
      select: { id: true, tipo: true, clienteId: true, datosEspecificos: true },
    })
    if (!poliza) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Esa póliza no está en la cartera de esta correduría.', status: 404 }
    }
    if (String(poliza.tipo) !== 'responsabilidad_civil') {
      return { ok: false, estado: 'invalido', motivo: 'Solo se anota modalidad en pólizas de Responsabilidad Civil.', status: 422 }
    }

    const previos = poliza.datosEspecificos && typeof poliza.datosEspecificos === 'object' && !Array.isArray(poliza.datosEspecificos)
      ? (poliza.datosEspecificos as Record<string, unknown>)
      : {}
    const fusionado = { ...previos, rcModalidad: v.id, rcModalidadTitulo: titulo, rcModalidadNota: v.nota }

    await db.poliza.update({ where: { id: poliza.id }, data: { datosEspecificos: fusionado } })
    await anotar(correduriaId, poliza.clienteId, `Modalidad de RC anotada a mano (${titulo}) por ${entrada.actor}`)
    return { ok: true, estado: 'ok', status: 200, titulo }
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/** Best-effort: que el historial falle no deshace la anotación, pero se grita. */
async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-poliza-editar] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}

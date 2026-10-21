// Aviso de la ficha de una EMPRESA sin correo propio ni persona de contacto autorizada (21/10/2026).
// PURO. La regla de quién puede recibir un presupuesto vive en `@central/module-seguros`
// (`destinatariosPresupuesto`): aquí solo se traduce a lo que pinta la ficha.
//
// Tres estados, no dos: `correoFicha = 'no_se_sabe'` (ilegible) NO es «no tiene» y no avisa; una persona sin
// tipo conocido NO es empresa. 🚨 «Empresa» = `tipo_persona = 'juridica'` DE LA COLUMNA (`tipoPersonaDeColumna`), el
// MISMO criterio con el que asegura decide el envío; nada de deducirlo del DNI ni del segmento. Y las filas se rehacen
// con su SENTIDO real (`tiposIda`/`tiposVuelta`), como las lee asegura: un «Dueño» al revés no vale igual.
// Una autorización anotada pero aún sin aceptar (`pendiente`) no habilita nada, y se dice, sin ofrecer el botón otra vez.
import { destinatariosPresupuesto, permiteAutorizar, type PersonaDestino, type RelacionFila } from '@central/module-seguros'
import type { RelacionCartera } from './relaciones-asegura.ts'

export type CorreoFicha = 'con_email' | 'sin_email' | 'baja_de_correo' | 'no_se_sabe'

export type CandidatoAutorizable = { relacionadoId: string; nombre: string; tipo: string }
export type CandidatoPendiente = { relacionadoId: string; nombre: string; tipo: string }

export type AvisoContactoEmpresa =
  | { aviso: false }
  | { aviso: true; autorizables: CandidatoAutorizable[]; pendientes: CandidatoPendiente[] }

/** `tipo_persona` de la columna tal cual → el tipo de la regla. Cualquier otra cosa (NULL incluido) = no consta. PURO. */
export function tipoPersonaDeColumna(v: unknown): 'fisica' | 'juridica' | null {
  return v === 'juridica' ? 'juridica' : v === 'fisica' ? 'fisica' : null
}

export function avisoContactoEmpresa(
  ficha: { id: string; tipoPersona: 'fisica' | 'juridica' | null; correo: CorreoFicha },
  relaciones: readonly RelacionCartera[] | null,
): AvisoContactoEmpresa {
  if (ficha.tipoPersona !== 'juridica') return { aviso: false }
  if (ficha.correo !== 'sin_email' && ficha.correo !== 'baja_de_correo') return { aviso: false }
  // `null` = no se pudo leer quién está relacionado: no se afirma que no hay nadie.
  if (relaciones === null) return { aviso: false }

  // Sin los sentidos crudos (puerto viejo) no se puede aplicar la regla como asegura: no se afirma nada.
  if (relaciones.some((r) => !Array.isArray(r.tiposIda) || !Array.isArray(r.tiposVuelta))) return { aviso: false }
  // Las filas tal y como las lee asegura: ida = ficha→relacionado (su flag es `autorizaVer`), vuelta = relacionado→ficha
  // (su flag es `puedeVer`, que NO habilita: la autorización solo cuenta del tomador hacia el contacto).
  const filas: RelacionFila[] = relaciones.flatMap((r) => [
    ...(r.tiposIda ?? []).map((tipo, i) => ({
      id: `${r.relacionadoId}:ida:${i}`, observaciones: null, clienteAId: ficha.id, clienteBId: r.relacionadoId, tipo, puedeVerPolizas: r.autorizaVer,
    })),
    ...(r.tiposVuelta ?? []).map((tipo, i) => ({
      id: `${r.relacionadoId}:vuelta:${i}`, observaciones: null, clienteAId: r.relacionadoId, clienteBId: ficha.id, tipo, puedeVerPolizas: r.puedeVer,
    })),
  ])
  const personas: PersonaDestino[] = relaciones.map((r) => ({
    clienteId: r.relacionadoId,
    nombre: r.nombre,
    tipoPersona: r.tipoPersona ?? null,
    correo: r.correo ?? 'no_se_sabe',
  }))
  const d = destinatariosPresupuesto({ clienteId: ficha.id, tipoPersona: ficha.tipoPersona, correo: ficha.correo }, filas, personas)
  if (d.estado !== 'nadie') return { aviso: false }

  const porId = new Map(relaciones.map((r) => [r.relacionadoId, r]))
  const autorizables: CandidatoAutorizable[] = []
  const pendientes: CandidatoPendiente[] = []
  for (const n of d.noElegibles) {
    // Solo los que tienen correo y a los que SOLO falta el permiso.
    if (n.motivo !== 'relacion_no_habilita') continue
    const r = porId.get(n.clienteId)
    if (!r || r.correo !== 'con_email' || !permiteAutorizar(r.tipo)) continue
    const item = { relacionadoId: r.relacionadoId, nombre: r.nombre, tipo: r.tipo }
    if (r.autorizacion?.estado === 'pendiente') pendientes.push(item)
    else autorizables.push(item)
  }
  return { aviso: true, autorizables, pendientes }
}

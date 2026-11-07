// BOTS AUTOMÁTICOS tras la respuesta del cliente a la solicitud de datos de la renovación (Alberto, 07/11/2026). La decisión y los
// textos (PUROS, con test) viven en `solicitud-renovacion-bots-reglas.ts`.
//
// Qué hace: encola, por el MISMO camino que «Probar» (`riesgoHogarDeRiesgoOportunidad` → `decidirRiesgoProbar` → `validarEntradaRamo`
// → `encolarTrabajo` → `lanzarPendientes`), un trabajo de bot de hogar por cada compañía con bot activo, colgado de la oportunidad
// de la renovación (así el aviso de resultado ya existente —presupuesto en borrador + Telegram— le llega a Alberto).
// Idempotente: `encolarTrabajo` no duplica un trabajo vivo con el mismo riesgo (devuelve ESE) ni uno `ok` reciente.
// 🚨 TARIFICAR ≠ EMITIR: solo precio. Avant2 (de pago) NO se toca. Nada sale al cliente ni a compañías.
// 🛡️ Nunca lanza: la respuesta del cliente ya está guardada; cualquier fallo se registra y se devuelve en el resultado.
import { catalogosHogarVivos } from './tarificacion-lead'
import { leerRiesgo } from './oportunidad-riesgo'
import { registrarErrorCartera } from './error-cartera'
import { encolarTrabajo, lanzarPendientes } from './tarificador'
import { leerIntegracionesActivas } from './tarificador-lectura'
import { rpaActivo, validarEntradaRamo } from './tarificador-reglas'
import { decidirRiesgoProbar, riesgoHogarDeRiesgoOportunidad } from './tarificador-relanzar-reglas'
import { decidirLanzamientoBots, resultadoDeEncolar, type DecisionBots, type ResultadoCompania } from './solicitud-renovacion-bots-reglas'

export type ResultadoBotsRenovacion = { decision: DecisionBots; resultados: ResultadoCompania[]; fallo: string | null }

export async function lanzarBotsRenovacion(
  correduriaId: string,
  e: { clienteId: string; oportunidadId: string; /** nº de preguntas que aún le faltan al bot (`null` = no se pudo leer). */ faltas: number | null },
  env: Record<string, string | undefined> = process.env,
): Promise<ResultadoBotsRenovacion> {
  let companias: string[] = []
  if (e.faltas === 0 && rpaActivo(env)) {
    try {
      companias = (await leerIntegracionesActivas(correduriaId)).filter((i) => i.ramo === 'hogar').map((i) => i.compania)
    } catch (x) {
      registrarErrorCartera('solicitud-renovacion/bots/integraciones', x)
      return { decision: { accion: 'encolar', companias: [] }, resultados: [], fallo: 'no he podido leer las integraciones' }
    }
  }
  const decision = decidirLanzamientoBots({ faltas: e.faltas, rpaActivo: rpaActivo(env), companias })
  if (decision.accion !== 'encolar') return { decision, resultados: [], fallo: null }

  const resultados: ResultadoCompania[] = []
  try {
    const riesgo = await leerRiesgo(correduriaId, e.oportunidadId)
    if (!riesgo) return { decision, resultados, fallo: 'no he podido releer el riesgo' }
    const reconstruccion = riesgoHogarDeRiesgoOportunidad(riesgo, new Date(), await catalogosHogarVivos().catch(() => ({})))
    for (const compania of decision.companias) {
      try {
        const d = decidirRiesgoProbar({ reconstruccion, previo: null, soloPurgados: false, validar: (r) => validarEntradaRamo('hogar', r, compania) })
        if (!d.ok) { resultados.push({ compania, tipo: 'rechazado', motivo: d.motivo }); continue }
        const r = await encolarTrabajo({
          correduriaId, oportunidadId: e.oportunidadId, clienteId: e.clienteId, polizaId: null, compania, ...d.entrada,
          solicitadoPor: 'sistema:solicitud-renovacion', imagenPrueba: null,
        })
        resultados.push(resultadoDeEncolar(compania, r))
        if (r.estado === 'encolado' && !r.duplicado) {
          await lanzarPendientes(correduriaId, compania).catch((x: unknown) => registrarErrorCartera('solicitud-renovacion/bots/lanzar', x))
        }
      } catch (x) {
        registrarErrorCartera('solicitud-renovacion/bots/encolar', x)
        resultados.push({ compania, tipo: 'rechazado', motivo: 'error_interno' })
      }
    }
  } catch (x) {
    registrarErrorCartera('solicitud-renovacion/bots', x)
    return { decision, resultados, fallo: 'fallo inesperado al encolar' }
  }
  return { decision, resultados, fallo: null }
}

// apps/plataforma/lib/contable/cerebro.ts
// Un turno del agente de contabilidad: arma contexto → llama IA → aprende hábitos → traza.
// Solo lectura (Fase 1). Reutiliza el patrón de app/api/agente/chat/route.ts.
import { aiComplete } from '@central/core-ai'
import { construirContexto } from './contexto'
import { extraerAprendizajes, type Aprendizaje } from './parse'
import { guardarInsight, logTurno } from './memoria'

const SYSTEM = `Eres el agente de CONTABILIDAD de Alberto (casa de marcas: pisos turísticos, correduría de seguros, gastos personales). Hablas con Alberto, el dueño, en español, claro y breve.

Tu trabajo en esta fase:
1. RESPONDER preguntas sobre su contabilidad leyendo SOLO el contexto que te doy (movimientos por destino, últimos cargos, facturas pendientes). No inventes cifras: si un dato no está en el contexto, dilo.
2. APRENDER su rutina: cuando Alberto te cuente un hábito, criterio o dato que debas RECORDAR para siempre (ej. "meto todo el gasto en el año", "ENERGIA XXI es la luz de mi casa, personal"), añade AL FINAL de tu respuesta UNA línea por cada uno, EXACTAMENTE así (y nada más en esa línea):
APRENDER: {"clave":"<slug corto y estable, ej: criterio_gasto|energia_xxi|estructura_pisos>","insight":"<la regla o dato en una sola frase>"}

Reglas:
- Si es solo una pregunta (sin hábito nuevo que recordar), NO añadas ninguna línea APRENDER.
- Reutiliza la MISMA "clave" si actualizas un hábito que ya conoces (para no duplicar).
- SOLO LECTURA: todavía no puedes clasificar cargos, conciliar facturas ni pagar. Si Alberto te lo pide, dile que en esta fase solo informas y que esas acciones llegan en la siguiente fase.`

export async function responder(
  cuentaId: string, mensaje: string, canal = 'web',
): Promise<{ respuesta: string; guardados: Aprendizaje[] }> {
  // Contexto ANTES de registrar el turno (el historial no debe incluir el mensaje actual).
  const ctx = await construirContexto(cuentaId).catch(() => '(no se pudo leer el contexto)')
  await logTurno(cuentaId, canal, 'user', mensaje)

  const prompt = `${ctx}\n\n# Mensaje de Alberto\n${mensaje}\n\n# Tu respuesta`
  const raw = await aiComplete(prompt, { system: SYSTEM, maxTokens: 700, timeoutMs: 25_000 })

  const { limpio, aprendizajes } = extraerAprendizajes(raw)
  for (const a of aprendizajes) await guardarInsight(cuentaId, a)
  await logTurno(cuentaId, canal, 'assistant', limpio)

  return { respuesta: limpio, guardados: aprendizajes }
}

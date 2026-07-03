// apps/plataforma/lib/contable/cerebro.ts
// Un turno del agente: contexto → IA → aprende hábitos → PROPONE acciones (que Alberto confirma).
import { aiComplete } from '@central/core-ai'
import { construirContexto } from './contexto'
import { extraerAprendizajes, extraerAcciones, type Aprendizaje } from './parse'
import { validarAccion, resumenAccion } from './acciones-tipos'
import { guardarInsight, logTurno } from './memoria'
import { guardarAcciones, type AccionPropuesta } from './acciones'
import { detectarIntencion } from './intencion'
import { responderDirecto } from './respuestas-directas'

const SYSTEM = `Eres el agente de CONTABILIDAD de Alberto (pisos turísticos, correduría de seguros, gastos personales). Hablas con él en español, claro y breve.

Puedes:
1. RESPONDER preguntas sobre su contabilidad usando SOLO el contexto que te doy. No inventes cifras.
2. APRENDER su rutina: cuando te dé un hábito/criterio a recordar, añade una línea:
APRENDER: {"clave":"<slug>","insight":"<frase>"}
3. PROPONER acciones sobre un movimiento. NO las ejecutas tú: Alberto las CONFIRMA en pantalla. Para proponer, añade AL FINAL una línea por acción, EXACTAMENTE así:
ACCION: {"tipo":"clasificar","ref":"#3","destino":"turistico_pisos","propiedad":"prop_house_sevillana"}
ACCION: {"tipo":"amortizable","ref":"#3","valor":true}
ACCION: {"tipo":"confirmar","ref":"#3"}

Reglas de acciones:
- "ref" = el #N del movimiento tal cual aparece en la sección "Movimientos". No inventes refs.
- clasificar.destino ∈ turistico_pisos | turistico_duplex | seguros | traspaso_interno | personal.
- "propiedad" es OPCIONAL y solo para turistico_pisos: prop_house_sevillana | prop_busto_reform | prop_luxury_busto | prop_duplex_center.
- amortizable: recuerda que Alberto NUNCA amortiza de oficio; solo si te lo pide explícitamente.
- Explica en el texto qué propones y por qué. Si solo es una pregunta, no añadas ACCION.
- Nada se ejecuta hasta que Alberto pulse Confirmar.`

export async function responder(
  cuentaId: string, mensaje: string, canal = 'web',
): Promise<{ respuesta: string; guardados: Aprendizaje[]; acciones: AccionPropuesta[] }> {
  await logTurno(cuentaId, canal, 'user', mensaje)

  // 0) Camino DETERMINISTA: preguntas frecuentes y estructuradas (gasto del mes, por concepto,
  //    facturas pendientes…) se responden por SQL, SIN LLM. Funciona aunque la IA esté saturada,
  //    es instantáneo y no inventa cifras. Solo si NO casa ninguna intención se llama al modelo.
  const ahora = new Date()
  const intn = detectarIntencion(mensaje, { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 })
  if (intn) {
    const directa = await responderDirecto(cuentaId, intn).catch(() => null)
    if (directa) {
      await logTurno(cuentaId, canal, 'assistant', directa)
      return { respuesta: directa, guardados: [], acciones: [] }
    }
  }

  const { texto: ctx, candidatos } = await construirContexto(cuentaId).catch(() => ({ texto: '(no se pudo leer el contexto)', candidatos: [] as any[] }))

  const prompt = `${ctx}\n\n# Mensaje de Alberto\n${mensaje}\n\n# Tu respuesta`
  // 12s: aiComplete encadena NIM → Groq con este timeout CADA UNO, así el peor caso (~24s) sigue
  // por debajo de lo que un móvil aguanta antes de cortar la conexión. Si se agota, el route
  // devuelve un mensaje claro ("IA saturada, reinténtalo") en vez de colgarse ~50s.
  const raw = await aiComplete(prompt, { system: SYSTEM, maxTokens: 800, timeoutMs: 12_000 })

  // 1) Aprendizajes (canal APRENDER)
  const paso1 = extraerAprendizajes(raw)
  for (const a of paso1.aprendizajes) await guardarInsight(cuentaId, a)

  // 2) Acciones (canal ACCION) — resolver #ref → movimiento y validar
  const paso2 = extraerAcciones(paso1.limpio)
  const mapa = new Map(candidatos.map((c: any) => [c.ref, c]))
  const propuestas: { tipo: string; params: Record<string, any>; resumen: string }[] = []
  for (const cruda of paso2.acciones) {
    const v = validarAccion(cruda)
    if (!v.ok) continue
    const cand = mapa.get(v.accion.ref)
    if (!cand) continue
    const params: Record<string, any> = { movId: cand.movId, concepto: cand.concepto }
    if (v.accion.tipo === 'clasificar') { params.destino = v.accion.destino; params.propiedad = v.accion.propiedad }
    if (v.accion.tipo === 'amortizable') { params.valor = v.accion.valor }
    propuestas.push({ tipo: v.accion.tipo, params, resumen: resumenAccion(v.accion, cand.concepto) })
  }
  const acciones = propuestas.length ? await guardarAcciones(cuentaId, propuestas) : []

  await logTurno(cuentaId, canal, 'assistant', paso2.limpio)
  return { respuesta: paso2.limpio, guardados: paso1.aprendizajes, acciones }
}

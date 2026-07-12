// apps/plataforma/lib/contable/clasificar-ia.ts
// Clasificador de intención por IA: cuando el router determinista (intencion.ts) NO reconoce la
// pregunta, la IA la MAPEA a una intención estructurada (qué negocio / periodo / concepto) y luego el
// SQL de respuestas-directas hace la cuenta EXACTA. Así la IA aporta comprensión del lenguaje pero
// NUNCA toca las cifras (no las inventa). Devuelve null si la IA no está segura o falla (→ el cerebro
// cae a la respuesta libre con contexto). No es puro (llama a la pasarela); la validación del JSON sí
// lo es (`intencionDesdeJSON` en intencion.ts, testeada con node --test).
import { chatConDirector } from '@/lib/pasarela'
import { stripThink } from './parse'
import { intencionDesdeJSON, resumenIntencion, interpretarVerificacion, type Hoy, type Intencion } from './intencion'

const SISTEMA = `Eres un clasificador de intención para un agente financiero español. Recibes UNA pregunta (y, si la hay, el contexto de la conversación previa) y devuelves SOLO un objeto JSON con la intención. NO calculas cifras ni explicas nada.

Negocios de Alberto:
- Correduría de seguros → destino "seguros".
- Pisos turísticos. Hay 4 pisos concretos, cada uno con su propertyId:
  · Dúplex / Villasís → "prop_duplex_center"
  · Luxury / Luxury Busto → "prop_luxury_busto"
  · Socorro / House Sevillana / Casa Sevillana → "prop_house_sevillana"
  · Busto Reform → "prop_busto_reform"
- Actividad de Pilar (autónoma) → destino "actividad_pilar".
- Gasto personal → destino "personal".

Elige UN tipo:
- {"tipo":"piso","modo":"ingreso|gasto|resultado","propertyId":"<propertyId>","etiqueta":"<nombre corto>","anio":<n>,"mes":<1-12 opcional>} — pregunta sobre UN piso turístico concreto POR SU NOMBRE. modo: "ingreso" si pide ingresos/facturación/reservas; "gasto" si pide gastos; "resultado" si pide resultado/beneficio/rentabilidad/«cómo va».
- {"tipo":"gasto_destino","signo":"gasto|ingreso","destinos":["<destino>"],"etiqueta":"<texto corto>","anio":<n>,"mes":<1-12 opcional>} — pregunta sobre la correduría, la actividad de Pilar, o TODOS los pisos juntos ("los pisos", destino "turistico_pisos"). NO para un piso concreto (usa "piso").
- {"tipo":"movimientos_anio","signo":"gasto|ingreso","anio":<n>} — total de un año, sin filtrar por negocio.
- {"tipo":"movimientos_mes","signo":"gasto|ingreso","anio":<n>,"mes":<1-12>} — total de un mes.
- {"tipo":"pisos_rentabilidad","anio":<n>,"mes":<1-12 opcional>} — rentabilidad/resultado de TODOS los pisos turísticos a la vez ("¿son rentables los pisos este mes?", "resultado de los pisos"). Desglose por piso. NO para un piso concreto (usa "piso" con modo "resultado").
- {"tipo":"por_destino","anio":<n>} — desglose/comparativa entre TODOS los negocios.
- {"tipo":"subcategoria","signo":"gasto","subcategoria":"<slug>","etiqueta":"...","anio":<n>,"mes":opcional} — gasto personal de consumo (supermercado, restaurante_bar, gasolina, farmacia, ropa, colegio, deporte, suscripcion, hogar, transporte, ocio, hipoteca, club).
- {"tipo":"concepto","signo":"gasto|ingreso","terminos":["<palabra>"],"etiqueta":"...","anio":<n>,"mes":opcional} — un proveedor/comercio concreto por nombre.
- {"tipo":"tramo_fiscal","anio":<n>} — posición fiscal / tramo IRPF.
- {"tipo":"facturas_pendientes"} — facturas de proveedor sin pagar.

Reglas:
- CONTEXTO: si la pregunta es elíptica o de seguimiento ("¿y gastos?", "¿y en junio?", "¿y el resultado?", "¿y Luxury?", "¿y del Dúplex?"), HEREDA del último turno lo que NO cambie (piso/negocio, año, mes, signo) y cambia SOLO lo que la nueva pregunta indica. Ej.: si el turno previo fue "ingresos de Socorro este mes" y ahora pregunta "¿y gastos?", devuelve el MISMO piso y mes con modo "gasto".
- Si NO es sobre dinero/cuentas/fiscalidad o no encaja en NINGÚN tipo, devuelve {"tipo":"ninguno"}.
- Año por defecto = el actual si no se menciona.
- Devuelve SOLO el JSON, sin texto alrededor ni markdown.`

// Turno de la conversación previa (rol + texto), para resolver preguntas elípticas de seguimiento.
export type TurnoHistorial = { rol: string; mensaje: string }

export async function clasificarIntencionIA(mensaje: string, hoy: Hoy, historial: TurnoHistorial[] = []): Promise<Intencion | null> {
  // Contexto previo: solo los últimos turnos, recortados, para anclar los seguimientos ("¿y gastos?").
  const ctx = historial.slice(-6)
    .map(h => `${h.rol === 'user' || h.rol === 'usuario' ? 'Alberto' : 'Agente'}: ${(h.mensaje || '').slice(0, 200)}`)
    .join('\n')
  const bloqueCtx = ctx ? `Conversación previa (para resolver seguimientos):\n${ctx}\n\n` : ''
  const prompt = `Año actual: ${hoy.anio}. Mes actual: ${hoy.mes}.\n${bloqueCtx}Pregunta: ${mensaje}\nJSON:`
  let text: string
  try {
    const r = await chatConDirector([{ role: 'user', content: prompt }], {
      app: 'plataforma', endpoint: 'contable-clasificar', system: SISTEMA,
      maxTokens: 200, timeoutMs: 8_000,
    })
    text = r.text || ''
  } catch { return null }
  const m = stripThink(text).match(/\{[\s\S]*\}/) // primer objeto JSON de la respuesta
  if (!m) return null
  try {
    return intencionDesdeJSON(JSON.parse(m[0]), hoy)
  } catch { return null }
}

// ── VERIFICADOR (2ª opinión con OTRO modelo) ────────────────────────────────────────────────────
// Solo el clasificador IA se equivoca (el router determinista es seguro); su fallo es mapear MAL la
// intención (piso/negocio/concepto erróneos) → respuesta con cifra correcta pero de OTRA cosa. Un 2º
// modelo distinto revisa la interpretación antes de contestar. Barato porque es gratis; se limita a
// las intenciones AMBIGUAS (las que llevan entidad) y es FAIL-OPEN (si el verificador falla o tarda,
// se confía en la original — nunca bloquea). El coste solo lo paga el ~30% que cae a la IA.

// Intenciones "con entidad" que vale la pena verificar (las que el clasificador puede confundir).
const VERIFICABLES = new Set(['piso', 'gasto_destino', 'concepto'])

const SISTEMA_VERIF = `Eres un VERIFICADOR de un agente financiero español. Te doy una PREGUNTA y la INTERPRETACIÓN que ha hecho otro modelo. Tu única tarea: decir si la interpretación responde de verdad a la pregunta. NO calculas cifras.
Responde SOLO un JSON:
- {"ok":true} si la interpretación es correcta.
- {"ok":false,"correccion":{...}} si es incorrecta Y sabes la interpretación correcta (mismo formato de intención que el otro modelo: tipo/signo/destinos/propertyId/modo/etiqueta/anio/mes).
- {"ok":false} si es incorrecta pero no estás seguro de la correcta.
Sé estricto con: piso equivocado, negocio equivocado, ingreso vs gasto invertido, concepto que no era. Devuelve SOLO el JSON.`

// Verifica una intención con un 2º modelo. Devuelve la intención a usar (la original, una corregida,
// o null = "no contestes por SQL, deriva al LLM libre"). FAIL-OPEN ante error/timeout. Gate por env.
export async function verificarIntencionIA(mensaje: string, intn: Intencion, hoy: Hoy): Promise<Intencion | null> {
  if (process.env.CONTABLE_VERIFICADOR === '0') return intn                 // desactivable por env
  if (!VERIFICABLES.has(intn.tipo)) return intn                            // intención poco ambigua: no gastar
  const prompt = `Pregunta: ${mensaje}\nInterpretación propuesta: ${resumenIntencion(intn)}\n¿Es correcta? JSON:`
  let text: string
  try {
    const r = await chatConDirector([{ role: 'user', content: prompt }], {
      app: 'plataforma', endpoint: 'contable-verificar', system: SISTEMA_VERIF,
      maxTokens: 160, timeoutMs: 5_000,
      // 2º modelo DISTINTO del clasificador (que usa el default de la pasarela): sesga la cadena
      // clásica a deepseek. Configurable por env; si no está, cae al default de la pasarela igual.
      modeloClasico: process.env.CONTABLE_VERIFIER_MODEL ?? 'deepseek-ai/deepseek-v3',
    })
    text = r.text || ''
  } catch { return intn }                                                  // fail-open
  const m = stripThink(text).match(/\{[\s\S]*\}/)
  if (!m) return intn
  try {
    return interpretarVerificacion(JSON.parse(m[0]), intn, hoy).intn
  } catch { return intn }
}

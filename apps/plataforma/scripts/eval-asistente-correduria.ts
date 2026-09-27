// Eval del asistente de la correduría contra el modelo REAL (gasta tokens: unos céntimos por pasada).
//   OPENROUTER_API_KEY=… OPENROUTER_MODEL=… npx tsx scripts/eval-asistente-correduria.ts
// Sale con código 1 si algún caso vuelve a preguntar lo que dice el documento. Pásalo tras tocar el
// prompt (`lib/correduria-asistente.ts`) o `avisoDocumentosPendientes`.
import { openrouterChatTools } from '@central/core-ai'
import { HERRAMIENTAS, systemAsistente } from '../lib/correduria-asistente.ts'
import { avisoDocumentosPendientes } from '../lib/correduria-oportunidad-tg.ts'
import { CASOS_EVAL, veredictoEval } from '../lib/eval-asistente-casos.ts'

const apiKey = process.env.OPENROUTER_API_KEY
const modelo = process.env.OPENROUTER_MODEL
if (!apiKey || !modelo) { console.error('Faltan OPENROUTER_API_KEY y OPENROUTER_MODEL (los de plataforma en Vercel).'); process.exit(2) }

const ORDEN = 'Te acabo de pasar el documento de un cliente: léelo y propónme la oportunidad (usa el documento; no me preguntes lo que ya pone).'
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
const system = [systemAsistente([], hoy), avisoDocumentosPendientes(1)].filter(Boolean).join('\n\n')

let fallos = 0
for (const c of CASOS_EVAL) {
  const pregunta = c.pregunta === 'ORDEN_DOCUMENTO_CLIENTE' ? ORDEN : c.pregunta
  const r = await openrouterChatTools({ apiKey, textModel: modelo }, [...c.historial, { role: 'user', content: pregunta }], HERRAMIENTAS as unknown as unknown[], {
    system, models: [modelo], maxTokens: 600, temperature: 0.2, privacidad: true, provider: { zdr: true },
  }).catch((e) => ({ content: `ERROR ${e instanceof Error ? e.message : e}`, tool_calls: [] }))
  const v = veredictoEval(r)
  if (!v.ok) fallos++
  console.log(`${v.ok ? '✅' : '❌'} ${c.nombre} — ${v.motivo}`)
}
console.log(fallos === 0 ? `\nTodo bien (${CASOS_EVAL.length} casos).` : `\n${fallos} de ${CASOS_EVAL.length} casos preguntan lo que ya dice el documento.`)
process.exit(fallos === 0 ? 0 : 1)

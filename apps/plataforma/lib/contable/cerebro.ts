// apps/plataforma/lib/contable/cerebro.ts
// Un turno del agente: contexto → IA → aprende hábitos → PROPONE acciones (que Alberto confirma).
import { chatConDirector } from '@/lib/pasarela'
import { construirContexto } from './contexto'
import { extraerAprendizajes, extraerAcciones, stripThink, type Aprendizaje } from './parse'
import { validarAccion, resumenAccion } from './acciones-tipos'
import { guardarInsight, logTurno, getSinonimosNegocio, guardarSinonimoNegocio, getHistorial } from './memoria'
import { guardarAcciones, type AccionPropuesta } from './acciones'
import { detectarIntencion, entidadesResiduales, esConsejo } from './intencion'
import { clasificarIntencionIA, verificarIntencionIA } from './clasificar-ia'
import { responderDirecto } from './respuestas-directas'

const SYSTEM = `Eres el agente FINANCIERO de Alberto (pisos turísticos, correduría de seguros, gastos personales). Hablas con él en español, claro y breve.

Tienes visión de TODO su contexto en el bloque que te paso: sus sociedades y negocios, los saldos bancarios, el resumen del año por actividad, su posición fiscal (IRPF), las facturas de proveedor pendientes y lo que sabes de su rutina. Úsalo para responder de forma transversal a sus cuentas y actividades, no solo movimientos sueltos.

Conocimiento del negocio de Alberto (tenlo en cuenta al clasificar/explicar):
- Ingresos de PISOS turísticos: llegan de las OTAs. Alias que verás en los conceptos → todos son ingreso de pisos (destino turistico_pisos, salvo el Dúplex que es turistico_duplex): "BOOKING.COM"/"LIQ. OP. Nº" (Booking), "TRAVELSCAPE" (= Expedia), "AGODA", "EXPEDIA", "STRIPE".
- CORREDURÍA (seguros) = SIEMPRE la cuenta BBVA. Las comisiones/liquidaciones de compañías (Generali, Caser, Occident, Asisa…) y los códigos de agente ("SALDO. M00171", "M1454", "LIQ.COMISIONES", "-FRA-COMIS", "REMSALDO", "PD005") son destino=seguros. Un recibo de aseguradora en Kutxa es seguro PROPIO (coche/hogar) → personal.
- "PAGO RECIBO 466…" (y "TARJ.CRDTO", "PAGO DE TARJETA") = liquidación mensual de la tarjeta = TRASPASO INTERNO, NO es ingreso ni gasto real (el gasto real ya está detallado en el extracto de la tarjeta). Nunca lo cuentes como ingreso/gasto.
- PRESTACIONES EXENTAS de IRPF (subcategoria='exento', p.ej. la prestación por nacimiento y cuidado del menor / paternidad de Alberto como autónomo, Art. 7.h LIRPF): se COBRAN en la correduría pero NO tributan → NO cuentan en la base imponible ni en el pago fraccionado. Si te preguntan por el rendimiento gravable de la correduría, excluye lo exento; si preguntan por lo cobrado (caja), inclúyelo.

Puedes:
1. RESPONDER preguntas sobre sus cuentas, negocios y fiscalidad usando SOLO el contexto que te doy. No inventes cifras; si algo no está en el contexto, dilo.
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

// El agente enruta por el Agente DIRECTOR de la pasarela (`chatConDirector`): con OPENROUTER_API_KEY
// el Director elige el mejor modelo para la tarea (las preguntas de cifras caen en su categoría de
// lógica/datos), y sin ella cae a la cadena clásica GRATIS. `CONTABLE_MODEL` es un OVERRIDE opcional
// del modelo de ESA cadena clásica (no del Director): por defecto DeepSeek (NVIDIA NIM), mejor
// analista de cifras que Llama y gratis con la misma NVIDIA_API_KEY. Un id erróneo NO rompe (degrada
// a Groq → Kimi). CONTABLE_MODEL='' fuerza el default de la pasarela (Llama). Para el chat conviene
// un modelo RÁPIDO (no R1) para no agotar el timeout.
const MODELO_CONTABLE = process.env.CONTABLE_MODEL === ''
  ? undefined
  : (process.env.CONTABLE_MODEL ?? 'deepseek-ai/deepseek-v3')

export async function responder(
  cuentaId: string, mensaje: string, canal = 'web',
): Promise<{ respuesta: string; guardados: Aprendizaje[]; acciones: AccionPropuesta[] }> {
  await logTurno(cuentaId, canal, 'user', mensaje)

  // 0) Camino DETERMINISTA: preguntas frecuentes y estructuradas (gasto del mes, por concepto,
  //    facturas pendientes…) se responden por SQL, SIN LLM. Funciona aunque la IA esté saturada,
  //    es instantáneo y no inventa cifras. Los sinónimos APRENDIDOS (`extras`) hacen que el vocabulario
  //    que la IA resolvió antes ya sea determinista aquí.
  const ahora = new Date()
  const hoy = { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 }
  const sinonimos = await getSinonimosNegocio(cuentaId).catch(() => [])
  const intn = detectarIntencion(mensaje, hoy, sinonimos)
  if (intn) {
    const directa = await responderDirecto(cuentaId, intn).catch(() => null)
    if (directa) {
      await logTurno(cuentaId, canal, 'assistant', directa)
      return { respuesta: directa, guardados: [], acciones: [] }
    }
  }

  // 0-bis) Si parece una consulta de DATOS pero el router no supo mapearla ("ingresos del piso de
  //    Busto"), la IA la clasifica a una INTENCIÓN estructurada y el SQL la ejecuta (cifra EXACTA, sin
  //    inventar). Menos incidencias con frases nuevas; y APRENDE el vocabulario para la próxima vez.
  //    Solo se dispara en preguntas de datos (no en charla libre) para no añadir latencia de balde.
  if (!esConsejo(mensaje)
      && /(cu[aá]nt|gast|ingres|cobr|balance|resumen|saldo|factur|tramo|irpf|marginal|\btotal\b|llevo|desglose|resultado|beneficio|rentab|c[oó]mo va)/i.test(mensaje)) {
    // Historial de la conversación para resolver seguimientos elípticos ("¿y gastos?", "¿y en junio?").
    // `getHistorial` ya incluye el turno actual (recién logueado): lo quitamos para pasar SOLO lo previo.
    const historial = (await getHistorial(cuentaId).catch(() => [])).slice(0, -1)
    const intnIA = await clasificarIntencionIA(mensaje, hoy, historial).catch(() => null)
    if (intnIA) {
      // 2ª opinión de OTRO modelo (fail-open): confirma, corrige, o rechaza (→ null = deriva al LLM
      // libre en vez de contestar mal). Evita que un mapeo erróneo del clasificador dé una cifra de otra cosa.
      const intnV = await verificarIntencionIA(mensaje, intnIA, hoy).catch(() => intnIA)
      if (intnV) {
        const directa = await responderDirecto(cuentaId, intnV).catch(() => null)
        if (directa) {
          // Aprende: las entidades que el router no supo mapear y la IA resolvió a un segmento pasan a ser
          // deterministas la próxima vez (instantáneas y gratis). Solo para gasto_destino (segmento claro).
          if (intnV.tipo === 'gasto_destino') {
            for (const term of entidadesResiduales(mensaje, sinonimos)) {
              await guardarSinonimoNegocio(cuentaId, term, intnV.destinos, intnV.etiqueta).catch(() => {})
            }
          }
          await logTurno(cuentaId, canal, 'assistant', directa)
          return { respuesta: directa, guardados: [], acciones: [] }
        }
      }
    }
  }

  const { texto: ctx, candidatos } = await construirContexto(cuentaId).catch(() => ({ texto: '(no se pudo leer el contexto)', candidatos: [] as any[] }))

  const prompt = `${ctx}\n\n# Mensaje de Alberto\n${mensaje}\n\n# Tu respuesta`
  // 12s: aiComplete encadena NIM → Groq → Kimi con este timeout CADA UNO, así el peor caso sigue
  // por debajo de lo que un móvil aguanta antes de cortar la conexión. Si se agota, el route
  // devuelve un mensaje claro ("IA saturada, reinténtalo") en vez de colgarse.
  // stripThink: si el modelo elegido es de razonamiento, quita su <think>…</think> antes de
  // parsear APRENDER/ACCION y de mostrar el texto (no-op para modelos normales).
  const { text } = await chatConDirector([{ role: 'user', content: prompt }], {
    app: 'plataforma', endpoint: 'contable', system: SYSTEM,
    maxTokens: 800, timeoutMs: 12_000, modeloClasico: MODELO_CONTABLE,
  })
  const raw = stripThink(text)

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
    propuestas.push({ tipo: v.accion.tipo, params, resumen: resumenAccion(v.accion, cand.concepto, { importe: cand.importe, fecha: cand.fecha, banco: cand.banco }) })
  }
  const acciones = propuestas.length ? await guardarAcciones(cuentaId, propuestas) : []

  await logTurno(cuentaId, canal, 'assistant', paso2.limpio)
  return { respuesta: paso2.limpio, guardados: paso1.aprendizajes, acciones }
}

// apps/plataforma/lib/contable/clasificar-ia.ts
// Clasificador de intención por IA: cuando el router determinista (intencion.ts) NO reconoce la
// pregunta, la IA la MAPEA a una intención estructurada (qué negocio / periodo / concepto) y luego el
// SQL de respuestas-directas hace la cuenta EXACTA. Así la IA aporta comprensión del lenguaje pero
// NUNCA toca las cifras (no las inventa). Devuelve null si la IA no está segura o falla (→ el cerebro
// cae a la respuesta libre con contexto). No es puro (llama a la pasarela); la validación del JSON sí
// lo es (`intencionDesdeJSON` en intencion.ts, testeada con node --test).
import { chatConDirector } from '@/lib/pasarela'
import { stripThink } from './parse'
import { intencionDesdeJSON, type Hoy, type Intencion } from './intencion'

const SISTEMA = `Eres un clasificador de intención para un agente financiero español. Recibes UNA pregunta y devuelves SOLO un objeto JSON con la intención. NO calculas cifras ni explicas nada.

Negocios de Alberto y su "destino":
- Correduría de seguros → "seguros".
- Dúplex / Villasís (un piso turístico concreto) → "turistico_duplex".
- Resto de pisos turísticos (House Sevillana, Busto Reform, Luxury Busto…) → "turistico_pisos".
- Actividad de Pilar (autónoma) → "actividad_pilar".
- Gasto personal → "personal".

Elige UN tipo:
- {"tipo":"gasto_destino","signo":"gasto|ingreso","destinos":["<destino>"],"etiqueta":"<texto corto>","anio":<n>,"mes":<1-12 opcional>} — pregunta sobre UN negocio ("ingresos del dúplex", "gastos de la correduría", "lo de Busto").
- {"tipo":"movimientos_anio","signo":"gasto|ingreso","anio":<n>} — total de un año, sin filtrar por negocio.
- {"tipo":"movimientos_mes","signo":"gasto|ingreso","anio":<n>,"mes":<1-12>} — total de un mes.
- {"tipo":"por_destino","anio":<n>} — desglose/comparativa entre TODOS los negocios.
- {"tipo":"subcategoria","signo":"gasto","subcategoria":"<slug>","etiqueta":"...","anio":<n>,"mes":opcional} — gasto personal de consumo (supermercado, restaurante_bar, gasolina, farmacia, ropa, colegio, deporte, suscripcion, hogar, transporte, ocio, hipoteca, club).
- {"tipo":"concepto","signo":"gasto|ingreso","terminos":["<palabra>"],"etiqueta":"...","anio":<n>,"mes":opcional} — un proveedor/comercio concreto por nombre.
- {"tipo":"tramo_fiscal","anio":<n>} — posición fiscal / tramo IRPF.
- {"tipo":"facturas_pendientes"} — facturas de proveedor sin pagar.

Reglas:
- Si NO es sobre dinero/cuentas/fiscalidad o no encaja en NINGÚN tipo, devuelve {"tipo":"ninguno"}.
- Año por defecto = el actual si no se menciona.
- Devuelve SOLO el JSON, sin texto alrededor ni markdown.`

export async function clasificarIntencionIA(mensaje: string, hoy: Hoy): Promise<Intencion | null> {
  const prompt = `Año actual: ${hoy.anio}. Mes actual: ${hoy.mes}.\nPregunta: ${mensaje}\nJSON:`
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

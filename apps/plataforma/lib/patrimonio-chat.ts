// Canal conversacional del PATRIMONIO por Telegram — parte PURA (sin `@/` ni prisma → node --test).
//
// Por qué existe: el informe del `patrimonio-cfo` era solo de IDA (Telegram mensual + doc);
// Alberto no podía preguntar de vuelta desde el móvil. Este módulo decide qué mensajes son del
// canal patrimonial y compone la foto/el contexto SIN tocar BD — las cifras llegan ya leídas
// (lib/patrimonio-telegram.ts). Regla de la casa: NULL = «no se sabe todavía» — la foto declara
// lo pendiente, jamás lo colapsa a 0.
import { eur } from './dinero.ts'
import type { ActivoPatrimonio, ResumenPatrimonio } from './patrimonio-resumen.ts'

export type RecomendacionViva = { id: number; fecha: string; titulo: string }

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ¿Es un mensaje para el agente patrimonial? Comando `/patrimonio …` o mención expresa de
// patrimonio/patrimonial. Deliberadamente ESTRECHO: el resto del texto libre sigue siendo del
// agente contable (que ya atiende gasto/ingresos/facturas) — un detector ancho lo secuestraría.
export function esPreguntaPatrimonio(texto: string): boolean {
  const t = texto.trim()
  if (/^\/patrimonio\b/i.test(t)) return true
  return /\bpatrimon(?:io|ial(?:es)?)\b/i.test(t)
}

// La pregunta en sí, sin el comando. '' = solo quiere la foto rápida.
export function preguntaDe(texto: string): string {
  return texto.trim().replace(/^\/patrimonio\b/i, '').trim()
}

function lineaActivo(a: ActivoPatrimonio): string {
  if (a.tenencia !== 'propiedad') return `· ${esc(a.nombre)}: subarrendado (negocio, no activo)`
  const v = a.valoracion
  if (!v) return `· ${esc(a.nombre)}: <i>sin valorar todavía</i>`
  return `· ${esc(a.nombre)}: ${eur(v.valor)} <i>(${esc(v.enfoque)}, ${v.fecha}, ${esc(v.fuente)})</i>`
}

// Foto rápida en HTML de Telegram. `recos = null` significa «no se ha podido leer la tabla»,
// que NO es lo mismo que «no hay recomendaciones» — y se dice.
export function fotoPatrimonioTg(
  resumen: ResumenPatrimonio,
  activos: ActivoPatrimonio[],
  recos: RecomendacionViva[] | null,
  intake: string[],
): string {
  const l: string[] = []
  l.push('💼 <b>Patrimonio — foto rápida</b>')
  l.push(`Neto mínimo conocido: <b>${eur(resumen.neto)}</b>${resumen.parcial ? ' (parcial)' : ''}`)
  const deuda = resumen.pasivosConocidos > 0 ? ` · 🏦 Deuda −${eur(resumen.pasivosConocidos)}` : ''
  l.push(`💧 Liquidez ${eur(resumen.liquidez)} · 📈 Bróker ${eur(resumen.broker)} · 🏠 Inmuebles ${eur(resumen.inmuebles)}${deuda}`)
  if (resumen.pasivoDesconocido) {
    l.push('⚠️ Hay deuda sin cuantificar (cuota conocida, capital sin dato): el neto es un MÍNIMO.')
  }
  for (const a of activos) l.push(lineaActivo(a))
  if (recos === null) {
    l.push('', '🧭 No he podido leer las recomendaciones ahora mismo (no significa que no haya).')
  } else if (recos.length) {
    l.push('', '🧭 <b>Recomendaciones pendientes de tu decisión:</b>')
    for (const r of recos) l.push(`· #${r.id} (${r.fecha}) ${esc(r.titulo)}`)
  }
  if (intake.length) {
    l.push('', `❓ Faltan ${intake.length} dato(s) para afinar el análisis — te los pregunta el informe mensual.`)
  }
  l.push('', 'Pregunta lo que quieras: <code>/patrimonio ¿me interesa ya vender el dúplex?</code>')
  return l.join('\n')
}

export type RecoContexto = RecomendacionViva & { recomendacion: string }

// Contexto para el LLM: TODAS las cifras van aquí dentro y la instrucción es no salirse de
// ellas. La IA redacta y compara; los importes salen de la BD, nunca de su memoria.
export function contextoPatrimonioIA(
  resumen: ResumenPatrimonio,
  activos: ActivoPatrimonio[],
  recos: RecoContexto[] | null,
  pregunta: string,
): { system: string; user: string } {
  const system = [
    'Eres el coordinador patrimonial («CFO personal») de Alberto: consolidas su patrimonio y le',
    'orientas sobre coste de oportunidad, ventas, amortización de hipoteca e inversión.',
    'Reglas ESTRICTAS:',
    '- Usa SOLO las cifras del contexto. Si un dato figura como «sin dato», di que no se sabe',
    '  todavía — NUNCA lo inventes, lo estimes ni lo trates como 0.',
    '- Solo orientas: no ejecutas ni prometes ejecutar ventas, órdenes ni comunicaciones.',
    '- Responde en español, compacto (es un chat de Telegram), sin markdown, importes en formato',
    '  español (2.162,49€). Si la pregunta pide un análisis que exige datos que faltan, dilo y',
    '  di qué dato hace falta.',
  ].join('\n')

  const l: string[] = []
  l.push(`Neto mínimo conocido: ${eur(resumen.neto)}${resumen.parcial ? ' (PARCIAL: ' + resumen.faltan.join('; ') + ')' : ''}`)
  l.push(`Liquidez bancaria: ${eur(resumen.liquidez)} · Bróker (IBKR): ${eur(resumen.broker)} · Inmuebles valorados: ${eur(resumen.inmuebles)} · Deuda conocida: ${eur(resumen.pasivosConocidos)}`)
  l.push('Activos:')
  for (const a of activos) {
    const partes: string[] = [`${a.nombre} [${a.tenencia}${a.uso ? ', ' + a.uso : ''}]`]
    partes.push(a.m2 != null ? `${a.m2} m²` : 'm² sin dato')
    partes.push(a.valorAdquisicion != null ? `adquisición ${eur(a.valorAdquisicion)}` : 'valor de adquisición sin dato')
    if (a.pctTitular != null || a.pctConyuge != null) {
      partes.push(`titularidad ${a.pctTitular ?? '?'}% Alberto / ${a.pctConyuge ?? '?'}% Pilar`)
    } else partes.push('titularidad sin dato')
    if (a.hipotecaCuotaMensual != null) {
      partes.push(`hipoteca cuota ${eur(a.hipotecaCuotaMensual)}/mes` +
        (a.hipotecaCapitalPendiente != null ? `, capital pendiente ${eur(a.hipotecaCapitalPendiente)}` : ', capital pendiente sin dato'))
    }
    if (a.licenciaVut === true) partes.push(`licencia VUT ${a.licenciaVutNum ?? 'nº sin dato'}`)
    const vals = a.valoracion
      ? `valoración vigente ${eur(a.valoracion.valor)} (${a.valoracion.enfoque}, ${a.valoracion.fecha}, fuente ${a.valoracion.fuente})`
      : 'sin valoración de mercado'
    partes.push(vals)
    l.push(`- ${partes.join(' · ')}`)
  }
  if (recos === null) {
    l.push('Recomendaciones del CFO: no se han podido leer en esta consulta (no afirmes que no hay).')
  } else if (recos.length) {
    l.push('Recomendaciones del CFO pendientes de decisión de Alberto:')
    for (const r of recos) l.push(`- #${r.id} (${r.fecha}) ${r.titulo}: ${r.recomendacion}`)
  } else {
    l.push('Recomendaciones del CFO pendientes: ninguna registrada.')
  }
  l.push('', `Pregunta de Alberto: ${pregunta}`)
  return { system, user: l.join('\n') }
}

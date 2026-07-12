// apps/plataforma/lib/contable/replay.mts
// ARNÉS DE REPLAY del router determinista contra PREGUNTAS REALES (extraídas de contable_log).
// Corre `detectarIntencion` sobre cada pregunta y clasifica en qué CARRIL cae:
//   • determinista → responde por SQL sin IA (instantáneo, gratis, no inventa)
//   • null → cae a la IA (clasificador o LLM libre): más lento y puede fallar
// Objetivo: medir la COBERTURA determinista sobre el uso real y sacar la lista de frases
// que se escapan, para convertirlas en cobertura nueva (no en tests inventados).
//   Uso:  node --experimental-strip-types lib/contable/replay.mts
// No toca BD ni '@/': el corpus va embebido (es un golden set que crece con el uso real).
import { detectarIntencion, type Intencion } from './intencion.ts'

// Corpus REAL (contable_log de Alberto, 12/07/2026). `orden` = acción esperada, para leer el
// informe de un vistazo; NO es un aserto (el router es conservador y derivar a IA es válido).
const CORPUS: { q: string; nota?: string }[] = [
  { q: 'Gastos socorro este mes?', nota: 'piso/gasto socorro' },
  { q: 'Y gastos?', nota: 'seguimiento → IA (contexto)' },
  { q: 'Ingresos de socorro este mes', nota: 'piso/ingreso socorro' },
  { q: 'Ingresos', nota: 'ambiguo → IA/LLM' },
  { q: 'Y este mes?', nota: 'seguimiento → IA (contexto)' },
  { q: 'Ingresos de duplex', nota: 'piso/ingreso dúplex' },
  { q: 'Dime ingresos del apartamento socorro y número de reservas.', nota: 'piso/ingreso socorro' },
  { q: '¿Cuánto llevo gastado en luz este año?', nota: 'concepto luz' },
  { q: 'Dime los gastos de comunidad que lleva el apartamento duplex este año', nota: 'concepto comunidad∩dúplex' },
  { q: 'Ingresos duplex 2026', nota: 'piso/ingreso dúplex' },
  { q: 'Clasifica el recibo de Endesa como pisos', nota: 'ACCIÓN → NO secuestrar (null)' },
  { q: 'Imposible', nota: 'charla → LLM' },
  { q: 'Cuanto lleva duplex facturado este año?', nota: 'piso/ingreso dúplex (facturado)' },
  { q: 'de ingresos?', nota: 'seguimiento → IA (contexto)' },
  { q: 'imporsible, quiero el importe total del todo año 2026', nota: 'total 2026 → año' },
  { q: 'me refiero a booking importe que lleva en 2026', nota: 'booking=ingreso pisos → IA' },
  { q: 'dime cuanto lleva factura socorro', nota: 'piso/INGRESO socorro (factura=facturación)' },
  { q: '¿Cómo van mis gastos de pisos vs correduría?', nota: 'por_destino' },
  { q: 'Que beneficio ha dado socorro ahora mismo?', nota: 'piso/resultado socorro' },
  { q: 'Gastos de este año 2026 correduria', nota: 'gasto_destino seguros' },
  { q: '¿Cuanto se ha gastado en supermercado en junio?', nota: 'subcategoria supermercado∩junio' },
  { q: 'CMI S.L es club mercantil', nota: 'enseñanza → LLM' },
  { q: 'pero dime los gastos e ingresos de mercantil', nota: 'club mercantil (doble signo) → IA' },
  { q: 'mirame los cargos del mes pasado del club mercantil', nota: 'subcategoria club∩mes pasado' },
  { q: 'La correduria que lleva este año?', nota: 'gasto_destino seguros' },
  { q: '¿Qué facturas de proveedor tengo pendientes?', nota: 'facturas_pendientes' },
  { q: '¿Cuanto llevo gastado en claude?', nota: 'concepto claude' },
  { q: 'En que tramo fiscal estamos ahora mismo?', nota: 'tramo_fiscal' },
  { q: 'Que dinero llevo ganado con la correduria?', nota: 'gasto_destino seguros/INGRESO (ganado)' },
  { q: 'Dime gasto total junio', nota: 'movimientos_mes junio' },
]

const HOY = { anio: 2026, mes: 7 }

function resumen(i: Intencion | null): string {
  if (!i) return '— null (→ IA)'
  switch (i.tipo) {
    case 'piso': return `piso/${i.modo} ${i.propertyId}`
    case 'gasto_destino': return `gasto_destino ${i.signo} [${i.destinos.join(',')}]`
    case 'concepto': return `concepto ${i.signo} "${i.etiqueta}"${i.destinos ? '∩' + i.destinos.join(',') : ''}`
    case 'subcategoria': return `subcategoria ${i.subcategoria}`
    case 'movimientos_mes': return `movimientos_mes ${i.signo} ${i.mes}`
    case 'movimientos_anio': return `movimientos_anio ${i.signo}`
    case 'por_destino': return 'por_destino'
    case 'facturas_pendientes': return 'facturas_pendientes'
    case 'tramo_fiscal': return 'tramo_fiscal'
    default: return i.tipo
  }
}

let deterministas = 0
const nulos: { q: string; nota?: string }[] = []
console.log('\n═══ REPLAY router determinista sobre corpus REAL ═══\n')
for (const { q, nota } of CORPUS) {
  const i = detectarIntencion(q, HOY)
  if (i) deterministas++; else nulos.push({ q, nota })
  const marca = i ? '✅' : '⬜'
  console.log(`${marca} ${resumen(i).padEnd(34)} ← ${q}`)
}
const pct = Math.round((deterministas / CORPUS.length) * 100)
console.log(`\nCobertura determinista: ${deterministas}/${CORPUS.length} (${pct}%). ${nulos.length} caen a IA/LLM:`)
for (const { q, nota } of nulos) console.log(`   ⬜ ${q}${nota ? `   [esperado: ${nota}]` : ''}`)
console.log('')

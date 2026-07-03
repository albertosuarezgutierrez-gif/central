// apps/plataforma/lib/contable/formato.ts
// Formateador PURO del contexto contable → string para el prompt. Sin BD ni alias '@/', así el
// test (node --test) puede cargarlo aislado (mismo motivo por el que parse.ts es autónomo).

export type Candidato = {
  ref: string; movId: string; fecha: string; concepto: string; importe: number; destino: string; porRevisar: boolean
}

export type CtxData = {
  year: number
  porDestino: { destino: string; gastos: number; ingresos: number }[]
  candidatos: Candidato[]
  facturas: { proveedor: string; importe: number; estado: string }[]
  memoria: { clave: string; insight: string }[]
  historial: { rol: string; mensaje: string }[]
}

const DESTINO_LABEL: Record<string, string> = {
  turistico_pisos: 'Pisos turísticos', turistico_duplex: 'Dúplex/Villasís',
  seguros: 'Correduría (seguros)', personal: 'Personal', traspaso_interno: 'Traspaso interno',
}

export function formatearContexto(d: CtxData): string {
  const dest = d.porDestino.length
    ? d.porDestino.map(x => `- ${DESTINO_LABEL[x.destino] || x.destino}: gastos ${Math.round(x.gastos)}€, ingresos ${Math.round(x.ingresos)}€`).join('\n')
    : '- (sin movimientos este año)'
  const cand = d.candidatos.length
    ? d.candidatos.map(x =>
        `- ${x.ref} · ${x.fecha} · ${(x.concepto || '').slice(0, 50)} · ${Number(x.importe).toFixed(2)}€ [${DESTINO_LABEL[x.destino] || x.destino}]${x.porRevisar ? ' ⚠️ por revisar' : ''}`
      ).join('\n')
    : '- (sin movimientos recientes)'
  const fac = d.facturas.length
    ? d.facturas.map(x => `- ${x.proveedor} · ${Number(x.importe).toFixed(2)}€ · ${x.estado}`).join('\n')
    : '- (ninguna pendiente)'
  const mem = d.memoria.length
    ? d.memoria.map(x => `- [${x.clave}] ${x.insight}`).join('\n')
    : '- (aún no sé nada de tu rutina — cuéntamelo y lo recordaré)'
  const hist = d.historial.length
    ? d.historial.map(x => `${x.rol === 'user' ? 'Alberto' : 'Tú'}: ${x.mensaje}`).join('\n')
    : ''
  return `# Resumen ${d.year} por destino (deducibilidad)
${dest}

# Movimientos (usa el #ref para proponer una ACCION)
${cand}

# Facturas de proveedor pendientes
${fac}

# Lo que sé de tu rutina (memoria)
${mem}${hist ? `\n\n# Conversación reciente\n${hist}` : ''}`
}

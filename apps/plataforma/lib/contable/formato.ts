// apps/plataforma/lib/contable/formato.ts
// Formateador PURO del contexto contable → string para el prompt. Sin BD ni alias '@/', así el
// test (node --test) puede cargarlo aislado (mismo motivo por el que parse.ts es autónomo).

export type Candidato = {
  ref: string; movId: string; fecha: string; concepto: string; importe: number; destino: string; porRevisar: boolean
  banco?: string | null
}

export type CtxData = {
  year: number
  porDestino: { destino: string; gastos: number; ingresos: number }[]
  candidatos: Candidato[]
  facturas: { proveedor: string; importe: number; estado: string }[]
  memoria: { clave: string; insight: string }[]
  historial: { rol: string; mensaje: string }[]
  // Posición fiscal IRPF del año (estimación con lo declarado). Opcional: si no se pudo calcular, se omite.
  fiscal?: {
    base: number; tramoTipo: number; tramoDesde: number; tramoHasta: number | null
    tipoEfectivo: number; margenProximo: number | null; ahorroBajar: number | null
    exento?: number   // prestaciones exentas cobradas en la correduría (no tributan)
  } | null
  // Panorama de negocios: estructura (sociedad → negocios) y saldos bancarios. Opcionales.
  estructura?: { sociedad: string; negocio: string | null; sector: string | null }[]
  saldos?: { sociedad: string; banco: string | null; alias: string | null; saldo: number | null }[]
  // Gasto REAL por categoría (solo para preguntas de consejo/ahorro). Excluye ingresos y traspasos
  // internos. Es la muestra que el modelo debe usar para aconsejar (NO la lista de "Movimientos").
  mayoresGastos?: { destino: string; subcategoria: string | null; gastado: number; n: number }[]
}

const e0 = (n: number) => `${Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}€`
const pct = (x: number) => `${Math.round((x || 0) * 100)}%`

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
  // Panorama de negocios (estructura sociedad→negocios).
  const socs = new Map<string, string[]>()
  for (const e of d.estructura || []) {
    const arr = socs.get(e.sociedad) || []
    if (e.negocio) arr.push(`${e.negocio}${e.sector ? ` (${e.sector})` : ''}`)
    socs.set(e.sociedad, arr)
  }
  const estr = socs.size
    ? [...socs.entries()].map(([s, ns]) => `- ${s}: ${ns.length ? ns.join(', ') : '(sin negocios dados de alta)'}`).join('\n')
    : ''
  const sal = (d.saldos && d.saldos.length)
    ? d.saldos.map(x => `- ${[x.banco, x.alias].filter(Boolean).join(' ') || 'Cuenta'} [${x.sociedad}]: ${x.saldo != null ? e0(x.saldo) : '—'}`).join('\n')
    : ''
  // Gasto real por categoría (para consejos). Personal → "Personal · <subcategoría>"; negocio → su destino.
  const gastosReales = (d.mayoresGastos && d.mayoresGastos.length)
    ? d.mayoresGastos.map(x => {
        const etiqueta = x.destino === 'personal'
          ? `Personal · ${x.subcategoria || 'sin clasificar'}`
          : (DESTINO_LABEL[x.destino] || x.destino)
        return `- ${etiqueta}: ${e0(x.gastado)}${x.n > 1 ? ` (${x.n} mov.)` : ''}`
      }).join('\n')
    : ''
  const fis = d.fiscal ? [
    `- Base imponible estimada: ${e0(d.fiscal.base)}`,
    `- Tramo marginal actual (IRPF): ${pct(d.fiscal.tramoTipo)} (${d.fiscal.tramoHasta != null ? `de ${e0(d.fiscal.tramoDesde)} a ${e0(d.fiscal.tramoHasta)}` : `desde ${e0(d.fiscal.tramoDesde)}`})`,
    `- Tipo medio efectivo: ${pct(d.fiscal.tipoEfectivo)}`,
    d.fiscal.margenProximo != null ? `- Faltan ${e0(d.fiscal.margenProximo)} de base para el siguiente tramo` : null,
    d.fiscal.ahorroBajar != null ? `- Bajando al tramo previo ahorrarías ~${e0(d.fiscal.ahorroBajar)}` : null,
    d.fiscal.exento ? `- Prestaciones EXENTAS cobradas en la correduría (no tributan, ya fuera de la base): ${e0(d.fiscal.exento)}` : null,
  ].filter(Boolean).join('\n') : ''
  return `${estr ? `# Tus sociedades y negocios\n${estr}\n\n` : ''}${sal ? `# Saldos bancarios (último conocido)\n${sal}\n\n` : ''}# Resumen ${d.year} por destino (deducibilidad)
${dest}
${fis ? `\n# Fiscal IRPF ${d.year} (estimación con lo declarado hasta hoy)\n${fis}\n` : ''}${gastosReales ? `\n# En qué gastas de verdad ${d.year} (gasto REAL por categoría — ÚSALO para aconsejar; excluye ingresos y traspasos internos)\n${gastosReales}\n` : ''}
# Movimientos (usa el #ref para proponer una ACCION)
${cand}

# Facturas de proveedor pendientes
${fac}

# Lo que sé de tu rutina (memoria)
${mem}${hist ? `\n\n# Conversación reciente\n${hist}` : ''}`
}

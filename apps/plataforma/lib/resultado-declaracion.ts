// Resultado de la declaración IRPF (a pagar / a devolver) en CONJUNTA e INDIVIDUAL (Alberto y Pilar).
// PURO: sin BD, sin reloj, sin React. Se ejecuta igual en el servidor y en el cliente (simulador «¿y si…?»).
//
// Reutiliza, sin duplicar lógica: `declarar` (bases, mínimos, cuota íntegra por escalas, donativos) de
// `simulador-irpf.ts` y `calcularDeducciones` (maternidad + guardería con su tope, familia numerosa
// art. 81 bis, Andalucía) de `fiscal-deducciones.ts`. Aquí solo se hace el REPARTO por modalidad y la
// cuenta final:  resultado = cuota líquida − deducciones − retenciones − pagos fraccionados − reembolsables + abonos.
//
// Regla NULL: una partida que no se sabe es `importe: null` («pendiente de dato»), nunca 0 en pantalla.
// Para poder dar una cifra, el total cuenta las pendientes como 0 y las LISTA en `pendientes`
// (`firme: false`): la cifra es provisional hasta que lleguen.
import { calcularDeducciones, importesDe, type Descendiente, type LineaDeduccion, type PerfilFiscal } from './fiscal-deducciones.ts'
import type { AbonosBanco } from './abonos-anticipados.ts'
import { declarar, type EntradaSimulador, type Palancas, type PorTitular, type ResultadoContribuyente } from './simulador-irpf.ts'

const r2 = (n: number) => Math.round(n * 100) / 100

export type Partida = {
  id: string
  etiqueta: string
  /** null = pendiente de dato. */
  importe: number | null
  /** true = cifra calculada con un supuesto o proyectada (no es un dato cerrado). */
  estimada: boolean
  nota?: string
}
export type DeduccionPartida = Partida & { reembolsable: boolean; ambito: 'estatal' | 'andalucia' }

export type FuenteRetencion = 'real' | 'mixta' | 'estimada'
export type RetencionCorreduria = { total: number; real: number | null; estimada: number; fuente: FuenteRetencion }

/** Todo lo que el resultado necesita además de la entrada del simulador (serializable server → cliente). */
export type ContextoResultado = {
  anio: number
  perfil: PerfilFiscal
  descendientes: Descendiente[]
  /** Retención de las comisiones A FECHA DE HOY (real + estimada al 15 %). null = no se pudo calcular. */
  retencionesAlberto: RetencionCorreduria | null
  /** Retenciones soportadas por Pilar en el año (fiscal_perfil.conyuge_retenciones). null = sin dato. */
  retencionesPilar: number | null
  /** Modelo 130 pagado. Hoy no existe en BD: null = sin dato. */
  pagosFraccionados: PorTitular<number | null>
  /** Meses transcurridos del año (1..12) para anualizar las retenciones del cierre. */
  mesesTranscurridos: number
  /** Guardería pagada en banco en el año (sin duplicados ignorados). null = sin dato. Solo para contrastar con el perfil. */
  guarderiaBancoAnual?: number | null
  /** Abonos anticipados 140/143 leídos del banco (100 € AEAT). null/ausente = no se pudo leer ⇒ se usa el perfil. */
  abonosBanco?: AbonosBanco | null
  /** Avisos de tipificación (p. ej. posible prestación exenta de Pilar). */
  avisos: string[]
}

export type ContribuyenteFinal = {
  titular: 'alberto' | 'pilar' | 'unidad_familiar'
  baseLiquidable: number | null
  cuotaIntegra: number | null
  /** Donativos (Ley 49/2002), ya restados en la cuota líquida del motor. */
  donativos: number | null
  deducciones: DeduccionPartida[]
  retenciones: Partida[]
  pagosFraccionados: Partida[]
  abonosAnticipados: Partida[]
  /** Cuota líquida tras las deducciones NO reembolsables (Andalucía). null = base desconocida. */
  cuotaLiquida: number | null
  /** > 0 a pagar · < 0 a devolver. null = no se puede calcular (falta la base). */
  resultado: number | null
  pendientes: string[]
  estimada: boolean
}
export type ResultadoModalidad = {
  modalidad: 'conjunta' | 'individual'
  contribuyentes: ContribuyenteFinal[]
  resultado: number | null
  pendientes: string[]
  estimada: boolean
}
export type ResultadoFinal = {
  conjunta: ResultadoModalidad
  individual: ResultadoModalidad
  /** La de menor resultado (menos a pagar / más a devolver). null si alguna no se puede calcular. */
  recomendada: 'conjunta' | 'individual' | null
  /** Ventaja en € de la recomendada. */
  ventaja: number | null
  /** true = ninguna partida pendiente en ninguna modalidad. */
  firme: boolean
  /** true = falta el dato de abonos anticipados 140/143: el resultado puede ser MENOS favorable (no se inventa rango). */
  faltanAbonos: boolean
  /** Aviso destacado cuando `faltanAbonos` (null si no). */
  avisoAbonos: string | null
  avisos: string[]
}

// ── Retenciones ─────────────────────────────────────────────────────────────────────────────
/** Anualiza la retención de comisiones a 31/12 (run-rate). Siempre estimada. */
export function retencionCierre(r: RetencionCorreduria | null, mesesTranscurridos: number): Partida {
  if (r == null) return { id: 'ret_correduria', etiqueta: 'Retenciones de comisiones (correduría)', importe: null, estimada: true, nota: 'no se pudo calcular' }
  const m = Math.min(12, Math.max(1, Math.round(mesesTranscurridos)))
  const total = r2(r.total * 12 / m)
  const origen = r.fuente === 'real' ? 'real' : r.fuente === 'mixta' ? 'real + estimada 15 %' : 'estimada 15 %'
  return {
    id: 'ret_correduria', etiqueta: 'Retenciones de comisiones (correduría)', importe: total, estimada: true,
    nota: m === 12 ? `a 31/12 (${origen})` : `${origen} a hoy, anualizada a 31/12`,
  }
}
const partidaRetPilar = (v: number | null): Partida =>
  ({ id: 'ret_pilar', etiqueta: 'Retenciones de Pilar (actividad)', importe: v, estimada: false, nota: v == null ? 'sin dato en el perfil fiscal' : 'dato del perfil fiscal (sin certificado)' })
const partidaPf = (t: 'alberto' | 'pilar', v: number | null): Partida =>
  ({ id: `m130_${t}`, etiqueta: `Modelo 130 ${t === 'alberto' ? 'Alberto' : 'Pilar'}`, importe: v, estimada: false, nota: v == null ? 'no hay dato de pagos fraccionados' : undefined })

// ── Deducciones: líneas del motor → partidas ────────────────────────────────────────────────
const aPartida = (l: LineaDeduccion, factor = 1, nota?: string): DeduccionPartida => ({
  id: l.clave, etiqueta: l.concepto, importe: l.sinDato ? null : r2(l.importe * factor), estimada: Boolean(l.estimado),
  nota: l.sinDato ? 'pendiente de dato (falta un dato del perfil)' : nota, reembolsable: l.reembolsable, ambito: l.ambito,
})
const MARCA_TOPE = (p: DeduccionPartida): DeduccionPartida => p

const eur2 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })
/** Origen del importe de guardería (perfil) y contraste con el banco: avisa si difieren. */
export function notaOrigenGuarderia(perfil: PerfilFiscal, banco: number | null | undefined): string {
  const base = `origen: perfil (${eur2(perfil.gastoGuarderiaAnual)}€)`
  if (banco == null) return `${base}; banco: sin dato`
  if (Math.abs(banco - perfil.gastoGuarderiaAnual) <= 0.01) return `${base}; coincide con el banco`
  return `${base}; ⚠ difiere del banco (${eur2(banco)}€): revisar cuál es el gasto real`
}
function lineasDeduccion(perfil: PerfilFiscal, desc: Descendiente[], anio: number, baseLiq: number | undefined): LineaDeduccion[] {
  // Donativos los trata el motor del simulador (palancas): fuera de aquí para no contarlos dos veces.
  return calcularDeducciones(perfil, desc, anio, importesDe(anio), baseLiq).filter(l => l.clave !== 'donativos')
}

/** Maternidad+guardería con tope: la guardería y la maternidad dependen de la cuota RETA (sin confirmar anual/mensual). */
function notaTope(l: LineaDeduccion, perfil: PerfilFiscal, banco?: number | null): string | undefined {
  if (l.clave === 'guarderia') {
    const o = notaOrigenGuarderia(perfil, banco)
    return perfil.cuotasSSMadreAnual != null ? `con tope por cuotas RETA de Pilar; ${o}` : o
  }
  if ((l.clave === 'maternidad' || l.clave === 'guarderia') && perfil.cuotasSSMadreAnual != null) {
    return 'con tope por cuotas RETA de Pilar (el dato guardado no está confirmado como anual)'
  }
  return undefined
}

/** Partidas de abonos anticipados (modelos 140/143): sin dato ⇒ pendiente. */
function abonos(perfil: PerfilFiscal, parteMat: number, parteFn: number): Partida[] {
  const f = (id: string, etiqueta: string, v: number | null | undefined, parte: number): Partida => ({
    id, etiqueta, importe: v == null ? null : r2(v * parte), estimada: false, nota: v == null ? 'sin dato: si cobraron el abono anticipado, resta del resultado' : undefined,
  })
  return [
    ...(parteMat > 0 ? [f('abono_mat', 'Abono anticipado maternidad (modelo 140)', perfil.abonoAnticipadoMaternidad, parteMat)] : []),
    ...(parteFn > 0 && perfil.familiaNumerosa ? [f('abono_fn', 'Abono anticipado familia numerosa (modelo 143)', perfil.abonoAnticipadoFamiliaNumerosa, parteFn)] : []),
  ]
}

/** Abonos del banco (real + proyección a 31/12): una partida por contribuyente. `p140`/`p143` = fracción de cada modelo que le toca. */
function abonosDelBanco(b: AbonosBanco, p140: number, p143: number): Partida[] {
  if (p140 <= 0 && p143 <= 0) return []
  const t140 = b.real140 + b.estimado140, t143 = b.real143 + b.estimado143
  const importe = r2(t140 * p140 + t143 * p143)
  const est = (b.estimado140 > 0 && p140 > 0) || (b.estimado143 > 0 && p143 > 0)
  const sup = p140 > 0 && b.desglose.some(d => d.supuesto)
  const real = r2(b.real140 * p140 + b.real143 * p143), futuro = r2(importe - real)
  return [{
    id: 'abono_banco', etiqueta: 'Abonos anticipados 140/143 (del banco)', importe, estimada: est || sup,
    nota: `del banco: ${b.n} abonos imputados a ${b.desglose.length ? 'meses ' + [...new Set(b.desglose.map(d => d.mes))].join(', ') : 'ningún mes'} (${eur2(real)}€)`
      + (futuro > 0 ? `; estimado hasta 31/12: +${eur2(futuro)}€ al ritmo del último mes` : '')
      + (sup ? '; algún abono de 100,00€ sin etiqueta de modelo se supone 140' : ''),
  }]
}

/** Reparto individual de los abonos del banco: el modelo 140 (maternidad) va a Pilar; el 143 (familia numerosa) 50/50 (todo Alberto si Pilar no trabaja). */
export function abonosBancoIndividual(b: AbonosBanco, titular: 'alberto' | 'pilar', perfil: PerfilFiscal): Partida[] {
  const fn = perfil.conyugeTrabaja ? 0.5 : 0
  return titular === 'pilar' ? abonosDelBanco(b, 1, fn) : abonosDelBanco(b, 0, 1 - fn)
}

// ── Cuenta final de un contribuyente ────────────────────────────────────────────────────────
const sumaP = (ps: Partida[]) => ps.reduce((s, p) => s + (p.importe ?? 0), 0)

export function cerrarContribuyente(
  titular: ContribuyenteFinal['titular'], c: ResultadoContribuyente | null,
  deducciones: DeduccionPartida[], retenciones: Partida[], pagosFraccionados: Partida[], abonosAnt: Partida[],
): ContribuyenteFinal {
  const todas: Partida[] = [...deducciones, ...retenciones, ...pagosFraccionados, ...abonosAnt]
  const pendientes = todas.filter(p => p.importe == null).map(p => p.etiqueta)
  const estimada = todas.some(p => p.estimada)
  const base = { titular, deducciones, retenciones, pagosFraccionados, abonosAnticipados: abonosAnt, pendientes, estimada }
  if (c == null || c.cuota == null || c.cuotaLiquida == null || c.baseLiquidable == null) {
    return { ...base, baseLiquidable: c?.baseLiquidable ?? null, cuotaIntegra: null, donativos: null, cuotaLiquida: null, resultado: null }
  }
  // No reembolsables (Andalucía): restan de su cuota (la autonómica), nunca por debajo de 0.
  const noReemb = deducciones.filter(d => !d.reembolsable)
  const dedAut = sumaP(noReemb.filter(d => d.ambito === 'andalucia'))
  const dedEst = sumaP(noReemb.filter(d => d.ambito === 'estatal'))
  const aplicada = Math.min(dedAut, c.cuota.autonomica) + Math.min(dedEst, c.cuota.estatal)
  const cuotaLiquida = r2(Math.max(0, c.cuotaLiquida - aplicada))
  const reemb = sumaP(deducciones.filter(d => d.reembolsable))
  const resultado = r2(cuotaLiquida - sumaP(retenciones) - sumaP(pagosFraccionados) - reemb + sumaP(abonosAnt))
  return { ...base, baseLiquidable: c.baseLiquidable, cuotaIntegra: c.cuota.total, donativos: c.deduccionDonativos, cuotaLiquida, resultado }
}

function cerrarModalidad(modalidad: ResultadoModalidad['modalidad'], cs: ContribuyenteFinal[]): ResultadoModalidad {
  const rs = cs.map(c => c.resultado)
  return {
    modalidad, contribuyentes: cs,
    resultado: rs.some(x => x == null) ? null : r2(rs.reduce<number>((s, x) => s + (x as number), 0)),
    pendientes: [...new Set(cs.flatMap(c => c.pendientes))],
    estimada: cs.some(c => c.estimada),
  }
}

// ── Resultado completo ──────────────────────────────────────────────────────────────────────
export function calcularResultadoDeclaracion(e: EntradaSimulador, palIn: Palancas, ctx: ContextoResultado): ResultadoFinal {
  const anio = ctx.anio
  // Donativos reales del perfil (Ley 49/2002): los deduce el motor (palancas), no `lineasDeduccion` (las filtra), así no se cuentan
  // dos veces. El perfil no dice quién donó: se atribuyen a Alberto (declarante); se SUMAN a los hipotéticos de la palanca.
  const donReal = Math.max(0, ctx.perfil.donativosAnual || 0)
  const pal: Palancas = donReal > 0 ? { ...palIn, donativos: { ...palIn.donativos, alberto: palIn.donativos.alberto + donReal } } : palIn
  // Abonos del banco solo si hay alguno (n>0): 0 leídos no es «cero abonos», cae al perfil / aviso (null ≠ 0).
  const banco = ctx.abonosBanco && ctx.abonosBanco.n > 0 ? ctx.abonosBanco : null
  const retAlb = retencionCierre(ctx.retencionesAlberto, ctx.mesesTranscurridos)
  const retPil = partidaRetPilar(ctx.retencionesPilar)
  const pfA = partidaPf('alberto', ctx.pagosFraccionados.alberto)
  const pfP = partidaPf('pilar', ctx.pagosFraccionados.pilar)

  // ── Conjunta: toda la familia en una declaración ──
  const dc = declarar(e, pal, 'conjunta')
  const cc = dc.contribuyentes[0] ?? null
  const perfilConj: PerfilFiscal = { ...ctx.perfil, declaracionConjunta: true }
  const dedConj = lineasDeduccion(perfilConj, ctx.descendientes, anio, cc?.baseLiquidable ?? undefined)
    .map(l => aPartida(l, 1, notaTope(l, ctx.perfil, ctx.guarderiaBancoAnual))).map(MARCA_TOPE)
  const conjunta = cerrarModalidad('conjunta', [
    cerrarContribuyente('unidad_familiar', cc, dedConj, [retAlb, retPil], [pfA, pfP], banco ? abonosDelBanco(banco, 1, 1) : abonos(ctx.perfil, 1, 1)),
  ])

  // ── Individual: cada uno la suya. Reparto de las deducciones familiares ──
  // · Maternidad + incremento por guardería: la madre (Pilar) [art. 81 LIRPF].
  // · Familia numerosa estatal y autonómica y nacimiento (Andalucía): a partes iguales entre quienes tienen
  //   derecho (art. 81 bis LIRPF: «se prorrateará por partes iguales»). Si Pilar no tiene actividad, todo a Alberto.
  // · Cada autonómica con su propio límite de renta (base de cada uno).
  const di = declarar(e, pal, 'individual')
  const perfilInd: PerfilFiscal = { ...ctx.perfil, declaracionConjunta: false }
  const cA = di.contribuyentes.find(c => c.titular === 'alberto') ?? null
  const cP = di.contribuyentes.find(c => c.titular === 'pilar') ?? null
  const lineasDe = (c: ResultadoContribuyente | null) => lineasDeduccion(perfilInd, ctx.descendientes, anio, c?.baseLiquidable ?? undefined)
  const lineasPorTitular = { alberto: lineasDe(cA), pilar: lineasDe(cP) }
  const conDerecho = (l: LineaDeduccion) => Boolean(l.sinDato) || l.importe > 0
  const importeConjunta = (id: string) => dedConj.find(d => d.id === id)?.importe ?? 0
  const individual = (titular: 'alberto' | 'pilar', c: ResultadoContribuyente | null): ContribuyenteFinal => {
    const otro = titular === 'alberto' ? 'pilar' : 'alberto'
    const mias: DeduccionPartida[] = []
    for (const l of lineasPorTitular[titular]) {
      if (l.clave === 'maternidad' || l.clave === 'guarderia') {
        if (titular === 'pilar') mias.push(aPartida(l, 1, notaTope(l, ctx.perfil, ctx.guarderiaBancoAnual)))
        continue
      }
      // Prorrateo SOLO entre quienes tienen derecho (p. ej. límite de renta autonómico propio de cada uno):
      // si el otro no la tiene (o no hay cónyuge con actividad), me la aplico al 100 %.
      const otroTiene = ctx.perfil.conyugeTrabaja && lineasPorTitular[otro].some(x => x.clave === l.clave && conDerecho(x))
      if (titular === 'pilar' && !ctx.perfil.conyugeTrabaja) continue
      const factor = otroTiene && conDerecho(l) ? 0.5 : 1
      mias.push(aPartida(l, factor, factor === 1 ? undefined : 'reparto 50/50 entre los dos (art. 81 bis)'))
    }
    const parteFn = titular === 'alberto' ? (ctx.perfil.conyugeTrabaja ? 0.5 : 1) : ctx.perfil.conyugeTrabaja ? 0.5 : 0
    return cerrarContribuyente(
      titular, c, mias,
      [titular === 'alberto' ? retAlb : retPil], [titular === 'alberto' ? pfA : pfP],
      banco ? abonosBancoIndividual(banco, titular, ctx.perfil) : abonos(ctx.perfil, titular === 'pilar' ? 1 : 0, parteFn),
    )
  }
  const ind = cerrarModalidad('individual', [individual('alberto', cA), individual('pilar', cP)])

  const comparables = conjunta.resultado != null && ind.resultado != null
  const recomendada = !comparables ? null : (ind.resultado as number) < (conjunta.resultado as number) ? 'individual' : 'conjunta'
  const faltanAbonos = [conjunta, ind].some(m => m.contribuyentes.some(c => c.abonosAnticipados.some(a => a.importe == null)))
  return {
    conjunta, individual: ind, recomendada,
    faltanAbonos,
    avisoAbonos: faltanAbonos ? 'Resultado provisional: puede ser menos favorable: faltan abonos anticipados 140/143 (se cuentan como 0 hasta tener el dato).' : null,
    ventaja: !comparables ? null : r2(Math.abs((ind.resultado as number) - (conjunta.resultado as number))),
    firme: conjunta.pendientes.length === 0 && ind.pendientes.length === 0,
    avisos: ctx.avisos,
  }
}

// ── Aviso: posible prestación por nacimiento exenta (art. 7.h LIRPF) ────────────────────────
export type IngresoPilar = { fecha: string; concepto: string; importe: number }
const PATRON_PRESTACION = /\b(INSS|TGSS|SEGURIDAD\s+SOCIAL|PRESTACI[OÓ]N|NACIMIENTO|MATERNIDAD|PATERNIDAD|CUIDADO\s+DEL?\s+MENOR|CORRESPONSABILIDAD)\b/i

/** Texto de aviso si algún ingreso tipificado como actividad de Pilar parece una prestación exenta; null si ninguno. NO cambia datos. */
export function avisoPrestacionExenta(ingresos: IngresoPilar[]): string | null {
  const sospechosos = ingresos.filter(i => i.importe > 0 && PATRON_PRESTACION.test(i.concepto))
  if (!sospechosos.length) return null
  const total = r2(sospechosos.reduce((s, i) => s + i.importe, 0))
  return `Posible prestación por nacimiento exenta (art. 7.h LIRPF): ${sospechosos.length} ingreso(s) de Pilar por ${total.toLocaleString('es-ES', { minimumFractionDigits: 2, useGrouping: true })}€ cuyo concepto lo sugiere están como actividad económica: revisar.`
}

// ── Contexto (lo arma el servidor; el cliente lo recibe serializado) ────────────────────────
/** Meses transcurridos del ejercicio a fecha `hoy` (YYYY-MM-DD): año distinto del actual ⇒ 12 (ejercicio cerrado). */
export function mesesTranscurridos(anio: number, hoy: string): number {
  const a = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7))
  if (a !== anio) return a > anio ? 12 : 1
  return Math.min(12, Math.max(1, m))
}

export function armarContextoResultado(e: {
  anio: number; hoy: string; perfil: PerfilFiscal; descendientes: Descendiente[]
  retencionesCorreduria: RetencionCorreduria | null; retencionesPilar: number | null; ingresosPilar: IngresoPilar[] | null
  pagosFraccionados?: PorTitular<number | null>; guarderiaBanco?: number | null; abonosBanco?: AbonosBanco | null
}): ContextoResultado {
  const aviso = e.ingresosPilar ? avisoPrestacionExenta(e.ingresosPilar) : null
  return {
    anio: e.anio, perfil: e.perfil, descendientes: e.descendientes,
    retencionesAlberto: e.retencionesCorreduria, retencionesPilar: e.retencionesPilar,
    // Modelo 130: hoy no existe en BD ⇒ «sin dato» (null), no 0.
    pagosFraccionados: e.pagosFraccionados ?? { alberto: null, pilar: null },
    mesesTranscurridos: mesesTranscurridos(e.anio, e.hoy),
    guarderiaBancoAnual: e.guarderiaBanco ?? null,
    abonosBanco: e.abonosBanco ?? null,
    avisos: aviso ? [aviso] : [],
  }
}

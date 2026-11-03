import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  primaRitmoFinde, primaFindeFecha, PRIMA_FINDE_MAX, MIN_RESERVAS_FINDE, type ReservaRitmo,
  type CanceladaRitmo, pisosConPrimaFinde, primaPiso, primaFindeCentinela, ritmoFindePorPiso, type RitmoFinde,
  factorRitmoSemana, factorSemanaFecha, factorSemanaPiso, urgenciaCombinada, FACTOR_SEMANA_MIN,
  MIN_RESERVAS_SEMANA, VENTANA_SEMANA_MIN, VENTANA_SEMANA_MAX,
} from "./pricing-ritmo-finde.ts"
import { techoMercado } from "./pricing-techo-mercado.ts"
import { aplicarTechoAdr } from "./pricing-techo-adr.ts"

// «hoy» INYECTADO y todo lo demás relativo a él: el módulo no mira el reloj, y el test tampoco
// (regla del CLAUDE.md raíz: fecha fija contra reloj real = bomba de tiempo). Se usa la fecha real
// de hoy a propósito, para que cualquier dependencia escondida del reloj salga aquí.
const HOY = new Date().toISOString().slice(0, 10)
const DIA = 86_400_000
const mas = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DIA).toISOString().slice(0, 10)
const dow = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay()

/** Viernes en el rango [desde, hasta) relativo a HOY (días). */
function viernes(desde: number, hasta: number): string[] {
  const out: string[] = []
  for (let d = desde; d < hasta; d++) { const f = mas(HOY, d); if (dow(f) === 5) out.push(f) }
  return out
}

/** Estancia vie+sáb reservada `lead` días antes del check-in. */
const finde = (vie: string, lead: number | null): ReservaRitmo =>
  ({ checkIn: vie, nights: 2, reservedAt: lead == null ? null : mas(vie, -lead) })

/** Pasado: vende la fracción `occ` de los findes de los últimos 12 meses con antelación `lead`. */
function pasado(occ: number, lead: number): ReservaRitmo[] {
  const vs = viernes(-364, 0)
  const cada = Math.round(1 / occ)
  return vs.filter((_, i) => i % cada === 0).map(v => finde(v, lead))
}

test("sin muestra (< MIN_RESERVAS_FINDE reservas de finde) → prima null, no 1", () => {
  const rs = viernes(-364, 0).slice(0, MIN_RESERVAS_FINDE - 1).map(v => finde(v, 60))
  const r = primaRitmoFinde(rs, HOY)
  assert.equal(r.prima, null)
  assert.equal(r.motivo, "sin_muestra")
})

test("reservas sin fecha de reserva no cuentan para la muestra (null = no se sabe)", () => {
  const rs = viernes(-364, 0).map(v => finde(v, null))
  assert.equal(primaRitmoFinde(rs, HOY).prima, null)
})

test("findes vendidos lejos y el ritmo futuro por delante → prima máxima (caso House)", () => {
  // Todos los findes del año vendidos con 60 días, y los de los próximos 6 meses YA vendidos.
  const futuras = viernes(1, 180).map(v => ({ checkIn: v, nights: 2, reservedAt: HOY }))
  const r = primaRitmoFinde([...pasado(1, 60), ...futuras], HOY)
  assert.equal(r.motivo, "evaluada")
  assert.equal(r.prima, PRIMA_FINDE_MAX)
  assert.ok(r.ritmo != null && r.ritmo > 1)
})

test("findes vendidos a última hora → sin prima (1, evaluada)", () => {
  const r = primaRitmoFinde(pasado(1, 2), HOY)
  assert.equal(r.motivo, "evaluada")
  assert.equal(r.prima, 1)
})

test("histórico anticipado pero este año NO se vende → el ritmo apaga la prima", () => {
  // Mismo pasado que el caso House, pero ni un finde futuro vendido: ritmo 0.
  const r = primaRitmoFinde(pasado(1, 60), HOY)
  assert.equal(r.ritmo, 0)
  assert.equal(r.prima, 1)
})

test("histórico anticipado y ritmo al día (sin datos de ritmo) → prima intermedia", () => {
  // Horizonte 0: no hay ritmo que medir (null) y manda la señal histórica sola.
  const r = primaRitmoFinde(pasado(0.5, 60), HOY, { horizonteDias: 0 })
  assert.equal(r.ritmo, null)
  assert.ok(r.prima! > 1 && r.prima! < PRIMA_FINDE_MAX, `prima ${r.prima}`)
})

test("rango: nunca por debajo de 1 ni por encima del máximo", () => {
  for (const occ of [0.25, 0.5, 1]) for (const lead of [0, 15, 30, 90, 200]) {
    const r = primaRitmoFinde(pasado(occ, lead), HOY)
    if (r.prima == null) continue
    assert.ok(r.prima >= 1 && r.prima <= PRIMA_FINDE_MAX, `occ ${occ} lead ${lead} → ${r.prima}`)
  }
})

test("una reserva duplicada (misma noche dos veces) no infla la ocupación", () => {
  const base = pasado(0.5, 60)
  const a = primaRitmoFinde(base, HOY)
  const b = primaRitmoFinde([...base, ...base], HOY)
  assert.equal(b.ocupacionFinde, a.ocupacionFinde)
  assert.equal(b.prima, a.prima)
})

test("primaFindeFecha: solo vie/sáb sin evento y con prima medida", () => {
  const vie = viernes(1, 30)[0]
  const sab = mas(vie, 1), dom = mas(vie, 2), jue = mas(vie, -1)
  assert.equal(primaFindeFecha({ fecha: vie, prima: 1.2, factorEvento: 1 }), 1.2)
  assert.equal(primaFindeFecha({ fecha: sab, prima: 1.2, factorEvento: 1 }), 1.2)
  assert.equal(primaFindeFecha({ fecha: dom, prima: 1.2, factorEvento: 1 }), 1)
  assert.equal(primaFindeFecha({ fecha: jue, prima: 1.2, factorEvento: 1 }), 1)
  assert.equal(primaFindeFecha({ fecha: vie, prima: 1.2, factorEvento: 1.5 }), 1, "el evento ya trae premio")
  assert.equal(primaFindeFecha({ fecha: vie, prima: null, factorEvento: 1 }), 1, "null = sin efecto")
})

test("los techos de ESA fecha se escalan con la prima (si no, la anularían)", () => {
  const t0 = techoMercado({ medFechaGuest: 400, compsFecha: 8, fuenteFecha: "fiable", factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 1 })
  const t1 = techoMercado({ medFechaGuest: 400, compsFecha: 8, fuenteFecha: "fiable", factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 1, primaFinde: 1.2 })
  assert.equal(t1.techo, Math.round(t0.techo * 1.2))
  const a0 = aplicarTechoAdr({ objetivo: 1000, adrBase: 500, nochesMuestra: 40 })
  const a1 = aplicarTechoAdr({ objetivo: 1000, adrBase: 500, nochesMuestra: 40, primaFinde: 1.2 })
  assert.equal(a1.techo, Math.round(a0.techo! * 1.2))
})

test("cepo de cableado: apply calcula la prima y la pasa al clamp y a los dos techos", () => {
  const src = readFileSync(new URL("../../app/api/sivra/pricing/apply/route.ts", import.meta.url), "utf8")
  assert.match(src, /leerRitmoFinde\(fmt\(today\)\)/, "la prima se calcula con hoy inyectado y la lectura compartida")
  assert.match(src, /prima: primaPiso\(rFinde, r\.property_id, pisosPrimaFinde\)/, "solo pisos habilitados")
  assert.match(src, /pisosConPrimaFinde\(process\.env\.SIVRA_PRIMA_FINDE_PISOS\)/, "habilitación por env")
  assert.match(src, /const baseF = Math\.round\(baseD \* primaD\)/, "la base lleva la prima")
  assert.match(src, /let target = clamp\(baseF, floorD, ceilF\)/, "el clamp usa base y techo con prima")
  assert.match(src, /const ceilF = Math\.round\(ceilD \* primaD\)/, "el techo p90 del clamp lleva la prima")
  assert.equal((src.match(/primaFinde: primaD/g) ?? []).length, 2, "techo de mercado y techo ADR escalados")
})

// ── Cancelaciones simétricas (27/10/2026) ───────────────────────────────────────────────────────
test("canceladas pasadas que estuvieron en libro a esa distancia suben lo esperado y bajan el ritmo", () => {
  // Pasado: la mitad de los findes vendidos con 60 días. Futuro: la misma mitad ya vendida.
  const futuras = viernes(1, 180).filter((_, i) => i % 2 === 0).map(v => finde(v, 60))
  const sin = primaRitmoFinde([...pasado(0.5, 60), ...futuras], HOY)
  // Las otras mitades pasadas se reservaron con 90 días y se cancelaron (vistas) 10 días antes.
  const canc: CanceladaRitmo[] = viernes(-364, 0).filter((_, i) => i % 2 === 1)
    .map(v => ({ ...finde(v, 90), vistaAt: mas(v, -10) }))
  const con = primaRitmoFinde([...pasado(0.5, 60), ...futuras], HOY, {}, canc)
  assert.ok(con.esperadasFuturas > sin.esperadasFuturas, `${con.esperadasFuturas} vs ${sin.esperadasFuturas}`)
  assert.ok(con.ritmo! < sin.ritmo!, `ritmo ${con.ritmo} debe bajar de ${sin.ritmo}`)
  assert.ok(con.nochesCanceladasHist > 0)
  // La señal histórica NO las cuenta: una noche cancelada no se vendió.
  assert.equal(con.ocupacionFinde, sin.ocupacionFinde)
  assert.equal(con.cuotaAnticipada, sin.cuotaAnticipada)
})

test("una cancelada no cuenta a distancias en las que ya no estaba en libro, ni encima de una noche vendida", () => {
  const futuras = viernes(1, 180).map(v => finde(v, 60))
  const sin = primaRitmoFinde([...pasado(1, 60), ...futuras], HOY)
  // Misma noche que una vendida con MÁS antelación (60 d ≥ los 50 d de la cancelada): ya estaba en libro, no suma.
  const encima: CanceladaRitmo[] = viernes(-364, 0).map(v => ({ ...finde(v, 50), vistaAt: mas(v, -10) }))
  assert.equal(primaRitmoFinde([...pasado(1, 60), ...futuras], HOY, {}, encima).esperadasFuturas, sin.esperadasFuturas)
  // Cancelada vista ANTES de la distancia que importa (reservada 200 d, cancelada 190 d antes): fuera del horizonte.
  const pocas = pasado(0.5, 60)
  const lejos: CanceladaRitmo[] = viernes(-364, 0).filter((_, i) => i % 2 === 1).map(v => ({ ...finde(v, 200), vistaAt: mas(v, -190) }))
  const a = primaRitmoFinde([...pocas, ...futuras], HOY)
  const b = primaRitmoFinde([...pocas, ...futuras], HOY, {}, lejos)
  assert.equal(b.esperadasFuturas, a.esperadasFuturas)
})

test("ritmoFindePorPiso agrupa reservas y canceladas por piso (lo comparten apply y canal)", () => {
  const rows = pasado(1, 60).map(r => ({ pid: "p1", ci: r.checkIn, nights: r.nights, rv: r.reservedAt }))
  const m = ritmoFindePorPiso(rows, [{ pid: "p2", ci: HOY, nights: 1, rv: HOY, vista: HOY }], HOY)
  assert.deepEqual([...m.keys()], ["p1"])
  assert.equal(m.get("p1")!.motivo, "evaluada")
})

// ── Despliegue gradual por SIVRA_PRIMA_FINDE_PISOS ─────────────────────────────────────────────
const R = (prima: number | null): RitmoFinde => ({
  prima, motivo: prima == null ? "sin_muestra" : "evaluada", reservasFinde: 20, ocupacionFinde: 0.8,
  cuotaAnticipada: 0.8, ritmo: 1.2, vendidasFuturas: 10, esperadasFuturas: 8, nochesCanceladasHist: 0,
})
const VIE = viernes(1, 30)[0]

test("env vacía/ausente = NINGÚN piso: la prima no se aplica (sin efecto)", () => {
  for (const env of [undefined, null, "", " , ,"]) {
    const h = pisosConPrimaFinde(env)
    assert.equal(h.size, 0)
    const p = primaPiso(R(1.2), "prop_house_sevillana", h)
    assert.equal(p, 1)
    assert.equal(primaFindeFecha({ fecha: VIE, prima: p, factorEvento: 1 }), 1)
  }
})

test("piso en la env → se aplica su prima; los que no están, no", () => {
  const h = pisosConPrimaFinde(" prop_house_sevillana ,prop_duplex_center")
  assert.deepEqual([...h].sort(), ["prop_duplex_center", "prop_house_sevillana"])
  assert.equal(primaFindeFecha({ fecha: VIE, prima: primaPiso(R(1.2), "prop_house_sevillana", h), factorEvento: 1 }), 1.2)
  assert.equal(primaFindeFecha({ fecha: VIE, prima: primaPiso(R(1.2), "prop_luxury_busto", h), factorEvento: 1 }), 1)
  // Habilitado pero sin muestra/lectura: null (no se sabe), y sin efecto.
  assert.equal(primaPiso(R(null), "prop_house_sevillana", h), null)
  assert.equal(primaPiso(undefined, "prop_house_sevillana", h), null)
})

test("primaFindeCentinela: tres estados, con la misma regla que apply", () => {
  const h = pisosConPrimaFinde("p1")
  const m = new Map([["p1", R(1.2)]])
  const lunes = mas(VIE, 3)
  assert.equal(primaFindeCentinela({ fecha: VIE, pid: "p1", ritmo: m, habilitados: h, hayEvento: false }), 1.2)
  assert.equal(primaFindeCentinela({ fecha: lunes, pid: "p1", ritmo: m, habilitados: h, hayEvento: false }), 1)
  assert.equal(primaFindeCentinela({ fecha: VIE, pid: "p2", ritmo: m, habilitados: h, hayEvento: false }), 1)
  assert.equal(primaFindeCentinela({ fecha: VIE, pid: "p1", ritmo: m, habilitados: h, hayEvento: true }), 1)
  assert.equal(primaFindeCentinela({ fecha: VIE, pid: "p1", ritmo: m, habilitados: h, hayEvento: null }), null)
  assert.equal(primaFindeCentinela({ fecha: VIE, pid: "p1", ritmo: null, habilitados: h, hayEvento: false }), null)
  assert.equal(primaFindeCentinela({ fecha: VIE, pid: "p1", ritmo: new Map(), habilitados: h, hayEvento: false }), 1)
})

test("cepo de cableado: canal usa la MISMA lectura y la misma función que apply", () => {
  const src = readFileSync(new URL("../../app/api/sivra/pricing/canal/route.ts", import.meta.url), "utf8")
  assert.match(src, /leerRitmoFinde\(hoyMotor\)/)
  assert.match(src, /pisosConPrimaFinde\(process\.env\.SIVRA_PRIMA_FINDE_PISOS\)/)
  assert.match(src, /primaFinde: primaFindeCentinela\(/)
  assert.ok(!/FROM incomes i\s+LEFT JOIN pricing_settings/.test(src), "canal no puede duplicar la consulta del ritmo")
})

// ── ENTRE SEMANA (dom-jue) a la baja, solo a última hora ──────────────────────────────────────
/** Lunes en [desde, hasta) relativo a HOY. Estancia lun-mié = 3 noches dom-jue. */
function lunes(desde: number, hasta: number): string[] {
  const out: string[] = []
  for (let d = desde; d < hasta; d++) { const f = mas(HOY, d); if (dow(f) === 1) out.push(f) }
  return out
}
const semana = (lun: string, lead: number, reservadaEl?: string): ReservaRitmo =>
  ({ checkIn: lun, nights: 3, reservedAt: reservadaEl ?? mas(lun, -lead) })
/** Pasado: todas las semanas del año, lun-mié reservado `lead` días antes (sin pisar el futuro). */
const pasadoSemana = (lead: number) => lunes(-364, -3).map(l => semana(l, lead))
/** Futuro: TODAS las noches dom-jue de (0, hasta] vendidas hoy, una noche por reserva. */
const futuroSemana = (hasta: number): ReservaRitmo[] => {
  const out: ReservaRitmo[] = []
  for (let d = 1; d <= hasta; d++) { const f = mas(HOY, d); if (dow(f) !== 5 && dow(f) !== 6) out.push({ checkIn: f, nights: 1, reservedAt: HOY }) }
  return out
}

test("dom-jue sin muestra (< MIN_RESERVAS_SEMANA) → factor null (no se sabe), no 1", () => {
  const r = factorRitmoSemana(lunes(-364, 0).slice(0, MIN_RESERVAS_SEMANA - 1).map(l => semana(l, 10)), HOY)
  assert.equal(r.factor, null)
  assert.equal(r.motivo, "sin_muestra")
})

test("dom-jue por DETRÁS dentro de la ventana → baja hasta el mínimo; ventana = p75 de su antelación", () => {
  const r = factorRitmoSemana(pasadoSemana(10), HOY)
  assert.equal(r.motivo, "evaluada")
  assert.equal(r.ventanaDias, 12) // antelaciones por noche 10/11/12 → p75 = 12
  assert.equal(r.ritmo, 0)
  assert.equal(r.factor, FACTOR_SEMANA_MIN)
})

test("dom-jue AL DÍA en la ventana → 1 (evaluado, no baja)", () => {
  const r = factorRitmoSemana([...pasadoSemana(10), ...futuroSemana(20)], HOY)
  assert.equal(r.motivo, "evaluada")
  assert.ok(r.ritmo! >= 1, `ritmo ${r.ritmo}`)
  assert.equal(r.factor, 1)
})

test("lo vendido FUERA de la ventana no cuenta: ir por detrás a meses vista no es señal", () => {
  // Mismo pasado; futuro vendido solo a 60-120 días. En la ventana (12 d) no hay nada → baja igual.
  const lejos = futuroSemana(120).filter(x => Date.parse(x.checkIn) - Date.parse(HOY) >= 60 * DIA)
  assert.equal(factorRitmoSemana([...pasadoSemana(10), ...lejos], HOY).factor, FACTOR_SEMANA_MIN)
})

test("ventana acotada a [mín, máx] y factor siempre en [mínimo, 1]", () => {
  assert.equal(factorRitmoSemana(pasadoSemana(1), HOY).ventanaDias, VENTANA_SEMANA_MIN)
  assert.equal(factorRitmoSemana(pasadoSemana(200), HOY).ventanaDias, VENTANA_SEMANA_MAX)
  for (const lead of [0, 3, 10, 30, 90]) for (const k of [0, 1, 2, 3]) {
    const fut = lunes(1, 50).filter((_, i) => i % 4 < k).map(l => semana(l, 0, HOY))
    const f = factorRitmoSemana([...pasadoSemana(lead), ...fut], HOY).factor
    assert.ok(f == null || (f >= FACTOR_SEMANA_MIN && f <= 1), `lead ${lead} k ${k}: ${f}`)
  }
})

test("factorSemanaFecha: solo dom-jue, dentro de la ventana y sin evento", () => {
  const lun = lunes(1, 10)[0]
  const vie = viernes(1, 10)[0]
  const base = { factor: 0.9, ventanaDias: 12, factorEvento: 1 }
  const dv = (f: string) => Math.round((Date.parse(f) - Date.parse(HOY)) / DIA)
  assert.equal(factorSemanaFecha({ ...base, fecha: lun, diasVista: dv(lun) }), 0.9)
  assert.equal(factorSemanaFecha({ ...base, fecha: vie, diasVista: dv(vie) }), 1, "vie/sáb no")
  assert.equal(factorSemanaFecha({ ...base, fecha: lun, diasVista: 13 }), 1, "fuera de la ventana no")
  assert.equal(factorSemanaFecha({ ...base, fecha: lun, diasVista: dv(lun), factorEvento: 1.1 }), 1, "evento no")
  assert.equal(factorSemanaFecha({ ...base, fecha: lun, diasVista: dv(lun), factor: null }), 1, "null = sin efecto")
  assert.equal(factorSemanaFecha({ ...base, fecha: lun, diasVista: dv(lun), ventanaDias: null }), 1)
})

test("con la urgencia NO se multiplica: manda la más fuerte", () => {
  assert.equal(urgenciaCombinada(0.9, 0.85), 0.85)
  assert.equal(urgenciaCombinada(0.8, 0.85), 0.8)
  assert.equal(urgenciaCombinada(1, 1), 1)
})

test("gate: mismo env que la prima; ritmoFindePorPiso trae el factor dom-jue", () => {
  const h = pisosConPrimaFinde("p1")
  const filas = pasadoSemana(10).map(x => ({ pid: "p1", ci: x.checkIn, nights: x.nights, rv: x.reservedAt }))
  const m = ritmoFindePorPiso(filas, [], HOY)
  assert.equal(m.get("p1")!.semana!.factor, FACTOR_SEMANA_MIN)
  assert.equal(factorSemanaPiso(m.get("p1"), "p1", h), FACTOR_SEMANA_MIN)
  assert.equal(factorSemanaPiso(m.get("p1"), "p2", h), 1, "fuera de la env: no se aplica")
  assert.equal(factorSemanaPiso(R(1.2), "p1", h), null, "habilitado sin cálculo: no se sabe")
})

test("cepo de cableado: apply combina con la urgencia (sin apilar) y lo expone en results", () => {
  const src = readFileSync(new URL("../../app/api/sivra/pricing/apply/route.ts", import.meta.url), "utf8")
  assert.match(src, /urgenciaCombinada\(lm\.factor, fSem\)/)
  assert.ok(!/target \* lm\.factor/.test(src), "la urgencia no puede aplicarse aparte del factor dom-jue")
  assert.match(src, /factorSemanaPiso\(rFinde, r\.property_id, pisosPrimaFinde\)/)
  assert.match(src, /ritmo_semana: rFinde\?\.semana/)
})

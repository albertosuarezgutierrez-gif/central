import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ajusteCanal, baseDesdeGuest, guestDesdeBase, fijoPorNoche, desviacionCanal,
  pasoCanal, MIN_VENTANAS_CANAL, RECORRIDO_MINIMO, MAX_SALTO_CANAL,
  type VentanaEscaparate,
} from './pricing-canal.ts'

const v = (checkin: string, noches: number, guests: number, precioTotal: number, baseTotal: number | null): VentanaEscaparate =>
  ({ checkin, noches, guests, precioTotal, baseTotal })

// Mediciones REALES del 18/08/2026 con el conector de Booking (House Sevillana, aforo 6):
//   08-10 sep (2 noches): base 860€   → escaparate 1.147,22€
//   08-11 sep (3 noches): base 1.429€ → escaparate 1.679,61€
//   26-28 dic (2 noches): base 2.787€ → escaparate 2.769,24€
const HOUSE: VentanaEscaparate[] = [
  v('2026-09-08', 2, 6, 1147.22, 860),
  v('2026-09-08', 3, 6, 1679.61, 1429),
  v('2026-12-26', 2, 6, 2769.24, 2787),
]

test('el ajuste separa el multiplicador de la CUOTA FIJA (caso House real)', () => {
  const a = ajusteCanal(HOUSE, { aforo: 6 })
  assert.equal(a.estado, 'medido')
  // Un modelo multiplicativo puro tendría que elegir entre ×1,33 (2 noches) y ×1,18 (3 noches).
  // Ajuste real sobre las tres ventanas: m=0,835 y F=453€, con R²=0,9987 sobre un recorrido de
  // base de 860€ a 2.787€ (×3,2). El modelo afín explica las tres con ±34€; ninguna recta que
  // pase por el origen (un markup a secas) puede hacerlo.
  assert.ok(a.markup! > 0.75 && a.markup! < 1.0, `markup fuera de rango: ${a.markup}`)
  assert.ok(a.cuotaFija! > 300 && a.cuotaFija! < 550, `cuota fija fuera de rango: ${a.cuotaFija}`)
  assert.ok(a.r2! > 0.99, `ajuste pobre: R²=${a.r2}`)
})

test('el ratio suelto MIENTE: la misma casa da ×1,33 o ×1,18 según las noches', () => {
  const dosNoches = HOUSE[0].precioTotal / HOUSE[0].baseTotal!
  const tresNoches = HOUSE[1].precioTotal / HOUSE[1].baseTotal!
  assert.ok(Math.abs(dosNoches - tresNoches) > 0.15, 'si esto deja de cumplirse, revisa el modelo')
})

test('sin recorrido de base NO se puede separar m de F: se dice, no se inventa', () => {
  // Tres ventanas casi al mismo precio: infinitas parejas (m, F) encajan igual de bien.
  const a = ajusteCanal([
    v('2026-09-08', 2, 6, 1000, 900), v('2026-09-15', 2, 6, 1010, 905), v('2026-09-22', 2, 6, 1005, 902),
  ], { aforo: 6 })
  assert.equal(a.estado, 'indeterminado')
  assert.equal(a.markup, null)
  assert.ok(RECORRIDO_MINIMO > 0)
})

test('muestra corta = no lo sé, NUNCA un markup por defecto', () => {
  const a = ajusteCanal(HOUSE.slice(0, 2), { aforo: 6 })
  assert.equal(a.estado, 'muestra_corta')
  assert.equal(a.markup, null)
  assert.ok(MIN_VENTANAS_CANAL >= 3)
})

test('las ventanas de otro aforo no entran (medirían el recargo por persona)', () => {
  const a = ajusteCanal([...HOUSE, v('2026-09-08', 2, 12, 1531.8, 860)], { aforo: 6 })
  assert.equal(a.muestras, 3)
})

test('sin base conocida la ventana no entra: un ratio desconocido no es un ratio', () => {
  const a = ajusteCanal([...HOUSE, v('2027-01-10', 2, 6, 900, null)], { aforo: 6 })
  assert.equal(a.muestras, 3)
})

test('una cuota fija NEGATIVA no existe: se reajusta con F=0 en vez de propagar el absurdo', () => {
  const a = ajusteCanal([
    v('a', 2, 4, 100, 50), v('b', 2, 4, 400, 300), v('c', 2, 4, 700, 550),
  ], { aforo: 4 })
  assert.ok(a.cuotaFija! >= 0)
})

test('si el portal no sigue a la base, el ajuste se declara INCONSISTENTE', () => {
  const a = ajusteCanal([
    v('a', 2, 4, 300, 100), v('b', 2, 4, 120, 400), v('c', 2, 4, 500, 250), v('d', 2, 4, 90, 700),
  ], { aforo: 4 })
  assert.ok(a.estado === 'inconsistente' || a.estado === 'indeterminado')
})

// ─── Conversión (lo que usa el motor) ──────────────────────────────────────────────────────

test('la cuota fija se reparte entre las noches de la estancia TÍPICA del piso', () => {
  assert.equal(fijoPorNoche({ markup: 0.94, cuotaFija: 342, nochesRef: 3 }), 114)
  assert.equal(fijoPorNoche({ markup: 0.94, cuotaFija: 342, nochesRef: 2 }), 171)
})

test('ida y vuelta: base → huésped → base', () => {
  const p = { markup: 0.936, cuotaFija: 342.6, nochesRef: 3 }
  const guest = guestDesdeBase(500, p)
  assert.ok(Math.abs(baseDesdeGuest(guest, p) - 500) <= 1)
})

test('🚨 el error que costaba dinero: con ×1,20 la base sale MUY por debajo en fechas caras', () => {
  const supuesto = { markup: 1.20, cuotaFija: 0, nochesRef: 3 }
  const medido = { markup: 0.835, cuotaFija: 453.3, nochesRef: 3 }
  // Noche de mercado a 1.500€ (Navidad): el modelo viejo pide 1.250€ de base, el medido 1.482€.
  assert.equal(baseDesdeGuest(1500, supuesto), 1250)
  assert.ok(baseDesdeGuest(1500, medido) > 1400)
  // Y en una noche barata el error se invierte: la cuota fija ya cubre parte del precio.
  assert.ok(baseDesdeGuest(300, medido) < baseDesdeGuest(300, supuesto))
})

test('la conversión nunca devuelve base <= 0 aunque la cuota fija se coma el objetivo', () => {
  assert.ok(baseDesdeGuest(50, { markup: 0.94, cuotaFija: 342, nochesRef: 2 }) >= 1)
})

test('sin medición el estado es SIN DATOS, nunca ok', () => {
  const d = desviacionCanal({
    configurado: { markup: 1.2, cuotaFija: 0, nochesRef: 3 }, medido: null, guestRef: 600,
  })
  assert.equal(d.estado, 'sin_datos')
  assert.equal(d.sesgo, null)
})

test('el sesgo se mide sobre un precio de referencia (con cuota fija no es un % plano)', () => {
  const configurado = { markup: 1.2, cuotaFija: 0, nochesRef: 3 }
  const medido = { markup: 0.835, cuotaFija: 453.3 }
  const caro = desviacionCanal({ configurado, medido, guestRef: 1500 })
  const barato = desviacionCanal({ configurado, medido, guestRef: 400 })
  assert.equal(caro.estado, 'desviado')
  assert.ok(caro.sesgo! > 0.15, 'en fechas caras listamos muy por debajo')
  assert.ok(barato.sesgo! < caro.sesgo!, 'el error no es plano: depende del nivel de precio')
})

// ─── El paso acotado (lo que de verdad escribe el cron) ───────────────────────────────────────

test('un salto pequeño se da entero: no se ralentiza por gusto', () => {
  const paso = pasoCanal({
    configurado: { markup: 1.0, cuotaFija: 0, nochesRef: 2 },
    medido: { markup: 0.98, cuotaFija: 10 },
    guestRef: 400,
  })
  assert.equal(paso.topado, false)
  assert.equal(paso.aplicar.markup, 0.98)
  assert.ok(Math.abs(paso.efecto) <= MAX_SALTO_CANAL)
})

test('🚨 el salto de House (−25% de base) se da en tramos, no de golpe', () => {
  // Configurado ×1,20 sin cuota contra lo medido el 19/08/2026 en aforo 12; a su precio típico de
  // escaparate (682€/noche) el modelo nuevo pide un 25% menos de base. Moverlo entero de una vez
  // es apostar TODO el calendario a una sola medición.
  const configurado = { markup: 1.20, cuotaFija: 0, nochesRef: 2 }
  const medido = { markup: 0.901, cuotaFija: 598.2 }
  const paso = pasoCanal({ configurado, medido, guestRef: 682 })
  assert.equal(paso.topado, true)
  assert.ok(Math.abs(paso.efecto) <= MAX_SALTO_CANAL + 0.001, `efecto ${paso.efecto}`)
  // Y va en la dirección buena: el paso deja la base MÁS CERCA de la que piden los parámetros medidos.
  const destino = baseDesdeGuest(682, { ...medido, nochesRef: 2 })
  const antes = baseDesdeGuest(682, configurado)
  const ahora = baseDesdeGuest(682, paso.aplicar)
  assert.ok(Math.abs(ahora - destino) < Math.abs(antes - destino))
})

test('el paso converge: aplicándolo en pasadas sucesivas se llega a lo medido', () => {
  const medido = { markup: 0.901, cuotaFija: 598.2 }
  let cfg = { markup: 1.20, cuotaFija: 0, nochesRef: 2 }
  for (let i = 0; i < 12 && (cfg.markup !== medido.markup || cfg.cuotaFija !== medido.cuotaFija); i++) {
    cfg = pasoCanal({ configurado: cfg, medido, guestRef: 682 }).aplicar
  }
  assert.ok(Math.abs(baseDesdeGuest(682, cfg) - baseDesdeGuest(682, { ...medido, nochesRef: 2 })) <= 2)
})

test('⚠️ el mismo piso da parámetros DISTINTOS según el aforo, y eso es correcto', () => {
  // House medido el 19/08/2026 a aforo 12 y a aforo 6 sobre las MISMAS tres fechas. El recargo por
  // persona de Booking se reparte entre m y F, así que las dos rectas describen el mismo canal en
  // condiciones distintas. Lo que NO puede pasar es mezclarlas: el motor usa la del aforo máximo.
  const doce = ajusteCanal([
    v('2026-09-08', 2, 12, 1261, 860), v('2026-09-08', 3, 12, 2045, 1429), v('2026-12-26', 2, 12, 3064, 2787),
  ], { aforo: 12 })
  const seis = ajusteCanal(HOUSE, { aforo: 6 })
  assert.equal(doce.estado, 'medido')
  assert.equal(seis.estado, 'medido')
  assert.ok(doce.cuotaFija! > seis.cuotaFija!, 'a más aforo, más recargo absorbido en la cuota')
  // Y a igualdad de precio de mercado la base pedida es MENOR con el ajuste de aforo 12 (el canal
  // se queda con más): usar el ajuste equivocado desplazaría el calendario entero.
  const conDoce = baseDesdeGuest(682, { markup: doce.markup!, cuotaFija: doce.cuotaFija!, nochesRef: 2 })
  const conSeis = baseDesdeGuest(682, { markup: seis.markup!, cuotaFija: seis.cuotaFija!, nochesRef: 2 })
  assert.ok(Math.abs(conDoce - conSeis) > 20, `${conDoce} vs ${conSeis}`)
})

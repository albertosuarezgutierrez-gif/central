// Recomendador EXPLICABLE y determinista (sin IA) sobre la salida de `compararOfertas` (08/10/2026). PURO.
//
// Puntuación 0-100 = (1-pesoPrecio) · adecuación de coberturas + pesoPrecio · precio ANUAL normalizado.
// · Adecuación: por cada garantía con peso, puntos de la celda (incluida con límite/franquicia, opcional,
//   «no consta» = 0 puntos, excluida = penaliza) ponderados por el peso del perfil. «No consta» penaliza
//   menos que «excluida» pero NUNCA suma (CLAUDE.md: dato que no hay ≠ dato que no se ha mirado).
// · Precio: SIEMPRE el anual (no el primer recibo prorrateado, ver ofertas.ts / TARIFICADOR-RPA.md).
//   Una oferta sin precio anual válido NUNCA se recomienda: va a `descartadas`.
// · Sin IA: el mismo input da siempre el mismo ranking y cada punto tiene su motivo en español.

import type { FilaComparador, CeldaComparador, TablaComparador } from './comparador-fichas.ts'

export type PerfilCliente = {
  /** Capitales pedidos por clave de garantía (continente, contenido, existencias, limite_indemnizacion…). */
  capitalesPedidos?: Record<string, number>
  // Comunidades
  piscina?: boolean
  ascensor?: boolean
  antiguedadAnios?: number | null
  conEmpleados?: boolean
  garaje?: boolean
  // Comercio
  existenciasEur?: number | null
  escaparates?: boolean
  alarma?: boolean | null
  manejaEfectivo?: boolean
  refrigerados?: boolean
  localAlquilado?: boolean
  // RC
  empleados?: number | null
  facturacionEur?: number | null
  vendeProductos?: boolean
  trabajosEnTerceros?: boolean
}

export type OpcionesRecomendador = {
  /** Pesos que sustituyen a los calculados (por clave). 0 = la garantía no puntúa. */
  pesos?: Record<string, number>
  /** 0..1, peso del precio en la nota final (por defecto 0,35). */
  pesoPrecio?: number
  /** Peso a partir del cual una garantía es «clave» (por defecto 3). */
  umbralClave?: number
  /** Precio anual por ofertaId si no se quiere el de la tabla (p. ej. `OfertaNormalizada.primaAnualEur`). */
  preciosAnualesEur?: Record<string, number | null>
  /** Infraseguro si el capital ofertado < este porcentaje del pedido (por defecto 0,9). */
  umbralInfraseguro?: number
}

export type TipoFlagRiesgo = 'infraseguro' | 'garantia_clave_ausente' | 'garantia_clave_no_consta' | 'ficha_sin_validar' | 'sin_ficha'
export type FlagRiesgo = { tipo: TipoFlagRiesgo; garantia: string | null; texto: string }

export type OfertaRecomendada = {
  ofertaId: string
  compania: string
  producto: string
  posicion: number
  /** 0-100, dos decimales. */
  puntos: number
  coberturaPct: number
  precioPct: number
  precioAnualEur: number
  /** Lo bueno, en español. */
  motivos: string[]
  /** Lo que hay que verificar o vigilar, en español. */
  reservas: string[]
  flags: FlagRiesgo[]
  /** Empata en puntos (y precio) con otra oferta: el criterio es del corredor. */
  empate: boolean
}

export type OfertaDescartada = { ofertaId: string; compania: string; producto: string; motivo: string }

export type Recomendacion = {
  ramo: string
  ranking: OfertaRecomendada[]
  descartadas: OfertaDescartada[]
  pesosAplicados: Record<string, number>
  avisos: string[]
}

// ─── Pesos ──────────────────────────────────────────────────────────────────

const PESOS_COMUNIDADES: Record<string, number> = {
  continente: 5, contenido: 2, incendio: 5, fenomenos_atmosfericos: 3, danos_agua: 5, danos_agua_localizacion: 3,
  danos_agua_sin_localizacion: 2, rotura_cristales: 1, rotura_maquinaria: 2, danos_electricos: 2, robo: 2,
  actos_vandalicos: 2, valor_estetico: 1, derrumbe: 2, gastos_desescombro: 2, perdida_alquileres: 2,
  rc_general: 5, rc_cruzada: 3, rc_agua: 3, rc_organos_gobierno: 3, rc_patronal: 2,
  asistencia: 2, control_plagas: 1, desatascos: 1, ite: 1, defensa_juridica: 3, asesoramiento_juridico: 1, impago_cuotas: 2,
}
const PESOS_COMERCIO: Record<string, number> = {
  continente: 3, contenido: 4, existencias: 5, incendio: 5, fenomenos_atmosfericos: 2, danos_agua: 4, danos_electricos: 2,
  robo_continente: 2, robo_contenido: 3, expoliacion: 2, dinero_efectivo: 1, rotura_cristales: 3, rotulos: 1,
  averia_maquinaria: 2, bienes_refrigerados: 0, actos_vandalicos: 2, gastos_desescombro: 1, perdida_beneficios: 3,
  rc_explotacion: 5, rc_patronal: 2, sublimite_victima_patronal: 0, rc_locativa: 2, rc_productos: 1,
  asistencia: 1, defensa_juridica: 2, franquicia_general: 2,
}
const PESOS_RC: Record<string, number> = {
  limite_indemnizacion: 5, limite_agregado_anual: 2, rc_explotacion: 5, rc_patronal: 2, sublimite_victima_patronal: 1,
  rc_productos: 2, rc_post_trabajos: 2, rc_locativa: 2, rc_cruzada: 2, rc_contaminacion_accidental: 1, rc_subsidiaria: 2,
  rc_gastos_prevencion: 1, defensa_juridica: 3, fianzas_judiciales: 2, franquicia_general: 2, ambito_territorial: 0, retroactividad: 0,
}

/** Pesos por defecto de cada ramo (copia: se puede mutar). Ramo desconocido → `{}` (todas las garantías pesan 1). */
export function pesosPorDefecto(ramo: string): Record<string, number> {
  return { ...(ramo === 'comunidades' ? PESOS_COMUNIDADES : ramo === 'comercio' ? PESOS_COMERCIO : ramo === 'rc' ? PESOS_RC : {}) }
}

/** Pesos del ramo ajustados al perfil (lo que se sabe del cliente sube la importancia de su garantía), más los forzados. */
export function pesosParaPerfil(ramo: string, perfil: PerfilCliente = {}, forzados: Record<string, number> = {}): Record<string, number> {
  const p = pesosPorDefecto(ramo)
  const suma = (clave: string, n: number) => { if (clave in p) p[clave] += n }
  if (ramo === 'comunidades') {
    if (perfil.piscina) { suma('rc_general', 2); suma('rc_agua', 1) }
    if (perfil.ascensor) { suma('rotura_maquinaria', 2); suma('rc_general', 1) }
    if ((perfil.antiguedadAnios ?? 0) >= 30) { suma('danos_agua', 2); suma('danos_agua_localizacion', 2); suma('derrumbe', 1); suma('ite', 1) }
    if (perfil.conEmpleados) suma('rc_patronal', 3)
    if (perfil.garaje) suma('incendio', 1)
  } else if (ramo === 'comercio') {
    if ((perfil.existenciasEur ?? 0) > 0) suma('existencias', 1)
    if (perfil.escaparates) { suma('rotura_cristales', 3); suma('rotulos', 1); suma('actos_vandalicos', 1) }
    if (perfil.alarma === true) suma('robo_contenido', 1)
    if (perfil.manejaEfectivo) { suma('dinero_efectivo', 3); suma('expoliacion', 1) }
    if (perfil.refrigerados) { suma('bienes_refrigerados', 4); suma('danos_electricos', 1) }
    if (perfil.localAlquilado) suma('rc_locativa', 2)
    if ((perfil.empleados ?? 0) > 0 || perfil.conEmpleados) { suma('rc_patronal', 3); suma('sublimite_victima_patronal', 1) }
  } else if (ramo === 'rc') {
    if ((perfil.empleados ?? 0) > 0 || perfil.conEmpleados) { suma('rc_patronal', 3); suma('sublimite_victima_patronal', 2) }
    if ((perfil.facturacionEur ?? 0) >= 1_000_000) { suma('limite_indemnizacion', 1); suma('limite_agregado_anual', 1) }
    if (perfil.vendeProductos) suma('rc_productos', 3)
    if (perfil.trabajosEnTerceros) { suma('rc_post_trabajos', 3); suma('rc_subsidiaria', 2) }
    if (perfil.localAlquilado) suma('rc_locativa', 2)
  }
  for (const [k, v] of Object.entries(forzados)) if (Number.isFinite(v) && v >= 0) p[k] = v
  return p
}

// ─── Puntuación ─────────────────────────────────────────────────────────────

const PTS_BASE_INCLUIDA = 0.6
const PTS_OPCIONAL = 0.3
const PTS_EXCLUIDA = -0.25
const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d
/** Formato español: 1.234,56€ (puntos de miles, coma decimal, € detrás). */
function dinero(n: number): string {
  const [e, d] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}€`
}

/** Qué dice la celda de verdad: incluida (con dato), opcional, excluida o no consta. */
type Lectura = 'incluida' | 'opcional' | 'excluida' | 'no_consta'
function leer(c: CeldaComparador): Lectura {
  if (!c.consta) return 'no_consta'
  if (c.estado === 'incluida' || c.estado === 'opcional' || c.estado === 'excluida') return c.estado
  // Sin estado: un capital o un límite escritos implican que la garantía está; solo una franquicia suelta no dice nada.
  return c.capitalEur !== null || c.limiteEur !== null || c.limite !== null ? 'incluida' : 'no_consta'
}

function valorLimite(c: CeldaComparador): number | null { return c.limiteEur ?? c.capitalEur }

type Contexto = { fila: FilaComparador; pedido: number | null; maxValor: number | null; maxFranq: number | null; alguienConValor: boolean; alguienConFranq: boolean }

function puntosValor(c: CeldaComparador, x: Contexto): number {
  if (x.pedido !== null && c.capitalEur !== null) return Math.min(1, c.capitalEur / x.pedido)
  const v = valorLimite(c)
  if (!x.alguienConValor) return 1
  if (v === null) return 0.5
  return x.maxValor && x.maxValor > 0 ? v / x.maxValor : 1
}
function puntosFranq(c: CeldaComparador, x: Contexto): number {
  if (!x.alguienConFranq) return 1
  if (c.franquiciaEur === null) return 0.5
  return x.maxFranq && x.maxFranq > 0 ? 1 - c.franquiciaEur / x.maxFranq : 1
}

function puntosCelda(c: CeldaComparador, lectura: Lectura, x: Contexto): number {
  if (x.fila.clave === 'franquicia_general') return c.franquiciaEur === null ? 0 : puntosFranq(c, x)
  switch (lectura) {
    case 'incluida': return PTS_BASE_INCLUIDA + 0.25 * puntosValor(c, x) + 0.15 * puntosFranq(c, x)
    case 'opcional': return PTS_OPCIONAL
    case 'excluida': return PTS_EXCLUIDA
    default: return 0 // no consta: ni suma ni resta
  }
}

function contextoFila(fila: FilaComparador, pedido: number | null): Contexto {
  const valores = fila.celdas.map(valorLimite).filter((n): n is number => n !== null)
  const franqs = fila.celdas.map((c) => c.franquiciaEur).filter((n): n is number => n !== null)
  return {
    fila, pedido,
    maxValor: valores.length ? Math.max(...valores) : null, maxFranq: franqs.length ? Math.max(...franqs) : null,
    alguienConValor: valores.length > 0, alguienConFranq: franqs.length > 0,
  }
}

export function recomendar(tabla: TablaComparador, perfil: PerfilCliente = {}, opciones: OpcionesRecomendador = {}): Recomendacion {
  const pesoPrecio = Math.min(1, Math.max(0, opciones.pesoPrecio ?? 0.35))
  const umbralClave = opciones.umbralClave ?? 3
  const umbralInfra = opciones.umbralInfraseguro ?? 0.9
  const pesos = pesosParaPerfil(tabla.ramo, perfil, opciones.pesos)
  const pesoDe = (clave: string) => pesos[clave] ?? 1
  const avisos = [...tabla.avisos]

  const precios = new Map<string, number>()
  const descartadas: OfertaDescartada[] = []
  for (const col of tabla.columnas) {
    const p = opciones.preciosAnualesEur && col.ofertaId in opciones.preciosAnualesEur ? opciones.preciosAnualesEur[col.ofertaId] : col.primaTotalEur
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) precios.set(col.ofertaId, p)
    else descartadas.push({ ofertaId: col.ofertaId, compania: col.compania, producto: col.producto, motivo: 'Sin precio anual: no se puede recomendar una oferta sin precio.' })
  }
  const precioMin = precios.size ? Math.min(...precios.values()) : null
  const filasPuntuables = tabla.filas.filter((f) => pesoDe(f.clave) > 0)
  const sumaPesos = filasPuntuables.reduce((s, f) => s + pesoDe(f.clave), 0)

  const ranking: OfertaRecomendada[] = []
  tabla.columnas.forEach((col, idx) => {
    const precio = precios.get(col.ofertaId)
    if (precio === undefined) return
    const motivos: string[] = []
    const reservas: string[] = []
    const flags: FlagRiesgo[] = []
    let pts = 0

    for (const fila of filasPuntuables) {
      const peso = pesoDe(fila.clave)
      const celda = fila.celdas[idx]
      const x = contextoFila(fila, perfil.capitalesPedidos?.[fila.clave] ?? null)
      const lectura = leer(celda)
      pts += peso * puntosCelda(celda, lectura, x)
      const clave = peso >= umbralClave
      const relevante = peso >= 2

      if (lectura === 'no_consta') {
        if (relevante) reservas.push(`No consta ${fila.etiqueta.toLowerCase()}: verificar`)
        if (clave) flags.push({ tipo: 'garantia_clave_no_consta', garantia: fila.clave, texto: `Garantía clave sin dato: ${fila.etiqueta}` })
      } else if (lectura === 'excluida' || lectura === 'opcional') {
        if (relevante) reservas.push(lectura === 'excluida' ? `Excluye ${fila.etiqueta.toLowerCase()}` : `${fila.etiqueta} solo como opcional`)
        if (clave) flags.push({ tipo: 'garantia_clave_ausente', garantia: fila.clave, texto: `Garantía clave ${lectura === 'excluida' ? 'excluida' : 'opcional'}: ${fila.etiqueta}` })
      }
      if (lectura !== 'no_consta' && relevante) {
        const d = fila.diferencias
        if (d.ofertasLimiteMax.includes(col.ofertaId) && d.limiteMaxEur !== null) motivos.push(`Mayor ${fila.etiqueta.toLowerCase()} (${dinero(d.limiteMaxEur)})`)
        if (d.ofertasFranquiciaMin.includes(col.ofertaId) && d.franquiciaMinEur !== null) {
          motivos.push(`Franquicia menor en ${fila.etiqueta.toLowerCase()} (${d.franquiciaMinEur === 0 ? 'sin franquicia' : dinero(d.franquiciaMinEur)})`)
        }
      }
      const pedido = perfil.capitalesPedidos?.[fila.clave]
      if (pedido && celda.capitalEur !== null && celda.capitalEur < pedido * umbralInfra) {
        flags.push({ tipo: 'infraseguro', garantia: fila.clave, texto: `Infraseguro en ${fila.etiqueta.toLowerCase()}: ${dinero(celda.capitalEur)} frente a ${dinero(pedido)} pedidos` })
        reservas.push(`Infraseguro en ${fila.etiqueta.toLowerCase()} (${dinero(celda.capitalEur)} de ${dinero(pedido)})`)
      }
    }
    if (col.fichaEstado === null) {
      flags.push({ tipo: 'sin_ficha', garantia: null, texto: 'Sin ficha de producto: las coberturas no constan' })
      reservas.push('Sin ficha de producto: coberturas sin leer')
    } else if (col.fichaEstado !== 'validada') {
      flags.push({ tipo: 'ficha_sin_validar', garantia: null, texto: 'Coberturas sin validar' })
      reservas.push('Coberturas sin validar: valores de la IA pendientes de revisión')
    }
    if (precioMin !== null && precio === precioMin && precios.size > 1) motivos.unshift(`Precio anual más bajo (${dinero(precio)})`)

    const cobertura = sumaPesos > 0 ? Math.min(1, Math.max(0, pts / sumaPesos)) : 0
    const precioN = precioMin !== null ? precioMin / precio : 0
    const nota = (1 - pesoPrecio) * cobertura + pesoPrecio * precioN
    ranking.push({
      ofertaId: col.ofertaId, compania: col.compania, producto: col.producto, posicion: 0,
      puntos: redondear(nota * 100), coberturaPct: redondear(cobertura * 100), precioPct: redondear(precioN * 100),
      precioAnualEur: precio, motivos: motivos.slice(0, 6), reservas: reservas.slice(0, 8), flags, empate: false,
    })
  })

  ranking.sort((a, b) => b.puntos - a.puntos || a.precioAnualEur - b.precioAnualEur || a.ofertaId.localeCompare(b.ofertaId))
  ranking.forEach((r, i) => {
    const prev = ranking[i - 1]
    r.posicion = prev && prev.puntos === r.puntos && prev.precioAnualEur === r.precioAnualEur ? prev.posicion : i + 1
  })
  for (const r of ranking) {
    r.empate = ranking.some((o) => o !== r && o.puntos === r.puntos)
    if (r.empate) r.reservas.push('Empata en puntos con otra oferta: decide el corredor')
  }
  if (ranking.length === 0) avisos.push('Ninguna oferta con precio anual: no hay recomendación.')
  if (sumaPesos === 0 && tabla.filas.length > 0) avisos.push('Sin garantías con peso: la nota solo refleja cobertura 0 y precio.')
  return { ramo: tabla.ramo, ranking, descartadas, pesosAplicados: pesos, avisos }
}

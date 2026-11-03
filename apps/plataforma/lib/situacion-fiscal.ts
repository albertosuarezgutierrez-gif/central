// «Mi situación fiscal» (puro: sin BD ni red; testeado con `node --test lib/situacion-fiscal.test.ts`).
// Radiografía de TODO lo personal que consume el motor fiscal (base-fiscal-devengo*, simulador-irpf,
// fiscal-deducciones, fiscal-panel): cada dato con valor, fuente, fecha de actualización y si se edita.
// Regla de tres estados: `valor: null` = «sin dato» (nunca 0); un 0 comprobado (p. ej. sin hipoteca) es un VALOR.
import { AMORTIZACION_INMUEBLES, INTERESES_FINANCIACION, RETENCION_CORREDURIA, TASA_AMORTIZACION_INMUEBLE } from './base-fiscal-devengo.ts'
import { edadAFinDe } from './fiscal-deducciones.ts'
import { eur } from './dinero.ts'
import { estadoDato } from './dato.ts'

export type Formato = 'eur' | 'pct' | 'texto' | 'si_no' | 'entero'
/** Quién edita el dato: el formulario de perfil existente, la API de esta radiografía, o nadie (constante/solo lectura). */
export type Edicion = 'perfil' | 'hijos' | 'api' | 'solo_lectura'

export type Dato = {
  id: string
  etiqueta: string
  valor: number | string | boolean | null
  formato: Formato
  /** Tabla.columna o constante de código de la que sale. */
  fuente: string
  /** YYYY-MM-DD si la fuente guarda fecha; null = no consta. */
  actualizado: string | null
  edicion: Edicion
  /** Campo editable en PATCH /api/finanzas/situacion-fiscal (solo si edicion = 'api'). */
  campo?: string
  nota?: string
}
export type Seccion = { id: 'familia' | 'inmuebles' | 'actividades' | 'ahorro' | 'pagos'; titulo: string; datos: Dato[] }

export type PerfilRow = {
  comunidad_autonoma?: string | null; declaracion_conjunta?: boolean | null; familia_numerosa?: string | null
  conyuge_trabaja?: boolean | null; aportacion_plan_pensiones?: unknown; donativos_anual?: unknown
  gasto_guarderia_anual?: unknown; conyuge_es_autonomo?: boolean | null; conyuge_cuota_autonomos?: unknown
  conyuge_meses_exonerados?: unknown; conyuge_retenciones?: unknown; updated_at?: string | null
}
export type HijoRow = { nombre: string; fechaNacimiento: string; gradoDiscapacidad: number }
export type TitularRow = { propiedad_id: string; titular: string; porcentaje: unknown; regimen: string; updated_at: string | null }

export type EntradaSituacion = {
  /** YYYY-MM-DD. */
  hoy: string
  perfil: PerfilRow | null
  hijos: HijoRow[]
  titularidad: TitularRow[]
  nombresPiso: Record<string, string>
}

const PISOS = ['prop_house_sevillana', 'prop_duplex_center', 'prop_luxury_busto', 'prop_busto_reform'] as const

/** numeric de BD (string|number|Decimal) → number; null/undefined/'' → null (NUNCA 0). */
export function num(x: unknown): number | null {
  if (x == null || x === '') return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}
const dia = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : null)

export function formatearValor(valor: Dato['valor'], formato: Formato): string {
  if (estadoDato(valor) === 'pendiente') return 'sin dato'
  switch (formato) {
    case 'eur': return eur(valor as number)
    case 'pct': return `${Number(valor).toLocaleString('es-ES')} %`
    case 'si_no': return valor ? 'Sí' : 'No'
    case 'entero': return String(valor)
    default: return String(valor)
  }
}

const CATEGORIA_FN: Record<string, string> = { general: 'General (categoría general)', especial: 'Especial' }

export function armarSituacion(e: EntradaSituacion): Seccion[] {
  const p = e.perfil
  const act = dia(p?.updated_at)
  const perfilD = (id: string, etiqueta: string, valor: Dato['valor'], formato: Formato, col: string, nota?: string): Dato =>
    ({ id, etiqueta, valor, formato, fuente: `fiscal_perfil.${col}`, actualizado: act, edicion: 'perfil', nota })
  const apiD = (id: string, etiqueta: string, valor: Dato['valor'], formato: Formato, col: string, campo: string, nota?: string): Dato =>
    ({ id, etiqueta, valor, formato, fuente: `fiscal_perfil.${col}`, actualizado: act, edicion: 'api', campo, nota })

  // ── Familia ──
  const familia: Dato[] = [
    { id: 'titular', etiqueta: 'Contribuyente', valor: 'Alberto', formato: 'texto', fuente: 'constante del motor (titular alberto)', actualizado: null, edicion: 'solo_lectura' },
    { id: 'conyuge', etiqueta: 'Cónyuge', valor: 'Pilar', formato: 'texto', fuente: 'constante del motor (titular pilar)', actualizado: null, edicion: 'solo_lectura' },
    perfilD('modalidad', 'Modalidad de declaración', p ? (p.declaracion_conjunta ? 'Conjunta' : 'Individual') : null, 'texto', 'declaracion_conjunta',
      'El panel compara ambas modalidades; esta es la elegida.'),
    perfilD('familia_numerosa', 'Familia numerosa', p ? (p.familia_numerosa ? (CATEGORIA_FN[p.familia_numerosa] ?? p.familia_numerosa) : 'No') : null, 'texto', 'familia_numerosa'),
    perfilD('comunidad', 'Comunidad autónoma', p?.comunidad_autonoma ?? null, 'texto', 'comunidad_autonoma'),
    perfilD('conyuge_trabaja', 'Pilar trabaja (activa maternidad)', p ? Boolean(p.conyuge_trabaja) : null, 'si_no', 'conyuge_trabaja'),
  ]
  if (e.hijos.length === 0) {
    familia.push({ id: 'hijos', etiqueta: 'Hijos', valor: p ? 'Ninguno registrado' : null, formato: 'texto', fuente: 'fiscal_descendientes', actualizado: null, edicion: 'hijos' })
  } else {
    const anio = Number(e.hoy.slice(0, 4))
    for (const [i, h] of e.hijos.entries()) {
      const edad = edadAFinDe(h.fechaNacimiento, anio)
      familia.push({
        id: `hijo_${i}`, etiqueta: `Hijo/a: ${h.nombre}`, valor: `${h.fechaNacimiento.split('-').reverse().join('/')} · ${edad} ${edad === 1 ? 'año' : 'años'} a 31/12`,
        formato: 'texto', fuente: 'fiscal_descendientes.fecha_nacimiento', actualizado: null, edicion: 'hijos',
        nota: h.gradoDiscapacidad > 0 ? `Discapacidad ${h.gradoDiscapacidad} %` : undefined,
      })
    }
  }

  // ── Inmuebles ──
  const inmuebles: Dato[] = []
  for (const id of PISOS) {
    const nombre = e.nombresPiso[id] ?? id
    const filas = e.titularidad.filter(t => t.propiedad_id === id)
    inmuebles.push({
      id: `tit_${id}`, etiqueta: `${nombre}: titularidad`,
      valor: filas.length ? filas.map(t => `${t.titular === 'alberto' ? 'Alberto' : 'Pilar'} ${num(t.porcentaje)} %`).join(' / ') + (filas[0].regimen === 'arrendamiento' ? ' (subarriendo)' : '') : null,
      formato: 'texto', fuente: 'propiedad_titularidad', actualizado: dia(filas.map(t => t.updated_at ?? '').sort().pop()), edicion: 'solo_lectura',
      nota: 'Sin formulario aún: se corrige en la tabla.',
    })
    const am = AMORTIZACION_INMUEBLES[id]
    const esPropio = id in AMORTIZACION_INMUEBLES
    inmuebles.push({
      id: `amort_${id}`, etiqueta: `${nombre}: amortización anual`,
      valor: am ? am.anual : null, formato: 'eur',
      fuente: am ? `base-fiscal-devengo.ts · AMORTIZACION_INMUEBLES (${am.fuente}; tasa ${TASA_AMORTIZACION_INMUEBLE * 100} %)` : 'base-fiscal-devengo.ts · AMORTIZACION_INMUEBLES',
      actualizado: null, edicion: 'solo_lectura',
      nota: esPropio ? undefined : 'No aplica: subarriendo (capital mobiliario).',
    })
    if (esPropio) {
      const int = INTERESES_FINANCIACION[id]
      inmuebles.push({
        id: `int_${id}`, etiqueta: `${nombre}: intereses de financiación / hipoteca`,
        valor: int ? int.anual : null, formato: 'eur',
        fuente: int ? `base-fiscal-devengo.ts · INTERESES_FINANCIACION (${int.fuente})` : 'base-fiscal-devengo.ts · INTERESES_FINANCIACION',
        actualizado: int?.actualizado ?? null, edicion: 'solo_lectura',
      })
    }
  }
  inmuebles.push(
    { id: 'valor_adq', etiqueta: 'Valor de adquisición por piso', valor: null, formato: 'eur', fuente: 'no existe en BD (solo dentro de la fórmula de amortización)', actualizado: null, edicion: 'solo_lectura' },
    { id: 'pct_construccion', etiqueta: '% construcción por piso', valor: null, formato: 'pct', fuente: 'no existe en BD (Socorro 60,58 % solo dentro de la fórmula)', actualizado: null, edicion: 'solo_lectura' },
  )

  // ── Actividades ──
  const actividades: Dato[] = [
    { id: 'correduria', etiqueta: 'Correduría (Grupo ASegura)', valor: 'Actividad económica de Alberto', formato: 'texto', fuente: 'base-fiscal-devengo.ts · bloque actividad_correduria (banco destino seguros)', actualizado: null, edicion: 'solo_lectura' },
    perfilD('pilar_autonoma', 'Pilar: actividad (autónoma)', p ? Boolean(p.conyuge_es_autonomo) : null, 'si_no', 'conyuge_es_autonomo'),
    apiD('pilar_cuota', 'Pilar: cuota de autónomos anual', num(p?.conyuge_cuota_autonomos), 'eur', 'conyuge_cuota_autonomos', 'conyuge_cuota_autonomos',
      'Tope de maternidad (art. 81 LIRPF): sin este dato la maternidad sale «sin dato».'),
    apiD('pilar_exonerados', 'Pilar: meses de cuota exonerados', num(p?.conyuge_meses_exonerados), 'entero', 'conyuge_meses_exonerados', 'conyuge_meses_exonerados',
      'Meses de la prestación por nacimiento sin cuota. Necesita prisma/sql/2026-10-31_situacion_fiscal.sql aplicado.'),
  ]

  // ── Ahorro / previsión ──
  const ahorro: Dato[] = [
    perfilD('plan_pensiones', 'Planes de pensiones (aportación anual)', p ? num(p.aportacion_plan_pensiones) : null, 'eur', 'aportacion_plan_pensiones', 'La columna tiene 0 por defecto: 0 = «aún no editado» o «sin aportación».'),
    perfilD('donativos', 'Donativos (anual)', p ? num(p.donativos_anual) : null, 'eur', 'donativos_anual', 'Se sincroniza solo desde los movimientos etiquetados.'),
    perfilD('guarderia', 'Gasto de guardería (anual)', p ? num(p.gasto_guarderia_anual) : null, 'eur', 'gasto_guarderia_anual'),
  ]

  // ── Pagos a cuenta ──
  const pagos: Dato[] = [
    { id: 'ret_correduria', etiqueta: 'Retención de la correduría (tipo)', valor: RETENCION_CORREDURIA * 100, formato: 'pct', fuente: 'base-fiscal-devengo.ts · RETENCION_CORREDURIA', actualizado: null, edicion: 'solo_lectura' },
    { id: 'ret_alberto', etiqueta: 'Retenciones soportadas Alberto (año)', valor: null, formato: 'eur', fuente: 'fiscal-panel.ts · retenciones (no se agregan aún)', actualizado: null, edicion: 'solo_lectura' },
    apiD('ret_pilar', 'Retenciones soportadas Pilar (año)', num(p?.conyuge_retenciones), 'eur', 'conyuge_retenciones', 'conyuge_retenciones'),
    { id: 'm130', etiqueta: 'Modelo 130 pagado (año)', valor: null, formato: 'eur', fuente: 'no existe en BD (el motor deja pagos fraccionados en «sin dato»)', actualizado: null, edicion: 'solo_lectura' },
    { id: 'm115', etiqueta: 'Modelo 115 (retenciones de alquiler)', valor: null, formato: 'eur', fuente: 'no existe en BD', actualizado: null, edicion: 'solo_lectura' },
  ]

  return [
    { id: 'familia', titulo: 'Familia', datos: familia },
    { id: 'inmuebles', titulo: 'Inmuebles', datos: inmuebles },
    { id: 'actividades', titulo: 'Actividades', datos: actividades },
    { id: 'ahorro', titulo: 'Ahorro y previsión', datos: ahorro },
    { id: 'pagos', titulo: 'Pagos a cuenta', datos: pagos },
  ]
}

/** Campos que la API de la radiografía acepta (todos numéricos; null = borrar / volver a «sin dato»). */
export const CAMPOS_EDITABLES: Record<string, { columna: string; max: number; entero?: boolean }> = {
  conyuge_cuota_autonomos: { columna: 'conyuge_cuota_autonomos', max: 100000 },
  conyuge_retenciones: { columna: 'conyuge_retenciones', max: 1000000 },
  conyuge_meses_exonerados: { columna: 'conyuge_meses_exonerados', max: 12, entero: true },
}

/** Valida un valor entrante para un campo editable. Devuelve number|null o un error de texto. */
export function validarCampo(campo: string, valor: unknown): { ok: true; valor: number | null } | { ok: false; error: string } {
  const def = CAMPOS_EDITABLES[campo]
  if (!def) return { ok: false, error: `Campo no editable: ${campo}` }
  if (valor === null) return { ok: true, valor: null }
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor.replace(',', '.')) : NaN
  if (!Number.isFinite(n) || n < 0 || n > def.max) return { ok: false, error: `${campo}: valor fuera de rango (0–${def.max})` }
  if (def.entero && !Number.isInteger(n)) return { ok: false, error: `${campo}: debe ser un entero` }
  return { ok: true, valor: n }
}

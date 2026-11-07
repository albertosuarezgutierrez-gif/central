// Lectura del formulario de `/calculadora-coste-trabajador` y textos de los
// avisos. La cuenta NO vive aquí: es `simularCosteContratacion` de
// `@central/module-nominas` (motor de nóminas, céntimos, tablas 2026), que el
// componente llama en el navegador. Esto solo traduce lo que la persona teclea
// a la entrada del simulador, y las claves técnicas de los avisos a español.
//
// 🚨 Tres estados: un dato obligatorio sin poner → `{ ok: false }` (la UI dice
// qué falta), nunca un 0 inventado. La situación familiar es OPCIONAL: sin ella
// el simulador aplica el art. 88.2 del Reglamento del IRPF y lo avisa.
import type { EntradaSimulador, SituacionFamiliar } from '@central/module-nominas'
import { leerNumero } from './bonificacion-hipoteca.ts'

export const RUTA_COSTE_TRABAJADOR = '/calculadora-coste-trabajador'

export const GRUPOS: { valor: number; texto: string }[] = [
  { valor: 1, texto: '1 · Ingenieros y licenciados, alta dirección' },
  { valor: 2, texto: '2 · Ingenieros técnicos, peritos, ayudantes titulados' },
  { valor: 3, texto: '3 · Jefes administrativos y de taller' },
  { valor: 4, texto: '4 · Ayudantes no titulados' },
  { valor: 5, texto: '5 · Oficiales administrativos' },
  { valor: 6, texto: '6 · Subalternos' },
  { valor: 7, texto: '7 · Auxiliares administrativos' },
  { valor: 8, texto: '8 · Oficiales de primera y segunda' },
  { valor: 9, texto: '9 · Oficiales de tercera y especialistas' },
  { valor: 10, texto: '10 · Peones' },
  { valor: 11, texto: '11 · Trabajadores menores de 18 años' },
]

export type DatosCoste = {
  bruto: string
  pagas: '12' | '14' | '14p'
  grupo: string
  contrato: 'indefinido' | 'temporal'
  /** Solo con temporal. null = «no lo sé» (el simulador lo marca como aproximado). */
  menosDeUnAño: boolean | null
  jornada: string
  cnae: string
  familia: { activa: boolean; situacion: '1' | '2' | '3'; añoNacimiento: string; hijos: string; hijosMenores3: string }
  seguro: { activo: boolean; prima: string; beneficiarios: string; discapacidad: string }
}

export const EJEMPLO_COSTE: DatosCoste = {
  bruto: '24.000',
  pagas: '14',
  grupo: '5',
  contrato: 'indefinido',
  menosDeUnAño: null,
  jornada: '100',
  cnae: '',
  familia: { activa: false, situacion: '3', añoNacimiento: '1990', hijos: '0', hijosMenores3: '0' },
  seguro: { activo: true, prima: '600', beneficiarios: '1', discapacidad: '0' },
}

export type Lectura = { ok: true; entrada: EntradaSimulador } | { ok: false; falta: string }

// Mismo truco que `eurosACentimos` del motor: `toPrecision` evita el 1,005 × 100 = 100,4999….
const aCentimos = (euros: number) => Math.round(Number((euros * 100).toPrecision(15)))
const enteroDe = (txt: string): number | null => {
  const n = leerNumero(txt)
  return n !== null && Number.isInteger(n) ? n : null
}

/** Hoy en Madrid («AAAA-MM-DD»). La fecha se INYECTA en el simulador (que no lee el reloj); `ahora` para los tests. */
export function fechaHoyMadrid(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/**
 * Aviso VISIBLE cuando el simulador usa tablas de un año anterior al de hoy (las del año en curso aún no están
 * cargadas). null si las tablas son del año en curso.
 */
export function avisoTablasAñoAnterior(r: { año: number; añoCalculo: number | null; tablasDeAñoAnterior: boolean }): string | null {
  if (!r.tablasDeAñoAnterior || r.añoCalculo === null) return null
  return `Aún no tenemos cargadas las tablas oficiales de ${r.añoCalculo}: el cálculo usa las de ${r.año}, así que las cifras de este año pueden variar.`
}

/** `fechaCalculo` = hoy en Madrid («AAAA-MM-DD»): el año de las tablas lo elige el simulador a partir de ella. */
export function leerDatosCoste(d: DatosCoste, fechaCalculo: string): Lectura {
  const año = Number(fechaCalculo.slice(0, 4))
  const bruto = leerNumero(d.bruto)
  if (bruto === null || bruto <= 0) return { ok: false, falta: 'el salario bruto anual' }
  const jornada = leerNumero(d.jornada)
  if (jornada === null || jornada <= 0 || jornada > 100) return { ok: false, falta: 'la jornada (entre 1 y 100 %)' }
  const grupo = Number(d.grupo)
  if (!GRUPOS.some((g) => g.valor === grupo)) return { ok: false, falta: 'el grupo de cotización' }
  const cnae = d.cnae.trim()
  if (cnae && !/^\d{4}$/.test(cnae)) return { ok: false, falta: 'el CNAE (4 cifras) o déjalo en blanco' }

  const entrada: EntradaSimulador = {
    fechaCalculo,
    brutoAnual: aCentimos(bruto),
    pagas: d.pagas === '12' ? 12 : 14,
    prorrataExtras: d.pagas === '14p',
    grupo: grupo as EntradaSimulador['grupo'],
    contrato: d.contrato,
    jornadaPct: jornada,
    ...(d.contrato === 'temporal' && d.menosDeUnAño !== null ? { duracionInferiorAño: d.menosDeUnAño } : {}),
    ...(cnae ? { cnae } : {}),
  }

  if (d.familia.activa) {
    const s = situacionDesdeFormulario(d.familia, año)
    if (!s.ok) return s
    entrada.situacion = s.situacion
  }

  if (d.seguro.activo) {
    const prima = leerNumero(d.seguro.prima)
    if (prima === null || prima <= 0) return { ok: false, falta: 'la prima anual del seguro de salud' }
    const benef = enteroDe(d.seguro.beneficiarios)
    if (benef === null || benef < 1 || benef > 15) return { ok: false, falta: 'cuántas personas cubre el seguro' }
    const disc = d.seguro.discapacidad.trim() === '' ? 0 : enteroDe(d.seguro.discapacidad)
    if (disc === null || disc > benef) return { ok: false, falta: 'cuántos asegurados tienen discapacidad (no más que los asegurados)' }
    if (prima >= bruto) return { ok: false, falta: 'una prima menor que el salario bruto' }
    entrada.retribucionFlexible = { seguroSaludAnual: aCentimos(prima), beneficiarios: benef, discapacidad: disc }
  }
  return { ok: true, entrada }
}

/**
 * Modelo 145 simplificado: situación, edad y número de hijos (< 25 años). Con
 * situación 1.ª (monoparental) los hijos se computan por entero; en las demás, a
 * medias con el otro progenitor, que es el caso común.
 */
export function situacionDesdeFormulario(
  f: DatosCoste['familia'],
  año: number,
): { ok: true; situacion: SituacionFamiliar } | { ok: false; falta: string } {
  const nac = enteroDe(f.añoNacimiento)
  if (nac === null || nac < año - 80 || nac > año - 16) return { ok: false, falta: 'el año de nacimiento del trabajador' }
  const hijos = f.hijos.trim() === '' ? 0 : enteroDe(f.hijos)
  if (hijos === null || hijos > 15) return { ok: false, falta: 'el número de hijos' }
  const menores = f.hijosMenores3.trim() === '' ? 0 : enteroDe(f.hijosMenores3)
  if (menores === null || menores > hijos) return { ok: false, falta: 'cuántos hijos tienen menos de 3 años (no más que los hijos)' }
  const porEntero = f.situacion === '1'
  const descendientes = Array.from({ length: hijos }, (_, i) => ({
    fechaNacimiento: i < menores ? `${año - 1}-06-01` : `${año - 10}-06-01`,
    discapacidad: 'ninguna' as const,
    porEntero,
  }))
  return {
    ok: true,
    situacion: {
      vigenteDesde: `${año}-01-01`,
      vigenteHasta: null,
      situacion: Number(f.situacion) as 1 | 2 | 3,
      fechaNacimientoContribuyente: `${nac}-06-01`,
      discapacidad: 'ninguna',
      descendientes,
      ascendientes: [],
    },
  }
}

/** Claves de aviso/pendiente del simulador → frase para el público. Las que no están aquí son técnicas y no se pintan. */
export const TEXTO_AVISO: Record<string, string> = {
  'regla:at_ep_empresa': 'Sin la actividad (CNAE) de la empresa, la cuota de accidentes de trabajo se calcula con un 1,50 % provisional.',
  'regla:at_ep_tabla_cnae': 'La cuota de accidentes de trabajo sale de nuestra tabla por actividad, pendiente de contrastar con la tarifa oficial.',
  'regla:duracion_temporal_desconocida': 'No sabemos si el contrato temporal dura menos de un año; si es así, la retención mínima de IRPF es del 2 %.',
  'regla:tablas_de_año_anterior': 'Las tablas oficiales de este año aún no están cargadas: el cálculo usa las del año anterior y es aproximado.',
  'regla:base_min_parcial': 'A tiempo parcial la base mínima depende de las horas reales de cada mes; aquí se aproxima con el porcentaje de jornada.',
  cnae_sin_tarifa_at_ep: 'No tenemos tarifa de accidentes para ese CNAE: se usa un 1,50 % provisional.',
  'irpf:sin_modelo_145_sin_circunstancias': 'Sin situación familiar, la retención se calcula sin circunstancias personales ni familiares (art. 88.2 del Reglamento del IRPF).',
  'irpf:minimo_exento': 'Con este salario no se practica retención de IRPF.',
  'irpf:tipo_minimo_contrato_corto': 'Contrato de menos de un año: se aplica la retención mínima del 2 %.',
  bajo_smi: 'El salario a jornada completa no llega al salario mínimo interprofesional.',
  base_minima_aplicada: 'Se cotiza por la base mínima del grupo: el salario está por debajo de ella.',
  base_maxima_aplicada: 'Se cotiza por la base máxima; por encima se paga la cotización de solidaridad.',
  'flexible:seguro_salud_cotiza_lgss_147': 'El seguro de salud sí cotiza a la Seguridad Social (art. 147 de la Ley General de la Seguridad Social): el coste para la empresa no cambia.',
  'flexible:exceso_tributa_como_especie': 'Lo que pasa de 500 € por persona y año (1.500 € con discapacidad) tributa en el IRPF como retribución en especie.',
  'flexible:prima_repartida_por_igual_entre_asegurados': 'Suponemos la prima repartida a partes iguales entre las personas aseguradas.',
  'flexible:ingreso_a_cuenta_repercutido': 'Suponemos que el ingreso a cuenta del seguro se descuenta al trabajador al mismo tipo de retención.',
  'flexible:especie_supera_30pct_et_26_1': 'El salario en especie no puede pasar del 30 % del salario (art. 26.1 del Estatuto de los Trabajadores).',
  'flexible:dinero_bajo_smi_et_26_1': 'El salario en dinero no puede quedar por debajo del salario mínimo (art. 26.1 del Estatuto de los Trabajadores).',
}

/**
 * Frases para pintar. Una clave PENDIENTE sin texto no se calla: se pinta la
 * frase genérica, porque «aproximado» sin motivo no le sirve a nadie.
 */
export function textosAvisos(r: { avisos: string[]; cifrasPendientes: string[] }): string[] {
  const out: string[] = []
  for (const c of r.cifrasPendientes) out.push(TEXTO_AVISO[c] ?? 'Alguna cifra legal está pendiente de verificar: el resultado es aproximado.')
  for (const a of r.avisos) if (TEXTO_AVISO[a]) out.push(TEXTO_AVISO[a])
  return [...new Set(out)]
}

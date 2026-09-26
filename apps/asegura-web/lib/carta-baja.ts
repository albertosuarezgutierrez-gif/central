// La carta de no renovación de `/carta-baja-seguro`: la herramienta SIN
// registro para quien busca «modelo carta baja seguro» (140/mes, KD 0) o «dar
// de baja seguro coche» (390/mes, KD 0), medido con OpenSEO el 26/09/2026.
//
// 🚨 Tres reglas, las mismas que la carta del portal
// (`packages/module-seguros-portal/src/carta-no-renovacion.ts`):
//
// 1. **No se envía nada.** La carta se compone en el navegador y la persona la
//    copia, la imprime o la abre en SU correo. Ni el NIF ni el nombre salen de
//    su pantalla: no hay `fetch`, ni formulario, ni evento de analítica con
//    ellos (`medir` solo recibe el ramo y el estado del plazo).
// 2. **Lo que no ha escrito sale como HUECO visible** (`[TU NIF]`), y `huecos`
//    lo lista para que la pantalla lo avise antes de copiar. Nunca un valor
//    plausible.
// 3. **Mismo texto legal que el portal.** Esta app no puede importar ese
//    paquete (su `obligacion.ts` importa el barril de `@central/module-seguros`,
//    y `node --test` no resuelve sus imports sin extensión), así que el cuerpo
//    se repite aquí y `carta-baja.test.ts` lee el fuente del portal y exige las
//    mismas frases: si una cambia, el test se pone rojo.
import { DIAS_PREAVISO, parsearFecha } from './calculadora-vencimientos.ts'

const MS_DIA = 86_400_000

/**
 * «Hoy» del navegador como medianoche UTC. Se leen los componentes LOCALES:
 * con los `getUTC*`, entre las 00:00 y las 01:59 en España (UTC+2 en verano)
 * la carta saldría fechada el día anterior y el plazo con un día de más.
 */
function hoyComoDiaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function fechaEnLetra(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Ramos del desplegable. `''` = no lo ha dicho, y la carta no lo menciona. */
export const RAMOS_CARTA = [
  { valor: '', texto: 'Tipo de seguro (opcional)' },
  { valor: 'automóvil', texto: 'Coche o moto' },
  { valor: 'hogar', texto: 'Hogar' },
  { valor: 'salud', texto: 'Salud' },
  { valor: 'vida', texto: 'Vida' },
  { valor: 'decesos', texto: 'Decesos' },
  { valor: 'comunidades', texto: 'Comunidad de propietarios' },
  { valor: 'comercio', texto: 'Comercio o negocio' },
  { valor: 'responsabilidad civil', texto: 'Responsabilidad civil' },
] as const

export const HUECOS_CARTA = {
  tomador: '[TU NOMBRE Y APELLIDOS]',
  nif: '[TU NIF]',
  compania: '[NOMBRE DE LA COMPAÑÍA]',
  numeroPoliza: '[NÚMERO DE PÓLIZA]',
  fechaVencimiento: '[FECHA DE VENCIMIENTO]',
  lugar: '[LOCALIDAD]',
} as const

export type HuecoCarta = keyof typeof HUECOS_CARTA

export type DatosCarta = {
  tomador: string
  nif: string
  compania: string
  numeroPoliza: string
  ramo: string
  /** `AAAA-MM-DD` del `<input type="date">`, o `''`. */
  vence: string
  lugar: string
}

export const DATOS_VACIOS: DatosCarta = {
  tomador: '',
  nif: '',
  compania: '',
  numeroPoliza: '',
  ramo: '',
  vence: '',
  lugar: '',
}

/**
 * - `sin_fecha`: no ha puesto vencimiento; no se dice nada del plazo.
 * - `en_plazo`: hoy ≤ vencimiento − 30 días.
 * - `fuera_de_plazo`: ese día ya pasó y la póliza no ha vencido: se renovará
 *   una vez más y la carta vale para el vencimiento SIGUIENTE.
 * - `vencida`: la fecha que ha puesto ya pasó; probablemente es la del año
 *   anterior y hay que pedirle la nueva.
 */
export type EstadoPlazo = 'sin_fecha' | 'en_plazo' | 'fuera_de_plazo' | 'vencida'

export function plazoCarta(vence: string, hoy: Date): { estado: EstadoPlazo; limite: Date | null; dias: number | null } {
  const v = parsearFecha(vence)
  if (!v) return { estado: 'sin_fecha', limite: null, dias: null }
  const limite = new Date(v.getTime() - DIAS_PREAVISO * MS_DIA)
  const h = hoyComoDiaUtc(hoy)
  const dias = Math.round((limite.getTime() - h.getTime()) / MS_DIA)
  if (v.getTime() < h.getTime()) return { estado: 'vencida', limite, dias }
  return { estado: dias >= 0 ? 'en_plazo' : 'fuera_de_plazo', limite, dias }
}

export function componerCarta(d: DatosCarta, hoy: Date): { asunto: string; cuerpo: string; huecos: HuecoCarta[] } {
  const huecos: HuecoCarta[] = []
  const campo = (valor: string, hueco: HuecoCarta): string => {
    const limpio = valor.trim()
    if (limpio) return limpio
    huecos.push(hueco)
    return HUECOS_CARTA[hueco]
  }

  const tomador = campo(d.tomador, 'tomador')
  const nif = campo(d.nif.toUpperCase(), 'nif')
  const compania = campo(d.compania, 'compania')
  const numero = campo(d.numeroPoliza, 'numeroPoliza')
  const fechaV = parsearFecha(d.vence)
  const vence = fechaV ? fechaEnLetra(fechaV) : campo('', 'fechaVencimiento')
  const lugar = campo(d.lugar, 'lugar')
  const ramoTexto = d.ramo.trim() ? ` del ramo de ${d.ramo.trim().toLowerCase()}` : ''

  const asunto = `Comunicación de no renovación de la póliza n.º ${numero}`

  const cuerpo = [
    `${lugar}, ${fechaEnLetra(hoyComoDiaUtc(hoy))}`,
    '',
    `A la atención de ${compania}`,
    'Departamento de Atención al Cliente',
    '',
    `Asunto: ${asunto}`,
    '',
    'Muy señores míos:',
    '',
    `Yo, ${tomador}, con NIF ${nif}, en calidad de tomador/a de la póliza n.º ${numero}${ramoTexto}, con vencimiento el ${vence}, les comunico mi voluntad de NO PRORROGAR dicho contrato a su vencimiento, conforme a lo previsto en el artículo 22 de la Ley 50/1980, de 8 de octubre, de Contrato de Seguro.`,
    '',
    'Esta comunicación se realiza por escrito y con la antelación mínima de un mes que establece dicho artículo.',
    '',
    'Les ruego que confirmen por escrito la recepción de esta comunicación y la baja de la póliza con efectos desde la fecha de vencimiento indicada, y que no emitan ningún recibo por periodos posteriores.',
    '',
    'Atentamente,',
    '',
    '',
    tomador,
    `NIF ${nif}`,
  ].join('\n')

  return { asunto, cuerpo, huecos }
}

/** `mailto:` sin destinatario: el canal de bajas de cada compañía no está verificado (`companias-baja.ts`). */
export function hrefCorreo(asunto: string, cuerpo: string): string {
  return `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
}

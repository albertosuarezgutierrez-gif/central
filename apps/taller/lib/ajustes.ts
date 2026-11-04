// Ajustes del taller (pantalla /ajustes, rol dueño): lógica PURA. Convierte lo que teclea el dueño
// (euros «50,00», porcentajes «10,5», horas «1,5») a unidades del dominio y aplica UN cambio sobre la
// ConfigTaller, que SIEMPRE pasa por `validarConfig` de module-taller. Sin BD.
import {
  TIPOS_LINEA, validarConfig,
  type Aceite, type ConfigTaller, type FranjaHorario, type IntervalosAvisos, type SeguridadLogin, type MedioCobro, type SerieFactura, type TipoIva,
  type TipoLinea, type TipoVehiculo,
} from '@central/module-taller'

/** «1.234,56» / «1234,5» / «50» → céntimos. null si no es un importe válido (nunca 0 por defecto). */
export function eurosACent(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null
  const [ent, dec = ''] = t.replace(/\./g, '').split(',')
  const n = Number(ent) * 100 + Number(dec.padEnd(2, '0'))
  return Number.isSafeInteger(n) ? n : null
}

/** «10,5» (%) → 1050 pb. null si no es válido. */
export function porcentajeAPb(texto: string): number | null {
  const t = texto.trim().replace('%', '').trim()
  if (!/^\d+(,\d{1,2})?$/.test(t)) return null
  const [ent, dec = ''] = t.split(',')
  return Number(ent) * 100 + Number(dec.padEnd(2, '0'))
}

export const pbAPorcentaje = (pb: number) => `${Math.floor(pb / 100)}${pb % 100 ? ',' + String(pb % 100).padStart(2, '0').replace(/0$/, '') : ''}`

/** «1,5» horas → 90 minutos (redondeo al minuto). null si no es válido. */
export function horasAMinutos(texto: string): number | null {
  const t = texto.trim()
  if (!/^\d+(,\d{1,2})?$/.test(t)) return null
  const [ent, dec = ''] = t.split(',')
  return Math.round((Number(ent) * 100 + Number(dec.padEnd(2, '0'))) * 60 / 100)
}

export const minutosAHoras = (m: number) => {
  const h = Math.round((m / 60) * 100) / 100
  return String(h).replace('.', ',')
}

/** Paquete tal como lo edita la pantalla (sin piezas: se conservan las que tuviera). */
export type PaqueteEditable = {
  codigo: string
  nombre: string
  baremoMinutos: number
  requiereAceite: boolean
  activo: boolean
  precioCerradoPorTipo: Record<string, number>
}

export type CambioAjustes =
  | { seccion: 'mano_obra'; precioHoraCent: number }
  | { seccion: 'iva_defecto'; ivaPorDefecto: Record<TipoLinea, string> }
  | { seccion: 'intervalos'; intervalos: IntervalosAvisos }
  | { seccion: 'tipos_vehiculo'; tipos: TipoVehiculo[] }
  | { seccion: 'paquetes'; paquetes: PaqueteEditable[] }
  | { seccion: 'aceites'; aceites: Aceite[] }
  | { seccion: 'medios_cobro'; medios: MedioCobro[] }
  | { seccion: 'ivas'; ivas: TipoIva[] }
  | { seccion: 'series'; series: SerieFactura[] }
  | { seccion: 'seguridad_login'; seguridad: SeguridadLogin }
  | { seccion: 'horario'; franjas: FranjaHorario[]; duracionHuecoMinutos: number; puestos: number }
  | {
      seccion: 'textos'
      /** Textos del TALLER. El consentimiento (casilla 2) no va aquí: texto legal versionado (F0). */
      textos: { pieResguardo: string; pieFactura: string; condicionesPresupuesto: string; firmaCorreo: string }
      validezPresupuestoDias: number
    }

export type ResultadoAjuste = { ok: true; config: ConfigTaller } | { ok: false; errores: string[] }

const CODIGO = /^[a-z0-9][a-z0-9_-]{0,39}$/

/** Código estable a partir de un nombre («Cambio de aceite» → «cambio-de-aceite»). */
export function codigoDesdeNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

function comprobarCodigos(xs: { codigo: string; nombre: string }[], que: string): string[] {
  const e: string[] = []
  for (const x of xs) {
    if (!x.nombre.trim()) e.push(`${que}: falta el nombre`)
    if (!CODIGO.test(x.codigo)) e.push(`${que} «${x.nombre}»: código inválido`)
  }
  return e
}

const CODIGO_SERIE = /^[A-Z0-9][A-Z0-9-]{0,9}$/

function comprobarSeries(xs: SerieFactura[]): string[] {
  const e: string[] = []
  for (const x of xs) {
    if (!CODIGO_SERIE.test(x.codigo)) e.push(`serie «${x.codigo}»: código inválido (mayúsculas y dígitos)`)
    if (!x.prefijo.trim()) e.push(`serie «${x.codigo}»: falta el prefijo`)
  }
  return e
}

/** Aplica un cambio a una COPIA de la configuración y la valida. No muta `antes`. */
export function aplicarAjuste(antes: ConfigTaller, cambio: CambioAjustes): ResultadoAjuste {
  const c: ConfigTaller = structuredClone(antes)
  const previos: string[] = []
  switch (cambio.seccion) {
    case 'mano_obra':
      c.precioHoraCent = cambio.precioHoraCent
      break
    case 'iva_defecto':
      for (const t of TIPOS_LINEA) c.ivaPorDefecto[t] = cambio.ivaPorDefecto[t]
      break
    case 'intervalos':
      c.intervalosAvisos = { ...cambio.intervalos }
      break
    case 'tipos_vehiculo':
      previos.push(...comprobarCodigos(cambio.tipos, 'tipo de vehículo'))
      // Un tipo que ya usa un paquete no puede desaparecer de la lista (se desactiva).
      for (const t of c.tiposVehiculo) {
        if (!cambio.tipos.some((n) => n.codigo === t.codigo)) previos.push(`el tipo «${t.nombre}» no se borra: desactívalo`)
      }
      c.tiposVehiculo = cambio.tipos.map((t) => ({ ...t }))
      break
    case 'paquetes':
      previos.push(...comprobarCodigos(cambio.paquetes, 'paquete'))
      c.paquetes = cambio.paquetes.map((p) => ({
        ...p,
        precioCerradoPorTipo: { ...p.precioCerradoPorTipo },
        piezas: structuredClone(antes.paquetes.find((x) => x.codigo === p.codigo)?.piezas ?? []),
      }))
      break
    case 'aceites':
      previos.push(...comprobarCodigos(cambio.aceites, 'aceite'))
      c.aceites = cambio.aceites.map((a) => ({ ...a }))
      break
    case 'medios_cobro':
      previos.push(...comprobarCodigos(cambio.medios, 'medio de cobro'))
      c.mediosCobro = cambio.medios.map((m) => ({ ...m }))
      break
    case 'ivas':
      previos.push(...comprobarCodigos(cambio.ivas, 'IVA'))
      c.ivas = cambio.ivas.map((i) => ({ ...i }))
      break
    case 'series':
      previos.push(...comprobarSeries(cambio.series))
      // Una serie no se borra (la numeración sin huecos y las facturas emitidas dependen de ella).
      for (const s of c.series) {
        if (!cambio.series.some((n) => n.codigo === s.codigo)) previos.push(`la serie «${s.codigo}» no se puede borrar`)
      }
      c.series = cambio.series.map((x) => ({ ...x }))
      break
    case 'seguridad_login':
      // Tope de login (N, ventana, bloqueo), duración de la sesión PIN y cierre por inactividad: todo dato del taller.
      c.seguridadLogin = { ...cambio.seguridad }
      break
    case 'horario':
      c.horarioCitas = {
        franjas: cambio.franjas.map((f) => ({ ...f })).sort((a, b) => a.diaSemana - b.diaSemana || a.desde.localeCompare(b.desde)),
        duracionHuecoMinutos: cambio.duracionHuecoMinutos,
        puestos: cambio.puestos,
      }
      for (const [i, f] of c.horarioCitas.franjas.entries()) {
        const sig = c.horarioCitas.franjas[i + 1]
        if (sig && sig.diaSemana === f.diaSemana && sig.desde < f.hasta) previos.push(`franjas solapadas el día ${f.diaSemana}`)
      }
      break
    case 'textos':
      c.textos = { ...c.textos, ...cambio.textos }
      c.validezPresupuestoDias = cambio.validezPresupuestoDias
      break
  }
  const errores = [...previos, ...validarConfig(c)]
  return errores.length > 0 ? { ok: false, errores } : { ok: true, config: c }
}

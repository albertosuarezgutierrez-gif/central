/**
 * Los datos del COMERCIO de un riesgo de comercio (30/09/2026), guardados en
 * `seguros.oportunidades.info_riesgo.datosComercio` para verlos, editarlos y CONFIRMARLOS en la pantalla del
 * riesgo. Sustituye al riesgo libre SOLO en este ramo (RC, comunidades y otros siguen en `datosRiesgoLibre`).
 *
 * Campos = los que manda CIMA en `RiesgoComercios` del EIAC (docs/CIMA-CAMPOS.md) + UNO propio que CIMA no da y
 * hace falta para tarificar (`regimenLocal`). Decisión de Alberto: nada más (ni cocina, ni aforo, ni empleados);
 * se añadirá lo que el día a día pida.
 *
 * Nombres alineados con lo que el mapper de CIMA ya escribe en `polizas.datos_especificos`, para que al emitir
 * no haya dos formas del mismo dato:
 *   EIAC Actividad.DescripcionActividad  → `actividad`
 *   SituacionRiesgo.NombreVia            → `direccion`        (la clave de la póliza; objeto.ts/precarga libre)
 *   SituacionRiesgo.OtrosDatosVia        → `otrosDatosVia`
 *   SituacionRiesgo.CodigoPostal         → `cp`
 *   SituacionRiesgo.Poblacion            → `localidad`
 *   SituacionRiesgo.Provincia            → `provincia`
 *   SuperficieConstruida                 → `metrosCuadrados`
 *   SuperficieTotal                      → `superficieTotal`
 *   Antiguedad                           → `anioConstruccion` (año limpio; la ingesta lo deja en `anioConstruccionCima`)
 *   Zona                                 → `zona`            (código de la compañía, tal cual)
 *   Capitales.Capital[]                  → `capitales[{bien, importe, modalidad, descripcion}]`
 *   MedidasProteccion.Proteccion[]       → `medidasProteccion[{medida, valor}]`   (la forma de `datos-compania-cima.ts`)
 *
 * 🚨 `null` = «no se sabe». En las dos LISTAS hay tres estados: `null` (nadie las ha mirado) · `[]` (revisado, no
 * hay) · con filas. Un importe de 0 es un dato («0 € declarados»). Una edición que trae la clave de una lista la
 * REEMPLAZA entera; ausente = no se toca.
 */
import {
  aplicarEdicionBloque, leerBloque, numeroDesdeTexto, validarParcial, vaciosDe,
  type CambioCampo, type ErrorCampo, type Espec,
} from './datos-riesgo-generico.ts'

/** Ramos que llevan este bloque. */
export function admiteDatosComercio(ramo: unknown): ramo is 'comercio' {
  return ramo === 'comercio'
}

export const REGIMENES_LOCAL = ['propietario', 'inquilino'] as const
export type RegimenLocal = (typeof REGIMENES_LOCAL)[number]
export const ETIQUETA_REGIMEN_LOCAL: Record<RegimenLocal, string> = { propietario: 'Propietario del local', inquilino: 'Inquilino (alquiler)' }

/** `claves_bien` del EIAC (§13.3.72) que se ofrecen en el comercio. */
export const BIENES_COMERCIO = ['CONTINENTE', 'CONTENIDO', 'MERCADERIAS', 'RC', 'OVJ', 'OTROS'] as const
export type BienComercio = (typeof BIENES_COMERCIO)[number]
export const ETIQUETA_BIEN_COMERCIO: Record<BienComercio, string> = {
  CONTINENTE: 'Continente (el local)',
  CONTENIDO: 'Contenido (mobiliario, maquinaria)',
  MERCADERIAS: 'Mercaderías',
  RC: 'Responsabilidad civil',
  OVJ: 'Objetos de valor y joyas',
  OTROS: 'Otros',
}

export const MAX_CAPITALES_COMERCIO = 30
export const MAX_MEDIDAS_COMERCIO = 30

export const ESPEC_COMERCIO = [
  { clave: 'actividad', etiqueta: 'Actividad', tipo: { t: 'texto', max: 200 } },
  { clave: 'direccion', etiqueta: 'Calle y número', tipo: { t: 'texto', max: 200 } },
  { clave: 'otrosDatosVia', etiqueta: 'Otros datos de la vía', tipo: { t: 'texto', max: 100 } },
  { clave: 'cp', etiqueta: 'Código postal', tipo: { t: 'cp' } },
  { clave: 'localidad', etiqueta: 'Población', tipo: { t: 'texto', max: 80 } },
  { clave: 'provincia', etiqueta: 'Provincia', tipo: { t: 'texto', max: 60 } },
  { clave: 'metrosCuadrados', etiqueta: 'Superficie construida (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000, sobreMin: true } },
  { clave: 'superficieTotal', etiqueta: 'Superficie total (m²)', tipo: { t: 'numero', min: 0, max: 1_000_000, sobreMin: true } },
  { clave: 'anioConstruccion', etiqueta: 'Año de construcción (antigüedad)', tipo: { t: 'entero', min: 1500, max: 'anioTope' } },
  { clave: 'zona', etiqueta: 'Zona (código de la compañía)', tipo: { t: 'texto', max: 40 } },
  { clave: 'regimenLocal', etiqueta: 'Local en propiedad o alquiler', tipo: { t: 'id' } },
] as const satisfies Espec

export type CampoComercio =
  | 'actividad' | 'direccion' | 'otrosDatosVia' | 'cp' | 'localidad' | 'provincia' | 'metrosCuadrados' | 'superficieTotal'
  | 'anioConstruccion' | 'zona' | 'regimenLocal' | 'capitales' | 'medidasProteccion'

export type CapitalComercio = { bien: BienComercio; importe: number; modalidad: string | null; descripcion: string | null }
export type MedidaComercio = { medida: string; valor: string | null }

export type DatosComercioRiesgo = {
  actividad: string | null
  direccion: string | null
  otrosDatosVia: string | null
  cp: string | null
  localidad: string | null
  provincia: string | null
  metrosCuadrados: number | null
  superficieTotal: number | null
  anioConstruccion: number | null
  zona: string | null
  regimenLocal: RegimenLocal | null
  /** `null` = sin mirar · `[]` = revisado, no hay · filas. */
  capitales: CapitalComercio[] | null
  medidasProteccion: MedidaComercio[] | null
  confirmadoAt: string | null
}

export const CAMPOS_COMERCIO: readonly CampoComercio[] = [...ESPEC_COMERCIO.map((c) => c.clave), 'capitales', 'medidasProteccion']
export const ETIQUETA_CAMPO_COMERCIO: Record<CampoComercio, string> = {
  ...(Object.fromEntries(ESPEC_COMERCIO.map((c) => [c.clave, c.etiqueta])) as Record<(typeof ESPEC_COMERCIO)[number]['clave'], string>),
  capitales: 'Capitales asegurados',
  medidasProteccion: 'Medidas de protección',
}

export const AVISO_COMERCIO = 'Este ramo se cotiza fuera: por ahora los datos quedan para el expediente y para tarificar con la compañía.'

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const compactar = (s: string) => s.replace(/\s+/g, ' ').trim()
const textoLeido = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const regimenLeido = (v: unknown): RegimenLocal | null => (v === 'propietario' || v === 'inquilino' ? v : null)
const bienLeido = (v: unknown): BienComercio | null => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return (BIENES_COMERCIO as readonly string[]).includes(s) ? (s as BienComercio) : null
}

// ─── Lectura (sin fiarse de lo guardado) ─────────────────────────────────────

function leerCapitales(bruto: unknown): CapitalComercio[] | null {
  if (!Array.isArray(bruto)) return null
  const out: CapitalComercio[] = []
  for (const x of bruto) {
    if (!esObj(x)) continue
    const bien = bienLeido(x.bien)
    // Un importe que no es número es «no se sabe»: la fila no se inventa un 0.
    if (bien === null || typeof x.importe !== 'number' || !Number.isFinite(x.importe)) continue
    out.push({ bien, importe: x.importe, modalidad: textoLeido(x.modalidad), descripcion: textoLeido(x.descripcion) })
  }
  return out
}

function leerMedidas(bruto: unknown): MedidaComercio[] | null {
  if (!Array.isArray(bruto)) return null
  const out: MedidaComercio[] = []
  for (const x of bruto) {
    if (!esObj(x)) continue
    const medida = textoLeido(x.medida)
    if (medida === null) continue
    out.push({ medida, valor: textoLeido(x.valor) })
  }
  return out
}

export function datosComercioVacios(): DatosComercioRiesgo {
  return { ...(vaciosDe(ESPEC_COMERCIO) as Omit<DatosComercioRiesgo, 'capitales' | 'medidasProteccion'>), capitales: null, medidasProteccion: null }
}

/** Lo guardado en `info_riesgo.datosComercio`. Un campo de otro tipo es «no se sabe»; lo que no se reconoce se ignora. */
export function leerDatosComercio(bruto: unknown): DatosComercioRiesgo | null {
  if (!esObj(bruto)) return null
  const base = leerBloque(ESPEC_COMERCIO, bruto) as Record<string, string | number | null>
  return {
    ...(base as unknown as Omit<DatosComercioRiesgo, 'capitales' | 'medidasProteccion' | 'regimenLocal'>),
    regimenLocal: regimenLeido(bruto.regimenLocal),
    capitales: leerCapitales(bruto.capitales),
    medidasProteccion: leerMedidas(bruto.medidasProteccion),
  }
}

// ─── Validación de una edición PARCIAL ───────────────────────────────────────

export type ValorEdicionComercio = Partial<Omit<DatosComercioRiesgo, 'confirmadoAt'>>
export type ValidacionComercio = { ok: true; valor: ValorEdicionComercio } | { ok: false; errores: ErrorCampo[] }

function textoOpcional(v: unknown, max: number): string | null | 'invalido' {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return 'invalido'
  const t = compactar(v)
  if (t === '') return null
  return t.length > max ? 'invalido' : t
}

/** Valida la lista de capitales entera. Cada fila con su motivo; `null` = borrar (sin mirar). */
export function validarCapitalesComercio(v: unknown): { ok: true; valor: CapitalComercio[] | null } | { ok: false; errores: ErrorCampo[] } {
  if (v === null) return { ok: true, valor: null }
  if (!Array.isArray(v)) return { ok: false, errores: [{ campo: 'capitales', motivo: 'Capitales: tiene que ser una lista.' }] }
  if (v.length > MAX_CAPITALES_COMERCIO) return { ok: false, errores: [{ campo: 'capitales', motivo: `Capitales: como mucho ${MAX_CAPITALES_COMERCIO}.` }] }
  const errores: ErrorCampo[] = []
  const valor: CapitalComercio[] = []
  v.forEach((x, i) => {
    const mal = (motivo: string) => errores.push({ campo: 'capitales', motivo: `Capital ${i + 1}: ${motivo}` })
    if (!esObj(x)) return mal('tiene que ser un objeto.')
    const bien = bienLeido(x.bien)
    if (bien === null) return mal('elige de qué es el capital.')
    const importe = numeroDesdeTexto(x.importe)
    if (x.importe === null || x.importe === undefined || (typeof x.importe === 'string' && x.importe.trim() === '')) return mal('falta el importe.')
    if (!Number.isFinite(importe) || importe < 0 || importe > 1_000_000_000) return mal('el importe tiene que ser un número entre 0 y 1.000.000.000.')
    const modalidad = textoOpcional(x.modalidad, 40)
    const descripcion = textoOpcional(x.descripcion, 120)
    if (modalidad === 'invalido') return mal('modalidad de valoración no válida o demasiado larga.')
    if (descripcion === 'invalido') return mal('descripción no válida o demasiado larga.')
    if (bien === 'OTROS' && descripcion === null) return mal('«Otros» necesita una descripción.')
    valor.push({ bien, importe: Math.round(importe * 100) / 100, modalidad, descripcion })
  })
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor }
}

export function validarMedidasComercio(v: unknown): { ok: true; valor: MedidaComercio[] | null } | { ok: false; errores: ErrorCampo[] } {
  if (v === null) return { ok: true, valor: null }
  if (!Array.isArray(v)) return { ok: false, errores: [{ campo: 'medidasProteccion', motivo: 'Medidas de protección: tiene que ser una lista.' }] }
  if (v.length > MAX_MEDIDAS_COMERCIO) return { ok: false, errores: [{ campo: 'medidasProteccion', motivo: `Medidas de protección: como mucho ${MAX_MEDIDAS_COMERCIO}.` }] }
  const errores: ErrorCampo[] = []
  const valor: MedidaComercio[] = []
  v.forEach((x, i) => {
    const mal = (motivo: string) => errores.push({ campo: 'medidasProteccion', motivo: `Medida ${i + 1}: ${motivo}` })
    if (!esObj(x)) return mal('tiene que ser un objeto.')
    const medida = textoOpcional(x.medida, 120)
    const val = textoOpcional(x.valor, 80)
    if (medida === 'invalido' || val === 'invalido') return mal('texto no válido o demasiado largo.')
    if (medida === null) return mal('falta la descripción de la medida.')
    valor.push({ medida, valor: val })
  })
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor }
}

/**
 * Valida una edición PARCIAL (solo las claves que vienen). Vacío/`null` = borrar ese dato. Las claves que no son
 * del bloque se ignoran (no se cuelan al JSON guardado).
 */
export function validarDatosComercioRiesgo(parcial: unknown, opciones: { hoy?: string } = {}): ValidacionComercio {
  const hoy = opciones.hoy ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const v = validarParcial(ESPEC_COMERCIO, parcial, { hoy, nombreBloque: 'Los datos del comercio' })
  if (!esObj(parcial)) return v as { ok: false; errores: ErrorCampo[] }
  const errores: ErrorCampo[] = v.ok ? [] : [...v.errores]
  const valor: Record<string, unknown> = v.ok ? { ...v.valor } : {}
  if (v.ok && valor.regimenLocal !== undefined && valor.regimenLocal !== null && regimenLeido(valor.regimenLocal) === null) {
    errores.push({ campo: 'regimenLocal', motivo: 'Local en propiedad o alquiler: elige propietario o inquilino.' })
  }
  if (Object.prototype.hasOwnProperty.call(parcial, 'capitales')) {
    const c = validarCapitalesComercio(parcial.capitales === undefined ? null : parcial.capitales)
    if (c.ok) valor.capitales = c.valor
    else errores.push(...c.errores)
  }
  if (Object.prototype.hasOwnProperty.call(parcial, 'medidasProteccion')) {
    const m = validarMedidasComercio(parcial.medidasProteccion === undefined ? null : parcial.medidasProteccion)
    if (m.ok) valor.medidasProteccion = m.valor
    else errores.push(...m.errores)
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor: valor as ValorEdicionComercio }
}

// ─── «Qué falta» para tarificar ──────────────────────────────────────────────

export type CampoFaltaComercio = 'actividad' | 'situacion' | 'superficie' | 'regimenLocal' | 'capitales'

const ETIQUETA_FALTA: Record<CampoFaltaComercio, string> = {
  actividad: 'la actividad',
  situacion: 'la situación del local (calle, código postal y población)',
  superficie: 'la superficie construida',
  regimenLocal: 'si el local es en propiedad o en alquiler',
  capitales: 'al menos un capital asegurado (mayor que 0)',
}

/**
 * Lo que FALTA para tarificar un comercio: actividad, situación (calle + CP + población), superficie construida,
 * régimen del local y al menos un capital. `null` (sin ficha) = «falta todo». Un capital de 0 no basta (no hay
 * nada que tarificar), pero sí cuenta como dato en la ficha.
 */
export function faltanDatosComercio(datos: Partial<DatosComercioRiesgo> | null | undefined): CampoFaltaComercio[] {
  const d = datos ?? {}
  const f: CampoFaltaComercio[] = []
  if (!d.actividad) f.push('actividad')
  if (!d.direccion || !d.cp || !d.localidad) f.push('situacion')
  if (d.metrosCuadrados === null || d.metrosCuadrados === undefined) f.push('superficie')
  if (!d.regimenLocal) f.push('regimenLocal')
  if (!(d.capitales ?? []).some((c) => c.importe > 0)) f.push('capitales')
  return f
}

export function textoFaltanComercio(faltan: readonly CampoFaltaComercio[] | null | undefined): string | null {
  if (faltan === null || faltan === undefined || faltan.length === 0) return null
  return `Falta para tarificar: ${faltan.map((c) => ETIQUETA_FALTA[c]).join(', ')}.`
}

// ─── Edición ─────────────────────────────────────────────────────────────────

const eurTexto = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €`

/** Una lista como texto corto para el historial de cambios («ninguno» = revisada y vacía; `null` = sin mirar). */
export function textoCapitalesComercio(c: readonly CapitalComercio[] | null): string | null {
  if (c === null) return null
  if (c.length === 0) return 'ninguno'
  return c.map((x) => `${x.bien}${x.descripcion ? ` (${x.descripcion})` : ''} ${eurTexto(x.importe)}${x.modalidad ? ` [${x.modalidad}]` : ''}`).join(' · ')
}
export function textoMedidasComercio(m: readonly MedidaComercio[] | null): string | null {
  if (m === null) return null
  if (m.length === 0) return 'ninguna'
  return m.map((x) => (x.valor ? `${x.medida}: ${x.valor}` : x.medida)).join(' · ')
}

export function aplicarEdicionComercio(
  actual: DatosComercioRiesgo | null,
  valor: ValorEdicionComercio,
  opciones: { confirmar: boolean; ahora: string },
): { datos: DatosComercioRiesgo; cambios: CambioCampo[] } {
  const previo = actual ?? datosComercioVacios()
  const escalares: Record<string, never> = {}
  for (const c of ESPEC_COMERCIO) if (Object.prototype.hasOwnProperty.call(valor, c.clave)) escalares[c.clave] = (valor as Record<string, never>)[c.clave]
  const r = aplicarEdicionBloque(ESPEC_COMERCIO, previo as unknown as Record<string, never>, escalares, opciones)
  const datos = { ...previo, ...(r.datos as object) } as DatosComercioRiesgo
  const cambios = [...r.cambios]

  if (Object.prototype.hasOwnProperty.call(valor, 'capitales')) {
    const nuevo = valor.capitales ?? null
    if (JSON.stringify(nuevo) !== JSON.stringify(previo.capitales)) {
      cambios.push({ campo: 'capitales', antes: textoCapitalesComercio(previo.capitales), despues: textoCapitalesComercio(nuevo) })
      datos.capitales = nuevo
    }
  }
  if (Object.prototype.hasOwnProperty.call(valor, 'medidasProteccion')) {
    const nuevo = valor.medidasProteccion ?? null
    if (JSON.stringify(nuevo) !== JSON.stringify(previo.medidasProteccion)) {
      cambios.push({ campo: 'medidasProteccion', antes: textoMedidasComercio(previo.medidasProteccion), despues: textoMedidasComercio(nuevo) })
      datos.medidasProteccion = nuevo
    }
  }
  // Mismo sello que el resto: se confirma → `ahora`; cualquier cambio sin confirmar (también de las listas) → se borra.
  if (opciones.confirmar) datos.confirmadoAt = opciones.ahora
  else if (cambios.length > 0) datos.confirmadoAt = null
  return { datos, cambios }
}

/** Sin nada que afirmar no hay nada que confirmar. Una lista `[]` (revisada, vacía) sí es algo que afirmar. */
export function motivoNoConfirmableComercio(d: DatosComercioRiesgo): string | null {
  return CAMPOS_COMERCIO.some((k) => d[k] !== null) ? null : 'No se puede confirmar un comercio sin ningún dato.'
}

// ─── Precarga desde la póliza ────────────────────────────────────────────────

const CAJON = /^(N\/A|NA|NULL|NONE|OTRO|OTROS|DESCONOCIDO|SIN DATOS?|NO INFORMADO|NO CONSTA|0|00000000|-+)$/i

/**
 * Precarga desde `polizas.datos_especificos` cuando la oportunidad nace de una póliza (lo que escribe el mapper
 * de CIMA). Sin inventar: lo que no hay, no se pone; el cifrado (`v1:`) y los valores de cajón, tampoco. Los
 * capitales `OTROS` de la ingesta son partidas de COBERTURA (513 medidos), no capitales del bien: no se precargan.
 * Una lista sin ninguna fila válida no se precarga (`[]` sería afirmar «revisado, no hay»). NUNCA confirmado.
 */
export function precargaComercioDePoliza(datos: unknown): ValorEdicionComercio {
  const d = esObj(datos) ? datos : {}
  const t = (v: unknown): string | null => {
    const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.trim() : ''
    return s === '' || s.startsWith('v1:') || CAJON.test(s) ? null : s
  }
  const n = (v: unknown): number | null => {
    const x = numeroDesdeTexto(v)
    return Number.isFinite(x) && x > 0 ? x : null
  }
  const candidato: Record<string, unknown> = {
    actividad: t(d.actividad),
    direccion: t(d.direccion),
    otrosDatosVia: t(d.otrosDatosVia),
    cp: t(d.cp),
    localidad: t(d.localidad),
    provincia: t(d.provincia),
    metrosCuadrados: n(d.metrosCuadrados),
    superficieTotal: n(d.superficieTotal),
    // La antigüedad de CIMA (año limpio) es lo único que hay de este dato: se enseña «de la póliza, sin confirmar».
    anioConstruccion: n(d.anioConstruccion) ?? n(d.anioConstruccionCima),
    zona: t(d.zona),
  }
  for (const k of Object.keys(candidato)) if (candidato[k] === null) delete candidato[k]
  for (let i = 0; i < CAMPOS_COMERCIO.length; i++) {
    const v = validarDatosComercioRiesgo(candidato)
    if (v.ok) break
    for (const e of v.errores) delete candidato[e.campo]
  }

  const capitales = (Array.isArray(d.capitales) ? d.capitales : []).flatMap((x): CapitalComercio[] => {
    if (!esObj(x) || bienLeido(x.bien) === 'OTROS') return []
    const fila = { bien: x.bien, importe: x.importe, modalidad: t(x.modalidad ?? x.modalidadValoracion), descripcion: t(x.descripcion) }
    const v = validarCapitalesComercio([fila])
    return v.ok && v.valor ? v.valor : []
  })
  const medidas = (Array.isArray(d.medidasProteccion) ? d.medidasProteccion : []).flatMap((x): MedidaComercio[] => {
    if (!esObj(x)) return []
    const v = validarMedidasComercio([{ medida: t(x.medida), valor: t(x.valor) }])
    return v.ok && v.valor ? v.valor : []
  })
  const final = validarDatosComercioRiesgo(candidato)
  const out: ValorEdicionComercio = final.ok ? { ...final.valor } : {}
  if (capitales.length > 0) out.capitales = capitales
  if (medidas.length > 0) out.medidasProteccion = medidas
  return out
}

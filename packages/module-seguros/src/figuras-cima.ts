// Las PERSONAS que manda CIMA con estructura (04/10/2026, asegura#880): las figuras de una póliza
// (`polizas.datos_especificos.figuras[]`), la persona asegurada de vida y decesos
// (`datos_especificos.vida|decesos`) y los terceros de un siniestro (`siniestros.cima_extra.terceros[]`).
//
// Puro: sin BD, sin red, sin env. El descifrado entra INYECTADO (`decryptField` en `apps/asegura`):
// esto se llama en el servidor de asegura y lo que sale ya va en claro, nunca `v1:`.
//
// ─── Las reglas, enteras ────────────────────────────────────────────────────
//  - `null` = no consta, y no se pinta. Un cifrado que no se puede abrir también sale `null`, pero
//    marca `ilegible` (no es «no tiene»: es «no se ha podido leer»).
//  - Ningún texto que empiece por `v1:` sale de aquí, ni de un campo cifrado ni de uno en claro.
//  - El DOCUMENTO no se descifra ni se enseña: solo si consta (`documentoConsta`). Ni entero ni sus
//    últimos caracteres cruzan el puerto (el NIF no cruza, `apps/asegura/CLAUDE.md`).
//  - Todo es opcional: antes de #880 no hay `figuras`, ni `vida.persona`, ni `cima_extra.terceros`;
//    las funciones devuelven `null` (clave ausente: aún no leído) ≠ `[]` (leído y vacío).
//  - Idempotente: lo que sirve el puerto (ya en claro, con `documentoConsta`) se vuelve a leer con las
//    mismas funciones sin `descifrar` (plataforma), y sale igual.

import { CLAVES_EIAC } from './claves-eiac.ts'
import { provinciaPorCp } from './cliente-edicion.ts'

/** `decryptField` de `@central/module-seguros-pii`, inyectado. Puede lanzar. */
export type DescifrarFigura = (v: string) => string | null | undefined

/** Papeles que escribe la ingesta (asegura#880). Uno que no esté aquí se enseña tal cual, sin guiones. */
export const PAPELES_FIGURA_CIMA = [
  'tomador', 'asegurado', 'propietario', 'conductor_habitual', 'conductor_ocasional', 'contrario',
  'conductor_contrario', 'asegurado_dependiente', 'beneficiario', 'contratista', 'pagador', 'perjudicado',
  'promotor', 'subcontratista', 'tercero', 'testigo', 'otro',
] as const
export type PapelFiguraCima = (typeof PAPELES_FIGURA_CIMA)[number]

/** Papel → clave de `claves_figura` (EIAC V07.1 §13.3.22). La etiqueta sale de la norma (`CLAVES_EIAC.claseFigura`). */
const CLAVE_FIGURA_DE_PAPEL: Readonly<Record<string, keyof typeof CLAVES_EIAC.claseFigura>> = {
  asegurado_dependiente: 'AD', beneficiario: 'BE', contratista: 'CO', pagador: 'PA', perjudicado: 'PE',
  promotor: 'PR', subcontratista: 'SU', tercero: 'TE', testigo: 'TS',
}

/**
 * Papeles que NO salen de `ClaseFigura` sino del BLOQUE del EIAC que trae a la persona
 * (`Tomador`, `Asegurado`, `RiesgoAutos/Propietario`, `Conductores/Conductor` con `ClaseConductor`,
 * `Contrarios/Contrario` y su `ImplicadoAutos/Conductor`).
 */
const ETIQUETA_PAPEL_ESTRUCTURAL: Readonly<Record<string, string>> = {
  tomador: 'Tomador',
  asegurado: 'Asegurado',
  propietario: 'Propietario del vehículo',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
  contrario: 'Contrario',
  conductor_contrario: 'Conductor del contrario',
}

/**
 * Etiqueta legible de un papel. Los de `claves_figura` con el texto de la norma sin su paréntesis
 * de uso («Pagador (Utilizar si es distinto del Tomador…)» → «Pagador»); `TE` la norma lo dice en
 * plural («Terceros») y una persona es «Tercero». `otro` lleva la clave cruda si la hay (nunca se
 * adivina). `null`/vacío → «Figura».
 */
export function etiquetaPapel(papel: string | null | undefined, claseFigura?: string | null): string {
  const p = typeof papel === 'string' ? papel.trim() : ''
  if (p === '') return 'Figura'
  if (ETIQUETA_PAPEL_ESTRUCTURAL[p]) return ETIQUETA_PAPEL_ESTRUCTURAL[p]
  const clave = CLAVE_FIGURA_DE_PAPEL[p]
  if (clave) return clave === 'TE' ? 'Tercero' : CLAVES_EIAC.claseFigura[clave].replace(/\s*\(.*$/, '')
  if (p === 'otro') return claseFigura ? `Otra figura (clave ${claseFigura})` : 'Otra figura'
  const t = p.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ─── Tipos de salida ────────────────────────────────────────────────────────

export type DomicilioCimaFigura = {
  /** Calle y número, descifrado. */
  direccion: string | null
  claseVia: string | null
  cp: string | null
  localidad: string | null
  /** Código de provincia de la norma (tabla 12.1) o texto, tal cual. */
  provincia: string | null
  /** ISO 3166-1 alpha-3. */
  pais: string | null
}

export type FiguraFicha = {
  papel: string
  /** `etiquetaPapel(papel, claseFigura)`. */
  etiqueta: string
  claseFigura: string | null
  tipoPersona: 'fisica' | 'juridica' | null
  nombre: string | null
  domicilio: DomicilioCimaFigura | null
  telefono: string | null
  email: string | null
  /** `TipoIdentificacion` crudo (NI/NE/CI/PA…). */
  tipoDocumento: string | null
  /**
   * La compañía manda un documento. Es TODO lo que sale de él: ni entero ni sus últimos caracteres
   * (el NIF no cruza el puerto, `apps/asegura/CLAUDE.md`). `false` = no consta.
   */
  documentoConsta: boolean
  /** Solo beneficiario. */
  orden: string | null
  /** Solo beneficiario: porcentaje de participación, tal cual. */
  porcentaje: string | null
  /** Solo la persona asegurada de vida/decesos (ISO). */
  fechaNacimiento: string | null
  /** Algún campo venía cifrado y no se pudo abrir: lo que sale `null` no es «no tiene». */
  ilegible: boolean
}

export type TerceroFicha = FiguraFicha & {
  matricula: string | null
  /** Solo contrario: compañía de su póliza. */
  compania: string | null
  codigoEntidadDgs: string | null
  numeroPoliza: string | null
  /** `claves_responsabilidad` cruda (no hay tabla en `CLAVES_EIAC`: no se traduce a ojo). */
  responsabilidad: string | null
}

export type PrestamoFicha = {
  numero: string | null
  descripcion: string | null
  clase: string | null
  contratacion: string | null
  /** Importes como texto decimal del EIAC («120000.00»); se formatean con `eur()` al pintar. */
  importeInicial: string | null
  importeNominal: string | null
  cuotaInicial: string | null
  unidadDuracion: string | null
  duracion: string | null
}

/** Las actividades de riesgo de vida: tres estados (`true` declara que sí, `false` que no, `null` no consta). */
export const ACTIVIDADES_VIDA = [
  ['actividadesRiesgo', 'Actividades de riesgo'],
  ['usoMaquinaria', 'Uso de maquinaria'],
  ['usoVehiculo', 'Uso de vehículo'],
  ['usoVehiculoPesado', 'Uso de vehículo pesado'],
  ['usoHerramientasCorte', 'Uso de herramientas de corte'],
  ['usoArmas', 'Uso de armas'],
  ['contactoQuimicos', 'Contacto con productos químicos'],
  ['trabajoAltura', 'Trabajo en altura'],
] as const
export type ActividadVida = (typeof ACTIVIDADES_VIDA)[number][0]

export type VidaFicha = {
  persona: FiguraFicha | null
  idAplicacion: string | null
  idEmpleado: string | null
  convenio: string | null
  claseSeguro: string | null
  edadJubilacion: string | null
  prestamo: PrestamoFicha | null
  /** Máquinas/vehículos declarados: solo qué son (sin matrícula ni bastidor). */
  maquinas: string[] | null
  vehiculos: string[] | null
} & Record<ActividadVida, boolean | null>

export type DecesosFicha = {
  persona: FiguraFicha | null
  idAplicacion: string | null
  idEmpleado: string | null
  modalidad: string | null
}

export type PersonasPoliza = {
  /** `null` = la póliza no trae la clave `figuras` (ingerida antes de #880) ≠ `[]`. */
  figuras: FiguraFicha[] | null
  vida: VidaFicha | null
  decesos: DecesosFicha | null
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/** Tope por póliza/siniestro (el de la ingesta). */
export const MAX_FIGURAS_CIMA = 60

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Texto en CLARO: recortado, no vacío y nunca un `v1:` (un cifrado colado se tapa). */
function claro(v: unknown, max = 300): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '' || t.startsWith('v1:')) return null
  return t.slice(0, max)
}

/** Un lector de campos CIFRADOS que recuerda si alguno no se pudo abrir. */
function lectorCifrado(descifrar: DescifrarFigura | undefined) {
  let ilegible = false
  const leer = (v: unknown): string | null => {
    if (typeof v !== 'string' || v.trim() === '') return null
    const t = v.trim()
    if (!t.startsWith('v1:')) return claro(t)
    if (!descifrar) {
      ilegible = true
      return null
    }
    let out: string | null | undefined
    try {
      out = descifrar(t)
    } catch {
      out = null
    }
    const c = claro(out)
    if (c === null) ilegible = true
    return c
  }
  return { leer, ilegible: () => ilegible }
}

function domicilioDe(v: unknown, leer: (v: unknown) => string | null): DomicilioCimaFigura | null {
  if (!esObjeto(v)) return null
  const d: DomicilioCimaFigura = {
    direccion: leer(v.direccion),
    claseVia: claro(v.claseVia),
    cp: claro(v.cp),
    localidad: claro(v.localidad),
    provincia: claro(v.provincia),
    pais: claro(v.pais),
  }
  return Object.values(d).some((x) => x !== null) ? d : null
}

function figuraBase(raw: Record<string, unknown>, descifrar: DescifrarFigura | undefined): FiguraFicha | null {
  const lector = lectorCifrado(descifrar)
  const papel = claro(raw.papel, 60) ?? 'otro'
  const claseFigura = claro(raw.claseFigura, 10)
  // Documento: solo SI CONSTA (`documentoCifrado`, lo que guarda la ingesta, o el `documentoConsta`
  // ya servido). No se descifra: nada de él sale de aquí.
  const cifrado = typeof raw.documentoCifrado === 'string' && raw.documentoCifrado.trim() !== ''
  const documentoConsta = cifrado || raw.documentoConsta === true
  const tipo = raw.tipoPersona === 'fisica' || raw.tipoPersona === 'juridica' ? raw.tipoPersona : null
  const f: FiguraFicha = {
    papel,
    etiqueta: etiquetaPapel(papel, claseFigura),
    claseFigura,
    tipoPersona: tipo,
    nombre: lector.leer(raw.nombre),
    domicilio: domicilioDe(raw.domicilio, lector.leer),
    telefono: lector.leer(raw.telefono),
    email: lector.leer(raw.email),
    tipoDocumento: claro(raw.tipoDocumento, 10),
    documentoConsta,
    orden: claro(raw.orden, 20),
    porcentaje: claro(raw.porcentaje, 20),
    fechaNacimiento: lector.leer(raw.fechaNacimiento),
    ilegible: false,
  }
  f.ilegible = lector.ilegible() || raw.ilegible === true
  return f
}

/** ¿Hay algo de la persona que decir? (una fila sin nombre, documento ni contacto no es nadie). */
function algoQueDecir(f: FiguraFicha, extra: (string | null)[] = []): boolean {
  return (
    f.nombre !== null || f.documentoConsta || f.domicilio !== null || f.telefono !== null ||
    f.email !== null || f.ilegible || extra.some((x) => x !== null)
  )
}

/** Una figura cruda (asegura#880) o ya servida → `FiguraFicha`, o `null` si no tiene a nadie. */
export function figuraDeCima(raw: unknown, descifrar?: DescifrarFigura): FiguraFicha | null {
  if (!esObjeto(raw)) return null
  const f = figuraBase(raw, descifrar)
  return f && algoQueDecir(f) ? f : null
}

/** Un tercero de siniestro crudo o servido → `TerceroFicha`. Un contrario sin persona pero con compañía/matrícula sí cuenta. */
export function terceroDeCima(raw: unknown, descifrar?: DescifrarFigura): TerceroFicha | null {
  if (!esObjeto(raw)) return null
  const base = figuraBase(raw, descifrar)
  if (!base) return null
  const lector = lectorCifrado(descifrar)
  const t: TerceroFicha = {
    ...base,
    matricula: lector.leer(raw.matricula),
    compania: claro(raw.compania),
    codigoEntidadDgs: claro(raw.codigoEntidadDgs, 20),
    numeroPoliza: claro(raw.numeroPoliza, 60),
    responsabilidad: claro(raw.responsabilidad, 40),
  }
  t.ilegible = base.ilegible || lector.ilegible()
  return algoQueDecir(t, [t.matricula, t.compania, t.numeroPoliza]) ? t : null
}

function lista<T>(v: unknown, leer: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, MAX_FIGURAS_CIMA).map(leer).filter((x): x is T => x !== null)
}

/** `datos_especificos.figuras` → lista. `null` = la clave no está (o no es lista): aún no leído ≠ `[]`. */
export function figurasDePoliza(datos: unknown, descifrar?: DescifrarFigura): FiguraFicha[] | null {
  if (!esObjeto(datos) || !Array.isArray(datos.figuras)) return null
  return lista(datos.figuras, (x) => figuraDeCima(x, descifrar))
}

/** `cima_extra.terceros` (o la lista servida) → lista. `null` = no consta la clave ≠ `[]`. */
export function tercerosDeSiniestro(cimaExtra: unknown, descifrar?: DescifrarFigura): TerceroFicha[] | null {
  const v = Array.isArray(cimaExtra) ? cimaExtra : esObjeto(cimaExtra) ? cimaExtra.terceros : undefined
  if (!Array.isArray(v)) return null
  return lista(v, (x) => terceroDeCima(x, descifrar))
}

function bool(v: unknown): boolean | null {
  return v === true ? true : v === false ? false : null
}

function prestamoDe(v: unknown): PrestamoFicha | null {
  if (!esObjeto(v)) return null
  const p: PrestamoFicha = {
    numero: claro(v.numero, 60),
    descripcion: claro(v.descripcion),
    clase: claro(v.clase, 20),
    contratacion: claro(v.contratacion, 20),
    importeInicial: claro(v.importeInicial, 30),
    importeNominal: claro(v.importeNominal, 30),
    cuotaInicial: claro(v.cuotaInicial, 30),
    unidadDuracion: claro(v.unidadDuracion, 20),
    duracion: claro(v.duracion, 20),
  }
  return Object.values(p).some((x) => x !== null) ? p : null
}

/** `[{descripcion|clase, marca, modelo}]` → «Descripción · Marca Modelo». Sin matrícula ni bastidor. */
function cosas(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.flatMap((x) => {
    if (typeof x === 'string') return claro(x) ? [claro(x) as string] : []
    if (!esObjeto(x)) return []
    const t = [claro(x.descripcion) ?? claro(x.clase), [claro(x.marca), claro(x.modelo)].filter(Boolean).join(' ') || null]
      .filter(Boolean)
      .join(' · ')
    return t ? [t] : []
  })
  return out.length > 0 ? out : null
}

function personaDe(v: unknown, descifrar: DescifrarFigura | undefined): FiguraFicha | null {
  if (!esObjeto(v)) return null
  return figuraDeCima({ papel: 'asegurado', ...v }, descifrar)
}

/** El bloque de vida/decesos de la póliza: arriba, o en el primer `riesgos[]` que lo traiga. */
function bloque(datos: Record<string, unknown>, clave: 'vida' | 'decesos'): Record<string, unknown> | null {
  if (esObjeto(datos[clave])) return datos[clave] as Record<string, unknown>
  if (!Array.isArray(datos.riesgos)) return null
  for (const r of datos.riesgos) if (esObjeto(r) && esObjeto(r[clave])) return r[clave] as Record<string, unknown>
  return null
}

/** `datos_especificos.vida` → `VidaFicha`, o `null` si no hay bloque o no dice nada. */
export function vidaDePoliza(datos: unknown, descifrar?: DescifrarFigura): VidaFicha | null {
  if (!esObjeto(datos)) return null
  const b = bloque(datos, 'vida')
  if (!b) return null
  const v = {
    persona: personaDe(b.persona, descifrar),
    idAplicacion: claro(b.idAplicacion, 60),
    idEmpleado: claro(b.idEmpleado, 60),
    convenio: claro(b.convenio, 60),
    claseSeguro: claro(b.claseSeguro, 30),
    edadJubilacion: claro(b.edadJubilacion, 10),
    prestamo: prestamoDe(b.prestamo),
    maquinas: cosas(b.maquinas),
    vehiculos: cosas(b.vehiculos),
  } as VidaFicha
  for (const [k] of ACTIVIDADES_VIDA) v[k] = bool(b[k])
  return Object.values(v).some((x) => x !== null) ? v : null
}

/** `datos_especificos.decesos` → `DecesosFicha`, o `null`. */
export function decesosDePoliza(datos: unknown, descifrar?: DescifrarFigura): DecesosFicha | null {
  if (!esObjeto(datos)) return null
  const b = bloque(datos, 'decesos')
  if (!b) return null
  const d: DecesosFicha = {
    persona: personaDe(b.persona, descifrar),
    idAplicacion: claro(b.idAplicacion, 60),
    idEmpleado: claro(b.idEmpleado, 60),
    modalidad: claro(b.modalidad),
  }
  return Object.values(d).some((x) => x !== null) ? d : null
}

/** Las tres cosas de personas de una póliza, de una vez (lo que sirve `/api/operador/poliza` como `personas`). */
export function personasDePoliza(datos: unknown, descifrar?: DescifrarFigura): PersonasPoliza {
  return {
    figuras: figurasDePoliza(datos, descifrar),
    vida: vidaDePoliza(datos, descifrar),
    decesos: decesosDePoliza(datos, descifrar),
  }
}

// ─── Para pintar ────────────────────────────────────────────────────────────

/** «Calle Socorro 24, 41003 Sevilla (Sevilla)». La provincia en código (tabla 12.1 = prefijo del CP) se traduce. `null` si no hay nada. */
export function textoDomicilio(d: DomicilioCimaFigura | null): string | null {
  if (!d) return null
  const calle = [d.claseVia, d.direccion].filter(Boolean).join(' ') || null
  const prov = d.provincia && /^\d{1,2}$/.test(d.provincia) ? provinciaPorCp(d.provincia.padStart(2, '0')) : d.provincia
  const lugar = [d.cp, d.localidad].filter(Boolean).join(' ') || null
  const conProv = prov && prov !== d.localidad ? (lugar ? `${lugar} (${prov})` : prov) : lugar
  const pais = d.pais && d.pais.toUpperCase() !== 'ESP' ? d.pais : null
  const t = [calle, conProv, pais].filter(Boolean).join(', ')
  return t === '' ? null : t
}

/** «Orden 1 · 50%». `null` si no es beneficiario o no trae nada. */
export function textoBeneficiario(f: Pick<FiguraFicha, 'orden' | 'porcentaje'>): string | null {
  const pct = f.porcentaje ? `${f.porcentaje.replace('.', ',').replace(/,0+$/, '')}%` : null
  const t = [f.orden ? `Orden ${f.orden}` : null, pct].filter(Boolean).join(' · ')
  return t === '' ? null : t
}

/** Las actividades de vida que constan (sí o no), en el orden de la norma. Las `null` no salen. */
export function actividadesVida(v: VidaFicha): { etiqueta: string; valor: boolean }[] {
  return ACTIVIDADES_VIDA.flatMap(([k, etiqueta]) => (v[k] === null ? [] : [{ etiqueta, valor: v[k] as boolean }]))
}

/**
 * «20 (unidad AN)». La unidad va CRUDA: `CLAVES_EIAC` no trae su tabla y no se traduce a ojo.
 * `null` si no consta la duración.
 */
export function textoDuracionPrestamo(p: PrestamoFicha): string | null {
  if (!p.duracion) return null
  return p.unidadDuracion ? `${p.duracion} (unidad ${p.unidadDuracion})` : p.duracion
}

/**
 * Lo que sirve el puerto como `personas` (`{ figuras, vida, decesos }`, ya en claro) → `PersonasPoliza`.
 * Para plataforma: sin clave, así que un `v1:` colado sale `null`. Asegura viejo (sin el campo) → todo `null`.
 */
export function leerPersonasPuerto(v: unknown): PersonasPoliza {
  if (!esObjeto(v)) return { figuras: null, vida: null, decesos: null }
  return {
    figuras: Array.isArray(v.figuras) ? figurasDePoliza({ figuras: v.figuras }) : null,
    vida: vidaDePoliza({ vida: v.vida }),
    decesos: decesosDePoliza({ decesos: v.decesos }),
  }
}

// Allianz ePAC AUTOS (turismo) y MOTO — EN CONSTRUCCIÓN (10/10/2026). NO está registrado en `adapters/index.ts`:
// nada de producción lo ejecuta (AUTO_ACTIVO = false). Ver docs/TARIFICADOR-RPA.md «Allianz Autos/Moto».
//
// Fuente: grabaciones del marcador del 08/10 (Auto: home + modal «Nueva Alta»; el formulario quedó en un iframe que
// el grabador NO pudo leer) y del 09/10 (Moto «Motos-online», iframe `appArea` legible: Riesgo municipio, Datos
// básicos, Tarificar, Referencia). Se asume que Turismos usa el MISMO framework legado que Moto (ids iguales):
// TODO(capturas) confirmarlo con la grabación del formulario de Turismos.
//
// MOTO, grabación del 13/10/2026 (14 pantallas, marcos legibles): ENTRADA Nueva Alta → Autos → Moto confirmada; formulario
// EDITABLE de «Riesgo municipio» (vehículo en CASCADA marca → clase → modelo → versión, SIN búsqueda por matrícula; CP con
// buscador de poblaciones; ¿tomador es conductor/propietario?) y de «Datos básicos» (uso, conductor, sexo, matrícula que
// autorrellena la 1ª matriculación, antecedentes); pantalla de ERROR («INFORME DE AVISO E INCIDENCIAS»). Todo lo de Moto está
// en la sección «MOTO» de este fichero. Lo que FALTA (ver docs/TARIFICADOR-MATRIZ.md 0b): el buscador de poblaciones tras
// pulsar la lupa, el avance entre pestañas (usa `aceptar_onclick()`, que el guard rechaza) y qué campos son obligatorios.
//
// Flujo: login → «Nueva Alta» → sección Autos → tarjeta (Turismos | Moto) → consulta por MATRÍCULA (el portal rellena
// marca/modelo/versión) → vehículo canónico (si hay varias versiones: requiere_humano con las opciones) → Datos básicos
// del conductor → [HUECO] avance a Tarificar → lector de primas (hecho, puro).
//
// SEGURIDAD: el robot NUNCA emite ni contrata. Aquí no hay selectores ni lógica para td#store «Archivar»,
// td#contract «Emitir», el botón del pie de Tarificar (validar_…) ni IPID: los bloquea `guard-emision.ts`. El avance de
// pestaña de esta app usa el handler de «Aceptar», que `ctx.pulsar()` rechaza: hará falta una función guardada por
// FASE en guard.ts (como la de Comunidades) — por eso el avance es un HUECO declarado. La matrícula es dato personal:
// solo se escribe en su campo; nunca en logs, trazas ni mensajes. Sin credenciales en el código.

import type { Frame, Locator, Page } from 'playwright'
import {
  comprobarBoton,
  esOpcionVacia,
  fechaIsoDesdeTexto,
  importeEs,
  mensajeEleccionVersion,
  redactarDatosPersonales,
  vehiculoDesdeLectura,
  type CandidatoVersion,
  type FormularioAuto,
  type LecturaVehiculoPortal,
  type OfertaNormalizada,
  type SeleccionVehiculo,
  type Vehiculo,
} from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { abrirNuevaAlta, TARJETA_AUTOS } from './entrada.ts'
import { fechaEs, login, marcoCon, sesionSirve } from './comunidades.ts'

/** Flag de registro: apagado por defecto. Nada lo enciende en producción. */
export const AUTO_ACTIVO = false

/** Hueco declarado: falta un mapa de pantalla. NO transitorio → `error_definitivo`, no se reintenta. */
export class ErrorMapaIncompleto extends ErrorTarificador {
  constructor(que: string) {
    super('portal', `allianz/auto: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaIncompleto'
  }
}

/**
 * El catálogo ofrece varias versiones y nadie ha elegido: para y pide una persona (`requiere_humano`; en el cable
 * viaja como `captcha`, igual que la verificación humana). El mensaje lleva SOLO nombres de catálogo.
 */
export class ErrorEleccionVersion extends ErrorTarificador {
  readonly opciones: CandidatoVersion[]
  constructor(opciones: CandidatoVersion[]) {
    super('captcha', mensajeEleccionVersion(opciones))
    this.name = 'ErrorEleccionVersion'
    this.opciones = opciones
  }
}

// ───────────────────────── selectores (mapa Moto 09/10/2026) ─────────────────────────

/** Ids estables de la app de vehículos (iframe `appArea`). */
export const SEL_VEHICULO = {
  /** Dispara la consulta por matrícula del portal en su `change`. */
  matricula: '#licensePlate',
  marca: '#marca',
  clase: '#clase',
  modelo: '#modelo',
  version: '#version',
  /** Texto de la versión elegida y potencia (solo lectura). */
  modeloVersion: '#modelVersion',
  potencia: '#motorPower',
  fechaMatriculacion: '#fechaMatriculacion',
  /** Hidden con el código del vehículo en el catálogo de Allianz. */
  codigoCatalogo: '#mobileCode',
} as const

export const SEL_DATOS_BASICOS = {
  codigoPostal: '#_cpostalCode',
  conductorNacimiento: '#driverBirthDate',
  conductorCarne: '#driverLicenseDate',
  conductorSexo: '#driverSex',
  garajeNoche: '#garageNight',
  aniosCompaniaAnterior: '#yearsOrigCompany',
  siniestros: '#numDisasters',
} as const

// ───────────────────────── guard de los CAMBIOS de campo ─────────────────────────

/**
 * Antes de CUALQUIER cambio en un control del portal (`fill` + `change`, `selectOption`, `setChecked`): sus
 * manejadores (`onchange`, `onclick`, `oninput`…) y su identidad pasan por el guard de emisión. Un cambio dispara el
 * JavaScript del portal igual que un clic: si ese manejador archiva/emite/avanza, se para ANTES de tocar nada.
 */
export async function comprobarCampo(campo: Locator): Promise<void> {
  // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
  const desc = await campo.evaluate(
    (el, attrs) => {
      const h = el as HTMLElement & { name?: unknown }
      return [h.id || null, typeof h.name === 'string' ? h.name : null, ...attrs.map((n) => h.getAttribute(n))]
    },
    ATRIBUTOS_CAMPO,
  )
  comprobarBoton(desc)
}

/** Lo que describe un control antes de cambiarlo: etiquetas y TODOS los manejadores que un cambio puede disparar. */
const ATRIBUTOS_CAMPO = ['aria-label', 'title', 'onchange', 'onclick', 'oninput', 'onblur', 'onfocus', 'onfocusout', 'onkeydown', 'onkeyup', 'onkeypress', 'onmousedown', 'onmouseup', 'formaction']

// ───────────────────────── consulta por matrícula → vehículo ─────────────────────────

/** Lee lo que el portal dejó tras la consulta (solo lectura). Un campo que no está → `null`. */
export async function leerVehiculoPortal(raiz: Pick<Frame, 'locator'>): Promise<LecturaVehiculoPortal> {
  const valor = async (sel: string) => {
    const l = raiz.locator(sel).first()
    if ((await l.count()) === 0) return null
    const v = await l.inputValue({ timeout: 1_000 }).catch(() => null)
    return v === null || v.trim() === '' ? null : v.trim()
  }
  const select = async (sel: string) => {
    const l = raiz.locator(sel).first()
    if ((await l.count()) === 0) return { elegida: null as CandidatoVersion | null, opciones: [] as CandidatoVersion[] }
    return l.evaluate((el) => {
      const s = el as HTMLSelectElement
      const opciones = Array.from(s.options).map((o) => ({ etiqueta: (o.textContent ?? '').trim(), codigo: o.value || null }))
      const o = s.selectedIndex >= 0 ? s.options[s.selectedIndex] : null
      const elegida = o && o.value ? { etiqueta: (o.textContent ?? '').trim(), codigo: o.value } : null
      return { elegida, opciones }
    })
  }
  const marca = await select(SEL_VEHICULO.marca)
  const modelo = await select(SEL_VEHICULO.modelo)
  const version = await select(SEL_VEHICULO.version)
  return {
    marca: marca.elegida?.etiqueta ?? null,
    modelo: modelo.elegida?.etiqueta ?? null,
    versionSeleccionada: version.elegida,
    versiones: version.opciones,
    // TODO(capturas): Moto no enseña combustible; en Turismos está por ver. Sin campo → null (no se deduce).
    combustible: null,
    potencia: await valor(SEL_VEHICULO.potencia),
    // TODO(capturas): unidad de `motorPower` sin confirmar (en Moto parece CV): sin unidad no se asume.
    unidadPotencia: null,
    fechaMatriculacion: await valor(SEL_VEHICULO.fechaMatriculacion),
    codigoCatalogo: await valor(SEL_VEHICULO.codigoCatalogo),
  }
}

/**
 * Teclea la matrícula (solo `fill` + evento `change`, que es lo que lanza la consulta del portal) y espera a que el
 * catálogo responda con marca y modelo. La matrícula no se escribe en ningún log.
 */
export async function consultarMatricula(raiz: Pick<Frame, 'locator'>, matricula: string, page: Pick<Page, 'waitForTimeout'>, timeoutMs = 20_000): Promise<LecturaVehiculoPortal> {
  const campo = raiz.locator(SEL_VEHICULO.matricula).first()
  if ((await campo.count()) === 0) throw new ErrorTarificador('portal', 'allianz/auto: no aparece el campo de matrícula')
  await comprobarCampo(campo)
  await campo.fill(matricula)
  await campo.dispatchEvent('change')
  const fin = Date.now() + timeoutMs
  for (;;) {
    const l = await leerVehiculoPortal(raiz)
    // El catálogo puede rellenar marca/modelo antes que las versiones: se espera a tener alguna versión.
    const conVersion = l.versionSeleccionada !== null || l.versiones.some((v) => !esOpcionVacia(v.etiqueta))
    if (l.marca && l.modelo && conVersion) return l
    if (Date.now() >= fin) {
      if (l.marca && l.modelo) return l
      throw new ErrorTarificador('datos', 'allianz/auto: la consulta por matrícula no devolvió marca y modelo')
    }
    await page.waitForTimeout(500)
  }
}

/**
 * Lectura → vehículo canónico, o para. Varias versiones sin elección → `ErrorEleccionVersion` (requiere_humano);
 * sin marca/modelo/versión → error `datos`. La versión resuelta se deja FIJADA en el `<select>` nativo por el código
 * de SU opción (nunca por el hidden `mobileCode`, que refleja lo que el portal tenía antes, ni por parecido); después se
 * RELEE el desplegable y, si no tiene ese código, se aborta (`portal`): el resultado nunca anuncia una versión que el
 * portal no tiene puesta.
 */
export async function resolverVehiculo(raiz: Pick<Frame, 'locator'>, lectura: LecturaVehiculoPortal, form: Pick<FormularioAuto, 'eleccionVersion'>): Promise<Vehiculo> {
  const r = vehiculoDesdeLectura(lectura, form.eleccionVersion ?? null)
  if (r.tipo === 'ambigua') throw new ErrorEleccionVersion(r.opciones)
  if (r.tipo === 'incompleto') throw new ErrorTarificador('datos', `allianz/auto: el portal no da ${r.faltan.join(', ')} del vehículo`)
  const codigo = r.opcion.codigo
  const select = raiz.locator(SEL_VEHICULO.version).first()
  if ((await select.count()) === 0) throw new ErrorTarificador('portal', 'allianz/auto: no aparece el desplegable de versión')
  if (!codigo) throw new ErrorTarificador('portal', 'allianz/auto: la versión resuelta no tiene código en el desplegable: no se puede fijar')
  if ((await select.inputValue()) !== codigo) {
    await comprobarCampo(select)
    await select.selectOption(codigo)
  }
  if ((await select.inputValue()) !== codigo) throw new ErrorTarificador('portal', 'allianz/auto: el portal no dejó fijada la versión resuelta')
  return r.vehiculo
}

// ───────────────────────── Datos básicos (conductor) ─────────────────────────

/** Plan de escritura de Datos básicos: [selector, valor] en orden. Puro. Lo que no consta no se escribe. */
export function planDatosBasicos(f: FormularioAuto): Array<readonly [string, string]> {
  const plan: Array<readonly [string, string]> = [
    [SEL_DATOS_BASICOS.codigoPostal, f.codigoPostal],
    [SEL_DATOS_BASICOS.conductorNacimiento, fechaEs(f.conductor.fechaNacimiento)],
    [SEL_DATOS_BASICOS.conductorCarne, fechaEs(f.conductor.fechaCarne)],
  ]
  if (f.siniestrosUltimos5Anios !== null) plan.push([SEL_DATOS_BASICOS.siniestros, String(f.siniestrosUltimos5Anios)])
  // TODO(capturas): valores de `driverSex`, `yearsOrigCompany` y `use` (desplegables) sin ver las opciones: no se tocan.
  return plan
}

export async function rellenarDatosBasicos(raiz: Pick<Frame, 'locator'>, f: FormularioAuto): Promise<void> {
  for (const [sel, valor] of planDatosBasicos(f)) {
    const campo = raiz.locator(sel).first()
    if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/auto: no aparece el campo ${sel} de Datos básicos`)
    await comprobarCampo(campo)
    await campo.fill(valor)
    await campo.dispatchEvent('change')
  }
  if (f.garajeNoche !== null) {
    const g = raiz.locator(SEL_DATOS_BASICOS.garajeNoche).first()
    if ((await g.count()) > 0) {
      await comprobarCampo(g)
      await g.setChecked(f.garajeNoche)
    }
  }
}

/**
 * HUECO: el avance entre pestañas necesita su función guardada por FASE (guard.ts). Grabación 13/10/2026: AMBOS avances
 * hacia delante (`td#datosBasicos` desde Riesgo municipio y `td#rate` desde Datos básicos) ejecutan `aceptar_onclick()`, el
 * mismo manejador que «Aceptar» y que `ctx.pulsar()` rechaza; el viaje de vuelta (`sendViewEvent`) no lo usa. Hasta que
 * guard.ts tenga esa función NO se pulsa nada. No toca guard.ts ni lo relaja.
 */
export async function avanzarPestanaGuardada(_page: Page, _ctx: ContextoPortal, destino: 'datosBasicos' | 'tarificar'): Promise<void> {
  throw new ErrorMapaIncompleto(
    destino === 'datosBasicos'
      ? 'el avance guardado por fase de Riesgo municipio a Datos básicos (td#datosBasicos, manejador de avance con confirmación)'
      : 'el avance guardado por fase de Datos básicos a Tarificar (td#rate, manejador de avance con confirmación)',
  )
}

/** HUECO: el avance de Riesgo municipio / Datos básicos a Tarificar (Turismos y compatibilidad). */
export async function avanzarATarificarAutos(page: Page, ctx: ContextoPortal): Promise<never> {
  await avanzarPestanaGuardada(page, ctx, 'tarificar')
  throw new ErrorMapaIncompleto('el avance guardado por fase a Tarificar (pantallas editables de Riesgo municipio y Datos básicos ANTES de calcular)')
}

// ───────────────────────── lector de primas de Tarificar (puro) ─────────────────────────

/**
 * Tabla «PRECIOS MODALIDADES»: una columna por modalidad (`input[name=numModality]`, id `modality_<m>`, etiqueta debajo)
 * y, por forma de pago, celdas `td#<m>_<F|B>_<A|S|T>_<fila>_0` (fila 0 = primer recibo, 1 = sucesivos). Se lee el
 * recibo BANCARIO anual (`B_A`). Una modalidad que el portal no ofrece no trae celda («--»): no es oferta.
 */
export type PrimaModalidad = { modalidad: string; nombre: string; primerReciboEur: number; sucesivosEur: number | null }

export function idCeldaPrima(modalidad: string, fila: 0 | 1, medio: 'F' | 'B' = 'B', periodo: 'A' | 'S' | 'T' = 'A'): string {
  return `${modalidad}_${medio}_${periodo}_${fila}_0`
}

/**
 * Celdas leídas (id → texto) + modalidades (código → nombre) → primas. Fail-closed: ninguna modalidad con primer
 * recibo legible y > 0 → error `portal` (nunca 0 ni «lo más parecido»); un primer recibo presente pero ilegible → error.
 */
export function primasDesdeCeldas(celdas: Readonly<Record<string, string>>, modalidades: ReadonlyArray<{ modalidad: string; nombre: string }>): PrimaModalidad[] {
  const out: PrimaModalidad[] = []
  for (const m of modalidades) {
    const t0 = celdas[idCeldaPrima(m.modalidad, 0)]
    if (t0 === undefined || /^\s*-*\s*$/.test(t0)) continue
    const p0 = importeEs(t0)
    if (p0 === null || !(p0 > 0)) throw new ErrorTarificador('portal', `allianz/auto: prima ilegible en la modalidad «${m.nombre}»`)
    const t1 = celdas[idCeldaPrima(m.modalidad, 1)]
    const p1 = t1 === undefined ? null : importeEs(t1)
    out.push({ modalidad: m.modalidad, nombre: m.nombre.replace(/\s+/g, ' ').trim(), primerReciboEur: p0, sucesivosEur: p1 !== null && p1 > 0 ? p1 : null })
  }
  if (out.length === 0) throw new ErrorTarificador('portal', 'allianz/auto: la tabla de precios no trae ninguna modalidad con prima')
  return out
}

/** Lee la tabla de precios de la pestaña Tarificar ya calculada. Solo lectura. */
export async function leerPrimasTarificar(raiz: Pick<Frame, 'locator'>): Promise<PrimaModalidad[]> {
  const modalidades = await raiz.locator('input[name="numModality"]').evaluateAll((els) =>
    els.map((e) => ({
      modalidad: (e.id || '').replace(/^modality_/, ''),
      nombre: (e.closest('table')?.querySelector('label')?.textContent ?? '').trim(),
    })),
  )
  const celdas = await raiz.locator('td[id$="_B_A_0_0"], td[id$="_B_A_1_0"]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.id, (e.textContent ?? '').trim()])))
  return primasDesdeCeldas(celdas, modalidades.filter((m) => m.modalidad !== ''))
}

/** Primas → ofertas normalizadas (una por modalidad). */
export function ofertasDesdePrimas(primas: readonly PrimaModalidad[], producto: string, vehiculo: Vehiculo | null): OfertaNormalizada[] {
  return primas.map((p) => ({
    compania: 'allianz',
    producto: `${producto} · ${p.nombre}`,
    primaAnualEur: p.primerReciboEur,
    primaNetaEur: null,
    fraccionamiento: 'anual',
    importeReciboEur: p.primerReciboEur,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: null,
    pdf: null,
    desglose: { anual: { primaNetaEur: null, impuestosEur: null, primaTotalEur: p.primerReciboEur }, sucesivos: { primaNetaEur: null, impuestosEur: null, primaTotalEur: p.sucesivosEur } },
    avisos: [
      'Importe del primer recibo anual (recibo bancario) de la tabla «PRECIOS MODALIDADES»; sin desglose neta/impuestos.',
      ...(vehiculo ? [`Vehículo según el catálogo de Allianz: ${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.version}.`] : []),
    ],
  }))
}

// ───────────────────────── MOTO: formulario editable (grabación 13/10/2026) ─────────────────────────
// Orden real del portal: «Riesgo municipio» (vehículo en CASCADA marca → clase → modelo → versión, CP con buscador de
// poblaciones, ¿tomador es conductor/propietario?) → «Datos básicos» (uso, conductor, matrícula, antecedentes) → «Tarificar».
// La matrícula NO elige el vehículo en Moto: solo autorrellena la 1ª matriculación (campo bloqueado) y es «obligatoria para
// emisión», no para tarificar. Ningún valor de este bloque es de una persona: selectores, códigos de catálogo y literales.

/** «Riesgo municipio» editable. */
export const SEL_RIESGO_MOTO = {
  marca: '#marca',
  /** Tramo de cilindrada: «1.Hasta 125 c.c.» · «2.Hasta 350 c.c.» · «3.De 351 c.c. hasta 750 c.c.» · «4.Mas de 750 c.c.». */
  clase: '#clase',
  modelo: '#modelo',
  version: '#version',
  codigoPostal: '#_cpostalCode',
  /** Población: la rellena el buscador (Datos básicos la enseña bloqueada en `#cpPoblacion`). */
  poblacion: '#_destown',
  /** Lupa del buscador de poblaciones: `<img onclick="sendRequestLocationFinder(...)">`. */
  buscarPoblacion: '#_cpostalCodeAjaxLocFinderImg',
  tomadorEsConductor: '#takerDriver',
  tomadorEsPropietario: '#takerOwner',
} as const

/** «Datos básicos» editable. Valores de los desplegables = los del portal (grabación 13/10/2026). */
export const SEL_DATOS_MOTO = {
  uso: '#use',
  conductorNacimiento: '#driverBirthDate',
  conductorCarne: '#driverLicenseDate',
  conductorSexo: '#driverSex',
  matricula: '#licensePlate',
  /** Bloqueado (`disabled`) tras la consulta por matrícula: solo lectura. */
  fechaMatriculacion: '#fechaMatriculacion',
  garajeNoche: '#garageNight',
  aseguradoOtraCia: '#aseguradoOtraCia',
  aniosCompaniaAnterior: '#yearsOrigCompany',
  aniosSinSiniestros: '#aniosSinSiniestros',
  /** Se bloquea solo cuando «años sin siniestros» = 5: no se escribe. */
  siniestros: '#numDisasters',
} as const

/** Valores del portal. `driverSex`: V = Hombre · H = Mujer (sin opción vacía: el portal asume Hombre si no se toca). */
export const SEXO_PORTAL = { hombre: 'V', mujer: 'H' } as const
export const USO_PARTICULAR = '1'
/** `yearsOrigCompany`: 0-5 y «6» = «Más de 5». */
export const ANIOS_MAS_DE_5 = '6'

/** Informe de aviso e incidencias («INFORME DE AVISO E INCIDENCIAS»): filas de error y filas informativas. */
export const SEL_INCIDENCIAS = 'tr.rowAppErrorTextBlock, tr.rowAppErrorInfoTextBlock'

// ── desplegables en cascada ──

export type OpcionSelect = { valor: string; etiqueta: string }

const claveCatalogo = (s: string) => s.replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Valor de la ÚNICA opción cuya etiqueta es igual (salvo mayúsculas/tildes/espacios). Ninguna o varias → `null` (nunca «la parecida»). */
export function valorOpcionExacta(opciones: readonly OpcionSelect[], buscada: string): string | null {
  const k = claveCatalogo(buscada)
  if (k === '') return null
  const casan = opciones.filter((o) => !esOpcionVacia(o.etiqueta) && claveCatalogo(o.etiqueta) === k)
  return casan.length === 1 ? casan[0].valor : null
}

/** Valor de la opción de `#clase` cuya etiqueta empieza por «<n>.» (tramo de cilindrada 1-4). */
export function valorClaseMoto(opciones: readonly OpcionSelect[], clase: number): string | null {
  const casan = opciones.filter((o) => o.etiqueta.trim().startsWith(`${clase}.`))
  return casan.length === 1 ? casan[0].valor : null
}

async function leerSelect(raiz: Pick<Frame, 'locator'>, sel: string) {
  const l = raiz.locator(sel).first()
  if ((await l.count()) === 0) return null
  return l.evaluate((el) => {
    const s = el as HTMLSelectElement
    return { deshabilitado: s.disabled, valor: s.value, opciones: Array.from(s.options).map((o) => ({ valor: o.value, etiqueta: (o.textContent ?? '').trim() })) }
  })
}

/**
 * Espera a que el desplegable esté habilitado y con opciones, elige UNA con `elegir` (valor o `null` = no está en el
 * catálogo → error `datos`), la fija y relee: si el portal no la dejó puesta, aborta (`portal`).
 */
async function elegirOpcion(raiz: Pick<Frame, 'locator'>, sel: string, que: string, elegir: (o: readonly OpcionSelect[]) => string | null, page: Pick<Page, 'waitForTimeout'>, timeoutMs = 15_000): Promise<void> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    const s = await leerSelect(raiz, sel)
    if (!s) throw new ErrorTarificador('portal', `allianz/auto: no aparece el desplegable de ${que}`)
    if (!s.deshabilitado && s.opciones.some((o) => !esOpcionVacia(o.etiqueta))) {
      const v = elegir(s.opciones)
      if (v === null) throw new ErrorTarificador('datos', `allianz/auto: ${que} no está (o está repetido) en el catálogo del portal`)
      const campo = raiz.locator(sel).first()
      if (s.valor !== v) {
        await comprobarCampo(campo)
        await campo.selectOption(v)
      }
      if ((await campo.inputValue()) !== v) throw new ErrorTarificador('portal', `allianz/auto: el portal no dejó fijado el desplegable de ${que}`)
      return
    }
    if (Date.now() >= fin) throw new ErrorTarificador('portal', `allianz/auto: el desplegable de ${que} no se llenó a tiempo`)
    await page.waitForTimeout(300)
  }
}

/**
 * Riesgo municipio: marca → clase → modelo, cada uno por su etiqueta EXACTA, y espera a que el portal ofrezca versiones.
 * La versión la resuelve después `resolverVehiculo` (una sola → ok; varias sin elección → requiere_humano).
 */
export async function elegirVehiculoMoto(raiz: Pick<Frame, 'locator'>, sel: SeleccionVehiculo, page: Pick<Page, 'waitForTimeout'>): Promise<void> {
  if (sel.clase == null) throw new ErrorTarificador('datos', 'allianz/moto: falta la clase (tramo de cilindrada 1-4) de la moto')
  await elegirOpcion(raiz, SEL_RIESGO_MOTO.marca, 'la marca', (o) => valorOpcionExacta(o, sel.marca), page)
  await elegirOpcion(raiz, SEL_RIESGO_MOTO.clase, 'la clase', (o) => valorClaseMoto(o, sel.clase as number), page)
  await elegirOpcion(raiz, SEL_RIESGO_MOTO.modelo, 'el modelo', (o) => valorOpcionExacta(o, sel.modelo), page)
  // Versiones: esperar a que haya alguna; no se elige aquí.
  const fin = Date.now() + 15_000
  for (;;) {
    const v = await leerSelect(raiz, SEL_RIESGO_MOTO.version)
    if (!v) throw new ErrorTarificador('portal', 'allianz/auto: no aparece el desplegable de versión')
    if (v.opciones.some((o) => !esOpcionVacia(o.etiqueta))) return
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'allianz/moto: el portal no ofreció ninguna versión para ese modelo')
    await page.waitForTimeout(300)
  }
}

// ── Riesgo municipio: población y titulares ──

/**
 * CP → buscador de poblaciones: se teclea el CP y se pulsa la LUPA con `ctx.pulsar` (no Enter: el Enter de un campo de un
 * formulario legado puede enviarlo). Si el portal no rellena la población, no se sigue: la pantalla del buscador (varias
 * poblaciones por CP) NO está grabada → hueco declarado, no se adivina.
 */
export async function buscarPoblacion(raiz: Pick<Frame, 'locator'>, codigoPostal: string, page: Pick<Page, 'waitForTimeout'>, ctx: Pick<ContextoPortal, 'pulsar'>, timeoutMs = 10_000): Promise<void> {
  const cp = raiz.locator(SEL_RIESGO_MOTO.codigoPostal).first()
  const lupa = raiz.locator(SEL_RIESGO_MOTO.buscarPoblacion).first()
  if ((await cp.count()) === 0 || (await lupa.count()) === 0) throw new ErrorTarificador('portal', 'allianz/moto: no aparece el buscador de poblaciones')
  await comprobarCampo(cp)
  await cp.fill(codigoPostal)
  await ctx.pulsar(lupa)
  const fin = Date.now() + timeoutMs
  for (;;) {
    const v = await raiz.locator(SEL_RIESGO_MOTO.poblacion).first().inputValue({ timeout: 1_000 }).catch(() => '')
    if (v.trim() !== '') return
    if (Date.now() >= fin) throw new ErrorMapaIncompleto('la pantalla del buscador de poblaciones (el CP no dejó la población rellena: varias poblaciones o ventana emergente sin grabar)')
    await page.waitForTimeout(300)
  }
}

/** ¿Tomador = conductor = propietario? `false` pide el NIF del otro (`#idNifDriver_doc`/`#idNifOwner_doc`): sin mapa → hueco. */
export function comprobarTitularesMoto(f: Pick<FormularioAuto, 'tomadorEsConductor' | 'tomadorEsPropietario'>): void {
  if (f.tomadorEsConductor === false || f.tomadorEsPropietario === false) {
    throw new ErrorMapaIncompleto('el NIF del conductor/propietario distinto del tomador (campos idNifDriver_doc/idNifOwner_doc, sin mapa de qué exige el portal)')
  }
}

export async function rellenarRiesgoMoto(raiz: Pick<Frame, 'locator'>, f: FormularioAuto, page: Pick<Page, 'waitForTimeout'>, ctx: Pick<ContextoPortal, 'pulsar'>): Promise<void> {
  comprobarTitularesMoto(f)
  await buscarPoblacion(raiz, f.codigoPostal, page, ctx)
  for (const [sel, dato] of [[SEL_RIESGO_MOTO.tomadorEsConductor, f.tomadorEsConductor], [SEL_RIESGO_MOTO.tomadorEsPropietario, f.tomadorEsPropietario]] as const) {
    if (dato !== true) continue // null = no consta: no se toca
    await fijarSelect(raiz, sel, 'S')
  }
}

async function fijarSelect(raiz: Pick<Frame, 'locator'>, sel: string, valor: string): Promise<void> {
  const campo = raiz.locator(sel).first()
  if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/moto: no aparece el campo ${sel}`)
  await comprobarCampo(campo)
  await campo.selectOption(valor)
  if ((await campo.inputValue()) !== valor) throw new ErrorTarificador('portal', `allianz/moto: el portal no dejó fijado ${sel}`)
}

// ── Datos básicos ──

export type OperacionCampo = { sel: string; tipo: 'texto' | 'select' | 'casilla'; valor: string | boolean }

/**
 * Plan de escritura de Datos básicos de MOTO. Puro. FAIL-CLOSED: el portal NO tiene «sin dato» en sexo ni en
 * antecedentes (asume Hombre / 0 años), así que si el formulario no los trae se para en vez de cotizar con un valor de cajón.
 *   · `aniosAseguradoAnterior` → «ha estado asegurado» (S si > 0) y `yearsOrigCompany` (0-5; más de 5 → «6»).
 *   · 0 siniestros en 5 años → `aniosSinSiniestros` = min(5, años asegurado): ASUNCIÓN (sin siniestros durante todo el
 *     tiempo asegurado); se relee y, si el portal lo cambia, aborta. Con siniestros > 0 → hueco (el portal pide «años sin
 *     siniestros» y «nº en el último año», que el formulario canónico no distingue).
 */
export function planDatosBasicosMoto(f: FormularioAuto): OperacionCampo[] {
  if (f.conductor.sexo === null) throw new ErrorTarificador('datos', 'allianz/moto: falta el sexo del conductor (el portal asumiría «Hombre»)')
  if (f.aniosAseguradoAnterior === null) throw new ErrorTarificador('datos', 'allianz/moto: falta la antigüedad en la compañía anterior (el portal asumiría 0 años)')
  if (f.siniestrosUltimos5Anios === null) throw new ErrorTarificador('datos', 'allianz/moto: faltan los siniestros de los últimos años (el portal asumiría ninguno)')
  if (f.siniestrosUltimos5Anios > 0) throw new ErrorMapaIncompleto('la traducción de siniestros > 0 a «años sin siniestros» y «nº de siniestros en el último año» de Antecedentes')
  const anios = f.aniosAseguradoAnterior
  const plan: OperacionCampo[] = [
    { sel: SEL_DATOS_MOTO.uso, tipo: 'select', valor: USO_PARTICULAR },
    { sel: SEL_DATOS_MOTO.conductorNacimiento, tipo: 'texto', valor: fechaEs(f.conductor.fechaNacimiento) },
    { sel: SEL_DATOS_MOTO.conductorCarne, tipo: 'texto', valor: fechaEs(f.conductor.fechaCarne) },
    { sel: SEL_DATOS_MOTO.conductorSexo, tipo: 'select', valor: SEXO_PORTAL[f.conductor.sexo] },
  ]
  if (f.garajeNoche !== null) plan.push({ sel: SEL_DATOS_MOTO.garajeNoche, tipo: 'casilla', valor: f.garajeNoche })
  plan.push(
    { sel: SEL_DATOS_MOTO.aseguradoOtraCia, tipo: 'select', valor: anios > 0 ? 'S' : 'N' },
    // Primero los años en la compañía (su onchange recalcula «años sin siniestros»), después estos.
    { sel: SEL_DATOS_MOTO.aniosCompaniaAnterior, tipo: 'select', valor: anios > 5 ? ANIOS_MAS_DE_5 : String(anios) },
    { sel: SEL_DATOS_MOTO.aniosSinSiniestros, tipo: 'select', valor: `0${Math.min(5, anios)}` },
  )
  return plan
}

export async function rellenarDatosBasicosMoto(raiz: Pick<Frame, 'locator'>, f: FormularioAuto): Promise<void> {
  for (const op of planDatosBasicosMoto(f)) {
    const campo = raiz.locator(op.sel).first()
    if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/moto: no aparece el campo ${op.sel} de Datos básicos`)
    await comprobarCampo(campo)
    if (op.tipo === 'texto') {
      await campo.fill(String(op.valor))
      await campo.dispatchEvent('change')
    } else if (op.tipo === 'select') {
      await campo.selectOption(String(op.valor))
    } else {
      await comprobarCampo(campo)
      await campo.setChecked(op.valor === true)
    }
  }
  // Releer: los selects encadenados (años en la compañía → años sin siniestros) pueden revertirse.
  for (const op of planDatosBasicosMoto(f).filter((o) => o.tipo === 'select')) {
    if ((await raiz.locator(op.sel).first().inputValue()) !== op.valor) throw new ErrorTarificador('portal', `allianz/moto: el portal no dejó fijado ${op.sel}`)
  }
}

/**
 * Matrícula (solo `fill` + `change`; el manejador del portal es `eventoMatriculaDatosBasicos()`) → el portal autorrellena la
 * 1ª matriculación en un campo bloqueado. Devuelve esa fecha ISO. Sin fecha a tiempo → error `datos` (la antigüedad del
 * vehículo cambia el precio: no se cotiza sin ella). La matrícula no sale en ningún mensaje.
 */
export async function consultarMatriculaMoto(raiz: Pick<Frame, 'locator'>, matricula: string, page: Pick<Page, 'waitForTimeout'>, timeoutMs = 15_000): Promise<string> {
  const campo = raiz.locator(SEL_DATOS_MOTO.matricula).first()
  if ((await campo.count()) === 0) throw new ErrorTarificador('portal', 'allianz/moto: no aparece el campo de matrícula')
  await comprobarCampo(campo)
  await campo.fill(matricula)
  await campo.dispatchEvent('change')
  const fin = Date.now() + timeoutMs
  for (;;) {
    const t = await raiz.locator(SEL_DATOS_MOTO.fechaMatriculacion).first().inputValue({ timeout: 1_000 }).catch(() => '')
    const iso = fechaIsoDesdeTexto(t)
    if (iso) return iso
    if (Date.now() >= fin) throw new ErrorTarificador('datos', 'allianz/moto: la matrícula no devolvió la fecha de primera matriculación')
    await page.waitForTimeout(300)
  }
}

// ── pantalla de error («INFORME DE AVISO E INCIDENCIAS») ──

export type Incidencia = { tipo: 'error' | 'aviso'; /** Id del campo si el portal lo da. */ campo: string | null; mensaje: string }

/**
 * Una fila del informe → incidencia. Puro. Filas de error: `tr.rowAppErrorTextBlock` (celda 1 = «NN <b>campo</b>», celda 2 =
 * mensaje); informativas (p. ej. «Alerta — Proyecto archivado correctamente»): `tr.rowAppErrorInfoTextBlock`. El mensaje se
 * pasa por el redactor de datos personales (el portal podría repetir un valor tecleado) y se corta.
 */
export function incidenciaDesdeFila(clase: string, campoNegrita: string | null, mensaje: string): Incidencia | null {
  const tipo = /\browAppErrorInfoTextBlock\b/.test(clase) ? 'aviso' : /\browAppErrorTextBlock\b/.test(clase) ? 'error' : null
  if (!tipo) return null
  const c = (campoNegrita ?? '').trim()
  return { tipo, campo: /^[A-Za-z_][A-Za-z0-9_.]{0,39}$/.test(c) ? c : null, mensaje: redactarDatosPersonales(mensaje.replace(/\s+/g, ' ').trim()).slice(0, 200) }
}

export async function leerIncidencias(raiz: Pick<Frame, 'locator'>): Promise<Incidencia[]> {
  const filas = await raiz.locator(`#dataErrorSection ${SEL_INCIDENCIAS.replace(', ', ', #dataErrorSection ')}`).evaluateAll((els) =>
    els.map((e) => {
      const celdas = Array.from(e.querySelectorAll('td'))
      return { clase: e.className, campo: celdas[0]?.querySelector('b')?.textContent ?? null, mensaje: celdas[1]?.textContent ?? '' }
    }),
  )
  return filas.map((f) => incidenciaDesdeFila(f.clase, f.campo, f.mensaje)).filter((i): i is Incidencia => i !== null)
}

/** Hay errores de validación del portal → error `datos` con campo y mensaje saneados (nunca se avanza con ellos). */
export async function lanzarSiHayErrores(raiz: Pick<Frame, 'locator'>): Promise<void> {
  const errores = (await leerIncidencias(raiz)).filter((i) => i.tipo === 'error')
  if (errores.length === 0) return
  throw new ErrorTarificador('datos', `allianz/auto: el portal rechaza los datos: ${errores.map((e) => `${e.campo ? `[${e.campo}] ` : ''}${e.mensaje}`).join(' · ')}`)
}

/** Flujo MOTO hasta donde llega el mapa. Los pasos tras el primer avance están listos y probados, pero sin cablear a un avance real. */
async function tarificarMoto(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<never> {
  // Todo lo que se puede comprobar SIN tocar el portal, antes de abrirlo (fail-closed).
  if (!form.seleccionVehiculo) throw new ErrorTarificador('datos', 'allianz/moto: falta seleccionVehiculo (marca, modelo y clase): el portal de Moto no busca el vehículo por matrícula')
  if ((form.seleccionVehiculo.clase ?? null) === null) throw new ErrorTarificador('datos', 'allianz/moto: falta la clase (tramo de cilindrada 1-4) de la moto')
  comprobarTitularesMoto(form)
  planDatosBasicosMoto(form)
  if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
  await ctx.trasLogin()
  await abrirNuevaAlta(page, ctx, { pestana: 'Autos', producto: 'Moto', selectorTarjeta: TARJETA_AUTOS.moto })
  const riesgo = await marcoCon(page, (r) => r.locator(SEL_RIESGO_MOTO.marca), 'Riesgo municipio (marca)')
  await elegirVehiculoMoto(riesgo, form.seleccionVehiculo, page)
  const vehiculo = await resolverVehiculo(riesgo, await leerVehiculoPortal(riesgo), form)
  await ctx.pausa()
  await rellenarRiesgoMoto(riesgo, form, page, ctx)
  await lanzarSiHayErrores(riesgo)
  await ctx.pausa()
  await avanzarPestanaGuardada(page, ctx, 'datosBasicos') // HUECO: hoy lanza ErrorMapaIncompleto
  const datos = await marcoCon(page, (r) => r.locator(SEL_DATOS_MOTO.matricula), 'Datos básicos (matrícula)')
  const fechaMatriculacion = await consultarMatriculaMoto(datos, form.matricula, page)
  await rellenarDatosBasicosMoto(datos, form)
  await lanzarSiHayErrores(datos)
  void { ...vehiculo, fechaMatriculacion } // irá al resultado cuando exista el avance a Tarificar (leerPrimasTarificar → ofertasDesdePrimas)
  return avanzarATarificarAutos(page, ctx)
}

// ───────────────────────── flujo (con huecos) ─────────────────────────

function crearAdaptador(ramo: 'auto' | 'moto') {
  return {
    compania: 'allianz',
    ramo,
    credencial: 'ALLIANZ_EPAC',
    version: '0.1.0',
    async tarificar(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<never> {
      if (form.ramo !== ramo) throw new ErrorTarificador('datos', `allianz/${ramo}: el formulario es de ${form.ramo}`)
      if (ramo === 'moto') return tarificarMoto(page, form, ctx) // Moto: formulario real (grabación 13/10); Turismos sigue con el mapa SUPUESTO de abajo
      if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
      await ctx.trasLogin()
      await abrirNuevaAlta(page, ctx, { pestana: 'Autos', producto: 'Turismos', selectorTarjeta: TARJETA_AUTOS.turismos })
      const marco = await marcoCon(page, (r) => r.locator(SEL_VEHICULO.matricula), 'campo de matrícula')
      const lectura = await consultarMatricula(marco, form.matricula, page)
      await ctx.pausa()
      await resolverVehiculo(marco, lectura, form)
      await rellenarDatosBasicos(marco, form)
      await ctx.pausa()
      // Siguiente (cuando haya mapa): avance guardado → leerPrimasTarificar → ofertasDesdePrimas.
      return avanzarATarificarAutos(page, ctx)
    },
  } as const
}

export const allianzAuto = crearAdaptador('auto')
export const allianzMoto = crearAdaptador('moto')

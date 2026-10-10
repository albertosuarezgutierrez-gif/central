// Allianz ePAC AUTOS (turismo) y MOTO — EN CONSTRUCCIÓN (10/10/2026). NO está registrado en `adapters/index.ts`:
// nada de producción lo ejecuta (AUTO_ACTIVO = false). Ver docs/TARIFICADOR-RPA.md «Allianz Autos/Moto».
//
// Fuente: grabaciones del marcador del 08/10 (Auto: home + modal «Nueva Alta»; el formulario quedó en un iframe que
// el grabador NO pudo leer) y del 09/10 (Moto «Motos-online», iframe `appArea` legible: Riesgo municipio, Datos
// básicos, Tarificar, Referencia). Se asume que Turismos usa el MISMO framework legado que Moto (ids iguales):
// TODO(capturas) confirmarlo con la grabación del formulario de Turismos.
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
  importeEs,
  mensajeEleccionVersion,
  vehiculoDesdeLectura,
  type CandidatoVersion,
  type FormularioAuto,
  type LecturaVehiculoPortal,
  type OfertaNormalizada,
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

/** HUECO: el avance de Riesgo municipio / Datos básicos a Tarificar necesita su función guardada por fase (guard.ts). */
export async function avanzarATarificarAutos(_page: Page, _ctx: ContextoPortal): Promise<never> {
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

// ───────────────────────── flujo (con huecos) ─────────────────────────

function crearAdaptador(ramo: 'auto' | 'moto') {
  return {
    compania: 'allianz',
    ramo,
    credencial: 'ALLIANZ_EPAC',
    version: '0.1.0',
    async tarificar(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<never> {
      if (form.ramo !== ramo) throw new ErrorTarificador('datos', `allianz/${ramo}: el formulario es de ${form.ramo}`)
      if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
      await ctx.trasLogin()
      await abrirNuevaAlta(page, ctx, { pestana: 'Autos', producto: ramo === 'moto' ? 'Moto' : 'Turismos', selectorTarjeta: ramo === 'moto' ? TARJETA_AUTOS.moto : TARJETA_AUTOS.turismos })
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

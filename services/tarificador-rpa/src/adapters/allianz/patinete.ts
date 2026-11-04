// Allianz ePAC · «Movilidad Personal» (patinete / VMP) — adaptador de TARIFICACIÓN (03/11/2026, v0.1.0). APAGADO: `adapters/index.ts` lo
// registra SOLO con `ALLIANZ_PATINETE_ACTIVO` en `true` (hoy `false`; lo enciende Alberto). Apagado, un trabajo de patinete cae como
// `datos` («sin adaptador») sin abrir el navegador. Spec: docs/superpowers/specs/2026-11-03-solicitud-web-patinete.md (fase 1, Allianz).
//
// TARIFICAR ≠ EMITIR. Aquí no hay Guardar/Archivar/Emitir/Contratar/Pagar/IBAN. Nada de lo que se rellena sale al cliente.
//
// Fuente del mapa: las exploraciones IA reales de `allianz:autos:movilidad_personal` (28-31/10/2026, tabla
// `seguros.tarificador_exploraciones`; la que llegó más lejos, f6209c2d, 7 pasos). NINGUNA vio un precio. Lo visto:
//   · Entrada: Nueva Alta → acordeón «Autos» → tesela «Movilidad Personal» → servlet legado `/drvp00/` (misma familia que Moto, NO la app
//     Angular de Hogar). Menú lateral: «Datos Básicos» (`pDatosBasicos`) y «Riesgo» (`pDatosRiesgoVMP`).
//   · Pantalla 1 «Datos Básicos» (Póliza/Aplica · Datos Generales · Figuras Intervinientes): `DatosGeneralesBean$fechaEfecto/fechaTerm`,
//     recibos; `IntervinientesBean$nifTomador_tipoDoc`/`_doc`, radios «¿tomador es propietario?» (`esPropietario1/2`) y «¿es conductor?»
//     (`esConductor1/2`), propietario/conductor/2.º conductor (tipoDoc + doc); avance `#btnAceptar` (`eventoSiguiente()`).
//   · Pantalla 2 «Riesgo VMP» (Datos del Vehículo · Selección de Municipio · Tomador y Conductor Principal): `VMPBean$matricula`,
//     `VMPBean$marca` (select, 55 marcas), `VMPBean$modelo` (select dependiente de la marca), radios `VMPBean$uso1/2` (¿uso profesional?
//     Sí/No) y `VMPBean$homologado1/2` (¿homologado DGT? Sí/No), casillas `VMPBean$checkIva` («Incluir IVA») y `VMPBean$checkVMP`
//     («Confirmo que la velocidad del vehículo está limitada a 25 Km/h»), `MunicipioVMPBean$codigoPostal`/`poblacion`,
//     `ConductorVMPBean$fechaNaci`; avance «Aceptar» (`eventoSiguienteDialog()`, sin id).
//   · HALLAZGO: la exploración f6209c2d se quedó en BUCLE en esta pantalla (el «Aceptar» no avanzaba con marca/modelo/uso/homologado
//     bien puestos). Las dos casillas (`checkVMP`, `checkIva`) NUNCA se marcaron: el mapeo de la IA no las incluía. La hipótesis más
//     probable es que `checkVMP` es obligatoria; aquí se marca solo con la confirmación EXPLÍCITA del formulario (`velocidadLimitada25`).
//
// HUECOS DECLARADOS (→ `ErrorMapaIncompleto` con inventario de estructura, `pideInventarioDom`):
//   · EL AVANCE entre pantallas. El guard del worker (guard.ts) solo autoriza avances de la app Moto (`drpc18`: `td#datosBasicos`/`td#rate`);
//     el «Aceptar» de `/drvp00/` solo lo tiene autorizado el EXPLORADOR (`avancesPorId` de module-tarificacion/explorador.ts). Sin una regla
//     de guard para tarificar VMP el adaptador NO puede cruzar `btnAceptar` ni el «Aceptar» de Riesgo (se bloquearía como emisión). Falta
//     decidirlo y escribirlo en guard.ts (otro trabajo en curso lo toca; no se tocó aquí).
//   · El diálogo de municipio que abre `eventoSiguienteDialog()` (nunca se vio su contenido).
//   · LA PANTALLA DE PRECIO y la lectura de primas/coberturas: ninguna exploración llegó. `leerOfertasVmp` es el hueco; `ofertaVmp` ya
//     construye la `OfertaNormalizada` (pura, testeada) para cuando se vea la tabla.
//
// SEGURIDAD: cambiar un campo SOLO tras `comprobarCampo()` (manejadores + frontera de cuenta bancaria); aquí no se pulsa nada (ni `.click()`).
// Documento y fecha de nacimiento: solo en su campo; nunca en logs ni mensajes (los errores nombran el campo, no el valor).

import type { Frame, Locator, Page } from 'playwright'
import { type FormularioPatinete, type OfertaNormalizada, type ResultadoAdaptador } from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { campoConRespaldo } from '../../formador.ts'
import { comprobarCampo } from './auto.ts'
import { login, sesionSirve } from './comunidades.ts'
import { abrirNuevaAlta, fechaEs, marcoCon } from './intranet/index.ts'

/**
 * Flag de registro de Allianz PATINETE. APAGADO (03/11/2026): sin precio visto en ninguna exploración y sin avance autorizado en el guard.
 * Lo enciende Alberto cuando el adaptador llegue a precio. La puerta de BD es además la fila `seguros.companias_integracion`
 * allianz/patinete (2026-10-28b, apagada) y asegura no admite el ramo todavía (`companiaAdmiteRamoRpa`).
 */
export const ALLIANZ_PATINETE_ACTIVO = false

export const ADAPTADOR = 'allianz/patinete'
export const PESTANA_ENTRADA = 'Autos'
export const PRODUCTO_MENU = 'Movilidad Personal'
export const NOMBRE_PRODUCTO_OFERTA = 'Allianz Movilidad Personal (patinete)'

/** Hueco declarado: falta mapa o avance autorizado. NO transitorio. Pide el inventario de estructura (así se mapeará la pantalla). */
export class ErrorMapaIncompleto extends ErrorTarificador {
  readonly pideInventarioDom: boolean
  constructor(que: string, pideInventarioDom = true) {
    super('portal', `${ADAPTADOR}: mapa incompleto: faltan ${que}`)
    this.pideInventarioDom = pideInventarioDom
    this.name = 'ErrorMapaIncompleto'
  }
}

/** La marca o el modelo no se pueden casar de forma inequívoca con el catálogo del portal. Sin datos personales. `datos`: no se reintenta. */
export class ErrorEleccionVmp extends ErrorTarificador {
  constructor(que: string, readonly candidatas: readonly string[] = []) {
    super('datos', `${ADAPTADOR}: ${que}`)
    this.name = 'ErrorEleccionVmp'
  }
}

// ───────────────────────── selectores (ids VISTOS en las exploraciones; el `$` va entre comillas de atributo) ─────────────────────────

const porId = (id: string) => `[id="${id}"]`

export const SEL_INTERVINIENTES = {
  fechaEfecto: porId('DatosGeneralesBean$fechaEfecto'),
  tipoDocTomador: porId('IntervinientesBean$nifTomador_tipoDoc'),
  docTomador: porId('IntervinientesBean$nifTomador_doc'),
  propietarioSi: porId('IntervinientesBean$esPropietario1'),
  conductorSi: porId('IntervinientesBean$esConductor1'),
  docSegundoConductor: porId('IntervinientesBean$nifSegConductor_doc'),
} as const

export const SEL_RIESGO = {
  matricula: porId('VMPBean$matricula'),
  marca: porId('VMPBean$marca'),
  modelo: porId('VMPBean$modelo'),
  usoNo: porId('VMPBean$uso2'),
  usoSi: porId('VMPBean$uso1'),
  homologadoSi: porId('VMPBean$homologado1'),
  homologadoNo: porId('VMPBean$homologado2'),
  incluirIva: porId('VMPBean$checkIva'),
  velocidad25: porId('VMPBean$checkVMP'),
  codigoPostal: porId('MunicipioVMPBean$codigoPostal'),
  poblacion: porId('MunicipioVMPBean$poblacion'),
  nacimientoConductor: porId('ConductorVMPBean$fechaNaci'),
} as const

/** Texto que el desplegable «Tipo Doc. Tomador» tiene que ENSEÑAR para seguir (el robot no lo cambia: su lista no está vista). */
export const TIPO_DOCUMENTO_ESPERADO: Readonly<Record<'dni' | 'nie', readonly string[]>> = {
  dni: ['NIF', 'DNI', 'NIF/DNI', 'DNI/NIF'],
  nie: ['NIE'],
}

// ───────────────────────── puro: normalización y casado de opciones ─────────────────────────

/** MAYÚSCULAS, sin tildes, todo lo que no es letra/dígito pasa a un espacio. Pura. */
export function normalizaVmp(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

export type OpcionVmp = { valor: string; etiqueta: string }
export type CasadoVmp =
  | { tipo: 'unica'; opcion: OpcionVmp; /** `true` = casó quitando el código de homologación final del catálogo (se declara). */ aproximada: boolean }
  | { tipo: 'ambigua'; candidatas: OpcionVmp[] }
  | { tipo: 'ninguna' }

const esOpcionVacia = (o: OpcionVmp) => normalizaVmp(o.etiqueta) === '' || /^(SELECCION|ELIJA|ELEGIR|SELECCIONE)\b/.test(normalizaVmp(o.etiqueta)) || o.valor.trim() === ''

/** Último token del catálogo de Allianz que es un CÓDIGO de homologación («SCOOTER 4 PRO DDHBC26ZM»): letras+dígitos, ≥6, con ambos. */
const RE_CODIGO_FINAL = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9]{6,}$/

/**
 * Casa lo que pide el riesgo con UNA opción del desplegable del portal. Solo IGUALDAD tras normalizar (valor o etiqueta); como único
 * margen, el catálogo de Allianz añade al modelo un código final («… DDHBC26ZM»): si quitárselo deja exactamente lo pedido y casa UNA,
 * se acepta y se marca `aproximada` (el adaptador la declara). Nunca «lo más parecido», nunca la primera. Pura.
 */
export function casarOpcionVmp(opciones: readonly OpcionVmp[], buscada: string): CasadoVmp {
  const b = normalizaVmp(buscada)
  if (b === '') return { tipo: 'ninguna' }
  const validas = opciones.filter((o) => !esOpcionVacia(o))
  const exactas = validas.filter((o) => normalizaVmp(o.valor) === b || normalizaVmp(o.etiqueta) === b)
  if (exactas.length === 1) return { tipo: 'unica', opcion: exactas[0]!, aproximada: false }
  if (exactas.length > 1) return { tipo: 'ambigua', candidatas: exactas }
  const sinCodigo = validas.filter((o) => {
    for (const t of [normalizaVmp(o.etiqueta), normalizaVmp(o.valor)]) {
      const partes = t.split(' ')
      const ultimo = partes[partes.length - 1] ?? ''
      if (partes.length > 1 && RE_CODIGO_FINAL.test(ultimo) && partes.slice(0, -1).join(' ') === b) return true
    }
    return false
  })
  if (sinCodigo.length === 1) return { tipo: 'unica', opcion: sinCodigo[0]!, aproximada: true }
  if (sinCodigo.length > 1) return { tipo: 'ambigua', candidatas: sinCodigo }
  return { tipo: 'ninguna' }
}

/** Qué mostrar de un desplegable de tipo de documento según el documento del riesgo (DNI empieza por dígito; si no, NIE). Puro. */
export function tipoDocumentoEsperado(documento: string): 'dni' | 'nie' {
  return /^\d/.test(documento.trim()) ? 'dni' : 'nie'
}

// ───────────────────────── puro: planes ─────────────────────────

export type OperacionVmp =
  | { sel: string; tipo: 'texto'; valor: string; etiqueta: string }
  | { sel: string; tipo: 'fecha'; valor: string; etiqueta: string }
  | { sel: string; tipo: 'opcion'; valor: true; etiqueta: string }

function exigirFormulario(f: FormularioPatinete): void {
  if (f.ramo !== 'patinete') throw new ErrorTarificador('datos', `${ADAPTADOR}: el formulario no es de patinete`)
  // Defensa en profundidad: el validador ya lo rechaza (fail-closed), pero un formulario construido a mano no se tarifica solo.
  if (f.vmp.usoProfesional !== false) throw new ErrorTarificador('datos', `${ADAPTADOR}: uso profesional/reparto no se tarifica solo (a Alberto)`)
  if (f.vmp.homologado !== true) throw new ErrorTarificador('datos', `${ADAPTADOR}: patinete no homologado no se tarifica solo (a Alberto)`)
  if (f.vmp.velocidadLimitada25 !== true) throw new ErrorTarificador('datos', `${ADAPTADOR}: falta confirmar el límite de 25 km/h (a Alberto)`)
}

/** Pantalla 1 «Datos Básicos»: tomador = propietario = conductor, sin 2.º conductor. Pura. El tipo de documento NO se cambia (se lee). */
export function planIntervinientes(f: FormularioPatinete): OperacionVmp[] {
  exigirFormulario(f)
  const plan: OperacionVmp[] = []
  if (f.efecto) plan.push({ sel: SEL_INTERVINIENTES.fechaEfecto, tipo: 'fecha', valor: fechaEs(f.efecto, `${ADAPTADOR}: la fecha de efecto`), etiqueta: 'Fecha Efecto' })
  plan.push(
    { sel: SEL_INTERVINIENTES.docTomador, tipo: 'texto', valor: f.tomador.documentoIdentidad, etiqueta: 'Documento del tomador' },
    { sel: SEL_INTERVINIENTES.propietarioSi, tipo: 'opcion', valor: true, etiqueta: 'El tomador es propietario: Sí' },
    { sel: SEL_INTERVINIENTES.conductorSi, tipo: 'opcion', valor: true, etiqueta: 'El tomador es conductor: Sí' },
  )
  return plan
}

/**
 * Pantalla 2 «Riesgo VMP» SIN marca y modelo (son desplegables dependientes: van aparte, `elegirMarcaYModelo`). La matrícula NO se
 * escribe (un VMP no la tiene; el nº DGT se pide en la firma). La casilla «Incluir IVA» NO se toca (se lee y se declara). Pura.
 */
export function planRiesgo(f: FormularioPatinete): OperacionVmp[] {
  exigirFormulario(f)
  const plan: OperacionVmp[] = [
    { sel: SEL_RIESGO.usoNo, tipo: 'opcion', valor: true, etiqueta: '¿Uso profesional?: No' },
    { sel: SEL_RIESGO.homologadoSi, tipo: 'opcion', valor: true, etiqueta: '¿Homologado por la DGT?: Sí' },
    { sel: SEL_RIESGO.velocidad25, tipo: 'opcion', valor: true, etiqueta: 'Velocidad limitada a 25 km/h' },
    { sel: SEL_RIESGO.codigoPostal, tipo: 'texto', valor: f.codigoPostal, etiqueta: 'C.P.' },
  ]
  if (f.poblacion) plan.push({ sel: SEL_RIESGO.poblacion, tipo: 'texto', valor: f.poblacion, etiqueta: 'Población' })
  plan.push({ sel: SEL_RIESGO.nacimientoConductor, tipo: 'fecha', valor: fechaEs(f.conductor.fechaNacimiento, `${ADAPTADOR}: la fecha de nacimiento del conductor`), etiqueta: 'Fecha de Nacimiento del conductor' })
  return plan
}

// ───────────────────────── E/S sobre el marco ─────────────────────────

type CtxVmp = Pick<ContextoPortal, 'formador'>

async function fijarFecha(campo: Locator, valor: string): Promise<void> {
  await comprobarCampo(campo)
  // Setter nativo + `change`: las fechas de ePAC llevan máscara (mismo mecanismo que Moto, v0.7.17).
  await campo.evaluate((el, v) => {
    const i = el as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value')?.set
    if (set) set.call(i, v)
    else i.value = v
  }, valor)
  await comprobarCampo(campo)
  await campo.dispatchEvent('change')
  await campo.blur().catch(() => undefined)
}

async function ejecutar(raiz: Pick<Frame, 'locator' | 'page'>, op: OperacionVmp, ctx: CtxVmp): Promise<void> {
  if (op.tipo === 'opcion') {
    const campo = raiz.locator(op.sel).first()
    if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `${ADAPTADOR}: no aparece el control «${op.etiqueta}» (${op.sel})`)
    await comprobarCampo(campo)
    await campo.check().catch(() => undefined) // si el portal lo revierte, `check()` lanza: se relee y se falla con error tipado
    if (!(await campo.isChecked())) throw new ErrorTarificador('portal', `${ADAPTADOR}: el portal no dejó marcado «${op.etiqueta}»`)
    return
  }
  const r = await campoConRespaldo(raiz, op.sel, { page: raiz.page(), formador: ctx.formador, etiqueta: op.etiqueta })
  if (!r) throw new ErrorTarificador('portal', `${ADAPTADOR}: no aparece el campo «${op.etiqueta}» (${op.sel})`)
  if (op.tipo === 'fecha') await fijarFecha(r.campo, op.valor)
  else {
    await comprobarCampo(r.campo)
    await r.campo.fill(op.valor)
    await r.campo.dispatchEvent('change')
    await r.campo.blur().catch(() => undefined)
  }
  // Se relee SIEMPRE: el portal puede repintar/limpiar (el valor nunca viaja en el mensaje).
  const leido = (await r.campo.inputValue().catch(() => '')).trim()
  const esperado = op.tipo === 'texto' && op.etiqueta === 'Documento del tomador' ? op.valor.replace(/[\s.-]/g, '').toUpperCase() : op.valor
  const obtenido = op.tipo === 'texto' && op.etiqueta === 'Documento del tomador' ? leido.replace(/[\s.-]/g, '').toUpperCase() : leido
  if (obtenido !== esperado) throw new ErrorTarificador('portal', `${ADAPTADOR}: «${op.etiqueta}» no quedó fijado (${obtenido === '' ? 'vacío' : 'otro valor'})`)
  await r.confirmar()
}

async function leerSelect(raiz: Pick<Frame, 'locator'>, sel: string): Promise<{ deshabilitado: boolean; valor: string; opciones: OpcionVmp[] } | null> {
  const l = raiz.locator(sel).first()
  if ((await l.count()) === 0) return null
  return l.evaluate((el) => {
    const s = el as HTMLSelectElement
    return { deshabilitado: s.disabled, valor: s.value, opciones: Array.from(s.options).map((o) => ({ valor: o.value, etiqueta: (o.textContent ?? '').trim() })) }
  })
}

/** Espera a que el desplegable tenga opciones reales y esté habilitado; devuelve su lectura. */
async function esperarSelectLleno(raiz: Pick<Frame, 'locator'>, sel: string, que: string, page: Pick<Page, 'waitForTimeout'>, timeoutMs = 15_000) {
  const fin = Date.now() + timeoutMs
  for (;;) {
    const s = await leerSelect(raiz, sel)
    if (!s) throw new ErrorTarificador('portal', `${ADAPTADOR}: no aparece el desplegable de ${que}`)
    if (!s.deshabilitado && s.opciones.some((o) => !esOpcionVacia(o))) return s
    if (Date.now() >= fin) throw new ErrorTarificador('portal', `${ADAPTADOR}: el desplegable de ${que} no se llenó a tiempo`)
    await page.waitForTimeout(300)
  }
}

async function elegirDesplegable(raiz: Pick<Frame, 'locator'>, sel: string, que: string, buscada: string, page: Pick<Page, 'waitForTimeout'>): Promise<{ aproximada: boolean; etiqueta: string }> {
  const s = await esperarSelectLleno(raiz, sel, que, page)
  const c = casarOpcionVmp(s.opciones, buscada)
  if (c.tipo === 'ninguna') throw new ErrorEleccionVmp(`${que} «${buscada.slice(0, 60)}» no está en el catálogo del portal (a Alberto)`)
  if (c.tipo === 'ambigua') throw new ErrorEleccionVmp(`${que} «${buscada.slice(0, 60)}» casa con varias opciones del portal (no se elige la primera)`, c.candidatas.map((o) => o.etiqueta))
  const campo = raiz.locator(sel).first()
  if (s.valor !== c.opcion.valor) {
    await comprobarCampo(campo)
    await campo.selectOption(c.opcion.valor)
  }
  if ((await campo.inputValue()) !== c.opcion.valor) throw new ErrorTarificador('portal', `${ADAPTADOR}: el portal no dejó fijado el desplegable de ${que}`)
  return { aproximada: c.aproximada, etiqueta: c.opcion.etiqueta }
}

/** Marca y, cuando el portal carga sus modelos, modelo. Devuelve los supuestos a declarar (modelo casado quitando el código de catálogo). */
export async function elegirMarcaYModelo(raiz: Pick<Frame, 'locator'>, f: FormularioPatinete, page: Pick<Page, 'waitForTimeout'>): Promise<string[]> {
  exigirFormulario(f)
  const supuestos: string[] = []
  const marca = await elegirDesplegable(raiz, SEL_RIESGO.marca, 'la marca', f.vmp.marca, page)
  if (marca.aproximada) supuestos.push(`marca del portal «${marca.etiqueta}»`)
  const modelo = await elegirDesplegable(raiz, SEL_RIESGO.modelo, 'el modelo', f.vmp.modelo, page)
  if (modelo.aproximada) supuestos.push(`modelo del catálogo del portal «${modelo.etiqueta}» (con su código de homologación)`)
  return supuestos
}

/** Estado de las casillas que NO se tocan, para declararlo («Incluir IVA»). `null` = no aparece. */
export async function leerIncluirIva(raiz: Pick<Frame, 'locator'>): Promise<boolean | null> {
  const c = raiz.locator(SEL_RIESGO.incluirIva).first()
  if ((await c.count()) === 0) return null
  return c.isChecked().catch(() => null)
}

export function textoSupuestosVmp(supuestos: readonly string[]): string | null {
  const s = supuestos.filter((x) => x.trim() !== '')
  return s.length ? `Precio con supuestos: ${s.join('; ')}` : null
}

// ───────────────────────── pantalla 1 «Datos Básicos» ─────────────────────────

/**
 * Rellena «Datos Básicos»: documento del tomador, tomador = propietario = conductor y (si el riesgo trae `efecto`) la fecha de efecto.
 * El tipo de documento NO se cambia: se lee y, si no es el del documento, hueco con las opciones (su lista no está vista).
 * Devuelve los supuestos a declarar (fecha de efecto que propone el portal).
 */
export async function rellenarIntervinientes(raiz: Pick<Frame, 'locator' | 'page'>, f: FormularioPatinete, ctx: CtxVmp): Promise<string[]> {
  const plan = planIntervinientes(f)
  const tipo = await leerSelect(raiz, SEL_INTERVINIENTES.tipoDocTomador)
  if (!tipo) throw new ErrorTarificador('portal', `${ADAPTADOR}: no aparece el desplegable «Tipo Doc. Tomador»`)
  const mostrado = tipo.opciones.find((o) => o.valor === tipo.valor)?.etiqueta ?? ''
  const esperado = TIPO_DOCUMENTO_ESPERADO[tipoDocumentoEsperado(f.tomador.documentoIdentidad)]
  if (!esperado.map(normalizaVmp).includes(normalizaVmp(mostrado))) {
    throw new ErrorMapaIncompleto(`la elección del «Tipo Doc. Tomador» (muestra «${mostrado.slice(0, 30)}», opciones: ${tipo.opciones.map((o) => o.etiqueta).join(' | ').slice(0, 200)})`)
  }
  for (const op of plan) await ejecutar(raiz, op, ctx)
  const segundo = (await raiz.locator(SEL_INTERVINIENTES.docSegundoConductor).first().inputValue().catch(() => '')).trim()
  if (segundo !== '') throw new ErrorTarificador('portal', `${ADAPTADOR}: el portal trae un 2.º conductor que no es del riesgo`)
  if (f.efecto) return []
  const efecto = (await raiz.locator(SEL_INTERVINIENTES.fechaEfecto).first().inputValue().catch(() => '')).trim()
  return [`fecha de efecto la que propone el portal${/^\d{2}\/\d{2}\/\d{4}$/.test(efecto) ? ` (${efecto})` : ''}`]
}

// ───────────────────────── pantalla 2 «Riesgo VMP» ─────────────────────────

/**
 * Rellena «Riesgo VMP»: marca → modelo (dependiente) → resto. Relee todo. Devuelve los supuestos a declarar: el modelo casado por
 * su código de catálogo, el estado de «Incluir IVA» tal como lo trae el portal (no se toca) y la población si el riesgo no la trae.
 */
export async function rellenarRiesgo(raiz: Pick<Frame, 'locator' | 'page'>, f: FormularioPatinete, ctx: CtxVmp): Promise<string[]> {
  const plan = planRiesgo(f)
  const supuestos = await elegirMarcaYModelo(raiz, f, raiz.page())
  for (const op of plan) await ejecutar(raiz, op, ctx)
  const iva = await leerIncluirIva(raiz)
  if (iva !== null) supuestos.push(`«Incluir IVA» ${iva ? 'marcado' : 'sin marcar'} tal como lo trae el portal`)
  if (!f.poblacion) supuestos.push('población la que resuelve el portal para el CP')
  return supuestos
}

// ───────────────────────── avances y precio: HUECOS ─────────────────────────

/**
 * HUECO (guard): pasar de «Datos Básicos» a «Riesgo VMP» (`#btnAceptar`, `eventoSiguiente()`) y de «Riesgo VMP» al resultado («Aceptar»,
 * `eventoSiguienteDialog()`). El guard de tarificar no tiene regla para `/drvp00/` (solo `drpc18`, Moto): pulsarlo con `ctx.pulsar` se
 * bloquearía como «Aceptar» de emisión, y pulsarlo por otro camino rompería la regla de pulsar solo por ctx. Comprueba que la pantalla es la
 * esperada y para pidiendo el inventario. Cuando el guard lo autorice, SOLO aquí se cambia el `throw`
 * por la llamada autorizada y se devuelve el marco de la pantalla de destino.
 */
export async function avanzarVmp(raiz: Pick<Frame, 'locator'>, desde: 'datos_basicos' | 'riesgo'): Promise<Frame> {
  // Este fichero no nombra el botón de avance (solo guard.ts puede: regression-tarificador-rpa); se comprueba que la pantalla es la esperada.
  const pantalla = desde === 'datos_basicos' ? SEL_INTERVINIENTES.docTomador : SEL_RIESGO.marca
  const n = await raiz.locator(pantalla).count().catch(() => 0)
  if (n !== 1) throw new ErrorTarificador('portal', `${ADAPTADOR}: no estamos en ${desde === 'datos_basicos' ? 'Datos Básicos' : 'Riesgo VMP'} (campo de referencia: ${n})`)
  const que = desde === 'datos_basicos' ? 'Datos Básicos' : 'Riesgo VMP'
  throw new ErrorMapaIncompleto(`el avance autorizado de ${que} de /drvp00/ en el guard de tarificar (guard.ts solo autoriza drpc18/Moto; el explorador sí tiene \`avancesPorId\`)`)
}

/**
 * HUECO: la pantalla de PRECIO de Movilidad Personal (nunca vista: ninguna exploración pasó del «Aceptar» de Riesgo). Cuando se grabe:
 * leer la prima total anual (y neta si la separa), las coberturas/límites de la RC obligatoria y los avisos del portal, y devolver
 * `ofertaVmp(...)`. Hasta entonces, falla cerrado pidiendo el inventario de la pantalla.
 */
export async function leerOfertasVmp(raiz: Pick<Frame, 'locator'>, supuestos: readonly string[]): Promise<OfertaNormalizada[]> {
  const hayTextoDePrima = await raiz.locator('body').innerText({ timeout: 2_000 }).then((t) => /prima|recibo|total/i.test(t), () => false)
  throw new ErrorMapaIncompleto(`la lectura de la pantalla de precio de Movilidad Personal (${hayTextoDePrima ? 'hay texto de prima, sin mapa' : 'sin texto de prima visible'}; ${supuestos.length} supuestos pendientes de declarar)`)
}

/**
 * `OfertaNormalizada` de Movilidad Personal a partir de lo LEÍDO de la pantalla de precio. Pura y fail-closed: sin prima total anual
 * finita > 0 no hay oferta. Lo que el portal no dé va `null` (no se rellena): fraccionamiento, recibo, validez, referencia, PDF.
 * Las coberturas llegan vacías hasta mapear la pantalla: lo declara un aviso (nunca se inventa la RC obligatoria).
 */
export function ofertaVmp(entrada: { primaAnualEur: number; primaNetaEur?: number | null; avisosPortal?: readonly string[]; supuestos?: readonly string[] }): OfertaNormalizada {
  const prima = entrada.primaAnualEur
  if (!Number.isFinite(prima) || prima <= 0 || prima > 100_000) throw new ErrorTarificador('portal', `${ADAPTADOR}: la prima anual leída no es un importe válido`)
  const neta = entrada.primaNetaEur ?? null
  if (neta !== null && (!Number.isFinite(neta) || neta <= 0 || neta > prima + 0.02)) throw new ErrorTarificador('portal', `${ADAPTADOR}: la prima neta leída no cuadra con la total`)
  const supuestos = textoSupuestosVmp(entrada.supuestos ?? [])
  return {
    compania: 'allianz',
    producto: NOMBRE_PRODUCTO_OFERTA,
    primaAnualEur: Math.round(prima * 100) / 100,
    primaNetaEur: neta === null ? null : Math.round(neta * 100) / 100,
    fraccionamiento: null,
    importeReciboEur: null,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: null,
    pdf: null,
    avisos: [
      ...(entrada.avisosPortal ?? []),
      'Coberturas no leídas del portal (pantalla de precio sin mapear): comprobar la RC obligatoria antes de proponer.',
      ...(supuestos ? [supuestos] : []),
    ],
  }
}

// ───────────────────────── adaptador ─────────────────────────

export const allianzPatinete = {
  compania: 'allianz',
  ramo: 'patinete',
  credencial: 'ALLIANZ_EPAC',
  version: '0.1.0',
  async tarificar(page: Page, f: FormularioPatinete, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    // Todo lo que se puede comprobar SIN tocar el portal, antes de abrirlo (fail-closed).
    planIntervinientes(f)
    planRiesgo(f)
    if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
    await ctx.trasLogin()
    await ctx.paso('navegacion', () => abrirNuevaAlta(page, ctx, { pestana: PESTANA_ENTRADA, producto: PRODUCTO_MENU }))
    const basicos = await marcoCon(page, (r) => r.locator(SEL_INTERVINIENTES.docTomador), 'Datos Básicos (Figuras Intervinientes)')
    const supuestosBasicos = await ctx.paso('formulario', () => rellenarIntervinientes(basicos, f, ctx))
    const riesgo = await ctx.paso('tarificar', () => avanzarVmp(basicos, 'datos_basicos'))
    const supuestosRiesgo = await ctx.paso('formulario', () => rellenarRiesgo(riesgo, f, ctx))
    const resultado = await ctx.paso('tarificar', () => avanzarVmp(riesgo, 'riesgo'))
    const ofertas = await ctx.paso('lectura_primas', () => leerOfertasVmp(resultado, [...supuestosBasicos, ...supuestosRiesgo]))
    return { ofertas }
  },
} as const

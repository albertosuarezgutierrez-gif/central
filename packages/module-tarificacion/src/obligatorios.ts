// Datos OBLIGATORIOS para llegar a precio, por compañía × ramo (15/10/2026). PURO: ni BD, ni red, ni Playwright.
//
// Objetivo (Alberto): que NINGÚN bot arranque y se bloquee por un dato que falta. Esta es la ÚNICA fuente de «qué tiene que
// traer el riesgo para que el bot de <compañía>/<ramo> llegue a precio». Alimenta:
//   (a) el encolado (asegura `riesgoParaEncolar` / `validarEntradaRamo`, `prepararSolicitud`) y la red final del worker
//       (`prepararTrabajo`, services/tarificador-rpa/src/ramo.ts): rechazo con la lista legible ANTES de abrir el navegador;
//   (b) la ficha/oportunidad (marcar lo que falta) y (c) el cuestionario al cliente (campos obligatorios) — fase 2.
//
// Composición, no duplicación: `faltanParaTarificar` = obligatorios de FORMA del ramo (lo que exige el validador del ramo:
// `validarFormularioAuto`, `validarFormularioHogar`, `validarRiesgoComunidad`) + obligatorios PROPIOS del portal de la
// compañía (lo que su adaptador lee del `form` y sin lo que lanza `ErrorTarificador('datos')`). Solo mira PRESENCIA: la
// FORMA de cada dato (fechas, CP, rangos) la sigue validando el validador del ramo, que va antes.
// El cepo `obligatorios.test.ts` (y `test/obligatorios-adaptadores.test.ts` del worker) ata esta lista a los validadores y
// a los planificadores puros de cada adaptador: si un adaptador empieza a exigir algo nuevo, se declara AQUÍ.
//
// 🚨 Sin datos personales: claves de campo y etiquetas humanas, NUNCA valores. 🚨 `null` = «no se sabe» (no hay
// declaración para esa compañía/ramo), nunca «no falta nada».

import { claveCompania } from './registro.ts'
import { faltaCompaniaAnterior } from './formulario-auto.ts'
import { CAPACIDAD_ALLIANZ_COMUNIDADES } from './capacidades.ts'
import { conAntecedentesFavorables, supuestosAuto } from './supuestos-auto.ts'

/**
 * `formulario`: el riesgo tal como lo recibe el bot. `ficha`: lo pone ASEGURA desde la ficha del cliente al ENTREGAR el
 * trabajo (NIF y datos del tomador de Mapfre); no viaja en el riesgo que se guarda. Al encolar se evalúa sobre el riesgo
 * con la ficha ya aplicada EN MEMORIA (`riesgoParaEncolar`); sin ella (`{ sinFicha: true }`) esos campos no se miran.
 */
export type OrigenObligatorio = 'formulario' | 'ficha'

/**
 * Bloque del presupuesto de motor donde se pide/confirma el dato (20/10/2026): `personas` (tomador, conductor, propietario),
 * `riesgo` (el vehículo y dónde circula; en otros ramos, el bien asegurado) y `poliza` (póliza actual y bonificaciones).
 * Solo ordena la pantalla: NO cambia lo que se exige.
 */
export const BLOQUES_OBLIGATORIO = ['personas', 'riesgo', 'poliza'] as const
export type BloqueObligatorio = (typeof BLOQUES_OBLIGATORIO)[number]

export type CampoObligatorio = {
  /** Ruta con puntos en el riesgo («conductor.fechaCarne»). Es la clave que marcan la ficha y el cuestionario. */
  clave: string
  /** Etiqueta humana en español, sin valores («fecha del carné»). */
  etiqueta: string
  /** Bloque de la pantalla de presupuesto donde se pide. Obligatorio: todo campo declarado tiene bloque. */
  bloque: BloqueObligatorio
  origen: OrigenObligatorio
  /** ¿Se exige con ESTE riesgo? (p. ej. la compañía anterior solo con años asegurado > 0). Ausente = siempre. */
  aplica?: (r: Record<string, unknown>) => boolean
  /** ¿Está? Ausente = el valor de `clave` no es `undefined`/`null`/texto vacío (0 y `false` SON datos). */
  presente?: (r: Record<string, unknown>) => boolean
}

export type Faltante = { clave: string; etiqueta: string }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** Valor en una ruta con puntos. PURA. */
export function valorEnRuta(r: unknown, ruta: string): unknown {
  let cur: unknown = r
  for (const p of ruta.split('.')) {
    const o = obj(cur)
    if (!o) return undefined
    cur = o[p]
  }
  return cur
}

const hay = (v: unknown): boolean => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const campo = (clave: string, etiqueta: string, bloque: BloqueObligatorio, extra: Partial<Omit<CampoObligatorio, 'clave' | 'etiqueta' | 'bloque'>> = {}): CampoObligatorio =>
  ({ clave, etiqueta, bloque, origen: 'formulario', ...extra })

// ─── Obligatorios de FORMA por ramo (lo que exige el validador del ramo) ───────────────────────────────────────────

/** `validarFormularioAuto` (coche): matrícula, CP de circulación y las dos fechas del conductor. */
const BASE_AUTO: readonly CampoObligatorio[] = [
  campo('matricula', 'matrícula', 'riesgo'),
  campo('codigoPostal', 'CP de circulación', 'riesgo'),
  campo('conductor.fechaNacimiento', 'fecha de nacimiento del conductor', 'personas'),
  campo('conductor.fechaCarne', 'fecha del carné', 'personas'),
]

/** Moto: lo de coche + marca, modelo y cilindrada (Allianz separa Moto y Ciclomotor; `validarFormularioAuto` la exige). */
const BASE_MOTO: readonly CampoObligatorio[] = [
  ...BASE_AUTO,
  campo('seleccionVehiculo.marca', 'marca de la moto', 'riesgo'),
  campo('seleccionVehiculo.modelo', 'modelo de la moto', 'riesgo'),
  campo('seleccionVehiculo.cilindradaCc', 'cilindrada de la moto (cc)', 'riesgo'),
]

/**
 * `validarFormularioHogar`: tomador, situación, construcción y las cuatro elecciones sin valor por defecto.
 * El DNI/NIE y la fecha de nacimiento del tomador son de origen FICHA (19/10/2026): no cruzan el puerto plataforma → asegura;
 * asegura los lee de la ficha, comprueba que los tiene legibles y válidos al encolar y los inyecta en `tomador` al ENTREGAR el
 * trabajo (`tarificador-tomador-hogar.ts`). Sin ficha (`sinFicha`) no se miran; con ella aplicada, sí.
 */
const BASE_HOGAR: readonly CampoObligatorio[] = [
  campo('tomador.documentoIdentidad', 'DNI/NIE del tomador', 'personas', { origen: 'ficha' }),
  campo('tomador.fechaNacimiento', 'fecha de nacimiento del tomador', 'personas', { origen: 'ficha' }),
  campo('inmueble.codigoPostal', 'código postal de la vivienda', 'riesgo'),
  campo('inmueble.nombreVia', 'calle de la vivienda', 'riesgo'),
  campo('inmueble.numero', 'número de la calle', 'riesgo'),
  campo('inmueble.anioConstruccion', 'año de construcción', 'riesgo'),
  campo('inmueble.superficieM2', 'superficie construida (m²)', 'riesgo'),
  campo('hogar.uso', 'uso de la vivienda', 'riesgo'),
  campo('hogar.regimen', 'régimen (propietario o inquilino)', 'riesgo'),
  campo('hogar.tipoVivienda', 'tipo de vivienda', 'riesgo'),
  campo('hogar.conMadera', 'si la construcción lleva madera', 'riesgo'),
]

/** `validarRiesgoComunidad` sin los desplegables de un portal (`exigirSelectsPortal: false`). */
const BASE_COMUNIDADES: readonly CampoObligatorio[] = [
  campo('direccion.codigoPostal', 'código postal del edificio', 'riesgo'),
  campo('fechaEfecto', 'fecha de efecto', 'riesgo'),
  campo('fechaTermino', 'fecha de término', 'riesgo'),
  campo('m2Construidos', 'metros cuadrados construidos', 'riesgo'),
  campo('anioConstruccion', 'año de construcción', 'riesgo'),
  campo('plantas', 'plantas sobre el nivel de la calle', 'riesgo'),
  campo('numEdificios', 'número de edificios', 'riesgo'),
  // Un único campo en ePAC: dado, o la suma de viviendas + locales (solo si vienen los dos).
  campo('numViviendasYLocales', 'número de viviendas y locales', 'riesgo', { presente: (r) => hay(r.numViviendasYLocales) || (hay(r.numViviendas) && hay(r.numLocales)) }),
  campo('capitalContinente', 'valor de reposición de la edificación (€)', 'riesgo'),
]

const BASE_POR_RAMO: Readonly<Record<string, readonly CampoObligatorio[]>> = {
  auto: BASE_AUTO,
  moto: BASE_MOTO,
  hogar: BASE_HOGAR,
  comunidades: BASE_COMUNIDADES,
}

/** Obligatorios de FORMA de un ramo (sin compañía). `null` = ramo sin validador conocido aquí. PURA. */
export function obligatoriosDeRamo(ramo: string): readonly CampoObligatorio[] | null {
  return BASE_POR_RAMO[String(ramo).trim().toLowerCase()] ?? null
}

// ─── Obligatorios PROPIOS de cada portal (lo que su adaptador lee y sin lo que falla `datos`) ──────────────────────

/** ¿El tomador de este riesgo es una persona física con datos de alta (bloque `tomador` o `datosTomador` de la ficha)? */
const tomadorAlta = (r: Record<string, unknown>): Record<string, unknown> | null => obj(r.tomador) ?? obj(r.datosTomador)
const esJuridica = (r: Record<string, unknown>) => tomadorAlta(r)?.tipo === 'juridica'

/**
 * Mapfre NSEI (coche y moto), paso 1: busca al tomador por NIF y, si no lo conoce, lo da de alta (`planAltaTomador`). El
 * NIF y los datos del alta los pone asegura desde la ficha (`aplicarNifTomador` / `aplicarDatosTomador`); con el bloque
 * `tomador` en el riesgo se usan los de ese bloque.
 */
const MAPFRE_TOMADOR: readonly CampoObligatorio[] = [
  { clave: 'documentoTomador', etiqueta: 'NIF/CIF del tomador', bloque: 'personas', origen: 'ficha', presente: (r) => hay(r.documentoTomador) || hay(obj(r.tomador)?.documentoIdentidad) },
  { clave: 'datosTomador.razonSocial', etiqueta: 'razón social del tomador', bloque: 'personas', origen: 'ficha', aplica: esJuridica, presente: (r) => hay(tomadorAlta(r)?.razonSocial) },
  { clave: 'datosTomador.nombre', etiqueta: 'nombre del tomador', bloque: 'personas', origen: 'ficha', aplica: (r) => !esJuridica(r), presente: (r) => hay(tomadorAlta(r)?.nombre) },
  { clave: 'datosTomador.apellido1', etiqueta: 'primer apellido del tomador', bloque: 'personas', origen: 'ficha', aplica: (r) => !esJuridica(r), presente: (r) => hay(tomadorAlta(r)?.apellido1) },
  { clave: 'datosTomador.fechaNacimiento', etiqueta: 'fecha de nacimiento del tomador', bloque: 'personas', origen: 'ficha', aplica: (r) => !esJuridica(r), presente: (r) => hay(tomadorAlta(r)?.fechaNacimiento) },
]

/** Mapfre auto (`planObjetoYFiguras`, `exigirConductorEsTomador`): historial y licencia en «Figuras». */
const MAPFRE_AUTO_FIGURAS: readonly CampoObligatorio[] = [
  campo('siniestrosUltimos5Anios', 'siniestros con culpa de los últimos 5 años', 'poliza'),
  campo('aniosAseguradoAnterior', 'años asegurado en la compañía anterior', 'poliza'),
  campo('companiaAnterior', 'nombre de la compañía anterior', 'poliza', {
    aplica: (r) => typeof r.aniosAseguradoAnterior === 'number' && r.aniosAseguradoAnterior > 0,
    presente: (r) => faltaCompaniaAnterior('mapfre', 'auto', r.aniosAseguradoAnterior as number, typeof r.companiaAnterior === 'string' ? r.companiaAnterior : null) === null,
  }),
  // `true` o `false` es un dato (false = hueco de mapa, no de datos). `null` solo vale si la fecha de nacimiento del tomador
  // (bloque `tomador` o ficha) es la del conductor: así lo decide el adaptador; aquí la misma regla.
  campo('tomadorEsConductor', 'si el tomador es el conductor habitual', 'personas', {
    aplica: (r) => !esJuridica(r),
    presente: (r) => typeof r.tomadorEsConductor === 'boolean' || (texto(tomadorAlta(r)?.fechaNacimiento) !== '' && texto(tomadorAlta(r)?.fechaNacimiento) === texto(valorEnRuta(r, 'conductor.fechaNacimiento'))),
  }),
]

/** Allianz Moto: «asegurado en otra compañía» = Sí salvo que el riesgo diga `0` años (sin dato: el supuesto favorable es «más de 5»). */
const estuvoAseguradoMoto = (r: Record<string, unknown>): boolean => r.aniosAseguradoAnterior !== 0

/**
 * Allianz Moto (`planDatosBasicosMoto`, `tarificarMoto`): el portal no tiene «sin dato» en sexo. Antecedentes sin dato →
 * supuesto favorable declarado (`conAntecedentesFavorables`), no bloquean. El sexo, si el formulario no lo trae, lo pone
 * ASEGURA desde el tratamiento de la ficha (Sr./Sra., `clientes.saludo`) al encolar; sin él, falta (nunca se inventa).
 */
const ALLIANZ_MOTO: readonly CampoObligatorio[] = [
  campo('seleccionVehiculo.clase', 'clase de la moto (tramo de cilindrada 1-4)', 'riesgo'),
  campo('conductor.sexo', 'sexo del conductor (ni en el formulario ni en el tratamiento Sr/Sra de la ficha)', 'personas', { origen: 'ficha' }),
  campo('aniosAseguradoAnterior', 'años asegurado en la compañía anterior', 'poliza'),
  campo('siniestrosUltimos5Anios', 'siniestros con culpa de los últimos 5 años', 'poliza'),
  // Bot 0.7.5+ (`comprobarTitularesMoto`): marcar «tomador = conductor/propietario» obliga a informar el NIF/CIF del tomador; sin
  // él el bot se para con `datos`. Lo pone ASEGURA desde la ficha. Misma lectura que `documentoTomadorDe` (formulario-auto.ts).
  {
    clave: 'documentoTomador', etiqueta: 'NIF/CIF del tomador (Allianz lo exige si el tomador es el conductor o el propietario)', bloque: 'personas', origen: 'ficha',
    aplica: (r) => r.tomadorEsConductor === true || r.tomadorEsPropietario === true,
    presente: (r) => hay(r.documentoTomador) || hay(obj(r.tomador)?.documentoIdentidad) || hay(obj(r.fichaTomador)?.documento),
  },
  // Bot 0.7.11 (trabajo real 6cd26c10, 20/10/2026): «Datos básicos» rechazaba sin esto. Si estuvo asegurado (años > 0, o SIN dato:
  // el supuesto favorable también dice «estuvo asegurado»; solo `0` años = no) Allianz exige compañía de origen, 5 últimas cifras de
  // la póliza y qué justificante se aporta («No» no vale); la fecha de adquisición (≠ matriculación) se pide siempre.
  // Mismas reglas que `faltasDatosPortalMoto` (services/tarificador-rpa, adapters/allianz/auto.ts): atadas por su cepo.
  campo('companiaAnterior', 'compañía anterior (Allianz la exige si estuvo asegurado)', 'poliza', {
    aplica: estuvoAseguradoMoto,
    presente: (r) => hay(r.companiaAnterior) || hay(r.companiaActual),
  }),
  campo('polizaAnteriorUltimos5', 'número de póliza anterior: últimas 5 cifras (Allianz lo exige si estuvo asegurado)', 'poliza', {
    aplica: estuvoAseguradoMoto,
    presente: (r) => /^\d{5}$/.test(texto(r.polizaAnteriorUltimos5)),
  }),
  campo('fotocopiaAnterior', 'justificante del seguro anterior: recibo del próximo año/certificado o recibos de los 2 últimos años (Allianz exige indicar cuál se aporta)', 'poliza', {
    aplica: estuvoAseguradoMoto,
    presente: (r) => ['proximo_anio', 'dos_ultimos_anios'].includes(texto(r.fotocopiaAnterior)),
  }),
  campo('fechaAdquisicion', 'fecha de adquisición de la moto (no la de matriculación)', 'riesgo', {
    presente: (r) => /^\d{4}-\d{2}-\d{2}$/.test(texto(r.fechaAdquisicion)),
  }),
]

/**
 * Allianz Turismos (19/10/2026, trabajo real 02fd821b): con «ya lo tenía (cambio de seguro)» (póliza actual, o matriculado hace más
 * de 12 meses, o sin fecha) Allianz exige «Compañía actual del vehículo» y sin ella «SIGUIENTE» queda deshabilitado en «Antecedentes».
 * Vehículo nuevo: no se exige. Lo mismo que lanza `planDatosTurismos` (`datos`). Solo presencia: el casado con la lista del portal
 * lo hace el bot (`compania-actual.ts` del worker) y, si no casa o es ambiguo, también falla `datos`, con las candidatas.
 */
const ALLIANZ_AUTO: readonly CampoObligatorio[] = [
  campo('companiaAnterior', 'compañía actual del vehículo (Allianz la exige con cambio de seguro)', 'poliza', {
    aplica: (r) => supuestosAuto(r as Parameters<typeof supuestosAuto>[0]).compra.valor === 'ya_lo_tenia',
    presente: (r) => hay(r.companiaAnterior) || hay(r.companiaActual),
  }),
]

/** Mapfre Hogar (`exigirDatosHogar`): se tarifica con la referencia catastral del BIEN (20); 14 (parcela) no vale. */
const MAPFRE_HOGAR: readonly CampoObligatorio[] = [
  campo('inmueble.referenciaCatastral', 'referencia catastral de la vivienda (20 caracteres)', 'riesgo', {
    presente: (r) => /^[0-9A-Z]{14}[0-9A-Z]{4}[A-Z]{2}$/.test(texto(valorEnRuta(r, 'inmueble.referenciaCatastral')).replace(/[\s-]/g, '').toUpperCase()),
  }),
  // `pasoTomador`: si Mapfre no conoce al tomador pide nombre y primer apellido (de `datosTomador`). Hoy asegura no los
  // inyecta en hogar (`necesitaDatosTomador` solo auto/moto): hasta que lo haga, este bot no es tarificable.
  { clave: 'datosTomador.nombre', etiqueta: 'nombre del tomador', bloque: 'personas', origen: 'ficha', presente: (r) => hay(obj(r.datosTomador)?.nombre) },
  { clave: 'datosTomador.apellido1', etiqueta: 'primer apellido del tomador', bloque: 'personas', origen: 'ficha', presente: (r) => hay(obj(r.datosTomador)?.apellido1) },
]

/**
 * Generali Turismos (18/10/2026, regla de Alberto): Generali NO saca marca/modelo/versión por matrícula; los busca en sus
 * desplegables con el vehículo que CONFIRMÓ antes Allianz o Mapfre en la MISMA oportunidad. Lo pone ASEGURA (origen `ficha`:
 * no lo teclea nadie en el formulario): al encolar, si aún no hay ningún `ok` de Allianz/Mapfre, el trabajo queda `pendiente`
 * con la marca `esperaVehiculo` y entonces NO se exige (asegura no lo reclama hasta inyectarlo: apps/asegura
 * lib/tarificador-espera-vehiculo.ts). Sin la marca, falta = no arranca. Con `seleccionVehiculo` (marca y modelo separados)
 * o con `vehiculoConfirmado.denominacion` (Mapfre: un solo texto) basta.
 */
const GENERALI_AUTO: readonly CampoObligatorio[] = [
  {
    clave: 'seleccionVehiculo',
    etiqueta: 'marca, modelo y versión confirmados por Allianz o Mapfre en la misma oportunidad',
    bloque: 'riesgo',
    origen: 'ficha',
    aplica: (r) => r.esperaVehiculo !== true,
    presente: (r) => (hay(obj(r.seleccionVehiculo)?.marca) && hay(obj(r.seleccionVehiculo)?.modelo)) || hay(obj(r.vehiculoConfirmado)?.denominacion),
  },
]

/** Allianz Comunidades: los desplegables obligatorios de ePAC, DERIVADOS de los extras de su capacidad (capacidades.ts). */
function allianzComunidades(): readonly CampoObligatorio[] {
  return CAPACIDAD_ALLIANZ_COMUNIDADES.extras.filter((x) => x.obligatorio).map((x) => campo(x.clave, x.etiqueta.toLowerCase(), 'riesgo'))
}

/**
 * `llegaAPrecio` (19/10/2026, F3b de la correduría): ¿el bot de esa compañía/ramo LLEGA HOY a leer un precio en su portal?
 * Declaración EXPLÍCITA (no se deduce de que esté registrado): un bot que se para antes del precio («en pruebas») gastaría
 * cupo, máquina y la paciencia de Alberto sin dar nada. Lo que lanza un LEAD (aviso «Listo para tarificar» de Telegram) solo
 * usa los que llegan; los demás se listan como «en pruebas» y no se encolan desde el lead. Se pasa a `true` SOLO tras ver un
 * precio real de ese bot (la sesión que lo vea lo cambia aquí, con su cepo en `obligatorios.test.ts`).
 */
type Declaracion = { compania: string; ramo: string; propios: () => readonly CampoObligatorio[]; llegaAPrecio: boolean; nota?: string }

/**
 * Una entrada por bot (compañía × ramo) registrado o en construcción. `propios` = lo que pide SU portal además de la forma
 * del ramo. Lista vacía = el portal no pide nada más que la forma (declarado, no «no se sabe»).
 */
const DECLARACIONES: readonly Declaracion[] = [
  { compania: 'allianz', ramo: 'comunidades', propios: allianzComunidades, llegaAPrecio: true },
  { compania: 'allianz', ramo: 'moto', propios: () => ALLIANZ_MOTO, llegaAPrecio: true },
  // Turismos (0.5.0, en exploración): consulta por matrícula; lo opcional (garaje, titulares) solo se escribe si viene.
  { compania: 'allianz', ramo: 'auto', propios: () => ALLIANZ_AUTO, llegaAPrecio: false, nota: 'Turismos: se para antes del precio (19/10/2026)' },
  // Hogar pantalla 1: todo lo que lee lo exige ya `validarFormularioHogar`.
  { compania: 'allianz', ramo: 'hogar', propios: () => [], llegaAPrecio: false, nota: 'flag apagado; pantalla 1' },
  { compania: 'mapfre', ramo: 'auto', propios: () => [...MAPFRE_TOMADOR, ...MAPFRE_AUTO_FIGURAS], llegaAPrecio: true, nota: 'precio real 19/10/2026' },
  // Moto NSEI (0.8.7, 18/10/2026): el MISMO plan que el coche (paso 1, objeto y «Figuras»); la clase de permiso de moto, si
  // no consta, se supone «A» y se declara (no bloquea).
  { compania: 'mapfre', ramo: 'moto', propios: () => [...MAPFRE_TOMADOR, ...MAPFRE_AUTO_FIGURAS], llegaAPrecio: true, nota: 'mismo plan NSEI que el coche (que dio precio real)' },
  { compania: 'mapfre', ramo: 'hogar', propios: () => MAPFRE_HOGAR, llegaAPrecio: false, nota: 'borrador apagado' },
  // Occident hogar (hueco, sin registrar): lee nif, nacimiento, CP, vía y tipo de vivienda; todos ya en la forma de hogar.
  // OJO: su `planFormularioHogar` lee `tomador.nif` (forma de riesgo-oportunidad), no `tomador.documentoIdentidad`.
  { compania: 'occident', ramo: 'hogar', propios: () => [], llegaAPrecio: false, nota: 'sin registrar' },
  // Generali Turismos (0.1.0, tras su flag APAGADO): el vehículo lo inyecta asegura desde Allianz/Mapfre; el resto de datos, la
  // forma del ramo (tomador, conductor y antecedentes como en las demás; antecedentes sin dato = supuesto favorable declarado).
  { compania: 'generali', ramo: 'auto', propios: () => GENERALI_AUTO, llegaAPrecio: false, nota: 'llega a «Datos de Valoración», no al precio (19/10/2026)' },
]

const k = (compania: string, ramo: string) => `${claveCompania(compania)}::${String(ramo).trim().toLowerCase()}`

/**
 * ¿El bot de `compania`/`ramo` llega hoy a precio? `false` también sin declaración (no se sabe = no se lanza desde un lead).
 * PURA.
 */
export function llegaAPrecio(compania: string, ramo: string): boolean {
  return DECLARACIONES.find((x) => k(x.compania, x.ramo) === k(compania, ramo))?.llegaAPrecio === true
}

/** Compañía × ramo con declaración (para cepos y pantallas). PURA. */
export function capacidadesConObligatorios(): { compania: string; ramo: string }[] {
  return DECLARACIONES.map((d) => ({ compania: d.compania, ramo: d.ramo }))
}

/**
 * Obligatorios de un bot: forma del ramo + propios de su portal (sin repetir clave). `null` = no hay declaración para esa
 * compañía/ramo (no se sabe qué pide: nunca «nada»). PURA.
 */
export function obligatoriosPara(compania: string, ramo: string): readonly CampoObligatorio[] | null {
  const d = DECLARACIONES.find((x) => k(x.compania, x.ramo) === k(compania, ramo))
  const base = obligatoriosDeRamo(ramo)
  if (!d || !base) return null
  const vistos = new Set<string>()
  const out: CampoObligatorio[] = []
  for (const c of [...base, ...d.propios()]) {
    if (vistos.has(c.clave)) continue
    vistos.add(c.clave)
    out.push(c)
  }
  return out
}

/**
 * Lo que FALTA en `formulario` para que el bot de `compania`/`ramo` llegue a precio, en el orden de la declaración.
 * `[]` = no falta nada · `null` = no hay declaración (no se sabe). `sinFicha`: no mira lo que pone asegura desde la ficha
 * (para validar el riesgo que llega del formulario, antes de leer la ficha). Solo claves y etiquetas: nunca valores. PURA.
 */
export function faltanParaTarificar(compania: string, ramo: string, formulario: unknown, opciones: { sinFicha?: boolean } = {}): Faltante[] | null {
  const lista = obligatoriosPara(compania, ramo)
  if (!lista) return null
  const r = conSupuestosFavorables(ramo, obj(formulario) ?? {})
  const faltan: Faltante[] = []
  for (const c of lista) {
    if (opciones.sinFicha && c.origen === 'ficha') continue
    if (c.aplica && !c.aplica(r)) continue
    const esta = c.presente ? c.presente(r) : hay(valorEnRuta(r, c.clave))
    if (!esta) faltan.push({ clave: c.clave, etiqueta: c.etiqueta })
  }
  return faltan
}

const esVehiculo = (ramo: string) => ['auto', 'moto'].includes(String(ramo).trim().toLowerCase())

/** Vehículo: el riesgo con los antecedentes que falten al valor FAVORABLE (en memoria); otro ramo, tal cual. PURA. */
function conSupuestosFavorables(ramo: string, r: Record<string, unknown>): Record<string, unknown> {
  return esVehiculo(ramo) ? conAntecedentesFavorables(r).formulario : r
}

/**
 * Claves de los obligatorios de este bot que NO trae el riesgo y se cubren con el SUPUESTO FAVORABLE (no bloquean; el bot los
 * declara en «Precio con supuestos: …»). Para que una pantalla los pinte como «supuesto», nunca como dato. `null` = sin
 * declaración. PURA.
 */
export function supuestosFavorablesPara(compania: string, ramo: string, formulario: unknown): string[] | null {
  const lista = obligatoriosPara(compania, ramo)
  if (!lista) return null
  if (!esVehiculo(ramo)) return []
  const claves = new Set(lista.map((c) => c.clave))
  return conAntecedentesFavorables(obj(formulario) ?? {}).claves.filter((c) => claves.has(c))
}

/** «Faltan: CP de circulación, fecha del carné.» — el mensaje legible (sin valores). Lista vacía → `''`. PURA. */
export function mensajeFaltan(faltan: readonly Faltante[]): string {
  if (!faltan.length) return ''
  return `${faltan.length === 1 ? 'Falta' : 'Faltan'}: ${faltan.map((f) => f.etiqueta).join(', ')}.`
}

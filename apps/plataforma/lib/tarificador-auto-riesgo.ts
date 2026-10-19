// «Bots (gratis)» de COCHE desde el RIESGO (14/10/2026). PURO: sin red ni envs, importable desde 'use client' y desde tests.
//
// Dos usos, UNA sola lógica (antes vivía a mano en `AutoNuevo.tsx`):
//   · `armarFormularioBotsAuto`: de las piezas ya resueltas (las del formulario de Avant2 o las del riesgo) al
//     `FormularioBotsAuto` que entiende el adaptador de auto. Aquí vive la regla del CP (el del riesgo o `'ficha'`).
//   · `formularioBotsAutoDeRiesgo`: las piezas salen del RIESGO de la oportunidad (datos del vehículo, intervinientes,
//     historial declarado), SIN pasar por Avant2: así los bots tienen entrada propia aunque Avant2 falle o no se pulse.
//
// 🚨 TARIFICAR ≠ EMITIR. Tres estados: `null` = «no se sabe», nunca un valor por defecto. Lo que falta lo dice
// `formularioBotAuto` (el adaptador) con QUÉ falta, jamás el valor (dato personal).
import { estadoOcasional, type RolFigura } from '@central/module-seguros'
import { datoDePersonaBot, type DatoPersona } from './tarificador-moto-formulario.ts'
import { MAX_COMPANIA_ANTERIOR } from '@central/module-tarificacion'
import type { EntradaBotAuto } from './tarificador-auto-formulario.ts'
import { resolverCompaniaAnterior, type CompaniaPorPolizas } from './tarificador-compania-poliza.ts'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const CP = /^\d{5}$/

/** Piezas ya resueltas del formulario de coche (vengan de Avant2 o del riesgo). */
export type PiezasBotsAuto = {
  matricula: string
  marca: string | null
  modelo: string | null
  version: string | null
  /** CP de circulación del RIESGO; sin uno de 5 dígitos viaja `'ficha'` (el servidor lee el del cliente y corta si tampoco está). */
  cpCirculacion: string | null | undefined
  fechaNacimiento: DatoPersona
  fechaCarne: DatoPersona
  sexo: string | null
  /** Código de garaje SOLO si es un dato (del riesgo o elegido por el corredor); el supuesto por defecto llega `null`. */
  garaje: string | null
  conductorEnOtraFicha: boolean
  propietarioEnOtraFicha: boolean
  tieneSeguroActual: boolean
  aniosAsegurado: string
  aniosSinSiniestros: string
  siniestrosUltimos5: string
  companiaAnterior: string | null
  /** 15/10/2026: lo que Allianz Turismos supone si no viene (y lo declara). Opcionales: sin ellos, el bot supone. */
  fechaMatriculacion?: string | null
  fechaVencimiento?: string | null
  conductorOcasional?: boolean | null
}

/** Piezas → entrada del adaptador de coche. PURA. */
export function armarFormularioBotsAuto(p: PiezasBotsAuto): EntradaBotAuto {
  return {
    matricula: p.matricula,
    marca: p.marca,
    modelo: p.modelo,
    version: p.version,
    codigoPostal: CP.test(p.cpCirculacion ?? '') ? p.cpCirculacion! : 'ficha',
    fechaNacimiento: p.fechaNacimiento,
    fechaCarne: p.fechaCarne,
    sexo: p.sexo,
    garaje: p.garaje,
    conductorEnOtraFicha: p.conductorEnOtraFicha,
    propietarioEnOtraFicha: p.propietarioEnOtraFicha,
    tieneSeguroActual: p.tieneSeguroActual,
    aniosAsegurado: p.aniosAsegurado,
    aniosSinSiniestros: p.aniosSinSiniestros,
    siniestrosUltimos5: p.siniestrosUltimos5,
    companiaAnterior: p.companiaAnterior,
    ...(p.fechaMatriculacion !== undefined ? { fechaMatriculacion: p.fechaMatriculacion } : {}),
    ...(p.fechaVencimiento !== undefined ? { fechaVencimiento: p.fechaVencimiento } : {}),
    ...(p.conductorOcasional !== undefined ? { conductorOcasional: p.conductorOcasional } : {}),
  }
}

/** Lo mínimo del `Riesgo` (`lib/riesgo-asegura.ts`) que hace falta; estructural para no acoplar el helper al tipo entero. */
export type RiesgoParaBotsAuto = {
  oportunidad: { clienteId: string; matricula: string | null; vence?: string | null; aseguradora?: string | null; aseguradoraActual?: boolean | null }
  roles: readonly string[]
  figuras: readonly { rol: string; clienteId: string; empresa: boolean; faltan: string[] | null }[]
  datosVehiculo: {
    matricula: string | null; marca: string | null; modelo: string | null; version: string | null
    garaje: string | null; cpCirculacion: string | null; fechaMatriculacion?: string | null
  } | null
  historial: {
    seguroAnterior: { siniestrosUltimos5: number | null; aniosSinSiniestros: number | null; fechaVencimiento?: string | null } | null
    historialDeclarado: {
      aniosAsegurado: number | null; aniosSinSiniestros: number | null; siniestrosUltimos5: number | null; tieneSeguroActual: boolean | null
    }
    carnet: { fecha: string | null; legible: boolean } | null
  } | null
  /** Conductor ocasional (`Riesgo.conductorOcasional`): `null`/ausente = no se sabe (sin preguntar). */
  conductorOcasional?: { ningunoConfirmadoAt: string | null } | null
}

/**
 * Vencimiento de la póliza ACTUAL para la fecha de efecto del bot (15/10/2026): el más tardío de los que se saben (el de la
 * oportunidad, que se corre al próximo ciclo, y el leído del documento). Sin ninguno con forma de fecha → `null` (el bot supone
 * «mañana» y lo declara). PURA y sin reloj: si el más tardío ya pasó, el bot lo descarta.
 */
export function vencimientoActualDeRiesgo(r: Pick<RiesgoParaBotsAuto, 'oportunidad' | 'historial'>): string | null {
  const c = [r.oportunidad.vence, r.historial?.seguroAnterior?.fechaVencimiento]
    .map((v) => (typeof v === 'string' ? v.trim().slice(0, 10) : ''))
    .filter((v) => ISO.test(v))
    .sort()
  return c.length ? c[c.length - 1]! : null
}

/** Valores de cajón que NO son una compañía (misma lista que `nombreCompaniaUtil` de asegura). */
const COMPANIA_CAJON = new Set(['otro', 'otra', 'otros', 'n/a', 'na', 'ninguna', 'ninguno', 'desconocida', 'desconocido', 'no consta', 'sin datos', '-', '?'])

/**
 * Compañía anterior que la oportunidad YA sabe: la aseguradora de HOY (`poliza_competencia`, `aseguradoraActual === true`); la de
 * nuestra oferta (`aseguradoraActual` false/null/ausente) NO vale. Vacía, de cajón o más larga que el tope → `null` (no consta). PURA.
 */
export function companiaAnteriorDeRiesgo(r: Pick<RiesgoParaBotsAuto, 'oportunidad'> & Partial<Pick<RiesgoParaBotsAuto, 'historial'>>): string | null {
  if (r.oportunidad.aseguradoraActual !== true) return null
  // Años asegurado declarados = 0: no hay seguro anterior que nombrar (la aseguradora de la oportunidad no es «la anterior»).
  if (r.historial?.historialDeclarado?.aniosAsegurado === 0) return null
  const t = (r.oportunidad.aseguradora ?? '').replace(/\s+/g, ' ').trim()
  return t === '' || t.length > MAX_COMPANIA_ANTERIOR || COMPANIA_CAJON.has(t.toLowerCase()) ? null : t
}

/** ¿Hay conductor ocasional? `true` ficha en el papel · `false` confirmado que no · `null` sin preguntar o no aplica (misma regla que asegura). PURA. */
export function conductorOcasionalDeRiesgo(r: Pick<RiesgoParaBotsAuto, 'roles' | 'figuras' | 'conductorOcasional'>): boolean | null {
  const e = estadoOcasional({ roles: r.roles as readonly RolFigura[], figuras: r.figuras as readonly { rol: RolFigura }[], conductorOcasional: r.conductorOcasional ?? null })
  return e === 'si' ? true : e === 'ninguno' ? false : null
}

const texto = (n: number | null | undefined): string => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? String(n) : '')

/** Matrícula normalizada como la pinta «Datos del vehículo»; sin ella, la de la oportunidad. */
export function matriculaDeRiesgo(r: Pick<RiesgoParaBotsAuto, 'oportunidad' | 'datosVehiculo'>): string {
  return (r.datosVehiculo?.matricula ?? r.oportunidad.matricula ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
}

/** Id de la ficha del tomador del riesgo (la figura `tomador`; sin ella, el cliente de la oportunidad). */
export function tomadorDeRiesgoBots(r: Pick<RiesgoParaBotsAuto, 'oportunidad' | 'figuras'>): string {
  return r.figuras.find((f) => f.rol === 'tomador')?.clienteId ?? r.oportunidad.clienteId
}

/** Riesgo de la oportunidad de coche → formulario que entiende el adaptador de auto (sin Avant2). PURA. */
export function formularioBotsAutoDeRiesgo(r: RiesgoParaBotsAuto, porPolizas: CompaniaPorPolizas = { estado: 'pendiente' }): EntradaBotAuto {
  const dv = r.datosVehiculo
  const tomadorId = tomadorDeRiesgoBots(r)
  const tomador = r.figuras.find((f) => f.rol === 'tomador') ?? null
  const otraFicha = (rol: string) => r.roles.includes(rol) && r.figuras.some((f) => f.rol === rol && f.clienteId !== tomadorId)
  // Lo que a la FICHA del tomador le falta (como `faltanInicial` de Avant2, pero leído del riesgo). `null` = no se pudo leer
  // → `datoDePersonaBot` lo trata como «lo mirará el servidor» y no afirma que falte.
  const faltanFicha = tomador?.faltan == null ? null : tomador.faltan.map((k) => ({ campo: k === 'fechaNacimiento_invalida' ? 'fechaNacimiento' : k }))
  const carnet = r.historial?.carnet ?? null
  const fechaCarnet = carnet && carnet.legible && carnet.fecha && ISO.test(carnet.fecha) ? carnet.fecha : ''
  const decl = r.historial?.historialDeclarado ?? null
  const ant = r.historial?.seguroAnterior ?? null
  // Compañía anterior: la del riesgo; si no hay, la de la póliza de coche en vigor del cliente (solo si es UNA; años = 0 → ninguna).
  const compAnt = resolverCompaniaAnterior(companiaAnteriorDeRiesgo(r), decl?.aniosAsegurado, porPolizas)
  return armarFormularioBotsAuto({
    matricula: matriculaDeRiesgo(r),
    marca: dv?.marca ?? null,
    modelo: dv?.modelo ?? null,
    version: dv?.version ?? null,
    cpCirculacion: dv?.cpCirculacion,
    fechaNacimiento: datoDePersonaBot('fechaNacimiento', faltanFicha, {}),
    fechaCarne: datoDePersonaBot('fechaCarnet', faltanFicha, { fechaCarnet }),
    sexo: null,
    garaje: dv?.garaje ?? null,
    conductorEnOtraFicha: tomador?.empresa === true || otraFicha('conductor_habitual'),
    propietarioEnOtraFicha: otraFicha('propietario'),
    // `null` (no se sabe) y «sin seguro» no se distinguen aquí: ambos dejan al adaptador diciendo QUÉ falta, nunca inventan.
    // Una póliza en vigor de la cartera propuesta como anterior implica seguro actual, salvo que se haya declarado lo contrario.
    tieneSeguroActual: decl?.tieneSeguroActual ?? (ant !== null || compAnt.propuestaDePoliza),
    aniosAsegurado: texto(decl?.aniosAsegurado),
    aniosSinSiniestros: texto(decl?.aniosSinSiniestros ?? ant?.aniosSinSiniestros),
    siniestrosUltimos5: texto(decl?.siniestrosUltimos5 ?? ant?.siniestrosUltimos5),
    companiaAnterior: compAnt.compania,
    // Supuestos de Allianz Turismos: lo que el riesgo sabe viaja; lo demás lo supone el bot y lo declara junto al precio.
    fechaMatriculacion: dv?.fechaMatriculacion ?? null,
    fechaVencimiento: vencimientoActualDeRiesgo(r),
    conductorOcasional: conductorOcasionalDeRiesgo(r),
  })
}

/** Compañías cuyo bot DA DE ALTA al tomador nuevo con su nombre, apellidos y nacimiento (Mapfre NSEI, 14/10/2026). */
export const COMPANIAS_ALTA_TOMADOR = ['mapfre'] as const

/**
 * Lo que a la FICHA del tomador le falta para que Mapfre pueda darlo de alta si no lo conoce (nombre, primer apellido y
 * fecha de nacimiento; en empresa, la razón social), en castellano y sin valores. `null` = no se pudo leer la ficha (no se
 * afirma que falte: lo comprueba asegura al encolar y, si falta, responde 422 `falta_datos_tomador` sin gastar máquina). PURA.
 */
export function faltanFichaTomadorParaAlta(r: Pick<RiesgoParaBotsAuto, 'figuras'>): string[] | null {
  const t = r.figuras.find((f) => f.rol === 'tomador') ?? null
  if (!t || t.faltan == null) return null
  const k = new Set(t.faltan)
  if (t.empresa) return k.has('nombre') ? ['la razón social'] : []
  const out: string[] = []
  if (k.has('dni')) out.push('el DNI/NIE')
  if (k.has('nombre')) out.push('el nombre')
  if (k.has('apellido1')) out.push('el primer apellido')
  if (k.has('fechaNacimiento') || k.has('fechaNacimiento_invalida')) out.push('la fecha de nacimiento')
  return out
}

/** «Falta el nombre y la fecha de nacimiento en la ficha del tomador…» o `null` si no falta nada (o no se sabe). PURA. */
export function avisoFichaTomadorParaAlta(faltan: readonly string[] | null): string | null {
  if (!faltan || faltan.length === 0) return null
  const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`
  return `Falta ${lista} en la ficha del tomador: Mapfre lo da de alta con esos datos si no lo conoce. Complétalo en la ficha.`
}

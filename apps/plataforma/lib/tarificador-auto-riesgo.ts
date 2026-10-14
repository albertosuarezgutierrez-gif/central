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
import { datoDePersonaBot, type DatoPersona } from './tarificador-moto-formulario.ts'
import type { EntradaBotAuto } from './tarificador-auto-formulario.ts'

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
  }
}

/** Lo mínimo del `Riesgo` (`lib/riesgo-asegura.ts`) que hace falta; estructural para no acoplar el helper al tipo entero. */
export type RiesgoParaBotsAuto = {
  oportunidad: { clienteId: string; matricula: string | null }
  roles: readonly string[]
  figuras: readonly { rol: string; clienteId: string; empresa: boolean; faltan: string[] | null }[]
  datosVehiculo: {
    matricula: string | null; marca: string | null; modelo: string | null; version: string | null
    garaje: string | null; cpCirculacion: string | null
  } | null
  historial: {
    seguroAnterior: { siniestrosUltimos5: number | null; aniosSinSiniestros: number | null } | null
    historialDeclarado: {
      aniosAsegurado: number | null; aniosSinSiniestros: number | null; siniestrosUltimos5: number | null; tieneSeguroActual: boolean | null
    }
    carnet: { fecha: string | null; legible: boolean } | null
  } | null
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
export function formularioBotsAutoDeRiesgo(r: RiesgoParaBotsAuto): EntradaBotAuto {
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
    tieneSeguroActual: decl?.tieneSeguroActual ?? ant !== null,
    aniosAsegurado: texto(decl?.aniosAsegurado),
    aniosSinSiniestros: texto(decl?.aniosSinSiniestros ?? ant?.aniosSinSiniestros),
    siniestrosUltimos5: texto(decl?.siniestrosUltimos5 ?? ant?.siniestrosUltimos5),
    companiaAnterior: null,
  })
}

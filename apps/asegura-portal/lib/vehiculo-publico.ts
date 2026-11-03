// El QR del VEHÍCULO (27/10/2026, F1) — lo que se enseña al escanearlo, armado en el servidor.
//
// Aquí NO hay ninguna consulta propia (cero `prisma.*`): se encadenan tres lecturas que ya tienen su frontera, y
// el resultado pasa SIEMPRE por la allow-list pura `vistaPublicaVehiculo()` antes de llegar a la página:
//   1. `vehiculoPorToken()` (`lib/vehiculo-token.ts`, la única sin identidad): la etiqueta, su bien y sus
//      interruptores. Sin ella, 404.
//   2. El seguro, EN VIVO y por la matrícula del bien (nunca una foto guardada al imprimir):
//        - particular → `carteraDeIdentidad(<dueño del bien>)`, la misma lectura que su bóveda, solo las PROPIAS;
//        - empresa    → `vehiculoDeEmpresaParaQr(<empresa del bien>)` de `lib/flota.ts` (pólizas EN VIGOR).
//      El dueño sale del bien que abrió el token; esta función no recibe ningún id de la request.
//   3. Los teléfonos, del catálogo único (`companiasConCanal`).
//
// Cuando los interruptores apagan carretera y estado, no se lee la cartera: lo que no se va a enseñar no se pide.
import {
  canalDeCompania,
  claveVehiculo,
  esRamoFlota,
  interruptoresEfectivos,
  itvDeVehiculo,
  semaforoItv,
  semaforoSeguro,
  vistaPublicaVehiculo,
  type EntradaVistaPublica,
  type VistaPublicaVehiculo,
} from '@central/module-seguros-portal'

import { companiasConCanal } from './canales-compania'
import { carteraDeIdentidad, cuentaComoEnVigor, type PolizaPortal } from './cartera-lectura'
import { vehiculoDeEmpresaParaQr } from './flota'
import { vehiculoPorToken, type VehiculoAbierto } from './vehiculo-token'

const dia = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/** De las pólizas propias de ese vehículo, la que manda: la que está en vigor y vence más tarde. */
function polizaQueManda(candidatas: readonly PolizaPortal[]): PolizaPortal | null {
  const enVigor = candidatas.filter((p) => cuentaComoEnVigor(p))
  const lista = enVigor.length > 0 ? enVigor : candidatas
  return [...lista].sort((a, b) => (b.fechaVencimiento?.getTime() ?? 0) - (a.fechaVencimiento?.getTime() ?? 0))[0] ?? null
}

async function entradaDePersona(a: VehiculoAbierto, identidadDueno: string, hoy: Date): Promise<EntradaVistaPublica> {
  const clave = claveVehiculo(a.bien.matricula)
  const cartera = await carteraDeIdentidad(identidadDueno)
  // Solo las PROPIAS de persona (el QR del particular se crea desde ellas) y del MISMO vehículo (por matrícula).
  const candidatas =
    clave === null
      ? []
      : cartera.propias
          .filter((t) => t.tipoPersona !== 'juridica')
          .flatMap((t) => t.polizas)
          .filter((p) => esRamoFlota(p.ramo) && claveVehiculo(p.bien.matricula) === clave)
  const p = polizaQueManda(candidatas)
  const enVigor = p !== null && cuentaComoEnVigor(p)
  const itv = itvDeVehiculo({
    // Sin póliza no sabemos si es coche o moto: sin perfil, la ITV es «no lo sabemos».
    ramo: p?.ramo ?? null,
    matricula: clave,
    matriculacionCompania: p?.bien.fechaMatriculacion ?? null,
    matriculacionDeclarada: dia(a.bien.fechaMatriculacion),
    hoy,
  })
  return {
    dueno: { tipo: 'persona' },
    matricula: clave,
    // Una póliza que ya no está en vigor no da «datos para carretera»: llamar a esa compañía no sirve de nada.
    poliza: enVigor ? { compania: p.compania, numeroPoliza: p.numeroPoliza } : null,
    canal: enVigor ? canalDeCompania(p.compania, companiasConCanal()) : null,
    semaforos: {
      itv: semaforoItv(itv),
      // La MISMA regla de «en vigor» que la bóveda (`cuentaComoEnVigor`): una renovación sin confirmar no es vencida,
      // y una póliza terminada no dice «sin seguro» (puede estar asegurado en otra parte) → «no lo sabemos».
      seguro: semaforoSeguro(p === null ? null : { enVigor, fechaVencimiento: dia(p.fechaVencimiento) }, hoy),
    },
    recordatorios: null,
  }
}

async function entradaDeEmpresa(a: VehiculoAbierto, empresaId: string, hoy: Date): Promise<EntradaVistaPublica | null> {
  const clave = claveVehiculo(a.bien.matricula)
  const d = await vehiculoDeEmpresaParaQr(empresaId, clave)
  if (d === null) return null
  const v = d.vehiculo
  return {
    dueno: { tipo: 'empresa', razonSocial: d.razonSocial, tipoFicha: d.tipoFicha },
    matricula: clave,
    poliza: v ? { compania: v.compania, numeroPoliza: v.numeroPoliza } : null,
    canal: v ? canalDeCompania(v.compania, companiasConCanal()) : null,
    semaforos: {
      itv: semaforoItv(v?.itv ?? null),
      // La flota solo trae pólizas EN VIGOR: lo que no está es «no lo sabemos», nunca «vencido».
      seguro: semaforoSeguro(v ? { enVigor: true, fechaVencimiento: v.vencimiento.fecha } : null, hoy),
    },
    recordatorios: null,
  }
}

const VACIA: EntradaVistaPublica = {
  dueno: { tipo: 'persona' },
  matricula: null,
  poliza: null,
  canal: null,
  semaforos: { itv: 'no_sabemos', seguro: 'no_sabemos' },
  recordatorios: null,
}

/**
 * La vista pública del QR. `null` = 404 (token mal formado, inexistente, anulado, bien que no es vehículo o
 * empresa que ya no está viva): la página no distingue los casos.
 */
export async function vistaPublicaPorToken(tokenCrudo: unknown, hoy: Date = new Date()): Promise<{ qrId: string; vista: VistaPublicaVehiculo } | null> {
  const a = await vehiculoPorToken(tokenCrudo)
  if (a === null) return null
  const interruptores = interruptoresEfectivos(a.publicoVehiculo, a.publicoDueno)
  const leerCartera = interruptores.datosCarretera || interruptores.estadoAlDia

  let entrada: EntradaVistaPublica | null
  if (a.bien.identidadId !== null) {
    entrada = leerCartera ? await entradaDePersona(a, a.bien.identidadId, hoy) : VACIA
  } else if (a.bien.clienteId !== null) {
    // La empresa se comprueba viva SIEMPRE (aunque no se vaya a enseñar nada): una ficha fusionada da 404.
    entrada = await entradaDeEmpresa(a, a.bien.clienteId, hoy)
  } else {
    entrada = null
  }
  if (entrada === null) return null
  return { qrId: a.qrId, vista: vistaPublicaVehiculo(entrada, interruptores) }
}

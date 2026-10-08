// Del documento al riesgo, parte 2 (05/10/2026): empareja lo que el OCR leyó del vehículo con el catálogo de
// Codeoscopic para dejar en `info_riesgo.datosVehiculo` los ids (marca → modelo → combustible → versión) que
// precargan la cascada de la pantalla de precio.
//
// 🚨 SOLO catálogo (GET gratis). PROHIBIDO `GET /vehicles?registrationPlate=` (cuesta créditos) y tarificar.
// Criterio de siempre: EXACTO normalizado (`emparejar`); ante la duda, `null` y lo elige la corredora. El
// combustible y la versión solo se fijan con UNA candidata inequívoca. Fail-soft: si el catálogo no responde
// (o Codeoscopic no está configurado), la oportunidad se crea igual, sin ids y sin afirmar nada.

import { datosVehiculoDeDocumento, SIN_IDS_CATALOGO, type DatosVehiculoRiesgo, type IdsCatalogoVehiculo, type VehiculoLeido } from '@central/module-seguros'
import { emparejar, normalizarTexto, type Opcion } from './codeoscopic/opciones.ts'

export type CatalogosVehiculo = {
  marcas(): Promise<Opcion[]>
  modelos(marcaId: string): Promise<Opcion[]>
  motores(): Promise<Opcion[]>
  versiones(marcaId: string, modeloId: string, motorId: string): Promise<Opcion[]>
}

export type VehiculoParaEmparejar = VehiculoLeido & { combustible?: string | null }

/** Español → el literal que suele traer el catálogo del vendor. Solo traduce; nunca decide entre varias. */
const COMBUSTIBLE_EN: Record<string, string[]> = {
  gasolina: ['gasoline', 'petrol'],
  diesel: ['diesel'],
  gasoil: ['diesel'],
  gasoleo: ['diesel'],
  electrico: ['electric'],
  hibrido: ['hybrid'],
}

/** El id del combustible si hay UNA sola candidata (por nombre, por id o por su traducción); si no, `null`. */
export function emparejarCombustible(motores: Opcion[], texto: string | null | undefined): string | null {
  if (!texto || normalizarTexto(texto) === '') return null
  const base = normalizarTexto(texto)
  const intentos = [texto, ...(COMBUSTIBLE_EN[base] ?? [])]
  const porId: Opcion[] = motores.map((m) => ({ id: m.id, nombre: m.id }))
  const ids = new Set<string>()
  for (const t of intentos) {
    const a = emparejar(motores, t)
    const b = emparejar(porId, t)
    if (a) ids.add(a.id)
    if (b) ids.add(b.id)
  }
  return ids.size === 1 ? [...ids][0] : null
}

/**
 * Cascada de emparejamiento. Cada paso necesita el anterior; en cuanto uno no es inequívoco (o falla la red),
 * se devuelve lo conseguido hasta ahí. Nunca lanza.
 */
export async function emparejarVehiculo(leido: VehiculoParaEmparejar, cat: CatalogosVehiculo): Promise<IdsCatalogoVehiculo> {
  const ids: IdsCatalogoVehiculo = { ...SIN_IDS_CATALOGO }
  try {
    if (!leido.marca) return ids
    const marca = emparejar(await cat.marcas(), leido.marca)
    if (!marca) return ids
    ids.marcaId = marca.id
    if (!leido.modelo) return ids
    const modelo = emparejar(await cat.modelos(marca.id), leido.modelo)
    if (!modelo) return ids
    ids.modeloId = modelo.id
    const motorId = emparejarCombustible(await cat.motores(), leido.combustible)
    if (!motorId) return ids
    ids.motorId = motorId
    if (!leido.version) return ids
    const version = emparejar(await cat.versiones(marca.id, modelo.id, motorId), leido.version)
    if (version) ids.codigoVehiculo = version.id
    return ids
  } catch {
    return ids
  }
}

/** Tope para no frenar la subida de un documento por un catálogo lento. */
const TOPE_CATALOGO_MS = 8000

/**
 * `info_riesgo.datosVehiculo` de un documento de auto/moto, o `null` si no trae nada del vehículo.
 * Solo AUTO busca ids (los de moto son otro catálogo y la pantalla de moto no los precarga hoy).
 * `catalogos` se inyecta en los tests; en producción sale de la config de Codeoscopic (gratis, sin interruptor).
 */
export async function datosVehiculoParaOportunidad(
  ramo: string,
  leido: VehiculoParaEmparejar,
  catalogos: CatalogosVehiculo | null,
): Promise<DatosVehiculoRiesgo | null> {
  let ids = SIN_IDS_CATALOGO
  if (ramo === 'auto' && catalogos) {
    let timer: ReturnType<typeof setTimeout> | undefined
    ids = await Promise.race([
      emparejarVehiculo(leido, catalogos),
      new Promise<IdsCatalogoVehiculo>((res) => { timer = setTimeout(() => res(SIN_IDS_CATALOGO), TOPE_CATALOGO_MS) }),
    ]).finally(() => clearTimeout(timer))
  }
  return datosVehiculoDeDocumento(leido, ids)
}

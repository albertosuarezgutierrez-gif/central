// Los catálogos REALES de Codeoscopic para `oportunidad-vehiculo-catalogo.ts` (solo GET de catálogo: gratis).
// Aparte para que el emparejador puro se pruebe sin tocar red ni config.
import { resolverConfig } from './codeoscopic/config.ts'
import { marcas, modelos, tiposDeMotor, versiones } from './codeoscopic/catalogos.ts'
import type { CatalogosVehiculo } from './oportunidad-vehiculo-catalogo.ts'

/** `null` = Codeoscopic sin configurar (se ignora el interruptor de tarificación: esto no gasta). */
export function catalogosVehiculoReales(env: Record<string, string | undefined> = process.env): CatalogosVehiculo | null {
  const r = resolverConfig(env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') return null
  const config = r.config
  return {
    marcas: () => marcas(config),
    modelos: (marcaId) => modelos(config, marcaId),
    motores: () => tiposDeMotor(config),
    versiones: (marcaId, modeloId, motor) => versiones(config, marcaId, modeloId, motor),
  }
}

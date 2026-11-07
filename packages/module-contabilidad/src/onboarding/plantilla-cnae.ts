// Onboarding · elegir la plantilla sectorial por CNAE. Reúne lo que YA existe (`sugerenciaPorCnae`, `PLANTILLAS`) en lo que necesita la pantalla:
// la sugerida (con su porqué), todas las seleccionables y cuántas cuentas añade cada una al PGC. Nunca se impone: el dueño o el gestor confirma.
import { PLANTILLAS, SECTORES_PLANTILLA, type SectorPlantilla } from '../plantillas/plantillas.ts'
import { sugerenciaPorCnae, type SugerenciaCnae } from '../plantillas/cnae.ts'

export type OpcionPlantilla = { sector: SectorPlantilla; nombre: string; cuentasExtra: number; sugerida: boolean }
export function opcionesPlantilla(cnae: unknown): { sugerencia: SugerenciaCnae; opciones: OpcionPlantilla[] } {
  const sugerencia = sugerenciaPorCnae(cnae)
  return {
    sugerencia,
    opciones: SECTORES_PLANTILLA.map((sector) => ({
      sector, nombre: PLANTILLAS[sector].nombre,
      cuentasExtra: PLANTILLAS[sector].cuentasExtra.length, sugerida: sector === sugerencia.sector,
    })),
  }
}

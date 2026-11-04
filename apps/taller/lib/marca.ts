// Resolución de la marca por taller (multi-taller). PURO: sin BD.
// TODO(F1): leer logo/colores del taller desde Ajustes (schema `taller`); hoy solo existe la marca del piloto.
import { MARCA_TALLERES_G2, type Marca } from '@central/brand'

export type MarcaTaller = {
  marca: Marca
  logoUrl: string
  nombre: string
  /** Sello «con Grupo ASegura» (siempre presente: no es editable por el taller). */
  sello: { texto: string; color: string; colorOscuro: string; fuente: string; fontsHref?: string } | null
}

/** Id del taller piloto: configuración, no literal (env). */
export const tallerPilotoId = (): string => process.env.TALLER_PILOTO_ID ?? 'piloto'

export function resolverMarca(_tallerId: string): MarcaTaller {
  const marca = MARCA_TALLERES_G2
  const c = marca.coMarca
  return {
    marca,
    logoUrl: marca.logos.lockup ?? '/brand/talleres-g2-logo.png',
    nombre: marca.nombre,
    sello: c
      ? { texto: c.texto, color: c.color, colorOscuro: c.colorOscuro, fuente: c.fuente, fontsHref: c.googleFontsHref }
      : null,
  }
}

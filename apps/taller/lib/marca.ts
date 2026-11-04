// Resolución de la marca por taller (multi-taller). PURO: sin BD.
// Defaults = MARCA_TALLERES_G2 (@central/brand). El dueño puede cambiar logo y colores primario/secundario (Ajustes); lo no
// personalizado cae al default. El sello «con Grupo ASegura» sale SIEMPRE de la co-marca fija y NO admite personalización.
import { MARCA_TALLERES_G2, type Marca } from '@central/brand'
import { inkSobreClaro, inkSobreOscuro, NEGRO, rgba, textoSobre } from './contraste.ts'

export type Sello = { texto: string; color: string; colorOscuro: string; fuente: string; fontsHref?: string }
export type MarcaTaller = {
  marca: Marca
  logoUrl: string
  nombre: string
  /** Sello «con Grupo ASegura» (siempre presente: no es editable por el taller). */
  sello: Sello | null
}

/** Lo que el dueño puede personalizar. Nada más entra en la marca (ni sello, ni tipografía, ni nombre). */
export type MarcaPersonalizada = { primario?: string | null; secundario?: string | null; logoUrl?: string | null }

/** Id del taller piloto: configuración, no literal (env). */
export const tallerPilotoId = (): string => process.env.TALLER_PILOTO_ID ?? 'piloto'

/** Sello fijo: de la co-marca de la marca por defecto. Lo usan cabecera, login y correos; el taller no lo toca. */
export function selloFijo(): Sello | null {
  const c = MARCA_TALLERES_G2.coMarca
  return c ? { texto: c.texto, color: c.color, colorOscuro: c.colorOscuro, fuente: c.fuente, fontsHref: c.googleFontsHref } : null
}

/** Marca de G2 con el primario/secundario del taller (tokens derivados legibles: ver contraste.ts). */
export function marcaConColores(base: Marca, p?: string | null, s?: string | null): Marca {
  if (!p && !s) return base
  const claro = { ...base.paleta }
  const oscura = { ...base.paletaOscura } as NonNullable<Marca['paletaOscura']>
  const fondoOscuro = oscura.fondo ?? NEGRO
  if (p) {
    Object.assign(claro, {
      primario: p, primarioInk: inkSobreClaro(p, claro.fondo), primarioSuave: rgba(p, 0.16), sobrePrimario: textoSobre(p),
    })
    Object.assign(oscura, {
      primario: p, primarioInk: inkSobreOscuro(p, fondoOscuro), primarioSuave: rgba(p, 0.16), sobrePrimario: textoSobre(p),
    })
  }
  if (s) {
    Object.assign(claro, { acento: s, acentoInk: inkSobreClaro(s, claro.fondo), acentoSuave: rgba(s, 0.08) })
    Object.assign(oscura, { acento: s, acentoInk: inkSobreOscuro(s, fondoOscuro), acentoSuave: rgba(s, 0.1) })
  }
  return { ...base, paleta: claro, paletaOscura: oscura }
}

export function resolverMarca(_tallerId: string, personalizada?: MarcaPersonalizada | null): MarcaTaller {
  const base = MARCA_TALLERES_G2
  // Solo se leen estos tres campos: cualquier otra cosa que llegue (sello, nombre…) se ignora.
  const marca = marcaConColores(base, personalizada?.primario ?? null, personalizada?.secundario ?? null)
  return {
    marca,
    logoUrl: personalizada?.logoUrl || base.logos.lockup || '/brand/talleres-g2-logo.png',
    nombre: base.nombre,
    sello: selloFijo(),
  }
}

/** Fondos contra los que se valida el contraste (los de la marca por defecto). */
export const fondosMarca = () => ({ claro: MARCA_TALLERES_G2.paleta.fondo, oscuro: MARCA_TALLERES_G2.paletaOscura?.fondo ?? NEGRO })
/** Valores por defecto que se muestran en Ajustes. */
export const coloresPorDefecto = () => ({ primario: MARCA_TALLERES_G2.paleta.primario, secundario: MARCA_TALLERES_G2.paleta.acento })

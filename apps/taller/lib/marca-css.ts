// Tokens CSS de la marca del taller sobre la BASE de Grupo ASegura. PURO (sin BD).
// La base (colores neutros, radio, sombras) es `emitirRootCss(MARCA_ASEGURA)`; encima, SOLO el acento de marca del taller
// (`--brand*`: botón principal, menú activo, filetes). El acento sale de la paleta ya resuelta en `marca.ts`, que garantiza AA:
//   · `--on-brand`  = texto sobre el relleno de marca (negro sobre el lima G2: 14,9:1; blanco/negro según contraste en otros colores).
//   · `--brand-ink` = variante del color apta como TEXTO sobre fondo claro (lima oscurecido, ≥ 4,5:1).
// `--asegura` = cobalto Grupo ASegura, para la línea pequeña «con Grupo ASegura».
import { MARCA_ASEGURA, type Marca } from '@central/brand'

export function cssAcentoTaller(marca: Marca): string {
  const p = marca.paleta
  return `:root{--brand:${p.primario};--brand-ink:${p.primarioInk};--brand-soft:${p.primarioSuave};--on-brand:${p.sobrePrimario};--asegura:${MARCA_ASEGURA.paleta.primario}}`
}

/**
 * ia.rest — Design Tokens canónicos
 * Fuente única de verdad para colores y tipografías.
 * Todos los componentes deben importar de aquí en lugar de definir const C localmente.
 *
 * Tema base: CLARO (paper/cream)
 * Para fondos oscuros usar los tokens dark* / dkFg*
 */

export const C = {
  // ── Superficies claras ──────────────────────────────────────────
  paper:   '#F6F1E7',   // bg / bg1 — base crema
  paper2:  '#EFE7D6',   // bg2 — elevación 1
  paper3:  '#E5DAC2',   // bg3 — elevación 2
  bone:    '#FBF8F1',   // bg1 / card — la más clara
  rule:    '#D8CDB6',   // divisor sobre fondo claro
  ruleS:   '#B8A98B',   // divisor fuerte

  // ── Texto sobre fondo claro ─────────────────────────────────────
  ink:     '#1A1714',   // texto principal
  ink2:    '#3A332C',   // texto secundario
  ink3:    '#6B5F52',   // texto terciario
  ink4:    '#9A8D7C',   // texto tenue / placeholder

  // ── Superficies oscuras ─────────────────────────────────────────
  dark:    '#14110E',   // fondo oscuro base
  dark1:   '#1F1A15',   // elevación 1 oscuro
  dark2:   '#2A241D',   // elevación 2 oscuro
  darkRule:'#2F2820',   // divisor sobre fondo oscuro

  // ── Texto sobre fondo oscuro ────────────────────────────────────
  darkFg:  '#F6F1E7',   // dkFg  — texto principal
  darkFg2: '#C9BFAA',   // dkFg2 — texto secundario
  darkFg3: '#8D8270',   // dkFg3 — texto tenue

  // ── Acentos ─────────────────────────────────────────────────────
  red:     '#D9442B',   // verm — brand / CTA / urgencia
  redD:    '#A8311E',   // vermD — pressed
  redS:    '#F4D8CF',   // vermS — surface suave
  amber:   '#E8A33B',   // amb — aviso
  amberD:  '#A8761A',
  amberS:  '#F7E3B6',   // ambS
  green:   '#3F7D44',   // gr — marchar / ok
  greenS:  '#D4E4D2',   // grS
  blue:    '#2B6A9E',
  blueS:   'rgba(43,106,158,0.12)',
  teal:    '#2B6A6E',
  tealS:   'rgba(43,106,110,0.12)',

  // ── Aliases de compatibilidad ───────────────────────────────────
  // (evitar en código nuevo; usar los nombres canónicos de arriba)
  bg:      '#F6F1E7',   // → paper
  bg1:     '#FBF8F1',   // → bone
  bg2:     '#EFE7D6',   // → paper2
  bg3:     '#E5DAC2',   // → paper3
  verm:    '#D9442B',   // → red
  vermD:   '#A8311E',   // → redD
  vermS:   '#F4D8CF',   // → redS
  amb:     '#E8A33B',   // → amber
  ambD:    '#A8761A',   // → amberD
  ambS:    '#F7E3B6',   // → amberS
  gr:      '#3F7D44',   // → green
  grS:     '#D4E4D2',   // → greenS
  dkFg:    '#F6F1E7',   // → darkFg
  dkFg2:   '#C9BFAA',   // → darkFg2
  dkFg3:   '#8D8270',   // → darkFg3
  dkRule:  '#2F2820',   // → darkRule
  card:    '#FBF8F1',   // → bone (usado en algunos componentes)
} as const

/** Tipografías */
export const SE = "'Newsreader',Georgia,serif"
export const SN = "'Inter Tight',system-ui,sans-serif"
export const SM = "'JetBrains Mono',ui-monospace,monospace"
export const SC = "'Caveat',cursive"

/**
 * Paleta oscura para componentes de tema dark (BridgeSetupWizard, FichajesTab, etc.)
 * En estos componentes ink='#F6F1E7' (texto claro sobre fondo oscuro)
 */
export const DARK_C = {
  bg:      '#14110E',
  bg1:     '#1C1815',
  bg2:     '#242018',
  bg3:     '#2C2820',
  rule:    '#2E2820',
  ink:     '#F6F1E7',   // texto principal (claro)
  ink2:    '#D8CDB6',   // texto secundario
  ink3:    '#9A8D7C',   // texto terciario
  ink4:    '#6B5F52',   // texto tenue
  red:     '#D9442B',
  redD:    '#A8311E',
  redS:    'rgba(217,68,43,0.15)',
  amber:   '#E8A33B',
  ambS:    'rgba(232,163,59,0.15)',
  green:   '#3F7D44',
  verm:    '#D9442B',   // alias
  vermD:   '#A8311E',
  vermS:   'rgba(217,68,43,0.15)',
  gr:      '#3F7D44',
  amb:     '#E8A33B',
  paper:   '#F6F1E7',   // para contraste (texto sobre elementos light dentro de dark)
} as const

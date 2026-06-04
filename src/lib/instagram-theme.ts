// Acento de color + glifo por módulo para las plantillas de Instagram.
// Mantiene la base oscuro/crema de marca; solo cambia el acento por módulo.
// Colores alineados con src/lib/colors.ts (RED/green/amber/tostado/marrón).
export type ModuloTheme = { accent: string; glifo: string }

const DEFAULT_THEME: ModuloTheme = { accent: '#D9442B', glifo: '●' } // rojo marca

const THEMES: Record<string, ModuloTheme> = {
  voz:          { accent: '#D9442B', glifo: '●' },
  brain:        { accent: '#D9442B', glifo: '●' },
  qr:           { accent: '#3F7D44', glifo: '▢' },
  verifactu:    { accent: '#E8A33B', glifo: '§' },
  contabilidad: { accent: '#E8A33B', glifo: '§' },
  almacen:      { accent: '#9C8E7E', glifo: '▣' },
  compras:      { accent: '#9C8E7E', glifo: '▣' },
  eventos:      { accent: '#785F4B', glifo: '◆' },
}

export function temaModulo(modulo?: string | null): ModuloTheme {
  if (!modulo) return DEFAULT_THEME
  return THEMES[modulo.trim().toLowerCase()] || DEFAULT_THEME
}

import type { Marca } from './tipos'

// Convierte una Marca en el bloque de variables CSS que consume la UI. Los nombres
// coinciden con los que ya usan los globals.css de las apps (--bg, --accent, --text…)
// para poder re-tematizar sin reescribir el CSS, y añade los de marca (--brand*).
export function emitirVariables(m: Marca): string {
  const p = m.paleta
  const vars: Record<string, string> = {
    // Marca dominante (nuevo)
    '--brand': p.primario,
    '--brand-ink': p.primarioInk,
    '--brand-soft': p.primarioSuave,
    // Acento decorativo (compat con nombres existentes)
    '--accent': p.acento,
    '--accent-ink': p.acentoInk,
    '--accent-soft': p.acentoSuave,
    // Superficies
    '--bg': p.fondo,
    '--bg2': p.fondo2,
    '--panel': p.panel,
    '--panel2': p.panel2,
    '--border': p.borde,
    '--border-soft': p.bordeSuave,
    // Texto
    '--text': p.texto,
    '--muted': p.textoTenue,
    '--muted2': p.textoTenue2,
    // Estados
    '--ok': p.ok,
    '--warn': p.warn,
    '--danger': p.peligro,
    // Tipografía (--serif conserva el nombre por compat; puede ser un sans de marca)
    '--serif': m.tipografia.titulos,
    '--sans': m.tipografia.cuerpo,
    // Forma
    '--radio': m.radio,
  }
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
}

/** Bloque `:root { … }` listo para inyectar en un <style>. */
export function emitirRootCss(m: Marca): string {
  return `:root{${emitirVariables(m)}}`
}

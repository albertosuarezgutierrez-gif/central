// ¿Exige la compañía (Codeoscopic, AUTO) el detalle de siniestros de los últimos 5 años? PURO (15/10/2026).
//
// Vive aquí porque lo usan DOS lados y tienen que decir lo mismo: asegura decide con ello si manda
// `lastFiveYearsAccidents` (`exigeDetalleDeSiniestros` de `peticion-auto.ts` delega aquí), y la pantalla de plataforma
// pone el ✗ de «¿cuántos siniestros en 5 años?» exactamente cuando asegura lo va a exigir. Si cada lado tuviera su
// copia, la pantalla pediría un dato que no viaja (fricción) o dejaría pasar uno que la compañía rechaza con un 400
// que se paga.

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export function exigeSiniestrosUltimos5(d: {
  aseguradoAntes?: boolean | null
  aniosAsegurado?: number | null
  aniosSinSiniestros?: number | null
}): boolean {
  if (!d.aseguradoAntes) return false
  if (!numero(d.aniosSinSiniestros)) return false
  if (d.aniosSinSiniestros >= 5) return false
  // La excepción «tantos años limpio como asegurado» dice «nunca ha tenido un siniestro», y por eso el detalle sobra.
  // Pero `0 === 0` NO dice eso: dice que no hay dato, y colarlo por esta puerta manda la declaración de novel sin que
  // nada falle (ver el comentario de `aniosAsegurado` en `revisarDatosAuto`).
  if (d.aniosSinSiniestros === 0 && d.aniosAsegurado === 0) return true
  return d.aniosSinSiniestros !== d.aniosAsegurado
}

// ¿Puede el CLIENTE abrir este presupuesto? (revisión 18/10/2026)
//
// Un presupuesto que Alberto aún no ha mandado es un BORRADOR: puede cambiar, puede no salir nunca, y
// abrirlo dispara cosas que cuestan (la comparativa con IA de `/api/presupuesto/ia`). Quien tuviera el
// uuid de un borrador de su propia ficha no debe poder verlo antes de tiempo.
//
// 🚨 Pero `enviado_at === null` NO es siempre «borrador». Con el canal `whatsapp_enlace` el mensaje sale
// del móvil de Alberto: asegura sella `enlace_generado_at` (y escribe el evento `enlace_generado`) al
// abrir wa.me, y `enviado_at` solo cuando él confirma «ya lo he mandado» (`confirmarWhatsapp` en
// `apps/asegura/lib/envio-presupuesto.ts`). Entre una cosa y otra el cliente YA tiene el enlace y lo
// abre con el código del WhatsApp o con el de su correo. Ese es el estado `enlazado`, y es legítimo.
//
// El rol del portal NO tiene GRANT sobre `presupuesto.enlace_generado_at` ni `canal_aviso`, pero SÍ
// sobre `presupuesto_evento.tipo`: el evento `enlace_generado` es la prueba que se usa aquí.

export type SellosPublicacion = {
  enviadoAt: Date | null
  /** Consta el evento `enlace_generado` (el WhatsApp se abrió en el móvil del corredor). */
  enlaceGenerado: boolean
  /** Entró con la cookie del código del WhatsApp de ESTE presupuesto. */
  porWhatsapp: boolean
  /** Alberto con la vista de corredor: él ve también sus borradores. */
  vistaDeCorredor: boolean
}

/** `true` = el cliente lo puede abrir. Un borrador (ni enviado ni enlazado) no se abre. */
export function abiertoAlCliente(s: SellosPublicacion): boolean {
  if (s.vistaDeCorredor) return true
  if (s.enviadoAt !== null) return true
  // Enlazado: el WhatsApp ya salió (o pudo salir) del móvil de Alberto.
  if (s.enlaceGenerado || s.porWhatsapp) return true
  return false
}

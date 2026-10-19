// Cómo se abrió una oportunidad, en palabras, para la línea del historial de la ficha (19/10/2026). PURO.
//
// El lead que llegó por CORREO a hola@ quedaba anotado como «abierta sola desde un documento subido» (caía al `else`):
// mentía sobre el origen. Cada origen conocido tiene su texto; uno nuevo sin texto dice «automáticamente», nunca el de
// otro canal. Los valores son los de `ORIGEN_*` de `oportunidad-seguimiento.ts` (el cepo lo comprueba).
export function comoSeAbrioOportunidad(origen: string): string {
  switch (origen) {
    case 'ficha:manual': return 'a mano'
    case 'web:lead': return 'sola desde el formulario web'
    case 'correo:lead': return 'sola desde el correo del lead'
    case 'whatsapp_ia': return 'sola desde una conversación de WhatsApp'
    default: return origen.startsWith('documento') ? 'sola desde un documento subido' : 'automáticamente'
  }
}

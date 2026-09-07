// Traduce el mensaje crudo de un ErrorCodeoscopic (`codeoscopic_<clase>: {...json...}`)
// a algo que se pueda leer en pantalla sin descifrar JSON en inglés.
//
// No se toca `ErrorCodeoscopic.message` en sí: eso sigue viajando entero a los
// logs y a `historial_interno` (ahí SÍ hace falta cada campo, requestId incluido,
// para depurar). Esto es solo la capa de PRESENTACIÓN — si el texto no es el
// JSON esperado (p. ej. `recortar()` lo truncó a media llave), se enseña tal
// cual en vez de callarlo: un mensaje feo es mejor que uno que oculta el fallo.

export function formatearErrorVendor(mensajeCrudo: string): string {
  const sinPrefijo = mensajeCrudo.replace(/^codeoscopic_[a-z-]+:\s*/, '')
  const inicioJson = sinPrefijo.indexOf('{')
  if (inicioJson === -1) return sinPrefijo

  let cuerpo: { message?: unknown; error?: unknown; path?: unknown }
  try {
    cuerpo = JSON.parse(sinPrefijo.slice(inicioJson)) as typeof cuerpo
  } catch {
    return sinPrefijo
  }

  // `path` aquí es la ruta del ENDPOINT (siempre "/insurances"), no el campo
  // del contrato que falla — eso, cuando lo hay, ya viene dentro del propio
  // `message` (p. ej. "[Path '/externalId'] ..."). Añadirlo sería ruido.
  if (typeof cuerpo.message === 'string' && cuerpo.message.trim()) return cuerpo.message
  if (typeof cuerpo.error === 'string' && cuerpo.error.trim()) return cuerpo.error
  return sinPrefijo
}

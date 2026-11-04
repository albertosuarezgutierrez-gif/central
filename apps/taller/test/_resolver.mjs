export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto)
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && especificador.startsWith('.') && !/\.[a-z]+$/i.test(especificador)) {
      try { return await siguiente(`${especificador}.ts`, contexto) } catch { /* se relanza el original */ }
    }
    throw e
  }
}

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PAQUETES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages')

function centralAUrl(especificador) {
  const m = /^@central\/([^/]+)(\/.*)?$/.exec(especificador)
  if (!m) return null
  const dir = m[1] // la carpeta de packages/ se llama como el paquete sin el scope
  const pkg = JSON.parse(readFileSync(join(PAQUETES, dir, 'package.json'), 'utf8'))
  const sub = m[2] ? `.${m[2]}` : '.'
  const destino = typeof pkg.exports === 'object' ? pkg.exports[sub] : null
  if (!destino) return null
  return pathToFileURL(join(PAQUETES, dir, destino)).href
}

export async function resolve(especificador, contexto, siguiente) {
  const central = centralAUrl(especificador)
  if (central) return siguiente(central, contexto)
  try {
    return await siguiente(especificador, contexto)
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && especificador.startsWith('.') && !/\.[a-z]+$/i.test(especificador)) {
      try { return await siguiente(`${especificador}.ts`, contexto) } catch { /* se relanza el original */ }
    }
    throw e
  }
}

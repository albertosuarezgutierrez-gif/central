// Permite importar paquetes del monorepo con imports sin extensión (p. ej. @central/brand, pensado para el bundler de Next)
// desde los tests de Node: si un import relativo sin extensión no se resuelve, se prueba con `.ts`.
import { register } from 'node:module'
register('./_resolver.mjs', import.meta.url)

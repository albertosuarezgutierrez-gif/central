// Los tests de Node cargan los paquetes del monorepo SIN depender de que `pnpm install` haya enlazado esta app:
// `@central/<paquete>[/<subruta>]` se resuelve con el `exports` de packages/<paquete>/package.json (y los imports relativos sin
// extensión de esos paquetes, pensados para el bundler de Next, se prueban con `.ts`).
import { register } from 'node:module'
register('./_resolver.mjs', import.meta.url)

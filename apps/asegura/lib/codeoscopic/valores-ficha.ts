// Valores de la PERSONA que se pueden sacar de la ficha del cliente para
// reparar un 400 sin preguntar al corredor. Compartido por `/oferta` (ReRate)
// y `/emitir` (Submit): las dos llamadas piden campos que la cotización
// inicial no exigía, y las dos los reparan igual — ficha primero, nunca un
// dato inventado. Antes vivía duplicado (una copia solo para `nombreVia` en
// `oferta/route.ts`); esta es la única.

import { decryptField } from '@central/module-seguros-pii'
import { prisma } from '../tenant'
import { emailDeFicha } from '../email-ficha'
import { partirDireccion } from './direccion'
import { tiposDeVia } from './catalogos'
import { emparejar } from './opciones'
import type { ConfigCodeoscopic } from './config'
import type { CampoPersona } from './interprete-400'

const CAMPOS_SOPORTADOS: readonly CampoPersona[] = ['nombreVia', 'numeroVia', 'tipoVia', 'email']

/**
 * Sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el cifrado (`v1:…`) tal
 * cual sin lanzar: eso no es un valor, y tampoco es «no tiene».
 */
function descifrado(cifrado: string | null): string | null {
  if (!cifrado) return null
  try {
    const claro = decryptField(cifrado)
    return claro && !claro.startsWith('v1:') ? claro : null
  } catch {
    return null
  }
}

/**
 * `config` es OPCIONAL y solo hace falta para `tipoVia`: es la única pieza de
 * este fichero que toca red (14º 400 real, 12/09/2026 — el Submit exige
 * `roadType.id` además de `roadName`/`roadNumber`). `roadType` es una
 * referencia de CATÁLOGO (`GET /road-types`), no texto libre: nunca se manda
 * un id que no haya salido del catálogo vivo (misma regla que el resto de
 * catálogos de hogar, `docs/CODEOSCOPIC-API-PORTAL.md`), así que se empareja
 * el tipo de vía que trocea `partirDireccion()` contra ese catálogo con
 * `emparejar()` (exacto, normalizado; ambiguo o sin match = no se manda
 * nada). Sin `config` (o si el catálogo falla), `tipoVia` simplemente no se
 * resuelve — no es un error, es un dato que no se pudo comprobar.
 */
export async function valoresPersonaDesdeFicha(
  t: { correduria_id: string; poliza_id: string | null; cliente_id: string | null },
  pedidos: CampoPersona[],
  config?: ConfigCodeoscopic,
): Promise<Partial<Record<CampoPersona, string>>> {
  const pedidosSoportados = pedidos.filter((c) => CAMPOS_SOPORTADOS.includes(c))
  if (pedidosSoportados.length === 0) return {}
  if (!t.cliente_id && !t.poliza_id) return {}
  try {
    // 🚨 SIEMPRE por el cliente vivo, nunca por una lápida: `merged_into_cliente_id
    // is null` en las dos consultas de abajo. Sin esto, una ficha fusionada (50+
    // en esta cartera) devolvería la dirección/correo de la lápida — que puede
    // llevar meses sin actualizarse — en vez de los de la ficha superviviente.
    const filas = await prisma.$queryRaw<{ cliente_id: string; direccion: string | null }[]>`
      select c.id::text as cliente_id, c.direccion
      from clientes c
      where c.correduria_id = ${t.correduria_id}::uuid
        and c.merged_into_cliente_id is null
        and c.id = coalesce(
          ${t.cliente_id}::uuid,
          (select p.cliente_id from polizas p where p.id = ${t.poliza_id}::uuid limit 1)
        )
      limit 1
    `
    const fila = filas[0]
    if (!fila) return {}
    const resultado: Partial<Record<CampoPersona, string>> = {}
    const direccion = descifrado(fila.direccion)
    const partida = direccion ? partirDireccion(direccion) : null
    if (pedidosSoportados.includes('nombreVia') && partida?.nombre) resultado.nombreVia = partida.nombre
    if (pedidosSoportados.includes('numeroVia') && partida?.numero) resultado.numeroVia = partida.numero
    if (pedidosSoportados.includes('tipoVia') && partida?.tipoVia && config) {
      try {
        const catalogo = await tiposDeVia(config)
        const match = emparejar(catalogo, partida.tipoVia)
        if (match) resultado.tipoVia = match.id
      } catch {
        // Catálogo caído o inalcanzable: no se resuelve, nunca se inventa el id.
      }
    }
    if (pedidosSoportados.includes('email')) {
      // 🚨 Reutiliza `emailDeFicha` (email-ficha.ts) en vez de leer
      // `clientes.email` a pelo: esa columna es el ESPEJO, no la fuente — el
      // email principal puede vivir solo en `cliente_emails` (57 fichas de la
      // cartera, 5 de las 80 vivas), y una segunda implementación de «cuál es
      // el correo de este cliente» es justo la divergencia silenciosa que ese
      // fichero se extrajo para evitar (respeta además la baja de correo y el
      // ilegible≠inexistente que `descifrado()` de aquí no distingue).
      const email = await emailDeFicha(t.correduria_id, fila.cliente_id)
      if (email) resultado.email = email
    }
    return resultado
  } catch {
    return {}
  }
}

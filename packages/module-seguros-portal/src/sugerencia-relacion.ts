// Sugerir pedir acceso a partir de relaciones YA CONOCIDAS (12/09/2026).
//
// `cliente_relaciones` ya trae la relación real entre dos personas (o una
// persona y su empresa), cargada del volcado y mantenida por Alberto desde
// `/correduria` → Contactos — pero nada la usaba para SUGERIR pedir acceso a
// quien se registra en el portal. Reusa `relacionesDeFicha`/`permiteAutorizar`
// de `@central/module-seguros`: sin tabla nueva ni cálculo propio de relación,
// solo el filtro de qué sugerir.
//
// 🚨 Sugerir no es conceder. El `puede_ver_polizas` de `cliente_relaciones`
// dejó de ser un mecanismo de acceso el 03/09/2026 (ver `autorizacion.ts`) y
// aquí tampoco lo es: `puedeVer` en `false` es solo la señal de que hay algo
// que ofrecer, nunca la que abre nada. Y una relación `Sin vínculo` no se
// sugiere jamás — `permiteAutorizar()` ya lo excluye, misma guarda que usa
// `clientesVisiblesPara()`.
import { permiteAutorizar, relacionesDeFicha, type RelacionFila } from '@central/module-seguros'

export type SugerenciaRelacion = {
  relacionadoId: string
  /** «María Antonia · Cónyuge/Pareja de Hecho» — el tipo tal cual lo ve la ficha. */
  tipo: string
}

/**
 * Relaciones de `clienteId` sobre las que tiene sentido ofrecer «pedir
 * acceso»: con vínculo de verdad (nunca `Sin vínculo`) y sobre las que
 * `clienteId` todavía NO puede ver las pólizas.
 */
export function relacionesSugeribles(filas: readonly RelacionFila[], clienteId: string): SugerenciaRelacion[] {
  return relacionesDeFicha(filas, clienteId)
    .filter((r) => permiteAutorizar(r.tipo) && !r.puedeVer)
    .map((r) => ({ relacionadoId: r.relacionadoId, tipo: r.tipo }))
}

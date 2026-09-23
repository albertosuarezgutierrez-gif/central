// Ramos cuyo `risk` sabemos que la API CONTRADICE: no se paga por ellos.
//
// Auditoría del 23/09/2026 contra la referencia oficial
// (`docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md` de la raíz):
//   · vida    → mandamos `insured` + `capital`; `TermLifeRisk_V1` exige `deathBenefit`.
//   · salud   → mandamos `insured` + `capital`; `HealthRisk_V1` exige `insureds[]`.
//   · decesos → igual que salud (`BurialRisk_V1`, `insureds[]`).
// Un 200 con `errors[]` son 0,50€ sin precio, así que se corta ANTES del gasto.
// Ese mismo día `peticion-<ramo>.ts` pasó a la forma de la referencia
// (`deathBenefit`; `insureds[]`), pero nunca se ha probado contra el vendor:
// el desbloqueo lo decide Alberto, borrando la entrada (punto 4 del plan
// `docs/CODEOSCOPIC-PLAN-RAMOS-2026-09.md`).
//
// Se mira el ramo del contexto Y la línea del cuerpo: el contexto es opcional
// en `cotizar()`, y una petición sin él no puede colarse por ese hueco.

const BLOQUEADOS: Record<string, { lineaId: string; motivo: string }> = {
  vida: { lineaId: 'TermLife', motivo: 'la forma de `TermLifeRisk_V1` (`deathBenefit`) está sin probar contra el vendor' },
  salud: { lineaId: 'Health', motivo: 'la forma de `HealthRisk_V1` (`insureds[]`) está sin probar contra el vendor' },
  decesos: { lineaId: 'Burial', motivo: 'la forma de `BurialRisk_V1` (`insureds[]`) está sin probar contra el vendor' },
}

/** `null` = se puede cotizar; texto = por qué NO (y no se ha gastado nada). */
export function motivoRamoBloqueado(ramo: string | undefined, cuerpo: unknown): string | null {
  const lineaId = lineaDelCuerpo(cuerpo)
  for (const [nombre, b] of Object.entries(BLOQUEADOS)) {
    if (ramo === nombre || lineaId === b.lineaId) {
      return (
        `Cotizar ${nombre} está bloqueado: ${b.motivo} y un fallo pueden ser 0,50€ sin precio. ` +
        'Se desbloquea con el OK de Alberto. No se ha llamado a Codeoscopic: 0,00€.'
      )
    }
  }
  return null
}

function lineaDelCuerpo(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null
  const linea = (cuerpo as Record<string, unknown>).insuranceLine
  if (typeof linea !== 'object' || linea === null) return null
  const id = (linea as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
}

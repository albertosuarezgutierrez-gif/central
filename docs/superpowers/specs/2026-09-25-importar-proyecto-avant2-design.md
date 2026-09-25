# Importar a la intranet un proyecto creado a mano en Avant2 (diseño, 25/09/2026)

**Estado: diseño. Falta el OK de Alberto antes de programar** (regla 6 de `correduria-crm`:
toca la emisión). Caso que lo origina: proyecto **40842815** (Allianz, Mercedes ML 250 de Pablo
Guzmán Pueyo), tarificado en la web de Avant2 y que la intranet no sabe emitir.

## Qué hay hoy
- `/emitir` y `/oferta` exigen una fila en `seguros.codeoscopic_projects` con oferta aceptada y
  `poliza_id` (`emitir/route.ts:119-131`). Un proyecto de la web no tiene esa fila.
- `GET /api/operador/codeoscopic/proyecto?projectId=` lee cualquier proyecto por id (gratis).
- `POST /api/operador/poliza/emitida` acuña sin comprobar contra el vendor y no lo llama nadie.

## Lo que dice la API (spec de producción, ver `docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md`)
- `GET /insurances/{id}` y `GET /insurances?id=` (lista) funcionan con la credencial de la
  correduría; la lista va sin `X-User-Email` → alcance de toda la correduría.
- Que devuelva proyectos creados en la web: **[Probable], sin confirmar.** Primer paso = una
  lectura gratis `GET /insurances/40842815`. Si da 404 («not available for the provided
  credentials»), este diseño se cae y la respuesta es «se emite en Avant2».
- Emitir por API exige que la cotización traiga la acción `SubmitPolicyApplication`.

## Diseño propuesto (si la lectura sale bien)
1. **Pantalla:** en la ficha de la póliza a sustituir, «Traer proyecto de Avant2» con un campo
   para el número. Solo lectura hasta que el corredor confirma.
2. **Puerto nuevo** `POST /api/operador/codeoscopic/importar` `{ projectId, polizaId, confirmado }`:
   - `GET /insurances/{id}` (gratis). Comprueba: mismo tomador que la póliza (DNI del holder vs
     hash de la ficha, **nunca por nombre**), ramo igual al de la póliza, al menos una cotización
     con `SubmitPolicyApplication`, y que no exista ya fila para ese proyecto.
   - Guarda la fila de `codeoscopic_projects` con `poliza_id` y estado `cotizacion` (sin oferta
     aceptada) + `historial_interno`. **No llama a ReRate ni a Submit.**
   - Desde ahí se sigue el flujo de siempre: elegir oferta (ReRate), confirmar IBAN y fecha,
     Submit. Todas las guardas de `/emitir` se quedan igual.
3. **Nada automático:** ni barrido de la lista ni importación masiva. Uno a uno, con confirmación.

## Riesgos
- Emitir dos veces: si el proyecto ya tiene una solicitud viva en el vendor, `/emitir` ya
  responde 409 (lectura previa al Submit). Se mantiene.
- Tomador distinto: bloquea el import (422), no se «arregla».
- Coste: la importación es gratis; el ReRate y el Submit cuestan lo mismo que hoy (sin
  confirmar; se anotan en `codeoscopic_consumo`).

## Pasos antes de programar
1. Lectura gratis de `GET /insurances/40842815` desde el puerto (`/proyecto`) → ¿lo ve?
2. OK de Alberto a este diseño.

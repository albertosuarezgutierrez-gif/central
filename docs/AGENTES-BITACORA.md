# Bitácora de auto-informes de agentes — `central`

> **Para qué.** Cada agente programado (skill de `docs/SKILLS.md` § "Agentes programados")
> deja aquí UNA entrada por ejecución: qué hizo, qué dudó, qué falló. Es la materia prima
> del `agentes-entrenador` (rutina semanal) para mejorar los prompts por RENDIMIENTO real,
> no por intuición. El contenedor es efímero: si no queda escrito aquí, no existió.
>
> **Cómo se mantiene.** Los agentes SOLO añaden entradas arriba del todo (3-5 líneas máx.,
> en el mismo commit/PR de su pasada, o en un commit propio a `main` si su pasada no tocó
> el repo). El `agentes-entrenador` PODA las entradas ya procesadas en su pasada semanal
> (git guarda el histórico; este archivo no engorda). Nadie más borra aquí.
>
> **Formato por entrada (una línea de lista, multilinea si hace falta):**
> `- **YYYY-MM-DD · <skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: #xxx / SHA / —`
> Sin dudas ni fallos → escribir `dudas: —; fallos: —` (el "todo bien" también es señal).

## Entradas pendientes de procesar (lo más reciente arriba)
- **2026-08-23 · agentes-entrenador** · hizo: pasada semanal (rango 16/08→23/08, 20 entradas
  procesadas y podadas). Sin pendientes en `FEEDBACK-AGENTES.md`. Backlog de PRs abiertos: **4**
  (#1514/#1594/#1599/#1600 — el más antiguo del 20/08, ninguno de 2+ semanas; sano). Diagnóstico
  por agente: **facturas-correo** — 2 fallos propios en la semana con la misma raíz (17/08: copió
  2 duplicados a Drive sin comprobar que ya estaban archivados; 18/08: sobrescribió `factura_ref`
  de un movimiento ya `conciliado=true` sin leer su valor previo) → añadido caveat aditivo en
  `SKILL.md` ("antes de copiar o sobrescribir, comprueba qué hay ya"). **buscador-ia** — el
  incidente del 22/08 (NIM mató `z-ai/glm-5.2` por 410 antes de su EOL anunciada) se resolvió
  aplicando la regla añadida por el entrenador el 17/08 (verificar contra `/v1/models`/llamada
  real antes de dar un id por vivo): confirmado por harness+pg_net antes del swap → la regla
  funcionó, sin acción nueva. **mercado-booking** — el aviso arrastrado de "recorte por tope"
  (464-488 ventanas descartadas/día) se repite a diario pero sin `dudas`/`fallos` marcados por el
  propio agente, es capacidad del plan no un bug → sin acción. **psd2-health-check**,
  **pricing-agente** — incidencias del rango (contradicción Telegram↔panel, fechas
  `no_disponible` sin income) resueltas por PR de código en la misma pasada que las detectó, no
  por patrón de prompt → sin acción. Sin evidencia en el rango para ialimp-client-health,
  rrhh-compliance-calendar, github-vigia, conectores-vigia, fiscal-novedades, radar-espana,
  patrimonio-cfo, trading-analista (estos últimos dos con rutina aún pendiente de trigger).
  **Nota fuera de mi carril** (no es prompt, es código de `apps/plataforma`): el cron
  `facturas-scan` sigue mal-archivando en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` — repetido en
  la bitácora desde el 01/08 (23 días), última vez el 20/08. No lo toco (fuera del alcance de
  esta skill), lo señalo en el aviso Telegram para que no seas tú quien lo destape la próxima vez.
  Revisión transversal: sin contradicciones ni redundancias nuevas entre skills. dudas: —;
  fallos: —; PRs/commits: rama `claude/upbeat-shannon-52n3zw` (`SKILL.md` de `facturas-correo` +
  mantenimiento de esta bitácora/memoria).

<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-08-23 · pasada semanal (rango 16/08→23/08) · 20 entradas procesadas y podadas
(mercado-booking ×7, facturas-correo ×6, psd2-health-check ×2, pricing-agente ×2, buscador-ia ×2,
y el auto-informe del entrenador del 16/08). Backlog de PRs abiertos: **4**
(#1514/#1594/#1599/#1600, el más antiguo del 20/08 — sano, ninguno de 2+ semanas). Único fix
aplicado: caveat en `facturas-correo/SKILL.md` sobre comprobar el estado existente antes de
copiar/sobrescribir (2 fallos propios de la semana con la misma raíz — ver entrada de esta pasada
arriba).

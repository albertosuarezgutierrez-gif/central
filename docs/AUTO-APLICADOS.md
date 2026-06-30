# Bitácora de auto-aplicados — `central`

> **Para qué (idea G).** El **carril 1** de la auditoría diaria empuja los arreglos de texto
> (memoria/skills/docs/manuales) **directos a `main` sin que nadie los revise**. Esta bitácora
> es la transparencia de ese "se aplica solo": cada cambio auto-aplicado deja una línea aquí
> para que Alberto lo ojee de un vistazo y, si algo no le cuadra, lo revierta (queda en git).
>
> **Cómo se mantiene.** La propia auditoría añade entradas arriba del todo, en el mismo commit
> del cambio auto-aplicado. Formato por entrada: **fecha · archivo(s) · qué cambió · por qué ·
> SHA**. Lo que va por **carril 2 (PR draft + aviso)** NO entra aquí (ya tiene su PR como rastro).

---

## Registro (lo más reciente arriba)

<!-- La auditoría inserta aquí. Ejemplo de formato:
- **2026-06-27** · `docs/SKILLS.md` · añadida fila del comando `/foo` que faltaba · el comando
  existe en `.claude/commands/foo.md` desde el rango · `abc1234`
-->

- **2026-06-30** · `CLAUDE.md` (raíz) · añadidas verticales `apps/transporte` y `apps/alquiler` a la sección "Verticales" · faltaban desde su creación (27-28/06/2026) · 3f9b6d6 (commit de esta auditoría)
- **2026-06-30** · `MATRIZ.md` · count "17 modules total" → "23 modules total"; descripción `module-flota` corregida ("sin consumo aún" → "consumido por `apps/transporte`"); `transporte` y `alquiler` añadidos al árbol de `apps/` · count y árbol de apps estaban desactualizados · 3f9b6d6
- **2026-06-30** · `docs/FUENTES-DE-VERDAD.md` · 4 entries nuevas: `apps/transporte/CLAUDE.md`, `apps/alquiler/CLAUDE.md`, skill `transporte-maestro`, skill `alquiler-maestro` · las dos verticales nuevas de junio 2026 no tenían entradas en el mapa · 3f9b6d6
- **2026-06-30** · `docs/CONTEXTO-SESIONES.md` · 2 entradas añadidas: commit `c710153`/PR#598 (archivos huérfanos ia-rest + module-nominas) y commit `fe6162f` (contador 7 apps + salud arquitectura) · se habían mergeado el 29/06 sin anotarse en la memoria · 3f9b6d6
- **2026-06-30** · `docs/AUDITORIA-2026-06.md` · sección "Auditoría LIGERA 30/06/2026" añadida · informe de esta pasada · 3f9b6d6

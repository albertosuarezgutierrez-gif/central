# Concursos — Selector de sector (CPV) · Design

> Fecha: 2026-06-11 · Estado: aprobado por Alberto ("lo que veas mejor").
> Fase 2 del buscador de pliegos. Sustituye al "BOE como fuente" (descartado:
> el BOE solo cubre la AGE —ya en PLACSP— y su importe/plazo van en texto libre,
> aporta poco valor neto).

## Objetivo

Que el usuario busque "concursos de **mi sector**" eligiendo de una lista de sectores
con nombre claro (Limpieza, Obras, Catering, Jardinería…), **sin tener que saberse los
códigos CPV**. Hoy el buscador y el radar exigen teclear prefijos CPV a mano.

## Decisión

El **CPV** es la taxonomía oficial de sectores en contratación pública, pero es enorme
(~9.400 códigos) y crípticos. Curamos un catálogo de ~30 **sectores PYME** con etiqueta
en español → **divisiones CPV** (los 2 primeros dígitos), que el filtro ya casa por prefijo
(`cpv LIKE '90%'`). Selección múltiple: varios sectores se unen.

## Arquitectura

- **Puro y testeable** en el módulo `@central/module-concursos` (`src/sectores.ts`):
  `SECTORES: Sector[]` (catálogo) + `cpvDeSectores(ids): string[]` (une prefijos sin
  duplicados). Tipo `Sector { id, nombre, cpv[] }`. Exportado desde `index.ts`. Es lógica
  portable (cualquier vertical la reutiliza), por eso vive en el módulo, no en la app.
- **UI** (`apps/ialimp/app/admin/concursos/page.tsx`, `BuscadorPanel`): fila de **chips** de
  sector; al pulsarlos se rellena el campo `cpv` del filtro con `cpvDeSectores(...)`. El
  resto del flujo (buscar, guardar como alerta) **no cambia**: sigue mandando `cpv` como
  hasta ahora. El input manual de CPV se mantiene para usuarios avanzados.

## Tests (`node --test`, en el módulo)

- `SECTORES`: catálogo no vacío, ids únicos, cada sector con nombre y cpv.
- `cpvDeSectores`: une prefijos, deduplica, respeta orden, ignora ids desconocidos.

## Fuera de alcance

- Selector jerárquico de CPV completo (subdivisiones) — el de 2 dígitos cubre el 95% de los
  casos PYME.
- Chips de sector en el `RadarPanel` (se puede añadir igual luego; el buscador ya cubre el
  "guardar como alerta", que es el puente).
- BOE como fuente (descartado, ver arriba).

## Verificación

Tests del módulo en verde (los previos + los nuevos) y `apps/ialimp npm run build → ✓ Compiled successfully`.
Sin migración ni cambios de BD: es puramente cliente + catálogo.

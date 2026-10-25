# Auditoría profunda — 25/10/2026

Typecheck de las 13 apps, tests y guardián: **verdes** (guardián 1732, vitest 1238, module-seguros 2270 / pii 48 / portal 931). Matriz de `tests.yml` = `ls apps` (13). `lint-agentes`: 0 ERROR, 3 AVISO (enlaces rotos en `agente-correduria`→`apps/plataforma/lib/cima.ts`, `central-maestro`→`docs/ASEGURA-MIGRACION.md`, `rrhh-compliance-calendar`→`apps/rrhh/docs/ROADMAP-rrhh.md`).

## 🔴 Latidos en rojo (`agente_latidos`)
- `subastas_idealista`: último ok 27/09 (666 h; umbral 30 h). Solo hubo pasada manual de arranque.
- `seo_correduria`: ok=false, 473 h. GSC devuelve 403 sobre `sc-domain:grupoasegura.es` (permiso del usuario).
- `facturas_gmail`: ok=false, 44 h; «pasada en curso» desde el 24/10 06:15 (posible pasada colgada).
- `ses_transporte`: nunca ok; pendiente conocido, su `revisarEl` (06/10) venció.
- `cima_siniestros_corte_compania`: nunca ok; alerta 24/10 C0468, C0109. No está en `AGENTES_VIGILADOS`.
- Sin fila pese a estar vigilados: `pricing`, `correo_triaje`, `ialimp_pms`, `github_vigia`; existe `paper-tracker` (guion) vs vigilado `paper_tracker` (¿id distinto?).
- `agente_reparaciones`: sin intentos en 7 días.

## 🟠 Correduría
- CIMA viva (último pull 24/10 18:31, 0 errores) pero `processed=0` con `en_cola=223` en los 3 últimos pulls; `cima_ficheros` 223 filas, última 23/10. Cola estancada: revisar con `cima-ingesta`.
- Ingesta DEGRADADA: C0109 (Allianz) 14 d sin enviar, con 4 pólizas que vencen en ≤30 d; C0072 26 d; C0613 25 d; Occident sin siniestros 29 d.
- `cima_liq`: 30 de 37 periodos no cuadran.
- Codeoscopic: 0 cotizaciones/7 d.

## 🟠 Precio
Sin 🔴 (rail_baja_roto 0, bajo_minimo 0, 4 pisos con motor activo y suelo). `oscilantes` = 69 pares piso-fecha con ≥3 cambios de dirección en 7 d (causa sin investigar). `sivra_resumen_diario`: 10 alertas de precio abiertas (reservas 46-50 % bajo mercado). Huellas de dominio todas dentro de umbral.

## PRs / automerge
13 PRs abiertos. `rutinas-automerge` vivo (último run 24/10 23:24). Registro puro en conflicto: #5027, #5025 (duplicado, la bitácora entró por #5032 → cerrar), #4998, #4319 (trae 169 ficheros: no mergeable). Drafts >14 d candidatos a cerrar: #3755, #3995, #4257, #4258, #4476, #4522. #4723 (blog) limpio, espera lectura humana.

## Drift de docs (propuesto; toca ficheros de comportamiento → carril 2)
- «12 apps» → 13 en `docs/RUTINAS-PROGRAMADAS.md:77`, `docs/AGENTES-MAPA.md:80`, `.claude/commands/auditoria-diaria.md`, `.claude/skills/auditoria-central/SKILL.md:65,145`.
- `docs/SKILLS.md` no lista `google-contactos`.
- `apps/asegura-portal/CLAUDE.md` casi no recoge patrimonio (pasos 4-9b); `docs/FUENTES-DE-VERDAD.md` sin fila para `apps/asegura-portal/lib/patrimonio/**` ni `packages/module-patrimonio/**`.
- Crons nuevos sin latido: `apps/asegura/.../indices-renta` y `apps/asegura-portal/.../patrimonio-gastos`.
- `docs/CONTEXTO-SESIONES.md` sin rotar: ~159 entradas de septiembre (`docs/memoria/2026-09.md` no existe). Correr `node scripts/rotar-memoria.mjs`.
- `asegura/CLAUDE.md` vs `asegura-url.ts`/`asegura-db.ts`: sin drift.

No verificado: HUECOS H1/H3 contra código; manuales ia-rest; listado de sesiones (`list_sessions` no disponible).

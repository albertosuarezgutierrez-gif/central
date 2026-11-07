# CLAUDE.md — apps/empresa («Mi empresa», `empresa.grupoasegura.es`)

Spec: `docs/superpowers/specs/2026-11-07-mi-empresa-herramientas.md` (F1). Base: `docs/HERRAMIENTAS-DOS-VENTANAS.md`.

## Qué es
- UNA entrada para dueños y administración de empresas cliente: OTP por correo → selector de empresa → solo las herramientas
  contratadas. Sabe QUÉ está contratado y firmado; cada app (contabilidad, rrhh, taller) sigue sabiendo QUIÉN entra en ella.
- Contrato de encargo (art. 28 RGPD): plantilla en `@central/core-herramientas` (`plantilla-encargo-v1.ts`, cargada por 0002),
  versión inmutable con sha256, firma del DUEÑO con código nuevo + nombre tecleado (`@central/core-firma`), certificado con hash.
- Roles: `dueno` (firma y reparte) · `admin` (opera lo concedido por herramienta; Pilar) · `consulta` (ve todo, no firma ni reparte).

## Reglas
- **BD:** schema `herramientas`, rol `prisma_herramientas` NOBYPASSRLS sin GRANT fuera. SQL en `prisma/sql/` (a mano, nunca
  `prisma migrate`). Lecturas SOLO dentro de `conPersona()` (lib/rls.ts); escrituras SOLO por funciones SECURITY DEFINER.
  Plantilla/firma/evento/contrato inmutables por trigger; `contrato_version` solo cambia `estado` por lista blanca
  (= `PARES_TRANSICION_VERSION`; lo vigila `core-herramientas/estados.test.ts`).
- **Comunicaciones:** el contrato y el recordatorio salen SOLO del clic del operador (`envio.confirmado_por`). Nada automático.
- **Cepo dos-ventanas:** esta app no importa `module-seguros*` ni lee `seguros`. Encargado y marca de correo: `@central/legal-templates`.
- **Plantilla nueva** = `encargo-tratamiento-v2` + migración nueva; nunca editar la v1 (`node scripts/generar-plantilla-sql.mjs`
  solo mientras 0002 no esté aplicada; `test/esquema-sql.test.ts` exige que 0002 = la constante).
- Secretos con `requireSecret`: `HERRAMIENTAS_SESSION_SECRET`, `HERRAMIENTAS_OPERADOR_SECRET`,
  `HERRAMIENTAS_TRASPASO_SECRET_CONTABILIDAD|_RRHH` (el mismo valor en la app destino). Cookie `__Host-empresa_session`.
- Tests: `pnpm test` (puros). Contra Postgres real: `HERRAMIENTAS_PG_TEST="-h … -p … -U postgres -d …" pnpm test` (bd-real).

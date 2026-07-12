# Migraciones de infra PENDIENTES — auditoría 2026-07

> **Estas migraciones NO se han ejecutado.** Tocan la BD de PRODUCCIÓN con clientes vivos
> (ialimp = Sique Brilla; ia-rest = iarest.es). Aplícalas tú, en una ventana, con la app
> testeable y rollback a mano. Cada fichero lleva su comprobación previa y su rollback.
>
> Contexto completo: `docs/AUDITORIA-2026-07.md` (pasada 12/07). Proyectos Supabase:
> - `wswbehlcuxqxyinousql` = compartida (ialimp/sivra/plataforma/transporte/alquiler + schema `iarest` clon)
> - `efncqyvhniaxsirhdxaa` = ia-rest standalone (datos vivos)

## Orden sugerido y riesgo

| # | Fichero | Qué | Riesgo | Reversible |
|---|---------|-----|--------|-----------|
| 01 | `01-revoke-anon-iarest.sql` | Quita `EXECUTE` a `anon` de funciones internas | **Alto** (puede romper flujos públicos si revocas de más) | Sí (`GRANT`) |
| 02 | `02-rrhh-documentos-bucket.sql` | Cierra la policy del bucket `rrhh-documentos` | Medio (probar descargas antes) | Sí |
| 03 | `03-verifactu-comanda-guard.sql` | Evita 2 facturas por comanda (TOCTOU) | Medio (mira pagos parciales/rectificativas) | Sí |
| 04 | `04-hardening-iarest-standalone.sql` | `search_path` fijo + nota vistas SECURITY DEFINER | Bajo-medio | Sí |

## Regla de oro
Aplica **una** en staging/preview, **prueba el flujo afectado**, y solo entonces a producción.
Ninguna es urgente-hoy salvo la #01 en la parte de funciones claramente privilegiadas (billing/super).

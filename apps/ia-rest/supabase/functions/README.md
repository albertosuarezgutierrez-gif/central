# Edge Functions de ia-rest — estado de la fuente

> ⚠️ **Hallazgo (12/07/2026):** este directorio estaba **incompleto**. Solo tenía
> ~19 de las ~45 Edge Functions realmente desplegadas en el proyecto Supabase de
> ia-rest. El resto vivía **únicamente como artefacto desplegado** (sin código en
> git) — un riesgo de recuperación ante desastres. Contexto: split-brain de
> proyecto Supabase, ver `docs/RUNBOOK-MIGRACION-SUPABASE-IAREST.md`.
>
> ✅ **12/07/2026 — RESCATE COMPLETADO.** Las 44 Edge Functions desplegadas en el
> proyecto vivo `efncqyvhniaxsirhdxaa` ya están en git (fetch por MCP `get_edge_function`).
> Dos tenían credenciales **hardcodeadas** en el deploy → **redactadas** a `Deno.env.get`
> al rescatarlas (nunca versionar el secreto): `tg-send` (`TG_SEND_SECRET`) e
> `ia-training-dashboard` (`IA_TRAINING_PIN`, PIN de super-admin que era `"9999"`).
> `auth-pin-validate` conserva su fallback `IP_HASH_SALT || 'literal'` tal cual está
> desplegado (salt de hash de IP, no firma sesiones) — estado de prod a endurecer.

## Fuente de verdad de los valores en ejecución
Proyecto **vivo hoy**: `efncqyvhniaxsirhdxaa` (schema `public`). Es el que sirve
producción hasta que se ejecute el flip de la migración al compartido
`wswbehlcuxqxyinousql`/`iarest`.

## Rescatadas a git el 12/07 (desde el proyecto vivo)
`brain`, `brain-parse`, `courier-route`, `verifactu-sign`.
> Nota: algunas versiones desplegadas son **legacy** — p. ej. `brain`/`brain-parse`
> aún llaman a `api.anthropic.com` (Anthropic se retiró el 17/06). El código aquí
> refleja lo que HAY desplegado, no necesariamente lo deseado. No re-desplegar a
> ciegas sin revisar.

## Pendientes de rescatar a git
Ninguna. Las 44 funciones desplegadas están en git (rescate 12/07). La única que
sigue divergente entre proyectos es `ig-video-gen` (v1 huérfana en el viejo, v7 viva
en el compartido) — se reconcilia en la Etapa B/C del runbook, no es un pendiente de
código-a-git.

## Receta para rescatar el resto (barato, con Supabase CLI)
Requiere `SUPABASE_ACCESS_TOKEN` (o `supabase login`). Baja el código directo al
repo sin round-trip por un LLM:

```bash
cd apps/ia-rest
REF=efncqyvhniaxsirhdxaa   # proyecto vivo = fuente de verdad
for fn in cobro-monei webhook-monei cobro-stripe owner-panel enviar-verifactu \
          ia-training-dashboard auth-pin-validate kds-token-validate auth-register \
          auth-verify-sms stripe-checkout ear-transcribe vox-confirm menu-stockout \
          test-runner bridge-agent push-send error-ingest recuperar-pin \
          analizar-cv lead-research tg-send; do
  supabase functions download "$fn" --project-ref "$REF"
done
git add supabase/functions && git commit -m "chore(ia-rest): rescatar Edge Functions faltantes desde deploy"
```

## Migración al destino (Etapa C del runbook)
Para el flip, estas funciones deben existir en el proyecto destino
`wswbehlcuxqxyinousql` con su código actual. Se sincronizan viejo→destino
(`supabase functions deploy` desde el repo ya completo, o por MCP get+deploy),
preservando los flags `verify_jwt`, y con los **secretos de EF del destino**
configurados antes (si no, se despliegan pero fallan en runtime). `ig-video-gen`
está VIVA en el destino (Instagram) → tratar con cuidado.

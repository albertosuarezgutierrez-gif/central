-- Gastos de software/infraestructura profesional (Vercel, Anthropic/Claude…) que Alberto paga con la
-- cuenta de la correduría (BBVA). Son herramientas de su actividad → siguen DEDUCIBLES (destino='seguros'),
-- pero se etiquetan con subcategoría 'informatica' para distinguirlos de las pólizas/comisiones de seguros.
-- No se toca destino ni destino_confirmado (ya estaban bien): solo se les pone la subcategoría.
-- El fix en código (lib/destino.ts::RE_SOFTWARE) hace que los futuros se clasifiquen así solos, sin pasar
-- por «por revisar». La matriz de la correduría es de INGRESOS (importe>0), así que estos gastos nunca la
-- ensuciaron; el cambio es de etiquetado/identificación, no fiscal.
UPDATE movimientos_bancarios mb
SET subcategoria = 'informatica'
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id
  AND cb.banco ILIKE '%BBVA%'
  AND mb.destino = 'seguros'
  AND mb.importe < 0
  AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
  AND upper(COALESCE(mb.concepto, '') || ' ' || COALESCE(mb.contraparte, ''))
      ~ 'VERCEL|ANTHROPIC|OPENAI|OPENROUTER|GITHUB|CLOUDFLARE|SUPABASE|DIGITALOCEAN|NETLIFY|HETZNER|VULTR|LINODE|MONGODB|AMAZON WEB SERVICES|\mAWS\M|GOOGLE CLOUD';

-- Fix: perfiles_plan_check no aceptaba planes nuevos (per_seat, starter, activo)
-- Causa: todos los checkout.session.completed fallaban desde el 6 mayo 2026

ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_plan_check;

ALTER TABLE perfiles ADD CONSTRAINT perfiles_plan_check
  CHECK (plan = ANY (ARRAY[
    'trial'::text, 'activo'::text, 'per_seat'::text, 'starter'::text,
    'barra'::text, 'servicio'::text, 'casa'::text, 'bloqueado'::text
  ]));

CREATE OR REPLACE FUNCTION public.activar_plan(
  p_restaurante_id uuid, p_user_id uuid,
  p_plan text, p_billing text, p_stripe_sub_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_max_camareros int; v_max_mesas int; v_max_secciones int;
BEGIN
  CASE p_plan
    WHEN 'barra'    THEN v_max_camareros:=1;   v_max_mesas:=12;  v_max_secciones:=1;
    WHEN 'servicio' THEN v_max_camareros:=4;   v_max_mesas:=999; v_max_secciones:=2;
    WHEN 'casa'     THEN v_max_camareros:=999; v_max_mesas:=999; v_max_secciones:=999;
    ELSE                 v_max_camareros:=999; v_max_mesas:=999; v_max_secciones:=999;
  END CASE;
  UPDATE public.restaurantes SET plan=p_plan, plan_billing=p_billing, plan_status='active',
    plan_start=now(), stripe_subscription_id=p_stripe_sub_id,
    max_camareros=v_max_camareros, max_mesas=v_max_mesas, max_secciones=v_max_secciones,
    updated_at=now() WHERE id=p_restaurante_id;
  UPDATE public.perfiles SET plan=p_plan, plan_billing=p_billing, plan_status='active',
    plan_start=now(), stripe_subscription_id=p_stripe_sub_id,
    updated_at=now() WHERE id=p_user_id;
END; $$;

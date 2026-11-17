-- ============================================================================
-- VIP DA NICOLLY — Schema Completo Supabase (PostgreSQL + Auth + RLS + Storage)
-- Execute este script no SQL Editor do projeto Supabase antes de ativar em produção.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABELA DE PERFIS (profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) >= 3),
  username text UNIQUE,
  email text NOT NULL,
  phone text NOT NULL,
  birth_date date NOT NULL,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  suspended boolean NOT NULL DEFAULT false,
  admin_notes text,
  last_login_at timestamptz,
  permissions jsonb DEFAULT '{"canManageClients":true,"canManageFinance":true,"canManageSettings":true,"canManageAdmins":true}'::jsonb,
  preferences jsonb DEFAULT '{"theme":"dark","inAppNotifications":true,"emailUpdates":false}'::jsonb,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  privacy_accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Impede que qualquer usuário altere o próprio campo role ou suspended via cliente
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Alteração de papel (role) não permitida pelo cliente.';
  END IF;
  IF NEW.suspended IS DISTINCT FROM OLD.suspended AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Alteração de suspensão não permitida pelo cliente.';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- Função auxiliar segura para verificar se o usuário autenticado é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND suspended = false
  );
$$;

-- 2. TABELA DE PAGAMENTOS E ASSINATURAS (payments)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_key text NOT NULL CHECK (plan_key IN ('semanal', 'mensal', 'vitalicio')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  original_amount_cents integer,
  discount_cents integer NOT NULL DEFAULT 0,
  coupon_code text,
  activation_origin text,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'aguardando_pagamento'
    CHECK (status IN (
      'aguardando_pagamento',
      'aguardando_analise',
      'em_analise',
      'aprovado',
      'recusado',
      'cancelado',
      'reembolsado',
      'expirado'
    )),
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text UNIQUE,
  external_reference text UNIQUE NOT NULL,
  checkout_url text,
  rejection_reason text,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_external_ref ON public.payments(external_reference);

-- Função de servidor para validar se o usuário possui assinatura VIP ativa (não vencida)
CREATE OR REPLACE FUNCTION public.has_valid_vip_access(target_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments pay
    JOIN public.profiles prof ON prof.id = pay.user_id
    WHERE pay.user_id = target_uid
      AND prof.suspended = false
      AND pay.status = 'aprovado'
      AND (pay.expires_at IS NULL OR pay.expires_at > now())
  );
$$;

-- 3. TABELA DE COMPROVANTES (payment_proofs)
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  status text NOT NULL DEFAULT 'aguardando_analise'
    CHECK (status IN ('aguardando_analise', 'em_analise', 'aprovado', 'recusado')),
  extracted_amount_cents integer,
  extracted_reference text,
  review_notes text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proofs_user_id ON public.payment_proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_payment_id ON public.payment_proofs(payment_id);

-- 4. CONFIGURAÇÕES DO SITE (site_settings)
CREATE TABLE IF NOT EXISTS public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

-- Dados iniciais padrão
INSERT INTO public.site_settings (key, value)
VALUES
  ('hero', '"Um espaço exclusivo, íntimo e dedicado para quem deseja acompanhar conteúdos especiais e novidades."'::jsonb),
  ('whatsapp', '"554192387993"'::jsonb),
  ('whatsapp_label', '"(41) 9238-7993"'::jsonb),
  ('support_message', '"Olá! Fiz o pagamento do meu plano VIP e gostaria de enviar o comprovante."'::jsonb),
  ('vip_group_invite', '""'::jsonb),
  ('plans', '{
    "semanal": {"name": "Semanal", "preco": "25,00", "amount_cents": 2500, "duration_days": 7, "link": "https://mpago.la/1QU2TPC"},
    "mensal": {"name": "Mensal", "preco": "50,00", "amount_cents": 5000, "duration_days": 30, "link": "https://mpago.la/1xxrBfv"},
    "vitalicio": {"name": "Vitalício", "preco": "200,00", "amount_cents": 20000, "duration_days": 0, "link": "https://mpago.la/2PLqPsy"}
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. SOLICITAÇÕES DE ENTRADA NO GRUPO VIP (vip_group_requests)
CREATE TABLE IF NOT EXISTS public.vip_group_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_key text NOT NULL CHECK (plan_key IN ('semanal', 'mensal', 'vitalicio')),
  status text NOT NULL DEFAULT 'pendente_whatsapp'
    CHECK (status IN ('pendente_whatsapp', 'aceito_no_grupo', 'recusado_no_grupo')),
  admin_notes text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. NOTIFICAÇÕES ADMINISTRATIVAS E DO CLIENTE
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  target_tab text NOT NULL DEFAULT 'overview',
  record_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_uid ON public.user_notifications(user_id);

-- 7. CUPONS E RESGATES (coupons & coupon_redemptions)
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  applicable_plans jsonb NOT NULL DEFAULT '["semanal","mensal","vitalicio"]'::jsonb,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  discount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, payment_id)
);

-- 8. CHAMADOS DE SUPORTE (support_tickets & support_messages)
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'outro' CHECK (category IN ('pagamento', 'acesso_vip', 'conta', 'outro')),
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'encerrado')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'alta')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('client', 'admin')),
  sender_name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. BIBLIOTECA DE MÍDIA (media_assets)
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'geral' CHECK (category IN ('logo', 'hero', 'vip_banner', 'geral')),
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. LOG DE AUDITORIA (audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  record_id text,
  result text NOT NULL DEFAULT 'sucesso',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_group_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'client' AND suspended = false);

CREATE POLICY "profiles_update_own_non_privileged" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = 'client');

-- Payments
CREATE POLICY "payments_select_own_or_admin" ON public.payments
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Payment Proofs
CREATE POLICY "proofs_select_own_or_admin" ON public.payment_proofs
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "proofs_insert_own" ON public.payment_proofs
  FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'aguardando_analise');

-- Site Settings (vip_group_invite nunca exposto)
CREATE POLICY "settings_select_authenticated_public" ON public.site_settings
  FOR SELECT USING (auth.uid() IS NOT NULL AND key <> 'vip_group_invite');

CREATE POLICY "settings_admin_all" ON public.site_settings
  FOR ALL USING (public.is_admin());

-- VIP Group Requests
CREATE POLICY "group_requests_select_own_or_admin" ON public.vip_group_requests
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "group_requests_insert_own_valid" ON public.vip_group_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_valid_vip_access(auth.uid()));

CREATE POLICY "group_requests_admin_update" ON public.vip_group_requests
  FOR UPDATE USING (public.is_admin());

-- Notifications & User Notifications
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL USING (public.is_admin());

CREATE POLICY "user_notifications_own_or_admin" ON public.user_notifications
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_notifications_update_own" ON public.user_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Coupons & Redemptions
CREATE POLICY "coupons_admin_all" ON public.coupons
  FOR ALL USING (public.is_admin());

CREATE POLICY "redemptions_select_own_or_admin" ON public.coupon_redemptions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Support Tickets & Messages
CREATE POLICY "tickets_select_own_or_admin" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "tickets_insert_own" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tickets_admin_update" ON public.support_tickets
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "ticket_msgs_select_own_or_admin" ON public.support_messages
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "ticket_msgs_insert_own_or_admin" ON public.support_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
  );

-- Media Assets & Audit Logs
CREATE POLICY "media_assets_read_all" ON public.media_assets
  FOR SELECT USING (true);

CREATE POLICY "media_assets_admin_write" ON public.media_assets
  FOR ALL USING (public.is_admin());

CREATE POLICY "audit_admin_select" ON public.audit_logs
  FOR SELECT USING (public.is_admin());

-- ============================================================================
-- STORAGE BUCKETS (Comprovantes Privados + Mídia do Site)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'payment-proofs',
    'payment-proofs',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'site-media',
    'site-media',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  )
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "proofs_bucket_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "proofs_bucket_read_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

CREATE POLICY "site_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-media');

CREATE POLICY "site_media_admin_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'site-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'site-media' AND public.is_admin());

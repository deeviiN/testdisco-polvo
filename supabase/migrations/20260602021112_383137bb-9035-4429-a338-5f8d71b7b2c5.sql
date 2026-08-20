
CREATE TABLE public.security_finding_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner_name text NOT NULL,
  finding_id text NOT NULL,
  finding_name text,
  level text,
  status text NOT NULL CHECK (status IN ('fixed','ignored','pending')),
  explanation text,
  acted_by uuid,
  acted_at timestamptz NOT NULL DEFAULT now(),
  scan_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sec_finding_actions_status ON public.security_finding_actions(status);
CREATE INDEX idx_sec_finding_actions_acted_at ON public.security_finding_actions(acted_at DESC);

GRANT SELECT, INSERT ON public.security_finding_actions TO authenticated;
GRANT ALL ON public.security_finding_actions TO service_role;

ALTER TABLE public.security_finding_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view finding actions"
ON public.security_finding_actions
FOR SELECT TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert finding actions"
ON public.security_finding_actions
FOR INSERT TO authenticated
WITH CHECK (
  private_api.has_role(auth.uid(), 'admin'::app_role)
  AND acted_by = auth.uid()
);

-- Seed: registrar as ações que já foram aplicadas hoje (02/06/2026)
INSERT INTO public.security_finding_actions
  (scanner_name, finding_id, finding_name, level, status, explanation, scan_timestamp)
VALUES
  ('supabase_lov','direct_messages_school_isolation_bypass','Direct message recipient check allows cross-school recipient lookup','warn','fixed','Corrigida tautologia p.school_id = p.school_id na policy de INSERT de direct_messages, agora exige p.school_id = direct_messages.school_id.','2026-05-31T22:35:18Z'),
  ('supabase_lov','sector_labels_chef_not_allowed','chef_projeto_vida role excluded from sector_labels write policies','warn','fixed','Policies INSERT/UPDATE/DELETE recriadas incluindo chef_projeto_vida.','2026-05-31T22:35:18Z'),
  ('supabase_lov','signed_contracts_upload_no_approval_check','Upload de contratos sem checar is_approved','warn','fixed','Policy de INSERT em signed_contracts agora exige private_api.is_user_approved.','2026-05-31T22:35:18Z'),
  ('supabase_lov','profile_approval_decisions_email_phone_exposed','Email e telefone em decisões de aprovação visíveis ao gestor/chef','warn','ignored','Intencional: gestor/chef precisam de email e telefone do candidato para contato no fluxo de aprovação.','2026-05-31T22:35:18Z'),
  ('supabase_lov','profiles_sensitive_fields_school_visible','Dados sensíveis de profiles visíveis a membros aprovados da mesma escola','error','ignored','Intencional: escola é o tenant; membros aprovados precisam de acesso aos dados para gestão pedagógica.','2026-05-31T22:35:18Z'),
  ('supabase','SUPA_extension_in_public','Extensão no schema public','warn','ignored','Configuração padrão Supabase, aceita.','2026-05-31T22:34:48Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_BOOKING_INSERT','Unapproved users can create bookings','error','fixed','Adicionado is_user_approved na policy de INSERT em bookings.','2026-06-02T02:08:16Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_RESPONSIBILITY_TRANSFER_INSERT','Unapproved users can create responsibility transfers','error','fixed','Adicionado is_user_approved na policy de INSERT em responsibility_transfers.','2026-06-02T02:08:16Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_SECTOR_LABELS_SELECT','Unapproved users can read sector labels','warn','fixed','Adicionado is_user_approved na policy de SELECT em sector_labels.','2026-06-02T02:08:16Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_BOOKING_GESTOR_HISTORY_SELECT','Unapproved users can read booking gestor history','warn','fixed','Adicionado is_user_approved na policy de SELECT em booking_gestor_history.','2026-06-02T02:08:16Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_ASSISTANT_CLASSES_SELECT','Unapproved users can read assistant class assignments','warn','fixed','Adicionado is_user_approved na policy de SELECT em assistant_classes.','2026-06-02T02:08:16Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_PANEL_SETTINGS_SELECT','Unapproved users can read panel settings','warn','fixed','Adicionado is_user_approved na policy de SELECT em panel_settings.','2026-06-02T02:08:16Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_RESPONSIBILITY_TRANSFERS_SELECT','Unapproved users can read responsibility transfers','warn','fixed','Adicionado is_user_approved na policy de SELECT em responsibility_transfers.','2026-06-02T02:08:16Z'),
  ('supabase_lov','MISSING_APPROVAL_CHECK_ON_SCHOOL_DISCIPLINE_SETTINGS_SELECT','Unapproved users can read school discipline settings','warn','fixed','Adicionado is_user_approved na policy de SELECT em school_discipline_settings.','2026-06-02T02:08:16Z'),
  ('supabase_lov','SIGNED_CONTRACTS_MISSING_SCHOOL_READ_IN_STORAGE','Signed-contract files readable by any school member','warn','fixed','Storage SELECT restrito a uploader, admin ou gestor/chef da mesma escola.','2026-06-02T02:08:16Z'),
  ('supabase_lov','REALTIME_MISSING_APPROVAL_CHECK','Unapproved users can subscribe to school Realtime channels','error','ignored','realtime.messages é schema reservado do Supabase; a proteção foi aplicada nas tabelas-fonte.','2026-06-02T02:08:16Z');

UPDATE public.support_settings SET whatsapp_number = '5511925686565', display_label = '(11) 92568-6565';
ALTER TABLE public.support_settings ALTER COLUMN whatsapp_number SET DEFAULT '5511925686565';
ALTER TABLE public.support_settings ALTER COLUMN display_label SET DEFAULT '(11) 92568-6565';
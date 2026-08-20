import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SupportContact {
  whatsapp_number: string;
  display_label: string;
}

const DEFAULT: SupportContact = {
  whatsapp_number: "5511925686565",
  display_label: "(11) 92568-6565",
};

let cache: SupportContact | null = null;
const listeners = new Set<(c: SupportContact) => void>();

async function fetchContact(): Promise<SupportContact> {
  const { data } = await supabase
    .from("support_settings")
    .select("whatsapp_number, display_label")
    .eq("id", true)
    .maybeSingle();
  if (data) return data as SupportContact;
  return DEFAULT;
}

export function useSupportContact() {
  const [contact, setContact] = useState<SupportContact>(cache ?? DEFAULT);

  useEffect(() => {
    const listener = (c: SupportContact) => setContact(c);
    listeners.add(listener);
    if (!cache) {
      fetchContact().then((c) => {
        cache = c;
        listeners.forEach((l) => l(c));
      });
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const whatsappUrl = `https://wa.me/${contact.whatsapp_number}`;
  const buildWhatsappUrl = (text: string) =>
    `https://wa.me/${contact.whatsapp_number}?text=${encodeURIComponent(text)}`;

  return { contact, whatsappUrl, buildWhatsappUrl, refresh: async () => {
    const c = await fetchContact();
    cache = c;
    listeners.forEach((l) => l(c));
  }};
}

export function updateSupportCache(c: SupportContact) {
  cache = c;
  listeners.forEach((l) => l(c));
}

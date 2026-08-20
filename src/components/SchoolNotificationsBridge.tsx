import { useSchoolBookingNotifications } from "@/hooks/useSchoolBookingNotifications";
import { useGestorApprovalQueueNotifications } from "@/hooks/useGestorApprovalQueueNotifications";
import { useGestorContractNotifications } from "@/hooks/useGestorContractNotifications";

/**
 * Componente vazio que apenas ativa os hooks de notificação em tempo real
 * para a escola do usuário logado. Renderizado uma única vez no App.
 */
export default function SchoolNotificationsBridge() {
  useSchoolBookingNotifications();
  useGestorApprovalQueueNotifications();
  useGestorContractNotifications();
  return null;
}

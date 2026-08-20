import { useNavigate } from "react-router-dom";
import InboxPage from "@/components/inbox/InboxPage";
import type { InboxItem } from "@/hooks/useInbox";

const folders = [
  { key: "cadastros", label: "Novos cadastros", types: ["cadastro_pendente"] },
  { key: "agendamentos", label: "Agendamentos", types: ["agendamento_pendente"] },
  { key: "transferencias", label: "Transferências", types: ["transferencia_escola"] },
  { key: "cancelamentos", label: "Cancelamentos", types: ["cancelamento_agendamento"] },
  { key: "mensagens", label: "Mensagens", types: ["mensagem_institucional"] },
  { key: "outros", label: "Outros", types: ["*"] },
];

export default function GestorInbox() {
  const navigate = useNavigate();
  const handle = (item: InboxItem) => {
    if (item.type === "cadastro_pendente") navigate("/gestor/aprovacoes");
    else if (item.type === "agendamento_pendente") navigate("/gestor/external-requests");
    else if (item.type === "transferencia_escola") navigate("/gestor/transfer-requests");
  };
  return <InboxPage audience="gestor" title="Caixa do Gestor" folders={folders} onItemAction={handle} />;
}

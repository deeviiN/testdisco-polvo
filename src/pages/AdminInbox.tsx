import { useNavigate } from "react-router-dom";
import InboxPage from "@/components/inbox/InboxPage";
import type { InboxItem } from "@/hooks/useInbox";

const folders = [
  { key: "cadastros", label: "Cadastros", types: ["cadastro_pendente_admin"] },
  { key: "senhas", label: "Reset/Senha", types: ["reset_senha", "alteracao_senha"] },
  { key: "gestor", label: "Mudança gestor", types: ["mudanca_gestor"] },
  { key: "encerramento", label: "Encerramento", types: ["encerramento_contrato"] },
  { key: "transferencias", label: "Transferências", types: ["transferencia_admin"] },
  { key: "contratos", label: "Contratos/Pagamentos", types: ["contrato_assinado", "pagamento_migracao", "pagamento"] },
  { key: "outros", label: "Outros", types: ["*"] },
];

export default function AdminInbox() {
  const navigate = useNavigate();
  const handle = (item: InboxItem) => {
    if (item.type === "contrato_assinado") navigate("/admin/contracts");
  };
  return <InboxPage audience="admin" title="Caixa do Administrador" folders={folders} onItemAction={handle} />;
}

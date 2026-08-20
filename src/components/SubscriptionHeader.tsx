import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type StatusAssinatura = 'trialing' | 'active' | 'past_due' | 'canceled' | 'ativo' | 'atrasado' | 'cancelado' | 'teste' | null;

interface DadosAssinatura {
  status: StatusAssinatura;
  tipo_plano: 'mensal' | 'anual';
  meses_pagos: number; // 1, 12, 24, 36, 48
  data_fim_acesso: string; // "2027-04-30"
  proxima_cobranca: string; // "2026-05-30"
  dias_restantes: number;
}

// Limites máximos de dias por tipo de pacote (proteção contra dados inconsistentes)
const LIMITES_DIAS_PACOTE: Record<number, number> = {
  1: 30,    // mensal
  12: 365,  // 1 ano
  24: 730,  // 2 anos
  36: 1095, // 3 anos
  48: 1460, // 4 anos
};

/**
 * Calcula dias restantes de forma confiável:
 * - Normaliza para meia-noite (evita erros de fuso/hora)
 * - Garante que nunca exceda o limite máximo do pacote contratado
 * - Nunca retorna negativo
 */
function calcularDiasRestantes(validade: string, mesesPagos: number): number {
  const validadeDate = new Date(validade);
  const hoje = new Date();
  validadeDate.setHours(0, 0, 0, 0);
  hoje.setHours(0, 0, 0, 0);

  const diffMs = validadeDate.getTime() - hoje.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 0;

  const limite = LIMITES_DIAS_PACOTE[mesesPagos] ?? 30;
  return Math.min(diffDays, limite);
}

export function SubscriptionHeader() {
  const { user, profile } = useAuth();
  const [assinatura, setAssinatura] = useState<DadosAssinatura | null>(null);

  // Para gestores, o SubscriptionDeadlineBanner (dentro do painel /gestor)
  // já mostra o prazo da assinatura. Evitamos exibir aqui para não duplicar
  // mensagens de "dias restantes" que confundem o usuário.
  const isManager =
    profile?.role === "gestor_pedagogico" ||
    profile?.role === "chef_projeto_vida";

  useEffect(() => {
    if (!user || isManager) return;

    async function fetchAssinatura() {
      const { data, error } = await supabase
        .from('assinaturas')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      // Fallback: se a query falhar, recalcula apenas com base na validade
      // já existente no estado atual (sem depender de novos dados do banco)
      if (error) {
        console.warn('[SubscriptionHeader] Falha ao buscar assinatura, aplicando fallback local:', error.message);
        setAssinatura((prev) => {
          if (!prev?.data_fim_acesso) return prev;
          const diasRestantes = calcularDiasRestantes(prev.data_fim_acesso, prev.meses_pagos);
          return { ...prev, dias_restantes: diasRestantes };
        });
        return;
      }

      if (data) {
        let normalizedStatus: StatusAssinatura = 'active';
        if (data.status === 'atrasado' || data.status === 'past_due') normalizedStatus = 'past_due';
        else if (data.status === 'cancelado' || data.status === 'canceled') normalizedStatus = 'canceled';
        else if (data.status === 'teste' || data.status === 'trialing') normalizedStatus = 'trialing';
        else if (data.status === 'ativo' || data.status === 'active') normalizedStatus = 'active';

        const mesesPagos = data.tipo === 'anual' ? 12 : 1;
        const diasRestantes = calcularDiasRestantes(data.validade, mesesPagos);

        setAssinatura({
          status: normalizedStatus,
          tipo_plano: data.tipo === 'anual' ? 'anual' : 'mensal',
          meses_pagos: mesesPagos,
          data_fim_acesso: data.validade,
          proxima_cobranca: data.validade,
          dias_restantes: diasRestantes
        });
      }
    }

    fetchAssinatura();

    // Recalcula a cada minuto para garantir precisão absoluta
    const interval = setInterval(fetchAssinatura, 60 * 1000);

    // Realtime: atualiza quando a assinatura mudar no banco
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assinaturas',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchAssinatura();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user, isManager]);

  if (isManager) return null;
  if (!assinatura) return null;

  // 1. Trial ativo (só mostra se não houver assinatura paga)
  if (assinatura.status === 'trialing') {
    return (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top duration-500">
        <Clock className="w-4 h-4" />
        Seu teste expira em {assinatura.dias_restantes} dias
      </div>
    );
  }

  // 2. Pagamento atrasado
  if (assinatura.status === 'past_due') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top duration-500">
        <AlertTriangle className="w-4 h-4" />
        Pagamento pendente - <a href="/subscription" className="underline font-medium">Regularizar agora</a>
      </div>
    );
  }

  // 3. Cancelado mas ainda com acesso
  if (assinatura.status === 'canceled') {
    const dataFim = new Date(assinatura.data_fim_acesso).toLocaleDateString('pt-BR');
    return (
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-sm text-gray-700 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top duration-500">
        <Clock className="w-4 h-4" />
        Acesso expira em {dataFim}
      </div>
    );
  }

  // 4. Ativo - pagou 1 ano ou mais
  if (assinatura.status === 'active' && assinatura.meses_pagos > 1) {
    const dataFim = new Date(assinatura.data_fim_acesso).toLocaleDateString('pt-BR');
    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm text-green-800 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top duration-500">
        <CheckCircle className="w-4 h-4" />
        Assinatura ativa até {dataFim}
      </div>
    );
  }

  // 5. Ativo - mensal recorrente
  if (assinatura.status === 'active' && assinatura.tipo_plano === 'mensal') {
    const dataFim = new Date(assinatura.data_fim_acesso).toLocaleDateString('pt-BR');
    
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-800 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top duration-500">
        <Clock className="w-4 h-4" />
        Sua assinatura mensal renova em {dataFim} ({assinatura.dias_restantes} dias restantes)
      </div>
    );
  }

  return null;
}

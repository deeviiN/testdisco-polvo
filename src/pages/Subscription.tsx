import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { MigrationQuoteCard } from "@/components/MigrationQuoteCard";
import PaymentPlanSelector from "@/components/subscription/PaymentPlanSelector";
import ValueComparisonCard from "@/components/subscription/ValueComparisonCard";
import { useAuth } from "@/hooks/useAuth";
import { useSupportContact } from "@/hooks/useSupportContact";
import { getCardBrand as detectCardBrandLocal, getCardBrandLabel } from "@/lib/card-validation";
import { Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  ArrowLeft,
  Crown,
  Sparkles,
  Shield,
  Zap,
  Search,
  School,
  CreditCard,
  QrCode,
  Loader2,
  AlertTriangle,
  MapPin,
  Copy,
  FileText,
  MessageCircle,
  Download,
  CheckCircle2,
  PenLine,
  Upload,
  Wallet,
  RefreshCw,
  Eye,
  EyeOff,
  Inbox,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { maskCPF, isValidCPF } from "@/lib/cpf";
import { getMpConfigStatus, criarPagamentoMP } from "@/lib/mercadoPago";
import { validateAbntLayout } from "@/lib/abntValidation";

declare global {
  interface Window {
    MercadoPago: any;
  }
}

type SubscriptionStep =
  | "plans"
  | "network-select"
  | "inep"
  | "school-data"
  | "contract-view"
  | "contract-upload"
  | "contract-review"
  | "payment";
type SchoolNetwork = "estadual" | "municipal" | "federal" | "particular";

interface SchoolResult {
  id: string;
  name: string;
  city: string;
  state: string;
  inep_code: string | null;
}

interface SchoolFormData {
  cnpj: string;
  gestorCpf: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  contact: string;
  email: string;
}

const PLANS = [
  {
    id: "mensal",
    name: "Mensal",
    price: "R$ 199,90",
    period: "/mês",
    highlight: true,
    badge: "Mais escolhido",
    features: [
      "Agendamento ilimitado",
      "Gestão de recursos",
      "Relatórios básicos",
      "Suporte por email",
    ],
  },
  {
    id: "anual_12",
    name: "Anual (1 Ano)",
    price: "R$ 2.278,86",
    period: "/ano",
    highlight: false,
    badge: "5% de desconto",
    features: [
      "Tudo do plano mensal",
      "Pagamento único à vista",
      "Economia de R$ 119,94",
    ],
  },
  {
    id: "anual_24",
    name: "Bianual (2 Anos)",
    price: "R$ 4.317,84",
    period: "/2 anos",
    highlight: false,
    badge: "10% de desconto",
    features: [
      "Tudo do plano anual",
      "Preço congelado por 2 anos",
      "Economia de R$ 479,76",
    ],
  },
];

const maskCNPJ = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

const maskCEP = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
};

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

const maskCardNumber = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 16);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
};


function SchoolNameSearch({
  network,
  onSelect,
}: {
  network: SchoolNetwork | null;
  onSelect: (s: SchoolResult) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_schools_public", {
        search_query: term,
      });
      const filtered = ((data as any[]) || []).filter(
        (s) => !network || s.network === network
      );
      setResults(filtered.slice(0, 20));
      setLoading(false);
      setOpen(true);
    }, 280);
    return () => clearTimeout(t);
  }, [q, network]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nome da escola, cidade ou estado…"
          value={q}
          onChange={(e) => setQ(e.target.value.replace(/@/g, ""))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          className="pl-10 h-12 rounded-xl bg-secondary/50 border-0"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-card shadow-lg max-h-64 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors border-b border-border/40 last:border-0"
              onMouseDown={() => {
                onSelect(s);
                setQ(s.name);
                setOpen(false);
              }}
            >
              <p className="font-semibold text-sm break-words">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {s.city} — {s.state}
                {s.inep_code ? ` · INEP ${s.inep_code}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-card shadow-lg p-4 text-center">
          <p className="text-xs text-muted-foreground">Nenhuma escola encontrada</p>
        </div>
      )}
    </div>
  );
}

const Subscription = () => {

  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { buildWhatsappUrl, contact } = useSupportContact();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [step, setStep] = useState<SubscriptionStep>("plans");
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false);
  const [cardVerifyOpen, setCardVerifyOpen] = useState(false);
  const [cardVerifyPaymentId, setCardVerifyPaymentId] = useState<string | null>(null);
  const [pixForceRegenerate, setPixForceRegenerate] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<SchoolNetwork | null>(null);
  const [inepCode, setInepCode] = useState("");
  const [searchingSchool, setSearchingSchool] = useState(false);
  const [foundSchool, setFoundSchool] = useState<SchoolResult | null>(null);
  const [schoolNotFound, setSchoolNotFound] = useState(false);
  const [formData, setFormData] = useState<SchoolFormData>({
    cnpj: "",
    gestorCpf: "",
    cep: "",
    address: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    contact: "",
    email: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card" | "boleto" | null>(() => {
    try {
      const saved = localStorage.getItem("subscription:paymentMethod");
      if (saved === "pix" || saved === "card" || saved === "boleto") return saved;
    } catch { /* noop */ }
    return null;
  });
  // Persiste seleção do método de pagamento entre etapas/recargas
  useEffect(() => {
    try {
      if (paymentMethod) localStorage.setItem("subscription:paymentMethod", paymentMethod);
      else localStorage.removeItem("subscription:paymentMethod");
    } catch { /* noop */ }
  }, [paymentMethod]);
  // Limpa o feedback de erro do botão assim que o usuário escolhe um método
  useEffect(() => {
    if (paymentMethod) setPaymentMethodError(false);
  }, [paymentMethod]);
  // Feedback ao tocar em PIX/Cartão (pagamento online indisponível)
  const [loadingMethod, setLoadingMethod] = useState<"pix" | "card" | "boleto" | null>(null);
  // Trava síncrona contra múltiplos cliques: bloqueia antes do React aplicar o setState do loadingMethod.
  const paymentLockRef = useRef(false);
  // Guarda o id do setTimeout da verificação de método (700ms) para poder cancelar
  // no unmount e evitar setState após desmontar.
  const paymentTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (paymentTimeoutRef.current !== null) {
        clearTimeout(paymentTimeoutRef.current);
        paymentTimeoutRef.current = null;
      }
    };
  }, []);
  const [unavailableNotice, setUnavailableNotice] = useState<"pix" | "card" | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentMethodError, setPaymentMethodError] = useState(false);
  const [planMissingError, setPlanMissingError] = useState(false);
  const [pixData, setPixData] = useState<{
    pagamento_id?: string | null;
    qr_code: string | null;
    qr_code_base64: string | null;
    payment_id: string | number;
    status: string;
    expires_at?: string;
    sandbox?: boolean;
  } | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [boletoLoading, setBoletoLoading] = useState(false);
  type BoletoStage = "idle" | "creating" | "awaiting" | "confirming" | "approved" | "rejected";
  const [boletoStage, setBoletoStage] = useState<BoletoStage>("idle");
  const [boletoStageDetail, setBoletoStageDetail] = useState<string>("");
  const [boletoIssuer, setBoletoIssuer] = useState<"bolbradesco" | "pec">(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("boletoIssuer") : null;
    return saved === "pec" ? "pec" : "bolbradesco";
  });
  const [confirmingPix, setConfirmingPix] = useState(false);
  const [pixMode, setPixMode] = useState<"prod" | "test">("prod");
  const [cepLoading, setCepLoading] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [acceptedFullName, setAcceptedFullName] = useState("");
  const [adminSignatureDataUrl, setAdminSignatureDataUrl] = useState<string | null>(null);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [signedUploaded, setSignedUploaded] = useState<{ path: string; name: string; uploaded_at?: string; status?: string } | null>(null);
  const [uploadingSigned, setUploadingSigned] = useState(false);
  const signedInputRef = useRef<HTMLInputElement>(null);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  // Versão assinada PRIMEIRO pela contraparte (admin da plataforma)
  const [adminUploaded, setAdminUploaded] = useState<{ path: string; name: string; uploaded_at: string } | null>(null);
  const [adminPreviewUrl, setAdminPreviewUrl] = useState<string | null>(null);
  const [checkingAdminSig, setCheckingAdminSig] = useState(false);
  const [companyData, setCompanyData] = useState<any>(null);
  const [showCongrats, setShowCongrats] = useState(false);
  const [showSandboxFailure, setShowSandboxFailure] = useState(false);
  // Nenhum plano vem pré-marcado: o usuário escolhe sempre manualmente.
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  useEffect(() => {
    try { localStorage.removeItem("subscription:selectedPlan"); } catch {}
  }, []);
  const [showPlanError, setShowPlanError] = useState(false);
  // Plano travado pela "Forma de pagamento do contrato" no topo.
  // Quando definido, o grid de planos abaixo fica preso a esta escolha.
  const [lockedPlanId, setLockedPlanId] = useState<string | null>(null);
  const [lockedHintOpen, setLockedHintOpen] = useState(false);
  const planRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const selectedPlanDetails = useMemo(
    () => PLANS.find((p) => p.id === selectedPlan || p.name === selectedPlan) ?? null,
    [selectedPlan]
  );
  const selectedPlanId = selectedPlanDetails?.id ?? null;

  // Migração de plano (mensal -> anual à vista, descontando meses pagos)
  type MigrationQuote = {
    valor_mensal: number;
    meses_ciclo: number;
    meses_pagos: number;
    meses_restantes: number;
    valor_total: number;
  };
  const [migrationQuote, setMigrationQuote] = useState<MigrationQuote | null>(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [migrationPix, setMigrationPix] = useState<{
    qr_code?: string;
    qr_code_base64?: string;
    ticket_url?: string | null;
    pagamento_id?: string;
  } | null>(null);

  // Gestor oficial da escola (pode ser diferente do usuário logado, ex.: assistente).
  // O contrato SEMPRE deve sair em nome do(a) gestor(a) aprovado(a).
  const [gestorProfile, setGestorProfile] = useState<{ full_name: string; cpf: string | null; phone: string | null } | null>(null);
  useEffect(() => {
    const schoolId = profile?.school_id ?? foundSchool?.id;
    if (!schoolId) { setGestorProfile(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, cpf, phone, is_approved, created_at")
        .eq("school_id", schoolId)
        .in("role", ["gestor_pedagogico", "chef_projeto_vida"])
        .eq("is_approved", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setGestorProfile({ full_name: data.full_name, cpf: (data as any).cpf ?? null, phone: data.phone ?? null });
        // Pré-preenche o CPF do contrato com o do gestor oficial (substitui CPF do usuário logado)
        if ((data as any).cpf) {
          setFormData((prev) => ({ ...prev, gestorCpf: maskCPF((data as any).cpf) }));
        }
      } else setGestorProfile(null);
    })();
    return () => { cancelled = true; };
  }, [profile?.school_id, foundSchool?.id]);

  // Solicitação ao gestor para assinar o contrato (quando usuário logado não é gestor)
  const [requestingContractSign, setRequestingContractSign] = useState(false);
  const handleRequestContractSigning = async () => {
    if (requestingContractSign) return;
    setRequestingContractSign(true);
    try {
      const { error } = await supabase.rpc("request_contract_signing" as any, { _message: null });
      if (error) throw error;
      toast.success(
        gestorProfile?.full_name
          ? `Solicitação enviada para ${gestorProfile.full_name}.`
          : "Solicitação enviada ao gestor da escola."
      );
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível enviar a solicitação.");
    } finally {
      setRequestingContractSign(false);
    }
  };

  // Helpers: nome/CPF a usar no contrato (gestor oficial > usuário logado)
  const contractSignerName = gestorProfile?.full_name || profile?.full_name || "—";
  const contractSignerCpf = gestorProfile?.cpf || null;

  useEffect(() => {
    if (!profile?.school_id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_plan_migration_quote", {
        _school_id: profile.school_id,
      });
      if (cancelled) return;
      if (error) { setMigrationQuote(null); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setMigrationQuote(null); return; }
      setMigrationQuote({
        valor_mensal: Number(row.valor_mensal),
        meses_ciclo: Number(row.meses_ciclo),
        meses_pagos: Number(row.meses_pagos),
        meses_restantes: Number(row.meses_restantes),
        valor_total: Number(row.valor_total),
      });
    })();
    return () => { cancelled = true; };
  }, [profile?.school_id]);

  const handleStartMigration = async () => {
    if (!profile || !user || !migrationQuote || migrationQuote.meses_restantes <= 0) return;
    setMigrationLoading(true);
    setMigrationDialogOpen(true);
    setMigrationPix(null);
    try {
      const resp = await criarPagamentoMP({
        plano: "migracao_anual" as any,
        metodo: "pix",
        payer: {
          email: user.email ?? "",
          first_name: profile.full_name?.split(" ")[0] ?? "Gestor",
          last_name: profile.full_name?.split(" ").slice(1).join(" ") || "Escolar",
        },
      });
      setMigrationPix({
        qr_code: resp.qr_code,
        qr_code_base64: resp.qr_code_base64,
        ticket_url: resp.ticket_url,
        pagamento_id: resp.pagamento_id,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar PIX de migração");
      setMigrationDialogOpen(false);
    } finally {
      setMigrationLoading(false);
    }
  };

  // Checkout Transparente
  const [mpInstance, setMpInstance] = useState<any>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const cardFormRef = useRef<any>(null);
  const [cardFormData, setCardFormData] = useState({
    cardNumber: "",
    cardholderName: "",
    cardExpirationMonth: "",
    cardExpirationYear: "",
    securityCode: "",
    installments: "1",
    identificationType: "CPF",
    identificationNumber: "",
    issuer: "",
    email: "",
  });
  const [showCardForm, setShowCardForm] = useState(false);
  const [showSecurityCode, setShowSecurityCode] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [issuers, setIssuers] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [cardFormMounted, setCardFormMounted] = useState(false);
  const [cardFormError, setCardFormError] = useState<string | null>(null);
  const [cardConfirmOpen, setCardConfirmOpen] = useState(false);

  // Deep-link: /subscription?step=contract&school=ID
  // Pula direto para a etapa de contrato carregando os dados da escola.
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (!profile) return;
    const params = new URLSearchParams(window.location.search);
    const wantStep = params.get("step");
    const wantReaceite = params.get("reaceite") === "1";
    const schoolParam = params.get("school");
    if (wantStep !== "contract" && wantStep !== "payment" && !wantReaceite) return;
    deepLinkAppliedRef.current = true;

    const schoolId = schoolParam || profile.school_id;
    if (!schoolId) return;

    (async () => {
      const { data: school } = await supabase
        .from("schools")
        .select("id, name, city, state, inep_code, network, address")
        .eq("id", schoolId)
        .maybeSingle();
      if (!school) return;
      setFoundSchool({
        id: school.id,
        name: school.name,
        city: school.city,
        state: school.state,
        inep_code: school.inep_code,
      });
      setSelectedNetwork((school.network as SchoolNetwork) || "estadual");
      // Pré-popula campos disponíveis (sem exigir reentrada de INEP/CNPJ/CEP)
      setFormData((prev) => ({
        ...prev,
        city: school.city || prev.city,
        state: school.state || prev.state,
        address: school.address || prev.address,
        email: prev.email || user?.email || "",
        contact: prev.contact || profile.phone || "",
      }));
      // Pré-carrega dados da CONTRATANTE (necessário para o PDF do aceite)
      const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      setCompanyData(company);
      setAdminSignatureDataUrl((company as any)?.admin_signature_path || null);
      setStep(wantStep === "payment" ? "payment" : "contract-view");
    })();
  }, [profile, user?.email]);


  useEffect(() => {
    const loadMP = async () => {
      try {
        const config = await getMpConfigStatus();
        const key = config.active_mode === "prod" 
          ? config.secrets.MERCADOPAGO_PUBLIC_KEY_PROD.value 
          : config.secrets.MERCADOPAGO_PUBLIC_KEY_TEST.value;
        
        if (key) {
          setPublicKey(key);
        }
      } catch (e) {
        console.error("[MP] Error loading config", e);
      }
    };
    loadMP();
  }, []);

  // Script do Mercado Pago
  useEffect(() => {
    if (paymentMethod === 'card' && !window.MercadoPago) {
      const script = document.createElement('script');
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = () => console.log("MP SDK loaded");
      document.body.appendChild(script);
    }
  }, [paymentMethod]);

  useEffect(() => {
    if (window.MercadoPago && publicKey && !mpInstance) {
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
      setMpInstance(mp);
      console.log("[MP] Instance created with key:", publicKey.substring(0, 10) + "...");
    }
  }, [publicKey, mpInstance]);

  // Detecta bandeira e emissores ao digitar o cartão
  useEffect(() => {
    const digits = cardFormData.cardNumber.replace(/\s/g, '');
    if (digits.length < 6) return;

    // 1) Fallback local imediato (não depende da MP)
    const localBrand = detectCardBrandLocal(digits);
    if (localBrand && !paymentMethodId) {
      setPaymentMethodId(localBrand);
    }

    if (!mpInstance) return;
    const bin = digits.substring(0, 6);
    const identify = async () => {
      try {
        const methods = await mpInstance.getPaymentMethods({ bin });
        if (methods.length > 0) {
          setPaymentMethodId(methods[0].id);
          const issuerRes = await mpInstance.getIssuers({ paymentMethodId: methods[0].id, bin });
          setIssuers(issuerRes);
          if (issuerRes.length > 0) {
            setCardFormData(prev => ({ ...prev, issuer: issuerRes[0].id }));
          }
        } else if (localBrand) {
          // MP não reconheceu — mantém bandeira local
          setPaymentMethodId(localBrand);
        }
      } catch (e) {
        console.error("[MP] Identification error", e);
        if (localBrand) setPaymentMethodId(localBrand);
      }
    };
    identify();
  }, [cardFormData.cardNumber, mpInstance, paymentMethodId]);

  // Busca opções de parcelamento
  useEffect(() => {
    if (!mpInstance || !paymentMethodId || !cardFormData.issuer || !selectedPlanId) return;
    
    const plan = PLANS.find(p => p.id === selectedPlanId);
    const amountStr = plan ? plan.price.replace("R$ ", "").replace(".", "").replace(",", ".") : "199.90";

    const fetchInst = async () => {
      try {
        const inst = await mpInstance.getInstallments({
          amount: amountStr,
          paymentMethodId,
          issuerId: cardFormData.issuer
        });
        if (inst.length > 0) {
          // Filtra para mostrar apenas até 3x sem juros (se disponível) ou conforme a regra solicitada
          const costs = inst[0].payer_costs;
          setInstallments(costs);
          
          if (costs.length > 0) {
            setCardFormData(prev => ({ ...prev, installments: costs[0].installments.toString() }));
          }
        }
      } catch (e) {
        console.error("[MP] Installments error", e);
      }
    };
    fetchInst();
  }, [paymentMethodId, cardFormData.issuer, mpInstance, selectedPlanId]);

  // Inicializa o CardForm do Mercado Pago (V2)
  useEffect(() => {
    if (!mpInstance || !showCardForm || cardFormRef.current) return;

    setCardFormMounted(false);
    setCardFormError(null);

    // Timeout para garantir que o DOM renderizou TODOS os campos esperados pelo SDK.
    const timer = setTimeout(() => {
      // Pré-checagem: confirma que todos os ids existem antes de chamar mp.cardForm()
      const requiredIds = [
        "form-checkout",
        "cardNumber",
        "expirationMonth",
        "expirationYear",
        "securityCode",
        "cardholderName",
        "issuer",
        "installments",
        "identificationType",
        "identificationNumber",
        "email",
      ];
      const missing = requiredIds.filter((id) => !document.getElementById(id));
      if (missing.length > 0) {
        const msg = `Campos ausentes no DOM antes do mount do CardForm: ${missing.join(", ")}`;
        console.error("[MP]", msg);
        setCardFormError(msg);
        return;
      }

      try {
        console.log("[MP] Initializing CardForm...");
        const plan = PLANS.find(p => p.id === selectedPlanId);
        const amountStr = plan ? plan.price.replace("R$ ", "").replace(".", "").replace(",", ".") : "199.90";
        
        const cardForm = mpInstance.cardForm({
          amount: amountStr,
          iframe: false,
          form: {
            id: "form-checkout",
            cardNumber: { id: "cardNumber" },
            expirationMonth: { id: "expirationMonth" },
            expirationYear: { id: "expirationYear" },
            securityCode: { id: "securityCode" },
            cardholderName: { id: "cardholderName" },
            issuer: { id: "issuer" },
            installments: { id: "installments" },
            identificationType: { id: "identificationType" },
            identificationNumber: { id: "identificationNumber" },
            cardholderEmail: { id: "email" },
          },
          callbacks: {
            onFormMounted: (error: any) => {
              if (error) {
                console.warn("[MP] Form Mounted Handling Error:", error);
                setCardFormError(
                  typeof error?.message === "string"
                    ? error.message
                    : "Falha ao montar o formulário de cartão. Recarregue a página."
                );
                setCardFormMounted(false);
                return;
              }
              console.log("[MP] ✅ CardForm mounted successfully");
              setCardFormMounted(true);
              setCardFormError(null);
            },
            onSubmit: (event: any) => {
              event.preventDefault();
              console.log("[MP] onSubmit fired");
              try {
                const formData = cardForm.getCardFormData();
                console.log("[MP] CardForm Submit Callback Data:", {
                  ...formData,
                  token: formData?.token ? "***present***" : "MISSING",
                });

                if (!formData?.token) {
                  toast.error("Não foi possível gerar o token do cartão. Verifique os dados.");
                  setProcessing(false);
                  return;
                }

                processCardPayment({
                  token: formData.token,
                  amount: formData.amount,
                  installments: formData.installments,
                  payment_method_id: formData.paymentMethodId,
                  issuer_id: formData.issuerId,
                  email: formData.cardholderEmail,
                });
              } catch (err) {
                console.error("[MP] Error getting form data:", err);
                toast.error("Erro ao coletar dados do cartão.");
                setProcessing(false);
              }
            },
            onFetching: (resource: any) => {
              console.log("[MP] Fetching resource:", resource);
            },
            onValidityChange: (error: any, field: any) => {
              if (error) console.log("[MP] Validity error:", field, error);
            },
            onCardTokenReceived: (error: any, token: any) => {
              if (error) {
                console.error("[MP] CardTokenReceived error:", error);
                toast.error("Falha ao tokenizar o cartão. Verifique os dados informados.");
                setProcessing(false);
                return;
              }
              console.log("[MP] CardTokenReceived OK", token?.id ? "***" : "no-id");
            },
          },
        });

        cardFormRef.current = cardForm;
      } catch (e: any) {
        console.error("[MP] CardForm Init Error", e);
        setCardFormError(e?.message ?? "Erro ao inicializar o formulário de cartão.");
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      if (cardFormRef.current?.unmount) {
        try { cardFormRef.current.unmount(); } catch { /* ignore */ }
      }
      cardFormRef.current = null;
      setCardFormMounted(false);
    };
  }, [mpInstance, showCardForm]);

  const processCardPayment = async (data: any) => {
    if (!selectedPlanId) {
      toast.error("Plano não selecionado.");
      return;
    }
    
    // Normalização para aceitar novos planos anuais estendidos
    const planNormalized = selectedPlanId;
    if (!PLANS.some(p => p.id === planNormalized)) {
      toast.error("Plano selecionado não é suportado pelo sistema de pagamento.");
      return;
    }

    setProcessing(true);
    try {
      const res = await criarPagamentoMP({
        plano: planNormalized as any,
        metodo: "cartao",

        token: data.token,
        installments: parseInt(data.installments),
        issuer_id: data.issuer_id ? parseInt(data.issuer_id) : undefined,
        payment_method_id: data.payment_method_id,
        payer: {
          email: data.email || user?.email || formData.email,
          first_name: cardFormData.cardholderName.split(" ")[0] || "Gestor",
          last_name: cardFormData.cardholderName.split(" ").slice(1).join(" ") || "Escolar",
          identification: {
            type: cardFormData.identificationType as "CPF" | "CNPJ",
            number: cardFormData.identificationNumber.replace(/\D/g, ""),
          },
        },
      });

      // Sempre abre a tela de verificação para o cliente acompanhar
      setCardVerifyPaymentId(res.mp_payment_id ? String(res.mp_payment_id) : null);
      setCardVerifyOpen(true);

      if (res.status === "approved") {
        toast.success("Pagamento aprovado! Validando liberação...");
        startPolling(res.mp_payment_id);
      } else if (res.status === "in_process" || res.status === "pending") {
        toast.info("Pagamento em processamento. Acompanhe a verificação.");
        startPolling(res.mp_payment_id);
      } else {
        toast.error(`O pagamento foi ${res.status}. Tente outro cartão ou método.`);
      }
    } catch (err: any) {
      console.error("[MP] Payment error", err);
      toast.error(err.message || "Falha ao processar pagamento com cartão.");
    } finally {
      setProcessing(false);
    }
  };

  type PaymentSummary = {
    id: string | number;
    status: string;
    amount: number;
    currency: string;
    payment_method_id?: string;
    payment_type_id?: string;
    date_approved?: string | null;
    description?: string | null;
  };
  type SchoolSummary = {
    id: string;
    name: string | null;
    subscription_status: string | null;
    subscription_end_date: string | null;
  };
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [schoolSummary, setSchoolSummary] = useState<SchoolSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryPending, setSummaryPending] = useState(false);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Status atual da assinatura da escola do usuário (independente do fluxo de pagamento)
  const [currentSubscription, setCurrentSubscription] = useState<{
    status: string | null;
    endDate: string | null;
    schoolName: string | null;
  } | null>(null);

  useEffect(() => {
    const schoolId = profile?.school_id;
    if (!schoolId) { setCurrentSubscription(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("name,subscription_status,subscription_end_date")
        .eq("id", schoolId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setCurrentSubscription({
          status: data.subscription_status ?? null,
          endDate: data.subscription_end_date ?? null,
          schoolName: data.name ?? null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.school_id]);

  const isSubscriptionActive = (() => {
    if (!currentSubscription?.status) return false;
    if (!["active", "paid"].includes(currentSubscription.status)) return false;
    if (!currentSubscription.endDate) return false;
    const end = new Date(`${currentSubscription.endDate}T23:59:59`);
    return end.getTime() >= Date.now();
  })();
  const subscriptionDaysLeft = (() => {
    if (!isSubscriptionActive || !currentSubscription?.endDate) return null;
    const end = new Date(`${currentSubscription.endDate}T23:59:59`).getTime();
    return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
  })();

  // Cronômetro: atualiza a cada 1s enquanto o resumo está pendente/carregando.
  useEffect(() => {
    if (!summaryPending && !loadingSummary) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [summaryPending, loadingSummary]);

  const POLL_TOTAL_MS = 6_000 + 10 * 3_000; // Reduzido para ser ainda mais rápido (≈36s)
  const elapsedMs = pollStartedAt ? nowTick - pollStartedAt : 0;
  const remainingMs = Math.max(0, POLL_TOTAL_MS - elapsedMs);
  const fmtDuration = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
  };

  // Controle de polling: ref permite cancelar a execução em curso e reiniciar
  // a partir do botão "Atualizar agora" sem recarregar a página.
  const pollControlRef = useRef<{ cancel: () => void } | null>(null);
  const lastPaymentIdRef = useRef<string | undefined>(undefined);

  const startPolling = useCallback((paymentId?: string) => {
    // Cancela qualquer polling anterior em andamento.
    pollControlRef.current?.cancel();

    if (paymentId !== undefined) lastPaymentIdRef.current = paymentId;
    const effectivePaymentId = paymentId ?? lastPaymentIdRef.current;

    setPaymentSummary(null);
    setSchoolSummary(null);
    setLoadingSummary(true);
    setSummaryPending(false);
    setPollStartedAt(Date.now());
    setNowTick(Date.now());

    let cancelled = false;
    let timeoutId: number | undefined;
    const control = {
      cancel: () => {
        cancelled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
      },
    };
    pollControlRef.current = control;

    const checkOnce = async () => {
      if (!effectivePaymentId) {
        console.warn("startPolling: No paymentId provided");
        return { ok: false };
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase.functions.invoke<{
        payment: PaymentSummary | null;
        school: SchoolSummary | null;
      }>("mp-check-payment", {
        body: { payment_id: effectivePaymentId },
      });

      const payment = data?.payment as PaymentSummary | null | undefined;
      const school = data?.school as SchoolSummary | null | undefined;

      if (payment?.status) {
        setPixData((prev) => prev ? { ...prev, status: payment.status } : prev);
      }

      const paymentApproved = !!payment && payment.status === "approved";
      const schoolUpdated =
        !!school &&
        school.subscription_status === "active" &&
        !!school.subscription_end_date &&
        new Date(`${school.subscription_end_date}T00:00:00`) >= today;

      return { ok: !error && paymentApproved && schoolUpdated, payment, school };
    };

    (async () => {
      // Fase 1: polling rápido (6 tentativas a cada 1s ≈ 6s) com loading visível.
      const fastAttempts = 6;
      for (let i = 0; i < fastAttempts; i++) {
        if (cancelled) return;
        const { ok, payment, school } = await checkOnce();
        if (cancelled) return;
        if (ok) {
          setPaymentSummary(payment!);
          setSchoolSummary(school!);
          setLoadingSummary(false);
          setSummaryPending(false);
          setShowCongrats(true);
          window.history.replaceState({}, "", "/subscription");
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (cancelled) return;
      // Fase 2: ainda não confirmado — exibe aviso amigável e segue reconsultando.
      setPaymentSummary(null);
      setSchoolSummary(null);
      setSummaryPending(true);
      setLoadingSummary(false);
      window.history.replaceState({}, "", "/subscription");

      // Polling lento contínuo: a cada 10s, até 30 tentativas (≈5min adicionais).
      const slowMaxAttempts = 30;
      let slowAttempt = 0;

      const scheduleNext = () => {
        if (cancelled || slowAttempt >= slowMaxAttempts) return;
        timeoutId = window.setTimeout(async () => {
          slowAttempt++;
          if (cancelled) return;
          const { ok, payment, school } = await checkOnce();
          if (cancelled) return;
          if (ok) {
            setPaymentSummary(payment!);
            setSchoolSummary(school!);
            setSummaryPending(false);
            setShowCongrats(true);
            return;
          }
          scheduleNext();
        }, 5000);
      };
      scheduleNext();
    })();
  }, []);

  // Detecta retorno do Mercado Pago e dispara o polling automático.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get("mp");
    if (mpStatus !== "success") return;

    const paymentId = params.get("payment_id") ?? params.get("collection_id") ?? undefined;
    startPolling(paymentId);

    return () => {
      pollControlRef.current?.cancel();
    };
  }, [startPolling]);

  // Deep-link: /subscription?plano=anual_12 — pré-seleciona o plano e rola até ele
  const planDeepLinkRef = useRef(false);
  useEffect(() => {
    if (planDeepLinkRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const wantPlano = params.get("plano");
    if (!wantPlano) return;
    const plan = PLANS.find((p) => p.id === wantPlano);
    if (!plan) return;
    planDeepLinkRef.current = true;
    setSelectedPlan(plan.name);
    setTimeout(() => {
      planRefs.current[plan.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      planRefs.current[plan.id]?.focus({ preventScroll: true });
    }, 300);
  }, []);

  // Detecta retorno com falha do Mercado Pago. Se o pagamento foi iniciado
  // em sandbox (token TEST-*), exibe aviso explicando que o checkout exige
  // dados de teste oficiais — cartões reais não são aceitos no sandbox.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get("mp");
    if (mpStatus !== "failure") return;

    let isSandbox = false;
    try {
      isSandbox = sessionStorage.getItem("mp_sandbox") === "1";
    } catch {
      /* ignore */
    }

    if (isSandbox) {
      setShowSandboxFailure(true);
    } else {
      toast.error("Pagamento não concluído. Verifique seus dados e tente novamente.");
    }

    // Limpa parâmetros para evitar reabrir o aviso ao recarregar.
    window.history.replaceState({}, "", "/subscription");
  }, []);

  // Carrega PIX em cache do banco ao entrar na tela ou selecionar PIX
  useEffect(() => {
    const schoolId = profile?.school_id ?? foundSchool?.id ?? null;
    if (!schoolId || pixData || paymentMethod !== "pix" || pixForceRegenerate) return;
    
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("pagamentos")
        .select("id, mp_payment_id, qr_code, qr_code_base64, status, expires_at")
        .eq("school_id", schoolId)
        .eq("metodo", "pix")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      
      if (data?.qr_code) {
        const expired = data.expires_at && new Date(data.expires_at) <= new Date();
        if (!expired) {
          setPixData({
            pagamento_id: data.id,
            qr_code: data.qr_code,
            qr_code_base64: data.qr_code_base64,
            payment_id: data.mp_payment_id || "",
            status: data.status || "pending",
            expires_at: data.expires_at,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [paymentMethod, profile?.school_id, foundSchool?.id, pixData, pixForceRegenerate]);

  // Polling em tempo real para o status do PIX
  useEffect(() => {
    if (!pixData?.payment_id || !paymentDetailOpen || paymentMethod !== "pix") return;

    let intervalId: number;
    let cancelled = false;

    const checkStatus = async () => {
      try {
        const { data, error } = await supabase
          .from("pagamentos")
          .select("status")
          .eq("mp_payment_id", String(pixData.payment_id))
          .maybeSingle();

        if (cancelled) return;
        
        if (data?.status && data.status !== pixData.status) {
          setPixData(prev => prev ? { ...prev, status: data.status } : null);
        }

        if (data?.status === "approved") {
          toast.success("Pagamento aprovado!");
          // Dispara o mesmo polling de sucesso que o redirecionamento do MP faria
          startPolling(String(pixData.payment_id));
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Erro ao verificar status do PIX:", err);
      }
    };
    intervalId = window.setInterval(checkStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [pixData?.payment_id, paymentDetailOpen, paymentMethod, startPolling]);

  const handleCardPayment = async () => {
    if (processing) return;

    // Validação prévia compartilhada (fluxo cardForm OU manual)
    const cardDigits = cardFormData.cardNumber.replace(/\s/g, "");
    if (cardDigits.length < 13) {
      toast.error("Número do cartão inválido.");
      return;
    }
    if (!cardFormData.cardholderName.trim()) {
      toast.error("Informe o nome do titular como impresso no cartão.");
      return;
    }
    if (cardFormData.cardExpirationMonth.length !== 2 || cardFormData.cardExpirationYear.length < 2) {
      toast.error("Validade do cartão inválida (MM/AA).");
      return;
    }
    if (cardFormData.securityCode.length < 3) {
      toast.error("CVV inválido.");
      return;
    }
    if (cardFormData.identificationNumber.replace(/\D/g, "").length < 11) {
      toast.error("CPF do titular inválido.");
      return;
    }

    if (cardFormRef.current && cardFormMounted) {
      console.log("[MP] Triggering CardForm submit via requestSubmit()...");
      const form = document.getElementById("form-checkout") as HTMLFormElement;
      if (form) {
        setProcessing(true);
        form.requestSubmit();
        return;
      }
    } else {
      console.warn("[MP] CardForm not mounted — using manual tokenization fallback", {
        hasRef: !!cardFormRef.current,
        mounted: cardFormMounted,
        error: cardFormError,
      });
    }

    // Fallback para o modo manual caso o CardForm não esteja inicializado
    try {
      if (!mpInstance) {
        toast.error("Aguarde o carregamento do sistema de pagamento.");
        return;
      }

      // Validação básica antes de tokenizar
      if (!cardFormData.cardNumber || !cardFormData.cardholderName || !cardFormData.securityCode) {
        toast.error("Preencha todos os campos do cartão.");
        return;
      }

      if (!cardFormData.identificationNumber) {
        toast.error("Informe o CPF do titular.");
        return;
      }

      setProcessing(true);

      const bin = cardFormData.cardNumber.replace(/\s/g, '').substring(0, 6);
      let effectivePaymentMethodId = paymentMethodId;

      if (!effectivePaymentMethodId) {
        console.log("[MP] Re-identifying payment method...");
        try {
          const methods = await mpInstance.getPaymentMethods({ bin });
          if (methods && methods.length > 0) {
            effectivePaymentMethodId = methods[0].id;
            setPaymentMethodId(methods[0].id);
          }
        } catch (e) {
          console.warn("[MP] getPaymentMethods failed, will use local detection", e);
        }
      }

      // Fallback de detecção local (Visa, Master, Elo, Hipercard, Amex, etc.)
      if (!effectivePaymentMethodId) {
        const localBrand = detectCardBrandLocal(cardDigits);
        if (localBrand) {
          console.log("[MP] Using local brand detection:", localBrand);
          effectivePaymentMethodId = localBrand;
          setPaymentMethodId(localBrand);
        }
      }

      if (!effectivePaymentMethodId) {
        throw new Error("Bandeira do cartão não reconhecida. Verifique o número digitado.");
      }

      const cardToken = await mpInstance.createCardToken({
        cardNumber: cardFormData.cardNumber.replace(/\s/g, ''),
        cardholderName: cardFormData.cardholderName,
        cardExpirationMonth: cardFormData.cardExpirationMonth,
        cardExpirationYear: cardFormData.cardExpirationYear,
        securityCode: cardFormData.securityCode,
        identificationType: cardFormData.identificationType,
        identificationNumber: cardFormData.identificationNumber.replace(/\D/g, ''),
      });

      if (!cardToken || !cardToken.id) {
        throw new Error("Não foi possível gerar o token do cartão. Verifique os dados.");
      }

      processCardPayment({
        token: cardToken.id,
        amount: 199.90,
        installments: parseInt(cardFormData.installments),
        payment_method_id: effectivePaymentMethodId,
        issuer_id: cardFormData.issuer ? parseInt(cardFormData.issuer) : undefined,
        email: user?.email || formData.email,
      });
    } catch (err: any) {
      console.error("[MP] Manual tokenization error", err);
      toast.error(err.message || "Erro ao processar cartão.");
      setProcessing(false);
    }
  };



  const loadCompanyData = useCallback(async () => {
    const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
    setCompanyData(data);
  }, []);

  const contractRef = useRef<HTMLDivElement>(null);
  const autoGeneratedRef = useRef(false);
  const pdfDownloadedRef = useRef(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Chave de persistência por escola (fallback para chave genérica enquanto a escola não é conhecida).
  const pdfDownloadedStorageKey = useMemo(() => {
    const schoolId = profile?.school_id ?? foundSchool?.id ?? "anon";
    return `subscription:contract-pdf-downloaded:${schoolId}`;
  }, [profile?.school_id, foundSchool?.id]);

  // Restaura status persistido (sobrevive a reload da página).
  useEffect(() => {
    try {
      if (localStorage.getItem(pdfDownloadedStorageKey) === "1") {
        pdfDownloadedRef.current = true;
      } else {
        pdfDownloadedRef.current = false;
      }
    } catch {
      // localStorage indisponível — segue apenas em memória.
    }
  }, [pdfDownloadedStorageKey]);

  const handleDownloadContractTextPdf = () => {
    try {
      // Formato A4 com margens ABNT (sup/esq 3cm, inf/dir 2cm), Times 12, espaço 1,5, texto justificado
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginLeft = 30;
      const marginRight = 20;
      const marginTop = 30;
      const marginBottom = 20;
      const fontFamily = "times";
      const fontSize = 12;
      const lineSpacing = 1.5;
      const firstLineIndent = 12.5; // 1,25 cm
      const maxW = pageW - marginLeft - marginRight;
      let y = marginTop;

      // ===== Validação ABNT antes de gerar o PDF =====
      const abntCheck = validateAbntLayout({
        pageWidthMm: pageW,
        pageHeightMm: pageH,
        marginTopMm: marginTop,
        marginBottomMm: marginBottom,
        marginLeftMm: marginLeft,
        marginRightMm: marginRight,
        firstLineIndentMm: firstLineIndent,
        fontFamily,
        fontSizePt: fontSize,
        lineSpacing,
      });
      if (!abntCheck.valid) {
        const msg = "Contrato fora do padrão ABNT:\n• " + abntCheck.errors.join("\n• ");
        console.error("[ABNT]", abntCheck.errors);
        toast.error("Contrato fora do padrão ABNT. Geração cancelada.", { description: abntCheck.errors[0] });
        setPdfError(msg);
        return;
      }

      const ensureSpace = (h: number) => {
        if (y + h > pageH - marginBottom) {
          pdf.addPage();
          y = marginTop;
        }
      };
      const addParagraph = (
        text: string,
        opts?: { bold?: boolean; size?: number; gap?: number; align?: "left" | "center" | "justify"; indent?: boolean },
      ) => {
        const size = opts?.size ?? 12;
        pdf.setFont("times", opts?.bold ? "bold" : "normal");
        pdf.setFontSize(size);
        const align = opts?.align ?? "justify";
        const indent = opts?.indent ?? (align === "justify");
        // Espaço 1,5 (ABNT) → multiplicador 1.5 sobre a altura da fonte (~size*0.3528mm)
        const lh = size * 0.3528 * 1.5;
        const firstLineW = indent ? maxW - 12.5 : maxW; // recuo de 1,25cm na primeira linha
        const firstLines = pdf.splitTextToSize(text, firstLineW) as string[];
        const first = firstLines.shift() ?? "";
        const restText = firstLines.join(" ") + (firstLines.length ? "" : "");
        const lines: { text: string; x: number; isLast: boolean }[] = [];
        if (first) lines.push({ text: first, x: marginLeft + (indent ? 12.5 : 0), isLast: false });
        if (restText) {
          const restLines = pdf.splitTextToSize(text.substring(first.length).trimStart(), maxW) as string[];
          restLines.forEach((ln, i) => lines.push({ text: ln, x: marginLeft, isLast: i === restLines.length - 1 }));
        }
        if (lines.length) lines[lines.length - 1].isLast = true;

        lines.forEach((ln) => {
          ensureSpace(lh);
          if (align === "center") {
            pdf.text(ln.text, pageW / 2, y, { align: "center" });
          } else if (align === "justify" && !ln.isLast && ln.text.trim().split(/\s+/).length > 1) {
            const words = ln.text.trim().split(/\s+/);
            const totalTextW = pdf.getTextWidth(words.join(""));
            const availableW = (ln.x === marginLeft ? maxW : maxW - 12.5);
            const spaceW = (availableW - totalTextW) / (words.length - 1);
            let cx = ln.x;
            words.forEach((w, i) => {
              pdf.text(w, cx, y);
              cx += pdf.getTextWidth(w) + spaceW;
            });
          } else {
            pdf.text(ln.text, ln.x, y);
          }
          y += lh;
        });
        y += opts?.gap ?? 3;
      };

      addParagraph("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", { bold: true, size: 14, align: "center", gap: 2, indent: false });
      addParagraph("Plataforma Agendamento de Ambiente Escolar", { bold: true, size: 12, align: "center", gap: 8, indent: false });

      const schoolName = foundSchool?.name || "—";
      const gestorNome = contractSignerName;
      const cnpj = formData.cnpj || "—";
      const cpf = (contractSignerCpf ? maskCPF(contractSignerCpf) : formData.gestorCpf) || "—";
      const inep = foundSchool?.inep_code || "—";
      const schoolEndereco = [formData.address, formData.number, formData.neighborhood, foundSchool?.city, foundSchool?.state].filter(Boolean).join(", ") || "—";
      const schoolEmail = formData.email || "—";
      const schoolTel = formData.contact || "—";
      const empresaNome = companyData?.razao_social || "—";
      const empresaCnpj = companyData?.cnpj || "—";
      const empresaEndereco = [companyData?.address, companyData?.city, companyData?.state].filter(Boolean).join(", ") || "—";
      const empresaRep = companyData?.representative_name || "—";
      const empresaRepCpf = companyData?.representative_cpf || "—";
      const empresaCidade = companyData?.city || "—";

      addParagraph("CONTRATANTE (Prestadora):", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph(`${empresaNome}, inscrita no CNPJ sob o nº ${empresaCnpj}, com sede em ${empresaEndereco}, neste ato representada por ${empresaRep}, CPF ${empresaRepCpf}.`, { gap: 4 });

      addParagraph("CONTRATADA (Escola):", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph(`${schoolName}, INEP nº ${inep}, CNPJ ${cnpj}, localizada em ${schoolEndereco}, e-mail: ${schoolEmail}, telefone: ${schoolTel}, neste ato representada por seu(sua) gestor(a) ${gestorNome}, CPF ${cpf}.`, { gap: 6 });

      addParagraph("CLÁUSULA 1ª — DO OBJETO", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("Prestação de serviços mediante licença de uso da plataforma digital Agendamento de Ambiente Escolar, destinada à gestão, organização e controle de reservas de ambientes, recursos e espaços institucionais.");

      addParagraph("CLÁUSULA 2ª — DA LICENÇA DE USO", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("A CONTRATANTE concede à CONTRATADA licença limitada, não exclusiva, intransferível e revogável para utilização da plataforma durante a vigência contratual.");

      addParagraph("CLÁUSULA 3ª — DA VIGÊNCIA E FIDELIDADE", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("O presente contrato terá vigência de 12 (doze) meses, contados da confirmação do pagamento da assinatura, renovando-se automaticamente por iguais períodos, salvo manifestação contrária de qualquer das partes com antecedência mínima de 30 (trinta) dias. Fica estabelecido período mínimo de fidelidade de 24 (vinte e quatro) meses; em caso de cancelamento antes desse prazo, será devida multa rescisória proporcional aos meses restantes da fidelidade.");

      addParagraph("CLÁUSULA 4ª — DOS VALORES E PAGAMENTOS", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("Os valores dos planos serão aqueles selecionados pela CONTRATADA no momento da contratação, sendo o valor mensal de referência R$ 199,90 (cento e noventa e nove reais e noventa centavos), podendo o pagamento ser realizado por PIX, boleto bancário, cartão de crédito ou outros meios disponibilizados pela plataforma.");

      addParagraph("CLÁUSULA 5ª — DO REAJUSTE", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("Os valores poderão ser reajustados anualmente pelo IPCA ou outro índice oficial que venha a substituí-lo.");

      addParagraph("CLÁUSULA 6ª — DAS OBRIGAÇÕES DA CONTRATANTE", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("a) Disponibilizar o acesso à plataforma; b) Realizar manutenção corretiva e evolutiva do sistema; c) Prestar suporte técnico pelos canais disponibilizados; d) Adotar medidas razoáveis de proteção e segurança dos dados.");

      addParagraph("CLÁUSULA 7ª — DAS OBRIGAÇÕES DA CONTRATADA", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("a) Efetuar os pagamentos nas datas acordadas; b) Utilizar a plataforma de forma lícita e compatível com sua finalidade; c) Manter sob sigilo suas credenciais de acesso; d) Fornecer informações verdadeiras e atualizadas.");

      addParagraph("CLÁUSULA 8ª — DA INADIMPLÊNCIA", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("Em caso de atraso no pagamento: 30 dias — suspensão temporária do acesso; 60 dias — inclusão nos órgãos de proteção ao crédito; 90 dias — protesto do débito e cobrança administrativa ou judicial. Incidirão ainda multa de 2%, juros de 1% ao mês, correção monetária e honorários advocatícios quando aplicáveis.");

      addParagraph("CLÁUSULA 9ª — DA RESCISÃO", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("O contrato poderá ser rescindido por qualquer das partes mediante comunicação formal com antecedência mínima de 30 (trinta) dias. Em caso de cancelamento antes do término da vigência contratual ou da fidelidade mínima, será aplicada a multa rescisória prevista na Cláusula 3ª.");

      addParagraph("CLÁUSULA 10ª — DA PROPRIEDADE INTELECTUAL", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("Todo o conteúdo, estrutura, banco de dados, código-fonte, funcionalidades, logotipos, marcas e demais elementos da plataforma são de propriedade exclusiva da CONTRATANTE. É proibido copiar, reproduzir, comercializar, distribuir, modificar, realizar engenharia reversa ou tentar acessar o código-fonte da plataforma.");

      addParagraph("CLÁUSULA 11ª — DA DISPONIBILIDADE DO SERVIÇO", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("A CONTRATANTE envidará esforços para manter a plataforma disponível continuamente, não garantindo, contudo, funcionamento ininterrupto em razão de manutenções, atualizações, falhas de internet, problemas de infraestrutura ou eventos de força maior.");

      addParagraph("CLÁUSULA 12ª — DA LIMITAÇÃO DE RESPONSABILIDADE", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("A CONTRATANTE não será responsável por falhas de internet, equipamentos defeituosos, indisponibilidades causadas por terceiros, informações inseridas pelos usuários ou utilização inadequada da plataforma.");

      addParagraph("CLÁUSULA 13ª — DA PROTEÇÃO DE DADOS (LGPD)", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("As partes comprometem-se a observar as disposições da Lei Geral de Proteção de Dados Pessoais. Os dados coletados serão utilizados exclusivamente para execução dos serviços contratados, autenticação, controle de acesso, geração de relatórios, suporte técnico e cumprimento de obrigações legais.");

      addParagraph("CLÁUSULA 14ª — DOS REGISTROS ELETRÔNICOS", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("A CONTRATADA autoriza a coleta e armazenamento de registros eletrônicos relacionados à utilização da plataforma, incluindo nome do usuário, e-mail, telefone, instituição, CNPJ, endereço IP, data e hora de acesso, navegador utilizado, dispositivo utilizado, logs de utilização e versão do contrato aceita. Tais registros poderão ser utilizados como prova da contratação e utilização da plataforma.");

      addParagraph("CLÁUSULA 15ª — DO ACEITE ELETRÔNICO", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("A contratação será realizada integralmente por meio eletrônico. A marcação da opção \"Li e concordo com os termos deste contrato\" e o acionamento do botão \"ACEITAR CONTRATO E ATIVAR ASSINATURA\" constituem manifestação livre, expressa e inequívoca da vontade da CONTRATADA, produzindo os mesmos efeitos jurídicos de uma assinatura física ou digital. O aceite eletrônico vincula a instituição contratante a todas as cláusulas deste contrato.");

      addParagraph("CLÁUSULA 16ª — DA RESPONSABILIDADE EXCLUSIVA DA PESSOA JURÍDICA", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("O Gestor, ao aceitar eletronicamente este contrato em nome da instituição, exerce seu papel de representante temporário da escola, não assumindo qualquer responsabilidade pessoal por obrigações financeiras, inadimplência ou penalidades decorrentes da contratação. Em caso de descumprimento das obrigações financeiras, a responsabilidade será exclusivamente da escola, pessoa jurídica titular do contrato, identificada por seu CNPJ, ficando o Gestor isento de quaisquer sanções, multas, cobranças, restrições cadastrais ou medidas administrativas promovidas pela CONTRATANTE.");

      addParagraph("CLÁUSULA 17ª — DO FORO", { bold: true, size: 12, gap: 1, indent: false });
      addParagraph("Fica eleito o foro da comarca de Boa Vista para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro foro, por mais privilegiado que seja.");

      const hoje = new Date().toLocaleDateString("pt-BR");
      y += 8;
      addParagraph(`${empresaCidade}, ${hoje}.`, { align: "center", gap: 16, indent: false });
      addParagraph("____________________________________________", { align: "center", gap: 1, indent: false });
      addParagraph(`CONTRATANTE — ${empresaNome}`, { align: "center", gap: 12, indent: false });
      addParagraph("____________________________________________", { align: "center", gap: 1, indent: false });
      addParagraph(`CONTRATADA — ${schoolName}`, { align: "center", indent: false });

      const fname = (schoolName || "escola").replace(/\s+/g, "_").substring(0, 30);
      pdf.save(`contrato_agendamento_escolar_${fname}.pdf`);
      toast.success("Contrato baixado com sucesso!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao gerar o PDF do contrato.";
      toast.error(`Erro ao gerar PDF: ${message}`);
    }
  };

  const handleDownloadContract = async () => {
    if (!contractRef.current) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const canvas = await html2canvas(contractRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;
      let position = 0;

      while (position < scaledHeight) {
        if (position > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -position, pdfWidth, scaledHeight);
        position += pdfHeight;
      }

      const schoolName = (foundSchool?.name || "escola").replace(/\s+/g, "_").substring(0, 30);
      pdf.save(`contrato_agendamento_escolar_${schoolName}.pdf`);
      pdfDownloadedRef.current = true;
      try {
        localStorage.setItem(pdfDownloadedStorageKey, "1");
      } catch {
        // ignora erro de storage (ex.: modo privado)
      }
      toast.success("Contrato baixado com sucesso!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao gerar o PDF do contrato.";
      setPdfError(message);
      toast.error("Erro ao gerar PDF. Tente novamente.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSignedFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Envie um arquivo PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    setSignedFile(file);
    setSignedUploaded(null);
  };

  const handleUploadSignedContract = async () => {
    if (!signedFile) {
      toast.error("Selecione o PDF assinado.");
      return;
    }
    const schoolId = profile?.school_id ?? foundSchool?.id ?? null;
    if (!schoolId || !user?.id) {
      toast.error("Sessão inválida. Faça login novamente.");
      return;
    }
    setUploadingSigned(true);
    try {
      // Inconsistência: cada escola só pode ter UM contrato assinado de gestor.
      const { data: existingGestor, error: chkErr } = await supabase
        .from("signed_contracts")
        .select("id, uploaded_by, file_path")
        .eq("school_id", schoolId)
        .eq("signer_role", "gestor")
        .not("file_path", "like", "__request__/%")
        .limit(1);
      if (chkErr) throw chkErr;
      if (existingGestor && existingGestor.length > 0) {
        const sameUser = existingGestor[0].uploaded_by === user.id;
        toast.error(
          sameUser
            ? "Esta escola já possui um contrato assinado por você. Use a opção de substituir."
            : "Inconsistência: esta escola já possui um contrato assinado por outro usuário. Apenas um contrato por escola é permitido."
        );
        setUploadingSigned(false);
        return;
      }

      const ts = Date.now();
      const safeName = signedFile.name.replace(/[^\w.\-]+/g, "_").slice(-60);
      const path = `${schoolId}/${user.id}/${ts}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("signed-contracts")
        .upload(path, signedFile, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("signed_contracts").insert({
        school_id: schoolId,
        uploaded_by: user.id,
        file_name: signedFile.name,
        file_path: path,
        file_size: signedFile.size,
        gestor_cpf: formData.gestorCpf || null,
        signer_role: "gestor",
        status: "awaiting_admin",
      });
      if (insErr) {
        // Limpeza best-effort se houve corrida com unique index
        await supabase.storage.from("signed-contracts").remove([path]).catch(() => {});
        if ((insErr as { code?: string }).code === "23505") {
          toast.error("Inconsistência: esta escola já possui um contrato assinado. Apenas um contrato por escola é permitido.");
          setUploadingSigned(false);
          return;
        }
        throw insErr;
      }

      setSignedUploaded({ path, name: signedFile.name, status: "awaiting_admin" });
      toast.success("Contrato assinado anexado com sucesso!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no upload.";
      toast.error(`Erro ao anexar: ${msg}`);
    } finally {
      setUploadingSigned(false);
    }
  };

  const handleReplaceSignedContract = async () => {
    if (!signedUploaded) return;
    setUploadingSigned(true);
    try {
      // Remove arquivo antigo do storage (best-effort)
      const { error: rmErr } = await supabase.storage
        .from("signed-contracts")
        .remove([signedUploaded.path]);
      if (rmErr) {
        // Não bloqueia: registro continua, apenas avisa.
        console.warn("Falha ao remover arquivo antigo:", rmErr.message);
      }
      // Remove registro antigo da tabela (apenas o do gestor)
      const { error: delErr } = await supabase
        .from("signed_contracts")
        .delete()
        .eq("file_path", signedUploaded.path)
        .eq("signer_role", "gestor");
      if (delErr) {
        toast.error(`Não foi possível remover o registro anterior: ${delErr.message}`);
        return;
      }
      setSignedUploaded(null);
      setSignedFile(null);
      if (signedInputRef.current) signedInputRef.current.value = "";
      toast.success("Anexo removido. Selecione o novo PDF.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao trocar anexo.";
      toast.error(msg);
    } finally {
      setUploadingSigned(false);
    }
  };

  const handleCepLookup = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData((prev) => ({
          ...prev,
          address: data.logradouro || "",
          neighborhood: data.bairro || "",
          city: data.localidade || "",
          state: data.uf || "",
        }));
      } else {
        toast.error("CEP não encontrado");
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const handleSelectPlan = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmContinue = () => {
    setShowConfirmDialog(false);
    setStep("network-select");
  };

  const handleSearchInep = async () => {
    // Particular sem INEP digitado → pula direto, com limpeza de estado consistente
    if (selectedNetwork === "particular" && inepCode.length === 0) {
      handleSkipInepParticular();
      return;
    }
    if (inepCode.length < 8) {
      toast.error("O código INEP deve ter 8 dígitos");
      return;
    }
    setSearchingSchool(true);
    setSchoolNotFound(false);
    setFoundSchool(null);

    const { data: results, error } = await supabase.rpc("find_school_by_inep", {
      _inep_code: inepCode.trim(),
      _network: selectedNetwork || null,
    });

    setSearchingSchool(false);

    if (error) {
      toast.error("Erro ao buscar escola. Tente novamente.");
      return;
    }

    const data = results && results.length > 0 ? results[0] : null;
    if (data) {
      setFoundSchool(data);
    } else {
      setSchoolNotFound(true);
    }
  };

  // Permite que escolas particulares pulem o INEP e sigam direto para o cadastro.
  // Garante limpeza completa do estado para evitar resgatar dados de buscas anteriores.
  const handleSkipInepParticular = () => {
    // Validação 1: rede deve ser "particular"
    if (selectedNetwork !== "particular") {
      toast.error("Esta opção é exclusiva para escolas particulares.");
      return;
    }
    // Validação 2: não pode estar em meio a uma busca
    if (searchingSchool) {
      toast.error("Aguarde a busca em andamento finalizar.");
      return;
    }

    // Limpa qualquer estado vinculado ao INEP / escola pública
    setInepCode("");
    setFoundSchool(null);
    setSchoolNotFound(false);

    // Pré-preenche apenas o email do usuário; demais campos partem em branco
    setFormData((prev) => ({
      ...prev,
      email: user?.email || "",
    }));

    setStep("school-data");
  };

  const handleSchoolDataSubmit = () => {
    const { cnpj, gestorCpf, cep, address, contact, email } = formData;
    if (!cnpj || !gestorCpf || !cep || !address || !contact || !email) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (!isValidCPF(gestorCpf)) {
      toast.error("CPF do gestor inválido. Verifique e tente novamente.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Informe um email válido");
      return;
    }
    setStep("contract-view");
    loadCompanyData();
    // Cria marcador de "solicitação pendente" para o admin saber que esta escola
    // entrou no fluxo de contrato e precisa ser assinada por ele primeiro.
    void (async () => {
      try {
        const schoolId = profile?.school_id ?? foundSchool?.id ?? null;
        if (!schoolId || !user?.id) return;
        const { data: existing } = await supabase
          .from("signed_contracts")
          .select("id")
          .eq("school_id", schoolId)
          .limit(1);
        if (existing && existing.length > 0) return;
        await supabase.from("signed_contracts").insert({
          school_id: schoolId,
          uploaded_by: user.id,
          file_name: "__request__",
          file_path: `__request__/${schoolId}`,
          file_size: 0,
          gestor_cpf: formData.gestorCpf || null,
          signer_role: "gestor",
          status: "awaiting_admin",
        });
      } catch (e) {
        console.warn("Falha ao criar solicitação de contrato:", e);
      }
    })();
  };

  const handleAcceptContract = async () => {
    if (!contractAccepted) {
      toast.error("Marque \"Li e concordo com os termos deste contrato\".");
      return;
    }
    const typedName = (acceptedFullName || "").trim();
    if (typedName.length < 5 || !typedName.includes(" ")) {
      toast.error("Digite seu NOME COMPLETO (nome e sobrenome) como assinatura.");
      return;
    }
    const schoolId = profile?.school_id ?? foundSchool?.id ?? null;
    if (!schoolId || !user?.id) {
      toast.error("Sessão inválida. Faça login novamente.");
      return;
    }
    setUploadingSigned(true);
    try {
      const { CURRENT_CONTRACT_VERSION } = await import("@/lib/contractVersion");
      const QRCode = (await import("qrcode")).default;
      // Captura IP, user-agent e geolocalização (best-effort)
      let ip = "";
      try {
        const r = await fetch("https://api.ipify.org?format=json");
        const j = await r.json();
        ip = j?.ip || "";
      } catch { /* ignore */ }
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
      let geoLat: number | null = null, geoLng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            () => resolve(null),
            { timeout: 4000, maximumAge: 60000 }
          );
        });
        if (pos) { geoLat = +pos.coords.latitude.toFixed(5); geoLng = +pos.coords.longitude.toFixed(5); }
      } catch {}

      // Gera PDF do contrato (mesma rotina do download) e adiciona bloco de aceite no final
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ml = 30, mr = 20, mt = 30, mb = 20;
      const maxW = pageW - ml - mr;
      let y = mt;
      const ensureSpace = (h: number) => { if (y + h > pageH - mb) { pdf.addPage(); y = mt; } };
      const para = (t: string, b = false, c = false, size = 12, gap = 3, indent = !c) => {
        pdf.setFont("times", b ? "bold" : "normal");
        pdf.setFontSize(size);
        const lh = size * 0.3528 * 1.5;
        const lines = pdf.splitTextToSize(t, indent ? maxW - 12.5 : maxW) as string[];
        lines.forEach((ln, i) => {
          ensureSpace(lh);
          if (c) pdf.text(ln, pageW / 2, y, { align: "center" });
          else pdf.text(ln, ml + (i === 0 && indent ? 12.5 : 0), y);
          y += lh;
        });
        y += gap;
      };
      para("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", true, true, 14, 2);
      para("Plataforma Agendamento de Ambiente Escolar", true, true, 12, 8);
      const emp = companyData?.razao_social || "—";
      para("CONTRATANTE (Prestadora):", true, false, 12, 1);
      para(`${emp}, CNPJ ${companyData?.cnpj || "—"}, ${[companyData?.address, companyData?.city, companyData?.state].filter(Boolean).join(", ") || "—"}, representada por ${companyData?.representative_name || "—"}.`, false, false, 12, 4);
      para("CONTRATADA (Escola):", true, false, 12, 1);
      para(`${foundSchool?.name || "—"}, INEP ${foundSchool?.inep_code || "—"}, CNPJ ${formData.cnpj || "—"}, ${[formData.address, formData.number, formData.neighborhood, foundSchool?.city, foundSchool?.state].filter(Boolean).join(", ") || "—"}, e-mail ${formData.email || "—"}, telefone ${formData.contact || "—"}, representada por ${typedName}, CPF ${(contractSignerCpf ? maskCPF(contractSignerCpf) : formData.gestorCpf) || "—"}.`, false, false, 12, 6);

      const clauses: [string, string][] = [
        ["CLÁUSULA 1ª — DO OBJETO", "Prestação de serviços mediante licença de uso da plataforma digital Agendamento de Ambiente Escolar."],
        ["CLÁUSULA 2ª — DA LICENÇA DE USO", "Licença limitada, não exclusiva, intransferível e revogável durante a vigência."],
        ["CLÁUSULA 3ª — DA VIGÊNCIA E FIDELIDADE", "12 (doze) meses, renovável automaticamente. Fidelidade mínima de 24 meses; cancelamento antes desse prazo implica multa proporcional."],
        ["CLÁUSULA 4ª — DOS VALORES E PAGAMENTOS", "Valor mensal de referência R$ 199,90. Pagamento via PIX, boleto ou cartão."],
        ["CLÁUSULA 5ª — DO REAJUSTE", "Reajuste anual pelo IPCA ou índice oficial substituto."],
        ["CLÁUSULA 6ª — DAS OBRIGAÇÕES DA CONTRATANTE", "a) Disponibilizar acesso; b) Manutenção; c) Suporte; d) Proteção dos dados."],
        ["CLÁUSULA 7ª — DAS OBRIGAÇÕES DA CONTRATADA", "a) Pagamento em dia; b) Uso lícito; c) Sigilo das credenciais; d) Informações verdadeiras."],
        ["CLÁUSULA 8ª — DA INADIMPLÊNCIA", "30/60/90 dias → suspensão, SPC/SERASA, protesto. Multa 2%, juros 1% a.m., honorários quando aplicáveis."],
        ["CLÁUSULA 9ª — DA RESCISÃO", "Aviso prévio de 30 dias. Cancelamento antes da fidelidade gera multa proporcional."],
        ["CLÁUSULA 10ª — DA PROPRIEDADE INTELECTUAL", "Todo o conteúdo da plataforma é da CONTRATANTE. Proibida cópia, engenharia reversa ou redistribuição."],
        ["CLÁUSULA 11ª — DA DISPONIBILIDADE", "Não há garantia de funcionamento ininterrupto."],
        ["CLÁUSULA 12ª — DA LIMITAÇÃO DE RESPONSABILIDADE", "CONTRATANTE não responde por falhas de internet/equipamentos/terceiros."],
        ["CLÁUSULA 13ª — DA LGPD", "Observância da Lei 13.709/2018."],
        ["CLÁUSULA 14ª — DOS REGISTROS ELETRÔNICOS", "Coleta e armazenamento de IP, data/hora, navegador, dispositivo, versão aceita — prova da contratação."],
        ["CLÁUSULA 15ª — DO ACEITE ELETRÔNICO", "Marcação do checkbox e clique em ACEITAR CONTRATO E ATIVAR ASSINATURA equivalem à assinatura física/digital."],
        ["CLÁUSULA 16ª — RESPONSABILIDADE EXCLUSIVA DA PESSOA JURÍDICA", "Gestor isento; responsabilidade é exclusivamente da escola (CNPJ)."],
        ["CLÁUSULA 17ª — DO FORO", "Comarca de Boa Vista/RR."],
      ];
      clauses.forEach(([t, b]) => { para(t, true, false, 12, 1); para(b); });

      // Bloco de aceite eletrônico
      ensureSpace(40);
      y += 6;
      para("TERMO DE ACEITE ELETRÔNICO", true, true, 13, 4);
      const now = new Date();
      const dtManaus = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", dateStyle: "full", timeStyle: "long" }).format(now);
      para(`Aceite registrado por: ${typedName}, CPF ${formData.gestorCpf || "—"}`, false, false, 11, 1);
      para(`E-mail: ${user?.email || formData.email || "—"}`, false, false, 11, 1);
      para(`Instituição: ${foundSchool?.name || "—"} — CNPJ ${formData.cnpj || "—"} — INEP ${foundSchool?.inep_code || "—"}`, false, false, 11, 1);
      para(`Data/hora (Manaus): ${dtManaus}`, false, false, 11, 1);
      para(`Data/hora (UTC): ${now.toISOString()}`, false, false, 11, 1);
      para(`Endereço IP: ${ip || "não capturado"}`, false, false, 11, 1);
      if (geoLat != null && geoLng != null) para(`Geolocalização (aprox.): ${geoLat}, ${geoLng}`, false, false, 11, 1);
      para(`Navegador/Dispositivo: ${userAgent.slice(0, 200)}`, false, false, 11, 1);
      para(`Versão do contrato: ${CURRENT_CONTRACT_VERSION}`, false, false, 11, 4);
      para("Ao aceitar este contrato, a CONTRATADA declara que leu, compreendeu e concorda integralmente com todas as cláusulas acima, reconhecendo sua plena validade jurídica nos termos do art. 10, §2º da MP 2.200-2/2001, da Lei 14.063/2020 e do Código Civil brasileiro.", false, false, 11, 8);

      // === BLOCO DE ASSINATURAS ===
      ensureSpace(70);
      y += 6;
      para("ASSINATURAS DAS PARTES", true, true, 13, 6);
      const colW = (maxW - 10) / 2;
      const sigY = y;
      // CONTRATANTE (admin)
      pdf.setDrawColor(0);
      if (adminSignatureDataUrl) {
        try { pdf.addImage(adminSignatureDataUrl, "PNG", ml, sigY, colW, 22); } catch {}
      }
      pdf.line(ml, sigY + 24, ml + colW, sigY + 24);
      pdf.setFont("times", "bold"); pdf.setFontSize(10);
      pdf.text("CONTRATANTE", ml + colW / 2, sigY + 28, { align: "center" });
      pdf.setFont("times", "normal");
      pdf.text(emp, ml + colW / 2, sigY + 32, { align: "center" });
      pdf.text(`CNPJ ${companyData?.cnpj || "—"}`, ml + colW / 2, sigY + 36, { align: "center" });
      // CONTRATADA (gestor — nome digitado em fonte cursiva simulada)
      const x2 = ml + colW + 10;
      pdf.setFont("times", "italic"); pdf.setFontSize(16);
      pdf.text(typedName, x2 + colW / 2, sigY + 20, { align: "center" });
      pdf.setFont("times", "normal"); pdf.setFontSize(10);
      pdf.line(x2, sigY + 24, x2 + colW, sigY + 24);
      pdf.setFont("times", "bold");
      pdf.text("CONTRATADA", x2 + colW / 2, sigY + 28, { align: "center" });
      pdf.setFont("times", "normal");
      pdf.text(typedName, x2 + colW / 2, sigY + 32, { align: "center" });
      pdf.text(`CPF ${formData.gestorCpf || "—"}`, x2 + colW / 2, sigY + 36, { align: "center" });
      y = sigY + 44;

      // Hash do documento (calcula sobre o conteúdo até aqui)
      const partialBuf = pdf.output("arraybuffer") as ArrayBuffer;
      const hashBuf = await crypto.subtle.digest("SHA-256", partialBuf);
      const docHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

      // QR Code com URL pública de verificação (token será injetado depois)
      const verificationToken = crypto.randomUUID();
      const verifyUrl = `${window.location.origin}/verificar/${verificationToken}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 0 });
      ensureSpace(40);
      y += 4;
      pdf.addImage(qrDataUrl, "PNG", ml, y, 28, 28);
      pdf.setFont("times", "normal"); pdf.setFontSize(9);
      pdf.text("Escaneie o QR ou acesse:", ml + 32, y + 6);
      pdf.setFont("times", "bold");
      pdf.text(verifyUrl, ml + 32, y + 11);
      pdf.setFont("times", "normal");
      pdf.text(`Hash SHA-256: ${docHash.slice(0, 32)}…${docHash.slice(-16)}`, ml + 32, y + 17);
      pdf.text("Validade jurídica: Lei 14.063/2020 (assinatura eletrônica simples)", ml + 32, y + 23);
      y += 32;

      const buffer = pdf.output("arraybuffer") as ArrayBuffer;
      const ts = Date.now();
      const fileName = `aceite_${ts}.pdf`;
      const path = `${schoolId}/${user.id}/${ts}-aceite.pdf`;
      const isReacceptance = new URLSearchParams(window.location.search).get("reaceite") === "1";

      const { error: upErr } = await supabase.storage
        .from("signed-contracts")
        .upload(path, new Blob([buffer], { type: "application/pdf" }), {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: rpcData, error: rpcErr } = await supabase.rpc("accept_contract_electronically", {
        _school_id: schoolId,
        _file_name: fileName,
        _file_path: path,
        _file_size: buffer.byteLength,
        _gestor_cpf: formData.gestorCpf || null,
        _accepted_ip: ip || null,
        _accepted_user_agent: userAgent,
        _contract_version: CURRENT_CONTRACT_VERSION,
        _reacceptance: isReacceptance,
        _accepted_full_name: typedName,
        _accepted_geo_lat: geoLat,
        _accepted_geo_lng: geoLng,
        _document_hash: docHash,
        _verification_token: verificationToken,
      } as any);
      if (rpcErr) {
        await supabase.storage.from("signed-contracts").remove([path]).catch(() => {});
        throw rpcErr;
      }
      const realToken = Array.isArray(rpcData) ? (rpcData[0] as any)?.verification_token : (rpcData as any)?.verification_token;
      if (realToken && realToken !== verificationToken) {
        console.warn("[contract] token from RPC differs from PDF token; PDF QR will resolve via RPC.", { pdf: verificationToken, rpc: realToken });
      }

      toast.success(isReacceptance ? "Novo contrato aceito!" : "Contrato aceito eletronicamente!");
      if (isReacceptance) {
        navigate("/gestor");
        return;
      }
      if (!selectedPlan) {
        const defaultPlan = PLANS.find((p) => p.highlight) ?? PLANS[0];
        setSelectedPlan(defaultPlan.name);
      }
      setStep("payment");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao registrar aceite.";
      toast.error(msg);
    } finally {
      setUploadingSigned(false);
    }
  };

  // Auto-geração do PDF foi removida: agora a minuta é baixada manualmente
  // pelo gestor (Passo 1) e a versão final assinada é trocada com a contraparte.

  // Gera signed URL para preview do PDF assinado anexado.
  useEffect(() => {
    let cancelled = false;
    if (!signedUploaded) {
      setSignedPreviewUrl(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from("signed-contracts")
        .createSignedUrl(signedUploaded.path, 60 * 30); // 30 min
      if (cancelled) return;
      if (error) {
        setSignedPreviewUrl(null);
        return;
      }
      setSignedPreviewUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedUploaded]);

  // Etapa de contrato desativada — efeito removido. Reativável via palavra-chave
  // "Retorne ao modelo de contrato implantado".

  // Gera signed URL para o PDF anexado pelo administrador da plataforma.
  useEffect(() => {
    let cancelled = false;
    if (!adminUploaded) {
      setAdminPreviewUrl(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from("signed-contracts")
        .createSignedUrl(adminUploaded.path, 60 * 30);
      if (cancelled) return;
      if (error) {
        setAdminPreviewUrl(null);
        return;
      }
      setAdminPreviewUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [adminUploaded]);

  const handleDownloadAdminSigned = async () => {
    if (!adminPreviewUrl) return;
    const a = document.createElement("a");
    a.href = adminPreviewUrl;
    a.download = adminUploaded?.name || "contrato-assinado-contraparte.pdf";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Carrega registros de contrato + realtime quando entra no step "contract"
  const adminUploadedRef = useRef(false);
  useEffect(() => {
    if (step !== "contract-view" && step !== "contract-upload" && step !== "contract-review") return;
    const schoolId = profile?.school_id ?? foundSchool?.id;
    if (!schoolId) return;

    const fetchContracts = async () => {
      const { data } = await supabase
        .from("signed_contracts")
        .select("*")
        .eq("school_id", schoolId)
        .order("uploaded_at", { ascending: false });
      const rows = ((data || []) as any[]).filter((r) => r.file_name !== "__request__");
      const adminRow = rows.find((r) => r.signer_role === "admin");
      const gestorRow = rows.find((r) => r.signer_role === "gestor");
      if (adminRow) {
        const wasEmpty = !adminUploadedRef.current;
        setAdminUploaded({ path: adminRow.file_path, name: adminRow.file_name, uploaded_at: adminRow.uploaded_at });
        adminUploadedRef.current = true;
        if (wasEmpty) toast.success("Administrador assinou o contrato!");
      } else {
        setAdminUploaded(null);
        adminUploadedRef.current = false;
      }
      if (gestorRow) {
        setSignedUploaded({ path: gestorRow.file_path, name: gestorRow.file_name, uploaded_at: gestorRow.uploaded_at, status: gestorRow.status });
      }
    };
    fetchContracts();
    const channel = supabase
      .channel(`gestor-contract-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "signed_contracts", filter: `school_id=eq.${schoolId}` }, fetchContracts)
      .subscribe();
    const interval = window.setInterval(() => {
      if (!adminUploadedRef.current) fetchContracts();
    }, 8000);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [step, profile?.school_id, foundSchool?.id]);


  const handlePayment = async () => {
    if (!selectedPlan) {
      setShowPlanError(true);
      toast.error("Selecione um plano antes de continuar");
      return;
    }

    if (!paymentMethod) {
      toast.error("Selecione uma forma de pagamento");
      return;
    }

    // Garante que o plano selecionado existe no array PLANS
    const planExists = PLANS.some(p => p.name === selectedPlan);
    if (!planExists) {
      toast.error("O plano selecionado é inválido. Selecione um plano da lista.");
      setSelectedPlan(null);
      return;
    }

    const schoolId = profile?.school_id ?? foundSchool?.id ?? null;
    if (!schoolId) {
      toast.error("Escola não identificada");
      return;
    }

    if (paymentMethod === "pix") {
      generatePix();
      setPaymentDetailOpen(true);
    } else if (paymentMethod === "card") {
      setShowCardForm(true);
      setPaymentDetailOpen(true);
    } else {
      setPaymentDetailOpen(true);
    }
  };

  const generatePix = async (force = false) => {
    // Validação extra: bloqueia geração do QR sem plano selecionado
    if (!selectedPlan || !selectedPlanId || !PLANS.some(p => p.id === selectedPlanId)) {
      console.warn("[generatePix] Bloqueado: nenhum plano selecionado.", { selectedPlan, selectedPlanId });
      setPlanMissingError(true);
      toast.error("Selecione um plano antes de gerar o PIX.");
      return;
    }

    const schoolId = profile?.school_id ?? foundSchool?.id ?? null;
    if (!schoolId) {
      toast.error("Escola não identificada.");
      return;
    }

    if (!force && pixData) return;

    setPixLoading(true);
    if (force) {
      setPixForceRegenerate(true);
      // Limpa o QR atual para forçar a UI a entrar em estado de loading e
      // garantir que a nova chave PIX (recém-cadastrada no Mercado Pago)
      // seja refletida no próximo QR Code gerado.
      setPixData(null);
      // Cancela pagamentos PIX pendentes anteriores desta escola para que
      // o cache em banco não seja reaproveitado pelo efeito de carga.
      try {
        await supabase
          .from("pagamentos")
          .update({ status: "cancelled" })
          .eq("school_id", schoolId)
          .eq("metodo", "pix")
          .eq("status", "pending");
      } catch (cancelErr) {
        console.warn("Não foi possível cancelar PIX pendentes anteriores:", cancelErr);
      }
    }
    
    try {
      if (!selectedPlanId) {
        toast.error("Selecione um plano válido para gerar o pagamento.");
        return;
      }
      
      const planNormalized = selectedPlanId;
      if (!PLANS.some(p => p.id === planNormalized)) {
        toast.error("Plano selecionado não é suportado pelo sistema de pagamento.");
        return;
      }

      const { criarPagamentoMP } = await import("@/lib/mercadoPago");
      const res = await criarPagamentoMP({
        plano: planNormalized as any,
        metodo: "pix",


        payer: {
          email: formData.email || user?.email || "",
          first_name: profile?.full_name?.split(" ")[0] || "Gestor",
          // Só envia identification se houver um número válido
          ...(formData.gestorCpf.replace(/\D/g, "") ? {
            identification: {
              type: "CPF",
              number: formData.gestorCpf.replace(/\D/g, ""),
            }
          } : {}),
        },
      });

      if ("qr_code" in res) {
        setPixData({
          pagamento_id: res.pagamento_id,
          qr_code: res.qr_code,
          qr_code_base64: res.qr_code_base64,
          payment_id: res.mp_payment_id,
          status: res.status || "pending",
          expires_at: res.expires_at,
        });
        toast.success("PIX gerado com sucesso!");
        // Inicia o polling automático para validar o pagamento
        if (res.mp_payment_id) {
          startPolling(String(res.mp_payment_id));
        } else {
          console.error("PIX gerado mas mp_payment_id ausente na resposta", res);
        }
      } else {
        throw new Error("Resposta do PIX não contém QR Code");
      }
    } catch (err) {
      console.error("Erro ao gerar PIX:", err);
      toast.error("Falha ao gerar PIX. Verifique os dados ou use o WhatsApp.");
    } finally {
      setPixLoading(false);
      setPixForceRegenerate(false);
    }
  };

  const handleCopyPix = () => {
    if (!pixData?.qr_code) return;
    
    // Tenta usar a API moderna primeiro
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(pixData.qr_code)
        .then(() => toast.success("Código PIX copiado com sucesso!"))
        .catch(() => fallbackCopyText(pixData.qr_code!));
    } else {
      fallbackCopyText(pixData.qr_code);
    }
  };

  const fallbackCopyText = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      // Impede rolagem indesejada em dispositivos móveis
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        toast.success("Código PIX copiado!");
      } else {
        throw new Error("Copy failed");
      }
    } catch (err) {
      console.error("Erro ao copiar PIX:", err);
      toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  };

  const handleDownloadQrCode = () => {
    if (!pixData?.qr_code_base64) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${pixData.qr_code_base64}`;
    link.download = `pix-agendamento-escolar-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR Code baixado!");
  };

  const handleConfirmPix = async () => {
    if (!pixData?.payment_id || confirmingPix) return;
    
    setConfirmingPix(true);
    try {
      const { confirmarPagamentoMP } = await import("@/lib/mercadoPago");
      const idForConfirmation = pixData.pagamento_id || String(pixData.payment_id);
      const res = await confirmarPagamentoMP(idForConfirmation);
      
      if (res.approved) {
        toast.success("Pagamento confirmado com sucesso!");
        setPixData(prev => prev ? { ...prev, status: "approved" } : null);
        startPolling(String(pixData.payment_id));
      } else {
        toast.info("O pagamento ainda não foi identificado. Aguarde alguns instantes.");
      }
    } catch (err) {
      console.error("Erro ao confirmar PIX:", err);
      toast.error("Não foi possível verificar o pagamento no momento.");
    } finally {
      setConfirmingPix(false);
    }
  };

  const renderHeader = (title: string, subtitle: string, onBack: () => void) => (
    <div className="sticky top-11 z-10 bg-background border-b px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl h-8 w-8 shrink-0"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-base font-bold font-display">{title}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );

  // Step: Network selection
  if (step === "network-select") {
    return (
      <div className="relative min-h-dvh bg-gradient-to-b from-[hsl(220,55%,16%)] via-[hsl(220,50%,22%)] to-[hsl(220,55%,12%)] overflow-hidden">
        {/* Decorative glow blobs (mesmo padrão da tela de planos) */}
        <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 w-80 h-80 rounded-full bg-[hsl(45,95%,55%)]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-[hsl(210,90%,55%)]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-[hsl(280,70%,55%)]/15 blur-3xl" />

        <div className="relative">
          {renderHeader("Tipo de Escola", "Selecione a rede de ensino", () => setStep("plans"))}
          <div className="max-w-lg mx-auto px-4 pt-16 pb-6 space-y-6">
            <div className="text-center space-y-2 sm:space-y-3 animate-fade-in motion-reduce:animate-none">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] via-[hsl(35,95%,50%)] to-[hsl(20,90%,45%)] blur-xl opacity-70" />
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] via-[hsl(35,95%,50%)] to-[hsl(20,90%,45%)] flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                  <School className="h-9 w-9 sm:h-11 sm:w-11 text-white drop-shadow" />
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl sm:text-4xl font-bold font-display text-white tracking-tight">
                  Rede de <span className="bg-gradient-to-r from-[hsl(45,95%,65%)] to-[hsl(35,95%,55%)] bg-clip-text text-transparent">Ensino</span>
                </h2>
                <p className="text-sm sm:text-lg text-white/80 max-w-sm mx-auto leading-snug">
                  Selecione a rede de ensino da escola
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 animate-fade-in motion-reduce:animate-none" style={{ animationDelay: "120ms", animationFillMode: "backwards" }}>
              {[
                { key: "municipal", label: "Municipal", sub: "Rede municipal", icon: MapPin, tint: "from-[hsl(210,90%,55%)] to-[hsl(220,85%,45%)]" },
                { key: "estadual", label: "Estadual", sub: "Rede estadual", icon: Shield, tint: "from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)]" },
                { key: "federal", label: "Federal", sub: "Rede federal", icon: Crown, tint: "from-[hsl(150,70%,45%)] to-[hsl(160,75%,35%)]" },
                { key: "particular", label: "Particular", sub: "Rede privada", icon: Sparkles, tint: "from-[hsl(280,70%,55%)] to-[hsl(310,75%,45%)]" },
              ].map(({ key, label, sub, icon: Icon, tint }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedNetwork(key as SchoolNetwork);
                    setInepCode("");
                    setFoundSchool(null);
                    setSchoolNotFound(false);
                    setStep("inep");
                  }}
                  className="group relative flex flex-col items-center gap-2 sm:gap-2.5 p-3 sm:p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-inner [@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:border-white/25 [@media(hover:hover)]:hover:-translate-y-0.5 active:translate-y-0 transition-all motion-reduce:[@media(hover:hover)]:hover:translate-y-0"
                >
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg ring-1 ring-white/20`}>
                    <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white drop-shadow" />
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-lg font-extrabold text-white leading-tight">{label}</p>
                    <p className="text-xs sm:text-sm text-white/75 mt-0.5 sm:mt-1 leading-snug">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step: INEP search
  if (step === "inep") {
    return (
      <div className="min-h-dvh bg-background">
        {renderHeader(
          `Escola ${selectedNetwork === "estadual" ? "Estadual" : selectedNetwork === "municipal" ? "Municipal" : selectedNetwork === "particular" ? "Particular" : "Federal"}`,
          selectedNetwork === "particular" ? "INEP opcional" : "Informe o código INEP",
          () => setStep("network-select")
        )}
        <div className="max-w-lg mx-auto px-4 py-5 sm:py-7 space-y-6 sm:space-y-8">
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <School className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            </div>
            <h2 className="text-xl sm:text-3xl font-extrabold font-display">
              {selectedNetwork === "particular" ? "Escola Particular" : "Código INEP da Escola"}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
              {selectedNetwork === "particular"
                ? "Se sua escola privada possuir código INEP, informe abaixo. Caso contrário, pule esta etapa."
                : "Digite o código INEP (8 dígitos) para identificar sua escola"}
            </p>
          </div>

          {selectedNetwork === "particular" && (
            <Card className="border-[hsl(280,70%,55%)]/30 bg-[hsl(280,70%,55%)]/5">
              <CardContent className="p-4 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-[hsl(280,70%,55%)] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Rede privada</p>
                  <p className="text-xs text-muted-foreground">
                    Escolas particulares podem se cadastrar mesmo sem código INEP. O CNPJ informado
                    no próximo passo será usado como identificador único.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4 sm:space-y-5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={selectedNetwork === "particular" ? "Opcional — 8 dígitos" : "Ex: 12345678"}
                value={inepCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setInepCode(val);
                  setSchoolNotFound(false);
                  setFoundSchool(null);
                }}
                className="pl-11 h-12 sm:h-14 rounded-xl bg-secondary/50 border-0 text-center text-xl sm:text-2xl font-mono font-bold tracking-widest placeholder:text-sm sm:placeholder:text-base placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
                maxLength={8}
                inputMode="numeric"
              />
            </div>

            <Button
              className="w-full rounded-xl h-12 sm:h-14 text-base font-semibold"
              onClick={handleSearchInep}
              disabled={
                searchingSchool ||
                (selectedNetwork === "particular"
                  ? inepCode.length > 0 && inepCode.length < 8
                  : inepCode.length < 8)
              }
            >
              {searchingSchool ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {selectedNetwork === "particular" && inepCode.length === 0
                ? "Continuar sem INEP"
                : "Buscar Escola"}
            </Button>

            {selectedNetwork === "particular" && inepCode.length > 0 && (
              <Button
                variant="ghost"
                className="w-full rounded-xl h-10 text-xs"
                onClick={handleSkipInepParticular}
                disabled={searchingSchool}
              >
                Pular esta etapa
              </Button>
            )}

            {/* Busca alternativa por nome / cidade / estado */}
            <div className="pt-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  ou busque pelo nome
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <SchoolNameSearch
                network={selectedNetwork}
                onSelect={(s) => {
                  setInepCode(s.inep_code || "");
                  setFoundSchool({
                    id: s.id,
                    name: s.name,
                    city: s.city,
                    state: s.state,
                    inep_code: s.inep_code,
                  });
                  setSchoolNotFound(false);
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                Digite parte do nome da escola, cidade ou estado
              </p>
            </div>
          </div>

          {foundSchool && (
            <Card className="border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-bottom-2">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{foundSchool.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {foundSchool.city} — {foundSchool.state}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      INEP: {foundSchool.inep_code}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full rounded-xl h-10"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      email: user?.email || "",
                    }));
                    setStep("school-data");
                  }}
                >
                  Continuar com esta escola
                </Button>
              </CardContent>
            </Card>
          )}

          {schoolNotFound && (
            <Card className="border-destructive/30 bg-destructive/5 animate-in fade-in slide-in-from-bottom-2">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Escola não encontrada</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedNetwork === "particular"
                      ? "Nenhum INEP correspondente. Você pode pular esta etapa e cadastrar sua escola particular pelo CNPJ."
                      : "Verifique o código INEP ou entre em contato com o suporte para cadastrar sua escola."}
                  </p>
                  {selectedNetwork === "particular" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 rounded-lg h-8 text-xs"
                      onClick={handleSkipInepParticular}
                    >
                      Continuar sem INEP
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Step: School data form
  if (step === "school-data") {
    return (
      <div className="h-dvh bg-background flex flex-col overflow-hidden">
        {renderHeader(
          "Dados da Escola",
          foundSchool?.name || (selectedNetwork === "particular" ? "Escola Particular" : ""),
          () => setStep(selectedNetwork === "particular" ? "network-select" : "inep")
        )}
        <div className="max-w-lg mx-auto px-3 flex-1 flex flex-col justify-between py-3 w-full">
          <div className="flex flex-col justify-evenly flex-1">
            <div className="space-y-0.5">
              <Label className="text-[10px] font-medium">CNPJ</Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={formData.cnpj}
                onChange={(e) => setFormData((prev) => ({ ...prev, cnpj: maskCNPJ(e.target.value) }))}
                className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                inputMode="numeric"
                maxLength={18}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-medium">
                CPF do gestor <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="000.000.000-00"
                value={formData.gestorCpf}
                onChange={(e) => setFormData((prev) => ({ ...prev, gestorCpf: maskCPF(e.target.value) }))}
                className={`h-8 rounded-lg bg-secondary/50 border text-xs ${
                  formData.gestorCpf.replace(/\D/g, "").length === 11 && !isValidCPF(formData.gestorCpf)
                    ? "border-destructive"
                    : "border-transparent"
                }`}
                inputMode="numeric"
                maxLength={14}
                aria-invalid={
                  formData.gestorCpf.replace(/\D/g, "").length === 11 && !isValidCPF(formData.gestorCpf)
                }
                aria-describedby="gestor-cpf-error"
              />
              {formData.gestorCpf.replace(/\D/g, "").length === 11 && !isValidCPF(formData.gestorCpf) && (
                <p id="gestor-cpf-error" className="text-[10px] text-destructive mt-0.5">
                  CPF inválido. Verifique os dígitos.
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-medium">CEP</Label>
              <div className="relative">
                <Input
                  placeholder="00000-000"
                  value={formData.cep}
                  onChange={(e) => {
                    const masked = maskCEP(e.target.value);
                    setFormData((prev) => ({ ...prev, cep: masked }));
                    if (masked.replace(/\D/g, "").length === 8) {
                      handleCepLookup(masked);
                    }
                  }}
                  className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                  inputMode="numeric"
                  maxLength={9}
                />
                {cepLoading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <div className="col-span-3 space-y-0.5">
                <Label className="text-[10px] font-medium">Endereço</Label>
                <Input
                  placeholder="Rua / Avenida"
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                  className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-medium">Nº</Label>
                <Input
                  placeholder="Nº"
                  value={formData.number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, number: e.target.value }))}
                  className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                />
              </div>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-medium">Bairro</Label>
              <Input
                placeholder="Bairro"
                value={formData.neighborhood}
                onChange={(e) => setFormData((prev) => ({ ...prev, neighborhood: e.target.value }))}
                className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-0.5">
                <Label className="text-[10px] font-medium">Cidade</Label>
                <Input
                  placeholder="Cidade"
                  value={formData.city}
                  readOnly
                  className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-medium">Estado</Label>
                <Input
                  placeholder="UF"
                  value={formData.state}
                  readOnly
                  className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                />
              </div>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-medium">Telefone</Label>
              <Input
                placeholder="(00) 00000-0000"
                value={formData.contact}
                onChange={(e) => setFormData((prev) => ({ ...prev, contact: maskPhone(e.target.value) }))}
                className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                inputMode="tel"
                maxLength={15}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] font-medium">E-mail</Label>
              <Input
                placeholder="escola@email.com"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                className="h-8 rounded-lg bg-secondary/50 border-0 text-xs"
                inputMode="email"
              />
            </div>
          </div>

          <div className="pb-4 pt-2">
            <Button className="w-full rounded-xl h-11" onClick={handleSchoolDataSubmit}>
              Continuar para Pagamento
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step: Payment — restauradas as 3 telas (PIX/Boleto/Cartão).
  // PIX e Cartão disponíveis via Checkout Transparente Mercado Pago.
  // Boleto continua via WhatsApp.

  const handleBoletoWhatsApp = async () => {
    if (boletoLoading) return;
    const planExists = selectedPlan && PLANS.some(p => p.id === selectedPlan || p.name === selectedPlan);
    if (!planExists) {
      toast.error("Selecione um plano válido para gerar o boleto.");
      return;
    }
    const planNormalized = (selectedPlan || "").toLowerCase();
    const plan = PLANS.find(p => p.id === planNormalized || p.name?.toLowerCase() === planNormalized);

    setBoletoLoading(true);
    setBoletoStage("creating");
    setBoletoStageDetail("Enviando dados ao Mercado Pago…");
    const tId = toast.loading("Gerando boleto no Mercado Pago…");
    try {
      const res = await criarPagamentoMP({
        plano: planNormalized as any,
        metodo: "boleto",
        payment_method_id: boletoIssuer,
        payer: {
          email: formData.email || user?.email || "",
          first_name: profile?.full_name?.split(" ")[0] || "Gestor",
          ...(formData.gestorCpf?.replace(/\D/g, "") ? {
            identification: { type: "CPF", number: formData.gestorCpf.replace(/\D/g, "") }
          } : {}),
        },
      });

      // Validação robusta do retorno inicial (POST /criar-pagamento-mp)
      if (!res?.pagamento_id) {
        throw new Error("Resposta inválida do backend de pagamento.");
      }
      const validStatuses = ["pending", "approved"];
      const initialStatus = (res?.status || "").toLowerCase();

      // 2ª etapa: aguardar a confirmação do backend consultando o status pelo ID
      setBoletoStage("awaiting");
      setBoletoStageDetail(`Pagamento criado (ID ${res.pagamento_id.slice(0, 8)}…). Aguardando confirmação…`);
      toast.loading("Aguardando confirmação do pagamento…", { id: tId });
      const { getPagamentoStatus } = await import("@/lib/mercadoPago");
      let confirmed: any = null;
      let confirmedStatus = initialStatus;
      let confirmedLink = res?.ticket_url || "";

      for (let attempt = 0; attempt < 5; attempt++) {
        setBoletoStage("confirming");
        setBoletoStageDetail(`Confirmando status (tentativa ${attempt + 1}/5)…`);
        try {
          confirmed = await getPagamentoStatus(res.pagamento_id);
        } catch (e) {
          console.warn("Polling status falhou, tentativa", attempt + 1, e);
        }
        if (confirmed?.status) {
          confirmedStatus = String(confirmed.status).toLowerCase();
          confirmedLink = confirmed.ticket_url || confirmedLink;
          if (validStatuses.includes(confirmedStatus) && confirmedLink) break;
        }
        await new Promise(r => setTimeout(r, 1200));
      }

      // Regra: só abre WhatsApp se status for pending OU approved
      if (!validStatuses.includes(confirmedStatus)) {
        setBoletoStage("rejected");
        setBoletoStageDetail(`Pagamento ${confirmedStatus || "desconhecido"}. Envio bloqueado.`);
        toast.dismiss(tId);
        toast.error(`Pagamento ${confirmedStatus || "desconhecido"}. Envio via WhatsApp bloqueado.`);
        return;
      }
      if (!confirmedLink) {
        setBoletoStage("rejected");
        setBoletoStageDetail("Boleto criado mas sem link disponível.");
        toast.dismiss(tId);
        toast.error("Boleto criado mas sem link disponível. Tente novamente em instantes.");
        return;
      }

      setBoletoStage("approved");
      setBoletoStageDetail(`Status confirmado: ${confirmedStatus}. Abrindo WhatsApp…`);

      const link = confirmedLink;

      const msg =
        `Olá! Segue o *boleto* da assinatura do Agendamento Escolar.\n\n` +
        `📌 Escola: ${foundSchool?.name || "N/A"}\n` +
        `📋 INEP: ${foundSchool?.inep_code || "N/A"}\n` +
        `💼 Plano: ${plan?.name || planNormalized} — ${plan?.price || ""}\n` +
        `📧 E-mail: ${formData.email || user?.email || "N/A"}\n\n` +
        `🔗 Link do boleto: ${link}\n\n` +
        `Após o pagamento, o acesso será liberado automaticamente.`;

      toast.dismiss(tId);
      toast.success("Boleto gerado! Abrindo WhatsApp…");
      window.open(buildWhatsappUrl(msg), "_blank");
    } catch (err: any) {
      console.error("Erro ao gerar boleto:", err);
      setBoletoStage("rejected");
      setBoletoStageDetail(err?.message || "Falha ao gerar boleto.");
      toast.dismiss(tId);
      toast.error(err?.message || "Falha ao gerar boleto. Tente novamente.");
    } finally {
      setBoletoLoading(false);
    }
  };

  if (step === "contract-view" || step === "contract-upload" || step === "contract-review") {
    const subPhase = step === "contract-view" ? 1 : step === "contract-upload" ? 2 : 3;
    const StepperBar = () => (
      <div className="grid grid-cols-3 gap-1.5">
        {["Visualizar", "Enviar assinado", "Revisar"].map((label, idx) => {
          const n = idx + 1;
          const done = n < subPhase;
          const current = n === subPhase;
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? "bg-emerald-500 text-white" : current ? "bg-amber-500 text-white animate-pulse" : "bg-muted text-muted-foreground"}`}>
                {done ? "✓" : n}
              </div>
              <span className={`text-[10px] text-center leading-tight ${current ? "font-bold text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{label}</span>
            </div>
          );
        })}
      </div>
    );

    // ============ TELA 1: VISUALIZAR + BAIXAR ============
    if (step === "contract-view") {
      return (
        <div className="min-h-dvh bg-background flex flex-col">
          {renderHeader("Contrato de Prestação", "Leia o contrato e baixe a minuta", () => setStep("school-data"))}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-3 py-3 space-y-3 pb-32">
              <StepperBar />
              <div ref={contractRef} className="bg-white text-black rounded-lg p-6 text-[11px] leading-relaxed shadow-sm border" style={{ textAlign: "justify" }}>
                <h2 className="text-center font-bold text-base mb-1">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2>
                <p className="text-center font-bold mb-4">Plataforma Agendamento de Ambiente Escolar</p>
                <p className="mb-1"><strong>CONTRATANTE (Prestadora):</strong></p>
                <p className="mb-3" style={{ textIndent: "1.25cm" }}>{companyData?.razao_social || "—"}, inscrita no CNPJ sob o nº {companyData?.cnpj || "—"}, com sede em {[companyData?.address, companyData?.city, companyData?.state].filter(Boolean).join(", ") || "—"}, representada por {companyData?.representative_name || "—"}, CPF {companyData?.representative_cpf || "—"}.</p>
                <p className="mb-1"><strong>CONTRATADA (Escola):</strong></p>
                <p className="mb-3" style={{ textIndent: "1.25cm" }}>{foundSchool?.name || "—"}, INEP {foundSchool?.inep_code || "—"}, CNPJ {formData.cnpj || "—"}, localizada em {[formData.address, formData.number, formData.neighborhood, foundSchool?.city, foundSchool?.state].filter(Boolean).join(", ") || "—"}, e-mail: {formData.email || "—"}, telefone: {formData.contact || "—"}, representada por seu(sua) gestor(a) {contractSignerName}, CPF {(contractSignerCpf ? maskCPF(contractSignerCpf) : formData.gestorCpf) || "—"}.</p>
                <p className="mb-1"><strong>Cláusula 1ª — Objeto:</strong> Licença de uso da plataforma Agendamento de Ambiente Escolar.</p>
                <p className="mb-1"><strong>Cláusula 3ª — Vigência e fidelidade:</strong> 12 meses renovável; <strong>fidelidade mínima de 24 meses</strong>; cancelamento antes implica multa proporcional.</p>
                <p className="mb-1"><strong>Cláusula 4ª — Valor:</strong> R$ 199,90/mês de referência, via PIX, boleto ou cartão.</p>
                <p className="mb-1"><strong>Cláusula 5ª — Reajuste:</strong> Anual pelo IPCA.</p>
                <p className="mb-1"><strong>Cláusulas 6ª e 7ª — Obrigações:</strong> CONTRATANTE oferece acesso, suporte e LGPD; CONTRATADA paga em dia, usa licitamente e guarda credenciais.</p>
                <p className="mb-1"><strong>Cláusula 8ª — Inadimplência:</strong> 30/60/90 dias → suspensão, SPC/SERASA, protesto. Multa 2%, juros 1% a.m.</p>
                <p className="mb-1"><strong>Cláusulas 10ª–12ª:</strong> Propriedade intelectual da plataforma é da CONTRATANTE; sem garantia de funcionamento ininterrupto; limitação de responsabilidade.</p>
                <p className="mb-1"><strong>Cláusula 13ª — LGPD:</strong> Dados usados apenas para execução do serviço.</p>
                <p className="mb-1"><strong>Cláusula 14ª — Registros eletrônicos:</strong> IP, data/hora, navegador, dispositivo e versão aceita são armazenados como prova.</p>
                <p className="mb-1"><strong>Cláusula 15ª — Aceite eletrônico:</strong> Marcar o checkbox abaixo + clicar em "ACEITAR CONTRATO E ATIVAR ASSINATURA" equivale a assinatura física/digital.</p>
                <p className="mb-1"><strong>Cláusula 16ª — Responsabilidade exclusiva da PJ:</strong> Gestor isento de responsabilidade pessoal; obrigações financeiras são da escola (CNPJ).</p>
                <p className="mb-1"><strong>Cláusula 17ª — Foro:</strong> Comarca de Boa Vista/RR.</p>
                <p className="mt-4 text-center">{(companyData?.city || "Boa Vista/RR")}, {new Date().toLocaleDateString("pt-BR")}.</p>
              </div>
              <label className="flex items-start gap-2 p-3 rounded-lg border bg-amber-500/10 border-amber-500/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contractAccepted}
                  onChange={(e) => setContractAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-xs font-bold">
                  Li e concordo com os termos deste contrato.
                </span>
              </label>

              {/* Assinatura eletrônica — nome digitado */}
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider">
                  ✍️ Assinatura eletrônica — digite seu NOME COMPLETO
                </label>
                <input
                  type="text"
                  value={acceptedFullName}
                  onChange={(e) => setAcceptedFullName(e.target.value.toUpperCase())}
                  placeholder="EX: MARIA DA SILVA SANTOS"
                  autoComplete="name"
                  className="w-full h-12 px-3 rounded-md border bg-background text-lg font-bold tracking-wide"
                  style={{ fontFamily: '"Times New Roman", serif', fontStyle: "italic" }}
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Equivale à sua assinatura nos termos da <strong>Lei 14.063/2020</strong>.
                  Registramos seu nome digitado, IP, data/hora, navegador, localização aproximada e hash SHA-256 do documento.
                </p>
                {/* Pré-visualização das assinaturas */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t mt-2">
                  <div className="text-center">
                    <div className="h-14 flex items-center justify-center border-b">
                      {adminSignatureDataUrl ? (
                        <img src={adminSignatureDataUrl} alt="Assinatura admin" className="max-h-12 max-w-full" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">(assinatura do administrador)</span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold mt-1">CONTRATANTE</p>
                    <p className="text-[9px] text-muted-foreground">{companyData?.razao_social || "—"}</p>
                  </div>
                  <div className="text-center">
                    <div className="h-14 flex items-center justify-center border-b">
                      <span className="text-base italic font-bold truncate" style={{ fontFamily: '"Times New Roman", serif' }}>
                        {acceptedFullName || <em className="text-muted-foreground text-[10px] not-italic">(digite seu nome)</em>}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold mt-1">CONTRATADA</p>
                    <p className="text-[9px] text-muted-foreground">CPF {formData.gestorCpf || "—"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent p-3 pt-6 border-t">
            <div className="max-w-2xl mx-auto space-y-2">
              <Button
                variant="outline"
                className="w-full h-11 font-bold"
                onClick={handleDownloadContractTextPdf}
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar cópia em PDF
              </Button>
              {profile?.role !== "gestor_pedagogico" ? (
                <>
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <p className="font-bold mb-1">Apenas o(a) gestor(a) pode assinar este contrato.</p>
                    <p className="text-muted-foreground">
                      Você está logado(a) como <strong>{profile?.full_name || "—"}</strong>. Envie uma solicitação para o(a) gestor(a)
                      {gestorProfile?.full_name ? <> <strong>{gestorProfile.full_name}</strong></> : null} liberar a assinatura.
                    </p>
                  </div>
                  <Button
                    className="w-full h-14 font-bold text-base"
                    onClick={handleRequestContractSigning}
                    disabled={requestingContractSign}
                  >
                    {requestingContractSign ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Enviando solicitação...</>
                    ) : (
                      "Solicitar ao gestor que assine"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 font-bold text-xs border-dashed border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                    onClick={handleAcceptContract}
                    disabled={!contractAccepted || uploadingSigned}
                    title="Botão de teste — ignora a restrição de papel"
                  >
                    🧪 TESTE — Aceitar contrato (DEV)
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full h-14 font-bold text-base"
                  onClick={handleAcceptContract}
                  disabled={!contractAccepted || !acceptedFullName.trim().includes(" ") || uploadingSigned}
                  variant={(!contractAccepted || !acceptedFullName.trim().includes(" ")) ? "destructive" : "default"}
                >
                  {uploadingSigned ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Registrando aceite...</>
                  ) : !contractAccepted ? (
                    "Marque o checkbox para aceitar"
                  ) : !acceptedFullName.trim().includes(" ") ? (
                    "Digite seu nome completo (assinatura)"
                  ) : (
                    "ACEITAR CONTRATO E ATIVAR ASSINATURA"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ============ TELA 2: UPLOAD DO ASSINADO ============
    if (step === "contract-upload") {
      return (
        <div className="min-h-dvh bg-background flex flex-col">
          {renderHeader("Enviar Contrato Assinado", "Anexe o PDF assinado pela escola", () => setStep("contract-view"))}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-3 py-3 space-y-4 pb-32">
              <StepperBar />

              <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center space-y-3">
                <Upload className="h-10 w-10 mx-auto text-primary" />
                <p className="text-sm font-bold">Anexe o contrato assinado</p>
                <p className="text-xs text-muted-foreground">Aceito apenas PDF, máximo 10 MB.</p>
                <input
                  ref={signedInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleSignedFileSelect}
                />
                {!signedUploaded ? (
                  <Button variant="outline" className="h-11 font-bold" onClick={() => signedInputRef.current?.click()}>
                    {signedFile ? signedFile.name.slice(0, 28) : "Selecionar PDF"}
                  </Button>
                ) : (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center justify-between gap-2 text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{signedUploaded.name}</p>
                        <p className="text-[10px] text-muted-foreground">PDF enviado com sucesso</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={handleReplaceSignedContract} disabled={uploadingSigned}>
                      Trocar
                    </Button>
                  </div>
                )}
              </div>

              {signedPreviewUrl && (
                <div className="rounded-lg border overflow-hidden">
                  <iframe src={signedPreviewUrl} className="w-full h-72" title="Contrato assinado" />
                </div>
              )}
            </div>
          </div>
          <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent p-3 pt-6 border-t">
            <div className="max-w-2xl mx-auto space-y-2">
              {!signedUploaded ? (
                <Button
                  className="w-full h-14 font-bold text-base"
                  onClick={handleUploadSignedContract}
                  disabled={!signedFile || uploadingSigned}
                >
                  {uploadingSigned ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Upload className="h-5 w-5 mr-2" />}
                  Enviar Contrato Assinado
                </Button>
              ) : (
                <Button
                  className="w-full h-14 font-bold text-base"
                  onClick={() => setStep("contract-review")}
                >
                  Continuar para revisão
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ============ TELA 3: REVISÃO DE STATUS ============
    const reviewReady = !!signedUploaded && !!adminUploaded && contractAccepted;
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        {renderHeader("Revisão do Contrato", "Confira o status antes de pagar", () => setStep("contract-upload"))}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-3 py-3 space-y-3 pb-32">
            <StepperBar />

            {/* Status: gestor */}
            <div className={`rounded-lg border p-3 flex items-start gap-3 ${signedUploaded ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
              {signedUploaded ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="h-6 w-6 text-amber-600 animate-spin shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Sua assinatura (escola)</p>
                {signedUploaded ? (
                  <div className="space-y-1 mt-0.5">
                    <p className="text-xs text-muted-foreground break-words">
                      Arquivo: <span className="font-semibold text-foreground">{signedUploaded.name}</span>
                    </p>
                    {signedUploaded.uploaded_at && (
                      <p className="text-xs text-muted-foreground">
                        Enviado ao admin em{" "}
                        <span className="font-semibold text-foreground">
                          {new Date(signedUploaded.uploaded_at).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </p>
                    )}
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                      <CheckCircle2 className="h-3 w-3" />
                      {signedUploaded.status === "awaiting_admin"
                        ? "Enviado — aguardando análise do admin"
                        : signedUploaded.status === "approved"
                        ? "Aprovado pelo admin"
                        : `Status: ${signedUploaded.status ?? "enviado"}`}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground break-words">Você ainda não enviou o PDF assinado.</p>
                    <Button size="sm" variant="link" className="px-0 h-auto" onClick={() => setStep("contract-upload")}>
                      Enviar agora →
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Status: admin */}
            <div className={`rounded-lg border p-3 flex items-start gap-3 ${adminUploaded ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
              {adminUploaded ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="h-6 w-6 text-amber-600 animate-spin shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Assinatura da contraparte (administração)</p>
                <p className="text-xs text-muted-foreground break-words">
                  {adminUploaded
                    ? "A administração assinou o contrato."
                    : "Aguardando a administração anexar a versão assinada. Esta tela atualiza em tempo real."}
                </p>
                {adminUploaded && (
                  <Button size="sm" variant="link" className="px-0 h-auto" onClick={handleDownloadAdminSigned}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Baixar PDF da contraparte
                  </Button>
                )}
              </div>
            </div>

            {adminPreviewUrl && (
              <iframe src={adminPreviewUrl} className="w-full h-56 rounded-lg border" title="Contrato admin" />
            )}

            {/* Aceite */}
            <label className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30 cursor-pointer">
              <input
                type="checkbox"
                checked={contractAccepted}
                onChange={(e) => setContractAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs">
                Li e aceito os termos do contrato, incluindo a <strong>multa de 50% das parcelas restantes</strong> em caso de rescisão antecipada.
              </span>
            </label>
          </div>
        </div>
        <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent p-3 pt-6 border-t">
          <div className="max-w-2xl mx-auto">
            <Button
              className={`w-full h-14 font-bold text-base ${!reviewReady ? "bg-destructive hover:bg-destructive/90" : ""}`}
              onClick={handleAcceptContract}
              disabled={!reviewReady}
            >
              {!signedUploaded
                ? "Envie o contrato assinado"
                : !adminUploaded
                ? "Aguardando contraparte assinar"
                : !contractAccepted
                ? "Marque o aceite dos termos"
                : "Liberar pagamento →"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "payment") {
    if (!paymentDetailOpen) {
      return (
        <div className="relative min-h-dvh bg-gradient-to-b from-[hsl(220,55%,16%)] via-[hsl(220,50%,22%)] to-[hsl(220,55%,12%)] overflow-hidden flex flex-col">
          {/* Decorative glow blobs (mesmo padrão das telas anteriores) */}
          <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 w-80 h-80 rounded-full bg-[hsl(45,95%,55%)]/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-[hsl(210,90%,55%)]/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-[hsl(280,70%,55%)]/15 blur-3xl" />

          <div className="relative flex flex-col flex-1 min-h-0">
            {/* Header transparente sobre o gradiente */}
            <div className="sticky top-11 z-10 mt-12 px-4 py-3">
              <div className="flex items-center gap-3 max-w-lg mx-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl h-9 w-9 shrink-0 bg-white/10 hover:bg-white/20 text-white border border-white/15"
                  onClick={() => setStep("school-data")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-base font-bold font-display text-white">Pagamento</h1>
                  <p className="text-xs text-white/75">
                    {PLANS.find(p => p.id === selectedPlan)?.name || "Assinatura"} - {PLANS.find(p => p.id === selectedPlan)?.price || "R$ 199,90"}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-w-lg mx-auto w-full px-4 pt-2 pb-4 flex-1 flex flex-col gap-4 min-h-0">
              {/* Hero (badge ícone com glow + título com gradiente dourado) */}
              <div className="text-center space-y-2 sm:space-y-3 animate-fade-in motion-reduce:animate-none">
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] via-[hsl(35,95%,50%)] to-[hsl(20,90%,45%)] blur-xl opacity-70" />
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] via-[hsl(35,95%,50%)] to-[hsl(20,90%,45%)] flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                    <Wallet className="h-9 w-9 sm:h-11 sm:w-11 text-white drop-shadow" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight">
                    Forma de{" "}
                    <span className="bg-gradient-to-r from-[hsl(45,95%,65%)] to-[hsl(35,95%,55%)] bg-clip-text text-transparent">
                      Pagamento
                    </span>
                  </h2>
                  <p className="text-sm sm:text-base text-white/80 max-w-sm mx-auto leading-snug">
                    Escolha como deseja pagar a sua assinatura
                  </p>
                </div>
              </div>

              {/* Aviso de indisponibilidade — adaptado ao tema escuro */}
              {/* Grid 3 cards de método (mesmo estilo do grid de redes) */}
              <div
                className="grid grid-cols-3 gap-3 animate-fade-in motion-reduce:animate-none"
                style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
              >
                {[
                  {
                    id: "pix" as const,
                    Icon: QrCode,
                    label: "PIX",
                    sub: "Instantâneo",
                    tint: "from-[hsl(168,76%,45%)] to-[hsl(160,80%,35%)]",
                  },
                  {
                    id: "boleto" as const,
                    Icon: FileText,
                    label: "Boleto",
                    sub: "Bancário",
                    tint: "from-[hsl(210,90%,55%)] to-[hsl(220,85%,45%)]",
                  },
                  {
                    id: "card" as const,
                    Icon: CreditCard,
                    label: "Crédito",
                    sub: "Débito/Crédito",
                    tint: "from-[hsl(280,70%,60%)] to-[hsl(265,75%,50%)]",
                  },
                ].map(({ id, Icon, label, sub, tint }) => {
                  const active = paymentMethod === id;
                  const checking = loadingMethod === id;
                  const unavailable = unavailableNotice === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!!loadingMethod}
                      aria-busy={checking}
                      aria-pressed={active}
                      onClick={() => {
                        // Anti double-tap: ignora cliques durante loading
                        if (paymentLockRef.current || loadingMethod) return;
                        paymentLockRef.current = true;
                        setPaymentMethod(id);
                        console.log("[Payment] Selected method:", id);
                        setUnavailableNotice(null);
                        setLoadingMethod(id);
                        paymentTimeoutRef.current = window.setTimeout(() => {
                          paymentTimeoutRef.current = null;
                          setLoadingMethod(null);
                          paymentLockRef.current = false;
                          // Removido o aviso de indisponibilidade para permitir o fluxo real do PIX
                          // if (id === "card") {
                          //   setUnavailableNotice(id);
                          // }
                        }, 700);
                      }}
                      className={`group relative flex flex-col items-center gap-2 sm:gap-2.5 p-3 sm:p-4 rounded-2xl backdrop-blur-md border shadow-inner transition-colors min-h-[120px] disabled:opacity-60 ${
                        active
                          ? "bg-white/15 border-[hsl(45,95%,65%)]/60"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      <div
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg ring-1 ring-white/20`}
                      >
                        {checking ? (
                          <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 text-white animate-spin" />
                        ) : (
                          <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white drop-shadow" />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-base sm:text-lg font-extrabold text-white leading-tight">
                          {label}
                        </p>
                        <p className="text-[11px] sm:text-xs text-white/75 mt-0.5 leading-snug">
                          {unavailable ? "Indisponível" : sub}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-white/50 text-center px-4 leading-tight italic">
                * Cartão de crédito: Até 3x sem juros. Acima de 3x com acréscimo.
              </p>

              {/* Spacer para empurrar o botão para baixo */}
              <div className="flex-1" />

              <Button
                title={!selectedPlan ? "Selecione um plano antes de continuar" : undefined}
                aria-invalid={planMissingError || paymentMethodError}
                className={`w-full rounded-xl h-12 font-bold shadow-lg ring-1 ring-white/20 disabled:opacity-60 ${
                  paymentMethodError || planMissingError
                    ? "bg-destructive hover:bg-destructive text-destructive-foreground"
                    : "bg-gradient-to-r from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)] hover:from-[hsl(45,95%,60%)] hover:to-[hsl(35,95%,50%)] text-[hsl(220,55%,15%)]"
                }`}
                disabled={!!loadingMethod || processing}
                onClick={async () => {
                  console.log("[Payment] Continue clicked. Current state:", { paymentMethod, selectedPlan, processing });
                  if (paymentLockRef.current || loadingMethod || processing) return;

                  if (!selectedPlan) {
                    setPlanMissingError(true);
                    return;
                  }
                  setPlanMissingError(false);

                  if (!paymentMethod) {
                    setPaymentMethodError(true);
                    return;
                  }
                  setPaymentMethodError(false);

                  if (paymentMethod === "pix") {
                    setPaymentDetailOpen(true);
                    if (pixData?.payment_id) {
                      startPolling(String(pixData.payment_id));
                    } else {
                      generatePix();
                    }
                  } else if (paymentMethod === "card") {
                    if (!showCardForm) {
                      setShowCardForm(true);
                      setPaymentDetailOpen(true);
                      return;
                    }

                    handleCardPayment();
                  } else {
                    setPaymentDetailOpen(true);
                  }
                }}
              >
                {processing ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : null}
                {planMissingError
                  ? "Selecione um plano para continuar"
                  : paymentMethodError
                  ? "Selecione uma forma de pagamento"
                  : paymentMethod === "card"
                  ? (showCardForm ? "Finalizar Assinatura" : "Configurar Cartão")
                  : "Continuar"}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-dvh bg-background flex flex-col overflow-hidden">
        {renderHeader("Pagamento", "R$ 199,90/mês", () => setPaymentDetailOpen(false))}
        <div className="max-w-lg mx-auto px-4 py-3 space-y-2.5 flex-1 overflow-y-auto overscroll-contain">
          {paymentMethod === "pix" && (
            <Card className="animate-in fade-in slide-in-from-bottom-2">
              <CardContent className="p-4 space-y-4">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                    <QrCode className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-sm font-bold">Pague com PIX</p>
                    {pixData?.status && (
                      <Badge 
                        variant={
                          pixData.status === "approved" ? "default" : 
                          pixData.status === "pending" ? "secondary" : 
                          "destructive"
                        }
                        className="text-[10px] h-5 px-2 uppercase font-bold tracking-wider"
                      >
                        {pixData.status === "pending" ? "Aguardando pagamento" : 
                         pixData.status === "approved" ? "Pagamento aprovado" : 
                         pixData.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Escaneie o código abaixo ou copie e cole no seu banco.
                  </p>

                  {pixData?.qr_code && (
                    <div
                      className={`mt-2 mx-auto max-w-[280px] rounded-lg px-3 py-2 border text-[11px] font-semibold flex items-center justify-center gap-2 transition-colors ${
                        paymentSummary?.status === "approved"
                          ? "bg-green-500/10 border-green-500/40 text-green-700 dark:text-green-400"
                          : summaryPending
                          ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400"
                          : loadingSummary
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-muted/40 border-border text-muted-foreground"
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      {paymentSummary?.status === "approved" ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Pagamento confirmado!
                        </>
                      ) : summaryPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Ainda aguardando confirmação do banco…
                        </>
                      ) : loadingSummary ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Verificando pagamento automaticamente…
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          Monitorando pagamento em tempo real
                        </>
                      )}
                    </div>
                  )}
                </div>

                {pixLoading ? (
                  <div className="flex flex-col items-center justify-center py-6 space-y-3">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-[10px] text-muted-foreground animate-pulse">Gerando QR Code...</p>
                  </div>
                ) : pixData?.qr_code_base64 ? (
                  <div className="space-y-4">
                    <div className="relative group/qr aspect-square max-w-[200px] mx-auto bg-white p-2 rounded-xl border-2 border-primary/20 shadow-inner overflow-hidden flex items-center justify-center">
                      <img
                        src={`data:image/png;base64,${pixData.qr_code_base64}`}
                        alt="QR Code PIX"
                        className="max-w-full max-h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/qr:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 rounded-lg text-[10px] font-bold"
                          onClick={handleDownloadQrCode}
                        >
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                          Baixar QR
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-center space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Código Copia e Cola</p>
                        <div className="relative group/copy">
                          <Input
                            readOnly
                            value={pixData.qr_code || ""}
                            className="pr-10 h-11 text-[11px] font-mono bg-secondary/30 border-primary/10 rounded-xl text-center select-all"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-primary hover:bg-primary/10"
                            onClick={handleCopyPix}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <Button
                        className="w-full rounded-xl h-12 font-bold bg-primary text-primary-foreground hover:opacity-90 shadow-md transition-all active:scale-[0.98]"
                        onClick={handleCopyPix}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar Código PIX
                      </Button>
                      
                      <Button
                        className="w-full rounded-xl h-12 font-bold bg-white text-primary border-2 border-primary hover:bg-primary/5 shadow-sm transition-all active:scale-[0.98]"
                        onClick={handleConfirmPix}
                        disabled={confirmingPix}
                      >
                        {confirmingPix ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Já realizei o pagamento
                      </Button>
                      
                      <div className="flex flex-col items-center gap-1">
                        <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Expira em: {pixData.expires_at ? new Date(pixData.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                        </p>
                        <p className="text-[9px] text-muted-foreground/60 italic">
                          O pagamento será identificado automaticamente após a conclusão.
                        </p>
                      </div>

                      <div className="pt-2 border-t border-dashed">
                        <Button
                          variant="outline"
                          className="w-full rounded-xl h-11 font-bold text-xs border-amber-500/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                          onClick={async () => {
                            await generatePix(true);
                            toast.success("Novo QR PIX gerado com a chave atualizada!");
                          }}
                          disabled={pixLoading}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${pixLoading ? 'animate-spin' : ''}`} />
                          {pixLoading ? "Gerando novo QR..." : "Gerar novo QR PIX (troquei minha chave)"}
                        </Button>
                        <p className="text-[10px] text-center text-muted-foreground mt-1.5 px-2 leading-tight">
                          Use esta opção após alterar a chave PIX no Mercado Pago para forçar a regeneração do código.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-4">
                    <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold">PIX não encontrado</p>
                      <p className="text-xs text-muted-foreground">Ocorreu um erro ao carregar os dados do pagamento.</p>
                    </div>
                    <Button 
                      onClick={() => generatePix(true)}
                      className="rounded-xl h-11 px-6 font-bold"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Gerar novo PIX
                    </Button>
                  </div>
                )}

                <div className="pt-2 border-t border-dashed">
                  <Button
                    variant="ghost"
                    className="w-full rounded-xl h-9 text-[11px] font-medium text-muted-foreground hover:text-primary"
                    onClick={handleBoletoWhatsApp}
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-2" />
                    Problemas com o PIX? Fale conosco
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {paymentMethod === "boleto" && (
            <Card className="animate-in fade-in slide-in-from-bottom-2 border-primary/20">
              <CardContent className="p-4 space-y-3">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-base font-bold">Pagamento via Boleto</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    O boleto será gerado automaticamente pelo Mercado Pago e o link enviado via WhatsApp. Após o pagamento, o acesso será liberado automaticamente.
                  </p>
                </div>
                <div className="rounded-xl border-2 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
                  <Inbox className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-100 leading-snug">
                    <strong>Acesso direto pelo app:</strong> o boleto também ficará disponível
                    para download na <strong>Gaveta de Documentos</strong> (botão roxo no
                    Painel do Gestor), na pasta <strong>Boletos</strong>. Quando o pagamento
                    for confirmado, ele aparecerá automaticamente carimbado como{" "}
                    <strong>PAGO</strong>.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Emissor do boleto
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: "bolbradesco" as const, label: "Bradesco", desc: "Boleto registrado" },
                      { id: "pec" as const, label: "PEC", desc: "Pague em lotéricas" },
                    ]).map((opt) => {
                      const active = boletoIssuer === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setBoletoIssuer(opt.id);
                            try { localStorage.setItem("boletoIssuer", opt.id); } catch {}
                          }}
                          disabled={boletoLoading}
                          className={
                            "rounded-xl border-2 p-2 text-left transition-all " +
                            (active
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card hover:border-primary/40")
                          }
                        >
                          <p className={"text-sm font-bold break-words " + (active ? "text-primary" : "")}>{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground break-words">{opt.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button
                  className="w-full rounded-xl h-10"
                  onClick={handleBoletoWhatsApp}
                  disabled={boletoLoading}
                >
                  {boletoLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4 mr-2" />
                  )}
                  {boletoLoading ? "Gerando boleto…" : "Gerar Boleto e Enviar via WhatsApp"}
                </Button>

                {boletoStage !== "idle" && (
                  <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Progresso do pagamento
                    </p>
                    {(["creating","awaiting","confirming","approved","rejected"] as const).map((s) => {
                      const labels: Record<typeof s, string> = {
                        creating: "Criando pagamento no Mercado Pago",
                        awaiting: "Aguardando confirmação",
                        confirming: "Confirmando status",
                        approved: "Aprovado / Pronto para envio",
                        rejected: "Recusado / Erro",
                      } as any;
                      const order = ["creating","awaiting","confirming","approved","rejected"];
                      const currentIdx = order.indexOf(boletoStage);
                      const idx = order.indexOf(s);
                      const isCurrent = boletoStage === s;
                      const isDone = !isCurrent && idx < currentIdx && boletoStage !== "rejected";
                      const isError = s === "rejected" && boletoStage === "rejected";
                      const isApproved = s === "approved" && boletoStage === "approved";
                      return (
                        <div key={s} className="flex items-center gap-2 text-xs">
                          <span
                            className={
                              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold " +
                              (isError
                                ? "bg-destructive text-destructive-foreground"
                                : isApproved
                                ? "bg-emerald-600 text-white"
                                : isCurrent
                                ? "bg-primary text-primary-foreground animate-pulse"
                                : isDone
                                ? "bg-emerald-600 text-white"
                                : "bg-muted text-muted-foreground")
                            }
                          >
                            {isError ? "!" : isDone || isApproved ? "✓" : idx + 1}
                          </span>
                          <span
                            className={
                              "break-words " +
                              (isCurrent
                                ? "font-bold text-foreground"
                                : isDone || isApproved
                                ? "text-foreground"
                                : isError
                                ? "text-destructive font-bold"
                                : "text-muted-foreground")
                            }
                          >
                            {labels[s]}
                          </span>
                        </div>
                      );
                    })}
                    {boletoStageDetail && (
                      <p className="text-[11px] text-muted-foreground break-words pt-1 border-t border-dashed">
                        {boletoStageDetail}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {paymentMethod === "card" && showCardForm && (
            <Card className="animate-in fade-in slide-in-from-bottom-2 border-primary/20 bg-card">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <p className="font-bold text-sm">Dados do Cartão</p>
                  </div>
                  {cardFormError ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
                      Modo manual
                    </span>
                  ) : cardFormMounted ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                      ● Pronto
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Carregando…
                    </span>
                  )}
                </div>
                {cardFormError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                    Formulário seguro indisponível: {cardFormError}. Os dados serão enviados pelo modo manual ao finalizar.
                  </div>
                )}
                
                <form id="form-checkout" className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-1.5">
                    <Label htmlFor="cardNumber" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Número do Cartão</Label>
                    <div className="relative">
                      <Input
                        id="cardNumber"
                        name="cardNumber"
                        placeholder="0000 0000 0000 0000"
                        value={cardFormData.cardNumber}
                        onChange={(e) => setCardFormData({...cardFormData, cardNumber: maskCardNumber(e.target.value)})}
                        className="rounded-xl h-11 bg-secondary/20 border-primary/10 focus:border-primary/30 transition-all font-mono pr-24"
                      />
                      {(() => {
                        const brand = detectCardBrandLocal(cardFormData.cardNumber);
                        const label = getCardBrandLabel(brand);
                        if (!label) return null;
                        return (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                            {label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cardholderName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome no Cartão</Label>
                    <Input
                      id="cardholderName"
                      name="cardholderName"
                      placeholder="NOME COMO ESTÁ NO CARTÃO"
                      value={cardFormData.cardholderName}
                      onChange={(e) => setCardFormData({...cardFormData, cardholderName: e.target.value.toUpperCase()})}
                      className="rounded-xl h-11 bg-secondary/20 border-primary/10 focus:border-primary/30 transition-all uppercase"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Validade (MM/AA)</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          id="expirationMonth"
                          name="expirationMonth"
                          placeholder="MM"
                          maxLength={2}
                          value={cardFormData.cardExpirationMonth}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').substring(0, 2);
                            setCardFormData({...cardFormData, cardExpirationMonth: val});
                          }}
                          className="rounded-xl h-11 bg-secondary/20 border-primary/10 focus:border-primary/30 text-center font-mono"
                        />
                        <Input
                          id="expirationYear"
                          name="expirationYear"
                          placeholder="AA"
                          maxLength={2}
                          value={cardFormData.cardExpirationYear}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').substring(0, 2);
                            setCardFormData({...cardFormData, cardExpirationYear: val});
                          }}
                          className="rounded-xl h-11 bg-secondary/20 border-primary/10 focus:border-primary/30 text-center font-mono"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="securityCode" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CVV</Label>
                      <div className="relative">
                        <Input
                          id="securityCode"
                          name="securityCode"
                          type={showSecurityCode ? "text" : "password"}
                          placeholder="123"
                          maxLength={4}
                          value={cardFormData.securityCode}
                          onChange={(e) => setCardFormData({...cardFormData, securityCode: e.target.value.replace(/\D/g, '')})}
                          className="rounded-xl h-11 bg-secondary/20 border-primary/10 focus:border-primary/30 text-center pr-10 font-mono"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:bg-transparent"
                          onClick={() => setShowSecurityCode(!showSecurityCode)}
                        >
                          {showSecurityCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Select nativo SEMPRE renderizado (mesmo oculto) — o SDK do Mercado Pago
                      precisa que o elemento #issuer exista no DOM no momento do mount(). */}
                  <select
                    id="issuer"
                    name="issuer"
                    value={cardFormData.issuer}
                    onChange={(e) => setCardFormData({ ...cardFormData, issuer: e.target.value })}
                    className="hidden"
                    aria-hidden="true"
                  >
                    <option value="">--</option>
                    {issuers.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>

                  {issuers.length > 1 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Banco Emissor</Label>
                      <Select
                        value={cardFormData.issuer}
                        onValueChange={(v) => setCardFormData({ ...cardFormData, issuer: v })}
                      >
                        <SelectTrigger className="rounded-xl h-11 bg-secondary/20 border-primary/10">
                          <SelectValue placeholder="Selecione o emissor" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {issuers.map((i) => (
                            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="installments" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parcelamento</Label>
                    <Select
                      name="installments"
                      value={cardFormData.installments}
                      onValueChange={(v) => setCardFormData({...cardFormData, installments: v})}
                      disabled={installments.length === 0}
                    >
                      <SelectTrigger className="rounded-xl h-11 bg-secondary/20 border-primary/10 focus:ring-primary/20">
                        <SelectValue placeholder={installments.length > 0 ? "Selecione as parcelas" : "Aguardando dados..."} />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {installments.length > 0 ? (
                          installments.map(c => (
                            <SelectItem key={c.installments} value={c.installments.toString()}>
                              {c.recommended_message}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="1">1x de {PLANS.find(p => p.id === selectedPlan || p.name === selectedPlan)?.price || "R$ 199,90"} (sem juros)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <select id="installments" name="installments" value={cardFormData.installments} onChange={() => {}} className="hidden">
                      {installments.map(c => <option key={c.installments} value={c.installments}>{c.recommended_message}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="identificationNumber" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPF do Titular</Label>
                    <Input
                      id="identificationNumber"
                      name="identificationNumber"
                      placeholder="000.000.000-00"
                      value={cardFormData.identificationNumber}
                      onChange={(e) => setCardFormData({...cardFormData, identificationNumber: maskCPF(e.target.value)})}
                      className="rounded-xl h-11 bg-secondary/20 border-primary/10 focus:border-primary/30 font-mono"
                    />
                    <select id="identificationType" name="identificationType" className="hidden">
                      <option value="CPF">CPF</option>
                    </select>
                    <input type="hidden" id="email" name="email" value={user?.email || formData.email || ""} />
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {paymentMethod === "card" && showCardForm && (
            <div className="pt-2">
              <Button
                className="w-full rounded-xl h-12 font-bold bg-gradient-to-r from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)] hover:from-[hsl(45,95%,60%)] hover:to-[hsl(35,95%,50%)] text-[hsl(220,55%,15%)] shadow-lg ring-1 ring-white/20 disabled:opacity-60"
                disabled={processing}
                onClick={() => setCardConfirmOpen(true)}
              >
                {processing ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                )}
                Finalizar Assinatura
              </Button>
            </div>
          )}

          {/* Dialog de Verificação de Pagamento (Cartão) */}
          <Dialog open={cardVerifyOpen} onOpenChange={(open) => { if (!loadingSummary) setCardVerifyOpen(open); }}>
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Verificação do Pagamento
                </DialogTitle>
                <DialogDescription>
                  Confirme o status da cobrança no cartão antes de finalizar.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {loadingSummary ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
                    <Loader2 className="h-6 w-6 text-primary animate-spin shrink-0" />
                    <div>
                      <p className="font-bold text-sm">Verificando pagamento...</p>
                      <p className="text-xs text-muted-foreground">Consultando a operadora do cartão.</p>
                    </div>
                  </div>
                ) : paymentSummary?.status === "approved" ? (
                  <div className="rounded-xl border-2 border-green-500/40 bg-green-500/10 p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-7 w-7 text-green-600 shrink-0" />
                    <div>
                      <p className="font-bold text-sm text-green-700 dark:text-green-400">Pagamento aprovado!</p>
                      <p className="text-xs text-muted-foreground">Sua assinatura foi liberada.</p>
                    </div>
                  </div>
                ) : summaryPending ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-bold text-sm text-amber-700 dark:text-amber-400">Aguardando confirmação</p>
                      <p className="text-xs text-muted-foreground">A operadora ainda não confirmou. Toque em "Verificar agora".</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-muted bg-muted/30 p-4 flex items-center gap-3">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin shrink-0" />
                    <div><p className="font-bold text-sm">Iniciando verificação...</p></div>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plano</span>
                    <span className="font-bold capitalize">{selectedPlan ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor</span>
                    <span className="font-bold">
                      {(selectedPlan === "anual" || selectedPlan === "anual_12" ? 2278.86 : selectedPlan === "anual_24" ? 4317.84 : 199.90).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                  {cardVerifyPaymentId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ID transação</span>
                      <span className="font-mono text-[10px] break-all">{cardVerifyPaymentId}</span>
                    </div>
                  )}
                  {paymentSummary?.date_approved && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Aprovado em</span>
                      <span className="font-bold">{new Date(paymentSummary.date_approved).toLocaleString("pt-BR")}</span>
                    </div>
                  )}
                </div>

                {schoolSummary?.subscription_status === "active" && schoolSummary?.subscription_end_date && (
                  <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 text-xs">
                    <p className="font-bold text-green-700 dark:text-green-400 mb-1">Acesso liberado</p>
                    <p className="text-muted-foreground">
                      Válido até {new Date(`${schoolSummary.subscription_end_date}T00:00:00`).toLocaleDateString("pt-BR")}.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
                {paymentSummary?.status === "approved" ? (
                  <Button
                    onClick={() => { setCardVerifyOpen(false); setShowCongrats(true); }}
                    className="h-12 w-full font-bold bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle2 className="h-5 w-5 mr-2" /> Concluir
                  </Button>
                ) : (
                  <Button
                    onClick={() => startPolling(cardVerifyPaymentId ?? undefined)}
                    disabled={loadingSummary}
                    className="h-12 w-full font-bold"
                  >
                    {loadingSummary
                      ? (<><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Verificando...</>)
                      : (<><RefreshCw className="h-5 w-5 mr-2" /> Verificar agora</>)}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setCardVerifyOpen(false)}
                  disabled={loadingSummary}
                  className="h-10 w-full"
                >
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={cardConfirmOpen} onOpenChange={(open) => !processing && setCardConfirmOpen(open)}>
            <DialogContent className="max-w-sm rounded-2xl max-h-[90dvh] overflow-y-auto">

              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Confirmar pagamento
                </DialogTitle>
                <DialogDescription>
                  Revise os dados antes de processar a cobrança no cartão.
                </DialogDescription>
              </DialogHeader>

              {(() => {
                const isAnual = selectedPlan === "anual" || selectedPlan === "anual_12";
                const isBienal = selectedPlan === "anual_24";
                const total = isBienal ? 4317.84 : isAnual ? 2278.86 : 199.90;
                const parcelas = parseInt(cardFormData.installments || "1") || 1;
                const valorParcela = total / parcelas;
                const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const proxCobranca = new Date();
                if (isAnual) proxCobranca.setFullYear(proxCobranca.getFullYear() + 1);
                else proxCobranca.setMonth(proxCobranca.getMonth() + 1);
                const proxStr = proxCobranca.toLocaleDateString("pt-BR");

                return (
                  <div className="space-y-3 text-sm">
                    {/* Bloco: plano e cobrança */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Plano</span>
                        <span className="font-bold">{isAnual ? "Anual" : "Mensal"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Recorrência</span>
                        <span className="font-bold">{isAnual ? "Anual (1×/ano)" : "Mensal (1×/mês)"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Próxima cobrança</span>
                        <span className="font-bold">{proxStr}</span>
                      </div>
                      <div className="flex justify-between border-t border-primary/20 pt-1.5">
                        <span className="text-muted-foreground">Total agora</span>
                        <span className="font-bold text-base">{fmt(total)}</span>
                      </div>
                      {parcelas > 1 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Em {parcelas}x de</span>
                          <span className="font-semibold">{fmt(valorParcela)}</span>
                        </div>
                      )}
                    </div>

                    {/* Bloco: cartão */}
                    <div className="rounded-xl border bg-card p-3 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cartão</span>
                        <span className="font-mono font-bold">
                          •••• {cardFormData.cardNumber.replace(/\s/g, "").slice(-4) || "----"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Titular</span>
                        <span className="font-bold uppercase text-right break-words">
                          {cardFormData.cardholderName || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Bloco: regras de cancelamento */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                      <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Regras de cancelamento</p>
                      <ul className="space-y-1 list-disc pl-4">
                        <li>Contrato com vigência de <strong>12 meses</strong> e fidelidade mínima de <strong>24 meses</strong>.</li>
                        <li>Cancelamento antecipado: multa de <strong>50% das parcelas restantes</strong>.</li>
                        <li>Inadimplência por mais de <strong>15 dias</strong> suspende o acesso.</li>
                        <li>Renovação {isAnual ? "anual" : "mensal"} automática até cancelamento formal.</li>
                      </ul>
                    </div>

                    {/* Status do formulário seguro */}
                    <div className={`rounded-lg p-2 text-[11px] font-semibold ${
                      cardFormError
                        ? "bg-destructive/10 text-destructive"
                        : cardFormMounted
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {cardFormError
                        ? `⚠ Modo manual ativo: ${cardFormError}`
                        : cardFormMounted
                          ? "● Formulário seguro pronto. Tokenização será feita pelo Mercado Pago."
                          : "Aguardando montagem do formulário seguro…"}
                    </div>
                  </div>
                );
              })()}

              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  className="w-full rounded-xl h-12 font-bold bg-gradient-to-r from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)] text-[hsl(220,55%,15%)]"
                  disabled={processing}
                  onClick={() => {
                    setCardConfirmOpen(false);
                    handleCardPayment();
                  }}
                >
                  {processing ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                  )}
                  Confirmar e pagar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl h-11 font-semibold"
                  disabled={processing}
                  onClick={handleDownloadContractTextPdf}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF do contrato
                </Button>
                <Button
                  variant="ghost"
                  className="w-full rounded-xl h-10"
                  disabled={processing}
                  onClick={() => setCardConfirmOpen(false)}
                >
                  Revisar dados
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* O formulário de cartão local foi removido para evitar duplicidade de preenchimento,
              uma vez que o Checkout Pro do Mercado Pago já solicita esses dados com segurança. */}

          <p className="text-[10px] text-center text-muted-foreground pb-2">
            Pagamento seguro • Fidelidade mínima de 24 meses
          </p>
        </div>
      </div>
    );
  }



  // Step: Plans (default)
  return (
    <div className="relative h-dvh flex flex-col bg-gradient-to-b from-[hsl(220,55%,16%)] via-[hsl(220,50%,22%)] to-[hsl(220,55%,12%)] overflow-hidden">
      {/* Decorative glow blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 w-80 h-80 rounded-full bg-[hsl(45,95%,55%)]/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-[hsl(210,90%,55%)]/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-[hsl(280,70%,55%)]/15 blur-3xl" />

      <div className="relative flex-1 flex flex-col min-h-0">
        {renderHeader("Assinatura", "Escolha o melhor plano para sua escola", () =>
          navigate("/home")
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-lg mx-auto px-4 pt-20 pb-4 sm:pt-24 sm:pb-8 space-y-2.5 sm:space-y-5 motion-reduce:animate-none">
          {/* Hero */}
          <div
            className="text-center space-y-1 sm:space-y-2 animate-fade-in motion-reduce:animate-none will-change-[opacity,transform]"
            style={{ animationDuration: "500ms" }}
          >
            <div className="relative w-14 h-14 sm:w-20 sm:h-20 mx-auto animate-scale-in motion-reduce:animate-none" style={{ animationDelay: "80ms", animationFillMode: "backwards", animationDuration: "400ms" }}>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] via-[hsl(35,95%,50%)] to-[hsl(20,90%,45%)] blur-xl opacity-70" />
              <div className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] via-[hsl(35,95%,50%)] to-[hsl(20,90%,45%)] flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                <Crown className="h-8 w-8 sm:h-11 sm:w-11 text-white drop-shadow" />
              </div>
            </div>
            <div className="space-y-0.5 sm:space-y-1.5">
              <Badge className="bg-white/10 text-white/90 border border-white/15 backdrop-blur-md text-[10px] font-medium px-2.5 py-0.5">
                <Sparkles className="h-3 w-3 mr-1 text-[hsl(45,95%,65%)]" />
                Plataforma profissional
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight">
                Agendamento Escolar <span className="bg-gradient-to-r from-[hsl(45,95%,65%)] to-[hsl(35,95%,55%)] bg-clip-text text-transparent">Premium</span>
              </h2>
              <p className="text-[12px] sm:text-sm text-white/70 max-w-sm mx-auto leading-snug">
                Gerencie reservas, recursos e relatórios com a confiança de uma solução completa.
              </p>
            </div>
          </div>

          {/* Banner: assinatura ativa */}
          {isSubscriptionActive && (
            <div
              className="rounded-xl p-2.5 border border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 via-emerald-600/15 to-green-700/20 backdrop-blur-md shadow-md shadow-emerald-500/20 animate-fade-in"
              role="status"
            >
              <div className="flex items-center gap-2.5">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-md">
                  <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-extrabold text-[13px] leading-tight break-words">
                    Assinatura ativa
                    {currentSubscription?.endDate && (
                      <span className="text-emerald-100/90 font-semibold">
                        {" "}· até{" "}
                        {new Date(`${currentSubscription.endDate}T00:00:00`).toLocaleDateString("pt-BR")}
                        {subscriptionDaysLeft !== null && (
                          <> ({subscriptionDaysLeft}{subscriptionDaysLeft === 1 ? "d" : "d"})</>
                        )}
                      </span>
                    )}
                  </p>
                  <p className="text-white/70 text-[10px] leading-snug">
                    Não precisa contratar novamente — renove ou troque de plano abaixo se quiser.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Comparativo de valor vs mercado */}
          <ValueComparisonCard />

          {/* Seletor de forma de pagamento vinculada ao contrato */}
          <PaymentPlanSelector
            schoolId={profile?.school_id ?? foundSchool?.id ?? null}
            onChange={(planId, planName) => {
              setLockedPlanId(planId);
              if (planName) {
                setSelectedPlan(planName);
                setShowPlanError(false);
                setPlanMissingError(false);
              }
            }}
          />

          {/* Aviso central quando o usuário tenta mudar o plano travado */}
          <Dialog open={lockedHintOpen} onOpenChange={setLockedHintOpen}>
            <DialogContent className="sm:max-w-sm rounded-2xl">
              <DialogHeader>
                <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <DialogTitle className="text-center">Plano travado pelo contrato</DialogTitle>
                <DialogDescription className="text-center">
                  Para mudar o plano, altere a <strong>Forma de pagamento do contrato</strong> no topo desta página. O plano abaixo seguirá automaticamente essa escolha.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="sm:justify-center">
                <Button
                  type="button"
                  className="h-12 w-full font-bold"
                  onClick={() => {
                    setLockedHintOpen(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Ir para Forma de pagamento
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full font-bold"
                  onClick={() => setLockedHintOpen(false)}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Card: migração de plano (mensal -> anual à vista) */}
          {migrationQuote && migrationQuote.meses_pagos > 0 && (
            <MigrationQuoteCard
              quote={migrationQuote}
              loading={migrationLoading}
              onStartMigration={handleStartMigration}
            />
          )}

          {/* Benefits strip */}
          <div
            className="grid grid-cols-3 gap-2 mt-3 sm:mt-4 animate-fade-in motion-reduce:animate-none"
            style={{ animationDelay: "180ms", animationFillMode: "backwards", animationDuration: "500ms" }}
          >
            {[
              { icon: Zap, label: "Rápido", tint: "from-[hsl(210,90%,55%)] to-[hsl(220,85%,45%)]" },
              { icon: Shield, label: "Seguro", tint: "from-[hsl(150,70%,45%)] to-[hsl(160,75%,35%)]" },
              { icon: Sparkles, label: "Completo", tint: "from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)]" },
            ].map(({ icon: Icon, label, tint }) => (
              <div
                key={label}
                className="flex items-center justify-center gap-2 px-2 py-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 shadow-inner"
              >
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg shrink-0`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-[10px] font-semibold text-white/80 tracking-wide uppercase">{label}</span>
              </div>
            ))}
          </div>

          {/* Plans */}
          <div className="!mt-5 sm:!mt-6 space-y-5 sm:space-y-6">
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.name;
              const shouldShake = showPlanError && !isSelected;
              const showErrorHalo = showPlanError && !isSelected;
              return (
                <button
                  type="button"
                  key={plan.name}
                  ref={(el) => { planRefs.current[plan.name] = el; }}
                  onClick={() => {
                    if (lockedPlanId && plan.id !== lockedPlanId) {
                      setLockedHintOpen(true);
                      return;
                    }
                    setSelectedPlan(plan.name);
                    setShowPlanError(false);
                    setPlanMissingError(false);
                  }}
                  aria-pressed={isSelected}
                  className={`group relative block w-full text-left animate-fade-in motion-reduce:animate-none [@media(hover:hover)]:hover:-translate-y-0.5 transition-transform duration-300 will-change-[opacity,transform] focus-visible:outline-none ${
                    shouldShake ? (plan.highlight ? "animate-shake-x-strong" : "animate-shake-x") + " motion-reduce:animate-none" : ""
                  }`}
                  style={{ animationDelay: "300ms", animationFillMode: "backwards", animationDuration: "550ms" }}
                >
                  {/* Gradient border halo */}
                  <div
                    aria-hidden
                    className={`absolute -inset-[2px] rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] via-[hsl(35,95%,50%)] to-[hsl(20,90%,45%)] blur-[2px] transition-opacity ${
                      isSelected
                        ? "opacity-100"
                        : plan.highlight
                          ? "opacity-90 animate-glow-pulse motion-reduce:animate-none"
                          : "opacity-40"
                    }`}
                  />
                  {/* Error halo */}
                  {showErrorHalo && (
                    <div
                      aria-hidden
                      className={`absolute rounded-2xl bg-gradient-to-br from-[hsl(0,85%,60%)] to-[hsl(15,90%,50%)] animate-glow-pulse motion-reduce:animate-none ${
                        plan.highlight
                          ? "-inset-[4px] opacity-90 blur-[5px]"
                          : "-inset-[2px] opacity-60 blur-[2px]"
                      }`}
                    />
                  )}
                  {/* "Recomendado" ribbon */}
                  {plan.highlight && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-20">
                      <div className="px-3 py-0.5 rounded-full bg-gradient-to-r from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)] text-white text-[10px] font-bold tracking-wider uppercase shadow-lg shadow-amber-900/30 ring-2 ring-white/30 flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5" />
                        Recomendado
                      </div>
                    </div>
                  )}
                  <Card className={`relative overflow-hidden rounded-2xl border-0 shadow-2xl transition-all ${
                    isSelected
                      ? "ring-4 ring-[hsl(45,95%,55%)] bg-gradient-to-br from-[hsl(45,95%,55%)] via-[hsl(40,95%,50%)] to-[hsl(35,95%,45%)] scale-[1.02]"
                      : `bg-gradient-to-b from-white to-[hsl(220,30%,97%)] dark:from-[hsl(220,40%,18%)] dark:to-[hsl(220,45%,14%)] ${
                          plan.highlight ? "ring-2 ring-[hsl(45,95%,60%)]/40" : ""
                        }`
                  } group-focus-visible:ring-2 group-focus-visible:ring-amber-300/70`}>
                    <div aria-hidden className={`absolute -top-12 -right-12 w-40 h-40 rounded-full blur-2xl ${isSelected ? "bg-white/20" : "bg-[hsl(45,95%,55%)]/10"}`} />

                    {/* Selection check */}
                    <div className="absolute top-3 left-3 z-10">
                      <div className={`rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? "w-10 h-10 bg-white shadow-xl shadow-black/30 scale-100"
                          : "w-6 h-6 bg-muted border-2 border-border scale-90"
                      }`}>
                        {isSelected && <Check className="h-6 w-6 text-[hsl(35,95%,45%)]" strokeWidth={4} />}
                      </div>
                    </div>

                    {/* Faixa "SELECIONADO" bem visível */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 z-10">
                        <Badge className="text-[11px] bg-white text-[hsl(35,95%,40%)] border-0 shadow-lg px-3 py-1 font-extrabold tracking-wider uppercase">
                          ✓ Selecionado
                        </Badge>
                      </div>
                    )}

                    {!isSelected && plan.badge && (
                      <div className="absolute top-3 right-3 z-10">
                        <Badge className="text-[10px] bg-gradient-to-r from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)] text-white border-0 shadow-lg shadow-amber-900/20 px-2.5 py-1">
                          <Crown className="h-3 w-3 mr-1" />
                          {plan.badge}
                        </Badge>
                      </div>
                    )}

                    <CardHeader className="pb-2 pt-9 pl-16 pr-5 sm:pl-20 relative">
                      <CardTitle className={`text-sm font-semibold uppercase tracking-[0.12em] ${
                        isSelected ? "text-white/90" : "text-muted-foreground"
                      }`}>
                        Plano {plan.name}
                      </CardTitle>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className={`text-4xl font-extrabold font-display ${
                          isSelected
                            ? "text-white drop-shadow-md"
                            : "bg-gradient-to-br from-[hsl(220,60%,25%)] to-[hsl(220,80%,40%)] dark:from-white dark:to-[hsl(45,95%,75%)] bg-clip-text text-transparent"
                        }`}>
                          {plan.price}
                        </span>
                        <span className={`text-sm font-medium ${isSelected ? "text-white/90" : "text-muted-foreground"}`}>{plan.period}</span>
                      </div>
                      <p className={`text-[11px] mt-1 ${isSelected ? "text-white/85 font-semibold" : "text-muted-foreground"}`}>
                        {isSelected ? "Esta é a sua forma de pagamento escolhida" : plan.id === "mensal" ? "Cobrança mensal" : plan.id === "anual_12" ? "Pagamento único · 1 ano" : "Pagamento único · 2 anos"}
                      </p>
                    </CardHeader>

                    <CardContent className="px-5 pb-5 space-y-3 relative">
                      <div className={`h-px bg-gradient-to-r from-transparent ${isSelected ? "via-white/40" : "via-border"} to-transparent`} />
                      <ul className="space-y-2">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2.5 text-sm">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                              isSelected
                                ? "bg-white"
                                : "bg-gradient-to-br from-[hsl(150,70%,45%)] to-[hsl(160,75%,35%)]"
                            }`}>
                              <Check className={`h-3 w-3 ${isSelected ? "text-[hsl(35,95%,45%)]" : "text-white"}`} strokeWidth={3} />
                            </div>
                            <span className={`font-medium ${isSelected ? "text-white" : "text-foreground/90"}`}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>

          {/* Inline error message removido — feedback agora é no próprio botão (vermelho) */}
          </div>
        </div>

        {/* Sticky footer with continue button — always visible */}
        <div className="shrink-0 border-t border-white/10 bg-[hsl(220,55%,12%)]/85 backdrop-blur-md px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="max-w-lg mx-auto">
            <Button
              aria-disabled={!selectedPlan}
              title={!selectedPlan ? "Selecione um plano para continuar" : undefined}
              className={`group relative w-full rounded-xl text-sm h-12 font-bold shadow-lg [@media(hover:hover)]:hover:opacity-95 [@media(hover:hover)]:hover:shadow-xl [@media(hover:hover)]:hover:-translate-y-0.5 active:translate-y-0 active:animate-bounce-soft focus-visible:outline-none focus-visible:ring-2 motion-reduce:[@media(hover:hover)]:hover:translate-y-0 motion-reduce:active:animate-none transition-all border-0 overflow-hidden ${
                showPlanError
                  ? "bg-destructive hover:bg-destructive text-destructive-foreground shadow-red-900/30 focus-visible:ring-destructive/70"
                  : "bg-gradient-to-r from-[hsl(45,95%,55%)] via-[hsl(40,95%,50%)] to-[hsl(35,95%,45%)] text-white shadow-amber-900/20 focus-visible:ring-amber-300/70"
              } ${!selectedPlan && !showPlanError ? "opacity-70 [@media(hover:hover)]:hover:translate-y-0 [@media(hover:hover)]:hover:shadow-lg" : ""}`}
              onClick={() => {
                if (!selectedPlan) {
                  setShowPlanError(true);
                  // Auto-focus no primeiro plano (recomendado tem prioridade)
                  const firstPlan = PLANS.find((p) => p.highlight) ?? PLANS[0];
                  if (firstPlan) {
                    const el = planRefs.current[firstPlan.name];
                    el?.focus({ preventScroll: false });
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                  return;
                }
                setShowPlanError(false);
                handleSelectPlan();
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:animate-shine motion-reduce:[@media(hover:hover)]:group-hover:animate-none"
              />
              {showPlanError ? (
                <>
                  <AlertTriangle className="relative h-4 w-4 mr-1.5" />
                  <span className="relative">Selecione um plano para continuar</span>
                </>
              ) : (
                <>
                  <Crown className="relative h-4 w-4 mr-1.5" />
                  <span className="relative">Continuar</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-[360px] rounded-3xl p-0 overflow-hidden border-0 shadow-2xl">
          {/* Top gradient banner */}
          <div className="relative bg-gradient-to-br from-[hsl(220,60%,22%)] via-[hsl(220,55%,28%)] to-[hsl(220,65%,18%)] px-6 pt-6 pb-5">
            <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[hsl(45,95%,55%)]/25 blur-3xl" />
            <div aria-hidden className="absolute -bottom-10 -left-8 w-32 h-32 rounded-full bg-[hsl(210,90%,55%)]/25 blur-3xl" />
            <DialogHeader className="relative text-center space-y-3">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] to-[hsl(20,90%,45%)] blur-lg opacity-70" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(45,95%,60%)] to-[hsl(20,90%,45%)] flex items-center justify-center shadow-xl ring-2 ring-white/25">
                  <AlertTriangle className="h-8 w-8 text-white drop-shadow" strokeWidth={2.4} />
                </div>
              </div>
              <DialogTitle className="text-lg font-bold text-white tracking-tight">
                Aviso Importante
              </DialogTitle>
            </DialogHeader>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-3 bg-card">
            <DialogDescription className="text-base text-foreground/85 leading-relaxed">
              Este aplicativo é restrito a escolas de <strong className="text-foreground">ensino médio e fundamental</strong> das redes abaixo:
            </DialogDescription>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Municipal", tint: "from-[hsl(210,90%,55%)] to-[hsl(220,85%,45%)]" },
                { label: "Estadual", tint: "from-[hsl(150,70%,45%)] to-[hsl(160,75%,35%)]" },
                { label: "Federal", tint: "from-[hsl(45,95%,55%)] to-[hsl(35,95%,45%)]" },
                { label: "Particular", tint: "from-[hsl(280,70%,55%)] to-[hsl(310,75%,45%)]" },
              ].map((n) => (
                <div
                  key={n.label}
                  className={`rounded-xl bg-gradient-to-br ${n.tint} p-[1px] shadow-md`}
                >
                  <div className="rounded-[10px] bg-card px-2 py-3 text-center">
                    <span className="text-base font-bold text-foreground tracking-wide">{n.label}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-base font-semibold text-foreground text-center pt-1">
              Deseja prosseguir com a assinatura?
            </p>
          </div>

          <DialogFooter className="flex-row gap-2 sm:flex-row px-6 pb-6 pt-0 bg-card">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-11 text-sm font-semibold"
              onClick={() => setShowConfirmDialog(false)}
            >
              Sair
            </Button>
            <Button
              className="flex-1 rounded-xl h-11 text-sm font-bold bg-gradient-to-r from-[hsl(45,95%,55%)] via-[hsl(40,95%,50%)] to-[hsl(35,95%,45%)] text-white shadow-lg shadow-amber-900/20 hover:opacity-95 border-0"
              onClick={handleConfirmContinue}
            >
              <Crown className="h-4 w-4 mr-1" />
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sandbox Failure Dialog — explica que o checkout TEST exige dados oficiais */}
      <Dialog
        open={showSandboxFailure}
        onOpenChange={(o) => {
          if (!o) {
            setShowSandboxFailure(false);
            try {
              sessionStorage.removeItem("mp_sandbox");
            } catch {
              /* ignore */
            }
          }
        }}
      >
        <DialogContent className="max-w-[380px] rounded-2xl">
          <DialogHeader className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/15 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-base">
              Pagamento de teste não concluído
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Você está em ambiente <span className="font-semibold">sandbox do Mercado Pago</span>.
              O checkout só aceita dados de teste oficiais — cartões reais ou contas pessoais
              do MP são recusados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-xs">
            <div className="rounded-lg border border-border bg-secondary/40 p-2.5 space-y-1.5">
              <p className="font-bold text-[11px] uppercase tracking-wide text-muted-foreground">
                Cartão de teste (aprovado)
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">Número</span>
                <span className="font-mono font-semibold">5031 4332 1540 6351</span>
                <span className="text-muted-foreground">Nome</span>
                <span className="font-mono font-semibold">APRO</span>
                <span className="text-muted-foreground">Validade</span>
                <span className="font-mono font-semibold">11/30</span>
                <span className="text-muted-foreground">CVV</span>
                <span className="font-mono font-semibold">123</span>
                <span className="text-muted-foreground">CPF</span>
                <span className="font-mono font-semibold">12345678909</span>
              </div>
            </div>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
              <li>Não use sua conta vendedora — abra uma janela anônima.</li>
              <li>Use um e-mail diferente do cadastrado no MP.</li>
              <li>Para PIX/Boleto, aprove manualmente no painel sandbox.</li>
            </ul>
          </div>

          <DialogFooter className="flex-row gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-9 text-xs"
              onClick={() => {
                setShowSandboxFailure(false);
                try {
                  sessionStorage.removeItem("mp_sandbox");
                } catch {
                  /* ignore */
                }
              }}
            >
              Fechar
            </Button>
            <Button
              className="flex-1 rounded-xl h-9 text-xs"
              onClick={() => {
                setShowSandboxFailure(false);
                try {
                  sessionStorage.removeItem("mp_sandbox");
                } catch {
                  /* ignore */
                }
                // Garante que parâmetros ?mp=failure sejam removidos antes de
                // iniciar uma nova preferência de pagamento.
                if (window.location.search) {
                  window.history.replaceState({}, "", "/subscription");
                }
                handlePayment();
              }}
              disabled={processing}
            >
              Tentar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Congrats Dialog — fired after successful subscription activation */}
      <Dialog open={showCongrats} onOpenChange={(o) => { if (!o) { setShowCongrats(false); setPaymentSummary(null); navigate("/home"); } }}>
        <DialogContent className="max-w-[360px] rounded-2xl">
          <DialogHeader className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto shadow-lg">
              <Crown className="h-8 w-8 text-primary-foreground" />
            </div>
            <DialogTitle className="text-lg font-bold">
              🎉 Parabéns, {profile?.full_name?.split(" ")[0] || "Gestor(a)"}!
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground/90 leading-relaxed text-left space-y-3">
              <p>
                A sua escola agora faz parte do <strong>Agendamento de Ambiente Escolar PRO</strong> —
                um produto pensado para trazer <strong>organização, transparência e qualidade</strong>
                ao dia a dia da sua equipe pedagógica.
              </p>
              <p>
                A partir de agora, <strong>professores, coordenadores e demais colaboradores</strong>{" "}
                da sua escola já podem se cadastrar no aplicativo e usar todos os recursos sem
                restrições. <strong>Avise a equipe</strong> para que todos aproveitem e facilitem
                a rotina escolar! 💙
              </p>
              <p className="text-xs text-muted-foreground">
                Compartilhe o link do app com os colaboradores e oriente cada um a selecionar a sua
                escola no cadastro.
              </p>

              {(loadingSummary || paymentSummary || schoolSummary || summaryPending) && (
                <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  {!summaryPending && (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      <p className="text-sm font-bold text-foreground">Resumo da transação</p>
                    </div>
                  )}

                  {loadingSummary && !paymentSummary && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Confirmando pagamento com o Mercado Pago…
                      </div>
                      {pollStartedAt && (
                        <p className="text-[10px] text-muted-foreground/80 pl-5">
                          Aguardando há {fmtDuration(elapsedMs)} · estimativa restante até{" "}
                          {fmtDuration(remainingMs)}
                        </p>
                      )}
                    </div>
                  )}

                  {paymentSummary && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-muted-foreground">Valor</span>
                      <span className="text-right font-semibold text-foreground">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: paymentSummary.currency || "BRL",
                        }).format(paymentSummary.amount)}
                      </span>

                      <span className="text-muted-foreground">Método</span>
                      <span className="text-right font-medium text-foreground capitalize">
                        {paymentSummary.payment_type_id?.replace("_", " ") || "—"}
                        {paymentSummary.payment_method_id
                          ? ` · ${paymentSummary.payment_method_id}`
                          : ""}
                      </span>

                      <span className="text-muted-foreground">Status</span>
                      <span className="text-right font-semibold text-emerald-600">
                        Aprovado
                      </span>

                      {paymentSummary.date_approved && (
                        <>
                          <span className="text-muted-foreground">Data</span>
                          <span className="text-right text-foreground">
                            {new Date(paymentSummary.date_approved).toLocaleString("pt-BR")}
                          </span>
                        </>
                      )}

                      <span className="text-muted-foreground">ID</span>
                      <span className="text-right font-mono text-[10px] text-foreground break-all">
                        {String(paymentSummary.id)}
                      </span>
                    </div>
                  )}

                  {schoolSummary?.subscription_end_date && (
                    <div className="mt-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2">
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                        Assinatura ativa até{" "}
                        {new Date(
                          `${schoolSummary.subscription_end_date}T00:00:00`,
                        ).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  )}

                  {summaryPending && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-foreground">
                            Estamos confirmando seu pagamento
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Recebemos seu retorno do Mercado Pago, mas a confirmação ainda
                            não chegou ao nosso sistema. Isso costuma levar alguns minutos —
                            principalmente em pagamentos via PIX ou boleto.
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            <strong>O que fazer:</strong> aguarde alguns instantes e atualize
                            esta página. Assim que o pagamento for confirmado, sua assinatura
                            será ativada automaticamente.
                          </p>
                        </div>
                      </div>

                      {pollStartedAt && (
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="font-semibold">Aguardando há {fmtDuration(elapsedMs)}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {remainingMs > 0
                              ? `Estimativa: até ${fmtDuration(remainingMs)} restantes`
                              : "Tempo esgotado — contate o suporte"}
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          variant="outline"
                          className="rounded-xl h-9 text-xs"
                          onClick={() => startPolling()}
                          disabled={loadingSummary}
                        >
                          <Loader2
                            className={`h-3.5 w-3.5 mr-1.5 ${loadingSummary ? "animate-spin" : ""}`}
                          />
                          Atualizar agora
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl h-9 text-xs"
                          onClick={() =>
                            window.open(
                              buildWhatsappUrl(
                                `Olá! Acabei de pagar a assinatura do Agendamento Escolar via Mercado Pago, mas o sistema ainda não confirmou.\n\n` +
                                  `📌 Escola: ${foundSchool?.name || profile?.school_id || "N/A"}\n` +
                                  `📧 E-mail: ${formData.email || user?.email || "N/A"}`,
                              ),
                              "_blank",
                            )
                          }
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                          Falar com suporte
                        </Button>
                      </div>
                    </div>
                  )}

                  {!loadingSummary && !paymentSummary && !summaryPending && (
                    <p className="text-[11px] text-muted-foreground">
                      Pagamento em processamento. A confirmação chegará em instantes — você pode
                      fechar esta tela com segurança.
                    </p>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full rounded-xl h-11 font-semibold"
              onClick={() => { setShowCongrats(false); navigate("/home"); }}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Começar a usar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: PIX de migração de plano */}
      <Dialog open={migrationDialogOpen} onOpenChange={(o) => { if (!migrationLoading) setMigrationDialogOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Migração para anual à vista</DialogTitle>
            <DialogDescription>
              {migrationQuote && (
                <>
                  {migrationQuote.meses_restantes} {migrationQuote.meses_restantes === 1 ? "mês" : "meses"} {migrationQuote.meses_restantes === 1 ? "restante" : "restantes"} ·{" "}
                  <strong>
                    {migrationQuote.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {migrationLoading || !migrationPix ? (
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            ) : (
              <>
                {migrationPix.qr_code_base64 && (
                  <img
                    src={`data:image/png;base64,${migrationPix.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-56 h-56 rounded-lg border"
                  />
                )}
                {migrationPix.qr_code && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      navigator.clipboard.writeText(migrationPix.qr_code ?? "");
                      toast.success("Código PIX copiado");
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Copiar código PIX
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground text-center">
                  Após o pagamento, sua assinatura é estendida automaticamente.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMigrationDialogOpen(false)} disabled={migrationLoading}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Subscription;

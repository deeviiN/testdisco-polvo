import { useState, useEffect, useRef } from "react";
import { getSignedSignatureUrl } from "@/lib/signatureUrl";
import { useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, Camera, User, Mail, Phone, School, Shield,
  FileText, Loader2, Sparkles, Trash2, CheckCircle, Fingerprint, Upload, Save,
  ArrowRightLeft, Lock, X as XIcon, Info, History, Clock,
} from "lucide-react";
import { isBiometricPlatformAvailable, registerBiometric } from "@/lib/webauthn";
import MsnChatIcon from "@/components/MsnChatIcon";
import { SchoolSearch } from "@/components/SchoolSearch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  addProfileHistoryEntry,
  clearProfileHistory,
  getProfileHistory,
  PROFILE_HISTORY_EVENT,
  type ProfileChangeEntry,
} from "@/lib/profileChangeHistory";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Professor(a)",
  coord_pedagogico: "Coordenador(a) Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  gestor_pedagogico: "Gestão Pedagógica / Administrativo",
  secretario_escolar: "Assistente de Aluno",
  chef_projeto_vida: "Coord. da Sala de Vídeo",
};

export default function ProfileReview() {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const { user, profile, refreshProfile } = useAuth();
  const [schoolName, setSchoolName] = useState("");
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricRegistered, setBiometricRegistered] = useState(false);
  const [registeringBiometric, setRegisteringBiometric] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const signatureUploadRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Editable form fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [history, setHistory] = useState<ProfileChangeEntry[]>([]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setGender(profile.gender || "");
    }
  }, [profile]);

  // Load + subscribe to profile change history
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => setHistory(getProfileHistory(user.id));
    refresh();
    window.addEventListener(PROFILE_HISTORY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PROFILE_HISTORY_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [user?.id]);

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const isDirty =
    !!profile &&
    (fullName.trim() !== (profile.full_name || "") ||
      phone.trim() !== (profile.phone || "") ||
      (gender || "") !== (profile.gender || ""));

  const handleSaveProfile = async () => {
    if (!user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    if (!isDirty) {
      toast.info("Nenhuma alteração para salvar.");
      return;
    }

    const trimmedName = fullName.trim();
    if (trimmedName.length < 3) {
      toast.error("Nome inválido", { description: "Informe seu nome completo (mín. 3 caracteres)." });
      return;
    }
    if (trimmedName.length > 120) {
      toast.error("Nome muito longo", { description: "Use no máximo 120 caracteres." });
      return;
    }
    if (!/^[\p{L}\s'.-]+$/u.test(trimmedName)) {
      toast.error("Nome inválido", { description: "Use apenas letras, espaços, hífen ou apóstrofo." });
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits && (digits.length < 10 || digits.length > 11)) {
      toast.error("Telefone inválido", { description: "Use o formato (DD) 9XXXX-XXXX." });
      return;
    }
    if (gender && !["masculino", "feminino", "outro"].includes(gender)) {
      toast.error("Gênero inválido.");
      return;
    }

    const loadingId = toast.loading("Salvando alterações...");
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedName,
          phone: phone.trim() || null,
          gender: gender || null,
        })
        .eq("user_id", user.id);

      if (error) {
        const msg = error.message?.toLowerCase() || "";
        if (msg.includes("row-level security") || msg.includes("permission")) {
          toast.error("Sem permissão para alterar estes dados.", {
            id: loadingId,
            description: "Função, status e escola só podem ser alterados por um administrador.",
          });
        } else {
          toast.error("Não foi possível salvar.", { id: loadingId, description: error.message });
        }
        return;
      }
      toast.success("Dados atualizados com sucesso!", {
        id: loadingId,
        description: "Suas informações foram salvas no servidor.",
      });
      if (trimmedName !== (profile?.full_name || "")) {
        addProfileHistoryEntry(user.id, {
          field: "name",
          from: profile?.full_name || "",
          to: trimmedName,
          status: "approved",
        });
      }
      await refreshProfile();
    } catch (e: any) {
      toast.error("Erro inesperado ao salvar.", {
        id: loadingId,
        description: e?.message || "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // ===== School transfer request =====
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetSchool, setTargetSchool] = useState<any>(null);
  const [requestedRole, setRequestedRole] = useState("teacher");
  const [transferReason, setTransferReason] = useState("");
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [pendingTargetName, setPendingTargetName] = useState<string>("");

  const loadPendingRequest = async () => {
    if (!user?.id) return;
    const { data, error } = await (supabase as any)
      .from("school_transfer_requests")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (error) {
      toast.error("Erro ao carregar solicitação de transferência.", { description: error.message });
      return;
    }
    const row: any = data || null;
    setPendingRequest(row);
    if (row?.to_school_id) {
      const { data: sch, error: schErr } = await (supabase as any).rpc("get_school_public_info", { _school_id: row.to_school_id });
      if (schErr) {
        toast.error("Erro ao carregar dados da escola de destino.", { description: schErr.message });
        setPendingTargetName("");
        return;
      }
      setPendingTargetName(sch?.[0]?.name || "");
    } else {
      setPendingTargetName("");
    }
  };

  useEffect(() => {
    loadPendingRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const submitTransferRequest = async () => {
    if (!user?.id || !profile?.school_id) return;
    if (!targetSchool?.id) {
      toast.error("Selecione a escola de destino.");
      return;
    }
    if (targetSchool.id === profile.school_id) {
      toast.error("A escola de destino deve ser diferente da atual.");
      return;
    }
    if (!["teacher", "coord_pedagogico", "supervisor", "secretario_escolar"].includes(requestedRole)) {
      toast.error("Cargo solicitado inválido.");
      return;
    }
    if (transferReason.length > 500) {
      toast.error("Motivo muito longo (máx. 500 caracteres).");
      return;
    }

    const loadingId = toast.loading("Enviando solicitação...");
    setSubmittingTransfer(true);
    try {
      const { error } = await (supabase as any).from("school_transfer_requests").insert({
        user_id: user.id,
        from_school_id: profile.school_id,
        to_school_id: targetSchool.id,
        requested_role: requestedRole,
        reason: transferReason.trim() || null,
        status: "pending",
      });
      if (error) {
        const msg = error.message?.toLowerCase() || "";
        if (msg.includes("uniq_pending_per_user") || msg.includes("duplicate")) {
          toast.error("Você já tem uma solicitação pendente.", { id: loadingId });
        } else {
          toast.error("Não foi possível enviar.", { id: loadingId, description: error.message });
        }
        return;
      }
      toast.success("Solicitação enviada!", {
        id: loadingId,
        description: "O gestor da nova escola receberá seu pedido.",
      });
      setTransferOpen(false);
      setTargetSchool(null);
      setRequestedRole("teacher");
      setTransferReason("");
      loadPendingRequest();
    } catch (e: any) {
      toast.error("Erro inesperado.", { id: loadingId, description: e?.message });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const cancelTransferRequest = async () => {
    if (!pendingRequest?.id) return;
    if (!confirm("Cancelar sua solicitação de transferência?")) return;
    const loadingId = toast.loading("Cancelando...");
    const { error } = await (supabase as any)
      .from("school_transfer_requests")
      .update({ status: "cancelled" })
      .eq("id", pendingRequest.id);
    if (error) {
      toast.error("Erro ao cancelar.", { id: loadingId, description: error.message });
      return;
    }
    toast.success("Solicitação cancelada.", { id: loadingId });
    loadPendingRequest();
  };

  // Check biometric
  useEffect(() => {
    isBiometricPlatformAvailable().then(setBiometricAvailable);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("webauthn_credentials" as any).select("id").eq("user_id", user.id).then(({ data }: any) => {
      setBiometricRegistered(!!(data && data.length > 0));
    });
  }, [user]);

  const canHaveSignature =
    profile?.role === "gestor_pedagogico" ||
    profile?.role === "coord_pedagogico" ||
    profile?.role === "supervisor" ||
    profile?.role === "chef_projeto_vida";

  // Redirect if not logged in
  useEffect(() => {
    if (!user) navigate("/auth", { replace: true });
  }, [user, navigate]);

  // Load school info
  useEffect(() => {
    if (!profile?.school_id) return;
    supabase
      .from("schools")
      .select("name, logo_url")
      .eq("id", profile.school_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSchoolName(data.name);
          setSchoolLogo((data as any).logo_url || null);
        }
      });
  }, [profile?.school_id]);

  // Load signature
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("signature_url")
      .eq("user_id", user.id)
      .single()
      .then(async ({ data }) => {
        const storedUrl = (data as any)?.signature_url;
        if (storedUrl) {
          const signedUrl = await getSignedSignatureUrl(storedUrl);
          setSignatureUrl(signedUrl);
        }
      });
  }, [user?.id]);

  const handleSignatureCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }

    setProcessing(true);
    try {
      toast.info("🤖 Processando assinatura com IA...", { duration: 10000, id: "sig-processing" });

      // Load image into canvas for background removal
      const imgUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imgUrl;
      });

      // Canvas-based background removal (white/light pixels → transparent)
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(imgUrl);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const threshold = 200; // pixels brighter than this become transparent

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const brightness = (r + g + b) / 3;
        if (brightness > threshold) {
          data[i + 3] = 0; // make transparent
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );
      const processedFile = new File([blob], "signature.png", { type: "image/png" });

      toast.dismiss("sig-processing");
      await uploadSignature(processedFile);
      toast.success("✅ Assinatura processada e salva com fundo transparente!");
    } catch (err) {
      console.error(err);
      toast.dismiss("sig-processing");
      toast.error("Erro ao processar assinatura. Enviando original...");
      await uploadSignature(file);
    } finally {
      setProcessing(false);
      if (signatureInputRef.current) signatureInputRef.current.value = "";
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    await processSignatureFile(file);
  };

  const processSignatureFile = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      toast.error("Envie um arquivo PNG ou JPG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }
    try {
      await uploadSignature(file);
    } finally {
      if (signatureUploadRef.current) signatureUploadRef.current.value = "";
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (!user?.id) return;
    
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    const file = files[0];
    await processSignatureFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const uploadSignature = async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/signature.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        toast.error("Erro ao enviar assinatura: " + uploadError.message);
        return;
      }
      // Store the path (not public URL) in the database
      const sigPath = path;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ signature_url: sigPath } as any)
        .eq("user_id", user.id);
      if (updateError) {
        toast.error("Erro ao salvar: " + updateError.message);
        return;
      }
      // Get signed URL for display (with cache-buster to force refresh)
      const signedUrl = await getSignedSignatureUrl(sigPath);
      setSignatureUrl(signedUrl ? `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}t=${Date.now()}` : null);
      if (!processing) toast.success("Assinatura salva! ✅");
    } catch {
      toast.error("Erro inesperado.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveSignature = async () => {
    if (!user?.id || !confirm("Tem certeza que deseja remover sua assinatura?")) return;
    setUploading(true);
    try {
      await supabase
        .from("profiles")
        .update({ signature_url: null } as any)
        .eq("user_id", user.id);
      setSignatureUrl(null);
      toast.success("Assinatura removida.");
    } catch {
      toast.error("Erro ao remover assinatura.");
    } finally {
      setUploading(false);
    }
  };

  if (!user || !profile) return null;

  const userEmail = user.email || "";

  return (
    <div className="min-h-dvh bg-background pb-4">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/40 px-4 py-2 flex items-center gap-3">
        <button
          onClick={goBack}
          className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center text-foreground/70 hover:bg-muted transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold font-display">Meu Cadastro</h1>
          <p className="text-[10px] text-muted-foreground">Dados e segurança</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/messages")}
          title="Conversar com colegas da escola"
          aria-label="Conversar com colegas da escola"
          className="w-9 h-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition flex items-center justify-center"
        >
          <MsnChatIcon size={22} spinSeconds={4} />
        </button>
      </div>

      <div className="px-3 pt-3 space-y-3 max-w-md mx-auto">
        {/* School Card */}
        <Card className="border-border/40 shadow-card overflow-hidden">
          <div className="bg-primary/5 px-3 py-2 flex items-center gap-2.5">
            {schoolLogo ? (
              <img src={schoolLogo} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <School className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold leading-snug break-words">{schoolName || "Escola"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Escola vinculada</p>
            </div>
          </div>
        </Card>

        {/* Profile Data Card - editable */}
        <Card className="border-border/40 shadow-card">
          <CardContent className="p-3 space-y-3">
            <h2 className="text-xs font-bold flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" />
              Dados Pessoais
            </h2>

            <div className="space-y-2.5">
              {/* Nome - editável */}
              <div className="space-y-1">
                <Label htmlFor="full_name" className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Nome completo
                </Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  maxLength={120}
                  className="h-10 text-sm rounded-lg"
                />
              </div>

              {/* Email - read-only */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <div className="h-10 px-3 flex items-center rounded-lg bg-muted/40 text-xs font-medium truncate">
                  {userEmail}
                </div>
              </div>

              {/* Telefone - editável */}
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Telefone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(11) 92568-6565"
                  className="h-10 text-sm rounded-lg"
                />
              </div>

              {/* Gênero - editável */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Gênero
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { v: "masculino", l: "Masculino" },
                    { v: "feminino", l: "Feminino" },
                    { v: "outro", l: "Outro" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setGender(opt.v)}
                      className={`h-9 rounded-lg text-[11px] font-medium border transition-all ${
                        gender === opt.v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/30 border-border/40 text-foreground/70 hover:bg-muted/60"
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Função e Status - read-only */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 relative">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1">
                      Função <Lock className="h-2.5 w-2.5" />
                    </p>
                    <p className="text-[11px] font-medium truncate">{ROLE_LABELS[profile.role] || profile.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <CheckCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Status</p>
                    <p className={`text-[11px] font-medium ${profile.is_approved ? "text-green-600" : "text-amber-500"}`}>
                      {profile.is_approved ? "Aprovado" : "Pendente"}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground flex items-start gap-1 -mt-1 px-1">
                <Info className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                Para alterar sua função, solicite ao administrador. A escola pode ser trocada via solicitação de transferência abaixo.
              </p>

              {/* Save button */}
              <Button
                onClick={handleSaveProfile}
                disabled={!isDirty || savingProfile}
                className="w-full h-11 rounded-xl gap-2 font-bold mt-1 bg-gradient-to-r from-primary to-primary/80"
              >
                {savingProfile ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="h-4 w-4" /> Salvar alterações</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* School Transfer Card */}
        <Card className="border-border/40 shadow-card">
          <CardContent className="p-3 space-y-2">
            <h2 className="text-xs font-bold flex items-center gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
              Mudar de escola
            </h2>

            {pendingRequest ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400">Solicitação pendente</p>
                  <p className="text-xs font-medium mt-0.5 break-words">
                    Para: <span className="font-bold">{pendingTargetName || "—"}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Cargo solicitado: {ROLE_LABELS[pendingRequest.requested_role] || pendingRequest.requested_role}
                  </p>
                  {pendingRequest.reason && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic">"{pendingRequest.reason}"</p>
                  )}
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Enviada em {new Date(pendingRequest.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Button
                  onClick={cancelTransferRequest}
                  variant="outline"
                  className="w-full h-9 rounded-lg gap-1.5 text-xs"
                >
                  <XIcon className="h-3.5 w-3.5" /> Cancelar solicitação
                </Button>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Solicite a transferência para outra escola. O gestor da escola de destino aprovará seu pedido e definirá seu novo cargo.
                </p>
                <Button
                  onClick={() => setTransferOpen(true)}
                  className="w-full h-10 rounded-xl gap-2 text-xs bg-gradient-to-r from-primary to-primary/80"
                >
                  <ArrowRightLeft className="h-4 w-4" /> Solicitar transferência
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Profile Change History */}
        <Card className="border-border/40 shadow-card">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-primary" />
                Histórico de alterações
              </h2>
              {history.length > 0 && (
                <button
                  onClick={() => {
                    if (!user?.id) return;
                    if (confirm("Limpar todo o histórico de alterações deste dispositivo?")) {
                      clearProfileHistory(user.id);
                    }
                  }}
                  className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">
                Nenhuma alteração de nome ou cargo registrada ainda.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                {history.map((h) => {
                  const labelFor = (v: string) =>
                    h.field === "role" ? ROLE_LABELS[v] || v : v || "—";
                  const statusMeta =
                    h.status === "approved"
                      ? { text: "Aprovado", cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30" }
                      : h.status === "pending"
                      ? { text: "Pendente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" }
                      : { text: "Sessão", cls: "bg-primary/10 text-primary border-primary/30" };
                  return (
                    <li
                      key={h.id}
                      className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          {h.field === "name" ? "Nome" : "Cargo"}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${statusMeta.cls}`}
                        >
                          {statusMeta.text}
                        </span>
                      </div>
                      <p className="text-[11px] mt-1 break-words leading-snug">
                        <span className="text-muted-foreground line-through">{labelFor(h.from)}</span>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span className="font-semibold">{labelFor(h.to)}</span>
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(h.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>


        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" /> Solicitar transferência
              </DialogTitle>
              <DialogDescription className="text-xs">
                Sua escola atual: <strong>{schoolName}</strong>. Após aprovação, seu cadastro ficará pendente na nova escola.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Escola de destino
                </Label>
                <SchoolSearch onSelect={(s) => setTargetSchool(s)} selected={targetSchool} />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Cargo solicitado
                </Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { v: "teacher", l: "Professor(a)" },
                    { v: "coord_pedagogico", l: "Coord. Pedagógico" },
                    { v: "supervisor", l: "Corpo de Alunos C.A" },
                    { v: "secretario_escolar", l: "Assistente" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setRequestedRole(opt.v)}
                      className={`h-10 rounded-lg text-[11px] font-medium border transition-all px-2 ${
                        requestedRole === opt.v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/30 border-border/40 text-foreground/70 hover:bg-muted/60"
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground">
                  Para virar Gestão Pedagógica ou Chef da Sala, o admin global precisa promover após aprovação.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Motivo (opcional)
                </Label>
                <Textarea
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Conte brevemente o motivo da transferência"
                  maxLength={500}
                  className="text-xs min-h-[70px]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setTransferOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={submitTransferRequest}
                disabled={submittingTransfer || !targetSchool}
                className="flex-1 bg-gradient-to-r from-primary to-primary/80"
              >
                {submittingTransfer ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : "Enviar solicitação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {biometricAvailable && (
          <Card className="border-border/40 shadow-card">
            <CardContent className="p-3 space-y-2">
              <h2 className="text-xs font-bold flex items-center gap-1.5">
                <Fingerprint className="h-3.5 w-3.5 text-primary" />
                Login Biométrico
              </h2>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {biometricRegistered
                  ? "Impressão digital cadastrada ✓"
                  : "Cadastre para login rápido e seguro."}
              </p>
              <Button
                onClick={async () => {
                  setRegisteringBiometric(true);
                  const success = await registerBiometric("Dispositivo principal");
                  if (success) setBiometricRegistered(true);
                  setRegisteringBiometric(false);
                }}
                disabled={registeringBiometric}
                className="w-full rounded-xl h-10 gap-2 text-xs bg-gradient-to-r from-primary to-primary/80"
              >
                {registeringBiometric ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Cadastrando...</>
                ) : (
                  <><Fingerprint className="h-4 w-4" /> {biometricRegistered ? "Recadastrar" : "Cadastrar Impressão Digital"}</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Signature Card */}
        {canHaveSignature && (
          <Card className="border-border/40 shadow-card">
            <CardContent className="p-3 space-y-2">
              <h2 className="text-xs font-bold flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Assinatura Digital
              </h2>
              <p className="text-[10px] text-muted-foreground">
                Escaneie sua assinatura. A IA removerá o fundo automaticamente.
              </p>

              {signatureUrl ? (
                <div
                  ref={dropZoneRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`relative p-3 rounded-xl bg-white border-2 flex items-center justify-center transition-all ${
                    isDragOver 
                      ? "border-primary bg-primary/5 border-dashed" 
                      : "border-border/40"
                  }`}
                >
                  <img
                    src={signatureUrl}
                    alt="Assinatura atual"
                    className="max-h-20 max-w-full object-contain"
                    style={{ background: "repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%) 50% / 16px 16px" }}
                  />
                  {isDragOver && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-xl">
                      <p className="text-xs font-medium text-primary">Solte para substituir</p>
                    </div>
                  )}
                  <button
                    onClick={handleRemoveSignature}
                    disabled={uploading}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-all"
                    title="Remover assinatura"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  ref={dropZoneRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`p-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all min-h-[100px] ${
                    isDragOver 
                      ? "border-primary bg-primary/5" 
                      : "border-border/40 bg-muted/30"
                  }`}
                >
                  <Upload className={`h-6 w-6 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                  <p className={`text-xs text-center ${isDragOver ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {isDragOver ? "Solte a imagem aqui" : "Arraste e solte sua assinatura aqui"}
                  </p>
                </div>
              )}

              <input
                ref={signatureInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleSignatureCapture}
              />

              <input
                ref={signatureUploadRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleSignatureUpload}
              />

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  onClick={() => signatureInputRef.current?.click()}
                  disabled={processing || uploading}
                  className="rounded-xl h-10 gap-1.5 text-[11px] bg-gradient-to-r from-primary to-primary/80"
                >
                  {processing ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> IA...</>
                  ) : (
                    <><Camera className="h-3.5 w-3.5" /> Escanear</>
                  )}
                </Button>
                <Button
                  onClick={() => signatureUploadRef.current?.click()}
                  disabled={processing || uploading}
                  variant="outline"
                  className="rounded-xl h-10 gap-1.5 text-[11px]"
                >
                  {uploading && !processing ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5" /> Enviar PNG/JPG</>
                  )}
                </Button>
              </div>
              <p className="text-[9px] text-muted-foreground text-center leading-tight">
                Escanear: remove o fundo via IA · Enviar: usa a imagem como está (ideal para PNG transparente)
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info for non-authorized roles */}
        {!canHaveSignature && (
          <Card className="border-border/40 shadow-card">
            <CardContent className="p-3">
              <div className="flex items-start gap-2.5">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium">Assinatura Digital</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Disponível para Gestão Pedagógica, Coord. Pedagógica, C.A e Chef da Sala.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

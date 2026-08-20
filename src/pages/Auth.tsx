import { useState, useEffect, useRef, useCallback } from "react";
import { toProperCase } from "@/lib/properCase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { isBiometricPlatformAvailable, authenticateWithBiometric } from "@/lib/webauthn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import {
  CalendarDays, LogIn, Sparkles, ArrowLeft, KeyRound, Mail, MessageCircle, Headphones,
  Search, MapPin, X, ChevronDown, Building2, GraduationCap, Phone, UserCheck,
  ArrowRight, ChevronLeft, Navigation, ExternalLink, Eye, EyeOff, User, Camera, FileText, Check,
  Fingerprint, Settings, Globe, Sun, Moon, Palette, ShieldAlert, Shield, Lightbulb
} from "lucide-react";
import OctopusMascot from "@/components/OctopusMascot";
import AppearanceSettings from "@/components/AppearanceSettings";
import VersionFooter from "@/components/VersionFooter";
import AppBreadcrumbs from "@/components/AppBreadcrumbs";
import { PasswordStrength, isPasswordValid } from "@/components/PasswordStrength";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { languageLabels, Language } from "@/lib/translations";
import { useSectorPreferences, type ColorOption } from "@/hooks/useSectorPreferences";
import {
  allowedRoleSchema,
  isAllowedRole,
  roleLabel,
  SIGNUP_ROLES,
  SIGNUP_OUTER_ROLES,
  SIGNUP_CENTER_ROLE,
} from "@/lib/allowedRoles";


// Estilo de botão idêntico aos setores (copiado de QuadraBooking)
function sectorButtonStyle(c: ColorOption, isSelected: boolean): React.CSSProperties {
  const background = isSelected
    ? `radial-gradient(circle at 30% 25%, hsla(${c.hueA}, ${c.satA + 10}%, ${c.lightA + 12}%, 1) 0%, hsla(${c.hueB}, ${c.satB + 5}%, ${c.lightB + 6}%, 1) 60%, hsla(${c.hueC}, ${c.satC + 10}%, ${c.lightC + 4}%, 1) 100%)`
    : `linear-gradient(145deg, hsla(${c.hueA}, ${c.satA}%, ${c.lightA}%, 1), hsla(${c.hueB}, ${c.satB}%, ${c.lightB}%, 1))`;
  const boxShadow = isSelected
    ? `0 0 0 3px hsla(${c.hueA}, 95%, 75%, 1), 0 0 30px hsla(${c.hueA}, 90%, 60%, 0.85), 0 0 60px hsla(${c.hueA}, 85%, 55%, 0.6), 0 6px 20px hsla(${c.hueC}, 70%, 10%, 0.6)`
    : `inset 0 1.5px 5px hsla(${c.hueA}, 90%, 75%, 0.35), inset 0 -2px 8px hsla(${c.hueC}, 85%, 5%, 0.55), 0 0 14px hsla(${c.hueA}, 80%, 50%, 0.35), 0 6px 18px hsla(${c.hueC}, 80%, 5%, 0.7)`;
  const border = isSelected
    ? `2.5px solid hsla(${c.hueA}, 95%, 75%, 0.9)`
    : `1.5px solid hsla(${c.hueA}, 90%, 70%, 0.55)`;
  return { background, boxShadow, border, color: "white", textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" };
}
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Grid do cadastro: 10 papéis externos + 1 central ("Sou usuário da comunidade").
// Fonte única: @/lib/allowedRoles (não duplicar rótulos aqui).
const ROLES_OUTER = SIGNUP_OUTER_ROLES;
const ROLE_CENTER = SIGNUP_CENTER_ROLE;

const OCCUPATIONS: { value: string; label: string }[] = [
  { value: "servidor_publico", label: "Servidor público" },
  { value: "empresa_privada", label: "Empresa privada" },
  { value: "autonomo", label: "Autônomo" },
  { value: "estudante", label: "Estudante" },
  { value: "outro", label: "Outro" },
];
const OCCUPATION_SUBS: Record<string, string[]> = {
  servidor_publico: ["Federal", "Estadual", "Municipal"],
  empresa_privada: ["CLT", "PJ", "Estágio"],
  autonomo: ["MEI", "Profissional liberal", "Comerciante"],
  estudante: ["Fundamental", "Médio", "Superior", "Pós-graduação"],
  outro: [],
};

function maskCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length > 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0,3)}.${d.slice(3)}`;
  return d;
}
function maskCEP(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 5) return `${d.slice(0,5)}-${d.slice(5)}`;
  return d;
}
function isValidCPF(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === parseInt(d[10]);
}

const ROLES = [...ROLES_OUTER, ROLE_CENTER];

// Map roles to gendered titles
const ROLE_TITLES: Record<string, { m: string; f: string }> = {
  teacher: { m: "Professor", f: "Professora" },
  coord_pedagogico: { m: "Coord. Pedagógico", f: "Coord. Pedagógica" },
  supervisor: { m: "Corpo de Alunos", f: "Corpo de Alunos" },
  gestor_pedagogico: { m: "Gestor Pedagógico", f: "Gestora Pedagógica" },
  secretario_escolar: { m: "Assistente de Aluno", f: "Assistente de Aluno" },
  chef_projeto_vida: { m: "Coord. da Sala de Vídeo", f: "Coord. da Sala de Vídeo" },
  coord_informatica: { m: "Coord. Sala de Informática", f: "Coord. Sala de Informática" },
  coord_biblioteca: { m: "Coord. da Biblioteca", f: "Coord. da Biblioteca" },
  coord_lab_ciencias: { m: "Coord. do Lab. de Ciências", f: "Coord. do Lab. de Ciências" },
};

// Mapeamento coordenador → setor do qual é dono (para destaque "giroflex" no calendário)
export const COORD_SECTOR_MAP: Record<string, string> = {
  coord_informatica: "informatica",
  coord_biblioteca: "biblioteca",
  coord_lab_ciencias: "lab_ciencias",
  chef_projeto_vida: "projeto_vida",
};

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

type School = Tables<"schools">;

const BRAZILIAN_STATES = [
  { uf: "AC", name: "Acre" }, { uf: "AL", name: "Alagoas" }, { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" }, { uf: "BA", name: "Bahia" }, { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" }, { uf: "ES", name: "Espírito Santo" }, { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" }, { uf: "MT", name: "Mato Grosso" }, { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" }, { uf: "PA", name: "Pará" }, { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" }, { uf: "PE", name: "Pernambuco" }, { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" }, { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" }, { uf: "RO", name: "Rondônia" }, { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" }, { uf: "SP", name: "São Paulo" }, { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

type AuthView = "initial" | "login" | "signup";

const accessPasswordSchema = z.object({
  password: z
    .string()
    .trim()
    .min(4, "Digite a senha geral")
    .max(128, "Senha inválida"),
});

const SIGNUP_RETRY_COOLDOWN_MS = 90_000;
const SIGNUP_RATE_LIMIT_KEY = "sala-vida-signup-rate-limit-until";
const LOGIN_TIMEOUT_MS = 25_000;

async function withLoginTimeout<T>(promise: PromiseLike<T>, ms = LOGIN_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error("login-timeout")), ms)),
  ]);
}

async function signInWithRetry(email: string, password: string) {
  // Não aplique Promise.race/timeout em operações de autenticação: isso apenas
  // libera a tela, mas deixa a requisição original segurando o lock interno.
  // Um segundo clique então quebra o lock e impede o login de concluir.
  return await supabase.auth.signInWithPassword({ email, password });
}


const getSignupCooldownUntil = () => {
  try {
    return Number(localStorage.getItem(SIGNUP_RATE_LIMIT_KEY) || "0");
  } catch {
    return 0;
  }
};

const setSignupCooldownUntil = (until: number) => {
  try {
    localStorage.setItem(SIGNUP_RATE_LIMIT_KEY, String(until));
  } catch {
    // noop
  }
};

const clearSignupCooldown = () => {
  try {
    localStorage.removeItem(SIGNUP_RATE_LIMIT_KEY);
  } catch {
    // noop
  }
};

const ADMIN_CODE_MAX_ATTEMPTS = 5;
const ADMIN_CODE_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos
const ADMIN_CODE_ATTEMPTS_KEY = "sala-vida-admin-code-attempts";
const ADMIN_CODE_LOCKED_UNTIL_KEY = "sala-vida-admin-code-locked-until";

const getAdminCodeAttempts = () => {
  try { return Number(localStorage.getItem(ADMIN_CODE_ATTEMPTS_KEY) || "0"); } catch { return 0; }
};
const setAdminCodeAttempts = (n: number) => {
  try { localStorage.setItem(ADMIN_CODE_ATTEMPTS_KEY, String(n)); } catch { /* noop */ }
};
const getAdminCodeLockedUntil = () => {
  try { return Number(localStorage.getItem(ADMIN_CODE_LOCKED_UNTIL_KEY) || "0"); } catch { return 0; }
};
const setAdminCodeLockedUntil = (until: number) => {
  try { localStorage.setItem(ADMIN_CODE_LOCKED_UNTIL_KEY, String(until)); } catch { /* noop */ }
};
const clearAdminCodeLimits = () => {
  try {
    localStorage.removeItem(ADMIN_CODE_ATTEMPTS_KEY);
    localStorage.removeItem(ADMIN_CODE_LOCKED_UNTIL_KEY);
  } catch { /* noop */ }
};

export default function Auth() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { color: sectorColor } = useSectorPreferences();
  const initialMode = (() => {
    try {
      const m = new URLSearchParams(window.location.search).get("mode");
      if (m === "signup") return { view: "signup" as AuthView, signup: true };
      return { view: "login" as AuthView, signup: false };
    } catch {
      return { view: "login" as AuthView, signup: false };
    }
  })();
  const [view, setView] = useState<AuthView>(initialMode.view);
  const [isSignUp, setIsSignUp] = useState(initialMode.signup);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedGender, setSelectedGender] = useState<"masculino" | "feminino" | "">("");
  const [loading, setLoading] = useState(false);
  const [signUpStep, setSignUpStep] = useState<1 | 2 | 3>(1);
  const [roleSearchOpen, setRoleSearchOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState("");

  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [resetMethod, setResetMethod] = useState<"email" | "whatsapp">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [pendingAccessView, setPendingAccessView] = useState<Exclude<AuthView, "initial"> | null>(null);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessPasswordError, setAccessPasswordError] = useState("");
  const [accessChecking, setAccessChecking] = useState(false);
  const [adminCodeDialogOpen, setAdminCodeDialogOpen] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [adminCodeError, setAdminCodeError] = useState("");
  const [adminCodeChecking, setAdminCodeChecking] = useState(false);
  const [pendingAdminEmail, setPendingAdminEmail] = useState("");
  const [adminLockRemainingMs, setAdminLockRemainingMs] = useState(0);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const signUpInFlightRef = useRef(false);
  const [passwordReminderOpen, setPasswordReminderOpen] = useState(false);
  const [passwordHint, setPasswordHint] = useState("");
  const [showPwdHint, setShowPwdHint] = useState(false);

  const canHaveSignature = selectedRole === "gestor_pedagogico" || selectedRole === "coord_pedagogico" || selectedRole === "supervisor";
  const isCommunity = selectedRole === "usuario_comunidade";

  // Community-only fields
  const [cpf, setCpf] = useState("");
  const [addrCep, setAddrCep] = useState("");
  const [addrStreet, setAddrStreet] = useState("");
  const [addrNumber, setAddrNumber] = useState("");
  const [addrNeighborhood, setAddrNeighborhood] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrUf, setAddrUf] = useState("");
  const [occupation, setOccupation] = useState("");
  const [occupationDetail, setOccupationDetail] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [idDocFront, setIdDocFront] = useState<File | null>(null);
  const [idDocBack, setIdDocBack] = useState<File | null>(null);

  const lookupCep = async (raw: string) => {
    const d = raw.replace(/\D/g, "");
    if (d.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (!j.erro) {
        setAddrStreet(j.logradouro || "");
        setAddrNeighborhood(j.bairro || "");
        setAddrCity(j.localidade || "");
        setAddrUf(j.uf || "");
      }
    } catch {/* ignore */} finally { setCepLoading(false); }
  };

  // Welcome message state after login
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeData, setWelcomeData] = useState<{ name: string; role: string; gender: string; schoolName: string } | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [altLoginRevealed, setAltLoginRevealed] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const dragStartY = useRef<number | null>(null);
  // Check biometric availability
  useEffect(() => {
    isBiometricPlatformAvailable().then(setBiometricAvailable);
  }, []);

  // Tick countdown for admin code lockout
  useEffect(() => {
    if (!adminCodeDialogOpen) return;
    const tick = () => {
      const remaining = Math.max(0, getAdminCodeLockedUntil() - Date.now());
      setAdminLockRemainingMs(remaining);
      if (remaining === 0 && getAdminCodeLockedUntil() > 0) {
        clearAdminCodeLimits();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [adminCodeDialogOpen]);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  // Cascading selectors
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<"estadual" | "municipal" | "federal" | "particular" | "">("");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);

  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [showSchoolList, setShowSchoolList] = useState(false);
  const [schoolAccessLevel, setSchoolAccessLevel] = useState<"active" | "grace" | "blocked" | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [schoolGestor, setSchoolGestor] = useState<{ full_name: string; phone: string | null } | null>(null);

  const [showStateList, setShowStateList] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
  const [showCityList, setShowCityList] = useState(false);
  const [cityQuery, setCityQuery] = useState("");

  // School data from URL
  const [searchParams] = useSearchParams();
  const [schoolData, setSchoolData] = useState<{ id: string; name: string; logo_url: string | null } | null>(null);

  const navigate = useNavigate();

  // Cadastro travado apenas para Professor(a) via link público (?role=teacher)
  const lockedTeacher = searchParams.get("role") === "teacher";

  // Load school from URL
  useEffect(() => {
    const schoolId = searchParams.get("school");
    if (schoolId) {
      supabase.rpc("get_school_public_info", { _school_id: schoolId }).then(({ data }) => {
        if (data && data.length > 0) {
          const school = data[0] as any;
          setSchoolData(school);
          setSelectedSchool(school);
          setSelectedState(school.state);
          setSelectedCity(school.city);
        }
      });
    }
    if (lockedTeacher) {
      setSelectedRole("teacher");
    }
  }, [searchParams, lockedTeacher]);

  // Fetch cities when state changes
  useEffect(() => {
    if (!selectedState) { setCities([]); setSelectedCity(""); return; }
    setLoadingCities(true);
    setSelectedCity("");
    setSelectedNetwork("");
    setSelectedSchool(null);
    supabase.rpc("list_school_cities", { _state: selectedState }).then(({ data }) => {
      setCities((data || []).map((d: any) => d.city));
      setLoadingCities(false);
    });
  }, [selectedState]);

  // Fetch schools when city changes
  useEffect(() => {
    if (!selectedCity) { setSchools([]); setSelectedSchool(null); return; }
    setLoadingSchools(true);
    setSelectedSchool(null);
    supabase.rpc("list_schools_by_location", { 
      _state: selectedState, 
      _city: selectedCity, 
      _network: selectedNetwork || null 
    }).then(({ data }) => {
      setSchools((data || []) as any[]);
      setLoadingSchools(false);
    });
  }, [selectedCity, selectedNetwork, selectedState]);

  // Check school subscription/access whenever a school is selected
  useEffect(() => {
    if (!selectedSchool?.id) {
      setSchoolAccessLevel(null);
      setSchoolGestor(null);
      return;
    }
    let cancelled = false;
    setCheckingAccess(true);
    setSchoolAccessLevel(null);
    setSchoolGestor(null);
    (async () => {
      const { data: lvl } = await supabase.rpc("get_school_access_level", { _school_id: selectedSchool.id });
      if (cancelled) return;
      const level = (lvl as "active" | "grace" | "blocked" | null) ?? "active";
      setSchoolAccessLevel(level);
      if (level === "blocked") {
        const { data: g } = await supabase.rpc("get_school_gestor_public", { _school_id: selectedSchool.id });
        if (!cancelled && g && g.length > 0) setSchoolGestor(g[0] as { full_name: string; phone: string | null });
      }
      if (!cancelled) setCheckingAccess(false);
    })();
    return () => { cancelled = true; };
  }, [selectedSchool?.id]);

  const filteredSchools = schools.filter((s) => {
    if (schoolQuery.length < 2) return true;
    const normalizedQuery = removeAccents(schoolQuery.toLowerCase());
    return removeAccents(s.name.toLowerCase()).includes(normalizedQuery);
  });

  const filteredStates = BRAZILIAN_STATES.filter(
    (s) => stateQuery.length === 0 || s.name.toLowerCase().includes(stateQuery.toLowerCase()) || s.uf.toLowerCase().includes(stateQuery.toLowerCase())
  );

  const filteredCities = cities.filter(
    (c) => cityQuery.length === 0 || c.toLowerCase().includes(cityQuery.toLowerCase())
  );

  const openAccessDialog = (nextView: Exclude<AuthView, "initial">) => {
    setPendingAccessView(nextView);
    setAccessPassword("");
    setAccessPasswordError("");
    setAccessDialogOpen(true);
  };

  const handleAccessGate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = accessPasswordSchema.safeParse({ password: accessPassword });

    if (!parsed.success) {
      setAccessPasswordError(parsed.error.issues[0]?.message || "Digite a senha geral");
      return;
    }

    setAccessChecking(true);
    setAccessPasswordError("");

    const { data, error } = await supabase.functions.invoke("verify-access-password", {
      body: { password: parsed.data.password },
    });

    setAccessChecking(false);

    if (error || !data?.valid) {
      setAccessPasswordError("Senha geral inválida");
      return;
    }

    setAccessDialogOpen(false);
    setAccessPassword("");

    if (pendingAccessView === "signup") {
      setIsSignUp(true);
      setView("signup");
      return;
    }

    setIsSignUp(false);
    setView("login");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetMethod === "email") {
      if (!resetEmail.trim()) { toast.error("Informe seu email"); return; }
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) toast.error(error.message);
      else { toast.success("Email de recuperação enviado!"); setShowReset(false); }
      setLoading(false);
    } else {
      if (!resetPhone.trim()) { toast.error("Informe seu número de celular"); return; }
      const message = encodeURIComponent(
        `Olá! Preciso recuperar minha senha do app AgenSchool. Meu número é ${resetPhone}. Poderia me ajudar?`
      );
      window.open(`https://wa.me/5511925686565?text=${message}`, "_blank");
      toast.success("Redirecionando para o WhatsApp do suporte...");
      setShowReset(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    setFieldErrors({});
    if (!normalizedPassword) {
      setPendingAdminEmail(normalizedEmail);
      setAdminCode("");
      setAdminCodeError("");
      setAdminCodeDialogOpen(true);
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error } = await signInWithRetry(normalizedEmail, normalizedPassword);
      if (error) {
        setFieldErrors({ login: error.message || "E-mail ou senha inválidos" });
        setLoading(false);
        return;
      }

      // Fetch profile for welcome message (não bloqueia login se falhar)
      if (authData.user) {
        try {
          const { data: profile } = await withLoginTimeout(
            supabase
              .from("profiles")
              .select("full_name, role, gender, school_id")
              .eq("user_id", authData.user.id)
              .maybeSingle(),
            8_000
          );

          if (profile) {
            let schoolName = "";
            try {
              const { data: school } = await withLoginTimeout(
                supabase
                  .from("schools")
                  .select("name")
                  .eq("id", profile.school_id)
                  .single(),
                6_000
              );
              schoolName = school?.name || "";
            } catch {
              // ignore, segue sem nome da escola
            }

            setWelcomeData({
              name: profile.full_name,
              role: profile.role,
              gender: (profile as any).gender || "masculino",
              schoolName,
            });
            setShowWelcome(true);
            setLoading(false);
            return;
          }
        } catch {
          // Se falhar ao buscar profile, apenas segue pro /home
        }
      }

      navigate("/home");
      setLoading(false);
      return;
    } catch (err) {
      const timedOut = err instanceof Error && err.message === "login-timeout";
      setFieldErrors({
        login: timedOut
          ? "A conexão com o servidor demorou demais. Tente novamente em instantes."
          : "Não foi possível entrar agora. Verifique sua internet e tente novamente.",
      });
      setLoading(false);
    }
  };


  const [adminPassword, setAdminPasswordState] = useState("");

  const handleAdminCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const lockedUntil = getAdminCodeLockedUntil();
    if (lockedUntil > Date.now()) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
      setAdminCodeError(`Bloqueado por ${mins} min após muitas tentativas`);
      return;
    }

    const normalizedEmail = pendingAdminEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setAdminCodeError("Informe seu e-mail");
      return;
    }

    if (!adminPassword.trim()) {
      setAdminCodeError("Informe sua senha");
      return;
    }

    setAdminCodeChecking(true);
    setAdminCodeError("");

    // 1) Sign in with email + password
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: adminPassword.trim(),
    });

    if (authErr || !authData?.user) {
      setAdminCodeChecking(false);
      setAdminCodeError("E-mail ou senha inválidos");
      return;
    }

    // 2) Verify admin role via edge function (code optional, validated later)
    const { data, error } = await supabase.functions.invoke("admin-email-login", {
      body: { email: normalizedEmail, code: adminCode.trim() || undefined },
    });

    if (error || !data?.success) {
      await supabase.auth.signOut();
      setAdminCodeChecking(false);
      setAdminCodeError(data?.error || "Acesso de admin não autorizado");
      return;
    }

    clearAdminCodeLimits();
    setAdminLockRemainingMs(0);
    setAdminCodeChecking(false);
    setAdminCodeDialogOpen(false);
    setAdminCode("");
    setAdminPasswordState("");
    navigate("/");
  };

  const validateStep2 = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Informe seu email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Email inválido";
    if (!confirmEmail.trim()) errors.confirmEmail = "Confirme seu email";
    else if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) errors.confirmEmail = "Os emails não coincidem";
    if (!password) errors.password = "Informe sua senha";
    else if (!isPasswordValid(password)) errors.password = "Senha: 6-10 caracteres, 1 maiúscula e 1 especial";
    if (!isValidCPF(cpf)) errors.cpf = "CPF inválido — volte e corrija";
    return errors;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || signUpInFlightRef.current) return;

    const cooldownUntil = getSignupCooldownUntil();
    if (cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setFieldErrors({
        submit: `Muitas tentativas seguidas. Aguarde ${secondsLeft}s ou tente outra rede.`,
      });
      return;
    }

    const errors = validateStep2();
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    // Guarda extra: só aceita uma das 11 funções padronizadas.
    if (!isAllowedRole(selectedRole)) {
      setFieldErrors({ role: "Função inválida. Selecione uma das opções da lista." });
      setSignUpStep(1);
      return;
    }
    setFieldErrors({});
    signUpInFlightRef.current = true;
    setLoading(true);

    // RLS exige role='teacher' e is_approved=false no INSERT.
    // A role pretendida vai persistida em `intended_role` para o admin/chef promover depois.
    const intendedRole = selectedRole === "teacher" ? null : selectedRole;
    const buildProfilePayload = (userId: string) => ({
      user_id: userId,
      full_name: fullName.trim(),
      school_id: selectedSchool!.id,
      phone: phone || null,
      role: "teacher",
      gender: selectedGender || null,
      intended_role: intendedRole,
      cpf: cpf.replace(/\D/g, ""),
      ...(isCommunity ? {
        address_cep: addrCep.replace(/\D/g, ""),
        address_street: addrStreet.trim(),
        address_number: addrNumber.trim(),
        address_neighborhood: addrNeighborhood.trim(),
        address_city: addrCity.trim(),
        address_state: addrUf.toUpperCase(),
        occupation,
        occupation_detail: occupationDetail.trim(),
      } : {}),
    });

    const finalizeWithProfile = async (userId: string) => {
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingProfileError) throw existingProfileError;

      if (!existingProfile) {
        const { error: profileError } = await supabase
          .from("profiles")
          .insert(buildProfilePayload(userId) as any);

        if (profileError) throw profileError;
      }

      // Upload signature if provided
      if (signatureFile && canHaveSignature) {
        try {
          const ext = signatureFile.name.split(".").pop() || "png";
          const path = `${userId}/signature.${ext}`;
          await supabase.storage.from("signatures").upload(path, signatureFile, { upsert: true });
          // Store path only (not public URL) — bucket is now private
          await supabase.from("profiles").update({ signature_url: path } as any).eq("user_id", userId);
        } catch {
          // Non-critical, signature can be added later
        }
      }

      // Upload do documento de identidade (opcional, apenas comunidade)
      if (isCommunity && (idDocFront || idDocBack)) {
        try {
          const updates: any = {};
          if (idDocFront) {
            const ext = (idDocFront.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${userId}/front.${ext}`;
            await supabase.storage.from("community-id-docs").upload(path, idDocFront, { upsert: true, contentType: idDocFront.type });
            updates.id_doc_front_path = path;
          }
          if (idDocBack) {
            const ext = (idDocBack.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${userId}/back.${ext}`;
            await supabase.storage.from("community-id-docs").upload(path, idDocBack, { upsert: true, contentType: idDocBack.type });
            updates.id_doc_back_path = path;
          }
          if (idDocFront && idDocBack) updates.id_doc_uploaded_at = new Date().toISOString();
          if (Object.keys(updates).length) {
            await supabase.from("profiles").update(updates).eq("user_id", userId);
          }
        } catch {
          // Não bloqueia o cadastro; será solicitado após aprovação
        }
      }

      setLoading(false);
      signUpInFlightRef.current = false;
      window.location.replace("/home");
    };

    const recoverExistingAccount = async () => {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: password.trim() });

      if (signInError || !signInData.user) {
        setFieldErrors({
          submit: "Este email já está cadastrado. Faça login com sua senha atual ou redefina a senha para concluir o acesso.",
        });
        signUpInFlightRef.current = false;
        return false;
      }

      await finalizeWithProfile(signInData.user.id);
      return true;
    };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      const message = error.message.toLowerCase();
      const code = ((error as { code?: string }).code ?? "").toLowerCase();
      const status = (error as { status?: number }).status;
      const alreadyRegistered =
        code === "user_already_exists" ||
        code === "email_exists" ||
        status === 422 && (message.includes("already") || message.includes("exists")) ||
        message.includes("already registered") ||
        message.includes("already exists") ||
        message.includes("user already");
      const rateLimited = code === "over_email_send_rate_limit" || message.includes("rate limit");
      const weakPassword =
        !alreadyRegistered && (
          code === "weak_password" ||
          message.includes("weak password") ||
          message.includes("pwned") ||
          message.includes("compromised") ||
          message.includes("easy to guess")
        );

      if (alreadyRegistered) {
        try {
          const recovered = await recoverExistingAccount();
          if (!recovered) {
            setFieldErrors({
              email: "Este e-mail já está cadastrado. Faça login ou recupere sua senha.",
              submit: "Este e-mail já está cadastrado. Use a opção de login ou recuperar senha.",
            });
            setLoading(false);
          }
        } catch (profileError) {
          const profileMessage = profileError instanceof Error ? profileError.message : "Erro ao criar perfil.";
          const isBlocked = profileMessage.includes("school_registrations_blocked");
          setFieldErrors({
            submit: isBlocked
              ? "Esta escola está com assinatura pendente. Novos cadastros estão bloqueados até o gestor regularizar o pagamento."
              : "Este e-mail já está cadastrado. Faça login ou recupere sua senha.",
          });
          setLoading(false);
        }
        signUpInFlightRef.current = false;
        return;
      }

      if (weakPassword) {
        setFieldErrors({
          password: "Senha muito fraca ou já vazada. Use uma senha única, com letras, números e símbolos.",
          submit: "Senha muito fraca ou já vazada. Escolha outra com letras, números e símbolos.",
        });
        setLoading(false);
        signUpInFlightRef.current = false;
        return;
      }

      if (rateLimited) {
        setSignupCooldownUntil(Date.now() + SIGNUP_RETRY_COOLDOWN_MS);
        setFieldErrors({
          submit: "Limite temporário de cadastro atingido. Tente outra rede ou aguarde um pouco antes de tentar de novo.",
        });
        setLoading(false);
        signUpInFlightRef.current = false;
        return;
      }




      setFieldErrors({ submit: error.message });
      setLoading(false);
      signUpInFlightRef.current = false;
      return;
    }

    clearSignupCooldown();

    if (!data.user) {
      setFieldErrors({ submit: "Não foi possível concluir o cadastro agora. Tente novamente." });
      setLoading(false);
      signUpInFlightRef.current = false;
      return;
    }

    let sessionReady = !!data.session;

    if (!sessionReady) {
      const { data: currentSession } = await supabase.auth.getSession();
      sessionReady = currentSession.session?.user?.id === data.user.id;
    }

    if (!sessionReady) {
      sessionReady = await new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => {
          subscription.unsubscribe();
          resolve(false);
        }, 5000);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user?.id === data.user!.id) {
            window.clearTimeout(timeout);
            subscription.unsubscribe();
            resolve(true);
          }
        });
      });
    }

    try {
      if (!sessionReady) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: password.trim() });

        if (signInError || !signInData.user) {
          setFieldErrors({ submit: "Conta criada, mas houve um erro ao iniciar sua sessão. Tente fazer login." });
          setLoading(false);
          signUpInFlightRef.current = false;
          return;
        }

        await finalizeWithProfile(signInData.user.id);
        signUpInFlightRef.current = false;
        return;
      }

      await finalizeWithProfile(data.user.id);
      signUpInFlightRef.current = false;
    } catch (profileError) {
      // Extrai a causa real (Postgres/PostgREST devolvem code/message/details/hint).
      const err = profileError as { message?: string; code?: string; details?: string; hint?: string } | Error | null;
      const parts: string[] = [];
      if (err && typeof err === "object") {
        if ("message" in err && err.message) parts.push(String(err.message));
        if ("code" in err && err.code) parts.push(`(code ${err.code})`);
        if ("details" in err && err.details) parts.push(String(err.details));
        if ("hint" in err && err.hint) parts.push(`Hint: ${err.hint}`);
      }
      const profileMessage = parts.length > 0 ? parts.join(" — ") : "Erro ao criar perfil.";
      console.error("[SignUp] Falha ao criar perfil", profileError);
      const isBlocked = profileMessage.includes("school_registrations_blocked");
      setFieldErrors({
        submit: isBlocked
          ? "Esta escola está com assinatura pendente. Novos cadastros estão bloqueados até o gestor regularizar o pagamento."
          : "Erro ao concluir cadastro: " + profileMessage,
      });
      setLoading(false);
      signUpInFlightRef.current = false;
    }
  };

  const sendFeedbackWhatsApp = () => {
    const stars = "⭐".repeat(feedbackRating) || "Sem nota";
    const msg = [
      `📋 *Feedback — Agendamento Escolar*`,
      `👤 Nome: ${fullName}`,
      `📧 Email: ${email}`,
      `📱 Celular: ${phone}`,
      `⭐ Nota: ${stars} (${feedbackRating}/5)`,
      feedbackMessage ? `💬 Mensagem: ${feedbackMessage}` : "",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/5511925686565?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const sendFinancialHelpWhatsApp = () => {
    const msg = [
      `💰 *Solicitação de Ajuda Financeira — Agendamento Escolar*`,
      `👤 Nome: ${fullName}`,
      `📧 Email: ${email}`,
      `📱 Celular: ${phone}`,
      `Olá! Gostaria de contribuir financeiramente com o projeto Agendamento Escolar.`,
    ].join("\n");
    window.open(`https://wa.me/5511925686565?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const logoSrc = schoolData?.logo_url || "/school-logo.png";

  // Get gendered welcome title
  const getWelcomeTitle = () => {
    if (!welcomeData) return "";
    const roleTitle = ROLE_TITLES[welcomeData.role];
    if (!roleTitle) return welcomeData.name;
    const title = welcomeData.gender === "feminino" ? roleTitle.f : roleTitle.m;
    return `${title} ${welcomeData.name.split(" ")[0]}`;
  };

  // ============ WELCOME SCREEN AFTER LOGIN ============
  if (showWelcome && welcomeData) {
    return (
      <div
        className="relative flex flex-col items-center justify-between h-dvh px-6 py-8 select-none overflow-hidden"
        style={{ background: "hsl(220, 70%, 6%)" }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 30%, hsla(220, 70%, 18%, 0.45) 0%, hsla(225, 75%, 8%, 0.85) 70%, hsla(230, 80%, 4%, 1) 100%)" }} />

        <div className="relative z-10 w-full flex justify-between items-center">
          <button
            onClick={() => { setShowWelcome(false); setView("login"); }}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 backdrop-blur-sm text-white font-bold text-xs uppercase tracking-wider hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <button
            onClick={async () => {
              try { await supabase.auth.signOut(); } finally { window.location.replace("/auth"); }
            }}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 backdrop-blur-sm text-white font-bold text-xs uppercase tracking-wider hover:bg-white/20 transition-colors"
          >
            <LogIn className="h-4 w-4 rotate-180" />
            Sair
          </button>
        </div>

        <div className="relative z-10 text-center space-y-4 animate-fade-in max-w-sm">
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto border border-white/20">
            <Sparkles className="h-10 w-10 text-white/80" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-white font-display">
              Olá, {getWelcomeTitle()}! 👋
            </h1>
            <p className="text-white/70 text-base leading-relaxed">
              {(welcomeData.role === "secretario_escolar" || welcomeData.role === "assistente") ? (
                <>
                  {welcomeData.gender === "feminino" ? "Bem-vinda" : "Bem-vindo"} ao painel do(a) <span className="text-white font-bold text-lg">Assistente de Aluno</span>{" "}
                  {/colégio/i.test(welcomeData.schoolName) ? "do" : "da"}{" "}
                  <span className="text-white/90 font-semibold">{welcomeData.schoolName}</span>.
                  Aqui você vai monitorar os horários dos professores, registrar quem está presente, ausente ou atrasado,
                  e transferir responsabilidade quando outro assistente de aluno precisar se ausentar.
                  Tudo o que você marcar aparece em tempo real no Painel da TV da coordenação. ✨
                </>
              ) : (
                <>
                  {welcomeData.gender === "feminino" ? "Bem-vinda" : "Bem-vindo"} ao webapp de agendamento dos espaços e setores {/colégio/i.test(welcomeData.schoolName) ? "do" : "da"}{" "}
                  <span className="text-white/90 font-semibold">{welcomeData.schoolName}</span>.
                  É uma satisfação {welcomeData.gender === "feminino" ? "tê-la" : "tê-lo"} conosco!
                  Tenha um ótimo dia! ✨
                </>
              )}
            </p>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-xs animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <Button
            onClick={() => navigate(welcomeData.role === "gestor_pedagogico" ? "/gestor" : (welcomeData.role === "secretario_escolar" || welcomeData.role === "assistente") ? "/assistente" : "/sectors")}
            className="w-full h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 text-white font-bold text-lg shadow-lg hover:bg-white/20 transition-all gap-3"
          >
            <OctopusMascot className="w-6 h-6 rounded-full object-cover" />
            Avançar
          </Button>
        </div>
      </div>
    );
  }

  if (view === "initial") {
    return (
      <>
        <div
          className="relative flex flex-col items-center justify-between h-dvh px-6 py-8 select-none overflow-hidden"
          style={{ background: "hsl(220, 70%, 6%)" }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 30%, hsla(220, 70%, 18%, 0.45) 0%, hsla(225, 75%, 8%, 0.85) 70%, hsla(230, 80%, 4%, 1) 100%)" }} />

          <div className="relative z-10 w-full flex justify-between items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate("/", { replace: true });
                }
              }}
              className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
              style={{ background: "hsla(0,0%,100%,0.08)" }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPendingAdminEmail(email.trim().toLowerCase());
                setAdminCode("");
                setAdminCodeError("");
                setAdminCodeDialogOpen(true);
              }}
              className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
              style={{ background: "hsla(0,0%,100%,0.08)" }}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Admin
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white/80 transition-colors" style={{ background: "hsla(0,0%,100%,0.08)" }}>
                  <Settings className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t("toolbar.settings")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Globe className="mr-2 h-4 w-4" />
                    {t("toolbar.language")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(Object.keys(languageLabels) as Language[]).map((lang) => (
                      <DropdownMenuItem
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={language === lang ? "bg-accent font-semibold" : ""}
                      >
                        {languageLabels[lang]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {resolvedTheme === "dark" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                    {t("toolbar.theme")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setTheme("light")} className={resolvedTheme === "light" && theme !== "system" ? "bg-accent font-semibold" : ""}>
                      <Sun className="mr-2 h-4 w-4" /> {t("toolbar.lightMode")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")} className={resolvedTheme === "dark" && theme !== "system" ? "bg-accent font-semibold" : ""}>
                      <Moon className="mr-2 h-4 w-4" /> {t("toolbar.darkMode")}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <AppearanceSettings
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Palette className="mr-2 h-4 w-4" />
                      {t("settings.appearance")}
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setPendingAdminEmail(email.trim().toLowerCase());
                    setAdminCode("");
                    setAdminCodeError("");
                    setAdminCodeDialogOpen(true);
                  }}
                >
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Entrar como Admin
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.open("https://wa.me/5511925686565", "_blank")}>
                  <Headphones className="mr-2 h-4 w-4" />
                  {t("settings.support")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>

          <AppBreadcrumbs className="relative z-10 mt-3" />

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-5 overflow-hidden">
              <OctopusMascot className="w-full h-full object-cover" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold text-white uppercase tracking-widest drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">Escolas</h1>
              <p className="text-base text-white/85 leading-relaxed font-medium">
                Escolha como deseja continuar. Tanto entrar quanto cadastrar exigem a senha geral do desenvolvedor.
              </p>
            </div>
          </div>

          <div className="relative z-10 w-full max-w-sm space-y-3 animate-fade-in">
            <Button
              type="button"
              onClick={() => openAccessDialog("login")}
              className="w-full h-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 text-white font-bold text-lg hover:bg-white/30 transition-all gap-3 shadow-lg"
            >
              <LogIn className="h-6 w-6" />
              Entrar
            </Button>
            <Button
              type="button"
              onClick={() => openAccessDialog("signup")}
              className="w-full h-16 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 text-white font-bold text-lg hover:bg-white/25 transition-all gap-3 shadow-lg"
            >
              <Sparkles className="h-6 w-6" />
              Cadastrar
            </Button>
            <VersionFooter className="pt-2" />
          </div>
        </div>

        <Dialog open={accessDialogOpen} onOpenChange={(open) => !accessChecking && setAccessDialogOpen(open)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Acesso restrito</DialogTitle>
              <DialogDescription className="text-center">
                Digite a senha geral do desenvolvedor para liberar o modo {pendingAccessView === "signup" ? "Cadastrar" : "Entrar"}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAccessGate} className="space-y-3 mt-2">
              <PasswordInput
                autoFocus
                inputMode="text"
                placeholder="Senha geral"
                value={accessPassword}
                onChange={(e) => {
                  setAccessPassword(e.target.value);
                  if (accessPasswordError) setAccessPasswordError("");
                }}
                disabled={accessChecking}
                className="h-12 text-center text-base tracking-widest"
              />

              <Button
                type="submit"
                size="lg"
                disabled={accessChecking || accessPassword.trim().length < 4}
                className={`w-full h-12 font-bold ${accessPasswordError ? "bg-destructive hover:bg-destructive/90" : ""}`}
              >
                {accessChecking ? "Validando..." : accessPasswordError || "Liberar acesso"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={adminCodeDialogOpen} onOpenChange={(open) => !adminCodeChecking && setAdminCodeDialogOpen(open)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Entrar como Admin</DialogTitle>
              <DialogDescription className="text-center">
                Informe seu e-mail e senha de admin para entrar.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAdminCodeLogin} className="space-y-3 mt-2">
              <Input
                type="email"
                value={pendingAdminEmail}
                onChange={(e) => {
                  setPendingAdminEmail(e.target.value);
                  if (adminCodeError) setAdminCodeError("");
                }}
                placeholder="admin@exemplo.com"
                disabled={adminCodeChecking || adminLockRemainingMs > 0}
                className="h-12 text-center text-base"
                autoComplete="email"
              />

              <PasswordInput
                value={adminPassword}
                onChange={(e) => {
                  setAdminPasswordState(e.target.value);
                  if (adminCodeError) setAdminCodeError("");
                }}
                placeholder="Senha"
                disabled={adminCodeChecking || adminLockRemainingMs > 0}
                className="h-12 text-center text-base"
                autoComplete="current-password"
              />

              {adminLockRemainingMs > 0 && (
                <p className="text-xs text-center text-destructive font-medium">
                  Bloqueado. Tente novamente em {Math.floor(adminLockRemainingMs / 60000)}m {String(Math.floor((adminLockRemainingMs % 60000) / 1000)).padStart(2, "0")}s
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={adminCodeChecking || adminLockRemainingMs > 0 || pendingAdminEmail.trim().length < 5 || !adminPassword.trim()}
                className={`w-full h-12 font-bold ${adminCodeError ? "bg-destructive hover:bg-destructive/90" : ""}`}
              >
                {adminCodeChecking ? "Validando..." : adminLockRemainingMs > 0 ? "Bloqueado temporariamente" : adminCodeError || "Entrar como admin"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ============ LOGIN VIEW ============
  if (view === "login" && !isSignUp) {
    return (
      <div
        className="relative flex flex-col h-dvh select-none overflow-hidden"
        style={{ background: "hsl(220, 70%, 6%)" }}
      >


        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 30%, hsla(220, 70%, 18%, 0.45) 0%, hsla(225, 75%, 8%, 0.85) 70%, hsla(230, 80%, 4%, 1) 100%)" }} />

        {/* Settings button — top right */}
        <div className="absolute top-4 right-4 z-20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-7 h-7 rounded-xl flex items-center justify-center text-white/50 hover:text-white/80 transition-colors" style={{ background: "hsla(0,0%,100%,0.08)" }}>
                <Settings className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{t("toolbar.settings")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Globe className="mr-2 h-4 w-4" />
                  {t("toolbar.language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {(Object.keys(languageLabels) as Language[]).map((lang) => (
                    <DropdownMenuItem
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={language === lang ? "bg-accent font-semibold" : ""}
                    >
                      {languageLabels[lang]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {resolvedTheme === "dark" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                  {t("toolbar.theme")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme("light")} className={resolvedTheme === "light" && theme !== "system" ? "bg-accent font-semibold" : ""}>
                    <Sun className="mr-2 h-4 w-4" /> {t("toolbar.lightMode")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("dark")} className={resolvedTheme === "dark" && theme !== "system" ? "bg-accent font-semibold" : ""}>
                    <Moon className="mr-2 h-4 w-4" /> {t("toolbar.darkMode")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <AppearanceSettings
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Palette className="mr-2 h-4 w-4" />
                    {t("settings.appearance")}
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setPendingAdminEmail(email.trim().toLowerCase());
                  setAdminCode("");
                  setAdminCodeError("");
                  setAdminCodeDialogOpen(true);
                }}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                Entrar como Admin
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.open("https://wa.me/5511925686565", "_blank")}>
                <Headphones className="mr-2 h-4 w-4" />
                {t("settings.support")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 max-w-md mx-auto w-full">
          {/* Back */}
          <button
            onClick={() => navigate("/")}
            className="absolute top-6 left-6 w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="w-full space-y-5 animate-fade-in">
            <div className="text-center space-y-1">
              <LogIn className="h-8 w-8 text-white/70 mx-auto" />
              <h2 className="text-xl font-bold text-white font-display">Entrar na conta</h2>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.login) clearFieldError("login");
                  }}
                  placeholder="seu@email.com"
                  className="h-11 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.login) clearFieldError("login");
                    }}
                    placeholder="Mínimo 6 caracteres"
                    className="h-11 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] pr-10"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {fieldErrors.login && (
                <div className="rounded-xl bg-destructive/90 px-3 py-2 text-center text-xs font-bold text-destructive-foreground break-words">
                  {fieldErrors.login}{" "}
                  <a href="/diagnostico" className="underline underline-offset-2">
                    Abrir diagnóstico
                  </a>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-white font-bold text-sm hover:bg-white/25 transition-all gap-2"
                disabled={loading}
              >
                <LogIn className="h-4 w-4" />
                {loading ? "Entrando..." : password.trim() ? "Entrar na minha conta" : "Continuar"}
              </Button>
            </form>


            {/* Dica de senha salva no dispositivo */}
            {(() => {
              const key = email.trim().toLowerCase() ? `lov:pwdHint:${email.trim().toLowerCase()}` : "";
              let hint = "";
              try { hint = key ? (localStorage.getItem(key) || "") : ""; } catch {}
              if (!hint) return null;
              return (
                <div className="rounded-xl bg-amber-400/10 border border-amber-300/30 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-200 text-[11px] font-bold uppercase tracking-wider">
                    <Lightbulb className="h-3.5 w-3.5" /> Sua dica de senha
                  </div>
                  {showPwdHint ? (
                    <p className="text-xs text-amber-50 break-words leading-snug">{hint}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPwdHint(true)}
                      className="text-[11px] text-amber-200/90 hover:text-amber-100 underline underline-offset-2"
                    >
                      Mostrar dica salva neste dispositivo
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Reset password */}
            {!showReset && (
              <p className="text-center text-xs text-white/40">
                Esqueceu a senha?{" "}
                <button type="button" onClick={() => setShowReset(true)} className="text-white/70 hover:underline font-medium">
                  Recuperar
                </button>
              </p>
            )}

            {showReset && (
              <div className="space-y-2.5 animate-fade-in">
                <div className="h-px bg-white/10 my-1" />
                <p className="text-xs text-white/50 text-center font-medium">Recuperar senha</p>
                <div className="flex rounded-lg bg-white/5 p-0.5 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setResetMethod("email")}
                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                      resetMethod === "email" ? "bg-white/15 shadow-sm text-white" : "text-white/40"
                    }`}
                  >
                    <Mail className="h-3.5 w-3.5" /> Por Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetMethod("whatsapp")}
                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                      resetMethod === "whatsapp" ? "bg-white/15 shadow-sm text-white" : "text-white/40"
                    }`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Por WhatsApp
                  </button>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-2.5">
                  {resetMethod === "email" ? (
                    <Input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="h-10 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      required
                    />
                  ) : (
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="h-10 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      required
                    />
                  )}
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => setShowReset(false)} className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={loading} className="flex-1 h-10 rounded-xl bg-white/15 border border-white/20 text-white text-xs gap-1.5 hover:bg-white/25">
                      {resetMethod === "email" ? (
                        <><KeyRound className="h-3.5 w-3.5" />{loading ? "Enviando..." : "Enviar link"}</>
                      ) : (
                        <><MessageCircle className="h-3.5 w-3.5" />Abrir WhatsApp</>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ SIGNUP VIEW (with existing multi-step flow) ============
  return (
    <div
      className="relative h-dvh flex flex-col overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(135deg, hsl(220, 75%, 5%) 0%, hsl(222, 70%, 9%) 45%, hsl(225, 80%, 4%) 100%)",
      }}
    >
      {/* Ambient blue glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-32 w-[28rem] h-[28rem] rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-48 -left-40 w-[32rem] h-[32rem] rounded-full bg-blue-700/20 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[22rem] h-[22rem] rounded-full bg-amber-400/5 blur-3xl" />
      </div>

      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 25%, hsla(215, 80%, 22%, 0.35) 0%, transparent 65%)" }} />

      <div className="relative z-10 flex-1 flex flex-col w-full max-w-lg md:max-w-xl mx-auto px-1 sm:px-2 md:px-3 pt-2 sm:pt-3 pb-2 overflow-hidden">
        {/* Header */}
        {signUpStep <= 1 && (
          <div className="flex items-center gap-2 w-full mb-1">
            <button
              onClick={() => { setIsSignUp(false); navigate("/"); }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-white/70 hover:text-white hover:bg-white/20 transition-all shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0 shadow-[0_8px_20px_-6px_rgba(251,191,36,0.5)]"
              style={{
                background: lockedTeacher
                  ? "linear-gradient(135deg, hsl(45, 95%, 60%), hsl(35, 90%, 50%))"
                  : "linear-gradient(135deg, hsla(215,80%,40%,0.6), hsla(220,70%,25%,0.6))",
                border: lockedTeacher ? "1px solid hsla(45,95%,70%,0.7)" : "1px solid hsla(0,0%,100%,0.15)",
              }}
            >
              {lockedTeacher
                ? <GraduationCap className="h-5 w-5 text-[hsl(225,80%,12%)]" />
                : <CalendarDays className="h-5 w-5 text-white/80" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] uppercase tracking-[0.22em] text-amber-200/80 font-bold leading-none">
                AgenSchool
              </p>
              <h1 className="text-2xl font-extrabold font-display tracking-tight text-white leading-tight truncate">
                {lockedTeacher ? "Cadastro de Professor" : "Cadastro"}
              </h1>
              {lockedTeacher && schoolData?.name && (
                <p className="text-[10px] text-amber-200/80 font-semibold truncate">
                  {schoolData.name}
                </p>
              )}
            </div>

          </div>
        )}
        {signUpStep >= 2 && (
          <div className="flex items-center gap-2 mb-1">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15">
              {lockedTeacher
                ? <GraduationCap className="h-5 w-5 text-amber-300" />
                : <CalendarDays className="h-5 w-5 text-white/80" />}
            </div>
            <h1 className="text-2xl font-extrabold font-display tracking-tight text-white">
              {lockedTeacher ? "Cadastro de Professor" : "Cadastro"}
            </h1>

          </div>
        )}


        {/* Card */}
        <Card
          className="shadow-[0_25px_70px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl overflow-y-auto rounded-2xl mb-2 ring-1 ring-white/10"
          style={{
            background:
              "linear-gradient(135deg, hsla(215, 80%, 32%, 0.62) 0%, hsla(220, 70%, 20%, 0.58) 50%, hsla(225, 75%, 14%, 0.62) 100%)",
            border: "1px solid hsla(45, 90%, 65%, 0.22)",
            touchAction: "pan-y",
          }}
        >
          <div className="h-0.5 bg-gradient-to-r from-amber-300/80 via-amber-200/50 to-transparent w-full" />

          <CardContent className="p-1.5 sm:p-2 md:p-3">
            <form onSubmit={handleSignUp} className="space-y-2 sm:space-y-3">


              {/* Progress */}
              {signUpStep <= 2 && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center gap-1.5 flex-1">
                    <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${signUpStep >= 1 ? "bg-gradient-to-r from-amber-300 to-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]" : "bg-white/10"}`} />
                    <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${signUpStep >= 2 ? "bg-gradient-to-r from-amber-300 to-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]" : "bg-white/10"}`} />
                  </div>
                  <span className="text-[10px] font-semibold text-white/40 whitespace-nowrap">Etapa {signUpStep}/2</span>
                </div>
              )}

              {signUpStep === 1 ? (
                <div className="space-y-1 animate-fade-in">
                  {/* Função */}
                  {lockedTeacher ? (
                    <div
                      className="relative mb-1.5 p-2.5 rounded-2xl overflow-hidden"
                      style={{
                        background:
                          "linear-gradient(135deg, hsla(45, 95%, 55%, 0.18) 0%, hsla(35, 90%, 45%, 0.10) 60%, hsla(220, 70%, 20%, 0.30) 100%)",
                        border: "1px solid hsla(45, 95%, 65%, 0.45)",
                        boxShadow:
                          "0 0 0 1px hsla(45,95%,70%,0.10) inset, 0 12px 30px -12px hsla(45,90%,50%,0.45)",
                      }}
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500" />
                      <div className="flex items-center gap-2.5 pl-2">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                          style={{
                            background:
                              "linear-gradient(135deg, hsl(45, 95%, 60%), hsl(32, 92%, 48%))",
                            boxShadow:
                              "0 0 18px hsla(45,95%,55%,0.55), inset 0 0 8px hsla(48,100%,85%,0.5)",
                          }}
                        >
                          <GraduationCap className="h-5 w-5 text-[hsl(225,80%,12%)]" strokeWidth={2.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] uppercase tracking-[0.2em] text-amber-200/90 font-bold">
                            Cadastro exclusivo
                          </p>
                          <p className="text-base font-extrabold text-white leading-tight">
                            Professor(a)
                          </p>
                          {schoolData?.name && (
                            <p className="text-[10px] text-white/70 font-medium truncate mt-0.5">
                              {schoolData.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (

                  <FieldWrapperDark label="Sou..." compact>
                    <button
                      type="button"
                      onClick={() => { setRoleSearchOpen(true); setRoleQuery(""); }}
                      style={{ ...sectorButtonStyle(sectorColor, !!selectedRole), borderRadius: 16, boxSizing: "border-box" }}
                      className="w-full min-h-[60px] px-3 py-2.5 flex items-center gap-3 text-left transition-[filter] hover:brightness-125"
                    >
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 border border-white/25 shrink-0">
                        {selectedRole ? <UserCheck className="h-5 w-5 text-white" /> : <Search className="h-5 w-5 text-white" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[9px] uppercase tracking-[0.18em] font-bold text-white/70">
                          Função na escola
                        </span>
                        <span className="block text-[15px] font-extrabold text-white leading-tight break-words">
                          {selectedRole ? roleLabel(selectedRole) : "Buscar minha profissão"}
                        </span>
                      </span>
                      <ChevronDown className="h-5 w-5 text-white/70 shrink-0" />
                    </button>
                  </FieldWrapperDark>

                  )}

                  {/* Sexo */}
                  <FieldWrapperDark label="Sexo" compact>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setSelectedGender("masculino"); clearFieldError("gender"); }}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          selectedGender === "masculino"
                            ? "bg-white/20 text-white shadow-sm border border-white/30"
                            : "bg-white/5 text-white/50 hover:text-white/70 border border-transparent"
                        }`}
                      >
                        <User className="h-3.5 w-3.5" />
                        Masculino
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedGender("feminino"); clearFieldError("gender"); }}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          selectedGender === "feminino"
                            ? "bg-white/20 text-white shadow-sm border border-white/30"
                            : "bg-white/5 text-white/50 hover:text-white/70 border border-transparent"
                        }`}
                      >
                        <User className="h-3.5 w-3.5" />
                        Feminino
                      </button>
                    </div>
                  </FieldWrapperDark>

                  {/* Assinatura Digital - only for authorized roles */}
                  {canHaveSignature && (
                    <FieldWrapperDark label="Assinatura Digital (opcional)" compact>
                      <input
                        ref={signatureInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              toast.error("A imagem deve ter no máximo 2MB.");
                              return;
                            }
                            setSignatureFile(file);
                            const reader = new FileReader();
                            reader.onload = (ev) => setSignaturePreview(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => signatureInputRef.current?.click()}
                        className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15 transition-all"
                      >
                        {signaturePreview ? (
                          <img src={signaturePreview} alt="Assinatura" className="h-10 w-20 object-contain rounded bg-white/90" />
                        ) : (
                          <div className="h-10 w-20 rounded bg-white/5 flex items-center justify-center border border-dashed border-white/20">
                            <Camera className="h-5 w-5 text-white/40" />
                          </div>
                        )}
                        <div className="text-left flex-1">
                          <p className="text-xs font-semibold text-white/80">
                            {signaturePreview ? "Alterar assinatura" : "Escanear assinatura"}
                          </p>
                          <p className="text-[10px] text-white/40">Tire uma foto ou selecione imagem</p>
                        </div>
                        <Camera className="h-4 w-4 text-white/40" />
                      </button>
                    </FieldWrapperDark>
                  )}

                  {/* Nome */}
                  <FieldWrapperDark label="Nome completo" compact>
                    <Input
                      value={fullName}
                      onChange={(e) => { setFullName(toProperCase(e.target.value)); clearFieldError("fullName"); }}
                      placeholder="Seu nome completo"
                      className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                    />
                  </FieldWrapperDark>

                  {/* CPF — obrigatório para todos os novos cadastros */}
                  <FieldWrapperDark label="CPF" compact>
                    {(() => {
                      const cpfDigits = cpf.replace(/\D/g, "");
                      const cpfComplete = cpfDigits.length === 11;
                      const cpfOk = cpfComplete && isValidCPF(cpf);
                      const cpfBad = cpfComplete && !cpfOk;
                      return (
                        <div className="relative">
                          <Input
                            inputMode="numeric"
                            value={cpf}
                            onChange={(e) => { setCpf(maskCPF(e.target.value)); clearFieldError("cpf"); }}
                            placeholder="000.000.000-00"
                            className={`h-8 rounded-xl bg-white/[0.14] text-white placeholder:text-white/55 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs pr-7 ${
                              cpfBad
                                ? "border-red-400/80 focus-visible:ring-red-400/70 focus-visible:border-red-400"
                                : cpfOk
                                  ? "border-emerald-300/70 focus-visible:ring-emerald-300/70 focus-visible:border-emerald-300"
                                  : "border-amber-200/30 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80"
                            }`}
                          />
                          {cpfComplete && (
                            <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold ${cpfOk ? "text-emerald-300" : "text-red-300"}`}>
                              {cpfOk ? "✓" : "✕"}
                            </span>
                          )}
                          {cpfBad && (
                            <p className="mt-1 text-[10px] font-semibold text-red-300">CPF inválido — verifique os dígitos</p>
                          )}
                        </div>
                      );
                    })()}
                  </FieldWrapperDark>

                  {/* WhatsApp */}
                  <FieldWrapperDark label="Celular (WhatsApp)" compact>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                      <Input
                        type="tel"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                          if (v.length > 7) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
                          else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
                          else if (v.length > 0) v = `(${v}`;
                          setPhone(v);
                          clearFieldError("phone");
                        }}
                        placeholder="(00) 00000-0000"
                        className="pl-9 h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                      />
                    </div>
                  </FieldWrapperDark>

                  {/* Estado */}
                  <FieldWrapperDark label="Estado" compact>
                    <div className="relative">
                      {selectedState ? (
                        <div className="flex items-center gap-2 h-8 rounded-xl bg-white/10 border border-white/20 px-3">
                          <MapPin className="h-3 w-3 text-white/60" />
                          <span className="flex-1 text-sm font-medium text-white">
                            {BRAZILIAN_STATES.find((s) => s.uf === selectedState)?.name} ({selectedState})
                          </span>
                          <button type="button" onClick={() => { setSelectedState(""); setStateQuery(""); }}
                            className="text-white/40 hover:text-white">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                          <Input
                            placeholder="Buscar estado..."
                            value={stateQuery}
                            onChange={(e) => { setStateQuery(e.target.value); setShowStateList(true); clearFieldError("state"); }}
                            onFocus={() => setShowStateList(true)}
                            onBlur={() => setTimeout(() => setShowStateList(false), 200)}
                            className="pl-9 h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                          />
                        </>
                      )}
                      {showStateList && !selectedState && (
                        <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg max-h-32 overflow-y-auto border border-white/15">
                          {filteredStates.map((s) => (
                            <button
                              key={s.uf}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-white/10 text-sm text-white border-b border-white/5 last:border-0"
                              onMouseDown={() => { setSelectedState(s.uf); setStateQuery(""); setShowStateList(false); clearFieldError("state"); }}
                            >
                              <span className="font-semibold">{s.uf}</span> — {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FieldWrapperDark>

                  {/* Município */}
                  <FieldWrapperDark label="Município" compact>
                    <div className="relative">
                      {selectedCity ? (
                        <div className="flex items-center gap-2 h-8 rounded-xl bg-white/10 border border-white/20 px-3">
                          <Building2 className="h-3 w-3 text-white/60" />
                          <span className="flex-1 text-sm font-medium text-white">{selectedCity}</span>
                          <button type="button" onClick={() => { setSelectedCity(""); setCityQuery(""); }}
                            className="text-white/40 hover:text-white">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                          <Input
                            placeholder={!selectedState ? "Selecione o estado primeiro" : loadingCities ? "Carregando..." : "Buscar município..."}
                            value={cityQuery}
                            onChange={(e) => { setCityQuery(e.target.value); setShowCityList(true); clearFieldError("city"); }}
                            onFocus={() => setShowCityList(true)}
                            onBlur={() => setTimeout(() => setShowCityList(false), 200)}
                            className="pl-9 h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                            disabled={!selectedState || loadingCities}
                          />
                        </>
                      )}
                      {showCityList && !selectedCity && filteredCities.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg max-h-32 overflow-y-auto border border-white/15">
                          {filteredCities.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-white/10 text-sm text-white border-b border-white/5 last:border-0"
                              onMouseDown={() => { setSelectedCity(c); setCityQuery(""); setShowCityList(false); clearFieldError("city"); }}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                      {showCityList && !selectedCity && filteredCities.length === 0 && selectedState && !loadingCities && (
                        <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg p-3 text-center border border-white/15">
                          <p className="text-xs text-white/40">Nenhum município encontrado neste estado</p>
                        </div>
                      )}
                    </div>
                  </FieldWrapperDark>

                  {/* Rede de ensino — somente para funcionários da escola */}
                  {!isCommunity && (
                  <FieldWrapperDark label="Rede de ensino" compact>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setSelectedNetwork("estadual"); clearFieldError("network"); }}
                        className={`py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          selectedNetwork === "estadual"
                            ? "bg-white/20 text-white shadow-sm border border-white/30"
                            : "bg-white/5 text-white/50 hover:text-white/70 border border-transparent"
                        }`}
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        Estadual
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedNetwork("municipal"); clearFieldError("network"); }}
                        className={`py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          selectedNetwork === "municipal"
                            ? "bg-white/20 text-white shadow-sm border border-white/30"
                            : "bg-white/5 text-white/50 hover:text-white/70 border border-transparent"
                        }`}
                      >
                        <Building2 className="h-3.5 w-3.5" />
                        Municipal
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedNetwork("federal"); clearFieldError("network"); }}
                        className={`py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          selectedNetwork === "federal"
                            ? "bg-white/20 text-white shadow-sm border border-white/30"
                            : "bg-white/5 text-white/50 hover:text-white/70 border border-transparent"
                        }`}
                      >
                        <Shield className="h-3.5 w-3.5" />
                        Federal
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedNetwork("particular"); clearFieldError("network"); }}
                        className={`py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          selectedNetwork === "particular"
                            ? "bg-white/20 text-white shadow-sm border border-white/30"
                            : "bg-white/5 text-white/50 hover:text-white/70 border border-transparent"
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Particular
                      </button>
                    </div>
                  </FieldWrapperDark>
                  )}

                  {/* Campos exclusivos para usuário da Comunidade */}
                  {isCommunity && (
                  <>


                    <FieldWrapperDark label="CEP" compact>
                      <Input
                        inputMode="numeric"
                        value={addrCep}
                        onChange={(e) => {
                          const v = maskCEP(e.target.value);
                          setAddrCep(v);
                          clearFieldError("addrCep");
                          if (v.replace(/\D/g, "").length === 8) lookupCep(v);
                        }}
                        placeholder={cepLoading ? "Buscando..." : "00000-000"}
                        className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                      />
                    </FieldWrapperDark>

                    <div className="grid grid-cols-[1fr_80px] gap-2">
                      <FieldWrapperDark label="Rua" compact>
                        <Input
                          value={addrStreet}
                          onChange={(e) => { setAddrStreet(toProperCase(e.target.value)); clearFieldError("addrStreet"); }}
                          placeholder="Rua / Avenida"
                          className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                        />
                      </FieldWrapperDark>
                      <FieldWrapperDark label="Nº" compact>
                        <Input
                          value={addrNumber}
                          onChange={(e) => { setAddrNumber(e.target.value); clearFieldError("addrNumber"); }}
                          placeholder="123"
                          className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                        />
                      </FieldWrapperDark>
                    </div>

                    <FieldWrapperDark label="Bairro" compact>
                      <Input
                        value={addrNeighborhood}
                        onChange={(e) => { setAddrNeighborhood(toProperCase(e.target.value)); clearFieldError("addrNeighborhood"); }}
                        placeholder="Bairro"
                        className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                      />
                    </FieldWrapperDark>

                    <div className="grid grid-cols-[1fr_80px] gap-2">
                      <FieldWrapperDark label="Cidade" compact>
                        <Input
                          value={addrCity}
                          onChange={(e) => { setAddrCity(toProperCase(e.target.value)); clearFieldError("addrCity"); }}
                          placeholder="Cidade"
                          className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                        />
                      </FieldWrapperDark>
                      <FieldWrapperDark label="UF" compact>
                        <Input
                          value={addrUf}
                          onChange={(e) => { setAddrUf(e.target.value.toUpperCase().slice(0, 2)); clearFieldError("addrUf"); }}
                          placeholder="UF"
                          className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs uppercase"
                        />
                      </FieldWrapperDark>
                    </div>

                    <FieldWrapperDark label="Ocupação" compact>
                      <select
                        value={occupation}
                        onChange={(e) => { setOccupation(e.target.value); setOccupationDetail(""); clearFieldError("occupation"); }}
                        className="w-full h-8 rounded-xl bg-white/[0.14] border border-amber-200/30 text-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:border-amber-300/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      >
                        <option value="" className="bg-[hsl(220,50%,15%)]">Selecione...</option>
                        {OCCUPATIONS.map(o => (
                          <option key={o.value} value={o.value} className="bg-[hsl(220,50%,15%)]">{o.label}</option>
                        ))}
                      </select>
                    </FieldWrapperDark>

                    {occupation && occupation !== "outro" && (
                      <FieldWrapperDark label="Especifique" compact>
                        <select
                          value={occupationDetail}
                          onChange={(e) => { setOccupationDetail(toProperCase(e.target.value)); clearFieldError("occupationDetail"); }}
                          className="w-full h-8 rounded-xl bg-white/[0.14] border border-amber-200/30 text-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:border-amber-300/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        >
                          <option value="" className="bg-[hsl(220,50%,15%)]">Selecione...</option>
                          {OCCUPATION_SUBS[occupation].map(s => (
                            <option key={s} value={s} className="bg-[hsl(220,50%,15%)]">{s}</option>
                          ))}
                        </select>
                      </FieldWrapperDark>
                    )}
                    {occupation === "outro" && (
                      <FieldWrapperDark label="Descreva sua ocupação" compact>
                        <Input
                          value={occupationDetail}
                          onChange={(e) => { setOccupationDetail(toProperCase(e.target.value)); clearFieldError("occupationDetail"); }}
                          placeholder="Ex.: aposentado, do lar..."
                          className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                          maxLength={80}
                        />
                      </FieldWrapperDark>
                    )}
                    {/* Documento de identidade (opcional no cadastro, obrigatório após aprovação) */}
                    <div className="rounded-xl bg-white/5 border border-white/15 p-2.5 space-y-2">
                      <p className="text-[10px] font-bold text-white/80 leading-snug">
                        Identidade (opcional agora) — frente e verso
                      </p>
                      <p className="text-[9px] text-white/50 leading-snug">
                        Se preferir, envie depois da aprovação. Sem esses arquivos, a gestora pedirá no 1º acesso.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: "front", file: idDocFront, set: setIdDocFront, label: "Frente" },
                          { key: "back", file: idDocBack, set: setIdDocBack, label: "Verso" },
                        ] as const).map((it) => (
                          <label key={it.key} className="relative flex flex-col items-center justify-center gap-1 h-16 rounded-lg border border-dashed border-white/25 bg-white/5 cursor-pointer hover:bg-white/10 transition overflow-hidden">
                            {it.file ? (
                              <>
                                <img src={URL.createObjectURL(it.file)} alt={it.label} className="absolute inset-0 w-full h-full object-cover" />
                                <span className="relative z-10 text-[10px] font-bold text-white bg-black/40 px-1.5 rounded">{it.label} ✓</span>
                              </>
                            ) : (
                              <>
                                <Camera className="h-4 w-4 text-white/60" />
                                <span className="text-[10px] font-semibold text-white/70">{it.label}</span>
                              </>
                            )}
                            <input type="file" accept="image/*" capture="environment" className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                if (f && f.size > 8 * 1024 * 1024) { alert("Máximo 8MB"); return; }
                                it.set(f);
                              }} />
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                  )}

                  {/* Escola */}
                  <FieldWrapperDark label="Escola" compact>
                    {selectedSchool ? (
                      <div className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 p-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                          <MapPin className="h-3.5 w-3.5 text-white/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs truncate text-white">{selectedSchool.name}</p>
                          <p className="text-[10px] text-white/40">{selectedSchool.city} — {selectedSchool.state}</p>
                        </div>
                        <button type="button" onClick={() => { setSelectedSchool(null); setSchoolQuery(""); }}
                          className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white/40 hover:text-white">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                        <Input
                          placeholder={!isCommunity && !selectedNetwork ? "Selecione a rede primeiro" : loadingSchools ? "Carregando escolas..." : isCommunity ? "Buscar escola..." : `Buscar escola ${selectedNetwork}...`}
                          value={schoolQuery}
                          onChange={(e) => { const val = e.target.value.replace(/[@]/g, ''); setSchoolQuery(val); setShowSchoolList(true); }}
                          onFocus={() => setShowSchoolList(true)}
                          onBlur={() => setTimeout(() => setShowSchoolList(false), 200)}
                          className="pl-9 h-9 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-sm"
                          disabled={(!isCommunity && !selectedNetwork) || loadingSchools}
                        />
                        {showSchoolList && (isCommunity || selectedNetwork) && filteredSchools.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg max-h-40 overflow-y-auto border border-white/15">
                            {filteredSchools.slice(0, 15).map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-white/10 text-sm text-white border-b border-white/5 last:border-0"
                                onMouseDown={() => { setSelectedSchool(s); setShowSchoolList(false); setSchoolQuery(""); }}
                              >
                                <p className="font-semibold text-xs">{s.name}</p>
                                <p className="text-[10px] text-white/40">{s.city}</p>
                              </button>
                            ))}
                          </div>
                        )}
                        {showSchoolList && (isCommunity || selectedNetwork) && filteredSchools.length === 0 && !loadingSchools && (
                          <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg p-3 text-center border border-white/15">
                            <p className="text-xs text-white/40">Nenhuma escola encontrada</p>
                          </div>
                        )}
                      </div>
                    )}
                  </FieldWrapperDark>

                  {/* Aviso de plano da escola */}
                  {selectedSchool && checkingAccess && (
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                      <p className="text-xs text-white/60">Verificando plano da escola...</p>
                    </div>
                  )}
                  {selectedSchool && !checkingAccess && schoolAccessLevel === "blocked" && (
                    <div className="rounded-xl bg-red-500/15 border border-red-400/40 p-3 space-y-2 animate-fade-in">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="h-4 w-4 text-red-300 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-red-100">Esta escola ainda não assinou o plano</p>
                          <p className="text-[11px] text-red-100/80 leading-snug mt-1">
                            Você pode visualizá-la, mas o cadastro só será liberado quando o(a) gestor(a) assinar o plano.
                            Solicite ao gestor da sua escola{schoolGestor?.full_name ? ` (${schoolGestor.full_name})` : ""} a assinatura.
                          </p>
                        </div>
                      </div>
                      {schoolGestor?.phone && (
                        <a
                          href={`https://wa.me/${schoolGestor.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${schoolGestor.full_name}, preciso me cadastrar no app de Agendamento Escolar mas a escola ainda não tem plano ativo. Pode assinar para liberar?`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-green-500 hover:bg-green-400 text-white text-xs font-bold transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Falar com o gestor no WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                  {selectedSchool && !checkingAccess && schoolAccessLevel === "grace" && (
                    <div className="rounded-xl bg-amber-500/15 border border-amber-400/40 p-2.5 animate-fade-in">
                      <p className="text-[11px] text-amber-100 leading-snug">
                        ⚠️ Plano da escola em período de carência. Cadastro liberado, mas peça ao gestor para regularizar.
                      </p>
                    </div>
                  )}

                  {/* Avançar */}
                  <div className="pt-2">
                    <Button
                      type="button"
                      onClick={() => {
                        const errors: Record<string, string> = {};
                        if (!selectedRole) errors.role = "Selecione sua função";
                        else if (!allowedRoleSchema.safeParse(selectedRole).success) {
                          errors.role = "Função inválida. Selecione uma das opções da lista.";
                        }
                        if (!selectedGender) errors.gender = "Selecione seu sexo";
                        if (!fullName.trim()) errors.fullName = "Informe seu nome completo";
                        if (!phone.trim()) errors.phone = "Informe seu celular (WhatsApp)";
                        if (!selectedState) errors.state = "Selecione seu estado";
                        if (!selectedCity) errors.city = "Selecione seu município";
                        if (!isCommunity && !selectedNetwork) errors.network = "Selecione a rede de ensino";
                        if (!isValidCPF(cpf)) errors.cpf = "Informe um CPF válido";
                        if (isCommunity) {
                          if (addrCep.replace(/\D/g, "").length !== 8) errors.addrCep = "Informe um CEP válido";
                          if (!addrStreet.trim()) errors.addrStreet = "Informe a rua";
                          if (!addrNumber.trim()) errors.addrNumber = "Informe o número";
                          if (!addrNeighborhood.trim()) errors.addrNeighborhood = "Informe o bairro";
                          if (!addrCity.trim()) errors.addrCity = "Informe a cidade";
                          if (addrUf.length !== 2) errors.addrUf = "Informe a UF";
                          if (!occupation) errors.occupation = "Selecione sua ocupação";
                          if (!occupationDetail.trim()) errors.occupationDetail = "Especifique sua ocupação";
                        }
                        if (!selectedSchool) errors.school = "Selecione sua escola";
                        if (selectedSchool && schoolAccessLevel === "blocked") errors.school = "Escola sem plano ativo. Peça ao gestor para assinar.";
                        if (selectedSchool && checkingAccess) errors.school = "Aguarde a verificação do plano da escola...";
                        if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
                        setFieldErrors({});
                        setSignUpStep(2);
                      }}
                      className={`w-full h-12 rounded-xl font-bold text-base shadow-lg transition-all duration-300 border-0 gap-2 text-white ${
                        Object.keys(fieldErrors).length > 0
                          ? "bg-red-500/80 hover:bg-red-500/70"
                          : "bg-white/15 hover:bg-white/25 border border-white/20"
                      }`}
                    >
                      <span>{Object.keys(fieldErrors).length > 0 ? Object.values(fieldErrors)[0] : "Avançar"}</span>
                      {Object.keys(fieldErrors).length === 0 && <ArrowRight className="h-5 w-5" />}
                    </Button>
                  </div>
                </div>
              ) : signUpStep === 2 ? (
                <div className="space-y-2 animate-fade-in">
                  <div className="w-full h-10 rounded-xl font-bold text-sm text-center flex items-center justify-center bg-gradient-to-r from-[hsl(0,70%,65%)] to-[hsl(35,95%,55%)] text-white shadow-md cursor-default select-none">
                    Cont. do cadastro
                  </div>

                  {/* Mini Relatório */}
                  <div className="rounded-xl border border-white/15 bg-white/5 p-2 space-y-2">
                    <p className="text-sm font-bold text-white/80 flex items-center gap-1.5">
                      <UserCheck className="h-4 w-4" />
                      Resumo dos seus dados
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                      <div>
                        <span className="text-white/50 text-xs">Função:</span>
                        <p className="font-semibold text-white/90 break-words leading-tight">{ROLES.find(r => r.value === selectedRole)?.label || "—"}</p>
                      </div>
                      <div>
                        <span className="text-white/50 text-xs">Nome:</span>
                        <p className="font-semibold text-white/90 break-words leading-tight">{fullName || "—"}</p>
                      </div>
                      <div>
                        <span className="text-white/50 text-xs">WhatsApp:</span>
                        <p className="font-semibold text-white/90 leading-tight">{phone || "—"}</p>
                      </div>
                      <div>
                        <span className="text-white/50 text-xs">Estado:</span>
                        <p className="font-semibold text-white/90 leading-tight">{selectedState || "—"}</p>
                      </div>
                      <div>
                        <span className="text-white/50 text-xs">Município:</span>
                        <p className="font-semibold text-white/90 break-words leading-tight">{selectedCity || "—"}</p>
                      </div>
                      {!isCommunity ? (
                        <div>
                          <span className="text-white/50 text-xs">Rede:</span>
                          <p className="font-semibold capitalize text-white/90 leading-tight">{selectedNetwork || "—"}</p>
                        </div>
                      ) : null}
                      <div>
                        <span className="text-white/50 text-xs">CPF:</span>
                        <p className="font-semibold text-white/90 leading-tight">{cpf || "—"}</p>
                      </div>
                    </div>
                    {isCommunity && (
                      <div className="pt-1.5 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                        <div>
                          <span className="text-white/50 text-xs">Ocupação:</span>
                          <p className="font-semibold text-white/90 break-words leading-tight">
                            {OCCUPATIONS.find(o => o.value === occupation)?.label || "—"}
                            {occupationDetail ? ` — ${occupationDetail}` : ""}
                          </p>
                        </div>
                        <div>
                          <span className="text-white/50 text-xs">Endereço:</span>
                          <p className="font-semibold text-white/90 break-words leading-tight">
                            {[addrStreet, addrNumber].filter(Boolean).join(", ") || "—"}
                            {addrNeighborhood ? ` — ${addrNeighborhood}` : ""}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedSchool && (
                      <div className="pt-1.5 border-t border-white/10">
                        <span className="text-xs text-white/50">Escola:</span>
                        <p className="text-sm font-semibold text-white/90 break-words leading-tight">{selectedSchool.name}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const q = encodeURIComponent(`${selectedSchool.name}, ${selectedSchool.city} - ${selectedSchool.state}`);
                            window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
                          }}
                          className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gradient-to-r from-[hsl(210,80%,50%)] to-[hsl(190,75%,45%)] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-all"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Ver minha escola no mapa
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </button>
                      </div>
                    )}
                  </div>


                  {/* Email */}
                  <FieldWrapperDark label="Email" compact>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                      placeholder="seu@email.com"
                      className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                      required
                    />
                  </FieldWrapperDark>

                  {/* Confirmar Email */}
                  <FieldWrapperDark label="Confirmar Email" compact>
                    <Input
                      type="email"
                      value={confirmEmail}
                      onChange={(e) => { setConfirmEmail(e.target.value); clearFieldError("confirmEmail"); }}
                      placeholder="Confirme seu email"
                      className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
                      required
                    />
                  </FieldWrapperDark>

                  {/* Senha */}
                  <FieldWrapperDark label="Senha" compact>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                        placeholder="Ex.: Esc@2026"
                        className="h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs pr-9"
                        minLength={6}
                        maxLength={10}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={password} />
                  </FieldWrapperDark>

                  {/* Criar conta */}
                  <div className="pt-1">
                    <Button
                      type="button"
                      onClick={() => {
                        const errors = validateStep2();
                        if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
                        setFieldErrors({});
                        setPasswordReminderOpen(true);
                      }}
                      className={`w-full h-12 rounded-xl font-bold text-base shadow-lg transition-all duration-300 border-0 gap-2 text-white ${
                        Object.keys(fieldErrors).length > 0
                          ? "bg-red-500/80 hover:bg-red-500/70"
                          : "bg-white/15 hover:bg-white/25 border border-white/20"
                      }`}
                      disabled={loading}
                    >
                      {Object.keys(fieldErrors).length > 0 ? (
                        <span>{Object.values(fieldErrors)[0]}</span>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {loading ? "Criando conta..." : "Criar minha conta"}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Voltar */}
                  <Button
                    type="button"
                    onClick={() => { setFieldErrors({}); setSignUpStep(1); }}
                    className="w-full h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-base border border-white/15 gap-2"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    Voltar
                  </Button>
                </div>
              ) : signUpStep === 3 ? (
                /* ====== TELA DE BOAS-VINDAS (pós cadastro) ====== */
                <div className="space-y-3 animate-fade-in">
                  <div className="text-center space-y-2 py-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 mx-auto">
                      <Sparkles className="h-8 w-8 text-white/80" />
                    </div>
                    <h2 className="text-xl font-extrabold font-display text-white">
                      {selectedGender === "feminino" ? "Bem-vinda!" : "Bem-vindo!"}
                    </h2>
                    <p className="text-xs text-white/50 leading-relaxed">
                      Sua conta foi criada com sucesso, <span className="font-semibold text-white/80">{fullName.split(" ")[0]}</span>! 🎉<br />
                      {selectedRole === "gestor_pedagogico" 
                        ? "Você tem 7 dias grátis para testar o sistema. Após este período, a assinatura será necessária."
                        : "Verifique seu email para ativar sua conta."}
                    </p>
                  </div>

                  {/* Avaliação */}
                  <div className="rounded-xl border border-white/15 bg-white/5 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-white/60">⭐ Avalie sua experiência de cadastro</p>
                    <div className="flex items-center justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className={`text-2xl transition-all ${
                            star <= feedbackRating ? "text-yellow-400 scale-110" : "text-white/20 hover:text-yellow-300"
                          }`}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      placeholder="Deixe aqui sua sugestão, crítica ou elogio..."
                      className="w-full min-h-[60px] rounded-lg bg-white/10 border-white/15 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
                      maxLength={500}
                    />

                    <Button
                      type="button"
                      onClick={sendFeedbackWhatsApp}
                      disabled={feedbackRating === 0}
                      className="w-full h-10 rounded-xl bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white font-bold text-xs border-0 gap-2 disabled:opacity-40"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Enviar avaliação via WhatsApp
                    </Button>
                  </div>

                  {/* Ajuda Financeira */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5">
                    <p className="text-[11px] font-bold text-white/50">💰 Apoie o AgenSchool</p>
                    <p className="text-[10px] text-white/40 leading-relaxed">
                      Quer contribuir financeiramente para manter e melhorar o app? Entre em contato pelo WhatsApp.
                    </p>
                    <Button
                      type="button"
                      onClick={sendFinancialHelpWhatsApp}
                      className="w-full h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/15 gap-2"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Contribuir via WhatsApp
                    </Button>
                  </div>

                  {/* Entrar no App */}
                  <Button
                    type="button"
                    onClick={() => openAccessDialog("login")}
                    className="w-full h-12 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-base border border-white/20 shadow-lg transition-all duration-300 gap-2"
                  >
                    <LogIn className="h-5 w-5" />
                    Entrar no app
                  </Button>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>

        {/* Buscador de profissão */}
        <Dialog open={roleSearchOpen} onOpenChange={setRoleSearchOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border border-amber-300/30 text-white" style={{ background: "linear-gradient(150deg, hsl(215,70%,22%) 0%, hsl(225,65%,12%) 100%)" }}>
            <DialogHeader className="px-5 pt-5 pb-2">
              <DialogTitle className="text-xl font-extrabold tracking-tight text-white">Qual é a sua função?</DialogTitle>
              <DialogDescription className="text-white/60 text-xs">
                Busque e selecione sua profissão na escola.
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                <Input
                  autoFocus
                  value={roleQuery}
                  onChange={(e) => setRoleQuery(e.target.value)}
                  placeholder="Ex.: professor, biblioteca, gestão..."
                  className="pl-9 h-11 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl"
                />
              </div>
            </div>
            <div className="px-3 pb-4 max-h-[52vh] overflow-y-auto space-y-1.5">
              {SIGNUP_ROLES.filter((r) => {
                const q = removeAccents(roleQuery).toLowerCase().trim();
                if (!q) return true;
                return removeAccents(roleLabel(r.value)).toLowerCase().includes(q)
                  || removeAccents(r.label).toLowerCase().includes(q);
              }).map((r) => {
                const isSelected = selectedRole === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => {
                      setSelectedRole(r.value);
                      clearFieldError("role");
                      setRoleSearchOpen(false);
                    }}
                    style={{ ...sectorButtonStyle(sectorColor, isSelected), borderRadius: 14 }}
                    className="w-full min-h-[52px] px-3 py-2 flex items-center gap-3 text-left transition-[filter] hover:brightness-125"
                  >
                    <UserCheck className="h-4 w-4 shrink-0 text-white" />
                    <span className="flex-1 text-sm font-bold text-white break-words">{roleLabel(r.value)}</span>
                    {isSelected && <Check className="h-4 w-4 text-white shrink-0" />}
                  </button>
                );
              })}
              {SIGNUP_ROLES.filter((r) => {
                const q = removeAccents(roleQuery).toLowerCase().trim();
                return !q || removeAccents(roleLabel(r.value)).toLowerCase().includes(q);
              }).length === 0 && (
                <p className="text-center text-white/50 text-sm py-6">Nenhuma função encontrada.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>


        <Dialog open={passwordReminderOpen} onOpenChange={(o) => !loading && setPasswordReminderOpen(o)}>
          <DialogContent className="max-w-md bg-gradient-to-br from-[hsl(220,55%,18%)] to-[hsl(225,60%,12%)] border border-amber-300/40 text-white">
            <DialogHeader>
              <DialogTitle className="text-amber-200 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Antes de criar sua conta — guarde sua senha!
              </DialogTitle>
              <DialogDescription className="text-white/75 text-sm leading-relaxed pt-1">
                Por segurança, <strong className="text-amber-200">memorize</strong> ou <strong className="text-amber-200">salve em local seguro</strong> seu email e senha agora. Tire um print, anote no celular ou em um caderno. Se esquecer, será necessário recuperar pelo email.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2"><span className="text-white/50">Email:</span><span className="font-mono font-semibold text-white text-right break-all">{email}</span></div>
              <div className="flex justify-between gap-2"><span className="text-white/50">Senha:</span><span className="font-mono font-semibold text-amber-200">{password}</span></div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-amber-200/90">
                Dica de memorização (opcional)
              </Label>
              <p className="text-[11px] text-white/55 leading-snug">
                Escolha uma palavra-chave pessoal que te faça lembrar da senha:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Nome do meu primeiro carro",
                  "Cidade onde nasci",
                  "Estado onde nasci",
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPasswordHint(s + ": ")}
                    className="text-[10px] px-2 py-1 rounded-lg bg-white/10 hover:bg-amber-400/30 border border-white/15 hover:border-amber-300/60 text-white/80 hover:text-amber-100 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Input
                value={passwordHint}
                onChange={(e) => setPasswordHint(toProperCase(e.target.value))}
                placeholder="Ex.: Nome do meu primeiro carro: Fusca → senha tem 'Fusc@'"
                className="h-9 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/40 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 text-xs"
              />
              <p className="text-[10px] text-white/40 italic">
                Esta dica fica salva só neste dispositivo — para ajudar você a lembrar na hora de entrar.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                disabled={loading}
                onClick={() => {
                  try {
                    const key = `lov:pwdHint:${email.trim().toLowerCase()}`;
                    if (passwordHint.trim()) localStorage.setItem(key, passwordHint.trim());
                    else localStorage.removeItem(key);
                  } catch {}
                  setPasswordReminderOpen(false);
                  handleSignUp({ preventDefault: () => {} } as React.FormEvent);
                }}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[hsl(220,60%,15%)] font-extrabold gap-2 shadow-lg"
              >
                <Sparkles className="h-4 w-4" />
                {loading ? "Criando conta..." : "Já salvei a senha — criar conta"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => setPasswordReminderOpen(false)}
                className="w-full h-9 rounded-xl text-white/70 hover:text-white hover:bg-white/10 text-xs"
              >
                Voltar e revisar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function FieldWrapperDark({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  const { color } = useSectorPreferences();
  const dotBg = `linear-gradient(135deg, hsla(${color.hueA}, ${color.satA + 10}%, ${color.lightA + 15}%, 1), hsla(${color.hueB}, ${color.satB}%, ${color.lightB}%, 1))`;
  const dotShadow = `0 0 6px hsla(${color.hueA}, 95%, 65%, 0.7), 0 0 12px hsla(${color.hueA}, 90%, 55%, 0.35)`;
  const labelColor = `hsla(${color.hueA}, 85%, 80%, 0.95)`;
  const lineBg = `linear-gradient(90deg, hsla(${color.hueA}, 90%, 65%, 0.55), hsla(${color.hueB}, 80%, 55%, 0))`;
  return (
    <div
      className={compact ? "space-y-1" : "space-y-1.5"}
      style={
        {
          // CSS vars consumidas por inputs/selects internos pra herdar o tom do tema
          "--field-accent": `hsla(${color.hueA}, 90%, 65%, 0.55)`,
          "--field-accent-strong": `hsla(${color.hueA}, 95%, 70%, 0.9)`,
          "--field-glow": `0 0 0 2px hsla(${color.hueA}, 95%, 70%, 0.35), 0 0 14px hsla(${color.hueA}, 90%, 55%, 0.4)`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: dotBg, boxShadow: dotShadow }}
        />
        <Label
          className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: labelColor, textShadow: `0 1px 2px hsla(${color.hueC}, 80%, 5%, 0.6)` }}
        >
          {label}
        </Label>
        <span
          aria-hidden
          className="flex-1 h-px rounded-full"
          style={{ background: lineBg }}
        />
      </div>
      <div
        className="rounded-xl p-px"
        style={{
          background: `linear-gradient(135deg, hsla(${color.hueA}, 90%, 65%, 0.45), hsla(${color.hueB}, 80%, 50%, 0.12) 60%, transparent)`,
          boxShadow: `0 1px 0 hsla(${color.hueA}, 90%, 80%, 0.18) inset, 0 6px 14px hsla(${color.hueC}, 70%, 5%, 0.45)`,
        }}
      >
        <div
          className="rounded-[11px]"
          style={{ background: `hsla(${color.hueC}, 60%, 8%, 0.55)` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function ExplorarEscolasBR() {
  const [explState, setExplState] = useState("");
  const [showExplStates, setShowExplStates] = useState(false);
  const [explStateQuery, setExplStateQuery] = useState("");
  const [brQuery, setBrQuery] = useState("");
  const [brResults, setBrResults] = useState<School[]>([]);
  const [brLoading, setBrLoading] = useState(false);
  const [brOpen, setBrOpen] = useState(false);

  const filteredExplStates = BRAZILIAN_STATES.filter(
    (s) => explStateQuery.length === 0 || s.name.toLowerCase().includes(explStateQuery.toLowerCase()) || s.uf.toLowerCase().includes(explStateQuery.toLowerCase())
  );

  useEffect(() => {
    if (!explState || brQuery.length < 2) { setBrResults([]); return; }
    const timer = setTimeout(async () => {
      setBrLoading(true);
      const normalized = removeAccents(brQuery.toLowerCase());
      const terms = normalized.trim().split(/\s+/);
      const orFilters = terms.map(t => `name.ilike.%${t}%,city.ilike.%${t}%`).join(",");
      const { data } = await supabase
        .from("schools")
        .select("*")
        .eq("state", explState)
        .eq("is_active", true)
        .or(orFilters)
        .limit(15);
      setBrResults(data || []);
      setBrLoading(false);
      setBrOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [brQuery, explState]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 space-y-1.5">
      <p className="text-[11px] font-bold text-white/50 flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Explorar escolas do Brasil
      </p>
      <div className="relative">
        {explState ? (
          <div className="flex items-center gap-2 h-7 rounded-lg bg-white/10 border border-white/20 px-2.5">
            <MapPin className="h-3 w-3 text-white/60" />
            <span className="flex-1 text-xs font-medium text-white">
              {BRAZILIAN_STATES.find(s => s.uf === explState)?.name} ({explState})
            </span>
            <button type="button" onClick={() => { setExplState(""); setExplStateQuery(""); setBrQuery(""); setBrResults([]); }}
              className="text-white/40 hover:text-white">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" />
            <Input
              placeholder="Selecione o estado..."
              value={explStateQuery}
              onChange={(e) => { setExplStateQuery(e.target.value); setShowExplStates(true); }}
              onFocus={() => setShowExplStates(true)}
              onBlur={() => setTimeout(() => setShowExplStates(false), 200)}
              className="pl-8 h-7 rounded-lg bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-[11px]"
            />
          </>
        )}
        {showExplStates && !explState && (
          <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg max-h-32 overflow-y-auto border border-white/15">
            {filteredExplStates.map((s) => (
              <button key={s.uf} type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-xs text-white border-b border-white/5 last:border-0"
                onMouseDown={() => { setExplState(s.uf); setExplStateQuery(""); setShowExplStates(false); }}
              >
                <span className="font-semibold">{s.uf}</span> — {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {explState && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
          <Input
            placeholder={`Buscar escola em ${explState}...`}
            value={brQuery}
            onChange={(e) => { setBrQuery(e.target.value.replace(/[@]/g, '')); setBrOpen(true); }}
            onFocus={() => brResults.length > 0 && setBrOpen(true)}
            onBlur={() => setTimeout(() => setBrOpen(false), 200)}
            className="pl-9 h-8 rounded-xl bg-white/[0.14] border-amber-200/30 text-white placeholder:text-white/55 focus-visible:ring-amber-400/70 focus-visible:border-amber-300/80 focus-visible:ring-offset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-xs"
          />
          {brOpen && brResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg max-h-36 overflow-y-auto border border-white/15">
              {brResults.map((s) => (
                <button key={s.id} type="button"
                  className="w-full text-left px-3 py-2 hover:bg-white/10 text-sm text-white border-b border-white/5 last:border-0 flex items-center gap-2"
                  onMouseDown={() => {
                    const q = encodeURIComponent(`${s.name}, ${s.city} - ${s.state}`);
                    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs truncate">{s.name}</p>
                    <p className="text-[10px] text-white/40">{s.city} • <span className="capitalize">{s.network}</span></p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-white/40 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {brOpen && brQuery.length >= 2 && brResults.length === 0 && !brLoading && (
            <div className="absolute z-50 mt-1 w-full rounded-xl bg-[hsl(220,50%,15%)] shadow-lg p-3 text-center border border-white/15">
              <p className="text-xs text-white/40">Nenhuma escola encontrada em {explState}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

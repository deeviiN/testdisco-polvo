import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

const SESSION_BOOT_TIMEOUT_MS = 3500;
const PROFILE_BOOT_TIMEOUT_MS = 5000;
const PROFILE_CACHE_PREFIX = "sala-vida-profile:";

const getProfileCacheKey = (userId: string) => `${PROFILE_CACHE_PREFIX}${userId}`;

const readCachedProfile = (userId: string): Profile | null => {
  try {
    const raw = localStorage.getItem(getProfileCacheKey(userId));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
};

const writeCachedProfile = (userId: string, profile: Profile) => {
  try {
    localStorage.setItem(getProfileCacheKey(userId), JSON.stringify(profile));
  } catch {
    // noop
  }
};

// Patch history methods once so we can listen to SPA navigations from
// outside React Router (AuthProvider is mounted above <BrowserRouter>).
const LOCATION_CHANGE_EVENT = "lovable:locationchange";
if (typeof window !== "undefined" && !(window as any).__locationChangePatched) {
  (window as any).__locationChangePatched = true;
  const fire = () => window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  const origPush = window.history.pushState;
  const origReplace = window.history.replaceState;
  window.history.pushState = function (...args) {
    const r = origPush.apply(this, args as any);
    fire();
    return r;
  } as any;
  window.history.replaceState = function (...args) {
    const r = origReplace.apply(this, args as any);
    fire();
    return r;
  } as any;
  window.addEventListener("popstate", fire);
}

const AS_SCHOOL_STORAGE_KEY = "lovable:as_school";
const AS_USER_STORAGE_KEY = "lovable:as_user";

export type ImpersonatedUser = {
  user_id: string;
  full_name: string | null;
  phone?: string | null;
  role: string;
};

const readAsSchoolParam = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const path = window.location.pathname || "";
    if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/auth")) {
      return null;
    }
    const fromUrl = new URLSearchParams(window.location.search).get("as_school");
    if (fromUrl) {
      sessionStorage.setItem(AS_SCHOOL_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(AS_SCHOOL_STORAGE_KEY);
  } catch {
    return null;
  }
};

const readAsUserParam = (): ImpersonatedUser | null => {
  if (typeof window === "undefined") return null;
  try {
    const path = window.location.pathname || "";
    if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/auth")) {
      return null;
    }
    const raw = sessionStorage.getItem(AS_USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonatedUser;
  } catch {
    return null;
  }
};

export const clearAdminAsSchool = () => {
  try { sessionStorage.removeItem(AS_SCHOOL_STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(AS_USER_STORAGE_KEY); } catch {}
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFetchRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback((userId: string) => {
    if (profileFetchRef.current?.userId === userId) {
      return profileFetchRef.current.promise;
    }

    const request = (async () => {
      const loadingGuard = window.setTimeout(() => {
        setLoading(false);
      }, PROFILE_BOOT_TIMEOUT_MS);

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) throw error;
        if (currentUserIdRef.current !== userId) return;

        if (data) {
          setProfile(data);
          writeCachedProfile(userId, data);
        } else {
          setProfile(null);
        }
      } catch (error) {
        if (currentUserIdRef.current === userId) {
          console.warn("Falha ao carregar perfil:", error);
        }
      } finally {
        clearTimeout(loadingGuard);

        if (currentUserIdRef.current === userId) {
          setLoading(false);
        }

        if (profileFetchRef.current?.userId === userId) {
          profileFetchRef.current = null;
        }
      }
    })();

    profileFetchRef.current = { userId, promise: request };
    return request;
  }, []);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const sessionPromise = supabase.auth
        .getSession()
        .then(({ data }) => data.session)
        .catch(() => null);

      const timeoutPromise = new Promise<Session | null>((resolve) => {
        setTimeout(() => resolve(null), SESSION_BOOT_TIMEOUT_MS);
      });

      const initialSession = await Promise.race([sessionPromise, timeoutPromise]);
      if (!mounted) return;

      currentUserIdRef.current = initialSession?.user?.id ?? null;
      setSession(initialSession);

      if (initialSession?.user) {
        const cached = readCachedProfile(initialSession.user.id);
        if (cached) {
          setProfile(cached);
          setLoading(false);
        }
        fetchProfile(initialSession.user.id);
      } else {
        setLoading(false);
      }
    };

    boot();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      currentUserIdRef.current = nextSession?.user?.id ?? null;
      setSession(nextSession);

      if (nextSession?.user) {
        const cached = readCachedProfile(nextSession.user.id);
        if (cached) {
          setProfile(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }

        setTimeout(() => fetchProfile(nextSession.user.id), 0);
      } else {
        setProfile(null);
        profileFetchRef.current = null;
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Realtime: atualiza o profile do próprio usuário quando o gestor
  // aprovar/alterar (is_approved, role, etc.) sem precisar recarregar.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const channel = supabase
      .channel(`profile-self-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Realtime event on profiles table:", payload);
          if (currentUserIdRef.current !== userId) return;
          if (payload.eventType === "DELETE") {
            setProfile(null);
            return;
          }
          const next = (payload.new ?? null) as Profile | null;
          if (next) {
            console.log("Realtime profile update detected:", next);
            setProfile(next);
            writeCachedProfile(userId, next);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    await fetchProfile(session.user.id);
  }, [fetchProfile, session?.user?.id]);

  // ===== Admin "Acessar como Gestor" override =====
  // When an admin navigates with ?as_school=<id>, we present the panel as if
  // the admin were an approved gestor of that school. RLS continues to allow
  // it because every relevant policy already grants admins full access via
  // has_role(auth.uid(), 'admin'). This only changes the in-memory profile
  // used by the UI for filtering by school_id / role gating.
  const [asSchoolId, setAsSchoolId] = useState<string | null>(() => readAsSchoolParam());
  const [asUser, setAsUser] = useState<ImpersonatedUser | null>(() => readAsUserParam());
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  useEffect(() => {
    const update = () => {
      setAsSchoolId(readAsSchoolParam());
      setAsUser(readAsUserParam());
    };
    update();
    window.addEventListener(LOCATION_CHANGE_EVENT, update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener(LOCATION_CHANGE_EVENT, update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) { setIsGlobalAdmin(false); return; }
    // Otimista: se o profile local já indica admin, libera impersonação
    // imediatamente sem depender da RPC has_role (que pode demorar).
    if (profile?.role === "admin") setIsGlobalAdmin(true);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!cancelled) setIsGlobalAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, profile?.role]);

  const effectiveProfile: Profile | null = (() => {
    if (!profile) return profile;
    if (!asSchoolId || !isGlobalAdmin) return profile;
    const base = {
      ...profile,
      school_id: asSchoolId,
      role: "gestor_pedagogico",
      is_approved: true,
    } as Profile;
    if (asUser) {
      return {
        ...base,
        role: asUser.role,
        full_name: asUser.full_name ?? base.full_name,
      } as Profile;
    }
    return base;
  })();


  const signOut = async () => {
    if (session?.user?.id) {
      try {
        localStorage.removeItem(getProfileCacheKey(session.user.id));
      } catch {
        // noop
      }
    }

    try { sessionStorage.removeItem(AS_SCHOOL_STORAGE_KEY); } catch {}
    // Respeita "manter-me conectado": se desligado, limpa também a chave do gate.
    // A sessão da aba atual sempre encerra (sessionStorage limpo).
    try { sessionStorage.removeItem("app_access_granted_v1"); } catch {}
    try {
      const keep = localStorage.getItem("app_access_keep_v1") !== "0";
      if (!keep) localStorage.removeItem("app_access_granted_v1");
    } catch {}
    await supabase.auth.signOut();
    currentUserIdRef.current = null;
    profileFetchRef.current = null;
    setProfile(null);
    setSession(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile: effectiveProfile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

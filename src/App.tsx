import { lazy as reactLazy, Suspense, type ComponentType } from "react";

// Wrapper de lazy que recarrega a página quando um chunk antigo (de uma build
// anterior) não pode mais ser baixado após um novo deploy. Sem isso, o app
// fica em tela branca com "Failed to fetch dynamically imported module".
function lazy<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return reactLazy(async () => {
    const RELOAD_KEY = "__chunk_reload_attempt";
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* noop */ }
      return mod;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isChunkError = /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(msg);
      if (isChunkError) {
        let attempted = "0";
        try { attempted = sessionStorage.getItem(RELOAD_KEY) || "0"; } catch { /* noop */ }
        if (attempted !== "1") {
          try { sessionStorage.setItem(RELOAD_KEY, "1"); } catch { /* noop */ }
          window.location.reload();
          // Retorna uma promise pendente para evitar renderizar o erro antes do reload.
          return new Promise<{ default: T }>(() => { /* never resolves */ });
        }
      }
      throw err;
    }
  });
}
import GlobalToolbar from "@/components/GlobalToolbar";
import GlobalBackButton from "@/components/GlobalBackButton";


import { SubscriptionHeader } from "@/components/SubscriptionHeader";
import GestorTrialBanner from "@/components/GestorTrialBanner";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ViewPreferenceProvider } from "@/hooks/useViewPreference";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CustomColorsProvider } from "@/hooks/useCustomColors";
import { SectorPreferencesProvider } from "@/hooks/useSectorPreferences";
import MinimumVersionGuard from "@/components/MinimumVersionGuard";
import SchoolNotificationsBridge from "@/components/SchoolNotificationsBridge";
import DirectMessageNotificationsBridge from "@/components/DirectMessageNotificationsBridge";
import SchoolSirenBridge from "@/components/SchoolSirenBridge";
import PushNotificationsPrompt from "@/components/PushNotificationsPrompt";
import { BookingReminderOverlay } from "@/components/BookingReminderOverlay";
import ReassignmentInviteOverlay from "@/components/ReassignmentInviteOverlay";
import { CheckoutReminderOverlay } from "@/components/CheckoutReminderOverlay";
import BackendStatusBanner from "@/components/BackendStatusBanner";
import ApprovalDecisionWatcher from "@/components/ApprovalDecisionWatcher";
import GestorRouteGuard from "@/components/gestor/GestorRouteGuard";
import ApprovedRouteGuard from "@/components/ApprovedRouteGuard";
import AdminRouteGuard from "@/components/AdminRouteGuard";
import { useRemoteAppRefresh } from "@/hooks/useRemoteAppRefresh";
import CallProvider from "@/components/call/CallProvider";
import IncomingCallOverlay from "@/components/call/IncomingCallOverlay";
import ActiveCallOverlay from "@/components/call/ActiveCallOverlay";
import DesktopSidebar from "@/components/desktop/DesktopSidebar";
import DesktopBlocker from "@/components/DesktopBlocker";
import AppAccessGate from "@/components/AppAccessGate";

const Welcome = lazy(() => import("./pages/Welcome"));
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminGlobal = lazy(() => import("./pages/AdminGlobal"));
const GestorAniversariantes = lazy(() => import("./pages/GestorAniversariantes"));
const GestorApprovals = lazy(() => import("./pages/GestorApprovals"));
const SchoolAdmin = lazy(() => import("./pages/SchoolAdmin"));
const MpConfig = lazy(() => import("./pages/admin/MpConfig"));
const MpTestPix = lazy(() => import("./pages/admin/MpTestPix"));
const MpAuditLogs = lazy(() => import("./pages/admin/MpAuditLogs"));
const MpDuplicateEvents = lazy(() => import("./pages/admin/MpDuplicateEvents"));
const SupportContactSettings = lazy(() => import("./pages/admin/SupportContactSettings"));
const SchoolDeadlines = lazy(() => import("./pages/admin/SchoolDeadlines"));
const BlockedByDeadline = lazy(() => import("./pages/admin/BlockedByDeadline"));
const AdminContracts = lazy(() => import("./pages/AdminContracts"));
const AdminDocumentos = lazy(() => import("./pages/AdminDocumentos"));
const SubscriptionNotifications = lazy(() => import("./pages/admin/SubscriptionNotifications"));
const SecurityDashboard = lazy(() => import("./pages/SecurityDashboard"));
const SecurityAudit = lazy(() => import("./pages/SecurityAudit"));
const AuditDashboard = lazy(() => import("./pages/admin/AuditDashboard"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Diagnostico = lazy(() => import("./pages/Diagnostico"));
const Subscription = lazy(() => import("./pages/Subscription"));
const MultiBooking = lazy(() => import("./pages/MultiBooking"));
const SectorSelect = lazy(() => import("./pages/SectorSelect"));
const QuadraBooking = lazy(() => import("./pages/QuadraBooking"));
const QuadraBookingDate = lazy(() => import("./pages/QuadraBookingDate"));
const QuadraBookingTime = lazy(() => import("./pages/QuadraBookingTime"));
const BookingConfirmation = lazy(() => import("./pages/BookingConfirmation"));
const QuadraBookings = lazy(() => import("./pages/QuadraBookings"));
const TvMode = lazy(() => import("./pages/TvMode"));
const PainelTv = lazy(() => import("./pages/PainelTv"));
const PainelTvLegacy = lazy(() => import("./pages/PainelTvLegacy"));
const PainelTvVerify = lazy(() => import("./pages/PainelTvVerify"));
const TvProfessores = lazy(() => import("./pages/TvProfessores"));
const ControlePresenca = lazy(() => import("./pages/ControlePresenca"));
const RelatoriosPresenca = lazy(() => import("./pages/RelatoriosPresenca"));
const ConfiguracaoPainel = lazy(() => import("./pages/ConfiguracaoPainel"));
const AssistentePanel = lazy(() => import("./pages/AssistentePanel"));
const AssistenteQuadro = lazy(() => import("./pages/AssistenteQuadro"));
const AssistenteRemanejamentos = lazy(() => import("./pages/AssistenteRemanejamentos"));
const GestorAusenciasHoje = lazy(() => import("./pages/GestorAusenciasHoje"));
const CoordGerenciarSalas = lazy(() => import("./pages/CoordGerenciarSalas"));
const AtribuirTurmasAssistente = lazy(() => import("./pages/AtribuirTurmasAssistente"));


const SalaDoProfessor = lazy(() => import("./pages/SalaDoProfessor"));
const Reports = lazy(() => import("./pages/Reports"));
const ProfileReview = lazy(() => import("./pages/ProfileReview"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const SchoolStatus = lazy(() => import("./pages/SchoolStatus"));
const SectorLabelSettings = lazy(() => import("./pages/SectorLabelSettings"));
const GestorPanel = lazy(() => import("./pages/GestorPanel"));
const GestorUsoReal = lazy(() => import("./pages/GestorUsoReal"));
const GestorHorarios = lazy(() => import("./pages/GestorHorarios"));
const GestorRegistroHorarios = lazy(() => import("./pages/GestorRegistroHorarios"));
const GestorToleranciaChamada = lazy(() => import("./pages/GestorToleranciaChamada"));
const GestorDocumentos = lazy(() => import("./pages/GestorDocumentos"));
const ExternalEventRequests = lazy(() => import("./pages/ExternalEventRequests"));
const SchoolTransferRequests = lazy(() => import("./pages/SchoolTransferRequests"));
const TodayBookings = lazy(() => import("./pages/TodayBookings"));
const SchoolStaffList = lazy(() => import("./pages/SchoolStaffList"));
const NotFound = lazy(() => import("./pages/NotFound"));
const VerifyContract = lazy(() => import("./pages/VerifyContract"));
const MinhasSolicitacoes = lazy(() => import("./pages/MinhasSolicitacoes"));
const ProfileNotFoundPreview = lazy(() => import("./pages/ProfileNotFoundPreview"));
const LastUpdateLocationPreview = lazy(() => import("./pages/LastUpdateLocationPreview"));
const InboxUnreadHarness = lazy(() => import("./pages/__dev/InboxUnreadHarness"));
const ErrorPage = lazy(() => import("./pages/ErrorPage"));
const AdminInbox = lazy(() => import("./pages/AdminInbox"));
const GestorInbox = lazy(() => import("./pages/GestorInbox"));
const GestorAtividade = lazy(() => import("./pages/GestorAtividade"));
const UserInbox = lazy(() => import("./pages/UserInbox"));
const MessagesContacts = lazy(() => import("./pages/MessagesContacts"));
const DirectMessage = lazy(() => import("./pages/DirectMessage"));
const PushTest = lazy(() => import("./pages/admin/PushTest"));
const GovLogosAdmin = lazy(() => import("./pages/admin/GovLogos"));
const QrScan = lazy(() => import("./pages/QrScan"));
const GestorQrCode = lazy(() => import("./pages/GestorQrCode"));
const Disciplina = lazy(() => import("./pages/Disciplina"));
const DisciplinaGestor = lazy(() => import("./pages/DisciplinaGestor"));
const DisciplinaConfig = lazy(() => import("./pages/DisciplinaConfig"));
const AdminConsole = lazy(() => import("./pages/admin/Console"));
const AdminConsoleSchool = lazy(() => import("./pages/admin/ConsoleSchool"));
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";


const queryClient = new QueryClient();

const AppContent = () => {
  useRemoteAppRefresh();
  return (
    <ThemeProvider>
      <ViewPreferenceProvider>
      <CustomColorsProvider>
        <SectorPreferencesProvider>
          <LanguageProvider>
            <TooltipProvider>
              <DesktopBlocker>
              <Toaster />
              <Sonner />
              <BackendStatusBanner />
              <AuthProvider>
                <ImpersonationBanner />
                <CallProvider>
                <SchoolNotificationsBridge />
                <ApprovalDecisionWatcher />
                <IncomingCallOverlay />
                <ActiveCallOverlay />
                <MinimumVersionGuard>
                  <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
                    <DirectMessageNotificationsBridge />
                    <SchoolSirenBridge />
                    <BookingReminderOverlay />
                    <ReassignmentInviteOverlay />
                    <CheckoutReminderOverlay />
                    <PushNotificationsPrompt />
                    <Suspense fallback={<div className="flex items-center justify-center h-dvh bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                      <Routes>
                       <Route path="/tv" element={<TvMode />} />
                       <Route path="/diagnostico" element={<Diagnostico />} />
                       <Route path="/painel-tv" element={<PainelTv />} />
                       <Route path="/painel-tv-legacy" element={<PainelTvLegacy />} />
                       <Route path="/painel-tv/verify" element={<PainelTvVerify />} />
                        <Route path="/tv-professores" element={<TvProfessores />} />
                        <Route path="/controle-presenca" element={<ControlePresenca />} />
                        <Route path="/relatorios-presenca" element={<RelatoriosPresenca />} />
                        <Route path="/configuracao-painel" element={<ConfiguracaoPainel />} />
                        <Route path="/assistente" element={<AssistentePanel />} />
                        <Route path="/assistente/quadro" element={<AssistenteQuadro />} />
                        <Route path="/assistente/remanejamentos" element={<AssistenteRemanejamentos />} />
                        <Route path="/gestor/ausencias-hoje" element={<GestorAusenciasHoje />} />
                       <Route path="/gestor/gerenciar-salas" element={<CoordGerenciarSalas />} />
                       <Route path="/gestor/atribuir-turmas" element={<AtribuirTurmasAssistente />} />
                       <Route path="/assistente/transferir-salas" element={<CoordGerenciarSalas />} />


                        <Route path="/sala-do-professor" element={<ApprovedRouteGuard><SalaDoProfessor /></ApprovedRouteGuard>} />
                        <Route path="/gestor/sala-do-professor" element={<ApprovedRouteGuard><SalaDoProfessor /></ApprovedRouteGuard>} />
                        <Route path="*" element={
                          <main className="app-shell">
                            <DesktopSidebar />
                            <div className="app-frame">
                              <Routes>
                                <Route path="/" element={<Welcome />} />
                                <Route path="/home" element={<Index />} />
                                <Route path="/auth" element={<Auth />} />
                                <Route path="/preview/profile-not-found" element={<ProfileNotFoundPreview />} />
                                <Route path="/preview/last-update-location" element={<LastUpdateLocationPreview />} />
                                <Route path="/dev/inbox-unread" element={<InboxUnreadHarness />} />
                                <Route path="/admin" element={<AdminRouteGuard><Admin /></AdminRouteGuard>} />
                                <Route path="/admin/login" element={<AdminLogin />} />
                                <Route path="/admin/global" element={<AdminRouteGuard><AdminGlobal /></AdminRouteGuard>} />
                                <Route path="/admin/console" element={<AdminRouteGuard><AdminConsole /></AdminRouteGuard>} />
                                <Route path="/admin/console/school/:schoolId" element={<AdminRouteGuard><AdminConsoleSchool /></AdminRouteGuard>} />
                                <Route path="/gestor/aprovacoes" element={<GestorRouteGuard><GestorApprovals /></GestorRouteGuard>} />
                                <Route path="/admin/school/:id" element={<AdminRouteGuard><SchoolAdmin /></AdminRouteGuard>} />
                                <Route path="/admin/mp-config" element={<AdminRouteGuard><MpConfig /></AdminRouteGuard>} />
                                <Route path="/admin/mp-test-pix" element={<AdminRouteGuard><MpTestPix /></AdminRouteGuard>} />
                                <Route path="/admin/mp-audit-logs" element={<AdminRouteGuard><MpAuditLogs /></AdminRouteGuard>} />
                                <Route path="/admin/mp-duplicates" element={<AdminRouteGuard><MpDuplicateEvents /></AdminRouteGuard>} />
                                <Route path="/admin/security" element={<AdminRouteGuard><SecurityDashboard /></AdminRouteGuard>} />
                                <Route path="/admin/security-audit" element={<AdminRouteGuard><SecurityAudit /></AdminRouteGuard>} />
                                <Route path="/admin/audit-dashboard" element={<AdminRouteGuard><AuditDashboard /></AdminRouteGuard>} />
                                <Route path="/admin/support-contact" element={<AdminRouteGuard><SupportContactSettings /></AdminRouteGuard>} />
                                <Route path="/admin/deadlines" element={<AdminRouteGuard><SchoolDeadlines /></AdminRouteGuard>} />
                                <Route path="/admin/blocked-by-deadline" element={<AdminRouteGuard><BlockedByDeadline /></AdminRouteGuard>} />
                                <Route path="/admin/contracts" element={<AdminRouteGuard><AdminContracts /></AdminRouteGuard>} />
                                <Route path="/admin/documentos" element={<AdminRouteGuard><AdminDocumentos /></AdminRouteGuard>} />
                                <Route path="/admin/notifications" element={<AdminRouteGuard><SubscriptionNotifications /></AdminRouteGuard>} />
                                <Route path="/admin/push-test" element={<AdminRouteGuard><PushTest /></AdminRouteGuard>} />
                                <Route path="/admin/gov-logos" element={<AdminRouteGuard><GovLogosAdmin /></AdminRouteGuard>} />
                                <Route path="/reset-password" element={<ResetPassword />} />
                                <Route path="/verificar/:token" element={<VerifyContract />} />
                                <Route path="/subscription" element={<Subscription />} />
                                <Route path="/booking/multi" element={<ApprovedRouteGuard><MultiBooking /></ApprovedRouteGuard>} />
                                <Route path="/sectors" element={<ApprovedRouteGuard><SectorSelect /></ApprovedRouteGuard>} />
                                <Route path="/booking/quadra" element={<ApprovedRouteGuard><QuadraBooking /></ApprovedRouteGuard>} />
                                <Route path="/booking/quadra/data" element={<ApprovedRouteGuard><QuadraBookingDate /></ApprovedRouteGuard>} />
                                <Route path="/booking/quadra/horario" element={<ApprovedRouteGuard><QuadraBookingTime /></ApprovedRouteGuard>} />
                                <Route path="/booking/confirmacao" element={<ApprovedRouteGuard><BookingConfirmation /></ApprovedRouteGuard>} />
                                <Route path="/booking/quadra/lista" element={<ApprovedRouteGuard><QuadraBookings /></ApprovedRouteGuard>} />
                                <Route path="/reports" element={<ApprovedRouteGuard><Reports /></ApprovedRouteGuard>} />
                                <Route path="/profile" element={<ProfileReview />} />
                                <Route path="/profile/edit" element={<EditProfile />} />
                                <Route path="/profile/solicitacoes" element={<MinhasSolicitacoes />} />
                                <Route path="/school-status" element={<SchoolStatus />} />
                                <Route path="/settings/sector-labels" element={<SectorLabelSettings />} />
                                <Route path="/gestor" element={<GestorPanel />} />
                                <Route path="/gestor/external-requests" element={<GestorRouteGuard><ExternalEventRequests /></GestorRouteGuard>} />
                                <Route path="/gestor/documentos" element={<GestorRouteGuard><GestorDocumentos /></GestorRouteGuard>} />
                                <Route path="/gestor/transfer-requests" element={<GestorRouteGuard><SchoolTransferRequests /></GestorRouteGuard>} />
                                <Route path="/today-bookings" element={<TodayBookings />} />
                                <Route path="/gestor/cadastros" element={<SchoolStaffList />} />
                                <Route path="/error-test" element={<ErrorPage />} />
                                <Route path="/admin/inbox" element={<AdminRouteGuard><AdminInbox /></AdminRouteGuard>} />
                                <Route path="/gestor/inbox" element={<GestorRouteGuard><GestorInbox /></GestorRouteGuard>} />
                                <Route path="/gestor/atividade" element={<GestorRouteGuard><GestorAtividade /></GestorRouteGuard>} />
                                <Route path="/inbox" element={<UserInbox />} />
                              <Route path="/messages" element={<ApprovedRouteGuard><MessagesContacts /></ApprovedRouteGuard>} />
                              <Route path="/dm/:userId" element={<ApprovedRouteGuard><DirectMessage /></ApprovedRouteGuard>} />
                                <Route path="/qr-scan" element={<ApprovedRouteGuard><QrScan /></ApprovedRouteGuard>} />
                                <Route path="/gestor/qr-code" element={<GestorRouteGuard><GestorQrCode /></GestorRouteGuard>} />
                                <Route path="/gestor/uso-real" element={<GestorRouteGuard><GestorUsoReal /></GestorRouteGuard>} />
                                <Route path="/gestor/horarios" element={<GestorRouteGuard allowCoord><GestorHorarios /></GestorRouteGuard>} />
                                <Route path="/gestor/registro-horarios" element={<GestorRouteGuard allowCoord><GestorRegistroHorarios /></GestorRouteGuard>} />
                                <Route path="/gestor/tolerancia-chamada" element={<GestorRouteGuard><GestorToleranciaChamada /></GestorRouteGuard>} />
                                <Route path="/disciplina" element={<ApprovedRouteGuard><Disciplina /></ApprovedRouteGuard>} />
                                <Route path="/gestor/disciplina" element={<GestorRouteGuard><DisciplinaGestor /></GestorRouteGuard>} />
                                <Route path="/gestor/disciplina/config" element={<GestorRouteGuard><DisciplinaConfig /></GestorRouteGuard>} />
                                <Route path="/gestor/aniversariantes" element={<GestorRouteGuard><GestorAniversariantes /></GestorRouteGuard>} />
                                <Route path="*" element={<NotFound />} />
                              </Routes>
                              <SubscriptionHeader />
                             <GlobalToolbar />
                             <GlobalBackButton />
                             

                              <GestorTrialBanner />

                            </div>
                          </main>
                        } />
                      </Routes>
                    </Suspense>
                  </BrowserRouter>
                </MinimumVersionGuard>
                </CallProvider>
              </AuthProvider>
              </DesktopBlocker>
            </TooltipProvider>
          </LanguageProvider>
        </SectorPreferencesProvider>
      </CustomColorsProvider>
      </ViewPreferenceProvider>
    </ThemeProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppAccessGate>
      <AppContent />
    </AppAccessGate>
  </QueryClientProvider>
);

export default App;

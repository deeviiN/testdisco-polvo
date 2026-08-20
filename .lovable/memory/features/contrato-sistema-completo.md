---
name: Sistema completo de contrato bilateral (admin + gestor)
description: PALAVRA-CHAVE "Retorne ao modelo de contrato implantado" reativa todo o fluxo de contrato com assinatura admin-primeiro, stepper, realtime e painel admin
type: feature
---

## Palavra-chave de reativação
**"Retorne ao modelo de contrato implantado"** → reimplementar tudo abaixo idêntico.

## Contexto
O usuário pediu para REMOVER temporariamente o sistema de contrato (em ~26/04/2026) para focar na implementação do pagamento. Banco e bucket foram MANTIDOS intactos. Quando o usuário disser a palavra-chave, restaurar toda a UI/lógica abaixo.

## Infraestrutura preservada no banco (NÃO recriar)
- Tabela `public.signed_contracts` (id, school_id, uploaded_by, file_name, file_path, file_size, signer_role 'admin'|'gestor', status 'awaiting_admin'|'awaiting_gestor'|'completed', gestor_cpf, uploaded_at). RLS já configurado.
- Tabela `public.company_settings` (CNPJ, razão social, endereço, representante).
- Bucket `signed-contracts` (privado).
- Realtime já habilitado em `signed_contracts` com REPLICA IDENTITY FULL.

## Arquivos a recriar (foram apagados)

### 1. `src/hooks/useAdminPendingContracts.tsx`
Hook que conta contratos com `status='awaiting_admin'` em tempo real (Supabase Realtime + fallback). Retorna `{ count, lastNewSchoolId }`. Subscribe no canal `admin-pending-contracts` em `signed_contracts`. Ao detectar INSERT com status=awaiting_admin, atualiza `lastNewSchoolId` para disparar toast no caller.

### 2. `src/pages/AdminContracts.tsx` (rota `/admin/contracts`)
- Lista todas as escolas via `list_schools_admin` RPC + cruzamento com `signed_contracts`.
- Filtros chip: "Aguardando você" (default), "Aguardando gestor", "Concluídos", "Todos" — com contadores em tempo real.
- Busca por nome/cidade/INEP.
- Cada card mostra: nome, cidade/UF, INEP, badge de status, **stepper de 4 fases** (Dados → Você assina → Gestor assina → Concluído) com cores: emerald (done), amber pulsante (current), muted (pending).
- Botão Anexar/Trocar PDF do admin (upload em `signed-contracts/{schoolId}/admin/{userId}/{ts}-{nome}`), insere em `signed_contracts` com `signer_role='admin'`, `status='awaiting_gestor'`. Substitui anexo admin anterior se houver.
- Mostra anexo do gestor quando existe (download).
- Signed URLs de 30min para preview/download.
- Ordenação: awaiting_admin > awaiting_gestor > completed.

### 3. Bloco "Contratos · assinar" em `src/pages/Admin.tsx`
No grid de Stats (linha ~1519), adicionar entrada:
```ts
{ key: "contracts", label: "Contratos · assinar", value: "→", icon: FileText, color: "warning", onClick: () => navigate("/admin/contracts") }
```

### 4. Sininho global em `src/components/GlobalToolbar.tsx`
- Importar `FileSignature` do lucide e `useAdminPendingContracts`.
- Após detectar `isAdmin`, chamar hook e renderizar Button (visível apenas para admin) ANTES do dropdown de Settings.
- Badge vermelho pulsante com contador (mostra "9+" se >9).
- onClick navega para `/admin/contracts`.
- useEffect dispara `toast.info("Novo contrato aguardando sua assinatura", { action: { label: "Abrir", onClick: navegar } })` quando `lastNewSchoolId` muda (deduplicar via ref).

### 5. Rota em `src/App.tsx`
- Lazy import `AdminContracts`.
- Rota `<Route path="/admin/contracts" element={<AdminContracts />} />` ao lado de `/admin`.

### 6. Etapa de contrato em `src/pages/Subscription.tsx`
**SubscriptionStep** inclui `"contract"` entre `"school-data"` e `"payment"`.

**Imports adicionais**: `FileText, MessageCircle, Download, CheckCircle2, PenLine, Upload`, `html2canvas`, `jsPDF`.

**Estados**:
- `contractAccepted`, `signedFile`, `signedUploaded {path,name}`, `uploadingSigned`, `signedInputRef`, `signedPreviewUrl`
- `adminUploaded {path,name,uploaded_at}`, `adminPreviewUrl`, `checkingAdminSig`
- `companyData`, `contractRef`, `pdfDownloadedRef`, `downloadingPdf`, `pdfError`
- Persistir `pdfDownloadedRef` em localStorage com chave `subscription:contract-pdf-downloaded:{schoolId}`.

**Após validar school-data**: `setStep("contract")` (NÃO ir direto para payment).

**Effects**:
- Carregar estado de `signed_contracts` da escola atual ao entrar no step contract: separar admin/gestor rows, set states. Toast "Administrador assinou o contrato!" na transição ausente→presente.
- Realtime channel `gestor-contract-${schoolId}` filtrando `school_id=eq.{id}` em `signed_contracts`.
- Polling fallback 8s enquanto `!adminUploaded`.
- Signed URLs 30min para `signedPreviewUrl` e `adminPreviewUrl`.

**Handlers**:
- `handleDownloadContract`: usa html2canvas + jsPDF para gerar PDF multi-página do `contractRef`. Salva como `contrato_agendamento_escolar_{escola}.pdf`. Marca `pdfDownloadedRef.current=true` + localStorage.
- `handleSignedFileSelect`: valida PDF, max 10MB.
- `handleUploadSignedContract`: upload em `signed-contracts/{schoolId}/gestor/{userId}/{ts}-{nome}`, insert em `signed_contracts` com `signer_role='gestor'`, `gestor_cpf=formData.gestorCpf`, `status='completed'`.
- `handleReplaceSignedContract`: remove storage + delete row, reseta.
- `handleDownloadAdminSigned`: download via signed URL.
- `handleAcceptContract`: valida `contractAccepted` → `setStep("payment")`.

**UI da tela contract (mobile-otimizada)**:
1. **Stepper 4 fases**: Baixar → Admin assinar → Você assinar → Concluir. Bloco com mensagens orientativas por fase atual (tags coloridas: amber/blue/emerald) com texto específico tipo "Etapa 1 de 4 — baixe a minuta do contrato".
2. **Banner de download automático**: card primary/destrutivo conforme estado, botão "Baixar PDF novamente" / "Tentar novamente".
3. **Card do contrato** (`<div ref={contractRef}>`): renderizado para PDF. CONTRATANTE (de `company_settings`), CONTRATADA (foundSchool + formData + profile.full_name + gestorCpf). Cláusulas 1-9 (Objeto, **Vigência 4 anos**, Valor R$129,90/mês, **Multa 50% das parcelas restantes**, Obrigações partes, Rescisão 30d, Inadimplência 30/60/90d com SPC/SERASA/cartório, Foro). Data atual + cidade da empresa.
4. **Botão "1. Baixar minuta do contrato"** (outline).
5. **Passo 2 condicional**:
   - Se `!adminUploaded`: card amber com Loader2 spinner "Aguardando assinatura da contraparte".
   - Se `adminUploaded`: card primary com Check, botão "Baixar PDF assinado pela contraparte" + iframe preview 56h.
6. **Passo 3 — Anexar PDF assinado** (desabilitado/opacity-60 se !adminUploaded): file input PDF, botões Selecionar + Anexar. Quando uploaded: card primary com nome + botão "Trocar". Iframe preview 72h.
7. **Checkbox "Li e aceito os termos"** (referência à multa 50%).
8. **Botão final**: texto dinâmico ("Aguarde a assinatura da contraparte" / "Anexe sua versão assinada" / "Aceitar e Continuar para Pagamento"), disabled enquanto `!contractAccepted || !signedUploaded`.

**renderHeader**: "Contrato de Prestação", "Leia e aceite os termos", back para "school-data".

## Decisões importantes
- **Admin assina PRIMEIRO**: gestor não pode anexar até admin enviar.
- **Notificação ao gestor**: realtime + polling 8s na própria tela /subscription (sem badge global).
- **Notificação ao admin**: sininho global + toast em tempo real.
- **Migração mantida**: dados existentes em signed_contracts preservados.

## Memórias relacionadas (já existentes)
- mem://features/contrato/pdf-download
- mem://business/contrato-assinatura
- mem://ui/otimizacoes-mobile (layout zero-scroll mobile da /subscription)

## Notificação ao gestor após admin assinar (adicionado 09/05/2026)

Quando admin insere row em `signed_contracts` com `signer_role='admin'`/`status='awaiting_gestor'`, o trigger `trg_notify_gestores_admin_contract_signed` (function `notify_gestores_admin_contract_signed`) cria uma row em `notifications` para cada gestor aprovado da escola, com `data.type='contract_admin_signed'` e `data.url='/subscription?step=contract&school={id}'`.

Frontend:
- `src/hooks/useGestorContractNotifications.tsx`: realtime listener, dispara `toast` clicável.
- `src/components/GestorNotificationBell.tsx`: sininho verde no `GlobalToolbar` para roles gestor/chef, badge vermelho com unread count, dropdown lista as 15 últimas, clique marca como lida e navega.
- `SchoolNotificationsBridge` registra o hook globalmente.

Botão "Avisar gestor por WhatsApp" em `/admin/contracts` (handler `handleNotifyGestorWhatsApp`): aparece quando admin já anexou e gestor ainda não. Busca telefone do gestor aprovado, monta `wa.me/55{phone}?text=...` com link `/subscription?step=contract&school={id}`.

Deep-link em `Subscription.tsx`: useEffect detecta `?step=contract&school=ID`, busca a escola, popula `foundSchool`/`selectedNetwork`/`formData` mínimos e pula direto para `step="contract-view"` — gestor não refaz INEP/CNPJ/CEP.

Realtime habilitado em `public.notifications` (REPLICA IDENTITY FULL + ADD TABLE supabase_realtime).

export const TV_BRAND_LABELS: Record<string, string> = {
  android: "Android TV",
  vidaa: "Toshiba VIDAA",
  tizen: "Samsung Tizen",
  webos: "LG WebOS",
  roku: "Roku TV",
  linux: "Linux Generico",
  web: "Navegador Web",
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jsString(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function downloadTextFile(fileName: string, content: string, mime = "text/html") {
  // CRLF + UTF-8 BOM: muitas TVs antigas (VIDAA/Tizen/WebOS) só reconhecem
  // arquivos HTML do pendrive quando vêm com BOM e quebras de linha estilo
  // Windows. Sem isso o file manager mostra "arquivo não suportado".
  const normalized = content.replace(/\r?\n/g, "\r\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM, normalized], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * Nome no padrão 8.3 (DOS): PAINELTV.HTM.
 * TV boxes antigas (VIDAA, Tizen 2018/19, WebOS 3, Roku legado) só reconhecem
 * arquivos do pendrive quando o nome tem no máximo 8 caracteres + extensão de 3
 * em MAIÚSCULO e SEM espaços/acentos. Nomes como "Painel TV - Escola X.html"
 * são silenciosamente ignorados pelo file manager da TV.
 * O parâmetro `school` é mantido apenas por compatibilidade da API.
 */
/** Rótulo oficial do lançador: "Painel da TV - NOME DA ESCOLA - Cidade/UF". */
export function buildTvLauncherLabel(
  school?: { name?: string | null; city?: string | null; state?: string | null } | null,
) {
  const name = (school?.name || "").trim();
  const city = (school?.city || "").trim();
  const uf = (school?.state || "").trim().toUpperCase();
  const place = [city, uf].filter(Boolean).join("/");
  return ["Painel da TV", name, place].filter(Boolean).join(" - ");
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTvLauncherFileName(
  school?: { name?: string | null; city?: string | null; state?: string | null } | null,
) {
  const name = sanitizeFileName((school?.name || "").trim());
  const city = sanitizeFileName((school?.city || "").trim());
  const uf = sanitizeFileName((school?.state || "").trim().toUpperCase());
  const parts = ["Painel Tv", name, city, uf].filter(Boolean);
  return parts.join(" - ") + ".HTM";
}

export function buildTvLauncherHtml(targetUrl: string, label: string) {
  const safeUrl = escapeHtml(targetUrl);



  // HTML propositalmente antigo/simples para TVs de 2018/2019:
  // sem iframe, sem flexbox, sem const/let, nome do arquivo .HTM 8.3.
  // Redirecionamento em 4 camadas para funcionar em QUALQUER TV box:
  //  1) <meta http-equiv="refresh" content="0"> — funciona sem JS
  //  2) <script> window.location.replace — TVs com JS habilitado
  //  3) <body onload> — fallback pra navegadores que ignoram script no head
  //  4) <a href> visivel — ultimo recurso, usuario aperta OK
  return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="refresh" content="0; url=${safeUrl}">
<meta http-equiv="refresh" content="0;URL=${safeUrl}">
<title>${escapeHtml(label)}</title>
<script type="text/javascript">
try{window.location.replace(${jsString(targetUrl)});}catch(e){try{window.location.href=${jsString(targetUrl)};}catch(e2){}}
</script>
<style type="text/css">
html,body{margin:0;padding:0;width:100%;height:100%;background:#000000;color:#ffffff;font-family:Arial,Helvetica,sans-serif;}
table{width:100%;height:100%;border:0;border-collapse:collapse;}td{text-align:center;vertical-align:middle;padding:24px;}
h1{font-size:38px;margin:0 0 18px 0;}p{font-size:20px;line-height:1.35;margin:10px auto;max-width:760px;}
a{display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:26px;font-weight:bold;padding:20px 34px;margin-top:14px;border-radius:4px;}
.small{font-size:15px;color:#cccccc;}.url{font-size:22px;color:#ffeb3b;word-break:break-all;font-weight:bold;margin-top:18px;}
</style>
</head>
<body bgcolor="#000000" onload="try{window.location.replace('${safeUrl}');}catch(e){window.location.href='${safeUrl}';}">
<table><tr><td>
<h1>${escapeHtml(label)}</h1>
<p>Abrindo o painel...</p>
<p><a href="${safeUrl}">ABRIR PAINEL TV</a></p>
<p class="small">Se nao abrir sozinho, pressione OK / ENTER no botao verde.</p>
<p class="small">Endereco manual (digitar no navegador da TV se necessario):</p>
<p class="url">${safeUrl}</p>
</td></tr></table>
</body>
</html>`;
}

/**
 * Versão MINIFICADA e SEM JavaScript inline do lançador.
 * Estratégia: apenas <meta http-equiv="refresh"> + link clicável de fallback.
 * Zero JS, zero CSS externo, HTML 4.01, ~500 bytes.
 * Para TVs muito antigas (Tizen 2016, WebOS 2, VIDAA 2018) que travam ou
 * bloqueiam qualquer <script>. Nome sugerido: PTVMIN.HTM (8.3).
 */
export function buildTvLauncherMinimalHtml(targetUrl: string, label: string) {
  const safeUrl = escapeHtml(targetUrl);
  const safeLabel = escapeHtml(label);
  return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta http-equiv="refresh" content="0; url=${safeUrl}"><title>${safeLabel}</title></head><body bgcolor="#000000" text="#ffffff"><table width="100%" height="100%" border="0"><tr><td align="center" valign="middle"><h1>${safeLabel}</h1><p><a href="${safeUrl}"><font color="#ffeb3b" size="6"><b>ABRIR PAINEL</b></font></a></p><p><font size="2">${safeUrl}</font></p></td></tr></table></body></html>`;
}

export function buildTvLauncherMinimalFileName() {
  return "PTVMIN.HTM";
}

export interface HtmlValidationItem {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
}

/** Valida o HTML gerado p/ TVs antigas: tamanho, nome 8.3, sem iframe/JS moderno. */
export function validateTvLauncherHtml(fileName: string, html: string): HtmlValidationItem[] {
  const bytes = new Blob([html]).size;
  const base = fileName.split(/[\\/]/).pop() || fileName;
  const m = base.match(/^([^.]+)(?:\.([^.]+))?$/);
  const name = m?.[1] ?? base;
  const ext = m?.[2] ?? "";
  const is83 =
    name.length > 0 && name.length <= 8 && ext.length > 0 && ext.length <= 3 &&
    /^[A-Z0-9_]+$/.test(name) && /^[A-Z0-9]+$/.test(ext);
  const extOk = ext === "HTM";
  const hasIframe = /<iframe\b/i.test(html);
  const hasModernJs = /\b(const|let|=>|async|await|class\s+\w+)\b/.test(html);
  const hasDoctype = /^<!DOCTYPE\s+HTML\s+PUBLIC\s+"-\/\/W3C\/\/DTD HTML 4\.01/i.test(html.trim());
  const hasCharset = /charset=utf-8/i.test(html);
  const hasFallback = /<a\b[^>]*href=/i.test(html);

  return [
    { id: "size", label: "Tamanho < 10 KB", pass: bytes < 10 * 1024, detail: `${bytes} B` },
    { id: "name83", label: "Nome 8.3 maiúsculo", pass: is83, detail: base },
    { id: "ext", label: "Extensão .HTM (não .HTML)", pass: extOk, detail: ext || "(sem extensão)" },
    { id: "noiframe", label: "Sem <iframe>", pass: !hasIframe },
    { id: "nomodernjs", label: "Sem JS moderno (const/let/=>/async/class)", pass: !hasModernJs },
    { id: "doctype", label: "DOCTYPE HTML 4.01 Transitional", pass: hasDoctype },
    { id: "charset", label: "Charset UTF-8 declarado", pass: hasCharset },
    { id: "fallback", label: "Link clicável de fallback presente", pass: hasFallback },
  ];
}

export function buildTvDiagnosticHtml() {
  return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>TESTE TV</title>
<style type="text/css">
html,body{margin:0;padding:0;width:100%;height:100%;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;}
table{width:100%;height:100%;border:0;border-collapse:collapse;}td{text-align:center;vertical-align:middle;padding:24px;}
h1{font-size:42px;margin:0 0 18px 0;color:#22c55e;}p{font-size:22px;line-height:1.4;margin:10px auto;max-width:760px;}
</style>
</head>
<body bgcolor="#000000">
<table><tr><td>
<h1>TESTE OK</h1>
<p>A TV conseguiu abrir arquivo HTML do pendrive.</p>
<p>Agora use o arquivo PAINELTV.HTM.</p>
</td></tr></table>
</body>
</html>`;
}

/**
 * Página de diagnóstico OFFLINE para colocar junto no pendrive.
 * Testa localmente, sem depender de rede:
 *  - Se a TV lê arquivo .HTM do USB (o simples fato de abrir já prova)
 *  - Se o JavaScript executa (marca linhas em verde)
 *  - Se localStorage funciona (necessário p/ o painel guardar sessão)
 *  - Resolução da tela (ajuda a diagnosticar corte de tela)
 *  - User-Agent (identifica marca/modelo pra suporte)
 *  - Meta-refresh: em 8s tenta redirecionar pra âncora interna;
 *    se o cronômetro chegar em 0 e a marca "REDIR OK" aparecer,
 *    a TV NÃO bloqueia redirecionamento (então PAINELTV.HTM abrirá).
 * Nome do arquivo: DIAG.HTM (padrão 8.3).
 */
export function buildTvDiagnosticFileName() {
  return "DIAG.HTM";
}

export function buildTvBoxDiagnosticHtml() {
  return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="refresh" content="8; url=#redir">
<title>DIAGNOSTICO TV BOX</title>
<style type="text/css">
html,body{margin:0;padding:0;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:18px;}
.wrap{padding:18px;max-width:900px;margin:0 auto;}
h1{color:#22c55e;font-size:30px;margin:0 0 6px 0;}
h2{color:#fbbf24;font-size:20px;margin:18px 0 6px 0;border-bottom:1px solid #333;padding-bottom:4px;}
.row{padding:8px 10px;margin:4px 0;background:#111;border-left:6px solid #555;}
.ok{border-left-color:#22c55e;}
.warn{border-left-color:#f59e0b;}
.fail{border-left-color:#dc2626;}
.lbl{font-weight:bold;}
.val{color:#fde68a;word-break:break-all;}
.hint{color:#aaa;font-size:14px;margin-top:2px;}
.big{font-size:22px;}
#redir{background:#166534;padding:14px;margin-top:14px;border:2px solid #22c55e;text-align:center;font-size:22px;font-weight:bold;}
.count{color:#fbbf24;font-size:26px;font-weight:bold;}
</style>
</head>
<body bgcolor="#000000">
<div class="wrap">
<h1>DIAGNOSTICO TV BOX</h1>
<p>Se voce esta lendo esta tela, sua TV <b>reconhece arquivos .HTM do pendrive</b> (FAT32 OK).</p>

<h2>1. Leitura de HTML do USB</h2>
<div class="row ok"><span class="lbl">Arquivo DIAG.HTM aberto:</span> <span class="val">SIM</span>
<div class="hint">Se essa linha esta verde, o pendrive FAT32 + extensao .HTM funcionam nesta TV.</div></div>

<h2>2. JavaScript</h2>
<div id="js-row" class="row fail"><span class="lbl">JavaScript ativo:</span> <span class="val" id="js-val">NAO (esta linha nao mudou)</span>
<div class="hint">Sem JS, o Painel TV nao carrega os horarios. Habilite JavaScript no navegador da TV.</div></div>

<h2>3. localStorage (memoria do navegador)</h2>
<div id="ls-row" class="row warn"><span class="lbl">localStorage:</span> <span class="val" id="ls-val">testando...</span></div>

<h2>4. Tela</h2>
<div class="row"><span class="lbl">Resolucao:</span> <span class="val" id="res-val">?</span>
<div class="hint">O painel foi otimizado para 1280x720 ou mais.</div></div>

<h2>5. Identificacao (envie pro suporte se falhar)</h2>
<div class="row"><span class="lbl">User-Agent:</span> <span class="val" id="ua-val">?</span></div>

<h2>6. Redirecionamento (meta refresh)</h2>
<div class="row big"><span class="lbl">Contagem:</span> <span class="count" id="cnt">8</span> segundos
<div class="hint">Se ao chegar em 0 a caixa verde "REDIR OK" aparecer, sua TV <b>NAO bloqueia</b> redirecionamento. O PAINELTV.HTM vai funcionar sozinho.</div>
<div class="hint">Se ficar parado em 0 sem aparecer nada verde, a TV bloqueia meta-refresh. Nesse caso use o botao verde ABRIR PAINEL manualmente.</div></div>

<a name="redir"></a>
<div id="redir" style="display:none;">REDIR OK - sua TV aceita redirecionamento automatico</div>

<h2>Resumo</h2>
<div class="row"><span class="lbl">FAT32 + .HTM:</span> <span class="val">OK (voce esta vendo isso)</span></div>
<div class="row"><span class="lbl">JavaScript:</span> <span class="val" id="sum-js">verificando...</span></div>
<div class="row"><span class="lbl">localStorage:</span> <span class="val" id="sum-ls">verificando...</span></div>
<div class="row"><span class="lbl">Redirecionamento:</span> <span class="val" id="sum-rd">aguarde 8s...</span></div>

<p class="hint">Suporte: (11) 92568-6565. Tire foto desta tela se algum item estiver em vermelho.</p>
</div>

<script type="text/javascript">
// JS check
try{
  var jsRow=document.getElementById('js-row');
  var jsVal=document.getElementById('js-val');
  jsRow.className='row ok';
  jsVal.innerHTML='SIM';
  document.getElementById('sum-js').innerHTML='OK';

  // localStorage
  var lsRow=document.getElementById('ls-row');
  var lsVal=document.getElementById('ls-val');
  try{
    localStorage.setItem('diag_test','1');
    var v=localStorage.getItem('diag_test');
    localStorage.removeItem('diag_test');
    if(v==='1'){lsRow.className='row ok';lsVal.innerHTML='OK';document.getElementById('sum-ls').innerHTML='OK';}
    else{lsRow.className='row fail';lsVal.innerHTML='FALHOU (retornou vazio)';document.getElementById('sum-ls').innerHTML='FALHA';}
  }catch(e){
    lsRow.className='row fail';lsVal.innerHTML='BLOQUEADO ('+e.message+')';
    document.getElementById('sum-ls').innerHTML='BLOQUEADO';
  }

  // Screen
  document.getElementById('res-val').innerHTML=(screen.width||'?')+' x '+(screen.height||'?')+' px';
  document.getElementById('ua-val').innerHTML=navigator.userAgent||'?';

  // Countdown
  var n=8;
  var cnt=document.getElementById('cnt');
  var t=setInterval(function(){
    n--;
    if(n<=0){
      clearInterval(t);
      cnt.innerHTML='0';
      // Se meta-refresh disparou, o hash muda pra #redir
      setTimeout(function(){
        if(window.location.hash==='#redir'){
          document.getElementById('redir').style.display='block';
          document.getElementById('sum-rd').innerHTML='OK - TV aceita redirecionamento';
        }else{
          document.getElementById('sum-rd').innerHTML='BLOQUEADO - use o botao verde manualmente no PAINELTV.HTM';
        }
      },500);
    }else{
      cnt.innerHTML=String(n);
    }
  },1000);
}catch(e){
  document.getElementById('sum-js').innerHTML='FALHA: '+e.message;
}
</script>
</body>
</html>`;
}
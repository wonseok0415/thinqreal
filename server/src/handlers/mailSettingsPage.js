// 관리자 「확정 메일 설정」 패널 — 컨테이너 전용 화면 (GET /api?type=admin_mail_settings_page, 키트 v5.9)
// 라이브 thinqreal_admin.html은 건드리지 않고 별도 HTML을 서버가 직접 서빙한다(데이터 이행 패널과 같은 방식).
// 토큰은 같은 오리진의 관리자 페이지가 localStorage에 둔 것을 재사용 — 먼저 /thinqreal_admin.html 로그인.
// 값 저장은 POST admin_mail_settings_set(관리자 토큰 게이트), 저장소 app_state `mail.<KEY>`.
import { MAIL_SETTING_KEYS, MAIL_SETTING_LABELS } from './mailSettings.js';

export function renderMailSettingsPage() {
  const keysJson = JSON.stringify(MAIL_SETTING_KEYS);
  const labelsJson = JSON.stringify(MAIL_SETTING_LABELS);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ThinQ Real — 확정 메일 설정</title>
<style>
:root{--c:#3a5035;--bg:#f5f5f7;--card:#fff;--line:#e5e5ea;--muted:#6e6e73;--ok:#2e7d32;--warn:#b26a00;--bad:#c62828}
*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;background:var(--bg);color:#1d1d1f;font-size:15px;line-height:1.5}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:0 0 12px}
.sub{color:var(--muted);margin-bottom:20px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:#eef2ec;color:var(--c);margin-left:6px}
.src{font-size:12px;padding:2px 8px;border-radius:999px;margin-left:8px}.src.db{background:#e8f0e6;color:var(--ok)}.src.env{background:#fff4e0;color:var(--warn)}.src.default{background:#fdecea;color:var(--bad)}
.btn{appearance:none;border:0;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;background:var(--c);color:#fff;min-height:44px}
.btn.secondary{background:#e8ece7;color:var(--c)}.btn:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.field{margin-bottom:14px}.field label{display:block;font-weight:600;margin-bottom:4px}
.field input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:15px;min-height:44px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.note{color:var(--muted);font-size:13px}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}
#msg{margin-top:10px;min-height:22px}
</style></head><body><div class="wrap">
<h1>확정 메일 설정 <span id="envBadge" class="badge">…</span></h1>
<div class="sub">예약 확정 메일에 들어가는 Wi-Fi·도어락 정보입니다. 저장하면 <b>다음 확정 메일부터</b> 바로 반영됩니다(재배포 없음). 이 값은 메일에만 실리고 페이지에는 노출되지 않습니다.</div>

<div class="card" id="tokenCard"><h2>0. 관리자 토큰</h2><div id="tokenMsg" class="note">확인 중…</div></div>

<div class="card"><h2>1. 값</h2>
<div class="note" style="margin-bottom:12px">출처 표시 — <span class="src db">패널</span> 이 화면에서 저장한 값 · <span class="src env">env</span> 배포 설정(configmap) 값 · <span class="src default">미설정</span> 둘 다 없음(메일에 "(미설정)"으로 찍힘). 칸을 비우고 저장하면 패널 값이 해제되어 env 값으로 돌아갑니다.</div>
<div id="fields"></div>
<div class="row" style="margin-top:8px"><button class="btn" id="btnSave" disabled>저장</button><button class="btn secondary" id="btnReload" disabled>다시 읽기</button><button class="btn secondary" id="btnPreview" disabled>확정 메일 미리보기</button></div>
<div id="msg" class="note"></div></div>

<div class="card"><h2>안내</h2>
<ul class="note" style="margin:0;padding-left:18px">
<li>값을 바꾸면 Wi-Fi·도어락 실제 설정과 같은지 먼저 확인하세요. 메일은 바꾼 즉시 다음 확정 건부터 새 값으로 나갑니다.</li>
<li>미리보기는 샘플 예약(홍길동 책임)으로 렌더한 HTML이며 발송되지 않습니다.</li>
<li>현행(thinqreal.com) Apps Script의 값은 이 화면과 연동되지 않습니다 — 전환 후에는 이 화면이 단일 소스입니다.</li>
</ul></div>
</div>
<script>
const KEYS=${keysJson}, LABELS=${labelsJson};
const $=(s)=>document.querySelector(s); const token=(()=>{try{return localStorage.getItem('thinqreal_admin_token')||''}catch{return ''}})();
const srcLabel={db:'패널',env:'env',default:'미설정'};
function setMsg(t,cls){const m=$('#msg');m.textContent=t;m.className='note '+(cls||'')}
function render(d){const f=$('#fields');f.innerHTML='';for(const k of KEYS){const v=d.values[k]||'';const s=d.sources[k]||'default';
 const div=document.createElement('div');div.className='field';
 div.innerHTML='<label for="in_'+k+'">'+LABELS[k]+' <span class="src '+s+'">'+srcLabel[s]+'</span></label><input id="in_'+k+'" type="text" autocomplete="off" spellcheck="false" maxlength="100" value="'+(s==='default'?'':String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'))+'" placeholder="'+(d.envSet&&d.envSet[k]?'비우면 env 값 사용':'값 입력')+'">';
 f.appendChild(div);}}
async function load(){if(!token)return;setMsg('읽는 중…');try{const r=await (await fetch('/api?type=admin_mail_settings&token='+encodeURIComponent(token))).json();if(r.error){setMsg('조회 실패: '+(r.reason||r.error),'bad');return}render(r);setMsg('');['#btnSave','#btnReload','#btnPreview'].forEach(s=>$(s).disabled=false)}catch(e){setMsg('조회 실패: '+e.message,'bad')}}
async function save(){const settings={};for(const k of KEYS)settings[k]=$('#in_'+k).value;$('#btnSave').disabled=true;setMsg('저장 중…');
 try{const r=await (await fetch('/api',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'admin_mail_settings_set',token,settings})})).json();
 if(r.error||r.ok===false){setMsg('저장 실패: '+(r.reason||r.error||'')+(r.key?' ('+r.key+')':''),'bad')}else{render({values:r.values,sources:r.sources,envSet:lastEnvSet});setMsg('저장됨 — 다음 확정 메일부터 반영됩니다.','ok')}}
 catch(e){setMsg('저장 실패: '+e.message,'bad')}finally{$('#btnSave').disabled=false}}
let lastEnvSet={};
(async()=>{try{const h=await (await fetch('/healthz')).json();$('#envBadge').textContent=(h.env||'local')+' · '+(h.version||'')}catch{$('#envBadge').textContent='healthz 실패'}
 $('#tokenMsg').innerHTML=token?'<span class="ok">토큰 있음</span> — 같은 브라우저에서 <a href="/thinqreal_admin.html" target="_blank">관리자 페이지</a>에 로그인한 값을 사용합니다.':'<span class="bad">토큰 없음</span> — 먼저 <a href="/thinqreal_admin.html" target="_blank">관리자 페이지</a>에 로그인한 뒤 이 화면을 새로고침하세요.';
 const origLoad=load; await (async()=>{if(!token)return;const r=await (await fetch('/api?type=admin_mail_settings&token='+encodeURIComponent(token))).json().catch(()=>null);if(r&&r.envSet)lastEnvSet=r.envSet;})(); await origLoad();})();
$('#btnSave').addEventListener('click',save);$('#btnReload').addEventListener('click',load);
$('#btnPreview').addEventListener('click',()=>window.open('/api?type=admin_mail_preview&token='+encodeURIComponent(token),'_blank'));
</script></body></html>`;
}

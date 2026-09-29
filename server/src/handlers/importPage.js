// 관리자 「데이터 이행」 패널 — 컨테이너 전용 화면 (GET /api?type=admin_import_page, 키트 v5)
// 라이브 thinqreal_admin.html은 건드리지 않고 별도 HTML을 서버가 직접 서빙한다 (§8-17).
// 토큰은 같은 오리진의 관리자 페이지가 localStorage에 둔 것을 재사용 — 먼저 /thinqreal_admin.html 로그인.
// 사내 SSO 뒤(/api)라 외부에 노출되지 않으며, 모든 요청은 서버의 관리자 토큰 게이트를 다시 통과한다.
import { IMPORT_TABLES, STATE_KEYS } from './importData.js';

export function renderImportPage() {
  const tablesJson = JSON.stringify(IMPORT_TABLES);
  const stateKeysJson = JSON.stringify(STATE_KEYS);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ThinQ Real — 데이터 이행</title>
<style>
:root{--c:#3a5035;--bg:#f5f5f7;--card:#fff;--line:#e5e5ea;--muted:#6e6e73;--ok:#2e7d32;--warn:#b26a00;--bad:#c62828}
*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;background:var(--bg);color:#1d1d1f;font-size:14px;line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:0 0 12px}
.sub{color:var(--muted);margin-bottom:20px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:#eef2ec;color:var(--c);margin-left:6px}
.btn{appearance:none;border:0;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;background:var(--c);color:#fff;min-height:44px}
.btn.secondary{background:#e8ece7;color:var(--c)}.btn.danger{background:#fbe9e7;color:var(--bad)}.btn:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}input[type=file],input[type=text]{padding:9px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;min-height:44px}
table{border-collapse:collapse;width:100%;margin-top:12px;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600;white-space:nowrap}
td.num{text-align:right;font-variant-numeric:tabular-nums}.ok{color:var(--ok);font-weight:600}.warn{color:var(--warn);font-weight:600}.bad{color:var(--bad);font-weight:600}
.note{color:var(--muted);font-size:13px}code{background:#f0f0f2;padding:1px 5px;border-radius:4px;font-size:12px}
#log{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#1d1d1f;color:#d2d2d7;border-radius:10px;padding:12px;max-height:260px;overflow:auto}
label.chk{display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0;min-height:32px}details summary{cursor:pointer;color:var(--c)}
.hidden{display:none}
</style></head><body><div class="wrap">
<h1>데이터 이행 <span id="envBadge" class="badge">…</span></h1>
<div class="sub">구글 시트 스냅샷(.xlsx) → 이 환경의 저장소. 순서: ① 검사 → ② 적재 → ③ 검증. 파일은 매 단계 다시 전송됩니다(서버에 보관하지 않음).</div>

<div class="card" id="tokenCard"><h2>0. 관리자 토큰</h2><div id="tokenMsg" class="note">확인 중…</div></div>

<div class="card"><h2>1. 스냅샷 파일 · 검사</h2>
<div class="note">구글 시트에서 <b>파일 → 다운로드 → Microsoft Excel(.xlsx)</b> 로 받은 파일(탭 전체 포함). 검사는 쓰기가 없습니다.</div>
<div class="row" style="margin-top:10px"><input type="file" id="file" accept=".xlsx"><button class="btn" id="btnInspect" disabled>① 검사</button></div>
<div id="inspectOut"></div></div>

<div class="card"><h2>2. 적재</h2>
<div class="note">모드 — <b>skip</b>: 저장소에 없는 id만 추가(권장, 재실행 안전) / <b>replace</b>: 같은 id를 삭제 후 파일 값으로 교체(리허설 재적재용).</div>
<div class="row" style="margin-top:8px"><label class="chk"><input type="radio" name="mode" value="skip" checked> skip</label><label class="chk"><input type="radio" name="mode" value="replace"> replace</label></div>
<div id="tableChecks" class="note">검사 후 표가 나타납니다.</div>
<div class="row" style="margin-top:8px"><button class="btn" id="btnImport" disabled>② 적재 실행</button><span id="importProg" class="note"></span></div>
<div id="importOut"></div></div>

<div class="card"><h2>3. 검증</h2>
<div class="note">파일 ↔ 저장소를 id 단위로 대조합니다. 건수·양쪽 누락·값 불일치(날짜 표기 차이는 정규화 후 비교).</div>
<div class="row" style="margin-top:8px"><button class="btn" id="btnVerify" disabled>③ 검증</button></div>
<div id="verifyOut"></div></div>

<div class="card" id="purgeCard"><h2>4. 저장소에만 있는 행 삭제 (ST·QA 리허설 초기화 전용)</h2>
<div class="note">검증에서 「저장소에만」이 0이 아닐 때, 파일에 없는 id를 지웁니다. 운영(kic-op)에서는 서버가 거부합니다. 확인란에 <b>삭제</b>를 정확히 입력.</div>
<div class="row" style="margin-top:8px"><input type="text" id="purgeConfirm" placeholder="삭제"><button class="btn danger" id="btnPurge" disabled>초과 행 삭제</button></div>
<div id="purgeOut"></div></div>

<div class="card"><h2>5. 상태값 (Script Properties 이식)</h2>
<div class="note">현행 Apps Script의 Script Properties 값을 옮깁니다. 비워 두면 그 키는 건드리지 않습니다.</div>
<div id="stateForm"></div>
<div class="row" style="margin-top:8px"><button class="btn secondary" id="btnState">상태값 저장</button></div>
<div id="stateOut"></div></div>

<div class="card"><h2>로그</h2><div id="log"></div></div>
</div>
<script>
const TABLES=${tablesJson}, STATE_KEYS=${stateKeysJson};
const $=(s)=>document.querySelector(s); const token=(()=>{try{return localStorage.getItem('thinqreal_admin_token')||''}catch{return ''}})();
let inspected=null, env='';
function log(m){const el=$('#log');el.textContent+=(new Date()).toLocaleTimeString('ko-KR',{hour12:false})+'  '+m+'\\n';el.scrollTop=el.scrollHeight}
function esc(s){return String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function cls(n,goodWhenZero){return goodWhenZero?(n?'bad':'ok'):(n?'ok':'')}
function file(){return $('#file').files[0]||null}
async function call(action,extra,jsonBody){const f=file();const qs=new URLSearchParams({action,token,...(extra||{})});
 const r=await fetch('/api/import?'+qs.toString(),{method:'POST',body:jsonBody!=null?jsonBody:f,headers:{'Content-Type':jsonBody!=null?'application/json':'application/octet-stream'}});
 const j=await r.json(); if(j.error) log(action+' → 오류: '+j.error+(j.reason?' ('+j.reason+')':'')+(j.hint?' — '+j.hint:'')+(j.message?' — '+j.message:'')); return j}
function selectedTables(){return [...document.querySelectorAll('#tableChecks input:checked')].map((i)=>i.value)}
function mode(){return document.querySelector('input[name=mode]:checked').value}
function enable(){const has=!!file()&&!!token;$('#btnInspect').disabled=!has;$('#btnVerify').disabled=!has;$('#btnImport').disabled=!(has&&inspected);$('#btnPurge').disabled=!(has&&inspected&&env!=='kic-op')}

(async()=>{try{const h=await (await fetch('/healthz')).json();env=h.env||'';$('#envBadge').textContent=(h.env||'local')+' · '+h.backend+' · '+(h.version||'');if(env==='kic-op')$('#purgeCard').classList.add('hidden')}catch{$('#envBadge').textContent='healthz 실패'}
 $('#tokenMsg').innerHTML=token?'<span class="ok">토큰 있음</span> — 같은 브라우저에서 <a href="/thinqreal_admin.html" target="_blank">관리자 페이지</a>에 로그인한 값을 사용합니다.':'<span class="bad">토큰 없음</span> — 먼저 <a href="/thinqreal_admin.html" target="_blank">관리자 페이지</a>에 로그인한 뒤 이 화면을 새로고침하세요.';
 $('#stateForm').innerHTML=STATE_KEYS.map((k)=>'<div class="row" style="margin-top:6px"><code style="min-width:260px">'+esc(k)+'</code><input type="text" data-key="'+esc(k)+'" placeholder="(현재: 검사 후 표시)" style="flex:1"></div>').join('');
 enable()})();
$('#file').addEventListener('change',()=>{inspected=null;$('#tableChecks').textContent='검사 후 표가 나타납니다.';enable()});

$('#btnInspect').onclick=async()=>{log('검사 시작: '+file().name+' ('+Math.round(file().size/1024)+'KB)');const j=await call('inspect');if(!j.ok)return;inspected=j;
 const rows=j.tables.map((t)=>t.inFile?'<tr><td>'+t.table+'</td><td class="num">'+t.rows+'</td><td class="num">'+t.uniqueIds+'</td><td class="num '+cls(t.emptyId,true)+'">'+t.emptyId+'</td><td class="num '+cls(t.dupInFile,true)+'">'+t.dupInFile+'</td><td class="num">'+t.dbRows+'</td><td class="num">'+t.overlap+'</td><td class="num">'+t.newIds+'</td><td>'+(t.headerMissing.length?'<span class="warn">누락 '+esc(t.headerMissing.join(', '))+'</span>':'')+(t.headerUnknown.length?' <span class="note">무시 '+esc(t.headerUnknown.join(', '))+'</span>':'')+'</td></tr>'
  :'<tr><td>'+t.table+'</td><td colspan="8" class="note">파일에 이 탭이 없음</td></tr>').join('');
 $('#inspectOut').innerHTML='<table><tr><th>테이블</th><th>파일 행</th><th>고유 id</th><th>빈 id</th><th>파일 중복</th><th>저장소 기존</th><th>겹침</th><th>신규</th><th>헤더</th></tr>'+rows+'</table>'+(j.unknownSheets.length?'<div class="note" style="margin-top:8px">테이블에 대응하지 않는 탭(건너뜀): '+esc(j.unknownSheets.join(', '))+'</div>':'');
 $('#tableChecks').innerHTML=j.tables.filter((t)=>t.inFile).map((t)=>'<label class="chk"><input type="checkbox" value="'+t.table+'" checked> '+t.table+' <span class="note">(신규 '+t.newIds+')</span></label>').join('');
 document.querySelectorAll('#stateForm input').forEach((i)=>{i.placeholder='(현재: '+(j.state[i.dataset.key]||'없음')+')'});
 log('검사 완료 — 탭 '+j.tables.filter((t)=>t.inFile).length+'/'+TABLES.length+' 매칭');enable()};

$('#btnImport').onclick=async()=>{const ts=selectedTables();if(!ts.length){log('선택된 테이블 없음');return}const m=mode();
 if(m==='replace'&&!confirm('replace 모드: 선택한 테이블에서 파일과 같은 id의 행을 삭제하고 파일 값으로 교체합니다. 계속할까요?'))return;
 $('#btnImport').disabled=true;const out=[];$('#importOut').innerHTML='';
 for(let i=0;i<ts.length;i++){$('#importProg').textContent=(i+1)+'/'+ts.length+' '+ts[i]+' 적재 중…';log('적재 '+ts[i]+' ('+m+')');const j=await call('import',{tables:ts[i],mode:m});if(!j.ok){out.push({table:ts[i],error:j.error});continue}out.push(...j.results)}
 $('#importProg').textContent='완료';
 $('#importOut').innerHTML='<table><tr><th>테이블</th><th>파일 행</th><th>추가</th><th>교체</th><th>건너뜀(기존)</th><th>빈 id</th><th>파일 중복</th><th>오류</th></tr>'+out.map((r)=>r.error?'<tr><td>'+r.table+'</td><td colspan="7" class="bad">'+esc(r.error)+'</td></tr>':'<tr><td>'+r.table+'</td><td class="num">'+(r.rows??'')+'</td><td class="num ok">'+r.inserted+'</td><td class="num">'+r.replaced+'</td><td class="num">'+r.skipped+'</td><td class="num '+cls(r.emptyId,true)+'">'+r.emptyId+'</td><td class="num">'+r.dupInFile+'</td><td>'+((r.errors||[]).length?'<span class="bad">'+r.errors.length+'건</span> '+esc(r.errors.map((e)=>e.row+'행 '+e.id+': '+e.error).join(' / ')):'')+'</td></tr>').join('')+'</table>';
 log('적재 완료 — 추가 '+out.reduce((a,r)=>a+(r.inserted||0),0)+' 교체 '+out.reduce((a,r)=>a+(r.replaced||0),0));enable()};

$('#btnVerify').onclick=async()=>{log('검증 시작');const j=await call('verify');if(!j.ok)return;
 $('#verifyOut').innerHTML='<div style="margin-top:8px">'+(j.allMatch?'<span class="ok">전 테이블 일치</span>':'<span class="bad">불일치 있음</span>')+'</div><table><tr><th>테이블</th><th>파일</th><th>저장소</th><th>파일에만</th><th>저장소에만</th><th>값 불일치 행</th><th>결과</th></tr>'+j.results.map((r)=>r.inFile?'<tr><td>'+r.table+'</td><td class="num">'+r.fileRows+'</td><td class="num">'+r.dbRows+'</td><td class="num '+cls(r.missingInDb,true)+'">'+r.missingInDb+(r.missingInDb?'<details><summary>id</summary>'+esc(r.missingInDbIds.join(', '))+'</details>':'')+'</td><td class="num '+cls(r.extraInDb,true)+'">'+r.extraInDb+(r.extraInDb?'<details><summary>id</summary>'+esc(r.extraInDbIds.join(', '))+'</details>':'')+'</td><td class="num '+cls(r.mismatchRows,true)+'">'+r.mismatchRows+(r.mismatches.length?'<details><summary>예시</summary>'+r.mismatches.map((m)=>esc(m.id)+' · '+esc(m.field)+': 파일「'+esc(m.file)+'」 저장소「'+esc(m.db)+'」').join('<br>')+'</details>':'')+'</td><td>'+(r.match?'<span class="ok">✓</span>':'<span class="bad">✗</span>')+'</td></tr>':'<tr><td>'+r.table+'</td><td colspan="6" class="note">파일에 없음</td></tr>').join('')+'</table>';
 log('검증 완료 — '+(j.allMatch?'전부 일치':'불일치 있음'))};

$('#btnPurge').onclick=async()=>{const ts=selectedTables();const c=$('#purgeConfirm').value;if(c!=='삭제'){log('확인란에 「삭제」를 입력하세요');return}
 if(!confirm('선택한 테이블('+ts.join(', ')+')에서 파일에 없는 id의 행을 삭제합니다. 되돌릴 수 없습니다.'))return;
 log('초과 행 삭제: '+ts.join(', '));const j=await call('purge_extra',{tables:ts.join(','),confirm:c});if(!j.ok)return;
 $('#purgeOut').innerHTML='<table><tr><th>테이블</th><th>삭제</th></tr>'+j.results.map((r)=>'<tr><td>'+r.table+'</td><td class="num">'+r.removed+'</td></tr>').join('')+'</table>';$('#purgeConfirm').value='';log('삭제 완료')};

$('#btnState').onclick=async()=>{const pairs=[...document.querySelectorAll('#stateForm input')].filter((i)=>i.value.trim()).map((i)=>({key:i.dataset.key,value:i.value.trim()}));if(!pairs.length){log('입력된 상태값 없음');return}
 const j=await call('state',{},JSON.stringify({pairs}));if(!j.ok)return;$('#stateOut').innerHTML='<div class="note" style="margin-top:8px">'+Object.entries(j.state).map(([k,v])=>'<code>'+esc(k)+'</code> = '+esc(v||'(없음)')).join('<br>')+'</div>';log('상태값 저장: '+j.applied.join(', '))};
</script></body></html>`;
}

'use strict';
// Pure parsing helper is also exercised by the local client tests.
function readStageLaunch_(search,saved){
  const direct=new URLSearchParams(search),state=direct.get('liff.state')||'',nested=new URLSearchParams(state.includes('?')?state.slice(state.indexOf('?')+1):state.replace(/^[?#]/,''));
  for(const p of [direct,nested])for(const k of ['view','event'])if(p.getAll(k).length>1)throw Error('リンクの指定が重複しています。');
  const d=direct.get('event'),n=nested.get('event');if(d&&n&&d!==n)throw Error('イベントの指定が一致しません。');
  const restore=direct.has('code')&&direct.has('state')?saved:null;
  return {eventId:d||n||(restore&&restore.eventId)||'',view:direct.get('view')||nested.get('view')||(restore&&restore.view)||'event'};
}
(function(){
  const $=id=>document.getElementById(id),screens=['loading','register','confirm','event'];
  let busy=false,current=null,confirmation='',launch=null,config=null,blocked=false;
  const show=id=>screens.forEach(x=>$(x).hidden=x!==id);
  const controls=()=>document.querySelectorAll('button,input');
  function setBusy(v){busy=v;controls().forEach(el=>el.disabled=v);if(!v&&current&&current.view==='event'){$('save').disabled=!current.canRespond;document.querySelectorAll('input[name="attendance"]').forEach(el=>el.disabled=!current.canRespond);}}
  const error=e=>{$('error').textContent=e&&e.message?e.message:String(e);};
  function validateConfig(){
    const c=RSVP_CONFIG;
    if(c.environment!=='RSVP_E2E_20261108'||c.eventId!=='newyear_2027_rsvp_e2e_20261108'||!/^2011909807-[A-Za-z0-9_-]{4,32}$/.test(c.liffId)||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(c.gasUrl))throw Error('隔離環境の設定が未完了です。');
    let saved=null;try{saved=JSON.parse(sessionStorage.getItem('rsvp-e2e-launch')||'null');}catch(_){}
    launch=readStageLaunch_(location.search,saved);
    if(launch.eventId!==c.eventId||launch.view!=='event')throw Error('指定された隔離試験リンクから開いてください。');
    config=c;
  }
  async function api(action,fields={}){
    if(!config||blocked)throw Error('隔離環境の設定を確認してください。');
    // Always get the current ID token from the SDK; never persist it or put it in a URL.
    const token=liff.getIDToken();if(!token)throw Error('LINEから開き直して認証してください。');
    const body=new URLSearchParams({action,eventId:launch.eventId,idToken:token,...fields});
    const response=await fetch(config.gasUrl,{method:'POST',body,cache:'no-store',redirect:'follow',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('通信に失敗しました。再読み込みして確認してください。');
    const r=await response.json();if(!r||typeof r.ok!=='boolean')throw Error('結果を読み取れません。再読み込みして確認してください。');
    if(!r.ok)throw Error(r.error||'操作を完了できません。');
    if(r.eventId!==launch.eventId)throw Error('応答のイベントが一致しません。');return r;
  }
  function render(r){
    current=r;$('notice').textContent='';$('error').textContent='';
    if(r.view==='register'){confirmation='';show('register');return;}
    if(r.view==='confirm'){confirmation=r.confirmationToken;$('confirmName').textContent=r.member.name;$('confirmTerm').textContent='部内期数：'+r.member.clubTerm;show('confirm');return;}
    if(r.view!=='event')throw Error('想定外の画面です。');
    $('subject').textContent=r.subject;$('schedule').textContent=r.schedule;$('deadline').textContent='出欠回答期限：'+r.answerDeadline;$('member').textContent=r.memberName+' 様';$('current').textContent='現在の出欠：'+(r.attendance==='出席'?'参加':r.attendance);$('guide').textContent=r.formMessage;
    document.querySelectorAll('input[name="attendance"]').forEach(el=>{el.checked=el.value===r.attendance;el.disabled=!r.canRespond;});$('answerNote').textContent=r.canRespond?'回答期限までは変更できます。':'現在、回答の保存はできません。';$('save').disabled=!r.canRespond;show('event');
  }
  async function run(fn){if(busy)return;setBusy(true);$('error').textContent='';try{await fn();}catch(e){error(e);}finally{setBusy(false);}}
  async function start(){
    try{validateConfig();if(typeof liff==='undefined')throw Error('LINE認証の準備を読み込めません。SDK更新や通信状態を確認してください。');
      await liff.init({liffId:config.liffId,withLoginOnExternalBrowser:false});
      if(!liff.isLoggedIn()){
        sessionStorage.setItem('rsvp-e2e-launch',JSON.stringify({eventId:launch.eventId,view:'event'}));
        const redirect=new URL(location.href);redirect.search='';redirect.hash='';redirect.searchParams.set('view','event');redirect.searchParams.set('event',launch.eventId);
        liff.login({redirectUri:redirect.toString()});return;
      }
      const r=await api('eventResolve');sessionStorage.removeItem('rsvp-e2e-launch');render(r);
    }catch(e){if(!config)blocked=true;show('loading');$('loading').querySelector('h1').textContent='画面を開けません';error(e);}
  }
  $('lookupForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>render(await api('registrationLookup',{name:$('name').value,clubTerm:$('term').value,birthDate:$('birth').value})));});
  $('confirmSave').addEventListener('click',()=>run(async()=>{render(await api('registrationConfirm',{confirmationToken:confirmation}));confirmation='';$('name').value='';$('term').value='';$('birth').value='';}));
  $('confirmBack').addEventListener('click',()=>{confirmation='';current=null;show('register');});
  $('answerForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const chosen=document.querySelector('input[name="attendance"]:checked');if(!current||!chosen)throw Error('参加・未定・欠席から選択してください。');render(await api('eventRespond',{attendance:chosen.value,details:'{}',responseTicket:current.responseTicket}));$('notice').textContent='回答を保存しました。回答期限までは変更できます。';});});
  $('reload').addEventListener('click',()=>location.reload());
  document.addEventListener('DOMContentLoaded',()=>run(start));
})();

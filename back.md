<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c1116">
<title>Manna Reports</title>
<style>
  :root{
    --bg:#0c1116; --panel:#141b22; --panel2:#101820; --line:#26323d; --ink:#e8eef4; --ink-dim:#9fb0bf;
    --muted:#6f818f; --steel:#7fb1d8; --elec:#7c9cf0; --ember:#f0a35a; --ok:#46c79a; --amber:#f3c969;
    --err:#ef6b5b; --accent:#7fb1d8;
  }
  *{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body{ margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  body{ padding:0 0 60px; }
  .wrap{ max-width:820px; margin:0 auto; padding:0 14px; }
  header{ position:sticky; top:0; z-index:20; background:linear-gradient(180deg,#0c1116 72%,rgba(12,17,22,0)); padding:14px 0 8px; }
  h1{ font-size:20px; margin:0; letter-spacing:.3px; }
  .sub{ color:var(--muted); font-size:12px; margin-top:2px; }
  .tabs{ display:flex; gap:6px; margin-top:12px; }
  .tab{ flex:1; text-align:center; padding:9px 4px; border-radius:10px; background:var(--panel2); border:1px solid var(--line);
    color:var(--ink-dim); font-size:12.5px; font-weight:600; cursor:pointer; }
  .tab.on{ background:var(--accent); color:#08222e; border-color:var(--accent); }
  .panel{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px; margin-top:12px; }
  .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
  select,input,textarea{ background:#0e151b; border:1px solid var(--line); color:var(--ink); border-radius:9px; padding:9px 10px; font-size:14px; width:100%; font-family:inherit; }
  label{ display:block; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
  .bar{ display:flex; gap:8px; }
  .bar .f{ flex:1; }
  .chips{ display:flex; gap:6px; }
  .chip{ padding:7px 13px; border-radius:999px; background:var(--panel2); border:1px solid var(--line); color:var(--ink-dim); font-size:12.5px; font-weight:600; cursor:pointer; }
  .chip.on{ background:var(--ember); color:#2a1607; border-color:var(--ember); }
  .grouphead{ font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); margin:16px 2px 6px; }
  .mrow{ display:flex; align-items:center; justify-content:space-between; gap:10px; background:var(--panel); border:1px solid var(--line);
    border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer; }
  .mrow:active{ background:var(--panel2); }
  .mrow .mn{ font-weight:600; }
  .mrow .mk{ font-size:11px; color:var(--muted); }
  .badge{ background:#0e151b; border:1px solid var(--line); border-radius:999px; padding:3px 10px; font-size:12px; color:var(--ink-dim); }
  .badge.hot{ color:var(--ember); border-color:#5a4420; }
  .badge.warn{ color:var(--err); border-color:#5a2c1d; }
  .badge.ok{ color:var(--ok); border-color:#244338; }
  .badge.none{ color:var(--muted); }
  .chev{ color:var(--muted); font-size:18px; }
  .back{ display:inline-flex; align-items:center; gap:6px; color:var(--steel); font-size:13px; cursor:pointer; margin:2px 0 4px; }
  .kpis{ display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .kpi{ flex:1; min-width:82px; background:var(--panel2); border:1px solid var(--line); border-radius:11px; padding:10px 12px; }
  .kpi b{ display:block; font-size:17px; }
  .kpi span{ font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
  .runcard{ background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:12px 13px; margin-top:10px; }
  .runcard .top{ display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
  .runcard .ttl{ font-weight:600; }
  .runcard .when{ font-size:11px; color:var(--muted); }
  .params{ display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
  .chiplet{ background:#0e151b; border:1px solid var(--line); border-radius:8px; padding:5px 9px; font-size:12px; color:var(--ink-dim); }
  .chiplet b{ color:var(--ink); }
  .qchip{ font-size:11px; padding:2px 8px; border-radius:999px; background:#22304a; color:#cfe0ff; }
  .shiftbox{ border:1px solid var(--line); border-radius:12px; padding:11px 13px; margin-top:10px; background:var(--panel2); }
  .shiftbox .sh{ font-weight:600; margin-bottom:6px; }
  .dt{ color:var(--ember); }
  .muted{ color:var(--muted); }
  .empty{ text-align:center; color:var(--muted); padding:30px 10px; font-size:13.5px; }
  .err{ background:#2c1816; border:1px solid #5a2c1d; color:#f0b3ab; border-radius:11px; padding:11px 13px; font-size:13px; margin-top:12px; }
  .reasons div{ margin-top:8px; font-size:13px; line-height:1.4; }
  .reasons .lab{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
  table.tt{ width:100%; border-collapse:collapse; font-size:12.5px; }
  table.tt th,table.tt td{ text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); }
  table.tt th{ color:var(--muted); font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
  .tnum{ text-align:right; font-variant-numeric:tabular-nums; }
  .warnrow{ color:var(--err); }
  .okrow{ color:var(--ink); }
  .refresh{ background:none; border:1px solid var(--line); color:var(--ink-dim); border-radius:9px; padding:7px 12px; font-size:12px; cursor:pointer; }
  .spin{ color:var(--muted); font-size:13px; padding:20px; text-align:center; }
  svg.chart{ width:100%; height:200px; display:block; }
  .effcard{ background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:12px 13px; margin-bottom:10px; }
  .effcard.flag{ border-color:#5a2c1d; background:#1c1512; }
  .metric{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; padding:6px 0; border-bottom:1px solid #1b242d; }
  .metric:last-child{ border-bottom:none; }
  .metric .mv{ font-variant-numeric:tabular-nums; font-weight:600; }
  .metric .mb{ font-size:11px; color:var(--muted); }
  .warnpill{ font-size:10px; padding:2px 7px; border-radius:999px; background:#3a1d17; color:var(--err); border:1px solid #5a2c1d; margin-left:6px; }
  .okpill{ font-size:10px; padding:2px 7px; border-radius:999px; background:#12241c; color:var(--ok); border:1px solid #244338; margin-left:6px; }
  .btn{ display:inline-block; background:var(--accent); color:#08222e; border:none; border-radius:9px; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn.ghost{ background:none; border:1px solid var(--line); color:var(--ink-dim); }
  .btn.block{ width:100%; }
  .modal{ position:fixed; inset:0; z-index:60; background:rgba(4,8,11,.72); display:flex; align-items:flex-end; justify-content:center; }
  .modal .sheet{ background:var(--panel); border:1px solid var(--line); border-radius:16px 16px 0 0; width:100%; max-width:820px; padding:16px 16px 22px; }
  @media(min-width:560px){ .modal{ align-items:center; } .modal .sheet{ border-radius:16px; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="row">
      <div><h1>Manna Reports</h1><div class="sub" id="sub">Reclaim plant · read-only</div></div>
      <button class="refresh" id="refresh">↻ Refresh</button>
    </div>
    <div class="tabs">
      <div class="tab on" data-tab="history">History</div>
      <div class="tab" data-tab="eff">Efficiency</div>
      <div class="tab" data-tab="rates">Rates</div>
      <div class="tab" data-tab="cost">Costing</div>
      <div class="tab" data-tab="maint">Maintenance</div>
      <div class="tab" data-tab="bear">Bearings</div>
    </div>
  </header>
  <div id="view"></div>
</div>
<div id="modal"></div>
<script>
(function(){
  var SB_URL="https://xqdmxfjmmazfpmsvbnjx.supabase.co";
  var SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZG14ZmptbWF6ZnBtc3Zibmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE2MDcsImV4cCI6MjA5NzIwNzYwN30.tjR30i3Cdaz-6S2tr-7s5gvvOz24rTK0KyxW47itC6s";

  var MACHINES=[
    {id:"CRK",  name:"Cracker",        short:"CRK",     kind:"grind",     group:"Grinding line"},
    {id:"GRD_K",name:"Grinder 1",      short:"Grind 1", kind:"grind",     group:"Grinding line"},
    {id:"GRD_S",name:"Grinder 2",      short:"Grind 2", kind:"grind",     group:"Grinding line"},
    {id:"GRD_O",name:"Soorya Grinder", short:"Soorya",  kind:"grind",     group:"Grinding line"},
    {id:"AC_A", name:"Autoclave A",    short:"AC-A",    kind:"autoclave", group:"Autoclaves"},
    {id:"AC_M", name:"Autoclave M",    short:"AC-M",    kind:"autoclave", group:"Autoclaves"},
    {id:"PR2",  name:"Pre-Refiner 2",  short:"PR2",     kind:"prerefiner",group:"Pre-Refiners"},
    {id:"R1",   name:"Refiner 1",      short:"R1",      kind:"refiner",   group:"Refiners"},
    {id:"R3",   name:"Refiner 3",      short:"R3",      kind:"refiner",   group:"Refiners"},
    {id:"R4",   name:"Refiner 4",      short:"R4",      kind:"refiner",   group:"Refiners"},
    {id:"PR1",  name:"Pre-Refiner 1",  short:"PR1",     kind:"coarse",    group:"Coarse line"},
    {id:"R2",   name:"Refiner 2",      short:"R2",      kind:"coarse",    group:"Coarse line"}
  ];
  var GROUPS=["Grinding line","Autoclaves","Pre-Refiners","Refiners","Coarse line"];
  var REFINERS=["PR2","R1","R3","R4"];
  var GRINDERS=["CRK","GRD_K","GRD_S","GRD_O"];
  var SHIFT_MIN=720, TEMP_LIMIT=80;
  // warning thresholds (fraction of the plant's own baseline)
  var TH_LABOUR=0.80;   // production/man-hour below 80% of usual → warn
  var TH_ENERGY=1.25;   // kWh/kg above 125% of usual → warn (more energy = worse)
  var TH_YIELD=0.85;    // yield below 85% of usual → warn
  var TH_UTIL=0.70;     // utilisation below 70% (i.e. >30% downtime) → warn

  function M(id){ for(var i=0;i<MACHINES.length;i++) if(MACHINES[i].id===id) return MACHINES[i]; return {id:id,name:id,short:id,kind:"",group:"Other"}; }
  function isGrind(id){ return M(id).kind==="grind"; }

  var S={ tab:"history", loading:true, err:"", runs:[], maint:[], bears:[], notes:[],
          histDate:"", histMachine:"", histShift:"all",
          rates:{}, costPwOk:false, costBatch:"",
          effDate:"", effShift:"Day",
          maintMonth:"", maintMachine:null, bearMachine:null };

  /* helpers */
  function num(v){ if(v==null||v==="") return null; var n=parseFloat(v); return isNaN(n)?null:n; }
  function p2(n){ return (n<10?"0":"")+n; }
  function fmtClockISO(iso){ if(!iso) return "—"; var d=new Date(iso); return p2(d.getHours())+":"+p2(d.getMinutes()); }
  function isoDay(iso){ if(!iso) return ""; var d=new Date(iso); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
  var MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDay(s){ if(!s) return "—"; var p=String(s).split("-"); if(p.length<3) return s; return parseInt(p[2],10)+" "+MO[parseInt(p[1],10)-1]+" "+p[0]; }
  function fmtMonth(ym){ if(!ym) return "—"; var p=String(ym).split("-"); return MO[parseInt(p[1],10)-1]+" "+p[0]; }
  function fmtH(h){ if(h==null) return "—"; return (Math.round(h*100)/100)+" h"; }
  function fmtMinAsH(min){ if(min==null) return "—"; return (Math.round((min/60)*100)/100)+" h"; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
  function monthOf(dateStr){ if(!dateStr) return ""; var p=String(dateStr).split("-"); return p[0]+"-"+p[1]; }
  function rnd(n,d){ var f=Math.pow(10,d||0); return Math.round(n*f)/f; }
  function median(arr){ var a=arr.filter(function(x){return x!=null&&!isNaN(x);}).sort(function(x,y){return x-y;}); if(!a.length) return null; var m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
  function runHours(r){
    if(num(r.hours_run)!=null) return num(r.hours_run);
    if(num(r.hour_end)!=null && num(r.hour_start)!=null) return Math.max(0,num(r.hour_end)-num(r.hour_start));
    if(num(r.runtime_min)!=null) return num(r.runtime_min)/60;
    if(r.loaded_at && r.unloaded_at){ var d=(new Date(r.unloaded_at)-new Date(r.loaded_at))/3600000; return d>0?d:null; }
    return null;
  }
  function runKwh(r){ if(num(r.kwh)!=null) return num(r.kwh); if(num(r.elec_end)!=null&&num(r.elec_start)!=null) return Math.max(0,num(r.elec_end)-num(r.elec_start)); return null; }
  function runDate(r){ return r.shift_date || (r.end?isoDay(r.ended_at):"") ; }
  // Classify a moment into the plant's shift, in IST wall-clock, regardless of the viewer's timezone.
  // Day = 08:30–20:30 (same date). Night = 20:30–08:30; a load before 08:30 belongs to the PREVIOUS day's night shift.
  function shiftClassify(iso){
    if(!iso) return null;
    var t=new Date(iso).getTime(); if(isNaN(t)) return null;
    var ist=new Date(t + 330*60000);                       // + 5:30, then read via UTC getters = IST wall clock
    var mins=ist.getUTCHours()*60+ist.getUTCMinutes();
    var y=ist.getUTCFullYear(), mo=ist.getUTCMonth(), d=ist.getUTCDate();
    function iso3(Y,Mo,D){ return Y+"-"+p2(Mo+1)+"-"+p2(D); }
    if(mins>=510 && mins<1230) return { date:iso3(y,mo,d), shift:"Day" };     // 08:30–20:30
    if(mins>=1230)             return { date:iso3(y,mo,d), shift:"Night" };    // 20:30–24:00
    var pd=new Date(Date.UTC(y,mo,d)); pd.setUTCDate(pd.getUTCDate()-1);       // 00:00–08:30 → previous day's night
    return { date:iso3(pd.getUTCFullYear(),pd.getUTCMonth(),pd.getUTCDate()), shift:"Night" };
  }
  // Effective shift for a run. Autoclaves are classified by LOADING time only (never unloading).
  function runShift(r){
    if(r.kind==="autoclave" && r.loaded_at){ var c=shiftClassify(r.loaded_at); if(c) return c; }
    return { date:r.shift_date||"", shift:r.shift||"" };
  }
  function istParts(iso){ var t=new Date(iso).getTime(); if(isNaN(t)) return null; var d=new Date(t+330*60000); return {y:d.getUTCFullYear(),mo:d.getUTCMonth(),day:d.getUTCDate(),h:d.getUTCHours(),mi:d.getUTCMinutes()}; }
  function istClock(iso){ var p=istParts(iso); return p?(p2(p.h)+":"+p2(p.mi)):"—"; }
  function istDay(iso){ var p=istParts(iso); return p?(p.y+"-"+p2(p.mo+1)+"-"+p2(p.day)):""; }

  /* data */
  function get(table){
    return fetch(SB_URL+"/rest/v1/"+table+"?select=*&limit=50000",{ headers:{ apikey:SB_KEY, Authorization:"Bearer "+SB_KEY } })
      .then(function(r){ if(!r.ok) throw new Error(table+" "+r.status); return r.json(); });
  }
  function postNote(row){
    return fetch(SB_URL+"/rest/v1/efficiency_notes",{ method:"POST",
      headers:{ apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, "Content-Type":"application/json", Prefer:"return=representation" },
      body:JSON.stringify(row) }).then(function(r){ if(!r.ok) throw new Error("save "+r.status); return r.json(); });
  }
  function saveRates(data){
    return fetch(SB_URL+"/rest/v1/cost_rates?id=eq.current",{ method:"PATCH",
      headers:{ apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, "Content-Type":"application/json", Prefer:"return=minimal" },
      body:JSON.stringify({ data:data, updated_at:new Date().toISOString() }) })
      .then(function(r){ if(!r.ok) throw new Error("save "+r.status); });
  }
  function loadAll(){
    S.loading=true; S.err=""; render();
    Promise.all([get("runs"),get("maintenance"),get("bearing_logs"),get("efficiency_notes"),get("cost_rates")]).then(function(res){
      S.runs=res[0]||[]; S.maint=res[1]||[]; S.bears=res[2]||[]; S.notes=res[3]||[];
      S.rates=((res[4]||[])[0]||{}).data||{};
      var ds=S.runs.map(function(r){ return r.shift_date; }).filter(Boolean).sort();
      var months={}; S.runs.forEach(function(r){ var mo=monthOf(r.shift_date); if(mo) months[mo]=1; });
      S.maint.forEach(function(m){ var mo=monthOf(isoDay(m.down_start)); if(mo) months[mo]=1; });
      var mk=Object.keys(months).sort();
      S.maintMonth=S.maintMonth||(mk.length?mk[mk.length-1]:"");
      S.effDate=S.effDate||(ds.length?ds[ds.length-1]:"");
      S.loading=false; render();
    }).catch(function(e){ S.loading=false; S.err=String(e&&e.message||e); render(); });
  }

  var view=document.getElementById("view");
  function render(){
    document.querySelectorAll(".tab").forEach(function(t){ t.classList.toggle("on", t.getAttribute("data-tab")===S.tab); });
    if(S.loading){ view.innerHTML='<div class="spin">Loading plant data…</div>'; return; }
    if(S.err){ view.innerHTML='<div class="err">Couldn\'t load data: '+esc(S.err)+'<br><span class="muted">Check internet, then tap Refresh.</span></div>'; return; }
    if(S.tab==="history") view.innerHTML=historyView();
    else if(S.tab==="eff") view.innerHTML=effView();
    else if(S.tab==="rates") view.innerHTML=ratesView();
    else if(S.tab==="cost") view.innerHTML=costView();
    else if(S.tab==="maint") view.innerHTML=S.maintMachine?maintDetail():maintList();
    else view.innerHTML=S.bearMachine?bearDetail():bearList();
    wire();
  }

  /* ===================== Production ===================== */
  function dayRuns(date,shift){ return S.runs.filter(function(r){ var c=runShift(r); return c.date===date && (shift==="all"||(c.shift||"")===shift); }); }
  function historyView(){
    var dates={}; S.runs.forEach(function(r){ var c=runShift(r); if(c.date) dates[c.date]=1; });
    var dlist=Object.keys(dates).sort().reverse();
    var dOpts='<option value="">All days</option>'+dlist.map(function(d){ return '<option value="'+esc(d)+'"'+(S.histDate===d?" selected":"")+'>'+esc(fmtDay(d))+'</option>'; }).join("");
    var mPresent={}; S.runs.forEach(function(r){ if(r.machine_id) mPresent[r.machine_id]=1; });
    var mOpts='<option value="">All machines</option>'+MACHINES.filter(function(m){ return mPresent[m.id]; }).map(function(m){ return '<option value="'+esc(m.id)+'"'+(S.histMachine===m.id?" selected":"")+'>'+esc(m.name)+'</option>'; }).join("");
    var fr=S.runs.filter(function(r){ var c=runShift(r); return (!S.histDate||c.date===S.histDate) && (!S.histMachine||r.machine_id===S.histMachine) && (S.histShift==="all"||(c.shift||"")===S.histShift); });
    fr.sort(function(a,b){ return (+new Date(b.started_at||b.loaded_at||0)) - (+new Date(a.started_at||a.loaded_at||0)); });
    var totK=0,totW=0; fr.forEach(function(r){ var k=runKwh(r); if(k!=null)totK+=k; var w=num(r.weight_kg); if(w!=null)totW+=w; });
    var chips=["all","Day","Night"].map(function(s){ return '<div class="chip'+(S.histShift===s?" on":"")+'" data-histshift="'+s+'">'+(s==="all"?"Both shifts":s+" shift")+'</div>'; }).join("");
    var html='<div class="panel"><div class="bar"><div class="f"><label>Day</label><select id="hist-date">'+dOpts+'</select></div>'+
      '<div class="f"><label>Machine</label><select id="hist-machine">'+mOpts+'</select></div></div>'+
      '<div class="chips" style="margin-top:10px">'+chips+'</div>'+
      '<div class="kpis"><div class="kpi"><b>'+fr.length+'</b><span>runs</span></div><div class="kpi"><b>'+Math.round(totK)+'</b><span>kWh</span></div><div class="kpi"><b>'+Math.round(totW)+'</b><span>kg out</span></div></div></div>';
    if(!fr.length) return html+'<div class="empty">No runs match these filters.</div>';
    var rows=fr.map(function(r){
      var c=runShift(r), m=M(r.machine_id), isAuto=(r.kind==="autoclave");
      var h=runHours(r), k=runKwh(r), w=num(r.weight_kg);
      var when='<b>'+esc(fmtDay(c.date))+'</b>'+(c.shift?'<br><span class="muted" style="font-size:10px">'+esc(c.shift)+' shift</span>':'')+(r.supervisor?'<br><span class="muted" style="font-size:10px">'+esc(r.supervisor)+'</span>':'');
      var mCell='<b>'+esc(m.short)+'</b>'+(isAuto?'<br><span class="muted" style="font-size:9px">⤓'+istClock(r.loaded_at)+' ⤒'+istClock(r.unloaded_at)+(r.loaded_at&&r.unloaded_at&&istDay(r.loaded_at)!==istDay(r.unloaded_at)?'⁺¹':'')+'</span>':'');
      var bq=(r.batch_no?'<span class="batchref" style="font-size:12px">'+esc(r.batch_no)+'</span>':'—')+(r.quality?' <span class="qchip">'+esc(r.quality)+'</span>':'')+(r.formulation?'<br><span class="muted" style="font-size:10px">'+esc(r.formulation)+'</span>':'');
      var es=num(r.elec_start), ee=num(r.elec_end), hs=num(r.hour_start), he=num(r.hour_end);
      var eCell=(k!=null?rnd(k,1)+' kWh':'—')+((!isAuto&&(es!=null||ee!=null))?'<br><span class="muted" style="font-size:9px">'+(es!=null?es:'—')+'→'+(ee!=null?ee:'—')+(r.machine_id==="GRD_O"?' ×3':'')+'</span>':'')+(num(r.firewood_kg)!=null?'<br><span class="muted" style="font-size:9px">'+num(r.firewood_kg)+' fw</span>':'');
      var rCell=fmtH(h)+((!isAuto&&(hs!=null||he!=null))?'<br><span class="muted" style="font-size:9px">hr '+(hs!=null?hs:'—')+'→'+(he!=null?he:'—')+'</span>':'');
      var wCell=(w!=null?esc(w)+' kg':'—');
      return '<tr data-run="'+esc(r.id)+'" style="cursor:pointer"><td>'+when+'</td><td>'+mCell+'</td><td>'+bq+'</td><td class="tnum">'+rCell+'</td><td class="tnum">'+eCell+'</td><td class="tnum">'+(num(r.workers)!=null?num(r.workers):'—')+'</td><td class="tnum">'+wCell+'</td></tr>';
    }).join("");
    html+='<div class="sub" style="margin:12px 2px 6px">Tap any row for the full run details.</div>'+
      '<div class="panel" style="padding:0;overflow:hidden;margin-top:0"><div class="scroll-x"><table class="tt" style="min-width:560px"><thead><tr><th>When</th><th>Machine</th><th>Batch / grade</th><th class="tnum">Run</th><th class="tnum">Energy</th><th class="tnum">Crew</th><th class="tnum">Out</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    return html;
  }
  function runCard(r){
    var m=M(r.machine_id), isAuto=(r.kind==="autoclave");
    var sc=runShift(r);
    var h=runHours(r), k=runKwh(r), w=num(r.weight_kg), wk=num(r.workers);
    var ttl = isAuto ? ('Batch '+esc(r.batch_no||"—")) : (r.batch_no?('Batch '+esc(r.batch_no)):(m.kind==="grind"?(sc.shift||""):'Run'));
    var when = (sc.shift?esc(sc.shift):'')+(r.supervisor?' · '+esc(r.supervisor):'');
    var P=[];
    P.push('<span class="chiplet">Run <b>'+fmtH(h)+'</b></span>');
    if(k!=null) P.push('<span class="chiplet">Energy <b>'+rnd(k,1)+'</b> kWh</span>');
    if(k!=null&&h&&h>0) P.push('<span class="chiplet">Load <b>'+rnd(k/h,1)+'</b> kWh/h</span>');
    if(num(r.firewood_kg)!=null) P.push('<span class="chiplet">Firewood <b>'+num(r.firewood_kg)+'</b> kg</span>');
    if(wk!=null) P.push('<span class="chiplet">Crew <b>'+wk+'</b></span>');
    if(w!=null) P.push('<span class="chiplet">Output <b>'+w+'</b> kg</span>');
    if(w!=null&&k!=null&&w>0) P.push('<span class="chiplet">'+rnd(k/w,3)+' kWh/kg</span>');
    if(r.quality) P.unshift('<span class="qchip">'+esc(r.quality)+'</span>');
    var loadLine = isAuto ? '<div class="when">⤓ load '+istClock(r.loaded_at)+' <span class="muted">'+esc(fmtDay(istDay(r.loaded_at)))+'</span> · ⤒ unload '+istClock(r.unloaded_at)+
        ((r.loaded_at&&r.unloaded_at&&istDay(r.loaded_at)!==istDay(r.unloaded_at))?' <span class="muted">'+esc(fmtDay(istDay(r.unloaded_at)))+'</span>':'')+
        ' · <span style="color:var(--steel)">counts in '+esc(sc.shift)+' shift of '+esc(fmtDay(sc.date))+' (by loading)</span></div>' : '';
    return '<div class="runcard"><div class="top"><div class="ttl">'+ttl+'</div><div class="when">'+when+'</div></div>'+
      loadLine+'<div class="params">'+P.join("")+'</div></div>';
  }

  /* ===================== Efficiency (per SHIFT) ===================== */
  // Production / man-hour, as specified: total production of a grade ÷ (total workers × total running hours)
  // across the refiner passes that grade ran through IN THIS SHIFT. Unit = one shift (day + Day/Night).
  // Baselines = median of every shift-unit in all history, per grade / per grinder.
  function refinerUnits(runs){                 // per shift_date + shift + quality
    var g={};
    runs.forEach(function(r){
      if(r.line!=="special" || !r.quality || REFINERS.indexOf(r.machine_id)<0) return;
      var key=r.shift_date+"|"+(r.shift||"")+"|"+r.quality;
      var u=g[key]||(g[key]={day:r.shift_date,shift:r.shift,quality:r.quality,out:0,workers:0,hours:0,kwh:0,batches:{}});
      u.workers+=num(r.workers)||0; u.hours+=runHours(r)||0; u.kwh+=runKwh(r)||0;
      if(r.batch_no) u.batches[r.batch_no]=1;
      if(r.machine_id==="R4"){ var w=num(r.weight_kg); if(w!=null) u.out+=w; }
    });
    return Object.keys(g).map(function(k){ var u=g[k];
      u.batchList=Object.keys(u.batches);
      u.pmh=(u.out>0&&u.workers>0&&u.hours>0)? u.out/(u.workers*u.hours):null;
      u.kwhkg=(u.out>0&&u.kwh>0)? u.kwh/u.out:null; return u; });
  }
  function grinderUnits(runs){                  // per machine + shift_date + shift
    var g={};
    runs.forEach(function(r){
      if(r.line!=="grind" || GRINDERS.indexOf(r.machine_id)<0) return;
      var w=num(r.weight_kg); if(w==null||w<=0) return;   // cracker has no output → skip
      var key=r.machine_id+"|"+r.shift_date+"|"+(r.shift||"");
      var u=g[key]||(g[key]={machine_id:r.machine_id,day:r.shift_date,shift:r.shift,out:0,workers:0,hours:0,kwh:0});
      u.out+=w; u.workers+=num(r.workers)||0; u.hours+=runHours(r)||0; u.kwh+=runKwh(r)||0;
    });
    return Object.keys(g).map(function(k){ var u=g[k];
      u.pmh=(u.out>0&&u.workers>0&&u.hours>0)? u.out/(u.workers*u.hours):null;
      u.kwhkg=(u.out>0&&u.kwh>0)? u.kwh/u.out:null;
      u.util=(u.hours>0)? Math.min(1.5,u.hours/12):null; return u; });
  }
  function batchYields(runs){                    // per batch (yield spans shifts) → attributed to R4-output shift
    var g={};
    runs.forEach(function(r){
      if(r.line!=="special") return;
      var u=g[r.batch_no]||(g[r.batch_no]={batch:r.batch_no,charge:null,out:0,outDay:null,outShift:null});
      if(r.kind==="autoclave"){ var c=num(r.capacity); if(c!=null) u.charge=c; }
      if(r.machine_id==="R4"){ var w=num(r.weight_kg); if(w!=null){ u.out+=w; if(r.shift_date){ u.outDay=r.shift_date; u.outShift=r.shift; } } }
    });
    return Object.keys(g).map(function(k){ var u=g[k]; u.pct=(u.charge&&u.out>0)? u.out/u.charge*100 : null; return u; })
      .filter(function(u){ return u.pct!=null; });
  }
  function baselineByKey(units, keyFn, valFn){
    var by={}; units.forEach(function(u){ var v=valFn(u); if(v==null) return; var k=keyFn(u); (by[k]=by[k]||[]).push(v); });
    var out={}; Object.keys(by).forEach(function(k){ out[k]=median(by[k]); }); return out;
  }

  function effView(){
    CALC_SEQ=0; CALCS={};
    var dates={}; S.runs.forEach(function(r){ if(r.shift_date) dates[r.shift_date]=1; });
    var dlist=Object.keys(dates).sort().reverse();
    if(S.effDate && dlist.indexOf(S.effDate)<0) S.effDate=dlist[0]||"";
    if(!S.effDate) S.effDate=dlist[0]||"";
    var dOpts=dlist.map(function(d){ return '<option value="'+esc(d)+'"'+(S.effDate===d?" selected":"")+'>'+esc(fmtDay(d))+'</option>'; }).join("");
    var present={}; S.runs.forEach(function(r){ if(r.shift_date===S.effDate && r.shift) present[r.shift]=1; });
    if(!present[S.effShift]){ S.effShift = present["Day"]?"Day":(present["Night"]?"Night":"Day"); }
    var chips=["Day","Night"].map(function(s){ return '<div class="chip'+(S.effShift===s?" on":"")+'" data-effshift="'+s+'">'+s+' shift'+(present[s]?'':' <span class="muted" style="font-weight:400">·no data</span>')+'</div>'; }).join("");
    var rs=S.runs.filter(function(r){ return r.shift_date===S.effDate && (r.shift||"")===S.effShift; });
    var kW=0,out=0; rs.forEach(function(r){ var k=runKwh(r); if(k!=null)kW+=k; var w=num(r.weight_kg); if(w!=null)out+=w; });
    var html='<div class="panel"><label>Shift day</label><select id="eff-date">'+(dOpts||'<option>No data</option>')+'</select>'+
      '<div class="chips" style="margin-top:10px">'+chips+'</div>'+
      '<div class="kpis"><div class="kpi"><b>'+rs.length+'</b><span>runs</span></div><div class="kpi"><b>'+Math.round(out)+'</b><span>kg out</span></div><div class="kpi"><b>'+Math.round(kW)+'</b><span>kWh</span></div></div>'+
      '<div class="sub" style="margin-top:8px">Each parameter is compared with the plant\'s usual value (median of every shift so far). Below-usual values are flagged — tap to record the reason.</div></div>';
    html+='<div class="grouphead">Refiner line · '+esc(fmtDay(S.effDate))+' · '+esc(S.effShift)+' shift</div>'+effRefiner(S.effDate,S.effShift);
    html+='<div class="grouphead">Grinding line · '+esc(fmtDay(S.effDate))+' · '+esc(S.effShift)+' shift</div>'+effGrind(S.effDate,S.effShift);
    return html;
  }
  /* ===================== Rates (open to everyone) ===================== */
  function rInput(id,label,unit,hint){
    var v=(S.rates&&S.rates[id]!=null)?S.rates[id]:"";
    return '<div class="field"><label>'+esc(label)+(unit?' <span class="muted" style="font-weight:400">('+esc(unit)+')</span>':'')+'</label>'+
      '<input id="rt-'+id+'" type="number" inputmode="decimal" value="'+esc(v)+'" placeholder="0">'+
      (hint?'<div class="sub" style="margin-top:3px">'+esc(hint)+'</div>':'')+'</div>';
  }
  function ratesView(){
    return '<div class="view-head" style="padding:0 2px"><h1 style="font-size:18px;margin:0">Rates</h1>'+
      '<div class="sub">Used by the Costing view. Anyone can update these.</div></div>'+
      '<div class="panel"><div class="grouphead" style="margin-top:0">Raw materials</div>'+
        rInput("crumbTruckPerKg","Rubber crumb — Truck","\u20b9/kg")+
        rInput("crumbBikePerKg","Rubber crumb — Bike","\u20b9/kg")+
        rInput("crumbDrcPerKg","Rubber crumb — DRC","\u20b9/kg")+
        rInput("raPerKg","Reclaiming agent (RA)","\u20b9/kg")+
        rInput("rpoPerKg","Rubber processing oil (RPO)","\u20b9/kg")+
        rInput("pineTarPerKg","Pine tar","\u20b9/kg")+
        rInput("waterPerL","Water","\u20b9/L")+
      '</div>'+
      '<div class="panel"><div class="grouphead" style="margin-top:0">Packing &amp; loading</div>'+
        rInput("packLabourPerSack","Packing labour","\u20b9/sack","Costed per kg at 50 kg/sack")+
        rInput("packMaterialPerSack","Packing raw material","\u20b9/sack","Costed per kg at 50 kg/sack")+
        rInput("loadingPerKg","Loading labour","\u20b9/kg")+
      '</div>'+
      '<div class="panel"><div class="grouphead" style="margin-top:0">Transport <span class="muted" style="font-weight:400">(only when provided)</span></div>'+
        rInput("transDriverPerKg","Driver cost","\u20b9/kg")+
        rInput("transVehiclePerKm","Vehicle cost","\u20b9/km","\u00d7 distance entered at dispatch")+
        rInput("transFuelPerKm","Fuel cost","\u20b9/km","\u00d7 distance entered at dispatch")+
      '</div>'+
      '<div class="panel"><div class="grouphead" style="margin-top:0">Energy &amp; fuel</div>'+
        rInput("firewoodPerKg","Firewood","\u20b9/kg","\u00d7 firewood kg per autoclave load")+
        rInput("refinerKwhRate","Refiner electricity","\u20b9/kWh","Refiner processing energy \u2014 confirm if you want it costed this way")+
      '</div>'+
      '<div class="panel"><div class="grouphead" style="margin-top:0">Overheads &amp; interest</div>'+
        rInput("ohFinancialPerMonth","Financial overhead","\u20b9/month")+
        rInput("ohManufacturingPerMonth","Manufacturing overhead","\u20b9/month")+
        rInput("ohDepreciationPerMonth","Depreciation","\u20b9/month","Annual \u00f7 12")+
        rInput("interestPctPerAnnum","Interest","% per annum","On value held in plant, production \u2192 dispatch")+
      '</div>'+
      '<button class="btn primary block" id="rt-save" style="margin-top:4px">Save rates</button>'+
      '<div class="sub" style="text-align:center;margin-top:8px">Saved figures load automatically for everyone.</div>';
  }
  var RATE_IDS=["crumbTruckPerKg","crumbBikePerKg","crumbDrcPerKg","raPerKg","rpoPerKg","pineTarPerKg","waterPerL",
    "packLabourPerSack","packMaterialPerSack","loadingPerKg","transDriverPerKg","transVehiclePerKm","transFuelPerKm",
    "firewoodPerKg","refinerKwhRate","ohFinancialPerMonth","ohManufacturingPerMonth","ohDepreciationPerMonth","interestPctPerAnnum"];

  /* ===================== Costing (password 2525) ===================== */
  function costView(){
    if(!S.costPwOk){
      return '<div class="panel" style="max-width:340px;margin:30px auto"><div class="grouphead" style="margin-top:0">\ud83d\udd12 Costing is locked</div>'+
        '<div class="field"><label>Enter password</label><input id="cost-pw" type="password" inputmode="numeric" placeholder="\u2022\u2022\u2022\u2022"></div>'+
        '<button class="btn primary block" id="cost-unlock">Unlock</button></div>';
    }
    return '<div class="view-head" style="padding:0 2px"><h1 style="font-size:18px;margin:0">Costing</h1>'+
      '<div class="sub">Per-kg reclaim cost by batch &amp; grade.</div></div>'+
      '<div class="panel"><div class="sub">This view is being built next. It is fed by the Rates above and by the new capture fields (autoclave raw materials and dispatch transport). '+
      'Before computing money figures you\u2019ll rely on, a few method points need confirming \u2014 see the chat.</div></div>';
  }

  var CALC_SEQ=0, CALCS={};
  function metricRow(label, valTxt, baseTxt, warn, calcHtml){
    var attr="", hint="";
    if(calcHtml){ var id="c"+(++CALC_SEQ); CALCS[id]=calcHtml; attr=' data-calc="'+id+'" style="cursor:pointer"'; hint=' <span class="muted" style="font-size:10px">ⓘ how?</span>'; }
    return '<div class="metric"'+attr+'><span>'+esc(label)+hint+(warn?'<span class="warnpill">below usual</span>':'')+'</span>'+
      '<span style="text-align:right"><span class="mv'+(warn?'" style="color:var(--err)':'')+'">'+valTxt+'</span><div class="mb">'+baseTxt+'</div></span></div>';
  }
  function calcBlock(title, sub, lines, note){
    return '<h1 style="font-size:16px;margin:0 0 2px">'+esc(title)+'</h1>'+
      '<div class="sub">'+esc(sub)+'</div>'+
      '<div style="margin-top:12px;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.95;background:var(--panel2,#101820);border:1px solid var(--line);border-radius:10px;padding:11px 13px">'+
      lines.map(function(l){ return '<div>'+l+'</div>'; }).join("")+'</div>'+
      (note?'<div class="sub" style="margin-top:12px">'+note+'</div>':'');
  }
  function openCalcModal(html){
    var mdl=document.getElementById("modal");
    mdl.innerHTML='<div class="modal"><div class="sheet">'+html+
      '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="cm-close">Close</button></div></div></div>';
    document.getElementById("cm-close").onclick=function(){ mdl.innerHTML=""; };
  }
  function runById(id){ for(var i=0;i<S.runs.length;i++){ if(String(S.runs[i].id)===String(id)) return S.runs[i]; } return null; }
  function roRow(k,v){ return '<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line)"><span class="muted" style="font-size:13px">'+esc(k)+'</span><span style="font-size:13px;text-align:right;font-weight:500">'+v+'</span></div>'; }
  function openRunModal(r){
    if(!r) return;
    var m=M(r.machine_id), isAuto=(r.kind==="autoclave"), c=runShift(r);
    var h=runHours(r), k=runKwh(r), w=num(r.weight_kg);
    var rows='';
    rows+=roRow("Machine", esc(m.name)+' <span class="muted">('+esc(m.short)+')</span>');
    rows+=roRow("Type", esc(r.kind||m.kind)+(r.line?' · '+esc(r.line)+' line':''));
    if(r.batch_no) rows+=roRow("Batch", '<span class="batchref">'+esc(r.batch_no)+'</span>');
    if(r.quality) rows+=roRow("Grade", '<span class="qchip">'+esc(r.quality)+'</span>');
    if(r.formulation) rows+=roRow("Formulation", esc(r.formulation));
    if(r.capacity!=null&&r.capacity!=="") rows+=roRow("Charge", esc(r.capacity)+' kg');
    rows+=roRow("Shift", esc(c.shift||r.shift||'—')+' shift · '+esc(fmtDay(c.date||r.shift_date)));
    if(r.supervisor) rows+=roRow("Supervisor", esc(r.supervisor));
    if(isAuto){
      rows+=roRow("Loaded", istClock(r.loaded_at)+' · '+esc(fmtDay(istDay(r.loaded_at))));
      rows+=roRow("Unloaded", istClock(r.unloaded_at)+' · '+esc(fmtDay(istDay(r.unloaded_at))));
      if(r.paired!=null&&r.paired!=="") rows+=roRow("Crew basis", r.paired?'shared with another autoclave':'this autoclave alone');
    }
    rows+=roRow("Run time", fmtH(h)+(r.runtime_min!=null&&r.runtime_min!==""?' <span class="muted">· '+r.runtime_min+' min</span>':''));
    if(!isAuto){
      var es=num(r.elec_start), ee=num(r.elec_end);
      if(es!=null||ee!=null) rows+=roRow("Electricity meter", (es!=null?es:'—')+' → '+(ee!=null?ee:'—')+(r.machine_id==="GRD_O"?' <span class="muted">(TOD ×3)</span>':''));
      else if(num(r.kwh)!=null) rows+=roRow("Electricity", '<span class="muted">difference entered directly</span>');
      var hs=num(r.hour_start), he=num(r.hour_end);
      if(hs!=null||he!=null) rows+=roRow("Hour meter", (hs!=null?hs:'—')+' → '+(he!=null?he:'—'));
    }
    if(k!=null) rows+=roRow("Energy", rnd(k,1)+' kWh'+(h&&h>0?' <span class="muted">· '+rnd(k/h,1)+' kWh/h</span>':''));
    if(num(r.firewood_kg)!=null) rows+=roRow("Firewood", num(r.firewood_kg)+' kg');
    if(num(r.workers)!=null) rows+=roRow("Crew", num(r.workers));
    if(w!=null) rows+=roRow("Output", w+' kg'+(k!=null&&w>0?' <span class="muted">· '+rnd(k/w,3)+' kWh/kg</span>':''));
    var srcs=[r.src1,r.src2,r.src3,r.src4].filter(function(x){ return x!=null&&x!==""; });
    if(srcs.length>1) rows+=roRow("Mixed from", esc(srcs.join(" + ")));
    if(r.passes!=null && r.passes>1) rows+=roRow("Passes merged", r.passes);
    var head='<h1 style="font-size:17px;margin:0 0 2px">'+esc(m.name)+(r.batch_no?' · Batch '+esc(r.batch_no):'')+'</h1>'+
      '<div class="sub">'+esc(c.shift||r.shift||'')+' shift · '+esc(fmtDay(c.date||r.shift_date))+(r.quality?' · '+esc(r.quality):'')+'</div>';
    openCalcModal(head+'<div style="margin-top:12px">'+rows+'</div>');
  }
  function noteFor(line,day,shift,metric){
    return S.notes.filter(function(n){ return n.line===line && n.shift_date===day && (n.shift||"")===(shift||"") && (!metric || n.metric===metric); })
      .sort(function(a,b){ return (a.created_at<b.created_at)?1:-1; });
  }
  function reasonsBlock(line,day,shift,metric){
    var ns=noteFor(line,day,shift,metric);
    return ns.map(function(n){ return '<div style="font-size:12px;margin-top:6px"><span class="muted">'+esc(fmtDay(isoDay(n.created_at)))+(n.entered_by?' · '+esc(n.entered_by):'')+':</span> '+esc(n.reason)+'</div>'; }).join("");
  }
  function effRefiner(day,shift){
    var all=refinerUnits(S.runs);
    var baseP=baselineByKey(all,function(u){return u.quality;},function(u){return u.pmh;});
    var baseE=baselineByKey(all,function(u){return u.quality;},function(u){return u.kwhkg;});
    var yAll=batchYields(S.runs), baseY=median(yAll.map(function(u){return u.pct;}));
    var units=all.filter(function(u){ return u.day===day && (u.shift||"")===shift; })
      .sort(function(a,b){ return a.quality<b.quality?-1:1; });
    var out='';
    if(!units.length){ out+='<div class="empty">No refiner activity in this shift.</div>'; }
    units.forEach(function(u){
      var bp=baseP[u.quality], be=baseE[u.quality];
      var warnL=(u.pmh!=null && bp!=null && u.pmh < bp*TH_LABOUR);
      var warnE=(u.kwhkg!=null && be!=null && u.kwhkg > be*TH_ENERGY);
      var flag=warnL||warnE;
      var metric="Refiner "+u.quality;
      var pmhCalc = (u.pmh!=null) ? calcBlock("Production / man-hour", u.quality+" · "+fmtDay(day)+" · "+shift+" shift",
        ["<b>Formula:</b> output ÷ (total crew × total hours)",
         "output = <b>"+rnd(u.out,0)+"</b> kg &nbsp;<span style='opacity:.6'>(R4 weighed)</span>",
         "crew = <b>"+u.workers+"</b> &nbsp;<span style='opacity:.6'>(summed over the refiner passes)</span>",
         "hours = <b>"+rnd(u.hours,2)+"</b> h &nbsp;<span style='opacity:.6'>(summed over the refiner passes)</span>",
         "= "+rnd(u.out,0)+" ÷ ("+u.workers+" × "+rnd(u.hours,2)+")",
         "= "+rnd(u.out,0)+" ÷ "+rnd(u.workers*u.hours,2),
         "= <b style='color:var(--elec)'>"+rnd(u.pmh,2)+"</b>"],
        "Usual = median of this value across every "+esc(u.quality)+" shift so far = <b>"+(bp!=null?rnd(bp,2):"—")+"</b>. Flagged if below "+Math.round(TH_LABOUR*100)+"% of usual ("+(bp!=null?rnd(bp*TH_LABOUR,2):"—")+").") : null;
      var eCalc = (u.kwhkg!=null) ? calcBlock("Electricity (kWh / kg)", u.quality+" · "+fmtDay(day)+" · "+shift+" shift",
        ["<b>Formula:</b> total energy ÷ output",
         "energy = <b>"+rnd(u.kwh,1)+"</b> kWh &nbsp;<span style='opacity:.6'>(all refiner passes)</span>",
         "output = <b>"+rnd(u.out,0)+"</b> kg",
         "= "+rnd(u.kwh,1)+" ÷ "+rnd(u.out,0),
         "= <b style='color:var(--elec)'>"+rnd(u.kwhkg,3)+"</b> kWh/kg"],
        "Usual = median across every "+esc(u.quality)+" shift = <b>"+(be!=null?rnd(be,3):"—")+"</b>. Flagged if above "+Math.round(TH_ENERGY*100)+"% of usual ("+(be!=null?rnd(be*TH_ENERGY,3):"—")+").") : null;
      var oCalc = calcBlock("Output", u.quality+" · "+fmtDay(day)+" · "+shift+" shift",
        ["<b>What it is:</b> total weighed output of this grade in this shift.",
         "= sum of R4 weights = <b style='color:var(--elec)'>"+rnd(u.out,0)+"</b> kg",
         "produced with "+u.workers+" crew over "+rnd(u.hours,2)+" h"], "");
      out+='<div class="effcard'+(flag?' flag':'')+'">'+
        '<div class="row"><div><span class="qchip">'+esc(u.quality)+'</span></div>'+
          '<div class="muted" style="font-size:11px">'+(u.batchList.length?'Batch '+esc(u.batchList.join(", ")):'')+'</div></div>'+
        metricRow("Production / man-hour", (u.pmh!=null?rnd(u.pmh,2):'— (no output)'), "usual "+(bp!=null?rnd(bp,2):'—'), warnL, pmhCalc)+
        metricRow("Electricity (kWh/kg)", (u.kwhkg!=null?rnd(u.kwhkg,3):'—'), "usual "+(be!=null?rnd(be,3):'—'), warnE, eCalc)+
        metricRow("Output (maximise)", rnd(u.out,0)+' kg', "labour: "+u.workers+' crew · '+rnd(u.hours,1)+' h', false, oCalc)+
        reasonsBlock("refiner",day,shift,metric)+
        '<button class="btn ghost block" style="margin-top:10px" data-effnote="refiner|'+esc(day)+'|'+esc(shift)+'|'+esc(metric)+'">'+(flag?'⚠ Record reason for the dip':'+ Add a note')+'</button>'+
      '</div>';
    });
    // Yield — batches that finished output this shift
    var yShift=yAll.filter(function(u){ return u.outDay===day && (u.outShift||"")===shift; })
      .sort(function(a,b){ return a.batch<b.batch?-1:1; });
    if(yShift.length){
      out+='<div class="sub" style="margin:12px 2px 6px;text-transform:uppercase;letter-spacing:.5px;font-size:11px;color:var(--muted)">Yield · batches completed this shift</div>';
      yShift.forEach(function(y){
        var warnY=(y.pct!=null && baseY!=null && y.pct < baseY*TH_YIELD);
        var metric="Yield Batch "+y.batch;
        var yCalc=(y.pct!=null)?calcBlock("Yield", "Batch "+y.batch,
          ["<b>Formula:</b> output ÷ autoclave charge × 100",
           "output = <b>"+rnd(y.out,0)+"</b> kg &nbsp;<span style='opacity:.6'>(all grades weighed)</span>",
           "charge = <b>"+y.charge+"</b> kg",
           "= "+rnd(y.out,0)+" ÷ "+y.charge+" × 100",
           "= <b style='color:var(--elec)'>"+rnd(y.pct,1)+"</b> %"],
          "Usual = median yield across all batches = <b>"+(baseY!=null?rnd(baseY,1):"—")+"%</b>. Flagged if below "+Math.round(TH_YIELD*100)+"% of usual."):null;
        out+='<div class="effcard'+(warnY?' flag':'')+'">'+
          '<div class="row"><div><b>Batch '+esc(y.batch)+'</b></div><div class="muted" style="font-size:11px">charge '+(y.charge||'—')+' kg</div></div>'+
          metricRow("Yield", (y.pct!=null?rnd(y.pct,1)+'%':'—'), "usual "+(baseY!=null?rnd(baseY,1)+'%':'—')+' · out '+rnd(y.out,0)+' kg', warnY, yCalc)+
          reasonsBlock("refiner",day,shift,metric)+
          '<button class="btn ghost block" style="margin-top:10px" data-effnote="refiner|'+esc(day)+'|'+esc(shift)+'|'+esc(metric)+'">'+(warnY?'⚠ Record reason for the dip':'+ Add a note')+'</button>'+
        '</div>';
      });
    }
    return out;
  }
  function effGrind(day,shift){
    var all=grinderUnits(S.runs);
    var baseP=baselineByKey(all,function(u){return u.machine_id;},function(u){return u.pmh;});
    var baseE=baselineByKey(all,function(u){return u.machine_id;},function(u){return u.kwhkg;});
    var units=all.filter(function(u){ return u.day===day && (u.shift||"")===shift; })
      .sort(function(a,b){ return a.machine_id<b.machine_id?-1:1; });
    var out='';
    if(!units.length){ out+='<div class="empty">No grinder output in this shift.</div>'; return out; }
    units.forEach(function(u){
      var bp=baseP[u.machine_id], be=baseE[u.machine_id];
      var warnL=(u.pmh!=null&&bp!=null&&u.pmh<bp*TH_LABOUR);
      var warnE=(u.kwhkg!=null&&be!=null&&u.kwhkg>be*TH_ENERGY);
      var warnU=(u.util!=null&&u.util<TH_UTIL);
      var flag=warnL||warnE||warnU;
      var metric=M(u.machine_id).name, nm=M(u.machine_id).name;
      var pmhCalc=(u.pmh!=null)?calcBlock("Production / man-hour", nm+" · "+fmtDay(day)+" · "+shift+" shift",
        ["<b>Formula:</b> output ÷ (crew × hours)",
         "output = <b>"+rnd(u.out,0)+"</b> kg","crew = <b>"+u.workers+"</b>","hours = <b>"+rnd(u.hours,2)+"</b> h",
         "= "+rnd(u.out,0)+" ÷ ("+u.workers+" × "+rnd(u.hours,2)+")",
         "= <b style='color:var(--elec)'>"+rnd(u.pmh,1)+"</b>"],
        "Usual for "+esc(nm)+" = <b>"+(bp!=null?rnd(bp,1):"—")+"</b> (median). Flagged below "+Math.round(TH_LABOUR*100)+"% of usual."):null;
      var eCalc=(u.kwhkg!=null)?calcBlock("Electricity (kWh / kg)", nm+" · "+fmtDay(day)+" · "+shift+" shift",
        ["<b>Formula:</b> energy ÷ output","energy = <b>"+rnd(u.kwh,1)+"</b> kWh"+(u.machine_id==="GRD_O"?" &nbsp;<span style='opacity:.6'>(TOD meter × 3)</span>":""),"output = <b>"+rnd(u.out,0)+"</b> kg",
         "= "+rnd(u.kwh,1)+" ÷ "+rnd(u.out,0)+" = <b style='color:var(--elec)'>"+rnd(u.kwhkg,3)+"</b> kWh/kg"],
        "Usual for "+esc(nm)+" = <b>"+(be!=null?rnd(be,3):"—")+"</b>. Flagged above "+Math.round(TH_ENERGY*100)+"% of usual."):null;
      var uCalc=(u.util!=null)?calcBlock("Time · utilisation", nm+" · "+fmtDay(day)+" · "+shift+" shift",
        ["<b>Formula:</b> run hours ÷ 12 h shift","ran = <b>"+rnd(u.hours,2)+"</b> h",
         "= "+rnd(u.hours,2)+" ÷ 12 = <b style='color:var(--elec)'>"+rnd(u.util*100,0)+"</b>%",
         "downtime = 12 − "+rnd(u.hours,2)+" = <b>"+fmtMinAsH(Math.max(0,720-u.hours*60))+"</b>"],
        "Flagged below "+Math.round(TH_UTIL*100)+"% utilisation (more than "+Math.round((1-TH_UTIL)*100)+"% downtime)."):null;
      var oCalc=calcBlock("Output", nm+" · "+fmtDay(day)+" · "+shift+" shift",
        ["<b>What it is:</b> total crumb weighed from this grinder this shift.",
         "= <b style='color:var(--elec)'>"+Math.round(u.out)+"</b> kg over "+rnd(u.hours,2)+" h with "+u.workers+" crew"],"");
      out+='<div class="effcard'+(flag?' flag':'')+'">'+
        '<div class="row"><div><b>'+esc(nm)+'</b></div></div>'+
        metricRow("Production / man-hour", (u.pmh!=null?rnd(u.pmh,1):'—'), "usual "+(bp!=null?rnd(bp,1):'—'), warnL, pmhCalc)+
        metricRow("Electricity (kWh/kg)", (u.kwhkg!=null?rnd(u.kwhkg,3):'—'), "usual "+(be!=null?rnd(be,3):'—'), warnE, eCalc)+
        metricRow("Time · utilisation", (u.util!=null?rnd(u.util*100,0)+'%':'—'), "of 12 h · downtime "+(u.util!=null?fmtMinAsH(Math.max(0,720-u.hours*60)):'—'), warnU, uCalc)+
        metricRow("Output (maximise)", Math.round(u.out)+' kg', "labour: "+u.workers+' crew · '+rnd(u.hours,1)+' h', false, oCalc)+
        reasonsBlock("grind",day,shift,metric)+
        '<button class="btn ghost block" style="margin-top:10px" data-effnote="grind|'+esc(day)+'|'+esc(shift)+'|'+esc(metric)+'">'+(flag?'⚠ Record reason for the dip':'+ Add a note')+'</button>'+
      '</div>';
    });
    return out;
  }

  function openReasonModal(line,day,shift,ctx){
    var mdl=document.getElementById("modal");
    mdl.innerHTML='<div class="modal"><div class="sheet">'+
      '<h1 style="font-size:17px;margin:0 0 2px">Reason for the dip</h1>'+
      '<div class="sub">'+esc(ctx)+' · '+esc(fmtDay(day))+(shift?' · '+esc(shift):'')+'</div>'+
      '<div style="margin-top:12px"><label>What caused the efficiency to drop?</label><textarea id="rm-reason" rows="3" placeholder="e.g. raw material moisture high, power cut, belt slipping, crew short…"></textarea></div>'+
      '<div style="margin-top:10px"><label>Entered by</label><input id="rm-by" type="text" placeholder="manager name"></div>'+
      '<div class="row" style="margin-top:14px;justify-content:flex-end;gap:8px"><button class="btn ghost" id="rm-cancel">Cancel</button><button class="btn" id="rm-save">Save reason</button></div>'+
    '</div></div>';
    document.getElementById("rm-cancel").onclick=function(){ mdl.innerHTML=""; };
    document.getElementById("rm-save").onclick=function(){
      var reason=(document.getElementById("rm-reason").value||"").trim();
      var by=(document.getElementById("rm-by").value||"").trim();
      if(!reason){ document.getElementById("rm-reason").focus(); return; }
      var btn=document.getElementById("rm-save"); btn.textContent="Saving…"; btn.disabled=true;
      postNote({ shift_date:day, shift:shift||null, line:line, metric:ctx, reason:reason, entered_by:by||null })
        .then(function(rows){ if(rows&&rows.length) S.notes.push(rows[0]); mdl.innerHTML=""; render(); })
        .catch(function(e){ btn.textContent="Save reason"; btn.disabled=false; alert("Couldn't save: "+e.message); });
    };
  }

  /* ===================== Maintenance ===================== */
  function maintList(){
    var months={}; S.maint.forEach(function(m){ var mo=monthOf(isoDay(m.down_start)); if(mo) months[mo]=1; });
    var mk=Object.keys(months).sort().reverse();
    var mOpts=mk.map(function(mo){ return '<option value="'+esc(mo)+'"'+(S.maintMonth===mo?" selected":"")+'>'+esc(fmtMonth(mo))+'</option>'; }).join("");
    var evs=S.maint.filter(function(m){ return monthOf(isoDay(m.down_start))===S.maintMonth; });
    var totMin=0; evs.forEach(function(m){ var d=num(m.downtime_min); if(d!=null) totMin+=d; });
    var html='<div class="panel"><label>Month</label><select id="maint-month">'+(mOpts||'<option>No data</option>')+'</select>'+
      '<div class="kpis"><div class="kpi"><b>'+fmtMinAsH(totMin)+'</b><span>total downtime</span></div>'+
      '<div class="kpi"><b>'+evs.length+'</b><span>breakdowns</span></div></div></div>';
    var per={}; evs.forEach(function(m){ var id=m.machine_id||"?"; per[id]=per[id]||{min:0,n:0}; per[id].min+=(num(m.downtime_min)||0); per[id].n++; });
    var ids=Object.keys(per).sort(function(a,b){ return per[b].min-per[a].min; });
    html+='<div class="grouphead">Downtime by machine</div>';
    if(!ids.length){ html+='<div class="empty">No breakdowns logged in '+esc(fmtMonth(S.maintMonth))+'.</div>'; return html; }
    ids.forEach(function(id){ var m=M(id);
      html+='<div class="mrow" data-maint-machine="'+esc(id)+'"><div><div class="mn">'+esc(m.name)+'</div>'+
        '<div class="mk">'+per[id].n+' breakdown'+(per[id].n>1?'s':'')+'</div></div>'+
        '<div class="row" style="gap:8px"><span class="badge hot">'+fmtMinAsH(per[id].min)+'</span><span class="chev">›</span></div></div>';
    });
    return html;
  }
  function maintDetail(){
    var m=M(S.maintMachine);
    var evs=S.maint.filter(function(x){ return x.machine_id===S.maintMachine && monthOf(isoDay(x.down_start))===S.maintMonth; });
    evs.sort(function(a,b){ return (a.down_start||"")<(b.down_start||"")?1:-1; });
    var tot=0; evs.forEach(function(e){ tot+=(num(e.downtime_min)||0); });
    var html='<div class="back" data-back="maint">‹ Back to '+esc(fmtMonth(S.maintMonth))+'</div>'+
      '<div class="panel"><div class="row"><div><h1 style="font-size:18px">'+esc(m.name)+'</h1>'+
      '<div class="sub">'+esc(fmtMonth(S.maintMonth))+' · '+fmtMinAsH(tot)+' down · '+evs.length+' event'+(evs.length===1?'':'s')+'</div></div></div></div>';
    evs.forEach(function(e){
      html+='<div class="runcard"><div class="top"><div class="ttl">'+fmtMinAsH(num(e.downtime_min))+' down</div>'+
        '<div class="when">'+esc(fmtDay(isoDay(e.down_start)))+' · '+fmtClockISO(e.down_start)+' → '+fmtClockISO(e.repaired_at)+'</div></div>'+
        '<div class="reasons">'+
          (e.root_cause?'<div><span class="lab">Root cause</span><br>'+esc(e.root_cause)+'</div>':'')+
          (e.resolution?'<div><span class="lab">How it was resolved</span><br>'+esc(e.resolution)+'</div>':'')+
          (e.prevention?'<div><span class="lab">Prevention</span><br>'+esc(e.prevention)+'</div>':'')+
          ((!e.root_cause&&!e.resolution&&!e.prevention)?'<div class="muted">No reason recorded.</div>':'')+
        '</div></div>';
    });
    return html;
  }

  /* ===================== Bearings ===================== */
  function bearList(){
    var ids={}; S.bears.forEach(function(b){ if(b.machine_id) ids[b.machine_id]=1; });
    var html='<div class="panel"><div class="sub">Tap a machine to see each bearing/bush temperature trend. Threshold '+TEMP_LIMIT+' °C.</div></div>';
    GROUPS.forEach(function(g){
      var items=MACHINES.filter(function(m){ return m.group===g && m.kind!=="autoclave"; });
      if(!items.length) return;
      html+='<div class="grouphead">'+esc(g)+'</div>';
      items.forEach(function(m){
        var cnt=S.bears.filter(function(b){ return b.machine_id===m.id; }).length;
        var type=(m.id==="PR1"||m.id==="R1"||m.id==="R2"||m.id==="GRD_K")?"bush":"bearing";
        html+='<div class="mrow" data-bear-machine="'+m.id+'"><div><div class="mn">'+esc(m.name)+'</div>'+
          '<div class="mk">'+type+' · '+(cnt?cnt+' readings':'no readings')+'</div></div>'+
          '<div class="row" style="gap:8px">'+(cnt?'<span class="badge">'+cnt+'</span>':'<span class="badge none">—</span>')+'<span class="chev">›</span></div></div>';
      });
    });
    return html;
    
  }
  function bearDetail(){
    var m=M(S.bearMachine);
    var logs=S.bears.filter(function(b){ return b.machine_id===m.id; });
    var html='<div class="back" data-back="bear">‹ Back to bearings</div>'+
      '<div class="panel"><div class="row"><div><h1 style="font-size:18px">'+esc(m.name)+'</h1>'+
      '<div class="sub">'+logs.length+' readings · threshold '+TEMP_LIMIT+' °C</div></div></div></div>';
    if(!logs.length){ html+='<div class="empty">No bearing readings yet.</div>'; return html; }
    var positions={}; logs.forEach(function(b){ var p=b.position||"—"; (positions[p]=positions[p]||[]).push(b); });
    Object.keys(positions).sort().forEach(function(pos){
      var pts=positions[pos].map(function(b){ return { t:+new Date(b.recorded_at||b.ts), v:num(b.temp_c) }; })
        .filter(function(d){ return d.v!=null && !isNaN(d.t); }).sort(function(a,b){ return a.t-b.t; });
      var type=(logs[0].bearing_type)||"bearing";
      var last=pts.length?pts[pts.length-1].v:null, mx=pts.reduce(function(a,d){ return Math.max(a,d.v); },0);
      html+='<div class="panel"><div class="row"><div class="ttl" style="font-weight:600">'+esc(type)+' '+esc(pos)+'</div>'+
        '<div class="muted" style="font-size:12px">last '+(last!=null?last+'°':'—')+' · max '+(mx?mx+'°':'—')+'</div></div>'+chart(pts)+'</div>';
    });
    return html;
  }
  function chart(pts){
    if(!pts.length) return '<div class="empty">No readings.</div>';
    var W=680,H=200,padL=34,padR=12,padT=14,padB=24;
    var t0=pts[0].t, t1=pts[pts.length-1].t; if(t1===t0) t1=t0+1;
    var vmax=Math.max(TEMP_LIMIT+10, pts.reduce(function(a,d){return Math.max(a,d.v);},0)+8);
    var vmin=Math.min(20, pts.reduce(function(a,d){return Math.min(a,d.v);},9999)-5); if(vmin<0)vmin=0;
    function X(t){ return padL+(t-t0)/(t1-t0)*(W-padL-padR); }
    function Y(v){ return padT+(1-(v-vmin)/(vmax-vmin))*(H-padT-padB); }
    var gl=""; for(var gv=Math.ceil(vmin/20)*20; gv<=vmax; gv+=20){ var y=Y(gv); gl+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="#1d2731"/><text x="2" y="'+(y+3)+'" fill="#6f818f" font-size="9">'+gv+'</text>'; }
    var ty=Y(TEMP_LIMIT);
    var thr='<line x1="'+padL+'" y1="'+ty+'" x2="'+(W-padR)+'" y2="'+ty+'" stroke="#ef6b5b" stroke-width="1.2" stroke-dasharray="5 4"/><text x="'+(W-padR)+'" y="'+(ty-4)+'" fill="#ef6b5b" font-size="9" text-anchor="end">'+TEMP_LIMIT+'°</text>';
    var d=""; pts.forEach(function(pt,i){ d+=(i?" L":"M")+X(pt.t).toFixed(1)+" "+Y(pt.v).toFixed(1); });
    var line='<path d="'+d+'" fill="none" stroke="#7fb1d8" stroke-width="1.8"/>';
    var dots=pts.map(function(pt){ var hot=pt.v>=TEMP_LIMIT; return '<circle cx="'+X(pt.t).toFixed(1)+'" cy="'+Y(pt.v).toFixed(1)+'" r="'+(hot?3.2:2.2)+'" fill="'+(hot?"#ef6b5b":"#7fb1d8")+'"/>'; }).join("");
    var tlab='<text x="'+padL+'" y="'+(H-6)+'" fill="#6f818f" font-size="9">'+fmtDay(isoDay(new Date(t0).toISOString()))+'</text>'+
             '<text x="'+(W-padR)+'" y="'+(H-6)+'" fill="#6f818f" font-size="9" text-anchor="end">'+fmtDay(isoDay(new Date(t1).toISOString()))+'</text>';
    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+gl+thr+line+dots+tlab+'</svg>';
  }

  /* wiring */
  function wire(){
    var hd=document.getElementById("hist-date"); if(hd) hd.onchange=function(){ S.histDate=hd.value; render(); };
    var hm=document.getElementById("hist-machine"); if(hm) hm.onchange=function(){ S.histMachine=hm.value; render(); };
    view.querySelectorAll("[data-histshift]").forEach(function(el){ el.onclick=function(){ S.histShift=el.getAttribute("data-histshift"); render(); }; });
    var mm=document.getElementById("maint-month"); if(mm) mm.onchange=function(){ S.maintMonth=mm.value; S.maintMachine=null; render(); };
    var em=document.getElementById("eff-date"); if(em) em.onchange=function(){ S.effDate=em.value; render(); };
    view.querySelectorAll("[data-effshift]").forEach(function(el){ el.onclick=function(){ S.effShift=el.getAttribute("data-effshift"); render(); }; });
    view.querySelectorAll("[data-maint-machine]").forEach(function(el){ el.onclick=function(){ S.maintMachine=el.getAttribute("data-maint-machine"); render(); window.scrollTo(0,0); }; });
    view.querySelectorAll("[data-bear-machine]").forEach(function(el){ el.onclick=function(){ S.bearMachine=el.getAttribute("data-bear-machine"); render(); window.scrollTo(0,0); }; });
    view.querySelectorAll("[data-back]").forEach(function(el){ el.onclick=function(){ var t=el.getAttribute("data-back"); if(t==="maint")S.maintMachine=null; if(t==="bear")S.bearMachine=null; render(); }; });
    view.querySelectorAll("[data-effnote]").forEach(function(el){ el.onclick=function(){ var p=el.getAttribute("data-effnote").split("|"); openReasonModal(p[0],p[1],p[2],p[3]); }; });
    view.querySelectorAll("[data-calc]").forEach(function(el){ el.onclick=function(){ openCalcModal(CALCS[el.getAttribute("data-calc")]||""); }; });
    view.querySelectorAll("[data-run]").forEach(function(el){ el.onclick=function(){ openRunModal(runById(el.getAttribute("data-run"))); }; });
    var rs=document.getElementById("rt-save"); if(rs) rs.onclick=function(){
      var data={}; RATE_IDS.forEach(function(id){ var el=document.getElementById("rt-"+id); if(el){ var v=el.value===""?0:parseFloat(el.value); data[id]=isNaN(v)?0:v; } });
      rs.disabled=true; rs.textContent="Saving\u2026";
      saveRates(data).then(function(){ S.rates=data; rs.textContent="Saved \u2713"; setTimeout(function(){ rs.disabled=false; rs.textContent="Save rates"; },1200); })
        .catch(function(e){ rs.disabled=false; rs.textContent="Save rates"; alert("Couldn't save: "+(e&&e.message||e)); });
    };
    var cu=document.getElementById("cost-unlock"); if(cu) cu.onclick=function(){
      var pw=(document.getElementById("cost-pw")||{}).value||"";
      if(pw==="2525"){ S.costPwOk=true; render(); } else { alert("Wrong password"); }
    };
  }
  document.querySelectorAll(".tab").forEach(function(t){ t.onclick=function(){ S.tab=t.getAttribute("data-tab"); render(); window.scrollTo(0,0); }; });
  document.getElementById("refresh").onclick=loadAll;
  loadAll();
})();
</script>
</body>
</html>

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
<title>Manna Production Management</title>
<meta name="theme-color" content="#13160f">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Manna Production">
<link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Crect width='180' height='180' rx='40' fill='%232f7d1f'/%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round' transform='translate(45,45) scale(3.75)'%3E%3Cpolyline points='23 4 23 10 17 10'/%3E%3Cpolyline points='1 20 1 14 7 14'/%3E%3Cpath d='M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'/%3E%3C/g%3E%3C/svg%3E">
<link rel="manifest" href="data:application/manifest+json,%7B%22name%22%3A%22Manna%20Production%20Management%22%2C%22short_name%22%3A%22Manna%20Production%22%2C%22display%22%3A%22standalone%22%2C%22orientation%22%3A%22portrait%22%2C%22background_color%22%3A%22%2313160f%22%2C%22theme_color%22%3A%22%2313160f%22%2C%22icons%22%3A%5B%7B%22src%22%3A%22data%3Aimage%2Fsvg%2Bxml%2C%253Csvg%2520xmlns%253D%2527http%253A%252F%252Fwww.w3.org%252F2000%252Fsvg%2527%2520viewBox%253D%25270%25200%2520180%2520180%2527%253E%253Crect%2520width%253D%2527180%2527%2520height%253D%2527180%2527%2520fill%253D%2527%2523ffffff%2527%252F%253E%253Cpath%2520d%253D%2527M90%2520132c0-30%252014-50%252040-58-4%252030-18%252048-40%252058Z%2527%2520fill%253D%2527%25234e9d2d%2527%252F%253E%253C%252Fsvg%253E%22%2C%22sizes%22%3A%22192x192%22%2C%22type%22%3A%22image%2Fsvg%2Bxml%22%7D%5D%7D">
<style>
  :root{
    --bg:#13160f; --bg2:#191d13; --panel:#1d2217; --panel2:#232a1c;
    --line:#36402c; --line2:#475238;
    --ink:#e9edde; --ink-dim:#9aa386; --ink-faint:#6f7860;
    --amber:#62b23a; --amber-soft:#8fcf66; --brand-deep:#3f8a22;
    --ember:#e0762e; --elec:#46c2d6; --steel:#9bb0c4; --pause:#e9b53a;
    --ok:#7bc86c; --warn:#e9b53a; --err:#e8604c;
    --q-special:#46c2d6; --q-superfine:#86d36a; --q-fine:#e9b53a; --q-medium:#cf9a5e; --q-drc:#b58be0;
    --sans: system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --mono: ui-monospace,"SF Mono","Roboto Mono",Menlo,Consolas,monospace;
    --r:14px; --r-sm:10px;
    --safe-b: env(safe-area-inset-bottom,0px);
    --safe-t: env(safe-area-inset-top,0px);
  }
  *{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body{ margin:0; height:100%; overscroll-behavior:none; }
  body{
    background:
      radial-gradient(120% 60% at 50% -10%, #1c2415 0%, var(--bg) 55%),
      var(--bg);
    color:var(--ink); font-family:var(--sans);
    font-size:16px; line-height:1.35;
    overscroll-behavior-y:none;
    -webkit-font-smoothing:antialiased;
  }
  button{ font-family:inherit; color:inherit; cursor:pointer; }
  input,select{ font-family:inherit; }
  .tnum{ font-variant-numeric:tabular-nums; font-family:var(--mono); }

  /* ---------- shell ---------- */
  #app{ max-width:760px; margin:0 auto; min-height:100%;
    display:flex; flex-direction:column;
    padding-top:var(--safe-t);
    padding-bottom:calc(74px + var(--safe-b));
  }

  /* ---------- branded header ---------- */
  header.plate{
    position:sticky; top:0; z-index:30;
    background:linear-gradient(180deg,#202a18,#161c11);
    border-bottom:1px solid #090c06;
    box-shadow:0 1px 0 #3a4a2c inset, 0 6px 14px -8px #000;
    padding:calc(10px + var(--safe-t)) 14px 11px;
    display:flex; align-items:center; gap:11px;
  }
  .brandplate{ background:#fff; border-radius:11px; padding:7px 12px; flex:0 0 auto;
    display:flex; align-items:center; box-shadow:0 4px 12px -6px #000, 0 0 0 1px #ffffff18; }
  .brandplate img{ height:26px; display:block; }
  .plate .spacer{ flex:1 1 auto; }
  .plate .linetag{ font-size:10px; letter-spacing:.26em; text-transform:uppercase; color:var(--ink-faint); font-weight:700; white-space:nowrap; }
  .plate .runcount{
    font-family:var(--mono); font-size:11px; letter-spacing:.05em;
    color:#0e1a08; background:var(--amber); border:1px solid var(--amber);
    padding:5px 10px; border-radius:999px; white-space:nowrap; font-weight:700;
  }
  .plate .runcount.zero{ color:var(--ink-faint); border-color:var(--line); background:#1a1f12; font-weight:600; }
  .iconbtn{
    width:40px; height:40px; flex:0 0 auto; border-radius:10px;
    background:#1a1f12; border:1px solid var(--line);
    display:grid; place-items:center;
  }
  .iconbtn:active{ background:#13160f; }
  .iconbtn svg{ width:20px; height:20px; stroke:var(--ink-dim); fill:none; stroke-width:1.8; }

  /* ---------- view ---------- */
  main#view{ padding:14px 14px 8px; flex:1 1 auto; }
  .view-head{ display:flex; align-items:baseline; justify-content:space-between; margin:2px 2px 12px; }
  .view-head h1{ margin:0; font-size:13px; letter-spacing:.22em; text-transform:uppercase; color:var(--ink-dim); font-weight:700; }
  .view-head .meta{ font-size:12px; color:var(--ink-faint); font-family:var(--mono); }

  /* ---------- machine cards ---------- */
  .mlist{ display:flex; flex-direction:column; gap:11px; }
  .msec{ display:flex; align-items:center; gap:11px; margin:18px 4px 10px; }
  .msec:first-of-type{ margin-top:2px; }
  .msec b{ font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-faint); font-weight:700; white-space:nowrap; }
  .msec .ln{ flex:1; height:1px; background:var(--line); }
  .msec .ct{ font-family:var(--mono); font-size:10px; letter-spacing:.04em; color:var(--amber); white-space:nowrap; }
  /* bearing schedule tab */
  .bgrade{ display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
  .gradetag{ display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; padding:3px 8px; border-radius:6px; background:#161310; border:1px solid var(--line2); }
  .gradetag .gd{ width:8px; height:8px; border-radius:50%; background:var(--steel); }
  .gradetag.pass .gd{ background:var(--ok); } .gradetag.hold .gd{ background:var(--err); }
  .brow{ display:flex; align-items:center; justify-content:space-between; gap:10px; background:#161310;
    border:1px solid var(--line); border-radius:9px; padding:8px 11px; font-size:12.5px; margin-top:6px; }
  .brow .bt{ font-family:var(--mono); }
  .bstat{ font-size:11px; font-weight:700; letter-spacing:.04em; padding:3px 9px; border-radius:6px; }
  .bstat.ok{ background:#1f2c17; color:var(--ok); border:1px solid #2f4a26; }
  .bstat.due{ background:#2a2310; color:var(--amber); border:1px solid #7a5a1f; }
  .bstat.idle{ background:#1a1f12; color:var(--ink-faint); border:1px solid var(--line); }
  .bstat.miss{ background:#2c1816; color:var(--err); border:1px solid #5a2c1d; }
  /* per-grade QC verdict row */
  .qgrow{ display:flex; align-items:center; gap:7px; margin-bottom:8px; }
  .gbtn{ flex:1; background:#161310; border:1.5px solid var(--line2); border-radius:9px; color:var(--ink-dim);
    font-size:12.5px; font-weight:700; padding:9px 4px; cursor:pointer; text-align:center; }
  .gbtn:active{ transform:scale(.97); }
  .gbtn.sel{ color:var(--ink); }
  .gbtn.pass.sel{ border-color:var(--ok); background:#1b2a16; color:var(--ok); }
  .gbtn.hold.sel{ border-color:var(--err); background:#2c1816; color:var(--err); }
  .gbtn.none.sel{ border-color:var(--line2); background:#20281a; color:var(--ink-dim); }
  .toggle-row{ display:flex; align-items:center; justify-content:space-between; gap:14px; cursor:pointer; padding:2px 0; }
  .toggle-row small{ display:block; color:var(--ink-dim); font-size:11px; margin-top:3px; line-height:1.35; }
  .toggle{ flex:none; width:46px; height:27px; border-radius:14px; background:#2a3320; border:1px solid var(--line); position:relative; transition:background .15s; }
  .toggle i{ position:absolute; top:2px; left:2px; width:21px; height:21px; border-radius:50%; background:#8a96a0; transition:left .15s,background .15s; }
  .toggle.on{ background:var(--amber); border-color:var(--amber); }
  .toggle.on i{ left:21px; background:#0e1a08; }
  .mcard{
    position:relative; width:100%; text-align:left; cursor:pointer;
    background:linear-gradient(180deg,var(--panel2),var(--panel));
    border:1px solid var(--line); border-radius:var(--r);
    padding:14px 14px 14px 16px; overflow:hidden;
    box-shadow:0 1px 0 #36302480 inset, 0 8px 18px -14px #000;
    transition:transform .06s ease, border-color .15s ease;
  }
  .mcard:active{ transform:scale(.992); }
  .mcard.on{ border-color:#5a4a23; box-shadow:0 0 0 1px #5a4a2380 inset, 0 0 22px -10px var(--amber-glow,rgba(244,165,42,.5)); }
  .mcard::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--accent,var(--line2)); opacity:.55; }
  .mcard.on::before{ background:var(--amber); opacity:1; box-shadow:0 0 14px 1px var(--amber); }

  .mtop{ display:flex; align-items:center; gap:11px; }
  .led{ width:13px; height:13px; border-radius:50%; flex:0 0 auto;
    background:radial-gradient(circle at 35% 30%, #6d6450, #2c281f);
    box-shadow:inset 0 0 3px #000, 0 0 0 1px #00000060; }
  .mcard.on .led{
    background:radial-gradient(circle at 35% 30%, #c8f0a0, var(--amber));
    box-shadow:0 0 10px 1px var(--amber), inset 0 0 3px #1f5a00;
    animation:pulse 1.7s ease-in-out infinite;
  }
  @keyframes pulse{ 0%,100%{ opacity:1 } 50%{ opacity:.55 } }
  .mname{ flex:1 1 auto; min-width:0; }
  .mname b{ font-size:17px; font-weight:700; letter-spacing:.01em; display:block; }
  .mname small{ font-size:11.5px; color:var(--ink-faint); letter-spacing:.02em; }
  .pill{ font-size:10.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
    padding:5px 10px; border-radius:999px; white-space:nowrap; flex:0 0 auto;
    border:1px solid var(--line2); color:var(--ink-dim); background:#00000030; }
  .pill.run{ color:#0e1a08; background:var(--amber); border-color:var(--amber); }
  .pill.paused{ color:var(--pause); border-color:#5a4a1f; background:#241f10; }
  .pill.shift{ color:var(--steel); border-color:#3f4a55; background:#141a20; }
  .pill.down{ color:#fff; background:var(--err); border-color:var(--err); }
  .mcard.down{ border-color:#5a2c1d; box-shadow:0 0 0 1px #5a2c1d99 inset, 0 0 22px -12px rgba(224,96,60,.55); }
  .mcard.down::before{ background:var(--err); opacity:1; box-shadow:0 0 14px 1px var(--err); }
  .wbtn{ flex:none; width:30px; height:30px; border-radius:8px; border:1px solid var(--line); background:#1a1f12; color:var(--ink-dim); display:grid; place-items:center; margin-left:6px; cursor:pointer; padding:0; }
  .wbtn svg{ width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  .wbtn:active{ transform:scale(.94); }
  .tbtn{ flex:none; width:30px; height:30px; border-radius:8px; border:1px solid var(--line); background:#11201f; color:var(--elec); display:grid; place-items:center; margin-left:6px; cursor:pointer; padding:0; }
  .tbtn svg{ width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  .tbtn:active{ transform:scale(.94); }
  .tbtn.due{ border-color:#7a5a1f; background:#2a2310; color:var(--amber); animation:tpulse 1.6s ease-in-out infinite; }
  @keyframes tpulse{ 0%,100%{ box-shadow:0 0 0 0 rgba(244,165,42,.0);} 50%{ box-shadow:0 0 10px 1px rgba(244,165,42,.55);} }
  .duebar{ background:#2a2310; border:1px solid #7a5a1f; color:var(--amber); border-radius:11px; padding:10px 13px; margin-bottom:12px; font-size:12.5px; font-weight:600; cursor:pointer; }
  .duebar:active{ transform:scale(.995); }
  .shiftchip{ display:inline-flex; align-items:center; gap:5px; background:#141a20; border:1px solid #3f4a55; color:var(--ink-dim);
    padding:5px 11px; border-radius:999px; font-size:12px; cursor:pointer; }
  .shiftchip b{ color:var(--ink); }
  .shiftchip.pinned{ background:#241d10; border-color:#5a4420; color:var(--amber); }
  .shiftchip.pinned b{ color:var(--amber); }
  .shiftrow{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; background:#141a0e; border:1px solid var(--line);
    border-radius:10px; padding:11px 13px; margin-bottom:7px; cursor:pointer; color:var(--ink); text-align:left; }
  .shiftrow:active{ transform:scale(.995); }
  .shiftrow .sr-l{ font-size:13.5px; } .shiftrow .sr-l b{ color:var(--ink); }
  .shiftrow .sr-r{ display:flex; align-items:center; gap:10px; font-size:11px; color:var(--ink-dim); flex-wrap:wrap; justify-content:flex-end; }
  .shiftrow .sr-r .am{ color:var(--amber); font-weight:600; } .shiftrow .sr-r .el{ color:var(--elec); }
  .mlog{ border-top:1px solid var(--line); padding:8px 0; }
  .mlog:first-child{ border-top:none; }
  .mlog-h{ display:flex; justify-content:space-between; align-items:baseline; font-size:13px; }
  .mlog-b{ font-size:11.5px; color:var(--ink-dim); margin-top:4px; line-height:1.5; }
  .mlog-b b{ color:var(--ink-faint); }
  textarea{ width:100%; background:var(--field,#10140c); border:1px solid var(--line); color:var(--ink); border-radius:10px;
    padding:10px 12px; font-size:15px; font-family:inherit; resize:vertical; min-height:46px; }
  textarea:focus{ outline:none; border-color:var(--accent2,#5a6b3a); }
  .pausebtn{ width:100%; margin-top:11px; padding:11px; border-radius:var(--r-sm);
    background:#241f10; border:1px solid #5a4a1f; color:var(--pause); font-size:13px; font-weight:700; letter-spacing:.06em; }
  .pausebtn:active{ transform:scale(.98); }
  .pausebtn.paused{ background:#16210f; border-color:#2f4a28; color:var(--ok); }
  .mcard.on.paused::before{ background:var(--pause); box-shadow:none; opacity:.7; }
  .mcard.on.paused .led{ animation:none; opacity:.8; }
  .timer.paused{ color:var(--pause); }
  .weighlist{ display:flex; flex-direction:column; gap:7px; margin-bottom:14px; }
  .weighrow{ display:flex; align-items:center; justify-content:space-between; background:#161310;
    border:1px solid var(--line); border-radius:var(--r-sm); padding:10px 13px; }
  .weighrow .tnum{ font-family:var(--mono); font-size:15px; }
  .wdel{ width:26px; height:26px; border-radius:7px; background:#2a130f; border:1px solid #5a2620;
    color:var(--err); font-size:13px; display:grid; place-items:center; }

  .cllist{ display:flex; flex-direction:column; gap:9px; margin:4px 0 4px; max-height:46vh; overflow-y:auto; padding-right:2px; }
  .clrow{ background:#161310; border:1px solid var(--line); border-radius:var(--r-sm); padding:10px 12px; }
  .clrow.imp{ border-color:var(--ember); background:#1c1611; }
  .clitem b{ font-size:13.5px; font-weight:650; display:block; }
  .clitem small{ display:block; color:var(--muted); font-size:11.5px; margin-top:2px; line-height:1.35; }
  .clmark{ display:flex; gap:8px; margin-top:9px; }
  .clok,.clno{ flex:1; padding:8px 0; border-radius:8px; font-weight:650; font-size:12.5px;
    background:#100d0b; border:1.5px solid var(--line2); color:var(--muted); }
  .clok.sel{ background:rgba(108,184,63,.16); border-color:var(--ok); color:var(--ok); }
  .clno.sel{ background:rgba(220,70,60,.16); border-color:var(--err); color:var(--err); }
  .clrem{ width:100%; margin-top:8px; background:#100d0b; border:1px solid var(--line); border-radius:8px;
    padding:7px 10px; color:var(--ink); font-size:12.5px; }
  .clphoto{ display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap; }
  .clthumbwrap{ display:flex; align-items:center; gap:6px; }
  .clthumb{ height:42px; width:42px; object-fit:cover; border-radius:7px; border:1px solid var(--line2); display:block; }
  .clphoto-btn{ display:inline-flex; align-items:center; gap:5px; cursor:pointer; font-size:11.5px; font-weight:650;
    color:var(--err); background:rgba(220,70,60,.1); border:1px solid #5a2620; border-radius:8px; padding:6px 10px; }

  .mbody{ margin-top:12px; }
  .runline{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .runline .what{ display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap; }
  .timer{ font-family:var(--mono); font-size:24px; font-weight:600; letter-spacing:.02em; color:var(--amber); }
  .idleline{ display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--ink-faint); font-size:13px; }
  .cta{ font-size:12.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
    color:var(--accent,var(--amber)); display:flex; align-items:center; gap:6px; }

  /* chips */
  .batchref{ font-family:var(--mono); font-size:13px; color:var(--ink); font-weight:600; letter-spacing:.03em; }
  .qchip{ font-size:11px; font-weight:700; letter-spacing:.06em; padding:3px 9px; border-radius:6px;
    text-transform:uppercase; color:#13110b; }
  .q-Special{ background:var(--q-special); } .q-SuperFine{ background:var(--q-superfine); }
  .q-Fine{ background:var(--q-fine); } .q-Medium{ background:var(--q-medium); } .q-DRC{ background:var(--q-drc); }
  .qchip.shift{ background:var(--steel); }
  .formchip{ font-size:11px; color:var(--ink-dim); border:1px solid var(--line); padding:3px 8px; border-radius:6px; font-family:var(--mono); }

  /* ---------- generic panels ---------- */
  .panel{ background:linear-gradient(180deg,var(--panel2),var(--panel)); border:1px solid var(--line);
    border-radius:var(--r); padding:14px; box-shadow:0 1px 0 #36302480 inset; }
  .stack{ display:flex; flex-direction:column; gap:11px; }
  .empty{ text-align:center; color:var(--ink-faint); padding:40px 18px; }
  .empty .big{ font-size:15px; color:var(--ink-dim); margin-bottom:6px; }
  .empty svg{ width:34px; height:34px; stroke:var(--line2); fill:none; stroke-width:1.6; margin-bottom:10px; }

  /* batches */
  .bcard{ background:linear-gradient(180deg,var(--panel2),var(--panel)); border:1px solid var(--line);
    border-radius:var(--r); padding:13px 14px; }
  .bhead{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:11px; }
  .bhead .l{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .bstate{ font-size:10px; letter-spacing:.1em; text-transform:uppercase; font-weight:700; padding:4px 8px; border-radius:6px; }
  .bhint{ font-size:10.5px; color:var(--ink-faint); margin-top:9px; line-height:1.35; }
  .bclose{ width:100%; margin-top:10px; }
  .bstate.cook{ color:var(--ember); border:1px solid #5a2c1d; background:#2a160f; }
  .bstate.ready{ color:var(--ok); border:1px solid #2f4a28; background:#16210f; }
  .qgrid{ display:grid; grid-template-columns:auto repeat(3,1fr); gap:7px 6px; align-items:center; }
  .qgrid .hdr{ font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); text-align:center; padding-bottom:2px; }
  .qgrid .qlabel{ font-size:11.5px; font-weight:700; letter-spacing:.04em; }
  .qtake{ display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; padding:3px 2px; border-radius:7px; }
  .qtake .qbox{ width:18px; height:18px; border-radius:5px; border:1.5px solid var(--line); display:grid; place-items:center; font-size:11px; color:var(--ok); flex:none; }
  .qtake.on .qbox{ background:#16210f; border-color:#2f4a28; }
  .qtake.off{ opacity:.4; }
  .qtake.off .qdot{ opacity:.5; }
  .stagedot{ height:26px; border-radius:7px; display:grid; place-items:center; font-size:11px;
    background:#161310; border:1px solid var(--line); color:var(--ink-faint); font-family:var(--mono); }
  .stagedot.done{ background:#16210f; border-color:#2f4a28; color:var(--ok); }
  .stagedot.weighed{ background:#101d20; border-color:#27474d; color:var(--elec); }

  /* weigh */
  .wcard{ display:flex; align-items:center; justify-content:space-between; gap:12px;
    background:linear-gradient(180deg,var(--panel2),var(--panel)); border:1px solid #3d3a24;
    border-radius:var(--r); padding:13px 14px; }
  .wcard .info{ min-width:0; }
  .wcard .info .row1{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
  .wcard .info small{ color:var(--ink-faint); font-size:11.5px; font-family:var(--mono); }
  .dlist{ margin-top:10px; border-top:1px solid var(--line); padding-top:8px; display:flex; flex-direction:column; gap:6px; }
  .dline{ display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12.5px; color:var(--ink-dim); }
  .dline b{ color:var(--ink); font-family:var(--mono); }
  .custrow{ display:flex; align-items:center; justify-content:space-between; gap:10px; background:#161a10;
    border:1px solid var(--line); border-radius:var(--r-sm); padding:10px 13px; margin-bottom:8px; }
  .custrow .cc{ font-family:var(--mono); font-weight:700; color:var(--ink); }
  .custrow .cp{ font-family:var(--mono); color:var(--amber); font-size:13px; }
  .custrow .cn{ font-size:11.5px; color:var(--ink-faint); }
  .btn{ border:none; border-radius:var(--r-sm); padding:11px 15px; font-size:13px; font-weight:700;
    letter-spacing:.04em; background:var(--panel2); border:1px solid var(--line2); color:var(--ink); white-space:nowrap; }
  .btn:active{ transform:scale(.97); }
  .btn.primary{ background:var(--amber); color:#1a1408; border-color:var(--amber); }
  .btn.elec{ background:#123a40; color:var(--elec); border-color:#27474d; }
  .btn.ghost{ background:#1d1a13; color:var(--ink-dim); }
  .btn.danger{ background:#2a130f; color:var(--err); border-color:#5a2620; }
  .btn.block{ width:100%; padding:14px; font-size:14px; }
  .btn:disabled, .btn.is-off{ opacity:.4; pointer-events:none; cursor:not-allowed; }
  /* inline validation warning inside sheets */
  .formwarn{ display:none; margin:2px 0 4px; background:#2c1816; border:1px solid #5a2c1d; color:#f0b3ab;
    border-radius:9px; padding:9px 12px; font-size:12.5px; line-height:1.45; }
  .formwarn.show{ display:block; }
  .formwarn b{ color:var(--err); }
  .diffout{ display:none; margin:7px 0 2px; font-size:12.5px; color:var(--steel); background:#10201a; border:1px solid #244338; border-radius:9px; padding:7px 11px; }
  .diffout.show{ display:block; }
  .diffout b{ color:var(--ink); }
  .diffout.bad{ background:#2c1816; border-color:#5a2c1d; color:#f0b3ab; }
  .diffout.bad b{ color:var(--err); }
  .histbar{ display:flex; gap:8px; margin:0 2px 12px; }
  .histbar .field{ flex:1; }
  .histbar select{ width:100%; }
  .histbar select:disabled{ opacity:.45; }
  .histsum{ background:#10201a; border:1px solid #244338; border-radius:11px; padding:11px 13px; margin:0 2px 12px; font-size:13.5px; }
  .histsum b{ color:var(--ink); }

  /* history */
  table.hist{ width:100%; border-collapse:collapse; font-size:12.5px; }
  table.hist th{ text-align:left; font-size:9.5px; letter-spacing:.1em; text-transform:uppercase;
    color:var(--ink-faint); font-weight:700; padding:0 8px 8px; border-bottom:1px solid var(--line); }
  table.hist td{ padding:9px 8px; border-bottom:1px solid #2a2519; vertical-align:middle; }
  table.hist tr:last-child td{ border-bottom:none; }
  .synced{ width:8px; height:8px; border-radius:50%; background:var(--line2); display:inline-block; }
  .synced.yes{ background:var(--ok); box-shadow:0 0 6px -1px var(--ok); }
  .scroll-x{ overflow-x:auto; -webkit-overflow-scrolling:touch; }

  /* reports */
  .statgrid{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
  .stat{ background:linear-gradient(180deg,var(--panel2),var(--panel)); border:1px solid var(--line);
    border-radius:var(--r); padding:13px 14px; }
  .stat .v{ font-family:var(--mono); font-size:26px; font-weight:600; color:var(--ink); line-height:1; }
  .stat .v small{ font-size:13px; color:var(--ink-dim); font-weight:400; margin-left:3px; }
  .stat .k{ font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-faint); margin-top:7px; }
  .wq{ display:flex; align-items:center; gap:12px; padding:11px 4px; border-bottom:1px solid #2a2519; }
  .wq:last-child{ border-bottom:none; }
  .wbar{ flex:1 1 auto; height:9px; border-radius:5px; background:#161310; overflow:hidden; }
  .wbar i{ display:block; height:100%; border-radius:5px; }
  .wq .val{ font-family:var(--mono); font-size:14px; min-width:78px; text-align:right; }

  /* settings */
  .field{ margin-bottom:14px; }
  .field label{ display:block; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-dim); margin-bottom:7px; font-weight:700; }
  .field input,.field select{ width:100%; background:#161310; border:1px solid var(--line2); border-radius:var(--r-sm);
    color:var(--ink); padding:13px 13px; font-size:15px; }
  .field select{ -webkit-appearance:none; appearance:none; background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a89c8a' stroke-width='3'><path d='M6 9l6 6 6-6'/></svg>"); background-repeat:no-repeat; background-position:right 13px center; padding-right:34px; }
  .field input:focus,.field select:focus{ outline:none; border-color:var(--amber); box-shadow:0 0 0 3px #f4a52a22; }
  .field .hint{ font-size:11.5px; color:var(--ink-faint); margin-top:6px; }
  .syncrow{ display:flex; gap:9px; }
  .syncrow .btn{ flex:1 1 auto; }

  /* ---------- bottom tabs ---------- */
  nav.tabs{ position:fixed; left:0; right:0; bottom:0; z-index:40;
    background:linear-gradient(180deg,#211d15,#171410);
    border-top:1px solid #0c0a07; box-shadow:0 -1px 0 #443c2c inset;
    padding-bottom:var(--safe-b);
    display:flex; max-width:760px; margin:0 auto; }
  nav.tabs button{ flex:1 1 0; background:none; border:none; padding:9px 2px 7px;
    display:flex; flex-direction:column; align-items:center; gap:3px; color:var(--ink-faint); position:relative; }
  nav.tabs button svg{ width:23px; height:23px; stroke:currentColor; fill:none; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
  nav.tabs button span{ font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; font-weight:700; }
  nav.tabs button.active{ color:var(--amber); }
  nav.tabs button.active::after{ content:""; position:absolute; top:0; width:26px; height:2px; border-radius:2px; background:var(--amber); box-shadow:0 0 8px var(--amber); }
  .tabbadge{ position:absolute; top:4px; right:calc(50% - 22px); min-width:16px; height:16px; padding:0 4px;
    background:var(--ember); color:#fff; font-size:10px; font-weight:800; border-radius:999px;
    display:grid; place-items:center; font-family:var(--mono); }

  /* ---------- bottom sheet / modal ---------- */
  #scrim{ position:fixed; inset:0; z-index:50; background:#000a; backdrop-filter:blur(2px);
    opacity:0; pointer-events:none; transition:opacity .18s ease; }
  #scrim.show{ opacity:1; pointer-events:auto; }
  #sheet{ position:fixed; left:0; right:0; bottom:0; z-index:51;
    max-width:760px; margin:0 auto;
    background:linear-gradient(180deg,#262219,#1c1913);
    border:1px solid var(--line); border-bottom:none;
    border-radius:20px 20px 0 0; padding:8px 18px calc(20px + var(--safe-b));
    transform:translateY(100%); transition:transform .24s cubic-bezier(.2,.8,.2,1);
    max-height:88vh; overflow-y:auto; -webkit-overflow-scrolling:touch; }
  #sheet.show{ transform:translateY(0); }
  .grab{ width:38px; height:4px; border-radius:3px; background:var(--line2); margin:6px auto 14px; }
  .sheet-h{ display:flex; align-items:center; gap:11px; margin-bottom:4px; }
  .sheet-h .led{ width:12px; height:12px; }
  .sheet-h b{ font-size:19px; font-weight:800; letter-spacing:.01em; }
  .sheet-sub{ font-size:12.5px; color:var(--ink-faint); margin:0 0 16px 23px; }
  .sheet-label{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-dim); font-weight:700; margin:16px 0 9px; }
  .pickgrid{ display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .pickgrid.q4{ grid-template-columns:1fr 1fr; }
  .pick{ background:#161310; border:1.5px solid var(--line2); border-radius:var(--r-sm);
    padding:15px 12px; text-align:left; display:flex; flex-direction:column; gap:3px; }
  .pick:active{ transform:scale(.98); }
  .pick.sel{ border-color:var(--amber); background:#241d10; box-shadow:0 0 0 3px #f4a52a22; }
  .pick b{ font-size:16px; font-weight:700; }
  .pick small{ font-size:11.5px; color:var(--ink-faint); }
  .pick.q b{ font-size:14px; }
  .pick.cap b{ font-family:var(--mono); font-size:20px; }
  .qdot{ width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:7px;vertical-align:-1px; }
  .field-inline{ display:flex; gap:10px; }
  .field-inline .field{ flex:1; margin-bottom:0; }
  .ro{ background:#161310; border:1px solid var(--line); border-radius:var(--r-sm); padding:13px;
    display:flex; align-items:center; justify-content:space-between; }
  .ro .k{ font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-faint); font-weight:700; }
  .ro .v{ font-family:var(--mono); font-size:18px; color:var(--amber); }
  .sheet-actions{ display:flex; gap:10px; margin-top:20px; }
  .sheet-actions .btn{ flex:1; padding:15px; font-size:15px; }
  .num-suffix{ position:relative; }
  .num-suffix .sfx{ position:absolute; right:13px; top:50%; transform:translateY(-50%); color:var(--ink-faint); font-size:13px; font-family:var(--mono); pointer-events:none; }

  /* toast */
  #toast{ position:fixed; left:50%; bottom:calc(86px + var(--safe-b)); transform:translateX(-50%) translateY(20px);
    z-index:60; background:#2c2719; border:1px solid var(--line2); color:var(--ink);
    padding:11px 16px; border-radius:999px; font-size:13px; font-weight:600;
    box-shadow:0 10px 26px -10px #000; opacity:0; pointer-events:none; transition:all .22s ease; max-width:88%; }
  #toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
  #toast.ok{ border-color:#2f4a28; } #toast.ok::before{ content:"✓ "; color:var(--ok); }
  #toast.err{ border-color:#5a2620; } #toast.err::before{ content:"✕ "; color:var(--err); }
  #toast.warn{ border-color:#5a4a1f; } #toast.warn::before{ content:"! "; color:var(--warn); }

  .muted{ color:var(--ink-faint); }
  .hr{ height:1px; background:var(--line); margin:16px 0; border:none; }
  @media (prefers-reduced-motion: reduce){ *{ animation:none !important; transition:none !important; } }
  #login{ position:fixed; inset:0; z-index:200; background:linear-gradient(180deg,#0c1116,#0f1720); display:none; flex-direction:column; align-items:center; justify-content:flex-start; padding:36px 18px 40px; overflow:auto; }
  #login .lcard{ width:100%; max-width:420px; }
  #login h2{ font-size:19px; margin:18px 0 3px; text-align:center; }
  #login .lsub{ text-align:center; color:var(--muted); font-size:13px; margin-bottom:20px; }
  #login .agrid{ display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  #login .acct{ background:var(--panel2,#101820); border:1px solid var(--line); border-radius:12px; padding:13px 12px; text-align:left; cursor:pointer; color:var(--ink); }
  #login .acct.sel{ border-color:var(--elec); box-shadow:0 0 0 1px var(--elec) inset; }
  #login .acct b{ display:block; font-size:15px; }
  #login .acct small{ color:var(--muted); font-size:11px; }
  #login .acct .rl{ display:inline-block; margin-top:4px; font-size:10px; padding:1px 7px; border-radius:999px; border:1px solid var(--line); color:var(--ink-dim,#9fb0bf); text-transform:uppercase; letter-spacing:.4px; }
  #login .pinwrap{ margin-top:18px; }
  #login .pinwrap input{ width:100%; text-align:center; letter-spacing:8px; font-size:22px; padding:13px; background:#0e151b; border:1px solid var(--line); border-radius:11px; color:var(--ink); }
  #login .lerr{ color:var(--err); font-size:13px; text-align:center; margin-top:12px; min-height:18px; }
  #login .lbtn{ width:100%; margin-top:14px; background:var(--accent,#7fb1d8); color:#08222e; border:none; border-radius:11px; padding:14px; font-size:15px; font-weight:700; cursor:pointer; }
  #login .lbtn[disabled]{ opacity:.5; }
  #login .lnote{ text-align:center; color:var(--muted); font-size:11px; margin-top:16px; line-height:1.5; }
</style>
</head>
<body>
<div id="app">
  <header class="plate">
    <div class="brandplate"><svg viewBox="0 0 210 44" style="height:30px;width:auto;display:block" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Manna Production Management"><defs><linearGradient id="mlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6cb83f"/><stop offset="1" stop-color="#3f8a22"/></linearGradient></defs><rect x="2" y="4" width="36" height="36" rx="10" fill="url(#mlg)"/><g transform="translate(8,10)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></g><text x="50" y="26" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="20" font-weight="800" fill="#2f6b1b" letter-spacing="-0.3">Manna</text><text x="51" y="38" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.3" font-weight="700" letter-spacing="2" fill="#5f6b53">PRODUCTION MGMT</text></svg></div>
    <span class="linetag">Supervisor</span>
    <div class="spacer"></div>
    <div id="runcount" class="runcount zero">0 RUNNING</div>
    <button class="iconbtn" data-act="settings" aria-label="Settings">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 2.6h.1A1.6 1.6 0 0 0 10 1.1V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.4 1h.1a2 2 0 1 1 0 4H23a1.6 1.6 0 0 0-1.6 1z"/></svg>
    </button>
  </header>

  <main id="view"></main>
</div>

<nav class="tabs" id="tabs"></nav>

<div id="scrim"></div>
<div id="sheet" role="dialog" aria-modal="true"></div>
<div id="toast"></div>

<script>
"use strict";
(function(){
  /* ===================== storage (offline + sandbox-safe) ===================== */
  var KEY="rrp_special_v1", mem=null, lsOK=false;
  try{ localStorage.setItem("__t","1"); localStorage.removeItem("__t"); lsOK=true; }catch(e){ lsOK=false; }
  var store={
    read:function(){ try{ return lsOK?localStorage.getItem(KEY):mem; }catch(e){ return mem; } },
    write:function(v){ try{ if(lsOK) localStorage.setItem(KEY,v); else mem=v; }catch(e){ mem=v; } }
  };

  /* ===================== domain ===================== */
  var MACHINES=[
    {id:"CRK",  name:"Cracker",              short:"CRK",     kind:"grind", accent:"var(--steel)", tyre:false, outWeight:false, crumb:false, sub:"shiftwise · tyre prep (mixed)",   group:"Grinding line"},
    {id:"GRD_K",name:"Grinder 1", short:"Grind 1", kind:"grind", accent:"var(--steel)", tyre:true, outWeight:true,  crumb:false, defTyre:"truck", sub:"shiftwise · 30# default", group:"Grinding line"},
    {id:"GRD_S",name:"Grinder 2", short:"Grind 2", kind:"grind", accent:"var(--steel)", tyre:true, outWeight:true,  crumb:false, defTyre:"bike",  sub:"shiftwise · 20# default", group:"Grinding line"},
    {id:"GRD_O",name:"Soorya Grinder",       short:"Soorya",  kind:"grind", accent:"var(--steel)", tyre:true, outWeight:true,  crumb:false, defTyre:"truck", sub:"shiftwise",             group:"Grinding line"},
    {id:"AC_A",name:"Autoclave A",  short:"AC-A", kind:"autoclave", capacity:2500, accent:"var(--ember)", needsQuality:false, weigh:false, group:"Autoclaves"},
    {id:"AC_M",name:"Autoclave M",  short:"AC-M", kind:"autoclave", capacity:2200, accent:"var(--ember)", needsQuality:false, weigh:false, group:"Autoclaves"},
    {id:"AC_N",name:"Autoclave N",  short:"AC-N", kind:"autoclave", capacity:2200, accent:"var(--ember)", needsQuality:false, weigh:false, group:"Autoclaves", enabled:false},
    {id:"AC_O",name:"Autoclave O",  short:"AC-O", kind:"autoclave", capacity:2200, accent:"var(--ember)", needsQuality:false, weigh:false, group:"Autoclaves", enabled:false},
    {id:"PR2",name:"Pre-Refiner 2", short:"PR2",  kind:"prerefiner",accent:"var(--elec)",  needsQuality:true, weigh:false, group:"Pre-Refiners"},
    {id:"R1", name:"Refiner 1",     short:"R1",   kind:"refiner",   accent:"var(--elec)",  needsQuality:true,  weigh:false, sub:"stands in for R3", group:"Refiners"},
    {id:"R3", name:"Refiner 3",     short:"R3",   kind:"refiner",   accent:"var(--elec)",  needsQuality:true,  weigh:false, group:"Refiners"},
    {id:"R4", name:"Refiner 4",     short:"R4",   kind:"refiner",   accent:"var(--elec)",  needsQuality:true,  weigh:true,  group:"Refiners"},
    {id:"PR1",name:"Pre-Refiner 1", short:"PR1",  kind:"coarse",    accent:"var(--ember)", needsQuality:false, weigh:false, outWeight:false, sub:"coarse · shiftwise", group:"Coarse line"},
    {id:"R2", name:"Refiner 2",     short:"R2",   kind:"coarse",    accent:"var(--ember)", needsQuality:false, weigh:false, outWeight:true,  altQuality:"Medium", sub:"coarse · or Medium grade", group:"Coarse line"}
  ];
  var TYRES={ truck:{label:"Truck tyre", mesh:"30#", store:"truck"}, bike:{label:"Bike tyre", mesh:"20#", store:"bike"} };
  function M(id){ for(var i=0;i<MACHINES.length;i++) if(MACHINES[i].id===id) return MACHINES[i]; return null; }
  function shortName(id){ var m=M(id); return m?m.short:id; }
  var QUALITIES=["Special","SuperFine","Fine","Medium","DRC"];
  var SUPERVISORS=["Mathai","Rahul","Devanand"];

  /* ===== Customers, grades & rate card (from the reclaim price list) ===== */
  var DISPATCH_GRADES=["Special","SuperFine","Fine","Medium","Coarse","Sillsheet"];
  var CUSTOMERS=["UNITED","TEE PEE","ALEXCO","AARSON","DOLPHIN","ESTEEM","ALEENA","EASTERN","VAJRA","JETLUX","VISHAL","CONSOSIUM","G.P.T","SUN","MAHIMA","PEINCHERIL","BLUE MOUNT","MS","MET CL"];
  var PRICE_LIST={ Special:48, SuperFine:47, Fine:43, Medium:41, Coarse:36 };   // standard list rate / kg
  var RATE_CARD={
    "UNITED":{SuperFine:45,Fine:43,Coarse:34.4}, "TEE PEE":{Coarse:34.5}, "ALEXCO":{Fine:43,Coarse:34.5},
    "AARSON":{Coarse:34.5}, "DOLPHIN":{Coarse:36}, "ESTEEM":{Coarse:36.5}, "ALEENA":{Fine:44.5,Coarse:35.5},
    "EASTERN":{Special:48,SuperFine:47}, "VAJRA":{Medium:43}, "JETLUX":{Medium:42}, "VISHAL":{Special:48},
    "CONSOSIUM":{SuperFine:46}, "G.P.T":{Fine:43,Coarse:34}, "SUN":{Special:48}, "MAHIMA":{Sillsheet:42},
    "PEINCHERIL":{Coarse:34.5}, "BLUE MOUNT":{Coarse:34.5}, "MS":{Coarse:36}, "MET CL":{Coarse:36}
  };
  var RATE_NOTES={ "PEINCHERIL|Coarse":"ADV PYMT", "BLUE MOUNT|Coarse":"ADV PYMT" };
  // rateFor: customer's negotiated rate if set, else the standard list price for that grade.
  function rateFor(customer, grade){
    var cc=RATE_CARD[customer]; var r=(cc&&cc[grade]!=null)?cc[grade]:null;
    if(r!=null) return { rate:r, custom:true, note:RATE_NOTES[customer+"|"+grade]||"" };
    if(PRICE_LIST[grade]!=null) return { rate:PRICE_LIST[grade], custom:false, note:"" };
    return { rate:null, custom:false, note:"" };
  }
  var SAMPLE_VEHICLES=["KL-17-AB-1234","KL-17-CD-5678","KL-09-GG-3321"];   // own vehicles (editable later)
  var SAMPLE_DRIVERS=["Biju","Rajan","Saji"];

  /* Pre-filled cloud connection so a fresh phone install is connected on first open.
     The anon key is public-by-design (read/write gated by row-level security). */
  var SUPABASE_URL="https://xqdmxfjmmazfpmsvbnjx.supabase.co";
  var SUPABASE_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZG14ZmptbWF6ZnBtc3Zibmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE2MDcsImV4cCI6MjA5NzIwNzYwN30.tjR30i3Cdaz-6S2tr-7s5gvvOz24rTK0KyxW47itC6s";

  // Formulations already defined in the costing workbook (Special line).
  // 2500-capacity autoclave (A) -> the 2500 specs; 2200 autoclaves (M/N/O) -> the 2200 spec.
  var FORMULATIONS=[
    {name:"Special 2200",     capacity:2200, grade:"Special"},
    {name:"Special 2500",     capacity:2500, grade:"Special"},
    {name:"DRC 2200",         capacity:2200, grade:"DRC"},
    {name:"DRC 2500",         capacity:2500, grade:"DRC"}
  ];
  function formulationsFor(cap){ return FORMULATIONS.filter(function(f){ return f.capacity===cap; }); }
  var COARSE_FORMS=[ {name:"Coarse 2200",capacity:2200,wt:2280}, {name:"Coarse 2500",capacity:2500,wt:2585} ];
  function autoclaveFormsFor(cap){
    var out=[];
    formulationsFor(cap).forEach(function(f){ out.push({name:f.name, capacity:f.capacity, type:"special", grade:f.grade||"Special"}); });
    COARSE_FORMS.filter(function(f){ return f.capacity===cap; }).forEach(function(f){ out.push({name:f.name, capacity:f.capacity, type:"coarse"}); });
    return out;
  }
  function shiftRowFor(machId, shiftDate, shift){ for(var i=0;i<state.runs.length;i++){ var r=state.runs[i]; if(r.shiftwise&&r.machineId===machId&&r.shiftDate===shiftDate&&r.shift===shift) return r; } return null; }
  /* Post-shift crumb is RECORDED ONLY — no stock balance, no deduction, no arithmetic. */

  var FIREWOOD_KG=550;            // constant per autoclave load
  function autoclaveWorkers(paired){ return paired?1:2; } // 2 people share 2 autoclaves -> 1 each; alone -> 2
  // Default crew per machine (editable at stop). Grinders 1 & 2 differ by shift.
  function defaultWorkers(mid, shift){
    var night=(shift==="Night");
    switch(mid){
      case "PR1": case "PR2": return 3;          // pre-refiners
      case "R1": case "R3": return 2;            // refiners 1 & 3
      case "R4": case "R2": return 3;            // refiner 4 & coarse refiner 2
      case "CRK": return 2;                      // cracker, day & night
      case "GRD_K": case "GRD_S": return night?2:1;  // grinders 1 & 2: 1 day / 2 night
      default: return null;                      // Soorya + autoclaves handled elsewhere
    }
  }

  /* ===================== state ===================== */
  var state;
  function blank(){ return { v:1, settings:{syncUrl:"",supabaseUrl:SUPABASE_URL,supabaseKey:SUPABASE_ANON,device:"",role:"manager",pin:"",customers:[]}, sharedVersion:0, seq:{batch:0}, leftout:{}, batches:[], runs:[], dispatches:[], dispatchLoads:[], vehicles:[], drivers:[], maintenance:[], bearingLogs:[], conversions:[], shift:{supervisor:""}, machines:{}, qualityTests:[] }; }
  function todayISO(){ var d=new Date(),m=d.getMonth()+1,day=d.getDate(); return d.getFullYear()+"-"+(m<10?"0":"")+m+"-"+(day<10?"0":"")+day; }
  function shiftForMins(mins){ return (mins>=510 && mins<1230) ? "Day" : "Night"; }   // Day 08:30–20:30, Night 20:30–08:30
  function autoShift(){ var n=new Date(); return shiftForMins(n.getHours()*60+n.getMinutes()); }
  function shiftForTimeStr(t){ if(!t) return autoShift(); var p=String(t).split(":"); var mins=(parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0); return shiftForMins(mins); }
  function curShift(){ if(!state.shift) state.shift={supervisor:""}; return { date:todayISO(), name:autoShift(), supervisor:(state.shift.supervisor||"") }; }
  function setSupervisor(sup){ if(!state.shift||typeof state.shift!=="object") state.shift={}; state.shift={ supervisor:sup||"" }; save(); render(); pushShift(); }
  function pushShift(){
    if(syncTarget()!=="supabase") return;
    var c=curShift(); if(!c.supervisor) return;
    var base=(state.settings.supabaseUrl||"").trim().replace(/\/+$/,""), key=(state.settings.supabaseKey||"").trim(); if(!base||!key) return;
    try{ fetch(base+"/rest/v1/shifts?on_conflict=id",{ method:"POST",
      headers:{ "apikey":key, "Authorization":"Bearer "+key, "Content-Type":"application/json", "Prefer":"resolution=merge-duplicates,return=minimal" },
      body:JSON.stringify([{ id:c.date+"|"+c.name, shift_date:c.date, shift:c.name, supervisor:c.supervisor, updated_at:new Date().toISOString() }]) }).catch(function(){}); }catch(e){}
  }
  /* roles: simple per-device view mode, no login */
  function canEditHistory(){ return true; }


  /* ---- bearings / bushes (PR1, R1, R2, Grinder 1 use bushes; rest bearings) ---- */
  function bearingSpec(m){
    if(!m || m.kind==="autoclave") return null;
    var bush=(m.id==="PR1"||m.id==="R1"||m.id==="R2"||m.id==="GRD_K");
    var intervalH=(m.kind==="grind")?2:3;   // cracker + grinders every 2h; refiners every 3h
    return { type:bush?"bush":"bearing", intervalH:intervalH, positions:["1","2","3","4"] };
  }
  function lastBearingLog(mid){ var t=null; (state.bearingLogs||[]).forEach(function(x){ if(x.machineId===mid){ var ts=+new Date(x.ts); if(t==null||ts>t) t=ts; } }); return t; }
  function runStartMs(mid){ var st=state.machines[mid]; if(!st||!st.running) return null; return Date.now()-elapsedOf(st.running); }
  function bearingDue(m){
    var spec=bearingSpec(m); if(!spec) return false;
    var st=state.machines[m.id]; if(!st||!st.running||st.running.paused||st.down) return false;
    var last=lastBearingLog(m.id), ref=(last!=null)?last:runStartMs(m.id);
    if(ref==null) return false;
    return (Date.now()-ref) >= spec.intervalH*3600000;
  }
  function dueMachines(){ return MACHINES.filter(function(m){ return bearingDue(m); }); }
  /* Schedule status for the Bearing tab. Running machines are graded; idle/down are noted. */
  function bearingStatus(m){
    var spec=bearingSpec(m); if(!spec) return null;
    var st=state.machines[m.id]||{}, run=st.running, last=lastBearingLog(m.id);
    var intervalMs=spec.intervalH*3600000;
    if(st.down) return { spec:spec, state:"idle", note:"machine down", last:last, missed:0, overdueMin:0 };
    if(!run) return { spec:spec, state:"idle", note:"not running", last:last, missed:0, overdueMin:0 };
    if(run.paused) return { spec:spec, state:"idle", note:"paused", last:last, missed:0, overdueMin:0 };
    var ref=(last!=null)?last:runStartMs(m.id);
    if(ref==null) return { spec:spec, state:"ok", note:"running", last:last, missed:0, overdueMin:0 };
    var gap=Date.now()-ref;
    var overdue=gap-intervalMs;
    var missed = overdue>0 ? Math.floor(gap/intervalMs) : 0;     // how many interval boundaries have passed unlogged
    if(overdue>=0) return { spec:spec, state:(missed>=2?"miss":"due"), note:(last!=null?"last "+fmtAgo(last):"never logged"), last:last, missed:missed, overdueMin:Math.round(overdue/60000) };
    return { spec:spec, state:"ok", note:"next in "+fmtDur(Math.round(-overdue/60000)), last:last, missed:0, overdueMin:0 };
  }
  /* Group individual position rows into one logging event (same machine + timestamp). */
  function bearingEvents(mid, limit){
    var byKey={};
    (state.bearingLogs||[]).forEach(function(x){ if(x.machineId!==mid) return;
      var k=String(x.ts);
      if(!byKey[k]) byKey[k]={ ts:x.ts, recordedAt:(x.recordedAt!=null?x.recordedAt:+new Date(x.ts)), supervisor:x.supervisor||"", type:x.bearingType, temps:{} };
      byKey[k].temps[x.position]=x.tempC;
    });
    var arr=Object.keys(byKey).map(function(k){ return byKey[k]; }).sort(function(a,b){ return (b.recordedAt||0)-(a.recordedAt||0); });
    return limit?arr.slice(0,limit):arr;
  }
  function load(){
    var raw=store.read(), s;
    if(raw){ try{ s=JSON.parse(raw); }catch(e){ s=blank(); } } else s=blank();
    if(!s.settings) s.settings={syncUrl:"",device:"",role:"manager",pin:"",customers:[]};
    if(!s.settings.role) s.settings.role="manager";
    if(s.settings.pin==null) s.settings.pin="";
    if(!s.settings.customers) s.settings.customers=[];
    if(!s.dispatches) s.dispatches=[];
    if(!s.maintenance) s.maintenance=[];
    if(!s.bearingLogs) s.bearingLogs=[];
    if(!s.conversions) s.conversions=[];
    if(!s.pendingDeletes) s.pendingDeletes=[];
    if(!s.dispatchLoads) s.dispatchLoads=[];
    if(!s.vehicles||!s.vehicles.length) s.vehicles=SAMPLE_VEHICLES.slice();
    if(!s.drivers||!s.drivers.length) s.drivers=SAMPLE_DRIVERS.slice();
    if(!s.pendingLoadDeletes) s.pendingLoadDeletes=[];
    if(!s.qualityTests) s.qualityTests=[];
    if(!s.seededDispatchDemo){
      s.seededDispatchDemo=true;
      var mk=function(grade,batchNo,sacks,kg,customer){
        var w=(kg!=null?kg:(sacks!=null?sacks*SACK_KG:0)); var rf=rateFor(customer,grade);
        return { id:uid(), grade:grade, batchNo:batchNo||"", sacks:(sacks!=null?sacks:null), weightKg:w, rate:rf.rate, amount:(rf.rate!=null?Math.round(rf.rate*w*100)/100:0) };
      };
      var mkLoad=function(customer,own,veh,driver,items,agoMin){
        var tKg=0,tAmt=0; items.forEach(function(it){ tKg+=(+it.weightKg||0); tAmt+=(+it.amount||0); });
        return { id:uid(), device:"SAMPLE", ts:Date.now()-agoMin*60000, customer:customer, ownVehicle:own, vehicleNo:veh, driver:driver||"", supervisor:"Devanand", items:items, totalKg:Math.round(tKg*100)/100, totalAmount:Math.round(tAmt*100)/100, dummy:true, synced:true, createdAt:Date.now()-agoMin*60000 };
      };
      s.dispatchLoads.push(mkLoad("DOLPHIN",true,"KL-17-AB-1234","Biju",[ mk("Coarse","",120,null,"DOLPHIN"), mk("Special","9043",20,null,"DOLPHIN") ],180));
      s.dispatchLoads.push(mkLoad("UNITED",false,"KL-43-TT-9090","",[ mk("SuperFine","",null,1000,"UNITED"), mk("Fine","",null,500,"UNITED"), mk("Coarse","",null,2000,"UNITED") ],95));
      s.dispatchLoads.push(mkLoad("EASTERN",true,"KL-17-CD-5678","Rajan",[ mk("Special","",null,1500,"EASTERN"), mk("SuperFine","",null,800,"EASTERN") ],30));
    }
    if(!s.leftout) s.leftout={};
    if(!s.shift) s.shift={date:todayISO(),name:autoShift(),supervisor:""};
    if(s.shift.supervisor==null) s.shift.supervisor="";
    if(s.settings.autoSync==null) s.settings.autoSync=true;
    if(!s.settings.supabaseUrl) s.settings.supabaseUrl=SUPABASE_URL;
    if(!s.settings.supabaseKey) s.settings.supabaseKey=SUPABASE_ANON;
    if(s.sharedVersion==null) s.sharedVersion=0;
    if(s.lastSyncAt==null) s.lastSyncAt=0;
    if(!s.seq) s.seq={batch:0};
    if(!s.batches) s.batches=[];
    if(!s.runs) s.runs=[];
    if(!s.machines) s.machines={};
    MACHINES.forEach(function(m){ if(!s.machines[m.id]) s.machines[m.id]={running:null,down:null}; else if(s.machines[m.id].down===undefined) s.machines[m.id].down=null; });
    state=s;
  }
  function save(){ store.write(JSON.stringify(state)); scheduleAutoSync(); scheduleLivePush(); scheduleSharedPush(); }
  function uid(){ try{ if(crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(e){} return "r"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

  /* ===================== helpers ===================== */
  function eligibleBatches(){ return state.batches.filter(function(b){ return b.autoclaveDone && !b.closed; }); }
  function batchTaken(b){ return (b.qualities && b.qualities.length) ? b.qualities : []; }
  function qualWeighed(b,q){ return state.runs.some(function(r){ return r.batchId===b.id && !r.shiftwise && r.quality===q && r.weightKg!==""&&r.weightKg!=null && (r.machineId==="R4"||r.needsWeigh); }); }
  function allTakenWeighed(b){ var t=batchTaken(b); if(!t.length) return false;
    for(var i=0;i<t.length;i++){ if(!qualWeighed(b,t[i])) return false; } return true; }
  function activeBatches(){ return state.batches.filter(function(b){ return !b.closed; }); }
  function markTaken(batchId,q){ var b=batch(batchId); if(!b||b.closed) return; b.qualities=b.qualities||[];
    var i=b.qualities.indexOf(q); if(i<0) b.qualities.push(q); else b.qualities.splice(i,1); save(); render(); }
  function openCloseConfirm(id){ var b=batch(id); if(!b) return;
    var t=batchTaken(b), nW=0; t.forEach(function(q){ if(qualWeighed(b,q)) nW++; });
    if(!t.length){ toast("Mark which qualities were taken first","warn"); return; }
    if(nW<t.length){ toast("Weigh all marked qualities first ("+nW+"/"+t.length+")","warn"); return; }
    openSheet('<div class="sheet-h"><b>Close batch '+esc(b.no)+'?</b></div>'+
      '<div class="sheet-sub">All '+t.length+' marked qualities are weighed. Closing removes it from the active batch and refiner lists. It stays available in Dispatch and History.</div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" data-closebatch-go="'+b.id+'">Close batch</button></div>'); }
  function closeBatch(id){ var b=batch(id); if(!b) return; b.closed=true; save(); closeSheet(); render(); toast("Batch "+b.no+" closed","ok"); }
  function batchInAC(b){ return MACHINES.some(function(mm){ return mm.kind==="autoclave" && state.machines[mm.id] && state.machines[mm.id].running && state.machines[mm.id].running.batchId===b.id; }); }
  function batchOrphaned(b){ return state.runs.filter(function(r){ return r.batchId===b.id; }).length===0 && !batchInAC(b); }   // autoclave entry deleted (or never captured) & not currently loaded
  function openBatchDetail(id){
    var b=batch(id); if(!b){ closeSheet(); return; }
    var runs=state.runs.filter(function(r){ return r.batchId===id; }).sort(function(a,c){ return (a.end||0)-(c.end||0); });
    var byQ={}; runs.forEach(function(r){ if(!r.shiftwise && r.quality && (r.machineId==="R4"||r.needsWeigh)){ byQ[r.quality]=(byQ[r.quality]||0)+(parseFloat(r.weightKg)||0); } });
    var qs=Object.keys(byQ); var totalOut=0; qs.forEach(function(q){ totalOut+=byQ[q]; });
    var charge=b.capacity;
    var yieldPct=(charge&&totalOut>0)?Math.round(totalOut/charge*1000)/10:null;
    var acRun=null; for(var i=0;i<runs.length;i++){ if(runs[i].kind==="autoclave"){ acRun=runs[i]; break; } }
    var meta='<div class="ro"><span class="k">Autoclave</span><span class="v">'+esc(b.autoclaveId?shortName(b.autoclaveId):"—")+' · '+esc(b.capacity||"—")+' kg charge</span></div>'+
      '<div class="ro"><span class="k">Shift</span><span class="v">'+esc(b.shift||"—")+' · '+esc(fmtDay(b.shiftDate))+'</span></div>'+
      '<div class="ro"><span class="k">Loaded crew</span><span class="v">'+(b.paired?"1 (shared)":"2 (alone)")+'</span></div>'+
      (acRun&&acRun.loadedAt?'<div class="ro"><span class="k">Autoclave time</span><span class="v">⤓ '+fmtClock(acRun.loadedAt)+' → ⤒ '+(acRun.unloadedAt?fmtClock(acRun.unloadedAt):"—")+'</span></div>':'')+
      '<div class="ro"><span class="k">Total output</span><span class="v">'+Math.round(totalOut)+' kg'+(yieldPct!=null?' · yield '+yieldPct+'%':'')+'</span></div>';
    var qtable = qs.length ? '<div class="sheet-label" style="margin-top:14px">Grades produced</div>'+qs.map(function(q){
        return '<div class="ro">'+qchip(q)+'<span class="v">'+Math.round(byQ[q])+' kg</span></div>'; }).join("") : '';
    var convs=(state.conversions||[]).filter(function(c){ return String(c.batchNo)===String(b.no); });
    var convLines = convs.length ? '<div class="sheet-label" style="margin-top:14px">Conversions</div>'+convs.map(function(c){
        return '<div class="ro"><span class="k">'+esc(c.fromQuality||"Special")+' → '+esc(c.toQuality||"SuperFine")+' <span class="muted">('+esc(c.stage||"")+')</span></span><span class="v">'+esc(c.qty)+' kg</span></div>'; }).join("") : '';
    var runLines = runs.length ? '<div class="sheet-label" style="margin-top:14px">All runs ('+runs.length+')</div>'+
      '<div class="scroll-x"><table class="hist" style="font-size:12px"><thead><tr><th>Machine</th><th>Grade</th><th>When</th><th class="tnum">Run</th><th class="tnum">kWh</th><th class="tnum">Crew</th><th class="tnum">kg</th></tr></thead><tbody>'+
      runs.map(function(r){
        var mtr=(r.elecStart!==""&&r.elecStart!=null)?('<br><span class="muted" style="font-size:9px">'+esc(r.elecStart)+'→'+esc(r.elecEnd!==""&&r.elecEnd!=null?r.elecEnd:'—')+'</span>'):'';
        return '<tr><td>'+esc(r.short||shortName(r.machineId))+((r.passes||1)>1?' <span style="color:var(--err);font-size:9px">⚠'+r.passes+'</span>':'')+'</td>'+
          '<td>'+(r.quality?qchip(r.quality):(r.kind==="autoclave"?'<span class="muted">load</span>':'—'))+'</td>'+
          '<td><span class="muted" style="font-size:10px">'+esc(fmtDay(runDate(r)))+' · '+esc(r.shift||"")+'</span></td>'+
          '<td class="tnum">'+fmtHrs(r.runtimeMin)+'</td>'+
          '<td class="tnum">'+((r.kWh!==""&&r.kWh!=null)?esc(r.kWh):'—')+mtr+'</td>'+
          '<td class="tnum">'+(r.workers!==""&&r.workers!=null?esc(r.workers):'—')+'</td>'+
          '<td class="tnum">'+((r.weightKg!==""&&r.weightKg!=null)?esc(r.weightKg):'—')+'</td></tr>';
      }).join("")+'</tbody></table></div>' : '';
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#f6c08a,var(--ember))"></span><b>Batch '+esc(b.no)+'</b></div>'+
      '<div class="sheet-sub">'+esc(b.formulation||"")+(b.closed?' · <span style="color:var(--ok)">closed</span>':'')+'</div>'+
      meta+qtable+convLines+runLines+
      '<div class="sheet-actions"><button class="btn primary block" data-act="close">Done</button></div>');
  }
  function openDeleteBatchSheet(id){ var b=batch(id); if(!b){ closeSheet(); return; }
    var stray=state.runs.filter(function(r){ return r.batchId===id; }).length;
    openSheet('<div class="sheet-h"><span class="led" style="background:var(--err)"></span><b>Delete batch '+esc(b.no)+'?</b></div>'+
      '<div class="sheet-sub">This batch has no autoclave entry'+(stray?' but still has '+stray+' linked run(s)':'')+'. Deleting removes it from the Batches list'+(stray?' and its '+stray+' linked run(s)':'')+'. This cannot be undone.</div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn danger" data-delbatch-go="'+b.id+'">Delete batch</button></div>'); }
  function deleteBatch(id){ var b=batch(id); if(!b){ closeSheet(); return; }
    var stray=state.runs.filter(function(r){ return r.batchId===id; });
    stray.forEach(function(r){ if(r.synced && syncTarget()==="supabase"){ state.pendingDeletes=state.pendingDeletes||[]; if(state.pendingDeletes.indexOf(r.id)<0) state.pendingDeletes.push(r.id); } });
    state.runs=state.runs.filter(function(r){ return r.batchId!==id; });
    state.qualityTests=(state.qualityTests||[]).filter(function(q){ return !(q.kind==="batch" && String(q.batchNo)===String(b.no)); });   // drop this batch's QC rows
    state.batches=state.batches.filter(function(x){ return x.id!==id; });
    save(); closeSheet(); render(); toast("Batch "+b.no+" deleted","ok"); scheduleAutoSync(400); }
  function batch(id){ for(var i=0;i<state.batches.length;i++) if(state.batches[i].id===id) return state.batches[i]; return null; }
  function isComplete(r){ return r.needsWeigh ? (r.weightKg!=="" && r.weightKg!=null) : true; }
  function pendingWeigh(){ return state.runs.filter(function(r){ return r.needsWeigh && (r.weightKg===""||r.weightKg==null); }); }
  function unsynced(){ return state.runs.filter(function(r){ return !r.synced && isComplete(r); }); }
  function unsyncedDispatches(){ return (state.dispatches||[]).filter(function(d){ return !d.synced; }); }
  function unsyncedLoads(){ return (state.dispatchLoads||[]).filter(function(l){ return !l.synced && !l.dummy; }); }
  function unsyncedQuality(){ return (state.qualityTests||[]).filter(function(q){ return !q.synced; }); }
  function unsyncedMaintenance(){ return (state.maintenance||[]).filter(function(x){ return !x.synced; }); }
  function unsyncedBearings(){ return (state.bearingLogs||[]).filter(function(x){ return !x.synced; }); }
  function unsyncedConversions(){ return (state.conversions||[]).filter(function(x){ return !x.synced; }); }
  function unsyncedCount(){ return unsynced().length + unsyncedDispatches().length + unsyncedMaintenance().length + unsyncedBearings().length + unsyncedConversions().length + unsyncedLoads().length + unsyncedQuality().length + ((state.pendingDeletes||[]).length) + ((state.pendingLoadDeletes||[]).length); }
  function runningCount(){ var n=0; MACHINES.forEach(function(m){ if(state.machines[m.id].running) n++; }); return n; }

  function fmtElapsed(ms){ var s=Math.max(0,Math.floor(ms/1000));
    var h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
    function p(n){ return (n<10?"0":"")+n; } return p(h)+":"+p(m)+":"+p(ss); }
  function fmtDur(min){ if(min==null) return "—"; var h=Math.floor(min/60), m=Math.round(min%60);
    return h>0 ? h+"h "+m+"m" : (Math.round(min*10)/10)+"m"; }
  function fmtHrs(min){ if(min==null||min==="") return "—"; var h=Math.round((min/60)*100)/100; return h+" h"; }
  function fmtClock(ms){ var d=new Date(ms); function p(n){return(n<10?"0":"")+n;} return p(d.getHours())+":"+p(d.getMinutes()); }
  function agoText(ms){ if(!ms) return "—"; var s=Math.floor((Date.now()-ms)/1000);
    if(s<10) return "just now"; if(s<60) return s+" s ago"; var m=Math.floor(s/60);
    if(m<60) return m+" min ago"; var h=Math.floor(m/60); if(h<24) return h+" h ago"; return fmtClock(ms); }
  function fmtDate(ms){ var d=new Date(ms); var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return mo[d.getMonth()]+" "+d.getDate()+" "+fmtClock(ms); }
  function isoDate(d){ function p(n){return(n<10?"0":"")+n;} return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()); }
  function fmtDay(iso){ if(!iso) return ""; var p=String(iso).split("-"); if(p.length<3) return iso;
    var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return parseInt(p[2],10)+" "+mo[parseInt(p[1],10)-1]; }
  function defaultShift(){ return { date:todayISO(), shift:autoShift() }; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
  function num(v){ if(v==="" || v==null) return null; var n=parseFloat(v); return isNaN(n)?null:n; }
  function elapsedOf(run){ var seg=run.segStart||run.start||Date.now(); return (run.accumMs||0)+(run.paused?0:(Date.now()-seg)); }
  function addNum(a,b){ var x=(a===""||a==null)?null:parseFloat(a), y=(b==null)?null:parseFloat(b); if(x==null&&y==null) return ""; return Math.round(((x||0)+(y||0))*100)/100; }
  function maxNum(a,b){ var x=(a===""||a==null)?null:parseFloat(a), y=(b==null||b==="")?null:parseFloat(b); if(x==null&&y==null) return ""; if(x==null) return y; if(y==null) return x; return Math.max(x,y); }   // crew is a headcount, not additive
  function srcVals(arr){ arr=arr||[]; function n(v){ return (v==null||v==="")?"":(isNaN(Number(v))?v:Number(v)); }
    return { src1:n(arr[0]), src2:n(arr[1]), src3:n(arr[2]), src4:n(arr[3]) }; }
  function sum(arr){ var t=0; (arr||[]).forEach(function(n){ t+=parseFloat(n)||0; }); return Math.round(t*100)/100; }
  function qchip(q){ return q ? '<span class="qchip q-'+esc(q)+'">'+esc(q)+'</span>' : ''; }
  function runSources(r){ var s=[]; [r.src1,r.src2,r.src3,r.src4].forEach(function(v){ if(v!=null&&v!=="") s.push(String(v)); }); return s; }

  /* ===================== actions ===================== */
  function startAutoclave(mid, batchNo, formulationName, paired, loadedAt, shiftDate, shift){
    var m=M(mid); batchNo=(batchNo||"").trim();
    if(!batchNo){ toast("Enter a batch number","warn"); return; }
    if(state.batches.some(function(b){ return String(b.no).toLowerCase()===batchNo.toLowerCase(); })){ toast("Batch "+batchNo+" already exists","warn"); return; }
    if(!formulationName){ toast("Pick a formulation","warn"); return; }
    var sd=shiftDate||curShift().date, sh=shift||autoShift();
    var b={ id:uid(), no:batchNo, capacity:m.capacity, formulation:formulationName,
            autoclaveId:m.id, paired:!!paired, startedAt:Date.now(), shiftDate:sd, shift:sh, autoclaveDone:false, qualities:[] };
    state.batches.push(b);
    state.machines[mid].running={ batchId:b.id, quality:"", loadedAt:(loadedAt!=null?loadedAt:Date.now()), shiftDate:sd, shift:sh, segStart:Date.now(), accumMs:0, paused:false };
    save(); closeSheet(); render(); toast("Loaded "+batchNo+" on "+m.name,"ok");
    postStatus(mid,"running");
  }
  function startRefiner(mid, batchId, quality, sourceBatches, elecStart, hourStart, shiftDate, shift, opts){
    var wg=(opts&&opts.weigh!=null)?!!opts.weigh:!!M(mid).weigh;
    state.machines[mid].running={ batchId:batchId, quality:quality||"", sourceBatches:sourceBatches||[], weigh:wg, elecStart:(elecStart==null?"":elecStart), hourStart:(hourStart==null?"":hourStart), shiftDate:shiftDate||todayISO(), shift:shift||autoShift(), segStart:Date.now(), accumMs:0, paused:false };
    save(); closeSheet(); render();
    var b=batch(batchId); toast(M(mid).name+" started · "+b.no+(quality?" · "+quality:""),"ok");
    postStatus(mid,"running");
  }
  function startShiftMachine(mid, shift, shiftDate, tyreType, elecStart, hourStart){
    var m=M(mid);
    state.machines[mid].running={ shiftwise:true, line:(m.kind==="grind"?"grind":"coarse"), tyreType:tyreType||"", shift:shift, shiftDate:shiftDate, elecStart:(elecStart==null?"":elecStart), hourStart:(hourStart==null?"":hourStart), segStart:Date.now(), accumMs:0, paused:false };
    save(); closeSheet(); render(); toast(m.short+" started · "+shift+(tyreType?" · "+TYRES[tyreType].label:""),"ok");
    postStatus(mid,"running");
  }
  function coarseBatchExists(no){
    no=String(no||"").toLowerCase(); if(!no) return false;
    if(state.runs.some(function(r){ return r.line==="coarse" && r.kind==="autoclave" && String(r.batchNo||"").toLowerCase()===no; })) return true;
    return MACHINES.some(function(mm){ var rr=state.machines[mm.id].running; return rr && rr.shiftwise && rr.line==="coarse" && String(rr.batchNo||"").toLowerCase()===no; });
  }
  function startAutoclaveCoarse(mid, formName, cap, shift, shiftDate, loadedAt, batchNo, paired){
    var m=M(mid); batchNo=(batchNo||"").trim();
    if(!batchNo){ toast("Enter a coarse batch number","warn"); return; }
    if(coarseBatchExists(batchNo)){ toast("Coarse batch "+batchNo+" already exists","warn"); return; }
    state.machines[mid].running={ shiftwise:true, line:"coarse", autoclaveId:m.id, batchNo:batchNo, formulation:formName, capacity:cap, paired:!!paired, shift:shift, shiftDate:shiftDate, loadedAt:(loadedAt!=null?loadedAt:Date.now()), segStart:Date.now(), accumMs:0, paused:false };
    save(); closeSheet(); render(); toast(m.name+" loaded · coarse "+batchNo,"ok");
    postStatus(mid,"running");
  }
  function pauseMachine(mid){
    var run=state.machines[mid].running; if(!run||run.paused) return;
    run.accumMs=(run.accumMs||0)+(Date.now()-(run.segStart||Date.now())); run.paused=true;
    save(); render(); toast(M(mid).short+" paused","ok");
    postStatus(mid,"paused");
  }
  function resumeMachine(mid){
    var run=state.machines[mid].running; if(!run||!run.paused) return;
    run.segStart=Date.now(); run.paused=false; save(); render(); toast(M(mid).short+" resumed","ok");
    postStatus(mid,"running");
  }
  // ---- Live status (read-only monitor feed) ----
  function postStatus(mid, status){
    if(!state || !state.settings) return;
    var url=(state.settings.syncUrl||"").trim(); if(!url) return;
    var m=M(mid); if(!m) return;
    var run=state.machines[mid] && state.machines[mid].running;
    var what="", tyre="", line="", since=Date.now();
    if(run && status!=="idle"){
      if(run.shiftwise){
        line=run.line||""; tyre=run.tyreType?TYRES[run.tyreType].mesh:"";
        what=(run.batchNo?run.batchNo+" · ":"")+(run.formulation?run.formulation+" · ":"")+(run.shift||"")+(run.shiftDate?" "+fmtDay(run.shiftDate):"");
      } else {
        line="special"; var b=batch(run.batchId);
        what=(b?b.no:"")+(run.quality?" · "+run.quality:"")+(b&&b.formulation?" · "+b.formulation:"");
      }
      since=Date.now()-elapsedOf(run);
    }
    var item={ key:(state.settings.device||"device")+"|"+mid, device:state.settings.device||"",
      machineId:mid, machine:m.name, line:line, status:status, what:what, tyre:tyre, sinceMs:since, updated:Date.now() };
    try{ fetch(url,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({status:item})}); }catch(e){}
  }
  function postAllStatus(){
    if(!state || !state.settings || !(state.settings.syncUrl||"").trim()) return;
    Object.keys(state.machines||{}).forEach(function(mid){
      var run=state.machines[mid] && state.machines[mid].running;
      if(run) postStatus(mid, run.paused?"paused":"running");
    });
  }
  function commitRun(mid, fields){
    var m=M(mid), run=state.machines[mid].running; if(!run) return;
    var end=Date.now();
    var hStart=(fields.hourStart===""||fields.hourStart==null)?null:parseFloat(fields.hourStart);
    var hEnd=(fields.hourEnd===""||fields.hourEnd==null)?null:parseFloat(fields.hourEnd);
    var hrs, runtimeMin;
    if(m.kind==="autoclave" && fields.loadedAt!=null && fields.unloadedAt!=null){
      runtimeMin=Math.max(0, Math.round((fields.unloadedAt-fields.loadedAt)/60000*100)/100);
      hrs=Math.round((runtimeMin/60)*100)/100;
    } else if(fields.hoursDirect!=null && fields.hoursDirect!==""){
      hrs=Math.max(0, Math.round(parseFloat(fields.hoursDirect)*100)/100);
      runtimeMin=Math.round(hrs*60*100)/100;
    } else {
      hrs=(hStart!=null && hEnd!=null)?Math.max(0,Math.round((hEnd-hStart)*100)/100):0;
      runtimeMin=Math.round(hrs*60*100)/100;
    }

    if(run.shiftwise){
      // Shiftwise run (coarse refiners + grinders) -> accumulate by machine + shift date + shift.
      // A coarse autoclave load carries its own batch number, so it is logged as its own row.
      var isBatchedAuto = (m.kind==="autoclave" && run.batchNo);
      var cex = isBatchedAuto ? null : shiftRowFor(m.id, run.shiftDate, run.shift);
      if(cex){
        cex.kWh=addNum(cex.kWh, fields.kWh);
        cex.firewoodKg=addNum(cex.firewoodKg, fields.firewoodKg);
        cex.workers=maxNum(cex.workers, fields.workers);
        cex.runtimeMin=Math.round(((parseFloat(cex.runtimeMin)||0)+runtimeMin)*100)/100;
        cex.hoursRun=Math.round((cex.runtimeMin/60)*100)/100;
        cex.passes=(cex.passes||1)+1; cex.end=end; cex.synced=false;
        if(fields.elecEnd!=null) cex.elecEnd=fields.elecEnd;
        if((cex.elecStart==null||cex.elecStart==="")&&fields.elecStart!=null) cex.elecStart=fields.elecStart;
        if(hEnd!=null) cex.hourEnd=hEnd;
        if((cex.hourStart==null||cex.hourStart==="")&&hStart!=null) cex.hourStart=hStart;
        if(run.weighEntries&&run.weighEntries.length){ cex.weighEntries=(cex.weighEntries||[]).concat(run.weighEntries); cex.needsWeigh=true; }
        if(run.formulation && !cex.formulation) cex.formulation=run.formulation;
        if(run.tyreType) cex.tyreType=run.tyreType;
        if(m.kind==="autoclave" && !cex.autoclaveId) cex.autoclaveId=m.id;
        if(fields.loadedAt!=null && cex.loadedAt==null) cex.loadedAt=fields.loadedAt;
        if(fields.unloadedAt!=null) cex.unloadedAt=fields.unloadedAt;
      } else {
        state.runs.push({
          id:uid(), device:state.settings.device||"", machine:m.name, machineId:m.id, short:m.short, kind:m.kind, line:run.line, shiftwise:true,
          shift:run.shift, shiftDate:run.shiftDate, supervisor:curShift().supervisor||"", formulation:run.formulation||"", capacity:run.capacity||"",
          tyreType:run.tyreType||"", mesh:run.tyreType?TYRES[run.tyreType].mesh:"",
          batchId:"", batchNo:(run.batchNo||""), autoclaveId:(m.kind==="autoclave"?m.id:(run.autoclaveId||"")), paired:false, quality:"", passes:1,
          start:run.segStart||end, end:end, runtimeMin:runtimeMin, hoursRun:Math.round((runtimeMin/60)*100)/100,
          loadedAt:(fields.loadedAt!=null?fields.loadedAt:null), unloadedAt:(fields.unloadedAt!=null?fields.unloadedAt:null),
          kWh:fields.kWh==null?"":fields.kWh, elecStart:fields.elecStart==null?"":fields.elecStart, elecEnd:fields.elecEnd==null?"":fields.elecEnd,
          hourStart:hStart==null?"":hStart, hourEnd:hEnd==null?"":hEnd,
          firewoodKg:fields.firewoodKg==null?"":fields.firewoodKg, workers:fields.workers==null?"":fields.workers,
          weightKg:"", weighEntries:(m.outWeight?(run.weighEntries||[]):undefined), needsWeigh:!!m.outWeight,
          synced:false, createdAt:end
        });
      }
      state.machines[mid].running=null; postStatus(mid,"idle");
      save(); closeSheet(); render();
      toast(m.short+" · "+run.shift+" logged","ok");
      return;
    }

    var b=batch(run.batchId);
    var sv=srcVals(run.sourceBatches);
    if(m.id==="R4" && run.quality && b){ b.qualities=b.qualities||[]; if(b.qualities.indexOf(run.quality)<0) b.qualities.push(run.quality); }
    // Every stop is logged as its OWN row (no auto-merge), so a genuine double entry stays visible
    // as two separate rows in History for the supervisor to compare and delete the wrong one.
    var row={
      id:uid(), device:state.settings.device||"", machine:m.name, machineId:m.id, short:m.short, kind:m.kind, line:"special",
      batchId:b.id, batchNo:b.no, capacity:b.capacity, formulation:b.formulation,
      autoclaveId:b.autoclaveId||"", paired:!!b.paired, passes:1,
      shiftDate:(run.shiftDate||curShift().date), shift:(run.shift||curShift().name), supervisor:curShift().supervisor||"",
      quality:run.quality||"", start:run.segStart||run.start||end, end:end, runtimeMin:runtimeMin,
      hoursRun:Math.round((runtimeMin/60)*100)/100,
      loadedAt:(fields.loadedAt!=null?fields.loadedAt:null), unloadedAt:(fields.unloadedAt!=null?fields.unloadedAt:null),
      src1:sv.src1, src2:sv.src2, src3:sv.src3, src4:sv.src4,
      kWh:fields.kWh==null?"":fields.kWh, elecStart:fields.elecStart==null?"":fields.elecStart, elecEnd:fields.elecEnd==null?"":fields.elecEnd, firewoodKg:fields.firewoodKg==null?"":fields.firewoodKg,
      hourStart:hStart==null?"":hStart, hourEnd:hEnd==null?"":hEnd,
      workers:fields.workers==null?"":fields.workers,
      weightKg:fields.weightKg==null?"":fields.weightKg, weighEntries:[], needsWeigh:(run.weigh!=null?!!run.weigh:!!m.weigh),
      synced:false, createdAt:end
    };
    state.runs.push(row);
    state.machines[mid].running=null; postStatus(mid,"idle");
    if(m.kind==="autoclave") b.autoclaveDone=true;
    save(); closeSheet(); render();
    if(m.kind==="autoclave") toast(b.no+" unloaded · ready for refiners","ok");
    else if(m.weigh && row.weightKg==="") toast("Run logged · weigh "+b.no+" "+row.quality,"ok");
    else toast(m.name+" run logged","ok");
  }
  /* ---- live weighing while a shiftwise machine (grinder/coarse) is running ---- */
  function liveWeighRun(mid){ var st=state.machines[mid]; return st&&st.running?st.running:null; }
  function addLiveWeigh(mid, kg){
    var run=liveWeighRun(mid); if(!run) return;
    run.weighEntries=run.weighEntries||[];
    run.weighEntries.push(Math.round(kg*100)/100);
    save(); openLiveWeighSheet(mid);
  }
  function removeLiveWeigh(mid, idx){
    var run=liveWeighRun(mid); if(!run||!run.weighEntries) return;
    run.weighEntries.splice(idx,1);
    save(); openLiveWeighSheet(mid);
  }
  function openLiveWeighSheet(mid){
    var m=M(mid), run=liveWeighRun(mid); if(!run) return; run.weighEntries=run.weighEntries||[];
    var entries=run.weighEntries, total=sum(entries);
    var list = entries.length ? '<div class="weighlist">'+entries.map(function(v,i){ return '<div class="weighrow"><span class="tnum">'+v+' kg</span><button class="wdel" data-lwdel="'+i+'" aria-label="remove">✕</button></div>'; }).join("")+'</div>'
      : '<div class="hint" style="margin:4px 0 12px">Add each load as it comes off — they keep adding up while the machine runs. Finalise &amp; submit in the Weigh tab after you stop it.</div>';
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#cfe0ee,var(--steel))"></span><b>Add weight — '+esc(m.name)+'</b></div>'+
      '<div class="sheet-sub">'+(run.line==="grind"?'Grinder output · ':'Coarse · ')+esc(run.shift)+' · '+esc(fmtDay(run.shiftDate))+(run.tyreType?' · '+esc(TYRES[run.tyreType].mesh):'')+'</div>'+
      '<div class="ro" style="margin-bottom:14px"><span class="k">Running total</span><span class="v" style="color:var(--elec)">'+total+' kg</span></div>'+
      list+
      '<div class="sheet-label">Add a weighing</div>'+
      '<div class="field-inline" style="align-items:stretch"><div class="field" style="flex:2;margin-bottom:0"><div class="num-suffix"><input id="lw-add" type="number" inputmode="decimal" placeholder="0"><span class="sfx">kg</span></div></div>'+
      '<button class="btn elec" id="lw-plus" style="flex:1">+ Add</button></div>'+
      '<div class="sheet-actions"><button class="btn primary block" data-act="close">Done</button></div>');
    var inp=sheet.querySelector("#lw-add");
    setTimeout(function(){ try{ inp.focus(); }catch(e){} },120);
    function add(){ var v=num(inp.value); if(v==null||v<=0){ toast("Enter a weight","warn"); return; } addLiveWeigh(mid,v); }
    sheet.querySelector("#lw-plus").addEventListener("click",add);
    inp.addEventListener("keydown",function(e){ if(e.key==="Enter") add(); });
    sheet.querySelectorAll("[data-lwdel]").forEach(function(el){ el.addEventListener("click",function(){ removeLiveWeigh(mid, parseInt(el.getAttribute("data-lwdel"),10)); }); });
  }
  /* ---- Quality conversion (same batch); processing cost follows the kg. Special→SuperFine, SuperFine→Fine ---- */
  var CONVERTS={ "Special":"SuperFine", "SuperFine":"Fine" };
  function qualityRowFor(batchId, quality){
    for(var i=0;i<state.runs.length;i++){ var r=state.runs[i];
      if(r.machineId==="R4" && (r.quality===quality) && r.batchId===batchId) return r; }
    return null;
  }
  function applyConversion(fromRow, qty, stage, toQuality){
    qty=Math.round(qty*100)/100;
    toQuality=toQuality||CONVERTS[fromRow.quality]||"SuperFine";
    fromRow.weightKg=Math.round(((parseFloat(fromRow.weightKg)||0)-qty)*100)/100;
    fromRow.convOutKg=Math.round((((parseFloat(fromRow.convOutKg)||0))+qty)*100)/100;
    fromRow.synced=false;
    var dest=qualityRowFor(fromRow.batchId, toQuality), end=Date.now();
    if(dest){
      dest.weightKg=Math.round(((parseFloat(dest.weightKg)||0)+qty)*100)/100;
      dest.convInKg=Math.round((((parseFloat(dest.convInKg)||0))+qty)*100)/100;
      dest.needsWeigh=false; dest.synced=false;
    } else {
      var b=batch(fromRow.batchId);
      state.runs.push({
        id:uid(), device:state.settings.device||"", machine:"Refiner 4", machineId:"R4", short:"R4", kind:"refiner", line:"special",
        batchId:fromRow.batchId, batchNo:fromRow.batchNo, capacity:fromRow.capacity||(b?b.capacity:""), formulation:fromRow.formulation||(b?b.formulation:""),
        autoclaveId:fromRow.autoclaveId||"", paired:!!fromRow.paired, passes:1,
        shiftDate:fromRow.shiftDate, shift:fromRow.shift, supervisor:fromRow.supervisor||(curShift().supervisor||""),
        quality:toQuality, start:end, end:end, runtimeMin:0, hoursRun:0,
        kWh:"", elecStart:"", elecEnd:"", firewoodKg:"", workers:"", weightKg:qty, convInKg:qty, converted:true,
        needsWeigh:false, synced:false, createdAt:end
      });
      if(b){ b.qualities=b.qualities||[]; if(b.qualities.indexOf(toQuality)<0) b.qualities.push(toQuality); }
    }
    state.conversions.push({ id:uid(), device:state.settings.device||"", batchNo:fromRow.batchNo, qty:qty, stage:stage,
      fromQuality:fromRow.quality, toQuality:toQuality,
      ts:end, shiftDate:fromRow.shiftDate, shift:fromRow.shift, supervisor:fromRow.supervisor||(curShift().supervisor||""), synced:false });
  }
  function convertAtWeigh(runId, qty){
    var r=weighRow(runId); if(!r) return;
    var draft=sum(r.weighEntries);
    if(draft<=0){ toast("Add the "+(r.quality||"")+" weight first","warn"); return; }
    if(qty==null||qty<=0){ toast("Enter kg to convert","warn"); return; }
    if(qty>draft){ toast("Only "+draft+" kg weighed","warn"); return; }
    var to=CONVERTS[r.quality]||"SuperFine";
    r.weightKg=draft;                       // submit full weight first
    applyConversion(r, qty, "weighing", to);
    save(); closeSheet(); render();
    toast(qty+" kg → "+to+" · "+(draft-qty)+" kg "+r.quality,"ok");
  }
  function convertAtPack(runId, qty){
    var r=weighRow(runId); if(!r) return;
    var have=parseFloat(r.weightKg)||0;
    if(qty==null||qty<=0){ toast("Enter kg to convert","warn"); return; }
    if(qty>have){ toast("Only "+have+" kg "+(r.quality||"")+" here","warn"); return; }
    var to=CONVERTS[r.quality]||"SuperFine";
    applyConversion(r, qty, "packing", to);
    save(); closeSheet(); render();
    toast(qty+" kg → "+to+" of "+r.batchNo,"ok");
  }
  function weighRow(runId){ for(var i=0;i<state.runs.length;i++) if(state.runs[i].id===runId) return state.runs[i]; return null; }
  function addWeighEntry(runId, kg){
    var r=weighRow(runId); if(!r) return; if(!r.weighEntries) r.weighEntries=[];
    r.weighEntries.push(Math.round(kg*100)/100); save(); openWeighSheet(runId);
  }
  function removeWeighEntry(runId, idx){
    var r=weighRow(runId); if(!r||!r.weighEntries) return; r.weighEntries.splice(idx,1); save(); openWeighSheet(runId);
  }
  function submitWeight(runId){
    var r=weighRow(runId); if(!r) return; var t=sum(r.weighEntries);
    if(t<=0){ toast("Add a weight first","warn"); return; }
    r.weightKg=t; r.synced=false;
    save(); closeSheet(); render(); toast("Weight submitted · "+t+" kg","ok");
  }
  var syncing=false, autoTimer=null;
  function autoSyncOn(){ return !!(state && state.settings) && state.settings.autoSync!==false; }
  function scheduleAutoSync(delay){
    if(!autoSyncOn()) return;
    if(autoTimer) clearTimeout(autoTimer);
    autoTimer=setTimeout(autoSync, delay==null?8000:delay);
  }
  function autoSync(){
    if(!autoSyncOn() || syncing) return;
    if(typeof navigator!=="undefined" && navigator.onLine===false) return;
    if(!syncTarget()) return;
    if(unsyncedCount()===0) return;
    syncNow({auto:true});
  }
  function syncTarget(){
    if((state.settings.supabaseUrl||"").trim() && (state.settings.supabaseKey||"").trim()) return "supabase";
    if((state.settings.syncUrl||"").trim()) return "sheet";
    return null;
  }
  function syncNow(opts){
    opts=opts||{}; var tgt=syncTarget();
    if(!tgt){ if(!opts.auto) toast("Add your Supabase URL & key in Settings first","warn"); return; }
    if(tgt==="supabase") return syncSupabase(opts);
    return syncSheet(opts);
  }

  /* ---- Supabase REST sync (proper CORS, confirmed writes, upsert by id) ---- */
  function sbN(v){ return (v===""||v==null||(typeof v==="number"&&isNaN(v)))?null:v; }
  function sbISO(ms){ return (ms==null||ms==="")?null:new Date(ms).toISOString(); }
  function sbStr(v){ return (v===""||v==null)?null:String(v); }
  function runToSb(r){ return {
    id:r.id, device:sbStr(r.device), line:sbStr(r.line), machine_id:sbStr(r.machineId), machine:sbStr(r.machine),
    kind:sbStr(r.kind), batch_no:sbStr(r.batchNo), shift_date:sbN(r.shiftDate), shift:sbN(r.shift),
    capacity:sbN(r.capacity), formulation:sbStr(r.formulation), autoclave_id:sbStr(r.autoclaveId),
    paired:(r.paired==null?null:!!r.paired), quality:sbN(r.quality), tyre_type:sbN(r.tyreType), mesh:sbN(r.mesh),
    passes:sbN(r.passes), started_at:sbISO(r.start), ended_at:sbISO(r.end),
    runtime_min:sbN(r.runtimeMin), hours_run:sbN(r.hoursRun), kwh:sbN(r.kWh), firewood_kg:sbN(r.firewoodKg),
    elec_start:sbN(r.elecStart), elec_end:sbN(r.elecEnd), supervisor:sbN(r.supervisor),
    hour_start:sbN(r.hourStart), hour_end:sbN(r.hourEnd),
    loaded_at:sbISO(r.loadedAt), unloaded_at:sbISO(r.unloadedAt), packed_sacks:sbN(r.packedSacks),
    conv_out_kg:sbN(r.convOutKg), conv_in_kg:sbN(r.convInKg),
    leftout_in:sbN(r.leftoutIn), leftout_out:sbN(r.leftoutOut),
    workers:sbN(r.workers), weight_kg:sbN(r.weightKg),
    src1:sbN(r.src1), src2:sbN(r.src2), src3:sbN(r.src3), src4:sbN(r.src4) }; }
  function dispToSb(d){ return {
    id:d.id, device:sbStr(d.device), dispatched_at:sbISO(d.ts), batch_no:sbStr(d.batchNo),
    formulation:sbStr(d.formulation), customer_code:sbN(d.customerCode), customer_name:sbN(d.customerName),
    price:sbN(d.price), sacks:sbN(d.sacks), weight_kg:sbN(d.weightKg), driver:sbN(d.driver), quality:sbN(d.quality) }; }
  function maintToSb(m){ return {
    id:m.id, device:sbStr(m.device), machine_id:sbStr(m.machineId), machine:sbStr(m.machine),
    down_start:sbISO(m.downStart), repaired_at:sbISO(m.repairedAt), downtime_min:sbN(m.downtimeMin),
    root_cause:sbN(m.rootCause), resolution:sbN(m.resolution), prevention:sbN(m.prevention) }; }
  function bearingToSb(x){ return {
    id:x.id, device:sbStr(x.device), machine_id:sbStr(x.machineId), machine:sbStr(x.machine),
    position:sbStr(x.position), bearing_type:sbStr(x.bearingType), temp_c:sbN(x.tempC),
    ts:sbISO(x.ts==null?null:+new Date(x.ts)), recorded_at:sbISO(x.recordedAt!=null?x.recordedAt:(x.ts==null?null:+new Date(x.ts))), logged_at:sbISO(x.loggedAt!=null?x.loggedAt:null),
    shift_date:sbN(x.shiftDate), shift:sbN(x.shift), supervisor:sbN(x.supervisor) }; }
  function convToSb(x){ return {
    id:x.id, device:sbStr(x.device), batch_no:sbStr(x.batchNo), from_quality:sbStr(x.fromQuality||"Special"), to_quality:sbStr(x.toQuality||"SuperFine"),
    qty_kg:sbN(x.qty), stage:sbStr(x.stage), ts:sbISO(x.ts), shift_date:sbN(x.shiftDate), shift:sbN(x.shift), supervisor:sbN(x.supervisor) }; }
  function qualToSb(q){ return {
    id:q.id, device:sbStr(q.device), ts:sbISO(q.ts), kind:sbStr(q.kind), batch_no:sbN(q.batchNo), quality:sbN(q.quality),
    shift_date:sbN(q.shiftDate), shift:sbN(q.shift), verdict:sbStr(q.verdict),
    params:(q.params||[]), tester:sbN(q.tester), notes:sbN(q.notes),
    attachment_url:sbN(q.attachmentUrl), attachment_name:sbN(q.attachmentName) }; }
  function loadToSb(l){ return {
    id:l.id, device:sbStr(l.device), ts:sbISO(l.ts), customer:sbStr(l.customer),
    own_vehicle:(l.ownVehicle==null?null:!!l.ownVehicle), vehicle_no:sbStr(l.vehicleNo), driver:sbStr(l.driver),
    supervisor:sbStr(l.supervisor), total_kg:sbN(l.totalKg), total_amount:sbN(l.totalAmount) }; }
  function loadItemsToSb(l){ return (l.items||[]).map(function(it){ return {
    id:it.id, load_id:l.id, grade:sbStr(it.grade), batch_no:sbStr(it.batchNo),
    sacks:sbN(it.sacks), weight_kg:sbN(it.weightKg), rate:sbN(it.rate), amount:sbN(it.amount) }; }); }
  function sbPush(table, rows){
    var base=(state.settings.supabaseUrl||"").trim().replace(/\/+$/,"");
    var key=(state.settings.supabaseKey||"").trim();
    return fetch(base+"/rest/v1/"+table+"?on_conflict=id",{
      method:"POST",
      headers:{ "apikey":key, "Authorization":"Bearer "+key, "Content-Type":"application/json",
        "Prefer":"resolution=merge-duplicates,return=minimal" },
      body:JSON.stringify(rows)
    }).then(function(res){
      if(!res.ok) return res.text().then(function(t){ throw new Error("HTTP "+res.status+" "+(t||"").slice(0,180)); });
      return true;
    });
  }
  function markSynced(arr, items){ var set={}; items.forEach(function(x){ set[x.id]=1; }); arr.forEach(function(x){ if(set[x.id]) x.synced=true; }); }
  function sbDeleteRun(id){
    var base=(state.settings.supabaseUrl||"").trim().replace(/\/+$/,"");
    var key=(state.settings.supabaseKey||"").trim();
    return fetch(base+"/rest/v1/runs?id=eq."+encodeURIComponent(id),{
      method:"DELETE",
      headers:{ "apikey":key, "Authorization":"Bearer "+key, "Prefer":"return=minimal" }
    }).then(function(res){
      if(!res.ok && res.status!==404) return res.text().then(function(t){ throw new Error("HTTP "+res.status+" "+(t||"").slice(0,120)); });
      return true;
    });
  }
  function sbDeleteId(table, id){
    var base=(state.settings.supabaseUrl||"").trim().replace(/\/+$/,"");
    var key=(state.settings.supabaseKey||"").trim();
    return fetch(base+"/rest/v1/"+table+"?id=eq."+encodeURIComponent(id),{
      method:"DELETE",
      headers:{ "apikey":key, "Authorization":"Bearer "+key, "Prefer":"return=minimal" }
    }).then(function(res){
      if(!res.ok && res.status!==404) return res.text().then(function(t){ throw new Error("HTTP "+res.status+" "+(t||"").slice(0,120)); });
      return true;
    });
  }
  function sbDeleteAll(table){
    var base=(state.settings.supabaseUrl||"").trim().replace(/\/+$/,"");
    var key=(state.settings.supabaseKey||"").trim();
    return fetch(base+"/rest/v1/"+table+"?id=not.is.null",{
      method:"DELETE",
      headers:{ "apikey":key, "Authorization":"Bearer "+key, "Prefer":"return=minimal" }
    }).then(function(res){ return res.ok || res.status===404; });
  }
  /* Push a fresh (empty) plant snapshot at a higher version so it sticks. Without bumping
     the version past the server's, the next pull would just re-apply the old data. */
  function pushEmptyPlant(){
    var base=sharedBase(), key=sharedKey(); if(!base||!key) return Promise.resolve(false);
    return fetch(base+"/rest/v1/shared_state?id=eq.plant&select=version",{
      headers:{ "apikey":key, "Authorization":"Bearer "+key }
    }).then(function(r){ return r.ok?r.json():[]; }).then(function(rows){
      var rv=(rows&&rows[0])?(+rows[0].version||0):0;
      var newV=Math.max(rv, +state.sharedVersion||0)+1;
      var dev=(state.settings.device||"Tablet"), iso=new Date().toISOString();
      var doc=buildSharedDoc()||{};
      return fetch(base+"/rest/v1/shared_state?on_conflict=id",{ method:"POST",
        headers:{ "apikey":key, "Authorization":"Bearer "+key, "Content-Type":"application/json", "Prefer":"resolution=merge-duplicates,return=minimal" },
        body:JSON.stringify([{ id:"plant", doc:doc, version:newV, updated_by:dev, updated_at:iso }]) })
        .then(function(res){ if(res.ok){ state.sharedVersion=newV; state.lastSharedBy=dev; state.lastSharedAt=iso; store.write(JSON.stringify(state)); } return true; });
    });
  }
  function resetDevice(){
    var keep=state.settings;                              // keep this device's connection + role + pin + name
    var target=syncTarget(), base=sharedBase(), key=sharedKey();
    state=blank(); state.settings=keep; state.seededDispatchDemo=true;   // don't re-seed demo dispatches
    MACHINES.forEach(function(m){ state.machines[m.id]={running:null,down:null}; });
    if(typeof localStorage!=="undefined"){ try{ localStorage.removeItem("qcUploadQueue"); localStorage.removeItem("clUploadQueue"); }catch(e){} }
    store.write(JSON.stringify(state));
    closeSheet(); active="machines"; render();
    if(target==="supabase" && base && key){
      toast("Reset · clearing the cloud…","ok");
      var tables=["runs","dispatches","dispatch_load_items","dispatch_loads","maintenance","bearing_logs","conversions","quality_tests","shifts"];
      Promise.all(tables.map(function(tb){ return sbDeleteAll(tb).catch(function(){ return false; }); }))
        .then(function(){ return pushEmptyPlant(); })
        .then(function(){ if(!sheetIsOpen() && active!=="settings") render(); toast("Device reset · cloud cleared","ok"); })
        .catch(function(){ toast("Reset locally — cloud clear incomplete (will retry on sync)","warn"); });
    } else {
      toast("Device reset","ok");
    }
  }
  function syncErr(e){
    var m=(e&&e.message)||"no connection";
    if(typeof location!=="undefined" && location.protocol==="file:")
      return "Can't reach the database — the app is open as a downloaded file. Host it and open the https link instead.";
    if(/fetch|network|load failed/i.test(m))
      return "Can't reach the database. Check this tablet is online, and that the Supabase URL & anon key are both filled in correctly.";
    return "Sync failed: "+m;
  }
  function syncSupabase(opts){
    opts=opts||{}; var quiet=!!opts.auto;
    var pending=unsynced(), pendD=unsyncedDispatches(), pendM=unsyncedMaintenance(), pendB=unsyncedBearings(), pendC=unsyncedConversions();
    var pendL=unsyncedLoads();
    var pendQ=unsyncedQuality();
    var pendDel=(state.pendingDeletes||[]).slice();
    var pendLDel=(state.pendingLoadDeletes||[]).slice();
    if(!pending.length && !pendD.length && !pendM.length && !pendB.length && !pendC.length && !pendL.length && !pendQ.length && !pendDel.length && !pendLDel.length){ if(!quiet) toast("Nothing new to sync","ok"); return; }
    if(syncing) return; syncing=true; if(!quiet) render();
    var jobs=[];
    if(pending.length) jobs.push(sbPush("runs", pending.map(runToSb)).then(function(){ markSynced(state.runs, pending); }));
    if(pendD.length) jobs.push(sbPush("dispatches", pendD.map(dispToSb)).then(function(){ markSynced(state.dispatches, pendD); }));
    if(pendM.length) jobs.push(sbPush("maintenance", pendM.map(maintToSb)).then(function(){ markSynced(state.maintenance, pendM); }));
    if(pendB.length) jobs.push(sbPush("bearing_logs", pendB.map(bearingToSb)).then(function(){ markSynced(state.bearingLogs, pendB); }));
    if(pendC.length) jobs.push(sbPush("conversions", pendC.map(convToSb)).then(function(){ markSynced(state.conversions, pendC); }));
    if(pendQ.length) jobs.push(sbPush("quality_tests", pendQ.map(qualToSb)).then(function(){ markSynced(state.qualityTests, pendQ); }));
    if(pendL.length){
      var allItems=[]; pendL.forEach(function(l){ allItems=allItems.concat(loadItemsToSb(l)); });
      jobs.push(sbPush("dispatch_loads", pendL.map(loadToSb)).then(function(){
        return allItems.length?sbPush("dispatch_load_items", allItems):true;
      }).then(function(){ markSynced(state.dispatchLoads, pendL); }));
    }
    if(pendDel.length) jobs.push(Promise.all(pendDel.map(sbDeleteRun)).then(function(){
      state.pendingDeletes=(state.pendingDeletes||[]).filter(function(id){ return pendDel.indexOf(id)<0; }); }));
    if(pendLDel.length) jobs.push(Promise.all(pendLDel.map(function(id){ return sbDeleteId("dispatch_loads", id); })).then(function(){
      state.pendingLoadDeletes=(state.pendingLoadDeletes||[]).filter(function(id){ return pendLDel.indexOf(id)<0; }); }));
    Promise.all(jobs).then(function(){
      state.lastSyncAt=Date.now(); syncing=false; store.write(JSON.stringify(state));
      var n=pending.length+pendD.length+pendM.length+pendB.length+pendC.length+pendL.length+pendQ.length+pendDel.length+pendLDel.length;
      var sheetOpen=document.getElementById("sheet") && document.getElementById("sheet").classList.contains("show");
      if(!quiet){ render(); toast("Saved "+n+" record"+(n>1?"s":"")+" to the database","ok"); }
    }).catch(function(e){
      syncing=false; store.write(JSON.stringify(state)); // keep any partial successes already marked
      if(!quiet){ render(); toast(syncErr(e),"err"); }
    });
  }

  /* ---- live state mirror: pushes a full snapshot for the read-only monitor ---- */
  var livePushTimer=null;
  function scheduleLivePush(){ if(syncTarget()!=="supabase") return; if(livePushTimer) clearTimeout(livePushTimer); livePushTimer=setTimeout(pushLiveState, 4000); }
  function pushLiveState(){
    if(syncTarget()!=="supabase") return;
    var base=(state.settings.supabaseUrl||"").trim().replace(/\/+$/,""), key=(state.settings.supabaseKey||"").trim();
    if(!base||!key) return;
    var snap; try{ snap=JSON.parse(JSON.stringify(state)); }catch(e){ return; }
    if(snap.settings){ snap.settings={ device:snap.settings.device||"", role:snap.settings.role||"", customers:snap.settings.customers||[] }; } // strip keys/pin
    if(snap.dispatchLoads) snap.dispatchLoads=snap.dispatchLoads.filter(function(l){ return !l.dummy; }); // never mirror sample data
    var dev=(state.settings.device||"Tablet");
    try{
      fetch(base+"/rest/v1/live_state?on_conflict=device",{ method:"POST",
        headers:{ "apikey":key, "Authorization":"Bearer "+key, "Content-Type":"application/json", "Prefer":"resolution=merge-duplicates,return=minimal" },
        body:JSON.stringify([{ device:dev, state:snap, updated_at:new Date().toISOString() }]) }).catch(function(){});
    }catch(e){}
  }

  /* ===== shared master copy: every phone mirrors one cloud screen ===== */
  var sharedApplying=false, sharedPushTimer=null, sharedPulling=false, sharedPushing=false;
  function sharedBase(){ return (state.settings.supabaseUrl||"").trim().replace(/\/+$/,""); }
  function sharedKey(){ return (state.settings.supabaseKey||"").trim(); }
  function sheetIsOpen(){ var s=document.getElementById("sheet"); return !!(s && s.classList.contains("show")); }
  function buildSharedDoc(){
    var d; try{ d=JSON.parse(JSON.stringify(state)); }catch(e){ return null; }
    delete d.settings;                                   // each phone keeps its own keys / pin / device name / role
    delete d.sharedVersion; delete d.lastSharedBy; delete d.lastSharedAt;
    delete d.pendingDeletes; delete d.pendingLoadDeletes; delete d.lastSyncAt;
    if(d.dispatchLoads) d.dispatchLoads=d.dispatchLoads.filter(function(l){ return !l.dummy; });
    return d;
  }
  function applyShared(doc){
    if(!doc || typeof doc!=="object") return;
    sharedApplying=true;
    var keepSettings=state.settings;                     // preserve this device's own settings
    var keepVer=state.sharedVersion, keepBy=state.lastSharedBy, keepAt=state.lastSharedAt;
    var keepPendD=state.pendingDeletes, keepPendL=state.pendingLoadDeletes, keepLast=state.lastSyncAt;
    // Capture records that only exist on this device (not yet uploaded) so a pull can NEVER wipe them.
    var SYNC_ARRAYS=["runs","dispatches","dispatchLoads","maintenance","bearingLogs","conversions","qualityTests"];
    var keepUnsynced={};
    SYNC_ARRAYS.forEach(function(k){ keepUnsynced[k]=(state[k]||[]).filter(function(x){ return x && x.synced===false; }); });
    Object.keys(doc).forEach(function(k){ state[k]=doc[k]; });
    state.settings=keepSettings;
    state.sharedVersion=keepVer; state.lastSharedBy=keepBy; state.lastSharedAt=keepAt;
    state.pendingDeletes=keepPendD||[]; state.pendingLoadDeletes=keepPendL||[]; state.lastSyncAt=keepLast||0;
    // Re-insert any local unsynced records missing from the incoming snapshot (offline entries survive login/logout & pulls).
    SYNC_ARRAYS.forEach(function(k){
      var arr=state[k]||(state[k]=[]); var have={}; arr.forEach(function(x){ if(x&&x.id) have[x.id]=1; });
      (keepUnsynced[k]||[]).forEach(function(x){ if(x&&x.id&&!have[x.id]) arr.push(x); });
    });
    if(!state.machines) state.machines={};
    MACHINES.forEach(function(m){ if(!state.machines[m.id]) state.machines[m.id]={running:null,down:null}; else if(state.machines[m.id].down===undefined) state.machines[m.id].down=null; });
    if(!state.dispatchLoads) state.dispatchLoads=[];
    store.write(JSON.stringify(state));
    sharedApplying=false;
  }
  function pullShared(opts){
    opts=opts||{};
    if(syncTarget()!=="supabase"){ if(opts.cb) opts.cb(false); return; }
    var base=sharedBase(), key=sharedKey(); if(!base||!key){ if(opts.cb) opts.cb(false); return; }
    if(sharedPulling || sharedPushing){ if(opts.cb) opts.cb(false); return; }
    sharedPulling=true;
    fetch(base+"/rest/v1/shared_state?id=eq.plant&select=doc,version,updated_by,updated_at",{
      headers:{ "apikey":key, "Authorization":"Bearer "+key }
    }).then(function(r){ return r.ok?r.json():[]; }).then(function(rows){
      sharedPulling=false;
      var row=rows&&rows[0]; if(!row){ if(opts.cb) opts.cb(false); return; }
      var rv=+row.version||0, lv=+state.sharedVersion||0;
      if(rv>lv && row.doc && Object.keys(row.doc).length){
        applyShared(row.doc);
        state.sharedVersion=rv; state.lastSharedBy=row.updated_by||""; state.lastSharedAt=row.updated_at||"";
        store.write(JSON.stringify(state));
        if(!sheetIsOpen() && active!=="settings") render();
        if(opts.cb) opts.cb(true); return;
      }
      if(opts.cb) opts.cb(false);
    }).catch(function(){ sharedPulling=false; if(opts.cb) opts.cb(false); });
  }
  function scheduleSharedPush(){ if(syncTarget()!=="supabase"||sharedApplying) return; if(sharedPushTimer) clearTimeout(sharedPushTimer); sharedPushTimer=setTimeout(pushShared, 2500); }
  function pushShared(){
    if(syncTarget()!=="supabase" || sharedApplying) return;
    var base=sharedBase(), key=sharedKey(); if(!base||!key) return;
    if(sharedPushing) return; sharedPushing=true;
    var doc=buildSharedDoc(); if(!doc){ sharedPushing=false; return; }
    fetch(base+"/rest/v1/shared_state?id=eq.plant&select=version",{
      headers:{ "apikey":key, "Authorization":"Bearer "+key }
    }).then(function(r){ return r.ok?r.json():[]; }).then(function(rows){
      var rv=(rows&&rows[0])?(+rows[0].version||0):0;
      var newV=Math.max(rv, +state.sharedVersion||0)+1;
      var dev=(state.settings.device||"Tablet"), iso=new Date().toISOString();
      return fetch(base+"/rest/v1/shared_state?on_conflict=id",{ method:"POST",
        headers:{ "apikey":key, "Authorization":"Bearer "+key, "Content-Type":"application/json", "Prefer":"resolution=merge-duplicates,return=minimal" },
        body:JSON.stringify([{ id:"plant", doc:doc, version:newV, updated_by:dev, updated_at:iso }]) })
        .then(function(res){ if(res.ok){ state.sharedVersion=newV; state.lastSharedBy=dev; state.lastSharedAt=iso; store.write(JSON.stringify(state)); } });
    }).then(function(){ sharedPushing=false; }).catch(function(){ sharedPushing=false; });
  }
  /* QC results sync as individual records, merged by id — so a hold can't be lost
     to a concurrent save (QC and a supervisor may be active at the same time). */
  function pullQuality(){
    if(syncTarget()!=="supabase") return;
    var base=sharedBase(), key=sharedKey(); if(!base||!key) return;
    fetch(base+"/rest/v1/quality_tests?select=*",{ headers:{ "apikey":key, "Authorization":"Bearer "+key } })
      .then(function(r){ return r.ok?r.json():[]; }).then(function(rows){
        if(!rows||!rows.length) return;
        if(!state.qualityTests) state.qualityTests=[];
        var have={}; state.qualityTests.forEach(function(q){ have[q.id]=1; });
        var changed=false;
        rows.forEach(function(row){
          if(have[row.id]) return;
          state.qualityTests.push({ id:row.id, device:row.device||"", ts:row.ts?+new Date(row.ts):Date.now(),
            kind:row.kind, batchNo:row.batch_no, quality:row.quality||"", shiftDate:row.shift_date, shift:row.shift,
            params:row.params||[], verdict:row.verdict, tester:row.tester||"", notes:row.notes||"",
            attachmentUrl:row.attachment_url||"", attachmentName:row.attachment_name||"", synced:true });
          changed=true;
        });
        if(changed){ store.write(JSON.stringify(state)); if(!sheetIsOpen() && active!=="settings") render(); }
      }).catch(function(){});
  }
  /* QC lab-report photo/PDF upload to Supabase Storage. Files never go into the shared
     state snapshot; only the resulting public URL does. Offline files queue separately. */
  function qcQueueGet(){ try{ return JSON.parse(localStorage.getItem("qcUploadQueue")||"[]"); }catch(e){ return []; } }
  function qcQueueSet(a){ try{ localStorage.setItem("qcUploadQueue", JSON.stringify(a)); return true; }catch(e){ return false; } }
  function qcEnqueueUpload(testId, name, dataUrl){ var q=qcQueueGet(); q.push({ testId:testId, name:name, dataUrl:dataUrl, ts:Date.now() }); return qcQueueSet(q); }
  function uploadToBucket(bucket, id, name, dataUrl){
    var base=sharedBase(), key=sharedKey();
    var safe=(name||"photo").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-60);
    var path=encodeURIComponent(id)+"/"+Date.now()+"_"+Math.random().toString(36).slice(2,7)+"_"+safe;
    return fetch(dataUrl).then(function(r){ return r.blob(); }).then(function(blob){
      return fetch(base+"/storage/v1/object/"+bucket+"/"+path,{ method:"POST",
        headers:{ "apikey":key, "Authorization":"Bearer "+key, "Content-Type":blob.type||"application/octet-stream", "x-upsert":"true" },
        body:blob }).then(function(res){
          if(!res.ok) return res.text().then(function(t){ throw new Error("HTTP "+res.status+" "+(t||"").slice(0,120)); });
          return base+"/storage/v1/object/public/"+bucket+"/"+path;
        });
    });
  }
  function uploadDataUrl(testId, name, dataUrl){ return uploadToBucket("qc-reports", testId, name, dataUrl); }
  var qcFlushing=false;
  function flushQcUploads(){
    if(qcFlushing) return;
    if(syncTarget()!=="supabase") return;
    if(typeof navigator!=="undefined" && navigator.onLine===false) return;
    var q=qcQueueGet(); if(!q.length) return;
    qcFlushing=true; var item=q[0];
    uploadDataUrl(item.testId, item.name, item.dataUrl).then(function(url){
      var rec=null; (state.qualityTests||[]).forEach(function(t){ if(t.id===item.testId) rec=t; });
      if(rec){ rec.attachmentUrl=url; rec.attachmentName=item.name; rec.attachmentPending=false; rec.synced=false; }
      var q2=qcQueueGet(); q2.shift(); qcQueueSet(q2);
      qcFlushing=false; save(); if(!sheetIsOpen() && active!=="settings") render();
      if(qcQueueGet().length) setTimeout(flushQcUploads, 800);
    }).catch(function(){ qcFlushing=false; /* keep in queue, retry on next trigger */ });
  }

  function syncSheet(opts){
    opts=opts||{}; var quiet=!!opts.auto;
    var url=(state.settings.syncUrl||"").trim();
    if(!url){ if(!quiet) toast("Add a sync URL in Settings first","warn"); return; }
    var pending=unsynced(), pendD=unsyncedDispatches();
    if(!pending.length && !pendD.length){ if(!quiet) toast("Nothing new to sync","ok"); return; }
    if(syncing) return; syncing=true; if(!quiet) render();
    var ids=pending.map(function(x){return x.id;});
    var dids=pendD.map(function(x){return x.id;});
    // Google Apps Script writes the data on the POST, then redirects to deliver the reply.
    // That reply is blocked cross-origin, so we send no-cors (write-only) and mark synced on delivery.
    // The endpoint upserts by id, so a re-send (Settings → Re-send all) is always safe.
    fetch(url,{ method:"POST", mode:"no-cors", headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({ device:state.settings.device||"", rows:pending, dispatches:pendD }) })
    .then(function(){
      var set={}; ids.forEach(function(id){ set[id]=1; }); state.runs.forEach(function(x){ if(set[x.id]) x.synced=true; });
      var dset={}; dids.forEach(function(id){ dset[id]=1; }); (state.dispatches||[]).forEach(function(x){ if(dset[x.id]) x.synced=true; });
      state.lastSyncAt=Date.now();
      var n=ids.length+dids.length;
      syncing=false; store.write(JSON.stringify(state));
      var sheetOpen=document.getElementById("sheet") && document.getElementById("sheet").classList.contains("show");
      if(!quiet){ render(); toast("Sent "+n+" record"+(n>1?"s":"")+" to the sheet","ok"); }
    })
    .catch(function(e){ syncing=false; if(!quiet){ render(); toast(syncErr(e),"err"); } });
  }

  function exportCSV(){
    var cols=["id","device","machine","autoclaveId","shift","shiftDate","batchNo","capacity","formulation","quality","start","end","runtimeMin","hoursRun","passes","kWh","firewoodKg","workers","weightKg","synced"];
    var lines=[cols.join(",")];
    state.runs.forEach(function(r){
      lines.push(cols.map(function(c){
        var v=r[c]; if((c==="start"||c==="end")&&r[c]!==""&&r[c]!=null) v=new Date(r[c]).toISOString();
        v=v==null?"":String(v); if(/[",\n]/.test(v)) v='"'+v.replace(/"/g,'""')+'"'; return v;
      }).join(","));
    });
    var blob=new Blob([lines.join("\n")],{type:"text/csv"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="special-line-"+new Date().toISOString().slice(0,10)+".csv"; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },1000);
  }

  /* ===================== views ===================== */
  var active="machines";
  var lastTab=null;
  var histFilter={ date:"all", shift:"all", batch:"all" };
  var TABS=[
    {id:"machines",label:"Machines",icon:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'},
    {id:"batches",label:"Batches",icon:'<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 17l9 5 9-5"/><path d="M3 12l9 5 9-5"/>'},
    {id:"weigh",label:"Weigh",icon:'<path d="M12 3v3"/><path d="M5 6h14"/><path d="M5 6 2 14a4 4 0 0 0 6 0L5 6Z"/><path d="M19 6l-3 8a4 4 0 0 0 6 0l-3-8Z"/><path d="M9 20h6"/><path d="M12 6v14"/>'},
    {id:"packing",label:"Packing",icon:'<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'},
    {id:"dispatch",label:"Dispatch",icon:'<path d="M1 3h13v10H1z"/><path d="M14 7h4l3 3v3h-7z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'},
    {id:"quality",label:"Quality",icon:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'},
    {id:"history",label:"History",icon:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>'},
    {id:"bearing",label:"Bearing",icon:'<path d="M12 14.5V6"/><circle cx="12" cy="17.5" r="3.4"/><path d="M9 6a3 3 0 0 1 6 0"/>'}
  ];

  function allowedTabs(){
    var role=state.settings.role;
    if(role==="qc") return TABS.filter(function(t){ return t.id==="quality"; });
    if(role==="supervisor") return TABS.filter(function(t){ return !(t.id==="reports"||t.id==="dispatch"||t.id==="quality"); });
    return TABS; // manager (default): everything
  }
  function renderTabs(){
    var pw=pendingWeigh().length, pp=pendingPack().length, pq=pendingQC(), pb=dueMachines().length;
    document.getElementById("tabs").innerHTML=allowedTabs().map(function(t){
      var n=(t.id==="weigh")?pw:(t.id==="packing"?pp:(t.id==="quality"?pq:(t.id==="bearing"?pb:0)));
      var badge=(n>0)?'<i class="tabbadge">'+n+'</i>':'';
      return '<button data-tab="'+t.id+'" class="'+(active===t.id?"active":"")+'">'+badge+
        '<svg viewBox="0 0 24 24">'+t.icon+'</svg><span>'+t.label+'</span></button>';
    }).join("");
  }

  function viewMachines(){
    var groups=[];
    MACHINES.filter(function(m){ return m.enabled!==false; }).forEach(function(m){
      var g=groups[groups.length-1];
      if(!g || g.name!==m.group){ g={name:m.group, items:[]}; groups.push(g); }
      g.items.push(m);
    });
    var body=groups.map(function(g){
      var run=g.items.filter(function(m){ return state.machines[m.id].running; }).length;
      var hdr='<div class="msec"><b>'+esc(g.name)+'</b><div class="ln"></div>'+(run?'<span class="ct">'+run+' running</span>':'')+'</div>';
      return hdr+'<div class="mlist">'+g.items.map(machineCard).join("")+'</div>';
    }).join("");
    var due=dueMachines();
    var dueBar = due.length ? '<div class="duebar" data-bearings-any="1">🌡 '+due.length+' machine'+(due.length>1?'s':'')+' due for bearing temp logging — '+due.map(function(m){return esc(m.short);}).join(", ")+' · tap to log</div>' : '';
    var c=curShift();
    var sup = c.supervisor ? ('👤 '+esc(c.supervisor)) : '<span style="color:var(--amber)">👤 set supervisor</span>';
    return '<div class="view-head"><h1>Machines</h1><div class="meta"><span class="shiftchip" data-shift="1">'+sup+' <span style="opacity:.6">▾</span></span></div></div>'+dueBar+body;
  }
  function lastRunFor(mid){
    var last=null;
    for(var i=state.runs.length-1;i>=0;i--){ if(state.runs[i].machineId===mid){ last=state.runs[i]; break; } }
    return last;
  }
  function lastCoarseFor(mid){ for(var i=state.runs.length-1;i>=0;i--){ if(state.runs[i].line==="coarse"&&state.runs[i].machineId===mid) return state.runs[i]; } return null; }
  function machineCard(m){
    var st=state.machines[m.id], run=st.running, on=!!run, down=!!st.down;
    var isShiftKind = m.kind==="coarse"||m.kind==="grind";
    var sub = m.sub ? m.sub : (m.kind==="autoclave" ? (m.capacity+" kg") : "");
    var paused = on && !!run.paused;
    var pillTxt = down ? "DOWN" : (on ? (paused?"Paused":"Running") : "Idle");
    var pillCls = down ? "down" : (on ? (paused?"paused":"run") : "");
    var wrench = down ? '' : '<button class="wbtn" data-breakdown="'+m.id+'" aria-label="Report breakdown"><svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2 2.5-2.5Z"/></svg></button>';
    var bspec=bearingSpec(m), bdue=bspec?bearingDue(m):false;
    var thermo = bspec ? '<button class="tbtn'+(bdue?' due':'')+'" data-bearings="'+m.id+'" aria-label="Bearing temperatures"><svg viewBox="0 0 24 24"><path d="M12 14.8V6"/><circle cx="12" cy="17.5" r="3.2"/></svg></button>' : '';
    var scale = (on && !paused && run.shiftwise && m.outWeight && (m.kind==="grind"||m.kind==="coarse")) ? '<button class="tbtn" data-liveweigh="'+m.id+'" aria-label="Add weight" style="color:var(--steel)"><svg viewBox="0 0 24 24"><path d="M12 3v3M5 7h14M5 7 2 15a4 4 0 0 0 6 0L5 7Zm14 0-3 8a4 4 0 0 0 6 0l-3-8ZM9 21h6M12 6v15"/></svg></button>' : '';
    var head='<div class="mtop"><span class="led"></span><div class="mname"><b>'+esc(m.name)+'</b>'+
      (sub?'<small>'+esc(sub)+'</small>':'')+
      '</div>'+scale+thermo+wrench+'<span class="pill '+pillCls+'">'+pillTxt+'</span></div>';
    var body;
    if(down){
      body='<div class="mbody"><div class="runline"><div class="what"><span class="qchip" style="background:var(--err);color:#fff">Breakdown</span>'+
        '<span class="formchip">since '+fmtClock(st.down.since)+'</span></div>'+
        '<span class="timer js-timer" data-start="'+st.down.since+'" data-paused="0">'+fmtElapsed(Date.now()-st.down.since)+'</span></div>'+
        '<button class="pausebtn" style="border-color:#5a2c1d;color:var(--err)">🛠&nbsp; Log repair</button></div>';
    } else if(on){
      var elapsed=elapsedOf(run), eff=Date.now()-elapsed;
      var what;
      if(run.shiftwise){
        what='<span class="qchip shift" style="background:'+(run.line==="grind"?"var(--steel)":"var(--ember)")+';'+(run.line==="grind"?"color:#0e1a08":"")+'">'+esc(run.shift)+'</span>'+
          (run.batchNo?'<span class="batchref">'+esc(run.batchNo)+'</span>':'')+
          '<span class="formchip">'+esc(fmtDay(run.shiftDate))+'</span>'+
          (run.formulation?'<span class="formchip">'+esc(run.formulation)+'</span>':'')+
          (run.tyreType?'<span class="formchip" style="color:var(--steel)">'+esc(TYRES[run.tyreType].label)+' · '+esc(TYRES[run.tyreType].mesh)+'</span>':'');
      } else {
        var b=batch(run.batchId);
        what='<span class="batchref">'+esc(b?b.no:"?")+'</span>'+
          '<span class="formchip">'+esc(b?b.formulation:"")+'</span>'+(run.quality?qchip(run.quality):'');
      }
      var runTimer=(m.kind==="autoclave")?'<span class="timer js-timer'+(paused?' paused':'')+'" data-start="'+eff+'" data-paused="'+(paused?1:0)+'">'+fmtElapsed(elapsed)+'</span>':'';
      body='<div class="mbody"><div class="runline"><div class="what">'+what+
        '</div>'+runTimer+
        '</div>'+
        '<button class="pausebtn'+(paused?' paused':'')+'" data-pause="'+m.id+'">'+(paused?'▶&nbsp; Resume run':'❚❚&nbsp; Pause run')+'</button>'+
        '</div>';
    } else {
      var last=lastRunFor(m.id), lr;
      if(last && last.shiftwise) lr='last '+esc(last.shift)+' '+esc(fmtDay(last.shiftDate))+(last.tyreType?' · '+esc(TYRES[last.tyreType].mesh):'');
      else if(last) lr='last '+esc(last.batchNo)+(last.quality?" · "+esc(last.quality):"")+" · "+fmtClock(last.end);
      else lr = isShiftKind ? 'no shifts yet' : 'no runs yet';
      var label=m.kind==="autoclave"?"Load":"Start";
      body='<div class="mbody"><div class="idleline"><span>'+lr+'</span>'+
        '<span class="cta" style="--accent:'+m.accent+'">'+label+' ▸</span></div></div>';
    }
    return '<div class="mcard '+(on?"on":"")+(paused?" paused":"")+(down?" down":"")+'" role="button" tabindex="0" style="--accent:'+m.accent+'" data-machine="'+m.id+'">'+head+body+'</div>';
  }

  /* ----- breakdown & maintenance ----- */
  function markDown(mid){ var st=state.machines[mid]; if(!st||st.down) return;
    openSheet('<div class="sheet-h"><span class="led" style="background:var(--err)"></span><b>Report breakdown — '+esc(M(mid).name)+'?</b></div>'+
      '<div class="sheet-sub">The machine will be flagged DOWN in red and can\'t be started until you log the repair. Down-time is counted from the time below.</div>'+
      '<div class="field"><label>Breakdown time <span class="muted" style="text-transform:none;letter-spacing:0">— leave blank for now</span></label><input id="bd-time" type="time"></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" data-breakdown-go="'+mid+'" style="background:var(--err)">Mark down</button></div>'); }
  function doMarkDown(mid){ var st=state.machines[mid]; if(!st) return;
    var pausedNow=false;
    if(st.running && !st.running.paused){ st.running.accumMs=(st.running.accumMs||0)+(Date.now()-(st.running.segStart||Date.now())); st.running.paused=true; pausedNow=true; }
    var sinceMs=Date.now();
    var bt=(sheet.querySelector("#bd-time")||{}).value||"";
    if(bt){ var ms=Date.parse(todayISO()+"T"+bt); if(!isNaN(ms)){ if(ms>Date.now()) ms-=86400000; sinceMs=ms; } }
    st.down={ since:sinceMs, pausedRun:pausedNow }; save(); closeSheet(); render(); toast(M(mid).short+" marked DOWN","warn"); postStatus(mid,"paused"); }
  function openRepairSheet(mid){ var st=state.machines[mid]; if(!st||!st.down) return; var since=st.down.since;
    openSheet('<div class="sheet-h"><span class="led" style="background:var(--err)"></span><b>Log repair — '+esc(M(mid).name)+'</b></div>'+
      '<div class="sheet-sub">Down for '+fmtElapsed(Date.now()-since)+' (since '+fmtClock(since)+'). Complete the maintenance log to bring it back online.</div>'+
      '<div class="field"><label>1 · Root cause of the breakdown</label><textarea id="mt-cause" rows="2" placeholder="What actually caused it?"></textarea></div>'+
      '<div class="field"><label>2 · How was the issue resolved?</label><textarea id="mt-fix" rows="2" placeholder="What was done to fix it?"></textarea></div>'+
      '<div class="field"><label>3 · Steps so it never persists</label><textarea id="mt-prev" rows="2" placeholder="Preventive action / checks added"></textarea></div>'+
      '<div class="field"><label>Back online time <span class="muted" style="text-transform:none;letter-spacing:0">— leave blank for now</span></label><input id="mt-time" type="time"></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="mt-go">Mark repaired</button></div>'+
      '<button class="btn danger block" id="bd-cancel" style="margin-top:10px">Cancel this breakdown (entered by mistake)</button>');
    sheet.querySelector("#mt-go").addEventListener("click",function(){ commitMaintenance(mid,{
      cause:(sheet.querySelector("#mt-cause").value||"").trim(),
      fix:(sheet.querySelector("#mt-fix").value||"").trim(),
      prev:(sheet.querySelector("#mt-prev").value||"").trim(),
      backAt:(sheet.querySelector("#mt-time")||{}).value||"" }); });
    var bdc=sheet.querySelector("#bd-cancel");
    if(bdc) bdc.addEventListener("click",function(){ openCancelDownSheet(mid); });
  }
  function cancelDown(mid){
    var st=state.machines[mid]; if(!st||!st.down){ closeSheet(); return; }
    var resume = st.down.pausedRun && st.running && st.running.paused;
    st.down=null;
    if(resume){ st.running.paused=false; st.running.segStart=Date.now(); }
    save(); closeSheet(); render();
    toast(M(mid).short+" breakdown cancelled — nothing logged","ok");
    postStatus(mid, st.running?(st.running.paused?"paused":"running"):"idle");
  }
  function openCancelDownSheet(mid){
    var st=state.machines[mid]; if(!st||!st.down){ closeSheet(); return; }
    var resumeNote=(st.down.pausedRun && st.running)?'<div class="hint" style="margin-top:8px">The run that was paused for this breakdown will resume.</div>':'';
    openSheet('<div class="sheet-h"><b>Cancel this breakdown?</b></div>'+
      '<div class="sheet-sub"><span class="batchref">'+esc(M(mid).name)+'</span> · marked down '+fmtClock(st.down.since)+'</div>'+
      '<div class="hint">Removes the DOWN flag. Nothing is logged or sent — use only if it was reported by mistake.</div>'+
      resumeNote+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Keep down</button>'+
      '<button class="btn danger" id="cd-go">Yes, cancel breakdown</button></div>');
    sheet.querySelector("#cd-go").addEventListener("click",function(){ cancelDown(mid); });
  }
  function commitMaintenance(mid,f){ var st=state.machines[mid]; if(!st||!st.down) return;
    if(!f.cause||!f.fix||!f.prev){ toast("Fill in all three questions","warn"); return; }
    var since=st.down.since, end=Date.now();
    if(f.backAt){ var ms=Date.parse(todayISO()+"T"+f.backAt); if(!isNaN(ms)){ if(ms<since) ms+=86400000; end=ms; } }
    state.maintenance=state.maintenance||[];
    state.maintenance.push({ id:uid(), device:state.settings.device||"", machineId:mid, machine:M(mid).name,
      downStart:since, repairedAt:end, downtimeMin:Math.round((end-since)/60000*10)/10,
      rootCause:f.cause, resolution:f.fix, prevention:f.prev, synced:false });
    st.down=null; save(); closeSheet(); render();
    toast(M(mid).short+" back online · logged","ok"); postStatus(mid, st.running?(st.running.paused?"paused":"running"):"idle"); }

  /* ----- shift context & report ----- */
  function openShiftPicker(){ var c=curShift();
    openSheet('<div class="sheet-h"><b>Supervisor in charge</b></div>'+
      '<div class="sheet-sub">Pick who is on duty — it is tagged on everything logged. The date for each entry is chosen on that entry\u2019s own screen.</div>'+
      '<div class="field"><label>Supervisor</label><select id="sh-sup">'+
        '<option value="">— select —</option>'+
        SUPERVISORS.map(function(n){ return '<option value="'+esc(n)+'"'+(c.supervisor===n?' selected':'')+'>'+esc(n)+'</option>'; }).join("")+
        ((c.supervisor && SUPERVISORS.indexOf(c.supervisor)<0)?'<option value="'+esc(c.supervisor)+'" selected>'+esc(c.supervisor)+'</option>':'')+
      '</select></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" id="sh-done">Save</button></div>');
    sheet.querySelector("#sh-done").addEventListener("click",function(){
      var sup=(sheet.querySelector("#sh-sup").value||"").trim();
      setSupervisor(sup); closeSheet(); toast(sup?("Supervisor · "+sup):"Supervisor cleared","ok"); }); }


  function fmtAgo(ms){ var s=Math.round((Date.now()-ms)/1000); if(s<60) return s+"s ago"; var mn=Math.round(s/60); if(mn<60) return mn+"m ago"; var h=Math.floor(mn/60); var rem=mn%60; return h+"h"+(rem?" "+rem+"m":"")+" ago"; }
  function openBearingSheet(mid){
    var m=M(mid), spec=bearingSpec(m); if(!spec) return;
    var label=spec.type==="bush"?"Bush":"Bearing", last=lastBearingLog(mid), c=curShift();
    function lastTempFor(pos){ var best=null; (state.bearingLogs||[]).forEach(function(x){ if(x.machineId===mid&&x.position===pos){ if(!best||+new Date(x.ts)>+new Date(best.ts)) best=x; } }); return best; }
    var rows=spec.positions.map(function(pos,i){
      var lt=lastTempFor(pos);
      return '<div class="field"><label>'+label+' '+esc(pos)+(lt?' <span class="muted" style="text-transform:none;letter-spacing:0">— last '+lt.tempC+'°C, '+fmtAgo(+new Date(lt.ts))+'</span>':'')+'</label>'+
        '<div class="num-suffix"><input id="bt-'+i+'" type="number" inputmode="decimal" placeholder="temperature"><span class="sfx">°C</span></div></div>';
    }).join("");
    var supOpts=SUPERVISORS.map(function(s){ return '<option value="'+esc(s)+'"'+((c.supervisor||"")===s?' selected':'')+'>'+esc(s)+'</option>'; }).join("");
    var dueNote = bearingDue(m) ? '<div class="hint" style="color:var(--amber);margin-top:-2px">⚠ Overdue — log now, or set the actual reading time below if it was taken earlier.</div>' : '';
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#9fe0ea,var(--elec))"></span><b>'+label+' temps — '+esc(m.name)+'</b></div>'+
      '<div class="sheet-sub">'+spec.positions.length+' '+label.toLowerCase()+(spec.positions.length>1?'s':'')+' · log every '+spec.intervalH+'\u00a0hour'+(spec.intervalH>1?'s':'')+' while running'+(last!=null?' · last '+fmtAgo(last):' · not logged yet')+'.</div>'+
      dueNote+rows+
      '<div class="field-inline">'+
        '<div class="field"><label>Supervisor</label><select id="bt-sup"><option value="">—</option>'+supOpts+'</select></div>'+
        '<div class="field"><label>Date</label><input id="bt-date" type="date" value=""></div></div>'+
      '<div class="field"><label>Reading time <span class="muted" style="text-transform:none;letter-spacing:0">— blank = now</span></label><input id="bt-time" type="time"></div>'+
      '<div class="formwarn" id="bt-warn"></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="bt-go">Log temperatures</button></div>');
    function btValidate(){
      var go=sheet.querySelector("#bt-go"), warn=sheet.querySelector("#bt-warn"), bad=[], any=false;
      spec.positions.forEach(function(pos,i){
        var raw=(sheet.querySelector("#bt-"+i).value||"").trim(); if(raw==="") return;
        any=true; var v=num(sheet.querySelector("#bt-"+i).value);
        if(v==null || v<=0) bad.push(pos);
      });
      if(bad.length){ warn.innerHTML="<b>Temperature:</b> "+label.toLowerCase()+" "+bad.join(", ")+" must be greater than zero."; warn.classList.add("show"); go.disabled=true; go.classList.add("is-off"); return false; }
      warn.classList.remove("show"); go.disabled=false; go.classList.remove("is-off"); return any;
    }
    spec.positions.forEach(function(pos,i){ var el=sheet.querySelector("#bt-"+i); if(el) el.addEventListener("input",btValidate); });
    sheet.querySelector("#bt-go").addEventListener("click",function(){
      if(!btValidate()){ toast("Enter a valid temperature above zero","warn"); return; }
      var temps=spec.positions.map(function(pos,i){ return { pos:pos, v:num(sheet.querySelector("#bt-"+i).value) }; });
      var sup=sheet.querySelector("#bt-sup").value||"";
      var dv=(sheet.querySelector("#bt-date")||{}).value||""; if(!dv){ toast("Pick a date","warn"); return; }
      var tv=(sheet.querySelector("#bt-time")||{}).value||"";
      var recordedAt;
      if(tv){ var ms=Date.parse(dv+"T"+tv); recordedAt=isNaN(ms)?Date.now():ms; }
      else { recordedAt = (dv===todayISO()) ? Date.now() : (Date.parse(dv+"T12:00")||Date.now()); }
      commitBearings(mid, temps, sup, recordedAt, dv);
    });
  }
  function commitBearings(mid, temps, supervisor, recordedAt, shiftDate){
    if(!temps.some(function(t){ return t.v!=null; })){ toast("Enter at least one temperature","warn"); return; }
    var m=M(mid), spec=bearingSpec(m), c=curShift();
    var rec=(recordedAt!=null?recordedAt:Date.now());
    var ts=new Date(rec).toISOString();          // ts drives the schedule, so it reflects the ACTUAL reading time
    var sup=(supervisor!=null&&supervisor!=="")?supervisor:(c.supervisor||"");
    var sd=shiftDate||todayISO();
    var sh=(new Date(rec).getHours()>=6 && new Date(rec).getHours()<18)?"Day":"Night";
    state.bearingLogs=state.bearingLogs||[];
    temps.forEach(function(t){ if(t.v==null) return;
      state.bearingLogs.push({ id:uid(), device:state.settings.device||"", machineId:mid, machine:m.name,
        position:t.pos, bearingType:spec.type, tempC:t.v, ts:ts, recordedAt:rec, loggedAt:Date.now(),
        shiftDate:sd, shift:sh, supervisor:sup, synced:false }); });
    save(); closeSheet(); render(); toast(m.short+" "+spec.type+" temps logged","ok");
  }

  function viewBatches(){
    var act=activeBatches();
    if(!act.length) return '<div class="view-head"><h1>Batches</h1></div>'+
      empty('<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="M3 17l9 5 9-5"/><path d="M3 12l9 5 9-5"/>',
        "No active batches","Load the autoclave on the Machines tab to start one. Finished batches drop off here automatically.");
    var done=state.batches.length-act.length;
    var cards=act.slice().reverse().map(batchCard).join("");
    var meta=act.length+' active'+(done?' · '+done+' done':'');
    return '<div class="view-head"><h1>Batches</h1><div class="meta">'+meta+'</div></div><div class="stack">'+cards+'</div>';
  }
  function batchCard(b){
    var rows=state.runs.filter(function(r){ return r.batchId===b.id; });
    function has(mid,q){ return rows.some(function(r){ return r.machineId===mid && r.quality===q; }); }
    function r3(q){ return has("R3",q)||has("R1",q); }
    function weighed(q){ return rows.some(function(r){ return (r.machineId==="R4"||r.needsWeigh)&&!r.shiftwise&&r.quality===q&&r.weightKg!==""&&r.weightKg!=null; }); }
    var taken=b.qualities||[];
    function isTaken(q){ return taken.indexOf(q)>-1; }
    var grid='<div class="qgrid"><div class="hdr" style="text-align:left">Taken?</div><div class="hdr">R3/R1</div><div class="hdr">R4</div><div class="hdr">Weighed</div>';
    QUALITIES.forEach(function(q){
      var tk=isTaken(q);
      grid+='<div class="qlabel qtake '+(tk?"on":"off")+'" data-qtake="'+b.id+'|'+q+'"><span class="qbox">'+(tk?"✓":"")+'</span><span class="qdot q-'+q+'" style="background:var(--q-'+q.toLowerCase()+')"></span>'+q+'</div>';
      grid+='<div class="stagedot '+(tk&&r3(q)?"done":"")+'">'+(r3(q)?"✓":"·")+'</div>';
      grid+='<div class="stagedot '+(tk&&has("R4",q)?"done":"")+'">'+(has("R4",q)?"✓":"·")+'</div>';
      grid+='<div class="stagedot '+(tk&&weighed(q)?"weighed":"")+'">'+(weighed(q)?"✓":"·")+'</div>';
    });
    grid+='</div>';
    function ranShorts(kind){ var seen={},out=[]; rows.forEach(function(r){ var mm=M(r.machineId); if(mm&&mm.kind===kind&&!seen[mm.id]){ seen[mm.id]=1; out.push(mm.short); } }); return out; }
    var pre=ranShorts("prerefiner");
    var nTaken=taken.length, nW=0; taken.forEach(function(q){ if(weighed(q)) nW++; });
    var inAC=MACHINES.some(function(mm){ return mm.kind==="autoclave" && state.machines[mm.id].running && state.machines[mm.id].running.batchId===b.id; });
    var state2 = nTaken ? '<span class="bstate '+(nW>=nTaken?"ready":"cook")+'">'+nW+'/'+nTaken+' weighed</span>'
      : (b.autoclaveDone ? '<span class="bstate cook">mark qualities</span>'
        : (inAC ? '<span class="bstate cook">In autoclave</span>' : '<span class="bstate cook">Loaded</span>'));
    var srcChip=b.autoclaveId?'<span class="formchip" style="color:var(--ember)">'+esc(shortName(b.autoclaveId))+'</span>':'';
    var preChip=pre.length?'<span class="formchip" style="color:var(--elec)">'+esc(pre.join(" · "))+'</span>':'';
    var hint='<div class="bhint">Tap a quality to mark it taken. Weigh each marked quality, then press Close batch to file it away. <button data-batchinfo="'+b.id+'" style="background:none;border:none;color:var(--steel);cursor:pointer;padding:0;font:inherit;text-decoration:underline">View full detail ›</button></div>';
    var ready=allTakenWeighed(b);
    if(batchOrphaned(b)){
      var delBtn='<button class="btn danger bclose" data-delbatch="'+b.id+'">⌫ Delete batch — no autoclave entry</button>';
      return '<div class="bcard"><div class="bhead"><div class="l"><span class="batchref" style="font-size:16px">'+esc(b.no)+'</span>'+
        srcChip+'<span class="formchip">'+esc(b.formulation)+'</span>'+preChip+'</div>'+state2+'</div>'+
        '<div class="bhint" style="color:var(--amber)">The autoclave entry for this batch was deleted, so it is stranded here. You can remove it.</div>'+delBtn+'</div>';
    }
    var closeBtn='<button class="btn '+(ready?"primary":"ghost")+' bclose" data-closebatch="'+b.id+'">'+
      (ready?"Close batch ▸":(nTaken?(nW+"/"+nTaken+" weighed"):"Mark qualities to close"))+'</button>';
    return '<div class="bcard"><div class="bhead"><div class="l"><span class="batchref" style="font-size:16px">'+esc(b.no)+'</span>'+
      srcChip+'<span class="formchip">'+esc(b.formulation)+'</span>'+preChip+'</div>'+state2+'</div>'+grid+hint+closeBtn+'</div>';
  }

  function viewWeigh(){
    var p=pendingWeigh();
    if(!p.length) return '<div class="view-head"><h1>Weigh</h1></div>'+
      empty('<path d="M12 3v3"/><path d="M5 6h14"/><path d="M5 6 2 14a4 4 0 0 0 6 0L5 6Z"/><path d="M19 6l-3 8a4 4 0 0 0 6 0l-3-8Z"/><path d="M9 20h6"/><path d="M12 6v14"/>',
        "Nothing to weigh","Finish R4 (special), a coarse R2 shift, or a grinder shift and it lands here.");
    var cards=p.slice().reverse().map(function(r){
      var draft=sum(r.weighEntries), n=(r.weighEntries||[]).length, sw=!!r.shiftwise, grind=r.line==="grind";
      var chipBg = grind?"var(--steel);color:#0e1a08":"var(--ember)";
      var head = sw
        ? '<span class="batchref">'+esc(r.short)+'</span><span class="qchip shift" style="background:'+chipBg+'">'+esc(r.shift)+'</span>'+(r.tyreType?'<span class="formchip" style="color:var(--steel)">'+esc(TYRES[r.tyreType].mesh)+'</span>':'')
        : '<span class="batchref">'+esc(r.batchNo)+'</span>'+qchip(r.quality);
      var label = sw ? ((grind?'Grinder output · ':'Coarse · ')+esc(fmtDay(r.shiftDate))) : (esc(r.formulation)+' · R4 '+fmtClock(r.end));
      var prog = (n>0 ? '<small style="color:var(--elec)">'+draft+' kg so far · '+n+' weighing'+(n>1?'s':'')+'</small>'
               : '<small>'+label+'</small>');
      return '<div class="wcard"><div class="info"><div class="row1">'+head+'</div>'+prog+'</div>'+
        '<button class="btn primary" data-weigh="'+r.id+'">'+(n>0?'Resume ▸':'Weigh ▸')+'</button></div>';
    }).join("");
    return '<div class="view-head"><h1>Weigh</h1><div class="meta">'+p.length+' pending</div></div><div class="stack">'+cards+'</div>';
  }

  /* ===================== dispatch ===================== */
  var SACK_KG=50;
  function customer(code){ var cs=state.settings.customers||[]; for(var i=0;i<cs.length;i++) if(cs[i].code===code) return cs[i]; return null; }
  function weighedRuns(){ return state.runs.filter(function(r){
    var hasW = r.weightKg!==""&&r.weightKg!=null && parseFloat(r.weightKg)>0;
    if(!hasW) return false;
    if(!r.shiftwise && r.quality && (r.machineId==="R4" || r.needsWeigh)) return true;   // production refiner output (R4 or R2 on special line)
    if(r.line==="coarse" && r.shiftwise) return true;         // coarse line shift output packs too
    return false;
  }); }
  function gradeOf(r){ return r.quality || (r.line==="coarse" ? "Coarse" : ""); }
  function packRef(r){ var b=batch(r.batchId); if(b) return b.no; if(r.line==="coarse") return fmtDay(r.shiftDate); return "—"; }
  function packSubtitle(r){ var b=batch(r.batchId); if(b) return b.formulation||""; if(r.line==="coarse") return (r.shift||"")+"-Shift"; return ""; }
  function packedSacksOf(r){ return parseFloat(r.packedSacks)||0; }
  function packedKgOf(r){ return packedSacksOf(r)*SACK_KG; }
  function leftoutBal(q){ return Math.round((((state.leftout&&state.leftout[q])||0))*100)/100; }
  function carriedIn(r){ return r.leftoutIn!=null ? (parseFloat(r.leftoutIn)||0) : leftoutBal(gradeOf(r)); }   // prospective until finalised
  function packTotalOf(r){ return Math.round(((parseFloat(r.weightKg)||0)+carriedIn(r))*100)/100; }
  function fullyPacked(r){ if(r.packedSacks==null) return false; return (packTotalOf(r) - packedKgOf(r)) < SACK_KG; }
  function sacksNeeded(r){ return Math.max(0, Math.floor(packTotalOf(r)/SACK_KG)); }
  function dispatchedSacksFor(batchId,quality){ var t=0; (state.dispatches||[]).forEach(function(d){ if(d.batchId===batchId && (d.quality||"")===(quality||"")) t+=parseFloat(d.sacks)||0; }); return t; }
  function availSacksOf(r){ return packedSacksOf(r) - dispatchedSacksFor(r.batchId, gradeOf(r)); }
  function pendingPack(){ return weighedRuns().filter(function(r){ return !fullyPacked(r); }); }
  function dispatchableQ(){ return weighedRuns().filter(function(r){ return fullyPacked(r) && availSacksOf(r)>0; }); }
  function dispatchesFor(batchId){ return (state.dispatches||[]).filter(function(d){ return d.batchId===batchId; }); }
  function batchSacks(batchId){ var t=0; dispatchesFor(batchId).forEach(function(d){ t+=parseFloat(d.sacks)||0; }); return t; }

  /* ----- packing ----- */
  function viewPacking(){
    var p=pendingPack();
    if(!p.length) return '<div class="view-head"><h1>Packing</h1></div>'+
      empty('<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
        "Nothing to pack","Weigh a quality on R4 and it lands here to be packed into sacks.");
    var cards=p.slice().reverse().map(function(r){
      var b=batch(r.batchId); var w=parseFloat(r.weightKg)||0, ci=carriedIn(r), total=packTotalOf(r), ps=packedSacksOf(r), need=sacksNeeded(r);
      var prog = ps>0 ? '<small style="color:var(--elec)">'+ps+' sacks packed · '+Math.round((total-ps*SACK_KG)*100)/100+' kg left out</small>'
                      : '<small>weighed '+w+' kg'+(ci>0?' + '+ci+' carried = '+total+' kg':'')+' · ≈ '+need+' sacks</small>';
      var gradeChip = r.quality ? qchip(r.quality) : '<span class="qchip shift" style="background:var(--ember)">Coarse</span>';
      return '<div class="wcard"><div class="info"><div class="row1"><span class="batchref">'+esc(packRef(r))+'</span>'+gradeChip+'<span class="formchip">'+esc(packSubtitle(r))+'</span></div>'+prog+'</div>'+
        '<button class="btn primary" data-pack="'+r.id+'">'+(ps>0?'Update ▸':'Pack ▸')+'</button></div>';
    }).join("");
    return '<div class="view-head"><h1>Packing</h1><div class="meta">'+p.length+' to pack</div></div><div class="stack">'+cards+'</div>';
  }
  function openPackSheet(runId){
    var r=weighRow(runId); if(!r) return; var b=batch(r.batchId);
    var q=gradeOf(r), refName=packRef(r);
    var w=parseFloat(r.weightKg)||0, ci=carriedIn(r), total=packTotalOf(r), ps=packedSacksOf(r), need=sacksNeeded(r);
    var carryNote = ci>0 ? '<div class="ro" style="margin-bottom:10px"><span class="k">Carried in from last batch</span><span class="v" style="color:var(--elec)">+'+ci+' kg</span></div>' : '';
    var willLeave = Math.round((total - need*SACK_KG)*100)/100;
    var convTo = CONVERTS[r.quality];
    var canConv = !!convTo;
    var convBox = canConv ? '<div class="sheet-label" style="margin-top:16px">Convert '+esc(r.quality)+' → '+esc(convTo)+'</div>'+
      '<div class="field-inline" style="align-items:stretch"><div class="field" style="flex:2;margin-bottom:0"><div class="num-suffix"><input id="pk-conv" type="number" inputmode="decimal" placeholder="0"><span class="sfx">kg</span></div></div>'+
      '<button class="btn" id="pk-conv-go" style="flex:1;border-color:#7a5a1f;color:var(--amber)">→ '+esc(convTo)+'</button></div>'+
      '<div class="hint" style="margin-top:-4px">Moves this many kg — and its processing cost — to '+esc(convTo)+' of '+esc(refName)+'. The '+esc(r.quality)+' weight here drops by the same amount.</div>' : '';
    openSheet('<div class="sheet-h"><span class="led" style="background:var(--elec)"></span><b>Pack '+esc(refName)+' · '+esc(q)+'</b></div>'+
      '<div class="sheet-sub">Weighed '+w+' kg'+(ci>0?' + '+ci+' kg carried = '+total+' kg':'')+' · '+SACK_KG+' kg per sack.</div>'+
      carryNote+
      '<div class="ro" style="margin-bottom:10px"><span class="k">Full sacks</span><span class="v">'+need+' sacks · '+(need*SACK_KG)+' kg</span></div>'+
      '<div class="ro" style="margin-bottom:14px"><span class="k">Left out → next '+esc(q)+' batch</span><span class="v" style="color:var(--amber)">'+willLeave+' kg</span></div>'+
      '<div class="field"><label>Sacks packed</label><input id="pk-s" type="number" inputmode="numeric" value="'+(ps||need||"")+'" placeholder="'+need+'"></div>'+
      convBox+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="pk-go">Pack &amp; carry forward</button></div>');
    sheet.querySelector("#pk-go").addEventListener("click",function(){ setPacked(runId, num(sheet.querySelector("#pk-s").value)); });
    if(canConv){ var cg=sheet.querySelector("#pk-conv-go"); if(cg) cg.addEventListener("click",function(){ convertAtPack(runId, num(sheet.querySelector("#pk-conv").value)); }); }
  }
  function setPacked(runId, sacks){
    var r=weighRow(runId); if(!r) return; var b=batch(r.batchId); var q=gradeOf(r);
    if(sacks==null||sacks<0){ toast("Enter the sacks packed","warn"); return; }
    if(r.leftoutIn==null) r.leftoutIn=leftoutBal(q);     // claim the carried-in remainder once
    var total=Math.round(((parseFloat(r.weightKg)||0)+(parseFloat(r.leftoutIn)||0))*100)/100;
    var leftoutOut=Math.round((total - sacks*SACK_KG)*100)/100;
    if(leftoutOut<0){ toast("That is more than the "+total+" kg available","warn"); return; }
    r.packedSacks=sacks; r.leftoutOut=leftoutOut; r.synced=false;
    if(!state.leftout) state.leftout={};
    state.leftout[q]=leftoutOut;                          // carry to the next batch of this quality
    save(); closeSheet(); render();
    if(fullyPacked(r)) toast(packRef(r)+" · "+q+" packed · "+leftoutOut+" kg carried forward","ok");
    else toast("Saved "+sacks+" sacks · "+leftoutOut+" kg still to pack","ok");
  }

  function fmtMoney(n){ if(n==null||n==="") return "—"; var x=Math.round((+n)*100)/100; try{ return "₹"+x.toLocaleString("en-IN"); }catch(e){ return "₹"+x; } }
  function itemWeight(it){ return (it.weightKg!=null&&it.weightKg!=="")?(+it.weightKg):((it.sacks!=null&&it.sacks!=="")?(+it.sacks)*SACK_KG:0); }

  function viewDispatch(){
    var loads=(state.dispatchLoads||[]).slice().sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
    var head='<div class="view-head"><h1>Dispatch</h1><div class="meta">'+loads.length+' load'+(loads.length===1?'':'s')+'</div></div>';
    var newBtn='<button class="btn primary block" data-act="new-dispatch" style="margin-bottom:14px">+ New dispatch</button>';
    var hb=heldBatchMap(), hbKeys=Object.keys(hb), hc=heldCoarseList();
    var warn="";
    if(hbKeys.length || hc.length){
      var parts=hbKeys.map(function(no){ return "Batch "+esc(no); }).concat(hc.map(function(t){ return "Coarse "+esc(fmtDay(t.shiftDate))+" "+esc(t.shift); }));
      warn='<div class="panel" style="border:1px solid var(--err);background:rgba(220,60,60,.08);margin-bottom:14px">'+
        '<div style="display:flex;gap:8px;align-items:flex-start"><span style="color:var(--err);font-size:18px;line-height:1">\u26a0</span>'+
        '<div><b style="color:var(--err)">QC hold \u2014 marked unfit</b><div class="bhint" style="margin-top:3px">'+parts.join(" \u00b7 ")+'</div>'+
        '<div class="hint" style="margin-top:4px">You can still dispatch these \u2014 check with QC and decide.</div></div></div></div>';
    }
    if(!loads.length) return head+newBtn+warn+empty('<path d="M1 3h13v10H1z"/><path d="M14 7h4l3 3v3h-7z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
      "No dispatches yet","Tap \u201cNew dispatch\u201d, add the items going out, then pick the customer, vehicle and driver.");
    var cards=loads.map(function(l){
      var veh = l.ownVehicle ? (esc(l.vehicleNo||"our vehicle")+(l.driver?' \u00b7 '+esc(l.driver):'')) : (esc(l.vehicleNo||"hired")+' \u00b7 hired'+(l.driver?' \u00b7 '+esc(l.driver):''));
      var grades = (l.items||[]).map(function(it){ return esc(it.grade); }).join(", ");
      return '<div class="bcard" data-load="'+esc(l.id)+'" style="cursor:pointer">'+
        '<div class="bhead"><div class="l"><span class="batchref" style="font-size:15px">'+esc(l.customer)+'</span>'+
          (l.dummy?'<span class="qchip shift" style="background:var(--steel);color:#0e1a08">SAMPLE</span>':'')+
          '<span class="formchip">'+(l.items||[]).length+' item'+((l.items||[]).length===1?'':'s')+'</span></div>'+
          '<span class="bstate ready" style="background:none;color:var(--ok)">'+fmtMoney(l.totalAmount)+'</span></div>'+
        '<div class="bhint">'+esc(grades)+'</div>'+
        '<div class="bhint">'+veh+' \u00b7 '+Math.round((l.totalKg||0)*100)/100+' kg \u00b7 '+fmtDate(l.ts)+'</div></div>';
    }).join("");
    return head+newBtn+warn+'<div class="stack">'+cards+'</div>';
  }

  /* ---------- multi-item dispatch builder (one customer / vehicle / driver) ---------- */
  var DD=null;
  function openDispatchBuilder(){
    DD={ items:[], customer:null, ownVehicle:true, vehicleNo:(state.vehicles&&state.vehicles[0])||"", driver:"" };
    renderDispatchBuilder();
  }
  function ddTotals(){
    var kg=0, amt=0, missing=false;
    DD.items.forEach(function(it){
      var w=itemWeight(it), rf=DD.customer?rateFor(DD.customer,it.grade):{rate:null};
      kg+=w; if(rf.rate!=null) amt+=rf.rate*w; else if(DD.customer) missing=true;
    });
    return { kg:Math.round(kg*100)/100, amt:Math.round(amt*100)/100, missing:missing };
  }
  function renderDispatchBuilder(){
    var gradeOpts=DISPATCH_GRADES.map(function(g){ return '<option value="'+g+'">'+g+'</option>'; }).join("");
    var hbMap=heldBatchMap();
    var itemsHtml = DD.items.length ? DD.items.map(function(it,i){
      var w=itemWeight(it), rf=DD.customer?rateFor(DD.customer,it.grade):null;
      var right = rf ? (rf.rate!=null ? fmtMoney(rf.rate*w)+' <small class="muted">@'+rf.rate+(rf.note?' '+rf.note:'')+'</small>' : '<small style="color:var(--err)">no rate</small>') : '<small class="muted">'+w+' kg</small>';
      var held = it.batchNo && hbMap[String(it.batchNo)];
      var holdTag = held ? ' <span class="qchip" style="background:var(--err);color:#fff;font-size:9px">QC HOLD</span>' : '';
      return '<div class="weighrow"'+(held?' style="border-left:3px solid var(--err);padding-left:8px"':'')+'><span><b>'+esc(it.grade)+'</b>'+(it.batchNo?' <span class="muted">'+esc(it.batchNo)+'</span>':'')+holdTag+' \u00b7 '+(it.sacks!=null&&it.sacks!==""?esc(it.sacks)+' sacks \u00b7 ':'')+w+' kg</span>'+
        '<span style="display:flex;align-items:center;gap:8px">'+right+'<button class="wdel" data-del-item="'+i+'" aria-label="remove">\u2715</button></span></div>';
    }).join("") : '<div class="hint" style="margin:4px 0 10px">No items yet. Add each grade going on this vehicle.</div>';
    var custBtns=CUSTOMERS.map(function(c){ return '<button class="pick'+(DD.customer===c?' sel':'')+'" data-pick-cust="'+esc(c)+'"><b>'+esc(c)+'</b></button>'; }).join("");
    var vehSection;
    if(DD.ownVehicle){
      var vopts='<option value="">\u2014 pick vehicle \u2014</option>'+(state.vehicles||[]).map(function(v){ return '<option value="'+esc(v)+'"'+(DD.vehicleNo===v?' selected':'')+'>'+esc(v)+'</option>'; }).join("");
      var dopts='<option value="">\u2014 pick driver \u2014</option>'+(state.drivers||[]).map(function(d){ return '<option value="'+esc(d)+'"'+(DD.driver===d?' selected':'')+'>'+esc(d)+'</option>'; }).join("");
      vehSection='<div class="field-inline"><div class="field"><label>Our vehicle</label><select id="dl-veh">'+vopts+'</select></div>'+
        '<div class="field"><label>Driver</label><select id="dl-drv">'+dopts+'</select></div></div>';
    } else {
      vehSection='<div class="field-inline"><div class="field"><label>Vehicle number</label><input id="dl-vehno" type="text" autocomplete="off" placeholder="e.g. KL-43-TT-9090" value="'+esc(DD.vehicleNo||"")+'"></div>'+
        '<div class="field"><label>Driver <span class="muted" style="text-transform:none;letter-spacing:0">opt.</span></label><input id="dl-drvtext" type="text" autocomplete="off" placeholder="driver name" value="'+esc(DD.driver||"")+'"></div></div>';
    }
    var t=ddTotals();
    var canSave = DD.items.length>0 && DD.customer && (DD.ownVehicle ? !!DD.vehicleNo : true);
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#c8f0a0,var(--amber));box-shadow:0 0 10px 1px var(--amber)"></span><b>New dispatch</b></div>'+
      '<div class="sheet-sub">One customer, one vehicle, one driver \u2014 any mix of grades.</div>'+
      '<div class="sheet-label">Items</div>'+itemsHtml+
      '<div class="field-inline" style="align-items:stretch;margin-top:6px"><div class="field" style="margin-bottom:0"><label>Grade</label><select id="di-grade">'+gradeOpts+'</select></div>'+
        '<div class="field" style="margin-bottom:0"><label>Batch <span class="muted" style="text-transform:none;letter-spacing:0">opt.</span></label><input id="di-batch" type="text" autocomplete="off" placeholder="\u2014"></div></div>'+
      '<div class="field-inline" style="align-items:stretch"><div class="field" style="margin-bottom:0"><label>Sacks</label><input id="di-sacks" type="number" inputmode="numeric" placeholder="0"></div>'+
        '<div class="field" style="margin-bottom:0"><label>or Weight</label><div class="num-suffix"><input id="di-weight" type="number" inputmode="decimal" placeholder="kg"><span class="sfx">kg</span></div></div>'+
        '<button class="btn elec" id="di-add" style="flex:0 0 auto;align-self:flex-end">+ Add</button></div>'+
      '<div class="hint" style="margin-top:-2px">1 sack = '+SACK_KG+' kg. Enter sacks or a direct weight.</div>'+
      '<div class="sheet-label" style="margin-top:16px">Customer</div><div class="pickgrid">'+custBtns+'</div>'+
      '<div class="sheet-label" style="margin-top:16px">Vehicle</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:10px">'+
        '<button class="pick'+(DD.ownVehicle?' sel':'')+'" data-veh-mode="own" style="flex:1">Our vehicle</button>'+
        '<button class="pick'+(!DD.ownVehicle?' sel':'')+'" data-veh-mode="hired" style="flex:1">Hired / customer</button></div>'+
      vehSection+
      (DD.customer?'<div class="ro" style="margin-top:14px"><span class="k">Total</span><span class="v" style="color:var(--ok)">'+t.kg+' kg \u00b7 '+fmtMoney(t.amt)+(t.missing?' <small style="color:var(--err)">(some grades have no rate)</small>':'')+'</span></div>':'<div class="hint" style="margin-top:12px">Pick a customer to price the load.</div>')+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="dl-save"'+(canSave?'':' disabled style="opacity:.5"')+'>Save dispatch</button></div>');
    sheet.querySelector("#di-add").addEventListener("click",function(){
      var g=sheet.querySelector("#di-grade").value, bn=(sheet.querySelector("#di-batch").value||"").trim();
      var sk=num(sheet.querySelector("#di-sacks").value), wt=num(sheet.querySelector("#di-weight").value);
      if((sk==null||sk<=0) && (wt==null||wt<=0)){ toast("Enter sacks or weight","warn"); return; }
      DD.items.push({ grade:g, batchNo:bn, sacks:(sk!=null?sk:null), weightKg:(wt!=null?wt:null) });
      renderDispatchBuilder();
    });
    sheet.querySelectorAll("[data-del-item]").forEach(function(el){ el.addEventListener("click",function(){ DD.items.splice(parseInt(el.getAttribute("data-del-item"),10),1); renderDispatchBuilder(); }); });
    sheet.querySelectorAll("[data-pick-cust]").forEach(function(el){ el.addEventListener("click",function(){ DD.customer=el.getAttribute("data-pick-cust"); renderDispatchBuilder(); }); });
    sheet.querySelectorAll("[data-veh-mode]").forEach(function(el){ el.addEventListener("click",function(){ var own=(el.getAttribute("data-veh-mode")==="own"); if(own!==DD.ownVehicle){ DD.ownVehicle=own; DD.vehicleNo=own?((state.vehicles&&state.vehicles[0])||""):""; DD.driver=""; } renderDispatchBuilder(); }); });
    var vsel=sheet.querySelector("#dl-veh"); if(vsel) vsel.addEventListener("change",function(){ DD.vehicleNo=vsel.value; });
    var dsel=sheet.querySelector("#dl-drv"); if(dsel) dsel.addEventListener("change",function(){ DD.driver=dsel.value; });
    var vno=sheet.querySelector("#dl-vehno"); if(vno) vno.addEventListener("input",function(){ DD.vehicleNo=vno.value; });
    var dtx=sheet.querySelector("#dl-drvtext"); if(dtx) dtx.addEventListener("input",function(){ DD.driver=dtx.value; });
    var sv=sheet.querySelector("#dl-save"); if(sv) sv.addEventListener("click",commitDispatchLoad);
  }
  function commitDispatchLoad(force){
    if(!DD.items.length){ toast("Add at least one item","warn"); return; }
    if(!DD.customer){ toast("Pick a customer","warn"); return; }
    if(DD.ownVehicle && !DD.vehicleNo){ toast("Pick the vehicle","warn"); return; }
    if(DD.ownVehicle && !DD.driver){ toast("Pick the driver for our vehicle","warn"); return; }
    if(!DD.ownVehicle && !DD.vehicleNo){ toast("Enter the vehicle number","warn"); return; }
    var hbMap=heldBatchMap();
    var heldNos=DD.items.filter(function(it){ return it.batchNo && hbMap[String(it.batchNo)]; }).map(function(it){ return it.batchNo; });
    if(!force && heldNos.length){
      openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#ffb3b3,var(--err));box-shadow:0 0 10px 1px var(--err)"></span><b>QC hold on this load</b></div>'+
        '<div class="sheet-sub">Batch '+esc(heldNos.join(", "))+' was marked <b style="color:var(--err)">unfit</b> by QC. You can still dispatch \u2014 it\u2019s your call.</div>'+
        '<div class="sheet-actions"><button class="btn ghost" id="qcd-back">Back</button>'+
        '<button class="btn danger" id="qcd-go">Dispatch anyway</button></div>');
      sheet.querySelector("#qcd-back").addEventListener("click",renderDispatchBuilder);
      sheet.querySelector("#qcd-go").addEventListener("click",function(){ commitDispatchLoad(true); });
      return;
    }
    var items=DD.items.map(function(it){
      var w=itemWeight(it), rf=rateFor(DD.customer,it.grade);
      return { id:uid(), grade:it.grade, batchNo:it.batchNo||"", sacks:(it.sacks!=null?it.sacks:null), weightKg:Math.round(w*100)/100, rate:rf.rate, amount:(rf.rate!=null?Math.round(rf.rate*w*100)/100:0) };
    });
    var tKg=0,tAmt=0; items.forEach(function(it){ tKg+=(+it.weightKg||0); tAmt+=(+it.amount||0); });
    var load={ id:uid(), device:state.settings.device||"", ts:Date.now(), customer:DD.customer, ownVehicle:!!DD.ownVehicle,
      vehicleNo:DD.vehicleNo||"", driver:DD.driver||"", supervisor:curShift().supervisor||"",
      items:items, totalKg:Math.round(tKg*100)/100, totalAmount:Math.round(tAmt*100)/100, dummy:false, synced:false, createdAt:Date.now() };
    state.dispatchLoads.push(load); DD=null;
    save(); closeSheet(); render(); toast("Dispatch saved \u00b7 "+load.customer+" \u00b7 "+fmtMoney(load.totalAmount),"ok");
    scheduleAutoSync(600);
  }
  function openLoadDetail(id){
    var l=null; for(var i=0;i<(state.dispatchLoads||[]).length;i++) if(state.dispatchLoads[i].id===id){ l=state.dispatchLoads[i]; break; }
    if(!l){ closeSheet(); return; }
    var rows=(l.items||[]).map(function(it){
      return '<div class="weighrow"><span><b>'+esc(it.grade)+'</b>'+(it.batchNo?' <span class="muted">'+esc(it.batchNo)+'</span>':'')+' \u00b7 '+(it.sacks!=null?esc(it.sacks)+' sacks \u00b7 ':'')+Math.round((+it.weightKg||0)*100)/100+' kg</span>'+
        '<span>'+(it.rate!=null?fmtMoney(it.amount)+' <small class="muted">@'+it.rate+'</small>':'<small style="color:var(--err)">no rate</small>')+'</span></div>';
    }).join("");
    var veh = l.ownVehicle ? (esc(l.vehicleNo||"our vehicle")+(l.driver?' \u00b7 '+esc(l.driver):'')+' <span class="muted">(our vehicle)</span>') : (esc(l.vehicleNo||"hired")+(l.driver?' \u00b7 '+esc(l.driver):'')+' <span class="muted">(hired)</span>');
    openSheet('<div class="sheet-h"><b>'+esc(l.customer)+(l.dummy?' \u00b7 SAMPLE':'')+'</b></div>'+
      '<div class="sheet-sub">'+veh+' \u00b7 '+fmtDate(l.ts)+(l.supervisor?' \u00b7 '+esc(l.supervisor):'')+'</div>'+
      '<div class="weighlist">'+rows+'</div>'+
      '<div class="ro" style="margin-top:12px"><span class="k">Total</span><span class="v" style="color:var(--ok)">'+Math.round((l.totalKg||0)*100)/100+' kg \u00b7 '+fmtMoney(l.totalAmount)+'</span></div>'+
      '<div class="ro" style="margin-bottom:8px"><span class="k">Synced</span><span class="v">'+(l.dummy?'sample \u2014 not sent':(l.synced?'yes':'pending'))+'</span></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Close</button>'+
      '<button class="btn danger" data-del-load="'+esc(l.id)+'">Delete</button></div>');
    var db=sheet.querySelector("[data-del-load]"); if(db) db.addEventListener("click",function(){ deleteLoad(l.id); });
  }
  function deleteLoad(id){
    var idx=-1, l=null;
    for(var i=0;i<(state.dispatchLoads||[]).length;i++) if(state.dispatchLoads[i].id===id){ l=state.dispatchLoads[i]; idx=i; break; }
    if(idx<0){ closeSheet(); return; }
    var wasSynced=!!l.synced && !l.dummy;
    state.dispatchLoads.splice(idx,1);
    if(wasSynced && syncTarget()==="supabase"){ state.pendingLoadDeletes=state.pendingLoadDeletes||[]; if(state.pendingLoadDeletes.indexOf(id)<0) state.pendingLoadDeletes.push(id); }
    save(); closeSheet(); render(); toast("Dispatch deleted","ok");
    if(wasSynced) scheduleAutoSync(400);
  }

  /* ================= Quality control (QC) module ================= */
  var QC_PARAM_SUGGEST=["Specific gravity","Mooney viscosity","Ash %","Acetone extract %","Tensile (MPa)","Elongation %","Hardness (Shore A)","Fineness / mesh","Moisture %","Contamination"];
  function qcKeyCoarse(date,shift){ return (date||"")+"|"+(shift||""); }
  /* Batch QC is now QUALITY-WISE: one verdict per grade (Special/SuperFine/Fine/Medium/DRC). */
  function qcGradesFor(b){ return (b && b.qualities && b.qualities.length) ? b.qualities.slice() : QUALITIES.slice(); }
  function qcLatestBatchQ(no, quality){
    var arr=(state.qualityTests||[]).filter(function(q){ return q.kind==="batch" && String(q.batchNo)===String(no) && (q.quality||"")===(quality||""); });
    if(!arr.length) return null; arr.sort(function(a,b){ return (b.ts||0)-(a.ts||0); }); return arr[0];
  }
  function qcLatestBatch(no){   // latest test of ANY grade for this batch (for summaries)
    var arr=(state.qualityTests||[]).filter(function(q){ return q.kind==="batch" && String(q.batchNo)===String(no); });
    if(!arr.length) return null; arr.sort(function(a,b){ return (b.ts||0)-(a.ts||0); }); return arr[0];
  }
  function qcBatchSummary(b){
    var grades=qcGradesFor(b), pass=0, hold=0, untested=0;
    grades.forEach(function(g){ var t=qcLatestBatchQ(b.no,g); if(!t) untested++; else if(t.verdict==="hold") hold++; else pass++; });
    return { grades:grades, pass:pass, hold:hold, untested:untested, anyHold:hold>0, allDone:untested===0 };
  }
  function qcLatestCoarse(date,shift){
    var arr=(state.qualityTests||[]).filter(function(q){ return q.kind==="coarse" && (q.shiftDate||"")===(date||"") && (q.shift||"")===(shift||""); });
    if(!arr.length) return null; arr.sort(function(a,b){ return (b.ts||0)-(a.ts||0); }); return arr[0];
  }
  function coarseShifts(){ var seen={}, out=[]; (state.runs||[]).forEach(function(r){ if(r.line==="coarse"){ var k=qcKeyCoarse(r.shiftDate,r.shift); if(!seen[k]){ seen[k]=1; out.push({ shiftDate:r.shiftDate, shift:r.shift, formulation:r.formulation||"", ts:r.end||r.ts||0 }); } } }); return out; }
  function pendingQC(){ var n=0; (state.batches||[]).forEach(function(b){ if(!qcBatchSummary(b).allDone) n++; }); coarseShifts().forEach(function(c){ if(!qcLatestCoarse(c.shiftDate,c.shift)) n++; }); return n; }
  function heldBatchMap(){ var s={}; (state.batches||[]).forEach(function(b){ if(qcBatchSummary(b).anyHold) s[String(b.no)]=qcLatestBatch(b.no); }); return s; }
  function heldCoarseList(){ var seen={}, out=[]; (state.qualityTests||[]).forEach(function(q){ if(q.kind!=="coarse") return; var k=qcKeyCoarse(q.shiftDate,q.shift); if(seen[k]) return; seen[k]=1; var t=qcLatestCoarse(q.shiftDate,q.shift); if(t&&t.verdict==="hold") out.push(t); }); return out; }
  function qcChip(t){
    if(!t) return '<span class="qchip shift" style="background:var(--steel);color:#0e1a08">Untested</span>';
    if(t.verdict==="hold") return '<span class="qchip" style="background:var(--err);color:#fff">HOLD · unfit</span>';
    return '<span class="qchip" style="background:var(--ok);color:#06210a">Passed</span>';
  }
  function qcBatchChip(s){
    if(s.anyHold) return '<span class="qchip" style="background:var(--err);color:#fff">HOLD · '+s.hold+'</span>';
    if(s.allDone) return '<span class="qchip" style="background:var(--ok);color:#06210a">All passed</span>';
    if(s.pass>0) return '<span class="qchip shift" style="background:var(--pause);color:#2a1f06">'+s.pass+'/'+s.grades.length+' done</span>';
    return '<span class="qchip shift" style="background:var(--steel);color:#0e1a08">Untested</span>';
  }
  function qcGradeStrip(b){
    var s=qcBatchSummary(b);
    return '<div class="bgrade">'+s.grades.map(function(g){
      var t=qcLatestBatchQ(b.no,g); var cls=t?(t.verdict==="hold"?"hold":"pass"):"";
      return '<span class="gradetag '+cls+'"><span class="gd"></span>'+esc(g)+'</span>';
    }).join("")+'</div>';
  }

  function viewQuality(){
    var batches=(state.batches||[]).filter(function(b){ return !batchOrphaned(b); }).sort(function(a,b){ return (b.startedAt||0)-(a.startedAt||0); });
    var shifts=coarseShifts().sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
    var head='<div class="view-head"><h1>Quality</h1><div class="meta">'+pendingQC()+' awaiting test</div></div>';
    if(!batches.length && !shifts.length)
      return head+empty('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        "Nothing to test yet","Once a special batch is loaded or a coarse shift is recorded, it shows up here for you to log results.");
    var out=head;
    if(batches.length){
      out+='<div class="sheet-label" style="margin:4px 2px 8px">Special batches <span class="muted" style="text-transform:none;letter-spacing:0">— pass / hold per grade</span></div><div class="stack">';
      out+=batches.map(function(b){
        var s=qcBatchSummary(b);
        var hint = s.allDone ? (s.anyHold?(s.hold+' grade'+(s.hold>1?'s':'')+' on hold'):'All grades passed')
                             : (s.untested+' grade'+(s.untested>1?'s':'')+' awaiting test');
        return '<div class="bcard" data-qc-batch="'+esc(b.no)+'" style="cursor:pointer">'+
          '<div class="bhead"><div class="l"><span class="batchref" style="font-size:16px">'+esc(b.no)+'</span>'+
            '<span class="formchip">'+esc(b.formulation||"")+'</span></div>'+qcBatchChip(s)+'</div>'+
          qcGradeStrip(b)+
          '<div class="bhint" style="margin-top:8px">'+hint+' · tap to log per-grade results</div>'+
        '</div>';
      }).join("")+'</div>';
    }
    if(shifts.length){
      out+='<div class="sheet-label" style="margin:16px 2px 8px">Coarse shifts</div><div class="stack">';
      out+=shifts.map(function(c){
        var t=qcLatestCoarse(c.shiftDate,c.shift);
        return '<div class="bcard" data-qc-coarse="'+esc(qcKeyCoarse(c.shiftDate,c.shift))+'" style="cursor:pointer">'+
          '<div class="bhead"><div class="l"><span class="batchref" style="font-size:15px">'+esc(fmtDay(c.shiftDate))+'</span>'+
            '<span class="qchip shift" style="background:var(--ember)">'+esc(c.shift)+'</span>'+(c.formulation?'<span class="formchip">'+esc(c.formulation)+'</span>':'')+'</div>'+qcChip(t)+'</div>'+
          (t?'<div class="bhint">'+(t.tester?esc(t.tester)+' · ':'')+fmtDate(t.ts)+(t.attachmentUrl?' · report \u2713':(t.attachmentPending?' · report \u2934':''))+(t.notes?' · '+esc(t.notes):'')+'</div>':'<div class="bhint">Tap to log test results</div>')+
        '</div>';
      }).join("")+'</div>';
    }
    return out;
  }

  /* ---- QC test sheet (append-only; latest result is the current verdict) ---- */
  var QT=null;
  function openQcBatch(no){
    var b=null; for(var i=0;i<(state.batches||[]).length;i++) if(String(state.batches[i].no)===String(no)){ b=state.batches[i]; break; }
    var grades=qcGradesFor(b);
    var rows=grades.map(function(g){
      var t=qcLatestBatchQ(no,g);
      var status = t ? (t.verdict==="hold"?'<b style="color:var(--err)">HOLD</b>':'<b style="color:var(--ok)">Passed</b>')+((t.params&&t.params.length)?' <span class="muted">· '+t.params.length+' reading'+(t.params.length>1?'s':'')+'</span>':' <span class="muted">· no readings</span>')
                     : '<span class="muted">Untested</span>';
      return '<button class="qgrow" data-qc-grade="'+esc(no)+'|'+esc(g)+'" style="width:100%;text-align:left;background:var(--panel2,#101820);border:1px solid var(--line);border-radius:11px;padding:11px 13px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;color:var(--ink)">'+
        '<span><span class="qchip q-'+esc(g)+'" style="min-width:78px;display:inline-block;text-align:center">'+esc(g)+'</span></span>'+
        '<span style="flex:1;font-size:13px">'+status+'</span><span style="color:var(--muted);font-size:18px">›</span></button>';
    }).join("");
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#bfe3ff,#3aa0ff)"></span><b>Batch '+esc(no)+'</b></div>'+
      '<div class="sheet-sub">'+(b&&b.formulation?esc(b.formulation)+' · ':'')+'Each grade is tested separately — tap a grade to log its own parameters and verdict.</div>'+
      rows+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Close</button></div>');
    sheet.querySelectorAll("[data-qc-grade]").forEach(function(el){ el.addEventListener("click",function(){ var p=el.getAttribute("data-qc-grade").split("|"); openQcGrade(p[0],p[1]); }); });
  }
  function openQcGrade(no, grade){
    var b=null; for(var i=0;i<(state.batches||[]).length;i++) if(String(state.batches[i].no)===String(no)){ b=state.batches[i]; break; }
    var prev=qcLatestBatchQ(no,grade);
    QT={ kind:"grade", batchNo:no, quality:grade, label:"Batch "+no+" · "+grade, sub:(b?b.formulation:"")||"",
         params:(prev&&prev.params?JSON.parse(JSON.stringify(prev.params)):[]), verdict:(prev?prev.verdict:"pass"), tester:(prev?prev.tester:"")||"", notes:"",
         attachmentUrl:(prev&&prev.attachmentUrl)||"", attachmentName:(prev&&prev.attachmentName)||"", newFileDataUrl:null, newFileName:"", newFileType:"" };
    renderQcSheet();
  }
  function openQcCoarse(key){
    var p=String(key).split("|"), date=p[0], shift=p[1];
    var prev=qcLatestCoarse(date,shift);
    QT={ kind:"coarse", shiftDate:date, shift:shift, label:"Coarse · "+fmtDay(date)+" "+shift, sub:"",
         params:(prev&&prev.params?JSON.parse(JSON.stringify(prev.params)):[]), verdict:(prev?prev.verdict:"pass"), tester:(prev?prev.tester:"")||"", notes:"",
         attachmentUrl:(prev&&prev.attachmentUrl)||"", attachmentName:(prev&&prev.attachmentName)||"", newFileDataUrl:null, newFileName:"", newFileType:"" };
    renderQcSheet();
  }
  function renderQcSheet(){
    var prev = QT.kind==="grade" ? qcLatestBatchQ(QT.batchNo,QT.quality) : qcLatestCoarse(QT.shiftDate,QT.shift);
    var paramsHtml = QT.params.length ? QT.params.map(function(p,i){
      return '<div class="weighrow"><span><b>'+esc(p.name)+'</b> · '+esc(p.value)+(p.unit?' '+esc(p.unit):'')+'</span>'+
        '<button class="wdel" data-qp-del="'+i+'" aria-label="remove">\u2715</button></div>';
    }).join("") : '<div class="hint" style="margin:4px 0 10px">No readings yet. Add each test parameter and its value.</div>';
    var dl='<datalist id="qc-names">'+QC_PARAM_SUGGEST.map(function(n){ return '<option value="'+esc(n)+'">'; }).join("")+'</datalist>';
    var attachHtml='';
    if(QT.newFileDataUrl){
      var isImg=(QT.newFileType||"").indexOf("image")===0;
      attachHtml='<div class="weighrow"><span>'+(isImg?'<img src="'+QT.newFileDataUrl+'" style="height:32px;width:32px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:8px">':'')+esc(QT.newFileName||"file")+' <small class="muted">new</small></span>'+
        '<button class="wdel" id="qc-file-clear" aria-label="remove">\u2715</button></div>';
    } else if(QT.attachmentUrl){
      attachHtml='<div class="weighrow"><span>Report: <a href="'+esc(QT.attachmentUrl)+'" target="_blank" rel="noopener" style="color:var(--elec)">view</a> <small class="muted">'+esc(QT.attachmentName||"")+'</small></span></div>';
    }
    var verdictBlock='<div class="sheet-label" style="margin-top:16px">Verdict</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:6px">'+
        '<button class="pick'+(QT.verdict!=="hold"?' sel':'')+'" data-qc-verdict="pass" style="flex:1"><b>Pass</b><small>fit for dispatch</small></button>'+
        '<button class="pick'+(QT.verdict==="hold"?' sel':'')+'" data-qc-verdict="hold" style="flex:1"><b>Hold</b><small>unfit \u2014 warn dispatch</small></button>'+
      '</div>';
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#bfe3ff,#3aa0ff);box-shadow:0 0 10px 1px #3aa0ff"></span><b>'+esc(QT.label)+'</b></div>'+
      '<div class="sheet-sub">'+(QT.sub?esc(QT.sub)+' · ':'')+(QT.kind==="grade"?'Log this grade\u2019s test parameters, then mark Pass or Hold.':'Log the lab results, then mark Pass or Hold.')+(prev?' Last: '+(prev.verdict==="hold"?'HOLD':'Passed')+' '+esc(fmtDate(prev.ts)):'')+'</div>'+
      dl+
      '<div class="sheet-label">Test readings <span class="muted" style="text-transform:none;letter-spacing:0">'+(QT.kind==="grade"?'\u2014 for this grade':'opt.')+'</span></div>'+paramsHtml+
      '<div class="field-inline" style="align-items:stretch;margin-top:6px"><div class="field" style="margin-bottom:0;flex:1.3"><label>Parameter</label><input id="qp-name" list="qc-names" type="text" autocomplete="off" placeholder="e.g. Mooney viscosity"></div>'+
        '<div class="field" style="margin-bottom:0"><label>Value</label><input id="qp-val" type="text" inputmode="decimal" placeholder="0"></div>'+
        '<div class="field" style="margin-bottom:0;flex:.7"><label>Unit</label><input id="qp-unit" type="text" autocomplete="off" placeholder="opt."></div>'+
        '<button class="btn elec" id="qp-add" style="flex:0 0 auto;align-self:flex-end">+ Add</button></div>'+
      verdictBlock+
      '<div class="field-inline" style="margin-top:10px"><div class="field"><label>Tested by</label><input id="qc-tester" type="text" autocomplete="off" placeholder="QC name" value="'+esc(QT.tester||"")+'"></div></div>'+
      '<div class="field"><label>Notes <span class="muted" style="text-transform:none;letter-spacing:0">opt.</span></label><textarea id="qc-notes" rows="2" placeholder="observations / reason for hold">'+esc(QT.notes||"")+'</textarea></div>'+
      '<div class="sheet-label" style="margin-top:6px">Lab report <span class="muted" style="text-transform:none;letter-spacing:0">opt. \u2014 photo or PDF</span></div>'+
      attachHtml+
      '<label class="btn ghost block" style="margin-top:6px;cursor:pointer">'+((QT.attachmentUrl||QT.newFileDataUrl)?'Replace report':'Attach photo / PDF')+
        '<input id="qc-file" type="file" accept="image/*,application/pdf" capture="environment" style="display:none"></label>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="qc-save">Save result</button></div>');
    function grabShared(){ QT.tester=(sheet.querySelector("#qc-tester").value||"").trim(); QT.notes=sheet.querySelector("#qc-notes").value||""; }
    sheet.querySelector("#qp-add").addEventListener("click",function(){
      var nm=(sheet.querySelector("#qp-name").value||"").trim();
      var vl=(sheet.querySelector("#qp-val").value||"").trim();
      var un=(sheet.querySelector("#qp-unit").value||"").trim();
      if(!nm){ toast("Name the parameter","warn"); return; }
      if(vl===""){ toast("Enter the value","warn"); return; }
      grabShared();
      QT.params.push({ name:nm, value:vl, unit:un }); renderQcSheet();
    });
    sheet.querySelectorAll("[data-qp-del]").forEach(function(el){ el.addEventListener("click",function(){ grabShared(); QT.params.splice(parseInt(el.getAttribute("data-qp-del"),10),1); renderQcSheet(); }); });
    sheet.querySelectorAll("[data-qcg]").forEach(function(el){ el.addEventListener("click",function(){ grabShared(); var g=el.getAttribute("data-qcg"), v=el.getAttribute("data-qcv"); QT.verdicts[g]=(v===""?null:v); renderQcSheet(); }); });
    sheet.querySelectorAll("[data-qc-verdict]").forEach(function(el){ el.addEventListener("click",function(){ grabShared(); QT.verdict=el.getAttribute("data-qc-verdict"); renderQcSheet(); }); });
    var fileIn=sheet.querySelector("#qc-file");
    if(fileIn) fileIn.addEventListener("change",function(ev){
      var f=ev.target.files&&ev.target.files[0]; if(!f) return;
      if(f.size>8*1024*1024){ toast("File too large (max 8 MB)","warn"); ev.target.value=""; return; }
      QT.tester=(sheet.querySelector("#qc-tester").value||"").trim(); QT.notes=sheet.querySelector("#qc-notes").value||"";
      var fr=new FileReader();
      fr.onload=function(){ QT.newFileDataUrl=fr.result; QT.newFileName=f.name; QT.newFileType=f.type||""; renderQcSheet(); };
      fr.onerror=function(){ toast("Could not read that file","err"); };
      fr.readAsDataURL(f);
    });
    var fileClear=sheet.querySelector("#qc-file-clear");
    if(fileClear) fileClear.addEventListener("click",function(){ QT.tester=(sheet.querySelector("#qc-tester").value||"").trim(); QT.notes=sheet.querySelector("#qc-notes").value||""; QT.newFileDataUrl=null; QT.newFileName=""; QT.newFileType=""; renderQcSheet(); });
    sheet.querySelector("#qc-save").addEventListener("click",commitQcTest);
  }
  function commitQcTest(){
    QT.tester=(sheet.querySelector("#qc-tester").value||"").trim();
    QT.notes=sheet.querySelector("#qc-notes").value||"";
    var ts=Date.now(), dev=state.settings.device||"";
    var newFile=QT.newFileDataUrl, newName=QT.newFileName||"report";
    var keepUrl=(!newFile && QT.attachmentUrl)?QT.attachmentUrl:"";
    var keepName=(!newFile && QT.attachmentUrl)?(QT.attachmentName||""):"";
    var recs=[];
    if(QT.kind==="grade"){
      if(!QT.params.length && !QT.notes && !newFile && !QT.attachmentUrl){ toast("Add at least one test parameter for this grade","warn"); return; }
      recs.push({ id:uid(), device:dev, ts:ts, kind:"batch", batchNo:QT.batchNo, quality:QT.quality,
        shiftDate:null, shift:null, params:QT.params.slice(), verdict:(QT.verdict==="hold"?"hold":"pass"),
        tester:QT.tester, notes:QT.notes, attachmentUrl:keepUrl, attachmentName:keepName, synced:false });
    } else {
      if(!QT.params.length && !QT.notes && !newFile && !QT.attachmentUrl){ toast("Add a reading, a note, or a report","warn"); return; }
      recs.push({ id:uid(), device:dev, ts:ts, kind:"coarse", batchNo:null, quality:"Coarse",
        shiftDate:QT.shiftDate, shift:QT.shift, params:QT.params.slice(), verdict:(QT.verdict==="hold"?"hold":"pass"),
        tester:QT.tester, notes:QT.notes, attachmentUrl:keepUrl, attachmentName:keepName, synced:false });
    }
    var anyHold=recs.some(function(r){ return r.verdict==="hold"; });
    recs.forEach(function(r){ state.qualityTests.push(r); });
    QT=null; save(); closeSheet(); render();
    if(newFile){
      recs.forEach(function(r){ r.attachmentName=newName; r.attachmentPending=true; });
      var keyId=recs[0].id;
      var online=(syncTarget()==="supabase") && (typeof navigator==="undefined" || navigator.onLine!==false);
      if(online){
        toast(anyHold?"Saved \u00b7 uploading report\u2026":"Saved \u00b7 uploading report\u2026","ok");
        uploadDataUrl(keyId, newName, newFile).then(function(url){
          recs.forEach(function(r){ r.attachmentUrl=url; r.attachmentName=newName; r.attachmentPending=false; r.synced=false; });
          save(); if(!sheetIsOpen() && active!=="settings") render();
        }).catch(function(){ if(!qcEnqueueUpload(keyId, newName, newFile)) toast("Report too large to queue","warn"); });
        scheduleAutoSync(700);
      } else {
        var ok=qcEnqueueUpload(keyId, newName, newFile);
        toast(ok?"Saved \u2014 report uploads when online":"Saved \u2014 report too big to queue offline","warn");
      }
      return;
    }
    var msg = (recs.length>1)
      ? (recs.length+" grade verdicts saved"+(anyHold?" \u00b7 some on HOLD":""))
      : (anyHold?"Marked HOLD \u2014 dispatch will be warned":"Result saved \u00b7 passed");
    toast(msg,"ok");
    scheduleAutoSync(500);
  }

  function runDate(r){ return r.shiftDate || (r.end?isoDate(new Date(r.end)):"") ; }
  function acTimes(r){
    if(r.loadedAt==null && r.unloadedAt==null) return "";
    var l = r.loadedAt!=null ? fmtClock(r.loadedAt) : "—";
    var u = r.unloadedAt!=null ? fmtClock(r.unloadedAt) : "—";
    var extra="";
    if(r.loadedAt!=null && r.unloadedAt!=null){
      var ld=isoDate(new Date(r.loadedAt)), ud=isoDate(new Date(r.unloadedAt));
      if(ld!==ud) extra=' <span class="muted">('+esc(fmtDay(ud))+')</span>';
    }
    return '<div class="muted" style="font-size:10.5px;margin-top:3px">⤓ load '+l+' → ⤒ unload '+u+extra+'</div>';
  }
  function viewHistory(){
    if(!state.runs.length) return '<div class="view-head"><h1>History</h1></div>'+
      empty('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/>',"No runs logged","Captured runs from every machine show up here.");
    var runs=state.runs.slice();
    var dateSet={}, batchSet={};
    runs.forEach(function(r){
      var d=runDate(r); if(d) dateSet[d]=true;
      if(r.line==="special" && r.batchNo) batchSet[String(r.batchNo)]=true;   // special-line batches only
    });
    var dates=Object.keys(dateSet).sort().reverse();
    var batches=Object.keys(batchSet).sort(function(a,b){ var na=parseFloat(a),nb=parseFloat(b); if(!isNaN(na)&&!isNaN(nb)) return nb-na; return a<b?1:-1; });
    if(histFilter.date!=="all" && dates.indexOf(histFilter.date)<0) histFilter.date="all";
    if(histFilter.batch!=="all" && batches.indexOf(histFilter.batch)<0) histFilter.batch="all";

    var batchMode = histFilter.batch!=="all";
    var fr = runs.filter(function(r){
      if(batchMode) return String(r.batchNo||"")===histFilter.batch;
      if(histFilter.date!=="all" && runDate(r)!==histFilter.date) return false;
      if(histFilter.shift!=="all" && (r.shift||"")!==histFilter.shift) return false;
      return true;
    });
    fr.sort(function(a,b){ return (b.end||0)-(a.end||0); });

    var dOpts='<option value="all">All days</option>'+dates.map(function(d){ return '<option value="'+esc(d)+'"'+(histFilter.date===d?" selected":"")+'>'+esc(fmtDay(d))+'</option>'; }).join("");
    var sOpts=["all","Day","Night"].map(function(s){ return '<option value="'+s+'"'+(histFilter.shift===s?" selected":"")+'>'+(s==="all"?"Both shifts":s)+'</option>'; }).join("");
    var bOpts='<option value="all">All batches (special)</option>'+batches.map(function(b){ return '<option value="'+esc(b)+'"'+(histFilter.batch===b?" selected":"")+'>#'+esc(b)+'</option>'; }).join("");
    var filters='<div class="histbar">'+
      '<div class="field" style="margin:0"><label>Day</label><select data-histfilter="date"'+(batchMode?' disabled':'')+'>'+dOpts+'</select></div>'+
      '<div class="field" style="margin:0"><label>Shift</label><select data-histfilter="shift"'+(batchMode?' disabled':'')+'>'+sOpts+'</select></div>'+
      '<div class="field" style="margin:0"><label>Batch</label><select data-histfilter="batch">'+bOpts+'</select></div>'+
      '</div>';

    var summary="";
    if(batchMode){
      var totWt=0, totRun=0, qset={};
      fr.forEach(function(r){ if(r.weightKg!==""&&r.weightKg!=null) totWt+=parseFloat(r.weightKg)||0; totRun+=parseFloat(r.runtimeMin)||0; if(r.quality) qset[r.quality]=true; });
      var b0=fr[0]||{};
      summary='<div class="histsum"><b>#'+esc(histFilter.batch)+'</b> '+(b0.formulation?'· '+esc(b0.formulation):'')+
        '<br><span class="muted">'+fr.length+' run'+(fr.length===1?'':'s')+' · '+fmtDur(totRun)+' total'+(totWt>0?' · '+Math.round(totWt)+' kg':'')+(Object.keys(qset).length?' · '+Object.keys(qset).join(", "):'')+'</span></div>';
    }

    // Duplicate detection: non-shiftwise rows sharing machine+batch+quality+shift-date+shift are potential double entries.
    function dupKey(r){ return r.shiftwise ? null : (r.machineId+"|"+(r.batchNo||"")+"|"+(r.quality||"")+"|"+(r.shiftDate||"")+"|"+(r.shift||"")); }
    var dupCount={}, dupSeen={};
    fr.forEach(function(r){ var k=dupKey(r); if(k) dupCount[k]=(dupCount[k]||0)+1; });

    var body=fr.map(function(r){
      var shiftwise=!!r.shiftwise, isAuto=(r.kind==="autoclave")||r.loadedAt!=null;
      var ep=[];
      if(r.kWh!==""&&r.kWh!=null) ep.push(esc(r.kWh)+' kWh');
      if(r.firewoodKg!==""&&r.firewoodKg!=null) ep.push(esc(r.firewoodKg)+' kg fw');
      var energy = ep.length ? ep.join(' · ') : '—';
      // initial→final meter readings for refiners, grinders, cracker, coarse (not autoclaves)
      var hasElec=(r.elecStart!==""&&r.elecStart!=null)||(r.elecEnd!==""&&r.elecEnd!=null);
      if(!isAuto && hasElec){ energy += '<br><span class="muted" style="font-size:10px">meter '+esc(r.elecStart!==""&&r.elecStart!=null?r.elecStart:'—')+' → '+esc(r.elecEnd!==""&&r.elecEnd!=null?r.elecEnd:'—')+(r.machineId==="GRD_O"?' ×3':'')+'</span>'; }
      var shiftChip = r.shift ? '<span class="qchip shift"'+(r.line==="coarse"?' style="background:var(--ember)"':(r.line==="special"?' style="background:#2b3550;color:#cfe0ff"':''))+'>'+esc(r.shift)+'</span>' : '';
      var srcs=runSources(r), mixLine = (!shiftwise && srcs.length>1) ? '<br><span style="font-size:10px;color:var(--ember)">mix: '+esc(srcs.join(" + "))+'</span>' : '';
      var col2 = shiftwise
        ? shiftChip+(r.batchNo?' <span class="batchref" style="font-size:11px">'+esc(r.batchNo)+'</span>':'')+(r.formulation?'<br><span class="muted" style="font-size:10px">'+esc(r.formulation)+'</span>':'')
        : '<span class="batchref" style="font-size:12px">'+esc(r.batchNo)+'</span>'+mixLine+(r.quality?'<br>'+qchip(r.quality):'')+(r.formulation?'<br><span class="muted" style="font-size:10px">'+esc(r.formulation)+'</span>':'');
      var wt = (r.weightKg!==""&&r.weightKg!=null) ? esc(r.weightKg)+' kg' : (r.needsWeigh ? '<span class="muted">pending</span>' : '—');
      var mlabel = r.short || shortName(r.machineId);
      var sup = r.supervisor ? esc(r.supervisor) : '<span class="muted">—</span>';
      var when = esc(fmtDay(runDate(r)))+(r.shift?' · '+esc(r.shift):'');
      var dk=dupKey(r), dup="";
      if(dk && dupCount[dk]>1){ dupSeen[dk]=(dupSeen[dk]||0)+1; dup=' <span style="color:var(--err);font-weight:700;font-size:10px">⚠ duplicate '+dupSeen[dk]+' of '+dupCount[dk]+'</span>'; }
      else if(!shiftwise && (r.passes||1)>1){ dup=' <span style="color:var(--err);font-weight:700;font-size:10px">⚠ merged '+r.passes+' entries</span>'; }
      else if(shiftwise && (r.passes||1)>1){ dup=' <span class="muted" style="font-size:10px">'+r.passes+' start/stops combined</span>'; }
      var runCell = fmtHrs(r.runtimeMin);
      var hasHour=(r.hourStart!==""&&r.hourStart!=null)||(r.hourEnd!==""&&r.hourEnd!=null);
      if(!isAuto && hasHour){ runCell += '<br><span class="muted" style="font-size:10px">hr '+esc(r.hourStart!==""&&r.hourStart!=null?r.hourStart:'—')+' → '+esc(r.hourEnd!==""&&r.hourEnd!=null?r.hourEnd:'—')+'</span>'; }
      return '<tr class="hrow"'+(canEditHistory()?' data-edit-run="'+esc(r.id)+'" style="cursor:pointer"':'')+'><td><span class="synced '+(r.synced?"yes":"")+'" title="'+(r.synced?"Saved to cloud":"Not yet synced to cloud")+'"></span></td>'+
        '<td><b>'+esc(mlabel)+'</b>'+dup+'<br><span class="muted" style="font-size:11px">'+when+'</span>'+(isAuto?acTimes(r):'')+'</td>'+
        '<td>'+col2+'</td>'+
        '<td>'+sup+'</td>'+
        '<td class="tnum">'+runCell+'</td>'+
        '<td class="tnum">'+energy+'</td>'+
        '<td class="tnum">'+(r.workers!==""?esc(r.workers):'—')+'</td>'+
        '<td class="tnum">'+wt+'</td></tr>';
    }).join("");
    if(!body) body='<tr><td colspan="8" style="text-align:center;color:var(--ink-dim);padding:22px">No runs match this filter.</td></tr>';

    var u=unsynced().length;
    return '<div class="view-head"><h1>History</h1><div class="meta">'+fr.length+' shown · '+u+' unsynced · <span class="synced yes" style="display:inline-block;vertical-align:middle"></span> = saved to cloud'+(canEditHistory()?' · tap a row to edit':' · view only')+'</div></div>'+
      filters+summary+
      '<div class="panel scroll-x"><table class="hist"><thead><tr><th></th><th>Machine</th><th>Batch</th><th>Super</th><th>Run (h)</th><th>Energy</th><th>Crew</th><th>Weight</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
      '<div style="margin-top:12px"><button class="btn ghost block" data-act="export">Export CSV backup</button></div>';
  }

  /* ---- Editable history: tap a row to correct or delete an entry ---- */
  function findRun(id){ for(var i=0;i<state.runs.length;i++){ if(state.runs[i].id===id) return state.runs[i]; } return null; }
  function openEditRun(id){
    if(!canEditHistory()){ toast("Only a manager or admin can edit or delete entries","warn"); return; }
    var r=findRun(id); if(!r){ closeSheet(); return; }
    var isShift=!!r.shiftwise;
    var mm=r.machineId?M(r.machineId):null;
    var isAuto=(r.kind==="autoclave")||(mm&&mm.kind==="autoclave");
    var mlabel=r.short||shortName(r.machineId)||r.machine||"";
    var whenTxt=isShift?(fmtDay(r.shiftDate)+' · '+r.shift):fmtDate(r.end);
    var rows="";
    var shiftDateRow='<div class="field-inline">'+
      '<div class="field"><label>Shift</label><select id="e-shift"><option value="Day"'+(r.shift==="Day"?" selected":"")+'>Day</option><option value="Night"'+(r.shift==="Night"?" selected":"")+'>Night</option></select></div>'+
      '<div class="field"><label>Shift date</label><input id="e-sdate" type="date" value="'+esc(r.shiftDate||"")+'"></div></div>';
    if(!isShift){
      rows+='<div class="field"><label>Batch number</label><input id="e-batch" type="text" value="'+esc(r.batchNo==null?"":r.batchNo)+'"></div>';
      var qopts='<option value="">—</option>'+QUALITIES.map(function(q){ return '<option value="'+esc(q)+'"'+(r.quality===q?" selected":"")+'>'+esc(q)+'</option>'; }).join("");
      rows+='<div class="field"><label>Quality</label><select id="e-qual">'+qopts+'</select></div>';
      rows+=shiftDateRow;
    } else {
      if(isAuto){
        rows+='<div class="field"><label>Coarse batch number</label><input id="e-cbatch" type="text" value="'+esc(r.batchNo==null?"":r.batchNo)+'"></div>';
      }
      rows+=shiftDateRow;
    }
    if(isAuto){
      var eLd = r.loadedAt!=null ? isoDate(new Date(r.loadedAt)) : (r.shiftDate||"");
      var eLt = r.loadedAt!=null ? fmtClock(r.loadedAt) : "";
      var eUd = r.unloadedAt!=null ? isoDate(new Date(r.unloadedAt)) : (r.shiftDate||"");
      var eUt = r.unloadedAt!=null ? fmtClock(r.unloadedAt) : "";
      rows+='<div class="sheet-label">Loading (date &amp; time)</div><div class="field-inline">'+
        '<div class="field" style="flex:1.3"><input id="e-ldate" type="date" value="'+esc(eLd)+'"></div>'+
        '<div class="field"><input id="e-ltime" type="time" value="'+esc(eLt)+'"></div></div>';
      rows+='<div class="sheet-label">Unloading (date &amp; time)</div><div class="field-inline">'+
        '<div class="field" style="flex:1.3"><input id="e-udate" type="date" value="'+esc(eUd)+'"></div>'+
        '<div class="field"><input id="e-utime" type="time" value="'+esc(eUt)+'"></div></div>';
      rows+='<div class="diffout" id="e-rtnote"></div>';
      rows+='<div class="field"><label>Workers</label><input id="e-wk" type="number" inputmode="numeric" value="'+esc(r.workers==null?"":r.workers)+'"></div>';
    } else {
      rows+='<div class="field-inline">'+
        '<div class="field"><label>Run time (min)</label><input id="e-rt" type="number" inputmode="decimal" value="'+esc(r.runtimeMin==null?"":r.runtimeMin)+'"></div>'+
        '<div class="field"><label>Workers</label><input id="e-wk" type="number" inputmode="numeric" value="'+esc(r.workers==null?"":r.workers)+'"></div></div>';
    }
    if(isAuto){
      rows+='<div class="field"><label>Firewood (kg)</label><input id="e-fw" type="number" inputmode="decimal" value="'+esc(r.firewoodKg==null?"":r.firewoodKg)+'"></div>';
    } else {
      rows+='<div class="field"><label>Energy (kWh)</label><input id="e-kwh" type="number" inputmode="decimal" value="'+esc(r.kWh==null?"":r.kWh)+'"></div>';
    }
    rows+='<div class="field"><label>Output weight (kg) <span class="muted" style="text-transform:none;letter-spacing:0">— blank = none</span></label><input id="e-wt" type="number" inputmode="decimal" value="'+esc(r.weightKg==null?"":r.weightKg)+'"></div>';
    openSheet('<div class="sheet-h"><b>Edit entry — '+esc(mlabel)+'</b></div>'+
      '<div class="sheet-sub">'+esc(whenTxt)+(r.synced?' · <span style="color:var(--ok)">synced</span>':' · <span class="muted">not synced</span>')+'</div>'+
      rows+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="e-save">Save changes</button></div>'+
      '<button class="btn danger block" id="e-del" style="margin-top:10px">Delete this entry</button>');
    function eVal(s){ var el=sheet.querySelector(s); return el?(el.value||""):""; }
    function eParseDT(d,t){ if(!d) return null; if(t){ var ms=Date.parse(d+"T"+t); return isNaN(ms)?null:ms; } var m2=Date.parse(d+"T12:00"); return isNaN(m2)?null:m2; }
    function eRtNote(){
      var note=sheet.querySelector("#e-rtnote"); if(!note) return;
      var lms=eParseDT(eVal("#e-ldate"),eVal("#e-ltime")), ums=eParseDT(eVal("#e-udate"),eVal("#e-utime"));
      if(lms==null||ums==null){ note.classList.remove("show","bad"); note.innerHTML=""; return; }
      var mins=Math.round((ums-lms)/60000*100)/100, h=Math.round((mins/60)*100)/100;
      note.classList.add("show"); note.classList.toggle("bad", mins<0);
      note.innerHTML = mins<0 ? "Unloading is before loading — check the times." : ("Run time: <b>"+h+" h</b> <span class=\"muted\">("+mins+" min)</span>");
    }
    if(isAuto){ ["#e-ldate","#e-ltime","#e-udate","#e-utime"].forEach(function(s){ var el=sheet.querySelector(s); if(el) el.addEventListener("input",eRtNote); }); eRtNote(); }
    sheet.querySelector("#e-save").addEventListener("click",function(){
      var es=sheet.querySelector("#e-shift"), ed=sheet.querySelector("#e-sdate");
      if(es) r.shift=es.value; if(ed && ed.value) r.shiftDate=ed.value;
      if(!isShift){
        var eb=sheet.querySelector("#e-batch"); if(eb) r.batchNo=(eb.value||"").trim();
        var eq=sheet.querySelector("#e-qual"); if(eq) r.quality=eq.value||"";
      } else {
        var ecb=sheet.querySelector("#e-cbatch"); if(ecb) r.batchNo=(ecb.value||"").trim();
      }
      if(isAuto){
        var lms=eParseDT(eVal("#e-ldate"),eVal("#e-ltime")), ums=eParseDT(eVal("#e-udate"),eVal("#e-utime"));
        if(lms!=null) r.loadedAt=lms;
        if(ums!=null) r.unloadedAt=ums;
        if(r.loadedAt!=null && r.unloadedAt!=null){
          if(r.unloadedAt<r.loadedAt){ toast("Unloading time is before loading time","warn"); return; }
          r.runtimeMin=Math.max(0, Math.round((r.unloadedAt-r.loadedAt)/60000*100)/100);
          r.hoursRun=Math.round((r.runtimeMin/60)*100)/100;
          r.end=r.unloadedAt;
        }
      } else {
        var ert=sheet.querySelector("#e-rt"); if(ert){ r.runtimeMin=num(ert.value); r.hoursRun=Math.round(((num(ert.value)||0)/60)*100)/100; }
      }
      var ewk=sheet.querySelector("#e-wk"); if(ewk) r.workers=num(ewk.value);
      var efw=sheet.querySelector("#e-fw"); if(efw) r.firewoodKg=num(efw.value);
      var ekwh=sheet.querySelector("#e-kwh"); if(ekwh) r.kWh=num(ekwh.value);
      var ewt=sheet.querySelector("#e-wt"); if(ewt) r.weightKg=num(ewt.value);
      var negs=[["Run time",r.runtimeMin],["Workers",r.workers],["Firewood",r.firewoodKg],["Energy",r.kWh],["Output weight",r.weightKg]];
      for(var ni=0;ni<negs.length;ni++){ if(negs[ni][1]!=null && negs[ni][1]!=="" && num(negs[ni][1])<0){ toast(negs[ni][0]+" can't be negative","warn"); return; } }
      r.synced=false;                                   // re-push: upsert updates the DB row
      save(); closeSheet(); render();
      toast("Entry updated"+(syncTarget()?" — will re-sync":""),"ok");
      scheduleAutoSync(500);
    });
    sheet.querySelector("#e-del").addEventListener("click",function(){ openDeleteRunSheet(id); });
  }
  function openDeleteRunSheet(id){
    var r=findRun(id); if(!r){ closeSheet(); return; }
    var mlabel=r.short||shortName(r.machineId)||r.machine||"";
    var whenTxt=r.shift?(fmtDay(r.shiftDate)+' · '+r.shift):fmtDate(r.end);
    openSheet('<div class="sheet-h"><b>Delete this entry?</b></div>'+
      '<div class="sheet-sub"><span class="batchref">'+esc(mlabel)+'</span> · '+esc(whenTxt)+'</div>'+
      '<div class="hint">Permanently removes this entry'+(r.synced?' from this device and the database':'')+'. This cannot be undone.</div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Keep entry</button>'+
      '<button class="btn danger" id="del-go">Yes, delete</button></div>');
    sheet.querySelector("#del-go").addEventListener("click",function(){ deleteRun(id); });
  }
  function deleteRun(id){
    var idx=-1, r=null;
    for(var i=0;i<state.runs.length;i++){ if(state.runs[i].id===id){ r=state.runs[i]; idx=i; break; } }
    if(idx<0){ closeSheet(); return; }
    var wasSynced=!!r.synced;
    state.runs.splice(idx,1);
    if(wasSynced && syncTarget()==="supabase"){
      state.pendingDeletes=state.pendingDeletes||[];
      if(state.pendingDeletes.indexOf(id)<0) state.pendingDeletes.push(id);
    }
    save(); closeSheet(); render();
    toast("Entry deleted","ok");
    if(wasSynced) scheduleAutoSync(400);
  }

  function viewBearing(){
    var machines=MACHINES.filter(function(m){ return bearingSpec(m); });
    var head='<div class="view-head"><h1>Bearing log</h1><div class="meta">'+dueMachines().length+' due now</div></div>';
    var intro='<div class="hint" style="margin:0 2px 12px">Grinders & crackers: log every 2 hours. Refiners: every 3 hours. Missed intervals are flagged. Use the late-time option if a reading was taken earlier.</div>';
    var cards=machines.map(function(m){
      var s=bearingStatus(m); if(!s) return "";
      var statCls = s.state==="ok"?"ok":(s.state==="due"?"due":(s.state==="miss"?"miss":"idle"));
      var statTxt = s.state==="ok"?"On schedule":(s.state==="due"?"Due now":(s.state==="miss"?("Missed ×"+s.missed):"Idle"));
      var sub = (s.spec.type==="bush"?"Bush":"Bearing")+' · every '+s.spec.intervalH+' h · '+esc(s.note);
      var overdueLine = (s.state==="due"||s.state==="miss") ? '<div class="bhint" style="color:var(--amber);margin-top:6px">⚠ Overdue by '+fmtDur(s.overdueMin)+(s.missed>1?' · '+s.missed+' intervals missed':'')+'</div>' : '';
      var evs=bearingEvents(m.id,4);
      var rows = evs.length ? evs.map(function(e){
        var temps=["1","2","3","4"].map(function(p){ return e.temps[p]!=null?e.temps[p]+"°":"—"; }).join(" / ");
        return '<div class="brow"><span class="bt">'+temps+'</span><span style="color:var(--ink-dim);font-size:11px">'+(e.supervisor?'👤 '+esc(e.supervisor)+' · ':'')+fmtDate(e.recordedAt)+'</span></div>';
      }).join("") : '<div class="bhint" style="margin-top:6px">No readings logged yet.</div>';
      return '<div class="bcard">'+
        '<div class="bhead"><div class="l"><span class="batchref" style="font-size:15px">'+esc(m.name)+'</span></div>'+
          '<span class="bstat '+statCls+'">'+statTxt+'</span></div>'+
        '<div class="bhint" style="margin-top:2px">'+sub+'</div>'+overdueLine+rows+
        '<button class="btn primary block" data-bearings="'+m.id+'" style="margin-top:10px">Log temperatures ▸</button>'+
      '</div>';
    }).join("");
    return head+intro+'<div class="stack">'+cards+'</div>';
  }

  function empty(icon,big,sub){ return '<div class="empty"><svg viewBox="0 0 24 24">'+icon+'</svg><div class="big">'+esc(big)+'</div><div>'+esc(sub)+'</div></div>'; }

  function viewSettings(){
    var u=unsyncedCount();
    var role=state.settings.role||"manager";
    var storeNote = lsOK ? "Data is saved on this device and works offline." :
      "Storage is blocked in this preview, so data lives only in memory. Save or install this file to keep data between sessions.";
    return '<div class="view-head"><h1>Settings</h1><div class="meta">device & sync</div></div>'+

      '<div class="panel"><div class="sheet-label" style="margin:0 0 10px">View mode for this device</div>'+
      '<div class="pickgrid">'+
        '<button class="pick'+(role==="manager"?' sel':'')+'" data-act="set-role" data-role="manager"><b>Manager</b><small>All tabs incl. Reports</small></button>'+
        '<button class="pick'+(role==="supervisor"?' sel':'')+'" data-act="set-role" data-role="supervisor"><b>Supervisor</b><small>Floor entry · no Reports</small></button>'+
        '<button class="pick'+(role==="qc"?' sel':'')+'" data-act="set-role" data-role="qc"><b>Quality (QC)</b><small>Only the Quality tab</small></button>'+
      '</div>'+
      '<div class="field" style="margin:14px 0 0"><label>Settings PIN <span class="muted" style="text-transform:none;letter-spacing:0">— optional, locks this screen</span></label>'+
      '<input id="set-pin" type="text" inputmode="numeric" autocomplete="off" placeholder="4–6 digits, blank = off" value="'+esc(state.settings.pin)+'" maxlength="6">'+
      '<div class="hint">Set a PIN on supervisor tablets so the view mode can\'t be changed on the floor.</div></div></div>'+

      '<div class="panel" style="margin-top:14px"><div class="field"><label>Device name</label>'+
      '<input id="set-device" type="text" placeholder="e.g. Floor Tablet 1" value="'+esc(state.settings.device)+'">'+
      '<div class="hint">Tags every captured row so you can tell devices apart.</div></div>'+
      '<div class="field"><label>Supabase URL</label>'+
      '<input id="set-sburl" type="url" inputmode="url" placeholder="https://xxxx.supabase.co" value="'+esc(state.settings.supabaseUrl)+'">'+
      '<div class="hint">Your project URL. Runs, dispatches & maintenance save straight into your database.</div></div>'+
      '<div class="field"><label>Supabase anon key</label>'+
      '<input id="set-sbkey" type="text" autocomplete="off" spellcheck="false" placeholder="eyJhbGciOiJ…" value="'+esc(state.settings.supabaseKey)+'">'+
      '<div class="hint">The public "anon" key from Project Settings → API. Safe to store on the tablet.</div></div>'+
      '<div class="field"><label>Sync URL <span class="muted" style="text-transform:none;letter-spacing:0">— optional, old Google Sheet path</span></label>'+
      '<input id="set-url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="'+esc(state.settings.syncUrl)+'">'+
      '<div class="hint">Only used if no Supabase URL is set above.</div></div>'+
      '<button class="btn primary block" data-act="save-settings">Save settings</button></div>'+

      '<div class="panel" style="margin-top:14px"><div class="sheet-label" style="margin:0 0 10px">Sync</div>'+
      '<div class="toggle-row" data-act="toggle-autosync"><div><b>Auto-sync</b><small>Sends new records on their own — after each entry, on reconnect, and every couple of minutes.</small></div>'+
      '<span class="toggle'+(autoSyncOn()?' on':'')+'"><i></i></span></div>'+
      '<div class="ro" style="margin:12px 0"><span class="k">Waiting to sync</span><span class="v">'+u+' rows</span></div>'+
      '<div class="ro" style="margin-bottom:12px"><span class="k">Last synced</span><span class="v">'+(state.lastSyncAt?esc(agoText(state.lastSyncAt)):"—")+'</span></div>'+
      '<div class="syncrow"><button class="btn elec" data-act="sync"'+(syncing?' disabled':'')+'>'+(syncing?"Syncing…":"Sync now")+'</button>'+
      '<button class="btn ghost" data-act="export">Export CSV</button></div>'+
      '<div style="margin-top:8px"><button class="btn ghost block" data-act="resync">Re-send all data</button></div>'+
      '<div class="hint" style="margin-top:10px">"Re-send all" pushes every record again. It is safe — records update by id and won\'t duplicate. '+esc(storeNote)+'</div>'+
      '<div style="margin-top:12px"><button class="btn ghost block" data-act="force-update">↻ Update app to latest version</button></div>'+
      '<div class="hint" style="margin-top:8px;opacity:.85">Use this if the tablet is stuck on an old version. It clears the cache and reloads the newest code from the server (needs internet).</div>'+
      '<div class="hint" style="margin-top:6px;opacity:.7">Build: app v33 · sync v6 · supabase</div></div>'+

      '<div class="panel" style="margin-top:14px"><div class="sheet-label" style="margin:0 0 10px">Customers & selling price</div>'+
      ((state.settings.customers||[]).length
        ? (state.settings.customers.map(function(c){
            return '<div class="custrow"><div><span class="cc">'+esc(c.code)+'</span>'+(c.name?' <span class="cn">'+esc(c.name)+'</span>':'')+'<br><span class="cp">₹'+esc(c.price)+'/kg</span></div>'+
              '<button class="wdel" data-custdel="'+esc(c.code)+'" aria-label="remove">✕</button></div>';
          }).join(""))
        : '<div class="hint" style="margin-bottom:10px">No customers yet. Each customer code carries a selling price, which is what lets the sheet work out profit per batch.</div>')+
      '<div id="cust-add" class="field-inline" style="margin-top:6px"><div class="field" style="flex:1.1;margin-bottom:0"><label>Code</label><input id="cust-code" type="text" autocomplete="off" placeholder="e.g. C001"></div>'+
      '<div class="field" style="flex:1.4;margin-bottom:0"><label>Name</label><input id="cust-name" type="text" autocomplete="off" placeholder="optional"></div>'+
      '<div class="field" style="flex:1;margin-bottom:0"><label>₹/kg</label><input id="cust-price" type="number" inputmode="decimal" placeholder="0"></div></div>'+
      '<button class="btn elec block" style="margin-top:11px" data-act="add-customer">+ Add customer</button></div>'+

      '<div class="panel" style="margin-top:14px"><div class="sheet-label" style="margin:0 0 10px">Danger zone</div>'+
      '<button class="btn danger block" data-act="reset-device">Reset device &amp; clear cloud</button>'+
      '<div class="hint" style="margin:8px 0 12px">Wipes this device and pushes an empty plant to the cloud so a fresh start actually holds. Clears runs, batches, dispatches, quality and bearing logs everywhere. Keeps this device\u2019s connection settings.</div>'+
      '<button class="btn ghost block" data-act="reset">Erase local data only</button>'+
      '<div class="hint" style="margin-top:8px;opacity:.8">Local-only erase — leaves the cloud copy untouched (it will sync back on next pull).</div></div>';
  }

  /* ===================== sheets ===================== */
  var scrim=document.getElementById("scrim"), sheet=document.getElementById("sheet");
  function openSheet(html){ sheet.innerHTML='<div class="grab"></div>'+html; scrim.classList.add("show"); sheet.classList.add("show"); }
  function closeSheet(){ scrim.classList.remove("show"); sheet.classList.remove("show"); }
  scrim.addEventListener("click",closeSheet);

  function sheetHead(m,sub){ return '<div class="sheet-h"><span class="led" style="'+(m?'':'display:none')+'"></span><b>'+esc(sub?m:(m||''))+'</b></div>'; }

  function openMachineSheet(mid){
    var m=M(mid), st=state.machines[mid];
    if(st.down) return openRepairSheet(mid);
    if(st.running) return openOffSheet(mid);
    if(m.kind==="coarse") return openCoarseLineSheet(mid);
    if(m.kind==="grind") return openShiftStart(mid);
    if(m.kind==="autoclave") return openAutoclaveOn(mid);
    return openRefinerOn(mid);
  }
  /* Coarse-line machines (PR1, R2) can run the coarse line (default, shiftwise) OR the special line (refine a batch to any grade). */
  function openCoarseLineSheet(mid){
    var m=M(mid);
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#f6c08a,var(--ember))"></span><b>Start '+esc(m.name)+'</b></div>'+
      '<div class="sheet-sub">Is '+esc(m.short)+' running the coarse line or the special line this time?</div>'+
      '<div class="pickgrid">'+
        '<button class="pick" data-cmode="coarse"><b>Coarse line</b><small>default · shiftwise coarse output</small></button>'+
        '<button class="pick" data-cmode="special"><b>Special line</b><small>refine a batch · any quality</small></button>'+
      '</div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button></div>');
    sheet.querySelectorAll("[data-cmode]").forEach(function(el){
      el.addEventListener("click",function(){
        var mode=el.getAttribute("data-cmode");
        if(mode==="coarse") openShiftStart(mid); else openRefinerOn(mid, null, {asSpecial:true});
      });
    });
  }

  function openShiftStart(mid){
    var m=M(mid), d=defaultShift(), picks={ shift:d.shift, tyre:(m.tyre?(m.defTyre||"truck"):null) };
    var grind=m.kind==="grind";
    var lr=lastRunFor(mid);
    var preElec=(lr&&lr.elecEnd!=null&&lr.elecEnd!=="")?lr.elecEnd:"";
    var preHour=(lr&&lr.hourEnd!=null&&lr.hourEnd!=="")?lr.hourEnd:"";
    var accent = grind?"var(--steel)":"var(--ember)";
    var ledA = grind?"#cfe0ee":"#f6c08a", ledB = grind?"var(--steel)":"var(--ember)";
    var shiftBtns=["Day","Night"].map(function(s){
      return '<button class="pick'+(s===d.shift?' sel':'')+'" data-pick-shift="'+s+'"><b>'+s+'</b><small>'+(s==="Day"?"08:30 – 20:30":"20:30 – 08:30")+'</small></button>';
    }).join("");
    var tyreBlock="";
    if(m.tyre){
      tyreBlock='<div class="sheet-label">Tyre feedstock</div><div class="pickgrid">'+
        ["truck","bike"].map(function(tk){
          return '<button class="pick'+(tk===picks.tyre?' sel':'')+'" data-pick-tyre="'+tk+'"><b>'+TYRES[tk].label+'</b><small>'+TYRES[tk].mesh+' crumb</small></button>';
        }).join("")+'</div>';
    }
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,'+ledA+','+ledB+');box-shadow:0 0 9px 1px '+ledB+'"></span><b>Start '+esc(m.name)+'</b></div>'+
      '<div class="sheet-sub">'+(grind?'Grinding line':'Coarse line')+' — pick the shift it is running for. Units &amp; crew at stop'+(m.outWeight?'; output weighed shiftwise.':'.')+'</div>'+
      '<div class="sheet-label">Date</div><div class="field" style="margin-bottom:0"><input id="ss-date" type="date" value=""></div>'+
      '<div class="sheet-label">Shift</div><div class="pickgrid">'+shiftBtns+'</div>'+
      tyreBlock+
      '<div class="field"><label>'+(mid==="GRD_O"?"Initial TOD-meter reading":"Initial electricity reading")+(preElec!==""?' <span class="muted" style="text-transform:none;letter-spacing:0">— last end '+preElec+'</span>':' <span class="muted" style="text-transform:none;letter-spacing:0">— meter units now</span>')+'</label><div class="num-suffix"><input id="ss-elec" type="number" inputmode="decimal" placeholder="meter reading" value="'+preElec+'"><span class="sfx">units</span></div>'+(mid==="GRD_O"?'<div class="hint" style="margin-top:5px">Soorya has no direct energy meter — this is the <b>TOD meter</b> (one phase); energy is recorded as the difference × 3.</div>':'')+'</div>'+
      '<div class="field"><label>Hour-meter reading at start'+(preHour!==""?' <span class="muted" style="text-transform:none;letter-spacing:0">— last end '+preHour+'</span>':'')+'</label><div class="num-suffix"><input id="ss-hour" type="number" inputmode="decimal" placeholder="hour meter now" value="'+preHour+'"><span class="sfx">hrs</span></div></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="ss-go">Start ▸</button></div>');
    sheet.querySelectorAll("[data-pick-shift]").forEach(function(el){
      el.addEventListener("click",function(){ picks.shift=el.getAttribute("data-pick-shift");
        sheet.querySelectorAll("[data-pick-shift]").forEach(function(g){ g.classList.remove("sel"); }); el.classList.add("sel"); });
    });
    sheet.querySelectorAll("[data-pick-tyre]").forEach(function(el){
      el.addEventListener("click",function(){ picks.tyre=el.getAttribute("data-pick-tyre");
        sheet.querySelectorAll("[data-pick-tyre]").forEach(function(g){ g.classList.remove("sel"); }); el.classList.add("sel"); });
    });
    sheet.querySelector("#ss-go").addEventListener("click",function(){
      var dt=sheet.querySelector("#ss-date").value; if(!dt){ toast("Pick a date","warn"); return; }
      var e0=sheet.querySelector("#ss-elec"), h0=sheet.querySelector("#ss-hour");
      if(e0 && (e0.value||"").trim()!=="" && num(e0.value)<=0){ toast("Initial electricity reading must be greater than zero","warn"); return; }
      if(h0 && (h0.value||"").trim()!=="" && num(h0.value)<=0){ toast("Initial hour-meter reading must be greater than zero","warn"); return; }
      startShiftMachine(mid, picks.shift, dt, picks.tyre, num(sheet.querySelector("#ss-elec").value), num(sheet.querySelector("#ss-hour").value));
    });
  }

  function openAutoclaveOn(mid){
    var m=M(mid), forms=autoclaveFormsFor(m.capacity), d=defaultShift();
    var only = forms.length===1?forms[0]:null;
    var picks={ form: only?only.name : null, type: only?only.type : null, paired:true, shift:d.shift };
    var formBtns=forms.map(function(f){
      var badge = f.type==="coarse" ? '<span class="qchip shift" style="background:var(--ember);font-size:9px">Coarse</span>'
                : (f.grade==="DRC" ? '<span class="qchip q-DRC" style="font-size:9px">DRC</span>'
                : '<span class="qchip q-Special" style="font-size:9px">Special</span>');
      return '<button class="pick'+(only?' sel':'')+'" data-pick-form="'+esc(f.name)+'" data-form-type="'+f.type+'"><b>'+esc(f.name)+'</b><small>'+badge+'</small></button>';
    }).join("");
    var pairBtns='<button class="pick sel" data-pick-pair="1"><b>With another</b><small>2 workers shared · 1 each</small></button>'+
                 '<button class="pick" data-pick-pair="0"><b>Loaded alone</b><small>2 workers</small></button>';
    var shiftBtns=["Day","Night"].map(function(s){
      return '<button class="pick'+(s===d.shift?' sel':'')+'" data-pick-shift="'+s+'"><b>'+s+'</b><small>'+(s==="Day"?"08:30 – 20:30":"20:30 – 08:30")+'</small></button>';
    }).join("");
    var specialMode = !only || only.type==="special";
    openSheet('<div class="sheet-h"><span class="led"></span><b>Load '+esc(m.name)+'</b></div>'+
      '<div class="sheet-sub">'+m.capacity+' kg · firewood entered at unload</div>'+
      '<div class="sheet-label">Formulation</div><div class="pickgrid">'+formBtns+'</div>'+
      '<div class="sheet-label">Loaded</div><div class="pickgrid">'+pairBtns+'</div>'+
      '<div id="ac-special" style="'+(specialMode?'':'display:none')+'">'+
        '<div class="sheet-label">Batch number</div>'+
        '<div class="field" style="margin-bottom:0"><input id="ac-batch" type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 2893"></div>'+
        '<div class="sheet-label">Shift date <span class="muted" style="text-transform:none;letter-spacing:0">— the night shift keeps its start date</span></div>'+
        '<div class="field" style="margin-bottom:0"><input id="ac-sdate" type="date" value=""></div></div>'+
      '<div id="ac-coarse" style="'+(specialMode?'display:none':'')+'">'+
        '<div class="sheet-label">Coarse batch number</div>'+
        '<div class="field" style="margin-bottom:0"><input id="ac-cbatch" type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. C-2893"></div>'+
        '<div class="sheet-label">Shift date</div>'+
        '<div class="field" style="margin-bottom:0"><input id="ac-date" type="date" value=""></div></div>'+
      '<div class="field-inline" style="margin-top:14px">'+
        '<div class="field"><label>Loading date <span class="muted" style="text-transform:none;letter-spacing:0">— actual load day</span></label><input id="ac-ldate" type="date" value=""></div>'+
        '<div class="field"><label>Loading time <span class="muted" style="text-transform:none;letter-spacing:0">— blank = now</span></label><input id="ac-loadtime" type="time"></div>'+
      '</div>'+
      '<div class="hint" id="ac-shiftnote" style="margin-top:-4px">Shift: <b>'+esc(d.shift)+'</b> <span class="muted" style="text-transform:none;letter-spacing:0">— taken from the loading time. The shift date above can differ from the loading date.</span></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="ac-go">Load ▸</button></div>');
    function sel(group,one){ group.forEach(function(g){ g.classList.remove("sel"); }); one.classList.add("sel"); }
    sheet.querySelectorAll("[data-pick-form]").forEach(function(el){
      el.addEventListener("click",function(){
        picks.form=el.getAttribute("data-pick-form"); picks.type=el.getAttribute("data-form-type");
        sel(sheet.querySelectorAll("[data-pick-form]"),el);
        var sp=picks.type==="special";
        sheet.querySelector("#ac-special").style.display=sp?"":"none";
        sheet.querySelector("#ac-coarse").style.display=sp?"none":"";
      });
    });
    sheet.querySelectorAll("[data-pick-pair]").forEach(function(el){
      el.addEventListener("click",function(){ picks.paired=el.getAttribute("data-pick-pair")==="1"; sel(sheet.querySelectorAll("[data-pick-pair]"),el); });
    });
    sheet.querySelectorAll("[data-pick-shift]").forEach(function(el){
      el.addEventListener("click",function(){ picks.shift=el.getAttribute("data-pick-shift"); sel(sheet.querySelectorAll("[data-pick-shift]"),el); });
    });
    var ltEl=sheet.querySelector("#ac-loadtime"), snEl=sheet.querySelector("#ac-shiftnote");
    function refreshShiftNote(){ var sh=shiftForTimeStr((ltEl&&ltEl.value)||""); picks.shift=sh; if(snEl) snEl.innerHTML='Shift: <b>'+esc(sh)+'</b> <span class="muted" style="text-transform:none;letter-spacing:0">— taken from the loading time'+((ltEl&&ltEl.value)?"":", now")+'</span>'; }
    if(ltEl) ltEl.addEventListener("input",refreshShiftNote);
    sheet.querySelector("#ac-go").addEventListener("click",function(){
      if(!picks.form){ toast("Pick a formulation","warn"); return; }
      function loadMs(shiftDateStr){
        var ld=(sheet.querySelector("#ac-ldate")||{}).value||"";
        var t=(sheet.querySelector("#ac-loadtime")||{}).value||"";
        if(!t) return null;
        var ms=Date.parse((ld||shiftDateStr||todayISO())+"T"+t); return isNaN(ms)?null:ms;   // load date + time (not the shift date)
      }
      var lt=(sheet.querySelector("#ac-loadtime")||{}).value||"";
      var shift=shiftForTimeStr(lt);                       // the loading time decides the shift
      if(picks.type==="coarse"){
        var dt=sheet.querySelector("#ac-date").value; if(!dt){ toast("Pick a date","warn"); return; }
        startAutoclaveCoarse(mid, picks.form, m.capacity, shift, dt, loadMs(dt), sheet.querySelector("#ac-cbatch").value, picks.paired);
      } else {
        var sdt=sheet.querySelector("#ac-sdate").value; if(!sdt){ toast("Pick a shift date","warn"); return; }
        startAutoclave(mid, sheet.querySelector("#ac-batch").value, picks.form, picks.paired, loadMs(sdt), sdt, shift);
      }
    });
  }

  function openRefinerOn(mid, forceQuality, opts){
    var m=M(mid), elig=eligibleBatches();
    var asSpecial=!!(opts&&opts.asSpecial);
    var canWeigh=(mid==="R2"||mid==="R4");           // R2 & R4 can run as production (weigh) or not
    var forced=forceQuality||null, wantQuality=(m.needsQuality||!!forced||asSpecial);
    var lr=lastRunFor(mid);
    var preElec=(lr&&lr.elecEnd!=null&&lr.elecEnd!=="")?lr.elecEnd:"";
    var preHour=(lr&&lr.hourEnd!=null&&lr.hourEnd!=="")?lr.hourEnd:"";
    if(!elig.length){
      openSheet('<div class="sheet-h"><span class="led"></span><b>'+esc(m.name)+'</b></div>'+
        '<div class="sheet-sub">No batches are ready yet.</div>'+
        empty('','Nothing to refine','Unload the autoclave first to make a batch selectable.')+
        '<div class="sheet-actions"><button class="btn ghost" data-act="close">Close</button></div>');
      return;
    }
    var picks={ batchId:null, quality:forced, mix:[], weigh:true };
    var batchBtns=elig.slice().reverse().map(function(b){
      return '<button class="pick" data-pick-batch="'+b.id+'"><b>'+esc(b.no)+'</b><small>'+esc(b.formulation)+'</small></button>';
    }).join("");
    var qBtns = forced
      ? ('<div class="sheet-label">Quality</div><div class="pickgrid q4"><button class="pick q sel" disabled style="opacity:1"><b><span class="qdot" style="background:var(--q-'+forced.toLowerCase()+')"></span>'+esc(forced)+'</b><small>fixed for '+esc(m.short)+'</small></button></div>')
      : ((m.needsQuality||asSpecial)?('<div class="sheet-label">Quality</div><div class="pickgrid q4">'+
        QUALITIES.map(function(q){ return '<button class="pick q" data-pick-q="'+q+'"><b><span class="qdot" style="background:var(--q-'+q.toLowerCase()+')"></span>'+q+'</b></button>'; }).join("")+'</div>'):'');
    var prodBtns = canWeigh ? ('<div class="sheet-label" style="margin-top:14px">Run type</div><div class="pickgrid">'+
        '<button class="pick sel" data-prod="1"><b>Production</b><small>default · weigh the output</small></button>'+
        '<button class="pick" data-prod="0"><b>Non-production</b><small>no weighing · rare</small></button>'+
      '</div>') : '';
    openSheet('<div class="sheet-h"><span class="led"></span><b>Start '+esc(m.name)+(forced?' · '+esc(forced):'')+(asSpecial?' · special line':'')+'</b></div>'+
      '<div class="sheet-sub">'+(forced?(esc(forced)+' grade · '):(asSpecial?'Running the special line · ':(m.sub?esc(m.sub.charAt(0).toUpperCase()+m.sub.slice(1))+' · ':'')))+'Pick batch'+(wantQuality&&!forced?' and quality.':'.')+'</div>'+
      '<div class="sheet-label">Batch</div><div class="pickgrid">'+batchBtns+'</div>'+qBtns+prodBtns+
      '<div id="mixbox" style="display:none"><div class="sheet-label" style="margin-top:14px">Mixed from <span class="muted" style="text-transform:none;letter-spacing:0">— add tailings of other batches</span></div><div class="pickgrid" id="mixgrid"></div></div>'+
      '<div class="field-inline" style="margin-top:14px">'+
        '<div class="field"><label>Date</label><input id="rf-date" type="date" value=""></div>'+
        '<div class="field"><label>Shift</label><select id="rf-shift"><option value="Day"'+(autoShift()==="Day"?" selected":"")+'>Day</option><option value="Night"'+(autoShift()==="Night"?" selected":"")+'>Night</option></select></div></div>'+
      '<div class="field"><label>Initial electricity reading'+(preElec!==""?' <span class="muted" style="text-transform:none;letter-spacing:0">— last end '+preElec+'</span>':' <span class="muted" style="text-transform:none;letter-spacing:0">— meter units now</span>')+'</label><div class="num-suffix"><input id="rf-elec" type="number" inputmode="decimal" placeholder="meter reading" value="'+preElec+'"><span class="sfx">units</span></div></div>'+
      '<div class="field"><label>Hour-meter reading at start'+(preHour!==""?' <span class="muted" style="text-transform:none;letter-spacing:0">— last end '+preHour+'</span>':'')+'</label><div class="num-suffix"><input id="rf-hour" type="number" inputmode="decimal" placeholder="hour meter now" value="'+preHour+'"><span class="sfx">hrs</span></div></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="start-go" disabled>Start ▸</button></div>');
    // wire selection
    sheet.querySelectorAll("[data-pick-batch]").forEach(function(el){
      el.addEventListener("click",function(){ picks.batchId=el.getAttribute("data-pick-batch");
        sel(sheet.querySelectorAll("[data-pick-batch]"),el); picks.mix=picks.mix.filter(function(id){return id!==picks.batchId;}); renderMix(); checkGo(); });
    });
    sheet.querySelectorAll("[data-pick-q]").forEach(function(el){
      el.addEventListener("click",function(){ picks.quality=el.getAttribute("data-pick-q");
        sel(sheet.querySelectorAll("[data-pick-q]"),el);
        var mixable=(picks.quality==="Fine"||picks.quality==="Medium");
        sheet.querySelector("#mixbox").style.display=mixable?"block":"none";
        if(!mixable) picks.mix=[];
        renderMix(); checkGo(); });
    });
    sheet.querySelectorAll("[data-prod]").forEach(function(el){
      el.addEventListener("click",function(){ picks.weigh=el.getAttribute("data-prod")==="1"; sel(sheet.querySelectorAll("[data-prod]"),el); });
    });
    function renderMix(){
      var box=sheet.querySelector("#mixgrid"); if(!box) return;
      var others=elig.filter(function(b){ return b.id!==picks.batchId; });
      box.innerHTML=others.slice().reverse().map(function(b){
        var on=picks.mix.indexOf(b.id)>-1;
        return '<button class="pick'+(on?' sel':'')+'" data-mix="'+b.id+'"><b>'+esc(b.no)+'</b><small>'+esc(b.formulation)+'</small></button>';
      }).join("") || '<div class="muted" style="padding:6px 2px">No other batches to mix.</div>';
      box.querySelectorAll("[data-mix]").forEach(function(el){
        el.addEventListener("click",function(){ var id=el.getAttribute("data-mix");
          var k=picks.mix.indexOf(id);
          if(k>-1) picks.mix.splice(k,1);
          else { if(picks.mix.length>=3){ toast("Up to 4 batches per mix","warn"); return; } picks.mix.push(id); }
          el.classList.toggle("sel"); });
      });
    }
    var go=sheet.querySelector("#start-go");
    go.addEventListener("click",function(){ if(go.disabled) return;
      var prim=batch(picks.batchId), primNo=prim?prim.no:"";
      var extraNos=picks.mix.map(function(id){ var bb=batch(id); return bb?bb.no:""; }).filter(Boolean);
      var src=[];
      if(picks.quality==="Medium") src=[primNo].concat(extraNos);
      else if(picks.quality==="Fine" && extraNos.length) src=[primNo].concat(extraNos);
      src=src.filter(function(v,i){ return v && src.indexOf(v)===i; }).slice(0,4);
      var e0=sheet.querySelector("#rf-elec"), h0=sheet.querySelector("#rf-hour");
      if(e0 && (e0.value||"").trim()!=="" && num(e0.value)<=0){ toast("Initial electricity reading must be greater than zero","warn"); return; }
      if(h0 && (h0.value||"").trim()!=="" && num(h0.value)<=0){ toast("Initial hour-meter reading must be greater than zero","warn"); return; }
      var rdt=(sheet.querySelector("#rf-date")||{}).value||""; if(!rdt){ toast("Pick a date","warn"); return; }
      var rsh=(sheet.querySelector("#rf-shift")||{}).value||autoShift();
      startRefiner(mid,picks.batchId,picks.quality,src,num(sheet.querySelector("#rf-elec").value),num(sheet.querySelector("#rf-hour").value),rdt,rsh,{weigh:(canWeigh?picks.weigh:!!m.weigh)}); });
    function checkGo(){ go.disabled=!(picks.batchId && (!wantQuality || picks.quality)); }
    function sel(group,one){ group.forEach(function(g){ g.classList.remove("sel"); }); one.classList.add("sel"); }
    if(forced && (forced==="Fine"||forced==="Medium")){ sheet.querySelector("#mixbox").style.display="block"; renderMix(); }
    checkGo();
  }

  function openOffSheet(mid){
    var m=M(mid), run=state.machines[mid].running;
    var sw=!!run.shiftwise, b=sw?null:batch(run.batchId);
    var elapsed=elapsedOf(run), eff=Date.now()-elapsed, paused=!!run.paused;
    var live='<div class="ro"><span class="k">Run time'+(paused?' · paused':'')+'</span><span class="v js-timer'+(paused?' paused':'')+'" data-start="'+eff+'" data-paused="'+(paused?1:0)+'">'+fmtElapsed(elapsed)+'</span></div>';
    var energyField, fields="", workerVal="";
    if(m.kind==="autoclave"){
      workerVal=autoclaveWorkers(sw ? run.paired : (b&&b.paired));
      var fwDefault=sw?400:FIREWOOD_KG;
      energyField='<div class="field"><label>Firewood</label><div class="num-suffix"><input id="f-fw" type="number" inputmode="decimal" value="'+fwDefault+'"><span class="sfx">kg</span></div></div>';
    } else {
      var dW=defaultWorkers(mid, run.shift);
      workerVal=(dW!=null ? dW : (sw?2:""));
      var es0=(run.elecStart===""||run.elecStart==null)?null:run.elecStart;
      var todLbl=(mid==="GRD_O")?"Final TOD-meter reading":"Final electricity reading";
      energyField='<div class="field"><label>'+todLbl+(es0!=null?' <span class="muted" style="text-transform:none;letter-spacing:0">— started at '+es0+'</span>':'')+'</label><div class="num-suffix"><input id="f-elec" type="number" inputmode="decimal" placeholder="meter reading now"><span class="sfx">units</span></div><div class="diffout" id="elec-diff"></div>'+
        '<div class="field" style="margin-top:8px"><label>…or enter the difference directly <span class="muted" style="text-transform:none;letter-spacing:0">— when only the used units are known</span></label><div class="num-suffix"><input id="f-elecdiff" type="number" inputmode="decimal" placeholder="units used"><span class="sfx">units</span></div></div>'+
        (mid==="GRD_O"?'<div class="hint" style="margin-top:5px">Soorya has no direct energy meter — this is the <b>TOD meter</b> (one phase); energy is recorded as the difference × 3.</div>':'')+'</div>';
    }
    fields='<div class="field-inline">'+energyField+
      '<div class="field"><label>Workers</label><input id="f-work" type="number" inputmode="numeric" placeholder="0" value="'+workerVal+'"></div></div>';
    if(m.weigh && !sw){
      fields+='<div class="field"><label>Output weight <span class="muted" style="text-transform:none;letter-spacing:0">— optional, or weigh later</span></label>'+
        '<div class="num-suffix"><input id="f-wt" type="number" inputmode="decimal" placeholder="leave blank to weigh later"><span class="sfx">kg</span></div></div>';
    }
    var hs=(run.hourStart===""||run.hourStart==null)?null:run.hourStart;
    var hourField;
    if(m.kind==="autoclave"){
      var loadedAtV=run.loadedAt||run.segStart||null;
      var loadDateV=run.shiftDate||todayISO();
      hourField='<div class="field"><label>Discharge date <span class="muted" style="text-transform:none;letter-spacing:0">— loaded '+esc(fmtDay(loadDateV))+'</span></label><input id="f-udate" type="date" value=""></div>'+
        '<div class="field"><label>Unloading time <span class="muted" style="text-transform:none;letter-spacing:0">— loaded '+(loadedAtV?fmtClock(loadedAtV):"—")+'; blank = now</span></label><input id="f-unload" type="time"></div>';
    } else {
      hourField='<div class="field"><label>Hour-meter reading at stop'+(hs!=null?' <span class="muted" style="text-transform:none;letter-spacing:0">— started at '+hs+'</span>':'')+'</label><div class="num-suffix"><input id="f-hour" type="number" inputmode="decimal" placeholder="hour meter now"><span class="sfx">hrs</span></div><div class="diffout" id="hour-diff"></div>'+
        '<div class="field" style="margin-top:8px"><label>…or enter the hours run directly <span class="muted" style="text-transform:none;letter-spacing:0">— when only the difference is known</span></label><div class="num-suffix"><input id="f-hourdiff" type="number" inputmode="decimal" placeholder="hours run"><span class="sfx">hrs</span></div></div></div>';
    }
    var title=m.kind==="autoclave"?(sw?"Unload Autoclave · Coarse":"Unload Autoclave"):"Stop "+m.name;
    var subline = sw
      ? '<span class="qchip shift" style="background:'+(run.line==="grind"?"var(--steel);color:#0e1a08":"var(--ember)")+'">'+esc(run.shift)+'</span> '+esc(fmtDay(run.shiftDate))+(run.batchNo?' · <span class="batchref">'+esc(run.batchNo)+'</span>':'')+(run.formulation?' · '+esc(run.formulation):'')+(run.tyreType?' · '+esc(TYRES[run.tyreType].label)+' '+esc(TYRES[run.tyreType].mesh):'')
      : '<span class="batchref">'+esc(b?b.no:'?')+'</span> · '+esc(b?b.formulation:'')+(run.quality?' · '+esc(run.quality):'')+(run.sourceBatches&&run.sourceBatches.length>1?' · <span class="muted" style="text-transform:none;letter-spacing:0">mix '+esc(run.sourceBatches.join(" + "))+'</span>':'');
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#c8f0a0,var(--amber));box-shadow:0 0 10px 1px var(--amber)"></span><b>'+title+'</b></div>'+
      '<div class="sheet-sub">'+subline+'</div>'+
      fields+hourField+
      (sw&&m.outWeight?'<div class="hint" style="margin-top:-4px">Output is weighed shiftwise in the Weigh tab after stopping.</div>':'')+
      '<div class="formwarn" id="off-warn"></div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Cancel</button>'+
      '<button class="btn primary" id="off-go">'+(m.kind==="autoclave"?"Log & unload":"Log run")+'</button></div>'+
      '<button class="btn danger block" id="off-cancelload" style="margin-top:10px">Cancel this load (entered by mistake)</button>');
    // A meter reading can never go backwards, and anything that should be a positive
    // quantity (energy used, hours run, output weight) can't be zero or negative.
    // Validate live so the supervisor sees the problem before submitting.
    function offValidate(){
      var elec=sheet.querySelector("#f-elec"), hr=sheet.querySelector("#f-hour"), wt=sheet.querySelector("#f-wt");
      var go=sheet.querySelector("#off-go"), warn=sheet.querySelector("#off-warn"), msgs=[];
      var elecD=sheet.querySelector("#elec-diff"), hourD=sheet.querySelector("#hour-diff");
      if(elec){
        var ev=(elec.value||"").trim();
        var es=(run.elecStart===""||run.elecStart==null)?null:num(run.elecStart);
        if(ev!==""){ var fin=num(elec.value);
          if(fin<=0) msgs.push("<b>Electricity:</b> the final reading must be greater than zero.");
          else if(es!=null && fin<es) msgs.push("<b>Electricity:</b> final reading ("+fin+") is below the start ("+es+") — a meter can't run backwards.");
          else if(es!=null && fin===es) msgs.push("<b>Electricity:</b> the reading hasn't moved, so energy used would be zero.");
        }
        if(elecD){
          if(ev==="" || es==null){ elecD.classList.remove("show"); elecD.innerHTML=""; }
          else { var d=Math.round((num(elec.value)-es)*100)/100;
            var mult=(mid==="GRD_O");
            elecD.classList.add("show"); elecD.classList.toggle("bad", d<0);
            elecD.innerHTML='Consumed: <b>'+esc(num(elec.value))+'</b> − '+esc(es)+' = <b>'+esc(d)+'</b> units'+(mult&&d>=0?' × 3 = <b>'+esc(Math.round(d*3*100)/100)+'</b> kWh':''); }
        }
      }
      if(hr){
        var hv=(hr.value||"").trim();
        var hsv=(hs==null?null:num(hs));
        if(hv!==""){ var fh=num(hr.value);
          if(fh<=0) msgs.push("<b>Hour-meter:</b> the stop reading must be greater than zero.");
          else if(hsv!=null && fh<hsv) msgs.push("<b>Hour-meter:</b> stop reading ("+fh+") is below the start ("+hsv+") — it can't go backwards.");
          else if(hsv!=null && fh===hsv) msgs.push("<b>Hour-meter:</b> the reading hasn't moved, so run time would be zero.");
        }
        if(hourD){
          if(hv==="" || hsv==null){ hourD.classList.remove("show"); hourD.innerHTML=""; }
          else { var dh=Math.round((num(hr.value)-hsv)*100)/100;
            hourD.classList.add("show"); hourD.classList.toggle("bad", dh<0);
            hourD.innerHTML='Run: <b>'+esc(num(hr.value))+'</b> − '+esc(hsv)+' = <b>'+esc(dh)+'</b> hrs'; }
        }
      }
      if(wt){ var wv=(wt.value||"").trim(); if(wv!==""){ var w=num(wt.value); if(w<=0) msgs.push("<b>Output weight:</b> must be greater than zero (leave blank to weigh later)."); } }
      if(msgs.length){ warn.innerHTML=msgs.join("<br>"); warn.classList.add("show"); go.disabled=true; go.classList.add("is-off"); }
      else { warn.classList.remove("show"); go.disabled=false; go.classList.remove("is-off"); }
      return msgs.length===0;
    }
    ["#f-elec","#f-hour","#f-wt"].forEach(function(sel){ var el=sheet.querySelector(sel); if(el) el.addEventListener("input",offValidate); });
    sheet.querySelector("#off-go").addEventListener("click",function(){
      if(!offValidate()){ toast("Check the highlighted readings before logging","warn"); return; }
      var f={};
      var elec=sheet.querySelector("#f-elec"), fw=sheet.querySelector("#f-fw"), wk=sheet.querySelector("#f-work"), wt=sheet.querySelector("#f-wt"), hr=sheet.querySelector("#f-hour");
      var elecDiffEl=sheet.querySelector("#f-elecdiff"), hourDiffEl=sheet.querySelector("#f-hourdiff");
      var directElec=(elecDiffEl && (elecDiffEl.value||"").trim()!=="")?num(elecDiffEl.value):null;
      var directHour=(hourDiffEl && (hourDiffEl.value||"").trim()!=="")?num(hourDiffEl.value):null;
      if(elec){
        var fin=num(elec.value), es=(run.elecStart===""||run.elecStart==null)?null:run.elecStart;
        f.elecEnd=fin; f.elecStart=es;
        if(directElec!=null){                       // difference entered directly (past-data entry)
          var dd=directElec; if(mid==="GRD_O") dd=dd*3;
          f.kWh=Math.max(0, Math.round(dd*100)/100);
        } else if(fin!=null && es!=null){
          var diff=fin-es;
          // Soorya grinder is read from a TOD meter that shows a single phase only,
          // so the true 3-phase energy is the meter difference × 3. Raw readings stay as-is.
          if(mid==="GRD_O") diff=diff*3;
          f.kWh=Math.max(0, Math.round(diff*100)/100);
        }
      }
      f.hourStart=hs;
      if(m.kind==="autoclave"){
        var loadedAt=run.loadedAt||run.segStart||Date.now();
        var unl=sheet.querySelector("#f-unload"), ut=unl?(unl.value||""):"";
        var udEl=sheet.querySelector("#f-udate"), ud=udEl?(udEl.value||""):"";
        if(!ud){ toast("Pick the discharge date","warn"); return; }
        var unloadedAt;
        if(ut){ var ms=Date.parse(ud+"T"+ut); unloadedAt=isNaN(ms)?Date.now():ms; }
        else { unloadedAt=(ud===todayISO())?Date.now():(Date.parse(ud+"T12:00")||Date.now()); }
        f.loadedAt=loadedAt; f.unloadedAt=unloadedAt; f.dischargeDate=ud;
      } else {
        if(directHour!=null) f.hoursDirect=directHour;   // hours entered directly
        else if(hr) f.hourEnd=num(hr.value);
      }
      if(fw) f.firewoodKg=num(fw.value);
      f.workers=wk?num(wk.value):null; if(wt) f.weightKg=num(wt.value);
      commitRun(mid,f);
    });
    var clb=sheet.querySelector("#off-cancelload");
    if(clb) clb.addEventListener("click",function(){ openCancelLoadSheet(mid); });
  }

  /* ---- Cancel a mistaken load (no run logged, crumb refunded) ---- */
  function batchReferenced(bid){
    if(!bid) return false;
    if(state.runs && state.runs.some(function(r){ return r.batchId===bid; })) return true;
    return MACHINES.some(function(mm){ var rr=state.machines[mm.id].running; return rr && rr.batchId===bid; });
  }
  function cancelLoad(mid){
    var m=M(mid), st=state.machines[mid], run=st&&st.running;
    if(!run){ closeSheet(); return; }
    var specialAC = m.kind==="autoclave" && !run.shiftwise;
    var bid = specialAC ? run.batchId : null;
    st.running=null;                                   // discard the load (nothing committed)
    if(bid && !batchReferenced(bid)){                  // remove the stray batch if unused
      state.batches=state.batches.filter(function(b){ return b.id!==bid; });
    }
    save(); closeSheet(); render();
    toast(m.short+" load cancelled — nothing logged","ok");
    postStatus(mid,"idle");
  }
  function openCancelLoadSheet(mid){
    var m=M(mid), run=state.machines[mid].running; if(!run){ closeSheet(); return; }
    var sw=!!run.shiftwise, b=sw?null:batch(run.batchId);
    var what = sw
      ? ((run.batchNo?esc(run.batchNo)+' · ':'')+esc(run.shift)+' · '+esc(fmtDay(run.shiftDate))+(run.formulation?' · '+esc(run.formulation):''))
      : (esc(b?b.no:'?')+(b&&b.formulation?' · '+esc(b.formulation):''));
    openSheet('<div class="sheet-h"><b>Cancel this load?</b></div>'+
      '<div class="sheet-sub"><span class="batchref">'+esc(m.name)+'</span> · '+what+'</div>'+
      '<div class="hint">Removes the load from '+esc(m.name)+'. Nothing is logged or sent — use only if it was entered by mistake.</div>'+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Keep loaded</button>'+
      '<button class="btn danger" id="cl-go">Yes, cancel load</button></div>');
    sheet.querySelector("#cl-go").addEventListener("click",function(){ cancelLoad(mid); });
  }

  function openWeighSheet(runId){
    var r=weighRow(runId); if(!r) return;
    if(!r.weighEntries) r.weighEntries=[];
    var entries=r.weighEntries, total=sum(entries);
    var convTo = (!r.shiftwise && r.machineId==="R4") ? CONVERTS[r.quality] : null;
    var canConv = !!convTo;
    var subline = '<div class="sheet-sub">'+(r.shiftwise
        ? (r.line==="grind"?'Grinder output · ':'Coarse · ')+esc(r.shift)+' shift · '+esc(fmtDay(r.shiftDate))+(r.tyreType?' · '+esc(TYRES[r.tyreType].label)+' '+esc(TYRES[r.tyreType].mesh):'')+(r.formulation?' · '+esc(r.formulation):'')
        : '<span class="batchref">'+esc(r.batchNo)+'</span> · '+esc(r.formulation)+' · '+esc(r.quality))+'</div>';

    var convBox = canConv ? '<div class="sheet-label" style="margin-top:16px">Found '+esc(convTo)+' in this '+esc(r.quality)+'?</div>'+
      '<div class="field-inline" style="align-items:stretch"><div class="field" style="flex:2;margin-bottom:0"><div class="num-suffix"><input id="w-conv" type="number" inputmode="decimal" placeholder="0"><span class="sfx">kg</span></div></div>'+
      '<button class="btn" id="w-conv-go" style="flex:1;border-color:#7a5a1f;color:var(--amber)">→ '+esc(convTo)+'</button></div>'+
      '<div class="hint" style="margin-top:-4px">Submits the '+esc(r.quality)+' weight, then moves this many kg — and its processing cost — to '+esc(convTo)+' of '+esc(r.batchNo)+'.</div>' : '';
    var list = entries.length
      ? '<div class="weighlist">'+entries.map(function(v,i){
          return '<div class="weighrow"><span class="tnum">'+v+' kg</span><button class="wdel" data-wdel="'+i+'" aria-label="remove">✕</button></div>';
        }).join("")+'</div>'
      : '<div class="hint" style="margin:4px 0 12px">No weighings added yet. Add each load — the total keeps building until you submit.</div>';
    openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#9fe0ea,var(--elec));box-shadow:0 0 10px 1px var(--elec)"></span><b>Weigh output</b></div>'+
      subline+
      '<div class="ro" style="margin-bottom:14px"><span class="k">Running total</span><span class="v" style="color:var(--elec)">'+total+' kg</span></div>'+
      list+
      '<div class="sheet-label">Add a weighing</div>'+
      '<div class="field-inline" style="align-items:stretch"><div class="field" style="flex:2;margin-bottom:0"><div class="num-suffix"><input id="w-add" type="number" inputmode="decimal" placeholder="0"><span class="sfx">kg</span></div></div>'+
      '<button class="btn elec" id="w-plus" style="flex:1">+ Add</button></div>'+
      convBox+
      '<div class="sheet-actions"><button class="btn ghost" data-act="close">Close</button>'+
      '<button class="btn primary" id="w-submit">Submit total</button></div>');
    var inp=sheet.querySelector("#w-add");
    setTimeout(function(){ try{ inp.focus(); }catch(e){} },120);
    function add(){ var v=num(inp.value); if(v==null||v<=0){ toast("Enter a weight","warn"); return; } addWeighEntry(runId,v); }
    sheet.querySelector("#w-plus").addEventListener("click",add);
    inp.addEventListener("keydown",function(e){ if(e.key==="Enter") add(); });
    sheet.querySelectorAll("[data-wdel]").forEach(function(el){
      el.addEventListener("click",function(){ removeWeighEntry(runId, parseInt(el.getAttribute("data-wdel"),10)); });
    });
    sheet.querySelector("#w-submit").addEventListener("click",function(){ submitWeight(runId); });
    if(canConv){ var cg=sheet.querySelector("#w-conv-go"); if(cg) cg.addEventListener("click",function(){ convertAtWeigh(runId, num(sheet.querySelector("#w-conv").value)); }); }
  }

  /* ===================== render & events ===================== */
  function openSettings(){ active="settings"; render(); }

  function render(){
    var role=state.settings.role;
    if(role==="supervisor" && (active==="reports"||active==="dispatch"||active==="quality")) active="machines";
    if(role==="qc" && active!=="quality" && active!=="settings") active="quality";
    renderTabs();
    var rc=runningCount(), el=document.getElementById("runcount");
    el.textContent=rc+" RUNNING"; el.className="runcount"+(rc?"":" zero");
    var v=document.getElementById("view"), html;
    if(active==="machines") html=viewMachines();
    else if(active==="batches") html=viewBatches();
    else if(active==="weigh") html=viewWeigh();
    else if(active==="packing") html=viewPacking();
    else if(active==="dispatch") html=viewDispatch();
    else if(active==="quality") html=viewQuality();
    else if(active==="history") html=viewHistory();
    else if(active==="bearing") html=viewBearing();
    else if(active==="settings") html=viewSettings();
    var sameTab=(lastTab===active);
    var winY=sameTab?(window.pageYOffset||document.documentElement.scrollTop||document.body.scrollTop||0):0;
    var vY=(sameTab&&v)?v.scrollTop:0;
    v.innerHTML=html;
    if(sameTab){ v.scrollTop=vY; window.scrollTo(0,winY); }
    else { v.scrollTop=0; window.scrollTo(0,0); }
    lastTab=active;
  }

  document.getElementById("tabs").addEventListener("click",function(e){
    var b=e.target.closest("[data-tab]"); if(!b) return; active=b.getAttribute("data-tab"); render();
  });

  document.body.addEventListener("change",function(e){
    var s=e.target.closest("[data-histfilter]"); if(!s) return;
    var k=s.getAttribute("data-histfilter"); histFilter[k]=s.value;
    if(k==="batch" && s.value!=="all"){ histFilter.date="all"; histFilter.shift="all"; }   // a chosen batch shows its whole history
    render();
  });

  document.body.addEventListener("click",function(e){
    var t;
    if((t=e.target.closest("[data-pause]"))){ var pid=t.getAttribute("data-pause");
      if(state.machines[pid].running && state.machines[pid].running.paused) resumeMachine(pid); else pauseMachine(pid); return; }
    if((t=e.target.closest("[data-qtake]"))){ var qt=t.getAttribute("data-qtake").split("|"); markTaken(qt[0],qt[1]); return; }
    if((t=e.target.closest("[data-closebatch-go]"))){ closeBatch(t.getAttribute("data-closebatch-go")); return; }
    if((t=e.target.closest("[data-closebatch]"))){ openCloseConfirm(t.getAttribute("data-closebatch")); return; }
    if((t=e.target.closest("[data-delbatch-go]"))){ deleteBatch(t.getAttribute("data-delbatch-go")); return; }
    if((t=e.target.closest("[data-delbatch]"))){ openDeleteBatchSheet(t.getAttribute("data-delbatch")); return; }
    if((t=e.target.closest("[data-batchinfo]"))){ openBatchDetail(t.getAttribute("data-batchinfo")); return; }
    if((t=e.target.closest("[data-liveweigh]"))){ openLiveWeighSheet(t.getAttribute("data-liveweigh")); return; }
    if((t=e.target.closest("[data-bearings]"))){ openBearingSheet(t.getAttribute("data-bearings")); return; }
    if((t=e.target.closest("[data-bearings-any]"))){ var dm=dueMachines()[0]; if(dm) openBearingSheet(dm.id); return; }
    if((t=e.target.closest("[data-breakdown-go]"))){ doMarkDown(t.getAttribute("data-breakdown-go")); return; }
    if((t=e.target.closest("[data-breakdown]"))){ markDown(t.getAttribute("data-breakdown")); return; }
    if((t=e.target.closest("[data-shift]"))){ openShiftPicker(); return; }
    if((t=e.target.closest("[data-machine]"))){ openMachineSheet(t.getAttribute("data-machine")); return; }
    if((t=e.target.closest("[data-weigh]"))){ openWeighSheet(t.getAttribute("data-weigh")); return; }
    if((t=e.target.closest("[data-pack]"))){ openPackSheet(t.getAttribute("data-pack")); return; }
    if((t=e.target.closest("[data-load]"))){ openLoadDetail(t.getAttribute("data-load")); return; }
    if((t=e.target.closest("[data-qc-batch]"))){ openQcBatch(t.getAttribute("data-qc-batch")); return; }
    if((t=e.target.closest("[data-qc-coarse]"))){ openQcCoarse(t.getAttribute("data-qc-coarse")); return; }
    if((t=e.target.closest("[data-edit-run]"))){ openEditRun(t.getAttribute("data-edit-run")); return; }
    if((t=e.target.closest("[data-custdel]"))){ var cd=t.getAttribute("data-custdel");
      state.settings.customers=(state.settings.customers||[]).filter(function(c){ return c.code!==cd; }); save(); render(); return; }
    var a=e.target.closest("[data-act]"); if(!a) return;
    var act=a.getAttribute("data-act");
    if(act==="settings"){ openSettings(); }
    else if(act==="new-dispatch"){ openDispatchBuilder(); }
    else if(act==="go-customers"){ closeSheet(); active="settings"; render(); setTimeout(function(){ var el=document.getElementById("cust-add"); if(el) el.scrollIntoView({block:"center"}); },60); }
    else if(act==="add-customer"){
      var cc=(document.getElementById("cust-code").value||"").trim().toUpperCase();
      var cn=(document.getElementById("cust-name").value||"").trim();
      var cp=num(document.getElementById("cust-price").value);
      if(!cc){ toast("Enter a customer code","warn"); return; }
      if(cp==null){ toast("Enter a selling price","warn"); return; }
      if(!state.settings.customers) state.settings.customers=[];
      if(state.settings.customers.some(function(c){ return c.code===cc; })){ toast("Code "+cc+" already exists","warn"); return; }
      state.settings.customers.push({ code:cc, name:cn, price:cp }); save(); render(); toast("Customer "+cc+" added","ok");
    }
    else if(act==="close"){ closeSheet(); }
    else if(act==="sync"){ syncNow(); }
    else if(act==="toggle-autosync"){
      state.settings.autoSync=!autoSyncOn(); save(); render();
      if(autoSyncOn()) autoSync();
    }
    else if(act==="resync"){
      state.runs.forEach(function(x){ x.synced=false; });
      (state.dispatches||[]).forEach(function(x){ x.synced=false; });
      (state.maintenance||[]).forEach(function(x){ x.synced=false; });
      (state.bearingLogs||[]).forEach(function(x){ x.synced=false; });
      (state.conversions||[]).forEach(function(x){ x.synced=false; });
      save(); render(); syncNow();
    }
    else if(act==="export"){ exportCSV(); }
    else if(act==="force-update"){ forceUpdate(); }
    else if(act==="set-role"){
      var dEl=document.getElementById("set-device"), uEl=document.getElementById("set-url"), pEl=document.getElementById("set-pin");
      var sbU=document.getElementById("set-sburl"), sbK=document.getElementById("set-sbkey");
      if(dEl) state.settings.device=(dEl.value||"").trim();
      if(uEl) state.settings.syncUrl=(uEl.value||"").trim();
      if(sbU) state.settings.supabaseUrl=(sbU.value||"").trim();
      if(sbK) state.settings.supabaseKey=(sbK.value||"").trim();
      if(pEl) state.settings.pin=(pEl.value||"").replace(/\D/g,"").slice(0,6);
      state.settings.role=a.getAttribute("data-role"); save(); render();
    }
    else if(act==="save-settings"){
      state.settings.device=(document.getElementById("set-device").value||"").trim();
      state.settings.syncUrl=(document.getElementById("set-url").value||"").trim();
      state.settings.supabaseUrl=(document.getElementById("set-sburl").value||"").trim();
      state.settings.supabaseKey=(document.getElementById("set-sbkey").value||"").trim();
      var pinEl=document.getElementById("set-pin"); if(pinEl) state.settings.pin=(pinEl.value||"").replace(/\D/g,"").slice(0,6);
      save(); render(); toast("Settings saved","ok");
    }
    else if(act==="reset"){
      openSheet('<div class="sheet-h"><b>Erase all local data?</b></div>'+
        '<div class="sheet-sub">This removes every batch, run and setting on this device. It cannot be undone.</div>'+
        '<div class="sheet-actions"><button class="btn ghost" data-act="close">Keep data</button>'+
        '<button class="btn danger" data-act="reset-confirm">Erase everything</button></div>');
    }
    else if(act==="reset-confirm"){ state=blank(); MACHINES.forEach(function(m){ state.machines[m.id]={running:null,down:null}; }); save(); closeSheet(); active="machines"; render(); toast("All data erased","ok"); }
    else if(act==="reset-device"){
      openSheet('<div class="sheet-h"><span class="led" style="background:radial-gradient(circle at 35% 30%,#ffb3b3,var(--err));box-shadow:0 0 10px 1px var(--err)"></span><b>Reset device &amp; clear cloud?</b></div>'+
        '<div class="sheet-sub">This wipes this tablet <b>and</b> the shared cloud copy — every batch, run, dispatch, quality result and bearing log for the whole plant. An empty plant is pushed so the fresh start holds. This cannot be undone.</div>'+
        '<div class="hint" style="margin-top:8px">Connection settings (Supabase URL, key, device name, role, PIN) are kept so this tablet stays connected.</div>'+
        '<div class="sheet-actions"><button class="btn ghost" data-act="close">Keep data</button>'+
        '<button class="btn danger" data-act="reset-device-go">Reset &amp; clear cloud</button></div>');
    }
    else if(act==="reset-device-go"){ resetDevice(); }
  });

  /* live timers */
  setInterval(function(){
    var now=Date.now();
    document.querySelectorAll(".js-timer").forEach(function(el){
      if(el.getAttribute("data-paused")==="1") return;
      var s=parseInt(el.getAttribute("data-start"),10); el.textContent=fmtElapsed(now-s);
    });
  },1000);

  // Smart auto-sync: periodic catch-up, on reconnect, and when the app regains focus.
  setInterval(autoSync, 120000);
  // Pull the shared master copy so each phone mirrors the others (skip while a sheet is open).
  setInterval(function(){ if(!sheetIsOpen()){ pullShared(); pullQuality(); } flushQcUploads(); }, 20000);
  // Live status heartbeat: re-announce running machines so the monitor stays current.
  setInterval(postAllStatus, 60000);
  setTimeout(postAllStatus, 4000);
  // Live-state mirror for the read-only monitor app.
  setInterval(pushLiveState, 60000);
  setTimeout(pushLiveState, 5000);
  // Auto shift-by-clock + refresh bearing-due warnings on the Machines screen.
  setInterval(function(){ if(active==="machines") render(); }, 60000);
  if(typeof window!=="undefined"){
    window.addEventListener("online", function(){ scheduleAutoSync(1500); pullShared(); pullQuality(); flushQcUploads(); });
    window.addEventListener("focus", function(){ scheduleAutoSync(1500); pullShared(); pullQuality(); flushQcUploads(); });
  }
  if(typeof document!=="undefined"){
    document.addEventListener("visibilitychange", function(){ if(!document.hidden){ scheduleAutoSync(1500); pullShared(); pullQuality(); flushQcUploads(); } });
  }

  /* toast */
  var toastEl=document.getElementById("toast"), toastT=null;
  function toast(msg,kind){ toastEl.textContent=msg; toastEl.className=(kind||"")+" show";
    clearTimeout(toastT); toastT=setTimeout(function(){ toastEl.className=kind||""; },2400); }

  /* boot */
  /* Block Chrome pull-to-refresh when the page is at the very top,
     but never interfere with scrolling inside an open sheet/list. */
  (function(){
    var startY=0;
    document.addEventListener("touchstart",function(e){
      startY=e.touches?e.touches[0].clientY:0;
    },{passive:true});
    document.addEventListener("touchmove",function(e){
      if(!e.touches||e.touches.length>1) return;
      var y=e.touches[0].clientY, pullingDown=y>startY;
      if(!pullingDown) return;
      var scroller=document.scrollingElement||document.documentElement;
      if(scroller.scrollTop>0) return;            // page not at top -> allow normal scroll
      var el=e.target;                            // allow if an inner scroller is mid-scroll
      while(el && el!==document.body){
        if(el.scrollHeight>el.clientHeight && el.scrollTop>0) return;
        el=el.parentNode;
      }
      e.preventDefault();                         // at the very top, pulling down -> no refresh
    },{passive:false});
  })();
  load();
  render();
  scheduleAutoSync(3000);
  // Hydrate from the shared master copy on open; if the master is empty/behind and this
  // phone already holds real data, seed the master from here.
  setTimeout(function(){
    pullShared({cb:function(applied){
      if(!applied){
        var hasData=(state.runs&&state.runs.length)||(state.batches&&state.batches.length)||
                    (state.dispatchLoads&&state.dispatchLoads.some(function(l){return !l.dummy;}));
        if(hasData) scheduleSharedPush();
      }
    }});
    pullQuality();
    flushQcUploads();
  }, 1500);
  if("serviceWorker" in navigator){ try{ navigator.serviceWorker.register("sw.js"); }catch(e){} }

  /* Manual "Update app" — wipes the cached code + service worker and reloads the
     newest version straight from the server. Used when a tablet is stuck on an old build. */
  window.forceUpdate=function(){
    if(navigator.onLine===false){ toast("No internet — connect first, then update","warn"); return; }
    toast("Updating to the latest version…","ok");
    var reloaded=false;
    function reload(){ if(reloaded) return; reloaded=true;
      try{ var u=location.href.split("#")[0]; location.replace(u+(u.indexOf("?")>-1?"&":"?")+"v="+Date.now()); }
      catch(e){ location.reload(); } }
    var steps=[];
    if(navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
      steps.push(navigator.serviceWorker.getRegistrations().then(function(regs){
        return Promise.all((regs||[]).map(function(r){ try{ return r.unregister(); }catch(e){ return null; } }));
      }).catch(function(){}));
    }
    if(window.caches && caches.keys){
      steps.push(caches.keys().then(function(keys){
        return Promise.all((keys||[]).map(function(k){ return caches.delete(k); }));
      }).catch(function(){}));
    }
    Promise.all(steps).then(reload, reload);
    setTimeout(reload, 4000);   // safety: reload even if a step hangs
  };
})();
</script>
</body>
</html>

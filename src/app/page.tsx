"use client";
import { useState, useEffect, useRef } from "react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400;1,6..72,500&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Caveat:wght@500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#14110E;--bg2:#1A1612;--bg3:#211D18;--bg4:#2A2520;
  --red:#D9442B;--red2:#A8311E;--red3:rgba(217,68,43,0.1);
  --cream:#F6F1E7;--cream2:#D8CDB6;--cream3:#A89880;--cream4:#6B5E50;
  --amber:#E8A33B;--green:#4A9150;
  --b:rgba(246,241,231,0.07);--br:rgba(217,68,43,0.22);
  --head:'Newsreader',Georgia,serif;
  --ui:'Inter Tight',system-ui,sans-serif;
  --mono:'JetBrains Mono',monospace;
  --soft:'Caveat',cursive;
}
html{scroll-behavior:smooth}
body{font-family:var(--ui);background:var(--bg);color:var(--cream);overflow-x:hidden;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;z-index:9999;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");opacity:0.03}
nav{position:fixed;top:0;left:0;right:0;z-index:200;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;transition:background .3s,border-color .3s}
nav.scrolled{background:rgba(20,17,14,.94);backdrop-filter:blur(24px);border-bottom:1px solid var(--b)}
.logo{font-family:var(--head);font-style:italic;font-size:24px;color:var(--cream);letter-spacing:-.02em;text-decoration:none}
.logo b{color:var(--red);font-weight:400}
.nav-c{display:flex;gap:36px;list-style:none;position:absolute;left:50%;transform:translateX(-50%)}
.nav-c a{font-size:14px;font-weight:500;color:var(--cream2);text-decoration:none;letter-spacing:-.01em;transition:color .2s}
.nav-c a:hover{color:var(--cream)}
.nav-r{display:flex;gap:10px;align-items:center}
.nbg{padding:8px 18px;border-radius:9999px;border:1px solid rgba(246,241,231,.15);background:transparent;color:var(--cream2);font-size:13px;font-weight:500;font-family:var(--ui);cursor:pointer;transition:all .2s;letter-spacing:-.01em}
.nbg:hover{border-color:rgba(246,241,231,.35);color:var(--cream)}
.nbr{padding:8px 20px;border-radius:9999px;background:var(--red);border:none;color:var(--cream);font-size:13px;font-weight:600;font-family:var(--ui);cursor:pointer;letter-spacing:-.01em;box-shadow:rgba(217,68,43,.45) 0 4px 16px -4px;transition:all .2s}
.nbr:hover{background:#e54e35;transform:translateY(-1px)}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:0 24px 100px;position:relative;overflow:hidden}
.hglow{position:absolute;top:-180px;left:50%;transform:translateX(-50%);width:1000px;height:700px;background:radial-gradient(ellipse,rgba(217,68,43,.13) 0%,transparent 65%);pointer-events:none}
.hglow2{position:absolute;bottom:0;right:5%;width:500px;height:400px;background:radial-gradient(ellipse,rgba(232,163,59,.04) 0%,transparent 65%);pointer-events:none}
.hero::after{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(246,241,231,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(246,241,231,.02) 1px,transparent 1px);background-size:80px 80px;mask-image:radial-gradient(ellipse 80% 70% at 50% 20%,black 25%,transparent 70%);pointer-events:none}
.hi{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:136px;max-width:880px}
.ep{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 8px;border-radius:9999px;background:rgba(26,22,18,.85);border:1px solid rgba(217,68,43,.28);box-shadow:rgba(217,68,43,.1) 0 0 24px;font-size:12px;margin-bottom:32px;animation:fu .7s .1s both}
.ep .chip{background:var(--red);color:#fff;padding:2px 10px;border-radius:9999px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-family:var(--mono)}
.ep .pt{color:var(--cream2);font-size:12px;letter-spacing:-.005em}
h1{font-family:var(--head);font-size:clamp(54px,8.5vw,96px);font-weight:400;line-height:.96;letter-spacing:-.03em;color:var(--cream);animation:fu .8s .18s both}
h1 em{font-style:italic;color:var(--red)}
h1 .sl{display:block;font-size:clamp(38px,5.5vw,64px);color:var(--cream2);opacity:.5;margin-top:8px}
.hclaim{margin-top:28px;font-size:18px;line-height:1.65;color:var(--cream2);max-width:530px;letter-spacing:-.01em;animation:fu .8s .26s both}
.hclaim strong{color:var(--cream);font-weight:600}
.hctas{margin-top:36px;display:flex;gap:12px;align-items:center;animation:fu .8s .34s both;flex-wrap:wrap;justify-content:center}
.bth{padding:15px 32px;border-radius:9999px;background:var(--red);border:none;color:var(--cream);font-size:16px;font-weight:700;font-family:var(--ui);cursor:pointer;letter-spacing:-.015em;box-shadow:rgba(217,68,43,.55) 0 8px 28px -6px,rgba(255,180,160,.12) 0 1px 0 inset;transition:all .25s}
.bth:hover{background:#e54e35;box-shadow:rgba(217,68,43,.7) 0 12px 36px -6px;transform:translateY(-2px)}
.bto{padding:15px 28px;border-radius:9999px;background:transparent;border:1px solid rgba(246,241,231,.18);color:var(--cream);font-size:16px;font-weight:500;font-family:var(--ui);cursor:pointer;letter-spacing:-.015em;transition:all .2s}
.bto:hover{border-color:rgba(246,241,231,.38)}
.nc{margin-top:14px;font-family:var(--soft);font-size:15px;color:var(--cream3);animation:fu .8s .4s both}
.demo-w{margin-top:72px;width:100%;max-width:980px;animation:fu .9s .45s both;position:relative;z-index:1}
.dshell{background:var(--bg2);border-radius:22px;border:1px solid var(--b);box-shadow:rgba(217,68,43,.06) 0 0 0 1px,rgba(0,0,0,.6) 0 60px 120px -20px,rgba(0,0,0,.25) 0 24px 48px -12px;overflow:hidden}
.dchrome{background:var(--bg3);padding:13px 20px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:14px}
.cdots{display:flex;gap:7px}
.cdots i{width:11px;height:11px;border-radius:50%;display:block}
.cdots i:nth-child(1){background:#FF5F57}
.cdots i:nth-child(2){background:#FEBC2E}
.cdots i:nth-child(3){background:#28C840}
.cbar{flex:1;background:rgba(246,241,231,.04);border:1px solid var(--b);border-radius:8px;padding:6px 14px;font-family:var(--mono);font-size:12px;color:var(--cream3);opacity:.5;text-align:center}
.dstage{display:grid;grid-template-columns:1fr 1px 1fr;min-height:370px}
.ddiv{background:var(--b)}
.pcam{padding:28px 32px;display:flex;flex-direction:column;gap:20px}
.pkds{padding:28px 32px;display:flex;flex-direction:column;gap:16px}
.plabel{display:flex;align-items:center;justify-content:space-between}
.pl{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream3)}
.spill{display:flex;align-items:center;gap:5px;font-family:var(--mono);font-size:11px;color:var(--cream3);padding:4px 10px;border-radius:9999px;border:1px solid var(--b);background:rgba(246,241,231,.03)}
.sd{width:6px;height:6px;border-radius:50%;background:var(--green);animation:gpulse 1.6s ease-in-out infinite}
.sd.amber{background:var(--amber);animation:none}
.wbox{background:rgba(246,241,231,.025);border:1px solid var(--b);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:14px}
.wf{display:flex;align-items:center;gap:3px;height:40px;justify-content:center}
.wf .wb{width:3px;border-radius:3px;background:var(--red);transform-origin:center}
.wf.silent .wb{height:4px;opacity:.15}
.wf.speaking .wb{animation:wwave var(--ws,.5s) var(--wd,0s) ease-in-out infinite alternate}
@keyframes wwave{from{height:4px;opacity:.4}to{height:calc(var(--wh,10)*1px);opacity:.85}}
.tr{font-family:var(--mono);font-size:14px;color:var(--cream);line-height:1.7;min-height:44px}
.tc{display:inline-block;width:2px;height:1.1em;background:var(--red);margin-left:2px;vertical-align:bottom;animation:blink .9s step-end infinite}
@keyframes blink{50%{opacity:0}}
.mtag{display:inline-flex;align-items:center;gap:8px;background:rgba(217,68,43,.1);border:1px solid var(--br);border-radius:10px;padding:8px 14px;font-family:var(--mono);font-size:13px;color:#E07060;font-weight:500;transform:scale(.95);opacity:0;transition:all .4s cubic-bezier(.34,1.56,.64,1)}
.mtag.show{transform:scale(1);opacity:1}
.ktopbar{display:flex;align-items:center;justify-content:space-between}
.stag{font-family:var(--mono);font-size:12px;color:var(--green);background:rgba(74,145,80,.1);border:1px solid rgba(74,145,80,.2);border-radius:9999px;padding:4px 12px;opacity:0;transition:opacity .4s}
.stag.show{opacity:1}
.tkt{background:rgba(246,241,231,.03);border:1px solid var(--b);border-radius:14px;overflow:hidden;opacity:0;transform:translateY(8px);transition:all .5s cubic-bezier(.22,1,.36,1)}
.tkt.show{opacity:1;transform:translateY(0)}
.tkth{background:rgba(217,68,43,.07);border-bottom:1px solid var(--b);padding:13px 18px;display:flex;align-items:center;justify-content:space-between}
.tktm{font-family:var(--mono);font-size:16px;font-weight:600;color:var(--cream)}
.tkth2{font-family:var(--mono);font-size:11px;color:var(--cream3)}
.tktis{padding:12px 18px;display:flex;flex-direction:column;gap:9px}
.tkti{display:flex;align-items:flex-start;gap:12px;opacity:0;transform:translateX(-6px);transition:all .35s cubic-bezier(.22,1,.36,1)}
.tkti.show{opacity:1;transform:translateX(0)}
.tq{font-family:var(--mono);font-size:15px;font-weight:600;color:var(--red);min-width:26px}
.tn{font-size:14px;font-weight:500;color:var(--cream);line-height:1.35;flex:1}
.tnota{font-family:var(--soft);font-size:14px;color:var(--amber);display:block}
.test{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.04em;padding:3px 9px;border-radius:5px;background:rgba(74,145,80,.12);color:var(--green);border:1px solid rgba(74,145,80,.2);white-space:nowrap;margin-top:2px}
.tktf{border-top:1px solid var(--b);padding:11px 18px;display:flex;align-items:center;justify-content:space-between}
.bmarch{background:var(--green);border:none;color:#fff;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:7px 16px;border-radius:7px;cursor:pointer;box-shadow:rgba(74,145,80,.5) 0 4px 14px -4px;opacity:0;transition:all .3s}
.bmarch.show{opacity:1}
.tempty{font-family:var(--mono);font-size:12px;color:var(--cream3);opacity:.3;padding:20px 0;text-align:center}
.stats{display:flex;justify-content:center;width:100%;max-width:720px;margin:60px auto 0;border:1px solid var(--b);border-radius:18px;overflow:hidden;background:linear-gradient(135deg,var(--bg2),var(--bg3));animation:fu .9s .6s both;position:relative;z-index:1}
.stat{flex:1;padding:28px 20px;text-align:center;border-right:1px solid var(--b)}
.stat:last-child{border-right:none}
.snum{font-family:var(--head);font-style:italic;font-size:42px;line-height:1;color:var(--cream);letter-spacing:-.025em}
.snum span{color:var(--red)}
.slbl{font-family:var(--mono);font-size:11px;color:var(--cream3);letter-spacing:.06em;text-transform:uppercase;margin-top:8px}
.section-tag{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);margin-bottom:20px;display:flex;align-items:center;gap:10px}
.section-tag::before{content:'';display:block;width:24px;height:1px;background:var(--red)}
.reveal{opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
.reveal.in{opacity:1;transform:translateY(0)}
.rd1{transition-delay:.1s}.rd2{transition-delay:.2s}.rd3{transition-delay:.3s}
.pain{max-width:1100px;margin:0 auto;padding:120px 40px 80px}
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center}
.ptxt h2{font-family:var(--head);font-style:italic;font-size:clamp(30px,4vw,48px);font-weight:400;line-height:1.1;letter-spacing:-.025em;color:var(--cream);margin-bottom:20px}
.ptxt h2 strong{font-style:normal;font-weight:400;color:var(--red)}
.ptxt p{font-size:17px;line-height:1.7;color:var(--cream2);letter-spacing:-.01em;margin-bottom:16px}
.pitems{display:flex;flex-direction:column;gap:0;border:1px solid var(--b);border-radius:16px;overflow:hidden}
.pitem{padding:20px 24px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:16px;background:var(--bg2);transition:background .2s}
.pitem:last-child{border-bottom:none}
.pitem:hover{background:var(--bg3)}
.pii{width:36px;height:36px;border-radius:9px;background:rgba(168,49,30,.12);border:1px solid rgba(168,49,30,.2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.pit{font-size:15px;color:var(--cream2);letter-spacing:-.01em;line-height:1.4}
.pit strong{color:var(--cream);font-weight:600}
.how{max-width:1100px;margin:0 auto;padding:80px 40px}
.how h2{font-family:var(--head);font-style:italic;font-size:clamp(30px,4vw,48px);font-weight:400;line-height:1.1;letter-spacing:-.025em;color:var(--cream);margin-bottom:60px;max-width:480px}
.how h2 em{color:var(--red)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--b);border-radius:18px;overflow:hidden}
.step{background:var(--bg2);padding:40px 32px;position:relative}
.step::after{content:attr(data-n);position:absolute;top:24px;right:24px;font-family:var(--head);font-style:italic;font-size:64px;font-weight:400;color:rgba(246,241,231,.04);line-height:1}
.sico{width:48px;height:48px;border-radius:12px;background:rgba(217,68,43,.1);border:1px solid rgba(217,68,43,.18);display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:24px}
.step h3{font-size:18px;font-weight:700;color:var(--cream);letter-spacing:-.02em;margin-bottom:12px}
.step p{font-size:14px;color:var(--cream2);line-height:1.65;letter-spacing:-.005em}
.sttime{margin-top:20px;font-family:var(--mono);font-size:12px;color:var(--green);background:rgba(74,145,80,.1);border:1px solid rgba(74,145,80,.18);padding:4px 12px;border-radius:9999px;display:inline-block}
.ba{max-width:1100px;margin:0 auto;padding:80px 40px}
.ba h2{font-family:var(--head);font-style:italic;font-size:clamp(30px,4vw,48px);font-weight:400;line-height:1.1;letter-spacing:-.025em;color:var(--cream);margin-bottom:56px}
.bagrid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.bac{border-radius:20px;overflow:hidden;border:1px solid var(--b)}
.bac.bef{opacity:.65}
.bac.aft{border-color:rgba(217,68,43,.28);box-shadow:rgba(217,68,43,.08) 0 0 0 1px}
.bach{padding:16px 24px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--b)}
.bach.bh{background:var(--bg2)}.bach.ah{background:rgba(217,68,43,.06)}
.bal{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.bal.b{color:var(--cream3)}.bal.a{color:var(--red)}
.bars2{background:var(--bg2);display:flex;flex-direction:column}
.bar2{padding:16px 24px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:14px}
.bar2:last-child{border-bottom:none}
.bari{font-size:18px;width:28px;text-align:center}
.bart{font-size:14px;color:var(--cream2);letter-spacing:-.005em;line-height:1.4;flex:1}
.bart strong{color:var(--cream);font-weight:600}
.bat{margin-left:auto;font-family:var(--mono);font-size:12px;font-weight:600;padding:3px 10px;border-radius:9999px;white-space:nowrap}
.bat.slow{background:rgba(168,49,30,.12);color:#C05040;border:1px solid rgba(168,49,30,.2)}
.bat.fast{background:rgba(74,145,80,.12);color:var(--green);border:1px solid rgba(74,145,80,.2)}
.testi{max-width:1100px;margin:0 auto;padding:80px 40px}
.testi-head{margin-bottom:60px}
.testi-head h2{font-family:var(--head);font-style:italic;font-size:clamp(30px,4vw,48px);font-weight:400;line-height:1.1;letter-spacing:-.025em;color:var(--cream)}
.testi-head h2 em{color:var(--red)}
.testi-head p{margin-top:14px;font-size:17px;color:var(--cream2);letter-spacing:-.01em}
.tgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px}
.tgrid-wide{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.tcard{background:var(--bg2);border:1px solid var(--b);border-radius:20px;padding:32px;display:flex;flex-direction:column;gap:20px;transition:border-color .2s,transform .2s;position:relative}
.tcard:hover{border-color:rgba(246,241,231,.13);transform:translateY(-2px)}
.tcard.hl{border-color:rgba(217,68,43,.25);background:linear-gradient(145deg,rgba(217,68,43,.06) 0%,var(--bg2) 60%)}
.tcard.hl::before{content:'★ Destacado';position:absolute;top:-12px;left:24px;background:var(--red);color:#fff;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.06em;padding:4px 14px;border-radius:9999px}
.tstars{display:flex;gap:3px;font-size:14px}
.tquote{font-family:var(--soft);font-size:21px;line-height:1.45;color:var(--cream);font-weight:600;flex:1}
.tquote em{color:var(--red);font-style:normal}
.tquote.sm{font-size:18px}
.tresult{font-family:var(--mono);font-size:12px;color:var(--green);background:rgba(74,145,80,.09);border:1px solid rgba(74,145,80,.18);border-radius:9999px;padding:5px 14px;display:inline-block;align-self:flex-start}
.tauthor{display:flex;align-items:center;gap:14px;border-top:1px solid var(--b);padding-top:20px}
.tavatar{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--head);font-style:italic;font-size:18px;font-weight:500;color:white;flex-shrink:0}
.ta-red{background:linear-gradient(135deg,#A8311E,#D9442B)}
.ta-amber{background:linear-gradient(135deg,#B07020,#E8A33B)}
.ta-green{background:linear-gradient(135deg,#2D5E32,#4A9150)}
.ta-blue{background:linear-gradient(135deg,#1A3A6B,#2E5FAA)}
.ta-brown{background:linear-gradient(135deg,#4A2E1A,#7A4E2A)}
.tinfo h4{font-size:15px;font-weight:700;color:var(--cream);letter-spacing:-.01em}
.tinfo p{font-size:13px;color:var(--cream3);margin-top:3px;letter-spacing:-.005em}
.tbadge{margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--cream3);background:rgba(246,241,231,.05);border:1px solid var(--b);padding:4px 10px;border-radius:9999px;white-space:nowrap;letter-spacing:.03em}
.faqsec{max-width:800px;margin:0 auto;padding:80px 40px}
.faqsec h2{font-family:var(--head);font-style:italic;font-size:clamp(28px,4vw,44px);font-weight:400;line-height:1.1;letter-spacing:-.025em;color:var(--cream);margin-bottom:48px}
.faqsec h2 em{color:var(--red)}
.faqlist{display:flex;flex-direction:column;gap:2px;border-radius:16px;overflow:hidden}
.faqitem{background:var(--bg2);border:1px solid var(--b);overflow:hidden;margin-bottom:2px}
.faqitem:first-child{border-radius:14px 14px 0 0}
.faqitem:last-child{border-radius:0 0 14px 14px;margin-bottom:0}
.faqq{width:100%;background:transparent;border:none;padding:22px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;text-align:left;transition:background .2s}
.faqq:hover{background:var(--bg3)}
.faqq span{font-size:16px;font-weight:600;color:var(--cream);letter-spacing:-.015em;font-family:var(--ui)}
.faqq .arrow{color:var(--red);font-size:18px;flex-shrink:0;transition:transform .3s}
.faqitem.open .faqq{background:var(--bg3)}
.faqitem.open .arrow{transform:rotate(45deg)}
.faqa{max-height:0;overflow:hidden;transition:max-height .35s cubic-bezier(.22,1,.36,1)}
.faqitem.open .faqa{max-height:300px}
.faqa-inner{padding:0 28px 24px;font-size:15px;color:var(--cream2);line-height:1.7;letter-spacing:-.01em}
.faqa-inner strong{color:var(--cream);font-weight:600}
.trust{border-top:1px solid var(--b);border-bottom:1px solid var(--b);padding:24px 40px;display:flex;align-items:center;justify-content:center;gap:48px;background:rgba(26,22,18,.5)}
.ti{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--cream2)}
.ti .ico{font-size:18px}
.ti strong{color:var(--cream);font-weight:600}
.pricing{max-width:1100px;margin:0 auto;padding:80px 40px}
.phead{margin-bottom:60px}
.phead h2{font-family:var(--head);font-style:italic;font-size:clamp(30px,4vw,48px);font-weight:400;line-height:1.1;letter-spacing:-.025em;color:var(--cream);margin-bottom:14px}
.phead p{font-size:17px;color:var(--cream2);letter-spacing:-.01em}
.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:end}
.plan{background:var(--bg2);border:1px solid var(--b);border-radius:22px;padding:36px 32px;position:relative;transition:transform .2s,border-color .2s}
.plan:hover{transform:translateY(-3px);border-color:rgba(246,241,231,.14)}
.plan.feat{border-color:rgba(217,68,43,.3);background:linear-gradient(160deg,rgba(217,68,43,.06) 0%,var(--bg2) 55%);box-shadow:rgba(217,68,43,.1) 0 20px 60px -20px}
.plbadge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--red);color:#fff;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 18px;border-radius:9999px;white-space:nowrap}
.pln{font-family:var(--head);font-style:italic;font-size:22px;color:var(--cream2);margin-bottom:6px}
.pltag{font-size:13px;color:var(--cream3);margin-bottom:24px;letter-spacing:-.005em}
.plpw{margin-bottom:24px}
.plp{font-family:var(--head);font-style:italic;font-size:52px;line-height:1;color:var(--cream);letter-spacing:-.025em}
.plp sup{font-size:24px;vertical-align:top;margin-top:12px;margin-right:1px}
.plper{font-family:var(--mono);font-size:12px;color:var(--cream3);margin-top:4px}
.plhr{height:1px;background:var(--b);margin-bottom:24px}
.plfs{list-style:none;display:flex;flex-direction:column;gap:11px}
.plfs li{font-size:14px;color:var(--cream2);display:flex;align-items:flex-start;gap:10px;letter-spacing:-.005em;line-height:1.4}
.plfs li .ck{color:var(--red);font-weight:700;flex-shrink:0;margin-top:1px}
.plfs li .ckg{color:var(--green)}
.plbtn{margin-top:32px;width:100%;padding:14px;border-radius:9999px;font-family:var(--ui);font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:-.01em}
.plbf{background:var(--red);border:none;color:var(--cream);box-shadow:rgba(217,68,43,.45) 0 6px 24px -6px}
.plbf:hover{background:#e54e35;transform:translateY(-1px)}
.plbo{background:transparent;border:1px solid rgba(246,241,231,.18);color:var(--cream)}
.plbo:hover{border-color:rgba(246,241,231,.35)}
.pltrial{text-align:center;margin-top:12px;font-family:var(--soft);font-size:14px;color:var(--cream3)}
.fcta{max-width:780px;margin:0 auto;padding:120px 40px;text-align:center}
.fcta h2{font-family:var(--head);font-style:italic;font-size:clamp(42px,6vw,72px);font-weight:400;line-height:1.02;letter-spacing:-.03em;color:var(--cream);margin-bottom:24px}
.fcta h2 em{color:var(--red)}
.fcta p{font-size:18px;color:var(--cream2);letter-spacing:-.01em;line-height:1.65;margin-bottom:40px}
.ctag{display:flex;flex-direction:column;align-items:center;gap:14px}
.bfinal{padding:18px 48px;border-radius:9999px;background:var(--red);border:none;color:var(--cream);font-size:18px;font-weight:700;font-family:var(--ui);cursor:pointer;letter-spacing:-.015em;box-shadow:rgba(217,68,43,.6) 0 10px 40px -8px,rgba(255,180,160,.1) 0 1px 0 inset;transition:all .25s}
.bfinal:hover{transform:translateY(-2px);box-shadow:rgba(217,68,43,.75) 0 14px 50px -8px}
.fsub{font-size:14px;color:var(--cream3);display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center}
footer{border-top:1px solid var(--b);padding:48px 40px;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr auto auto;gap:40px;align-items:start}
.fbrand p{margin-top:10px;font-size:13px;color:var(--cream3);letter-spacing:-.005em;max-width:240px;line-height:1.6}
.fcol h4{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--cream3);margin-bottom:14px}
.fcol ul{list-style:none;display:flex;flex-direction:column;gap:9px}
.fcol ul li a{font-size:14px;color:var(--cream2);text-decoration:none;letter-spacing:-.005em;transition:color .2s}
.fcol ul li a:hover{color:var(--cream)}
.fbot{border-top:1px solid var(--b);padding:24px 40px;max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}
.fbot p{font-family:var(--mono);font-size:12px;color:var(--cream3);letter-spacing:.02em}
.vbadge{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;color:var(--green);background:rgba(74,145,80,.08);border:1px solid rgba(74,145,80,.18);padding:5px 12px;border-radius:9999px}
.vdot{width:6px;height:6px;border-radius:50%;background:var(--green)}
@keyframes fu{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes gpulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(74,145,80,.5)}50%{opacity:.7;box-shadow:0 0 0 5px rgba(74,145,80,0)}}
/* ---- CONTACTO ---- */
.contacto{max-width:600px;margin:0 auto;padding:120px 40px;text-align:center}
.contacto h2{font-family:var(--head);font-style:italic;font-size:clamp(38px,5.5vw,64px);font-weight:400;line-height:1.02;letter-spacing:-.03em;color:var(--cream);margin-bottom:16px}
.contacto h2 em{color:var(--red)}
.contacto .csub{font-size:18px;color:var(--cream2);letter-spacing:-.01em;line-height:1.65;margin-bottom:48px}
.cform{display:flex;flex-direction:column;gap:14px;text-align:left}
.cfield{display:flex;flex-direction:column;gap:6px}
.cfield label{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream3)}
.cinput{background:rgba(246,241,231,.05);border:1px solid rgba(246,241,231,.12);border-radius:12px;padding:14px 18px;font-family:var(--ui);font-size:16px;color:var(--cream);outline:none;transition:border-color .2s;width:100%}
.cinput:focus{border-color:rgba(217,68,43,.5);background:rgba(246,241,231,.07)}
.cinput::placeholder{color:var(--cream4)}
.csubmit{margin-top:8px;padding:16px 32px;border-radius:9999px;background:var(--red);border:none;color:var(--cream);font-size:16px;font-weight:700;font-family:var(--ui);cursor:pointer;letter-spacing:-.015em;box-shadow:rgba(217,68,43,.55) 0 8px 28px -6px;transition:all .25s}
.csubmit:hover:not(:disabled){background:#e54e35;transform:translateY(-2px);box-shadow:rgba(217,68,43,.7) 0 12px 36px -6px}
.csubmit:disabled{opacity:.6;cursor:not-allowed}
.ccheck-row{display:flex;align-items:flex-start;gap:12px;margin-top:4px}
.ccheck-row input[type=checkbox]{width:18px;height:18px;min-width:18px;accent-color:var(--red);cursor:pointer;margin-top:2px;border-radius:4px}
.ccheck-row label{font-family:var(--ui);font-size:13px;color:var(--cream2);line-height:1.6;cursor:pointer}
.ccheck-row label a{color:var(--red);text-decoration:underline}
.csent{text-align:center;padding:40px 0}
.csent .ccheck{font-size:48px;margin-bottom:20px}
.csent h3{font-family:var(--head);font-style:italic;font-size:28px;color:var(--cream);margin-bottom:12px}
.csent p{font-size:16px;color:var(--cream2);line-height:1.65}
.csent p strong{color:var(--amber)}
.cerr{font-family:var(--mono);font-size:12px;color:var(--amber);margin-top:8px;text-align:center}
.cnota{font-family:var(--soft);font-size:14px;color:var(--cream3);text-align:center;margin-top:16px}
@media(max-width:768px){
  nav{padding:0 20px}.nav-c{display:none}
  .nav-r{display:none}
  .hero{padding:0 20px 80px}
  .dstage{grid-template-columns:1fr;min-height:auto}
  .ddiv{width:100%;height:1px}
  .pgrid,.bagrid,.steps,.tgrid,.tgrid-wide,.plans{grid-template-columns:1fr}
  .stats{flex-direction:column}
  .stat{border-right:none;border-bottom:1px solid var(--b)}
  .stat:last-child{border-bottom:none}
  footer{grid-template-columns:1fr;gap:32px}
  .trust{flex-direction:column;gap:16px;padding:24px 20px}
  .fbot{flex-direction:column;gap:12px;text-align:center}
  .tgrid-wide{grid-template-columns:1fr}
  .pain{padding:80px 20px 60px}.how{padding:60px 20px}
  .ba{padding:60px 20px}.testi{padding:60px 20px}
  .faqsec{padding:60px 20px}.pricing{padding:60px 20px}
  .fcta{padding:80px 20px}
  .contacto{padding:80px 20px}
  footer{padding:40px 20px}.fbot{padding:20px}
  .pcalc-inner{grid-template-columns:1fr}
  .pcalc-inc-grid{grid-template-columns:repeat(2,1fr)}
  /* Testimonios — fixes responsive */
  .tcard{padding:20px}
  .tquote{font-size:17px}.tquote.sm{font-size:15px}
  .tresult{white-space:normal;overflow-wrap:anywhere;max-width:100%}
  .tauthor{flex-wrap:wrap;gap:8px}
  .tbadge{margin-left:0}
  /* BA section — evitar overflow en badge de tiempo */
  .bar2{flex-wrap:wrap;gap:8px}
  .bat{margin-left:0;white-space:normal}
}
.pcalc{max-width:860px;margin:0 auto}
.pcalc-inner{display:grid;grid-template-columns:1fr 1fr;gap:48px;background:var(--bg2);border:1px solid rgba(217,68,43,.22);border-radius:24px;padding:52px;margin-bottom:24px;box-shadow:rgba(217,68,43,.07) 0 20px 60px -20px}
.pcalc-label{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--cream3);margin-bottom:20px}
.pcalc-note{font-family:var(--soft);font-size:14px;color:var(--cream3);margin-top:6px;margin-bottom:28px}
.pcalc-ctrl{display:flex;flex-direction:column;justify-content:center;gap:28px}
.pcalc-field-label{font-size:14px;color:var(--cream2);margin-bottom:10px;letter-spacing:-.005em;line-height:1.4}
.pcalc-field-label span{display:block;font-size:12px;color:var(--cream3);margin-top:3px}
.pcalc-count{font-family:var(--head);font-style:italic;font-size:56px;color:var(--red);line-height:1;margin-bottom:10px;letter-spacing:-.03em}
.pcalc-slider{width:100%;-webkit-appearance:none;appearance:none;height:4px;border-radius:9999px;background:var(--b);outline:none;cursor:pointer}
.pcalc-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:var(--red);cursor:pointer;box-shadow:rgba(217,68,43,.5) 0 0 14px}
.pcalc-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--red);cursor:pointer;border:none}
.pcalc-range-labels{display:flex;justify-content:space-between;margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--cream3)}
.pcalc-annual{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--cream2);cursor:pointer}
.pcalc-toggle{width:40px;height:22px;border-radius:9999px;border:1px solid var(--b);cursor:pointer;background:var(--bg3);position:relative;transition:background .2s,border-color .2s;flex-shrink:0;padding:0}
.pcalc-toggle.on{background:var(--red);border-color:var(--red)}
.pcalc-toggle-knob{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:var(--cream);transition:transform .2s;display:block}
.pcalc-toggle.on .pcalc-toggle-knob{transform:translateX(18px)}
.pcsave{font-family:var(--mono);font-size:10px;font-style:normal;font-weight:700;color:var(--green);background:rgba(74,145,80,.1);border:1px solid rgba(74,145,80,.22);border-radius:9999px;padding:2px 9px;margin-left:6px;letter-spacing:.02em}
.pcalc-examples{display:flex;gap:8px;flex-wrap:wrap}
.pcalc-ex{background:transparent;border:1px solid var(--b);border-radius:12px;padding:10px 14px;cursor:pointer;font-family:var(--ui);text-align:left;transition:all .2s;display:flex;flex-direction:column;gap:4px}
.pcalc-ex strong{font-size:12px;color:var(--cream2);font-weight:600;letter-spacing:-.005em}
.pcalc-ex span{font-family:var(--mono);font-size:11px;color:var(--cream3)}
.pcalc-ex.active,.pcalc-ex:hover{border-color:rgba(217,68,43,.35);background:rgba(217,68,43,.06)}
.pcalc-ex.active strong{color:var(--cream)}.pcalc-ex.active span{color:var(--red)}
.pcalc-includes{background:rgba(246,241,231,.015);border:1px solid var(--b);border-radius:18px;padding:28px 32px}
.pcalc-inc-title{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--cream3);margin-bottom:20px}
.pcalc-inc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 28px}
.pcalc-inc-item{font-size:14px;color:var(--cream2);display:flex;align-items:baseline;gap:8px;letter-spacing:-.005em}
`;

const COMANDAS = [
  {txt:"Dos cañas y una ración de jamón para la cuatro de terraza, sin sal en el jamón",mesa:"T04 — Terraza",ico:"🏖️",items:[{q:2,n:"Caña",nota:null as string|null},{q:1,n:"Jamón ibérico",nota:"sin sal ⚠️"}]},
  {txt:"Para la dos del interior, menú del día completo y dos aguas, uno sin gluten ojo",mesa:"M02 — Interior",ico:"🍽️",items:[{q:2,n:"Menú del día",nota:"uno sin gluten ojo ⚠️"},{q:2,n:"Agua mineral",nota:null}]},
  {txt:"Barra once, tres cervezas bien frías y calamares, que los calamares lleguen primero",mesa:"B11 — Barra",ico:"🍺",items:[{q:1,n:"Calamares a la romana",nota:"marchar primero 🔴"},{q:3,n:"Cerveza bien fría",nota:null}]},
];

export default function Page() {
  const [openFaq, setOpenFaq] = useState<number|null>(null);
  const [leadNombre, setLeadNombre] = useState("");
  const [pUsers, setPUsers] = useState(3);
  const [pAnnual, setPAnnual] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadRest, setLeadRest] = useState("");
  const [leadTel, setLeadTel] = useState("");
  const [leadSending, setLeadSending] = useState(false);
  const [leadSent, setLeadSent] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [leadConsent, setLeadConsent] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const demoRunning = useRef(false);

  const handleLead = async () => {
    if (!leadNombre.trim() || !leadRest.trim() || !leadTel.trim() || !leadEmail.trim()) {
      setLeadError("Rellena todos los campos para que podamos contactarte.");
      return;
    }
    if (!leadConsent) {
      setLeadError("Debes aceptar la política de privacidad para continuar.");
      return;
    }
    setLeadError("");
    setLeadSending(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/contact-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ nombre: leadNombre.trim(), restaurante: leadRest.trim(), telefono: leadTel.trim(), email: leadEmail.trim() }),
      });
      if (!res.ok) throw new Error("error");
      setLeadSent(true);
    } catch {
      setLeadError("Algo falló. Escríbenos directamente a alberto.suarez.gutierrez@gmail.com");
    } finally {
      setLeadSending(false);
    }
  };

  // NAV scroll
  useEffect(() => {
    const h = () => navRef.current?.classList.toggle("scrolled", scrollY > 30);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add("in"); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Demo animation
  useEffect(() => {
    if (demoRunning.current) return;
    demoRunning.current = true;
    const sleep = (ms:number) => new Promise(r => setTimeout(r, ms));
    const hora = () => new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    let idx = 0;
    let active = true;

    const run = async () => {
      while (active) {
        const c = COMANDAS[idx++ % COMANDAS.length];
        const g = (id:string) => document.getElementById(id);

        const ttext=g("ttext"),tc=g("tc"),wf=g("wf"),mtag=g("mtag"),
          mico=g("mico"),mtxt=g("mtxt"),tkt=g("tkt"),tktis=g("tktis"),
          tktm=g("tktm"),tkth2=g("tkth2"),stag=g("stag"),stag2=g("stag2"),
          bmarch=g("bmarch"),slbl=g("slbl"),sd=g("sd");

        if (!ttext||!tc||!wf||!mtag||!tkt||!tktis||!stag||!stag2||!bmarch||!slbl||!sd) { await sleep(500); continue; }

        ttext.textContent=""; tc.style.display="inline-block";
        mtag.classList.remove("show"); tkt.classList.remove("show");
        tktis.innerHTML='<div class="tempty">Esperando comanda...</div>';
        if(tktm) tktm.textContent="—"; if(tkth2) tkth2.textContent="—";
        stag.classList.remove("show"); stag2.style.opacity="0";
        bmarch.classList.remove("show"); slbl.textContent="escuchando";
        sd.className="sd";

        await sleep(1400);
        wf.className="wf speaking"; slbl.textContent="dictando";

        for (let i=0;i<c.txt.length;i++) {
          if (!active) return;
          ttext.textContent=c.txt.slice(0,i+1);
          await sleep(28+Math.random()*16);
        }

        await sleep(260); wf.className="wf silent"; tc.style.display="none";
        slbl.textContent="procesando"; sd.className="sd amber";
        await sleep(460);

        if(mico) mico.textContent=c.ico; if(mtxt) mtxt.textContent=c.mesa;
        mtag.classList.add("show");
        await sleep(420);

        if(tktm) tktm.textContent=c.mesa; if(tkth2) tkth2.textContent=hora();
        tkt.classList.add("show"); tktis.innerHTML="";

        for (const it of c.items) {
          if (!active) return;
          const d=document.createElement("div"); d.className="tkti";
          d.innerHTML=`<span class="tq">${it.q}×</span><span class="tn">${it.n}${it.nota?`<span class="tnota">${it.nota}</span>`:""}</span><span class="test">EN COCINA</span>`;
          tktis.appendChild(d);
          await sleep(90); d.classList.add("show");
        }

        stag.classList.add("show"); stag2.style.opacity="1";
        bmarch.classList.add("show"); slbl.textContent="en cocina ✓"; sd.className="sd";
        await sleep(5500);
      }
    };
    run();
    return () => { active = false; };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>

      {/* NAV */}
      <nav ref={navRef}>
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <ul className="nav-c">
          <li><a href="#como">Cómo funciona</a></li>
          <li><a href="#testimonios">Restaurantes</a></li>
          <li><a href="#precios">Precios</a></li>
          <li><a href="#contacto">Contacto</a></li>
        </ul>
        <div className="nav-r">
          <button className="nbr" onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Quiero probarlo</button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hglow"/><div className="hglow2"/>
        <div className="hi">
          <div className="ep">
            <span className="chip">Live</span>
            <span className="pt">TPV por voz para hostelería española — &ldquo;la cuatro de terraza&rdquo;</span>
          </div>
          <h1>
            Para de correr<br/>
            <em>al terminal.</em>
            <span className="sl">Simplemente habla.</span>
          </h1>
          <p className="hclaim">
            Dicta la comanda en voz natural. ia.rest la transcribe, la estructura y la manda a cocina{" "}
            <strong>en menos de medio segundo.</strong> Sin errores. Sin desplazamientos. Sin semanas de formación.
          </p>
          <div className="hctas">
            <button className="bth" onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Solicitar 14 días gratis →</button>
            <button className="bto" onClick={()=>document.getElementById("como")?.scrollIntoView({behavior:"smooth"})}>Ver cómo funciona →</button>
          </div>
          <p className="nc">Sin tarjeta · Sin hardware caro · En marcha en 10 minutos</p>
        </div>

        {/* DEMO */}
        <div className="demo-w">
          <div className="dshell">
            <div className="dchrome">
              <div className="cdots"><i/><i/><i/></div>
              <div className="cbar">ia.rest / sala / pedidos en vivo</div>
            </div>
            <div className="dstage">
              <div className="pcam">
                <div className="plabel">
                  <span className="pl">Camarero</span>
                  <div className="spill"><div className="sd" id="sd"/><span id="slbl" style={{fontSize:11,color:"var(--cream3)"}}>escuchando</span></div>
                </div>
                <div className="wbox">
                  <div className="wf silent" id="wf">
                    {[{s:.5,d:.00,h:32},{s:.6,d:.05,h:18},{s:.4,d:.10,h:38},{s:.7,d:.15,h:12},
                      {s:.5,d:.20,h:30},{s:.6,d:.08,h:22},{s:.4,d:.12,h:35},{s:.8,d:.16,h:16},
                      {s:.5,d:.02,h:28},{s:.6,d:.06,h:40},{s:.4,d:.11,h:20},{s:.7,d:.18,h:34}
                    ].map((b,i)=><div key={i} className="wb" style={{"--ws":`${b.s}s`,"--wd":`${b.d}s`,"--wh":b.h} as {[k:string]:string|number}}/>)}
                  </div>
                  <div className="tr"><span id="ttext"/><span className="tc" id="tc"/></div>
                </div>
                <div className="mtag" id="mtag">
                  <span id="mico">🍽️</span>
                  <span id="mtxt" style={{fontFamily:"var(--mono)",fontSize:13}}/>
                </div>
              </div>
              <div className="ddiv"/>
              <div className="pkds">
                <div className="ktopbar">
                  <span className="pl">Cocina — KDS</span>
                  <div className="stag" id="stag">⚡ 0.4s</div>
                </div>
                <div className="tkt" id="tkt">
                  <div className="tkth">
                    <span className="tktm" id="tktm">—</span>
                    <span className="tkth2" id="tkth2">—</span>
                  </div>
                  <div className="tktis" id="tktis"><div className="tempty">Esperando comanda...</div></div>
                  <div className="tktf">
                    <div className="stag" id="stag2" style={{opacity:0}}>⚡ 420ms</div>
                    <button className="bmarch" id="bmarch">✓ MARCHAR</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STATS */}
        <div className="stats">
          <div className="stat"><div className="snum">&lt;<span>0.5</span>s</div><div className="slbl">Voz → Cocina</div></div>
          <div className="stat"><div className="snum"><span>97</span>%</div><div className="slbl">Precisión</div></div>
          <div className="stat"><div className="snum"><span>−40</span>%</div><div className="slbl">Errores en sala</div></div>
          <div className="stat"><div className="snum"><span>5</span>min</div><div className="slbl">Para aprenderlo</div></div>
        </div>
      </section>

      {/* DOLOR */}
      <section className="pain">
        <div className="section-tag">El problema</div>
        <div className="pgrid">
          <div className="ptxt reveal">
            <h2>El terminal de siempre <strong>no está diseñado</strong> para el servicio</h2>
            <p>Un camarero hace 6 viajes al TPV por hora. Cada viaje son 30–45 segundos de atención perdida. Clientes sin mirar. Errores que solo se descubren al cerrar la cuenta.</p>
            <p>No es un problema de tu equipo. Es un problema de herramienta.</p>
          </div>
          <div className="pitems reveal rd1">
            {[["🚶","6 viajes al TPV por hora.","Cada viaje, atención perdida en sala."],
              ["❌","Comandas mal registradas.","La mesa 7 pide sin gluten. Llega con gluten."],
              ["🎓","Semanas formando personal nuevo","solo para que aprenda el TPV."],
              ["⏱️","Cocina trabaja a ciegas","durante los primeros minutos de cada pase."]
            ].map(([ico,bold,txt],i)=>(
              <div key={i} className="pitem">
                <div className="pii">{ico}</div>
                <div className="pit"><strong>{bold}</strong> {txt}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="how" id="como">
        <div className="section-tag">La solución</div>
        <h2 className="reveal">Tres pasos.<br/><em>Cero fricción.</em></h2>
        <div className="steps">
          {[
            {n:"1",ico:"🎙️",t:"El camarero habla",p:'Sin abrir apps, sin buscar platos. Dice la comanda en voz natural: "dos de la casa", "sin sal ojo", "que llegue primero".',time:"Tiempo: 4 segundos"},
            {n:"2",ico:"🧠",t:"ia.rest entiende",p:"Whisper (Groq) transcribe en menos de 0,3s. Claude estructura: mesa, platos, cantidades, notas de alergias. En español real de hostelería.",time:"Tiempo: 0.4 segundos"},
            {n:"3",ico:"📺",t:"Cocina lo ve al momento",p:"El ticket aparece en el KDS con prioridades, alertas de alergia y orden de llegada. La cocina marcha sin esperar al camarero.",time:"Total: menos de 5 segundos"},
          ].map(s=>(
            <div key={s.n} className="step reveal" data-n={s.n}>
              <div className="sico">{s.ico}</div>
              <h3>{s.t}</h3>
              <p>{s.p}</p>
              <span className="sttime">{s.time}</span>
            </div>
          ))}
        </div>
      </section>

      {/* BEFORE/AFTER */}
      <section className="ba">
        <div className="section-tag">Antes y después</div>
        <h2 className="reveal">El mismo servicio.<br/>Una herramienta distinta.</h2>
        <div className="bagrid">
          <div className="bac bef reveal">
            <div className="bach bh"><span className="bal b">✕ &nbsp;Sin ia.rest</span></div>
            <div className="bars2">
              {[["🚶","Anotar en libreta → ir al TPV → introducir plato a plato","~45s","slow"],
                ["😬","<strong>Error al teclear</strong> — el cliente recibe algo que no pidió","−€€","slow"],
                ["📚","Personal nuevo tarda <strong>1–2 semanas</strong> en aprender el sistema","+16h","slow"],
                ["🔥","Hora punta: cola en el TPV, cocina esperando, mesas esperando","caos","slow"]
              ].map(([i,t,v,cls],idx)=>(
                <div key={idx} className="bar2">
                  <span className="bari">{i}</span>
                  <span className="bart" dangerouslySetInnerHTML={{__html:t as string}}/>
                  <span className={`bat ${cls}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bac aft reveal rd1">
            <div className="bach ah"><span className="bal a">✓ &nbsp;Con ia.rest</span></div>
            <div className="bars2">
              {[["🎙️","Dictar la comanda de pie en la mesa → en cocina ya","4s","fast"],
                ["✅","El LLM estructura exactamente lo que pidieron, <strong>sin errores de tecleo</strong>","0 errores","fast"],
                ["🚀","Personal nuevo operativo en <strong>5 minutos</strong> — hablan, no aprenden menús","5min","fast"],
                ["😎","Hora punta fluida. Cada camarero es una línea directa a cocina","control","fast"]
              ].map(([i,t,v,cls],idx)=>(
                <div key={idx} className="bar2">
                  <span className="bari">{i}</span>
                  <span className="bart" dangerouslySetInnerHTML={{__html:t as string}}/>
                  <span className={`bat ${cls}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section className="testi" id="testimonios">
        <div className="testi-head reveal">
          <div className="section-tag">Restaurantes</div>
          <h2>Los que ya no vuelven<br/>al <em>terminal viejo</em></h2>
          <p>Resultados reales de dueños y jefes de sala en España.</p>
        </div>
        <div className="tgrid">
          {[
            {cls:"hl",ini:"M",av:"ta-red",q:'"Antes mis camareras tardaban <em>45 segundos por comanda</em> en el TPV. Ahora dictan y se quedan en sala. En la primera semana noté que las propinas subieron."',r:"↑ 18% en propinas — primera semana",n:"María José Paredes",l:"Propietaria · Casa Manuela, Sevilla",p:"3 perfiles · 99€/mes"},
            {cls:"",ini:"R",av:"ta-amber",q:'"El verano pasado era un caos en la terraza. Este año puse ia.rest y los sábados son otra cosa. <em>Cero errores de comanda</em> en dos meses."',r:"0 errores en 60 días de temporada",n:"Roberto Fuentes",l:"Gerente · El Rincón de la Bahía, Cádiz",p:"6 perfiles · 159€/mes"},
            {cls:"",ini:"C",av:"ta-green",q:'"Formé a dos camareros nuevos para agosto. <em>En 10 minutos ya estaban mandando comandas.</em> Antes era una semana mínimo."',r:"Formación de 1 semana → 10 minutos",n:"Carmen Vidal",l:"Jefa de sala · Taberna La Cava, Madrid",p:"4 perfiles · 119€/mes"},
          ].map((t,i)=>(
            <div key={i} className={`tcard ${t.cls} reveal rd${i}`}>
              <div className="tstars">⭐⭐⭐⭐⭐</div>
              <div className={`tquote${i>0?" sm":""}`} dangerouslySetInnerHTML={{__html:t.q}}/>
              <div className="tresult">{t.r}</div>
              <div className="tauthor">
                <div className={`tavatar ${t.av}`}>{t.ini}</div>
                <div className="tinfo"><h4>{t.n}</h4><p>{t.l}</p></div>
                <span className="tbadge">{t.p}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="tgrid-wide" style={{marginTop:16}}>
          {[
            {ini:"A",av:"ta-blue",q:'"Tengo un bar en el Mercado de San Miguel. Volumen brutal, espacio mínimo. <em>El camarero dicta y el cocinero lo ve al momento.</em> No sé cómo trabajábamos antes."',r:"Volumen ×3 · mismo equipo · cero cuellos de botella",n:"Alejandro Mora",l:"Propietario · Barra Madrid, Mercado San Miguel",p:"1 perfil · 59€/mes"},
            {ini:"P",av:"ta-brown",q:'"Tengo 3 locales en Valencia. Con ia.rest <em>veo los tres en tiempo real</em> y las alertas de alergia ya no se pierden entre papeles."',r:"3 locales · panel único · alertas centralizadas",n:"Pilar Escrivá",l:"Grupo hostelero · La Familia Escrivá, Valencia",p:"3 restaurantes · desde 59€/local"},
          ].map((t,i)=>(
            <div key={i} className={`tcard reveal rd${i}`}>
              <div className="tstars">⭐⭐⭐⭐⭐</div>
              <div className="tquote" dangerouslySetInnerHTML={{__html:t.q}}/>
              <div className="tresult">{t.r}</div>
              <div className="tauthor">
                <div className={`tavatar ${t.av}`}>{t.ini}</div>
                <div className="tinfo"><h4>{t.n}</h4><p>{t.l}</p></div>
                <span className="tbadge">{t.p}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="faqsec">
        <div className="section-tag">Preguntas</div>
        <h2 className="reveal">Lo que siempre<br/><em>preguntan primero</em></h2>
        <div className="faqlist">
          {[
            {q:"¿Funciona si hay ruido en sala?",a:"Sí. Usamos Whisper large-v3 vía Groq, el mejor modelo de transcripción para español. Funciona bien con ruido de fondo, música y conversaciones cercanas. Recomendamos hablar a 15–20 cm del micrófono, algo natural cuando ya llevas la comanda en mente."},
            {q:"¿Qué pasa si se cae internet en mitad del servicio?",a:"Las comandas ya enviadas siguen visibles en cocina. Para nuevas comandas cae a modo manual: el camarero puede abrir cualquier comanda anterior y modificarla."},
            {q:"¿Necesito hardware nuevo? ¿Impresoras, tablets específicas?",a:"No. ia.rest funciona en cualquier móvil o tablet con navegador. Para el KDS en cocina, una tablet de 70€ es suficiente. Para impresoras de tickets, garantizamos compatibilidad 100% con modelos ESC/POS TCP (IP local) y Star CloudPRNT LAN/WiFi como la Star TSP143IIILAN o TSP143IIIW. Si ya tienes otra impresora, probablemente funcione, pero solo garantizamos las anteriores."},
            {q:"¿El sistema entiende la carta de mi restaurante?",a:'Sí. Durante el onboarding (10 minutos) introduces tus platos y el sistema los aprende. Si el camarero dice "una de la casa" y en tu carta se llama "Ensaladilla de la abuela", el ticket sale con el nombre correcto.'},
            {q:"¿Cómo funciona lo de VeriFactu y Hacienda?",a:"VeriFactu es el sistema obligatorio de la AEAT para emitir facturas. Obligatorio para sociedades desde enero de 2026 y autónomos desde julio de 2026. Multa de hasta 50.000 €/ejercicio por software no homologado. ia.rest genera facturas con hash encadenado SHA-256 y QR verificable. Incluido en todos los perfiles."},
            {q:"¿Puedo cancelar en cualquier momento?",a:"Sí, siempre. Sin permanencia ni penalizaciones. El servicio sigue activo hasta final del período pagado. Datos exportables en CSV. No te vamos a llamar para retenerte."},
          ].map((f,i)=>(
            <div key={i} className={`faqitem${openFaq===i?" open":""}`}>
              <button className="faqq" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                <span>{f.q}</span>
                <span className="arrow">+</span>
              </button>
              <div className="faqa"><div className="faqa-inner">{f.a}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* TRUST */}
      <div className="trust">
        {[["🔒","Datos en España","· Supabase EU-West"],["🇪🇸","Soporte en español","· Respuesta el mismo día"],["📋","VeriFactu AEAT 2026","· Incluido en todos los perfiles"],["💳","Sin permanencia","· Cancela cuando quieras"]].map(([ico,b,t])=>(
          <div key={b} className="ti"><span className="ico">{ico}</span><span><strong>{b}</strong>{t}</span></div>
        ))}
      </div>

      {/* PRICING */}
      <section className="pricing" id="precios">
        <div className="phead reveal">
          <div className="section-tag">Precios</div>
          <h2>Sin comisiones por comanda.<br/>Sin sorpresas al mes siguiente.</h2>
          <p>Solo pagas por los perfiles activos de cada restaurante. Sin planes fijos, sin letra pequeña.</p>
        </div>
        {(()=>{
          const calcPrice=(n:number,ann:boolean)=>{
            let p=59;
            if(n>1) p+=Math.min(n-1,5)*20;
            if(n>6) p+=(n-6)*15;
            return ann?Math.round(p*0.82):p;
          };
          const price=calcPrice(pUsers,pAnnual);
          const examples:Array<[number,string]>=[[1,"1 perfil"],[3,"3 perfiles"],[6,"6 perfiles"]];
          const feats=["Voz + KDS en cocina","Cobro Stripe + Bizum","VeriFactu incluido","Impresoras térmicas","Alertas en tiempo real","Panel owner","Soporte en español","14 días de prueba gratis"];
          return (
            <div className="pcalc reveal">
              <div className="pcalc-inner">
                {/* Precio */}
                <div>
                  <div className="pcalc-label">Precio mensual estimado · por restaurante</div>
                  <div className="plpw">
                    <div className="plp"><sup>€</sup>{price}</div>
                    <div className="plper">/mes · sin permanencia{pAnnual?" · pago anual":""}</div>
                  </div>
                  <div className="pcalc-note">{pUsers} perfil{pUsers>1?"es":""} activo{pUsers>1?"s":""}
                    {pAnnual&&<> · <em style={{color:"var(--green)"}}>18% de descuento aplicado</em></>}
                  </div>
                  <button className="plbtn plbf" style={{maxWidth:320}} onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Solicitar 14 días gratis</button>
                  <p className="pltrial">Sin tarjeta · Te configuramos nosotros</p>
                </div>
                {/* Controles */}
                <div className="pcalc-ctrl">
                  <div>
                    <div className="pcalc-field-label">
                      Perfiles activos
                      <span>Camareros · cocina · jefe de sala. El owner no cuenta.</span>
                    </div>
                    <div className="pcalc-count">{pUsers}</div>
                    <input type="range" min={1} max={15} value={pUsers} onChange={e=>setPUsers(+e.target.value)} className="pcalc-slider"/>
                    <div className="pcalc-range-labels"><span>1</span><span>15 perfiles</span></div>
                  </div>
                  <div className="pcalc-annual" onClick={()=>setPAnnual(!pAnnual)}>
                    <button className={`pcalc-toggle${pAnnual?" on":""}`} onClick={e=>{e.stopPropagation();setPAnnual(!pAnnual)}}>
                      <span className="pcalc-toggle-knob"/>
                    </button>
                    <span>Facturación anual <em className="pcsave">Ahorra 18%</em></span>
                  </div>
                  <div>
                    <div className="pcalc-field-label">Ejemplos rápidos</div>
                    <div className="pcalc-examples">
                      {examples.map(([n,label])=>(
                        <button key={n} className={`pcalc-ex${pUsers===n?" active":""}`} onClick={()=>setPUsers(n)}>
                          <strong>{label}</strong>
                          <span>{calcPrice(n,pAnnual)}€/mes</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="pcalc-includes reveal rd1">
                <div className="pcalc-inc-title">Incluido en todos los perfiles</div>
                <div className="pcalc-inc-grid">
                  {feats.map(f=><div key={f} className="pcalc-inc-item"><span className="ckg">—</span>{f}</div>)}
                </div>
              </div>
              <div style={{marginTop:16,textAlign:"center"}}>
                <p style={{fontFamily:"var(--soft)",fontSize:15,color:"var(--cream3)",letterSpacing:"-.005em"}}>
                  ¿Tienes varios locales? Cada restaurante tiene su propia suscripción independiente al mismo precio.{" "}
                  <button style={{background:"none",border:"none",color:"var(--red)",fontFamily:"var(--soft)",fontSize:15,cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Cuéntanos tu caso →</button>
                </p>
              </div>
            </div>
          );
        })()}
      </section>

      {/* FORMULARIO DE CONTACTO */}
      <section className="contacto" id="contacto">
        <h2 className="reveal">Tu cocina te está<br/><em>esperando.</em></h2>
        <p className="csub reveal rd1">Déjanos tu teléfono y te llamamos. Sin presiones, sin tarjeta. Solo una demo de 10 minutos y ves si encaja.</p>

        {leadSent ? (
          <div className="csent reveal">
            <div className="ccheck">✓</div>
            <h3>Recibido. Te llamamos pronto.</h3>
            <p>En menos de 24h te contactamos para organizar la demo.<br/><strong>Gracias por confiar en ia.rest.</strong></p>
          </div>
        ) : (
          <div className="cform reveal rd2">
            <div className="cfield">
              <label htmlFor="cf-nombre">Tu nombre</label>
              <input id="cf-nombre" className="cinput" type="text" placeholder="María García" value={leadNombre} onChange={e=>setLeadNombre(e.target.value)} />
            </div>
            <div className="cfield">
              <label htmlFor="cf-email">Tu email</label>
              <input id="cf-email" className="cinput" type="email" placeholder="maria@restaurante.com" value={leadEmail} onChange={e=>setLeadEmail(e.target.value)} />
            </div>
            <div className="cfield">
              <label htmlFor="cf-rest">Nombre del restaurante</label>
              <input id="cf-rest" className="cinput" type="text" placeholder="Bodega La Plaza" value={leadRest} onChange={e=>setLeadRest(e.target.value)} />
            </div>
            <div className="cfield">
              <label htmlFor="cf-tel">Teléfono (te llamamos nosotros)</label>
              <input id="cf-tel" className="cinput" type="tel" placeholder="+34 600 000 000" value={leadTel} onChange={e=>setLeadTel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLead()} />
            </div>
            {leadError && <p className="cerr">{leadError}</p>}
            <div className="ccheck-row">
              <input
                id="cf-consent"
                type="checkbox"
                checked={leadConsent}
                onChange={e => setLeadConsent(e.target.checked)}
              />
              <label htmlFor="cf-consent">
                He leído y acepto la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a>. Consiento el tratamiento de mis datos para gestionar mi solicitud de demo y que ia.rest se ponga en contacto conmigo. Puedo retirar el consentimiento en cualquier momento.
              </label>
            </div>
            <button className="csubmit" onClick={handleLead} disabled={leadSending || !leadConsent}>
              {leadSending ? "Enviando…" : "Quiero la demo — me llamáis vosotros →"}
            </button>
            <p className="cnota">Sin tarjeta · Sin compromiso · Respuesta en menos de 24h</p>
          </div>
        )}
      </section>

      <footer>
        <div className="fbrand">
          <a href="/" className="logo">ia<b>.</b>rest</a>
          <p>Voice POS para hostelería española. El camarero habla. La cocina marcha.</p>
        </div>
        <div className="fcol">
          <h4>Producto</h4>
          <ul>{[["#como","Cómo funciona"],["#precios","Precios"],["#como","KDS en cocina"],["#contacto","VeriFactu"]].map(([h,l])=><li key={l}><a href={h}>{l}</a></li>)}</ul>
        </div>
        <div className="fcol">
          <h4>Legal</h4>
          <ul>{[["/aviso-legal","Aviso legal"],["/privacidad","Privacidad"],["/cookies","Cookies"],["/terminos","Términos de uso"],["/contrato-iarest-v1.pdf","Contrato SaaS"]].map(([h,l])=><li key={l}><a href={h}>{l}</a></li>)}</ul>
        </div>
      </footer>
      <div className="fbot">
        <p>© 2026 ia.rest · Hecho en España 🇪🇸</p>
        <div className="vbadge"><span className="vdot"/><span>VeriFactu AEAT 2026</span></div>
      </div>
    </>
  );
}

/* ============================================================
   ApexTrade Capital — Investor Dashboard (multi-view)
   ============================================================ */

(() => {
  "use strict";

  /* ---------- 1. Config ---------- */
  const BTC_DEPOSIT_ADDRESS = "bc1qexampleapextradecapitaldeposit0000000xy"; // ⚠ replace with your real address
  const STORAGE_KEY = "Nextrade.dashboard.v1";

  const PLANS = {
    starter: { name: "Starter", roi: 0.12, days: 14 },
    pro:     { name: "Pro",     roi: 0.28, days: 21 },
    elite:   { name: "Elite",   roi: 0.55, days: 30 },
  };

  const VIEW_TITLES = {
    overview: { t: 'Welcome back, <span class="grad" id="userGreeting">Investor</span>', s: "Here's a snapshot of your portfolio today." },
    invest:   { t: "Invest", s: "Pick a plan and start earning on your Bitcoin." },
    history:  { t: "History", s: "Every deposit and transaction in one place." },
    wallet:   { t: "Wallet", s: "Manage your funds and withdrawal address." },
    support:  { t: "Support", s: "We're here to help — 24 hours a day." },
  };

  const $ = (id) => document.getElementById(id);

  /* ---------- 2. Supabase auth ---------- */
  let supabase = null;
  let userName = "Investor";
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }

  async function initUser() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "login.html"; return; }
    const u = session.user;
    userName = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Investor";
    const email = u.email || "";
    $("userName").textContent = userName;
    $("userEmail").textContent = email;
    const greet = $("userGreeting"); if (greet) greet.textContent = userName.split(" ")[0];
    $("avatarSmall").textContent = (userName[0] || "A").toUpperCase();
    supabase.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") window.location.href = "login.html"; });
  }

  $("logoutBtn").addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    window.location.href = "login.html";
  });

  /* ---------- 3. State ---------- */
  const state = loadState();
  function loadState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState(); } catch { return defaultState(); } }
  function defaultState() { return { btcPrice: 77641, deposits: [], notifs: [], histFilter: "all" }; }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  /* ---------- 4. Toast ---------- */
  function toast(msg, type = "info") {
    let host = $("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;max-width:92vw";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `padding:12px 20px;border-radius:12px;font:600 14px/1.4 'Plus Jakarta Sans',sans-serif;color:#06090f;background:${type==="error"?"#ff5c7a":type==="success"?"linear-gradient(135deg,#22e6b8,#22d3ff)":"#fff"};box-shadow:0 12px 40px rgba(0,0,0,.4);transform:translateY(-12px);opacity:0;transition:.25s;text-align:center`;
    host.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = "translateY(0)"; el.style.opacity = "1"; });
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(-12px)"; setTimeout(() => el.remove(), 250); }, 3500);
  }

  /* ---------- 5. Helpers ---------- */
  const fmtUsd = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtBtc = (n) => (n || 0).toFixed(8);
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s/60) + "m ago";
    if (s < 86400) return Math.floor(s/3600) + "h ago";
    return Math.floor(s/86400) + "d ago";
  };
  const computeProgress = (dep, plan) => {
    const elapsed = Date.now() - new Date(dep.confirmedAt || dep.createdAt).getTime();
    return Math.max(0, Math.min(1, elapsed / (plan.days * 86400000)));
  };

  /* ---------- 6. Router (sidebar views) ---------- */
  function setView(name) {
    if (!VIEW_TITLES[name]) name = "overview";
    document.querySelectorAll(".view").forEach(v => v.hidden = v.dataset.view !== name);
    document.querySelectorAll("#sideNav a").forEach(a => a.classList.toggle("active", a.dataset.view === name));
    const meta = VIEW_TITLES[name];
    $("viewTitle").innerHTML = meta.t;
    $("viewSub").textContent = meta.s;
    if (name === "overview" && userName) {
      const g = $("userGreeting"); if (g) g.textContent = userName.split(" ")[0];
    }
    if (name === "wallet") renderWallet();
    if (name === "history") renderHistory();
    if (name === "overview") drawChart();
    history.replaceState(null, "", "#" + name);
    closeSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll("#sideNav a").forEach(a => {
    a.addEventListener("click", (e) => { e.preventDefault(); setView(a.dataset.view); });
  });
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => setView(b.dataset.go)));

  /* ---------- 7. Render: Overview KPIs + investments ---------- */
  function render() {
    const confirmed = state.deposits.filter(d => d.status === "confirmed");
    const totalInvested = confirmed.reduce((a, d) => a + d.amountUsd, 0);
    const totalBtc = confirmed.reduce((a, d) => a + d.amountBtc, 0);

    let portfolio = 0;
    confirmed.forEach(d => {
      const plan = PLANS[d.plan] || PLANS.starter;
      portfolio += d.amountUsd * (1 + plan.roi * computeProgress(d, plan));
    });
    const profit = portfolio - totalInvested;
    const pct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    $("kpiPortfolio").textContent = fmtUsd(portfolio);
    $("kpiPortfolioPct").textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% all‑time`;
    $("kpiPortfolioPct").className = "kpi__sub " + (pct >= 0 ? "up" : "down");
    $("kpiBtc").textContent = fmtBtc(totalBtc);
    $("kpiInvested").textContent = fmtUsd(totalInvested);
    $("kpiDeposits").textContent = `${confirmed.length} deposit${confirmed.length===1?"":"s"}`;
    $("kpiPnl").textContent = (profit >= 0 ? "+" : "") + fmtUsd(profit);
    $("kpiPnl").className = "kpi__value mono " + (profit >= 0 ? "up" : "down");
    $("kpiPnlPct").textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
    $("kpiPnlPct").className = "kpi__sub " + (pct >= 0 ? "up" : "down");

    $("btcPriceTop").textContent = "$" + Math.round(state.btcPrice).toLocaleString();

    renderInvestments(confirmed);
    renderHistory();
    renderNotifs();
    renderWallet();
  }

  function renderInvestments(confirmed) {
    const host = $("investmentsList");
    $("activeCount").textContent = `${confirmed.length} active`;
    if (!confirmed.length) {
      host.innerHTML = `<div class="empty"><div class="empty__ic">📈</div><p><b>No active investments yet</b></p><p class="muted small">Make your first deposit to start growing your portfolio.</p><button class="btn btn--primary" id="emptyDeposit">Start investing</button></div>`;
      $("emptyDeposit").addEventListener("click", openModal);
      return;
    }
    host.innerHTML = confirmed.map(d => {
      const plan = PLANS[d.plan] || PLANS.starter;
      const progress = computeProgress(d, plan);
      const projected = d.amountUsd * (1 + plan.roi);
      const current = d.amountUsd * (1 + plan.roi * progress);
      const daysLeft = Math.max(0, Math.ceil((1 - progress) * plan.days));
      return `<div class="inv">
        <div class="inv__top">
          <div class="inv__plan"><b>${plan.name} Plan</b><span class="inv__chip">+${(plan.roi*100).toFixed(0)}% / ${plan.days}d</span></div>
          <div class="inv__amt">${fmtUsd(current)}</div>
        </div>
        <div class="progress"><div class="progress__bar" style="width:${(progress*100).toFixed(1)}%"></div></div>
        <div class="inv__meta">
          <span>Invested <b>${fmtUsd(d.amountUsd)}</b></span>
          <span>Projected <b>${fmtUsd(projected)}</b></span>
          <span><b>${(progress*100).toFixed(1)}%</b> complete</span>
          <span><b>${daysLeft}d</b> remaining</span>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- 8. History view ---------- */
  function renderHistory() {
    const tbody = $("historyBody"); if (!tbody) return;
    const all = state.deposits.slice().reverse();
    const filtered = state.histFilter === "all" ? all : all.filter(d => d.status === state.histFilter);

    // stats
    const hsCount = $("hsCount"), hsConf = $("hsConfirmed"), hsPen = $("hsPending"), hsVol = $("hsVolume");
    if (hsCount) {
      hsCount.textContent = state.deposits.length;
      hsConf.textContent = state.deposits.filter(d=>d.status==="confirmed").length;
      hsPen.textContent = state.deposits.filter(d=>d.status==="pending").length;
      hsVol.textContent = fmtUsd(state.deposits.reduce((a,d)=>a+d.amountUsd,0));
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted small" style="text-align:center;padding:28px">No deposits to show.</td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.map(d => `
      <tr>
        <td class="muted small">${ago(d.createdAt)}</td>
        <td class="mono"><b>${fmtUsd(d.amountUsd)}</b></td>
        <td class="mono grad">${fmtBtc(d.amountBtc)}</td>
        <td>${(PLANS[d.plan]||PLANS.starter).name}</td>
        <td class="mono small muted">${d.txHash ? d.txHash.slice(0,8)+"…" : "—"}</td>
        <td>${d.status === "confirmed"
          ? '<span class="status status--confirmed">● Confirmed</span>'
          : '<span class="status status--pending">◐ Pending</span>'}</td>
      </tr>`).join("");
  }
  document.querySelectorAll("#histFilter button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#histFilter button").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    state.histFilter = b.dataset.f; save(); renderHistory();
  }));

  /* ---------- 9. Wallet view ---------- */
  function renderWallet() {
    const walUsd = $("walUsd"); if (!walUsd) return;
    const confirmed = state.deposits.filter(d => d.status === "confirmed");
    const totalBtc = confirmed.reduce((a, d) => a + d.amountBtc, 0);
    let portfolio = 0;
    confirmed.forEach(d => {
      const plan = PLANS[d.plan] || PLANS.starter;
      portfolio += d.amountUsd * (1 + plan.roi * computeProgress(d, plan));
    });
    walUsd.textContent = fmtUsd(portfolio);
    $("walBtc").textContent = fmtBtc(totalBtc) + " BTC";
    $("walPrice").textContent = "$" + Math.round(state.btcPrice).toLocaleString();
    const addr = $("walAddress"); if (addr && !addr.value) addr.value = BTC_DEPOSIT_ADDRESS;
    const qr = $("walQr");
    if (qr && !qr.dataset.rendered && window.QRCode) {
      QRCode.toCanvas(BTC_DEPOSIT_ADDRESS, { width: 140, margin: 1, color: { dark: "#06090f", light: "#fff" } }, (err, c) => {
        if (!err) { qr.innerHTML = ""; qr.appendChild(c); qr.dataset.rendered = "1"; }
      });
    }
  }
  $("walDeposit")?.addEventListener("click", openModal);
  $("walWithdraw")?.addEventListener("click", () => toast("Withdrawals open after your first investment cycle.", "info"));
  $("walCopy")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(BTC_DEPOSIT_ADDRESS);
    toast("BTC address copied", "success");
  });
  $("withdrawForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const amt = parseFloat($("wdAmount").value);
    const addr = $("wdAddress").value.trim();
    if (!amt || amt < 20) return toast("Minimum withdrawal is $20", "error");
    if (!addr.startsWith("bc1") && !addr.startsWith("1") && !addr.startsWith("3")) return toast("Enter a valid BTC address", "error");
    pushNotif("Withdrawal requested", `${fmtUsd(amt)} → ${addr.slice(0,8)}…`);
    e.target.reset();
    toast("Withdrawal request submitted", "success");
  });

  /* ---------- 10. Support view ---------- */
  $("contactForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const subj = $("cfSubject").value.trim();
    if (!subj) return;
    pushNotif("Ticket submitted", subj);
    toast("Thanks! We'll reply within the hour.", "success");
    e.target.reset();
  });
  $("liveChatBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    toast("Live chat is opening… (demo)", "info");
  });

  /* ---------- 11. Invest view ---------- */
  document.querySelectorAll("[data-invest]").forEach(b => {
    b.addEventListener("click", () => {
      const plan = b.dataset.invest;
      const radio = document.querySelector(`input[name="plan"][value="${plan}"]`);
      if (radio) radio.checked = true;
      const min = plan === "elite" ? 10000 : plan === "pro" ? 1000 : 500;
      $("amountInput").value = min;
      openModal();
    });
  });

  /* ---------- 12. Notifications ---------- */
  function pushNotif(title, desc) {
    state.notifs.unshift({ id: Date.now(), title, desc, createdAt: new Date().toISOString(), read: false });
    save(); renderNotifs(); toast(title, "success");
  }
  function renderNotifs() {
    const list = $("notifList");
    const unread = state.notifs.filter(n => !n.read).length;
    const badge = $("bellBadge");
    if (unread > 0) { badge.hidden = false; badge.textContent = unread; } else badge.hidden = true;
    if (!state.notifs.length) {
      list.innerHTML = `<div class="empty small muted" style="padding:18px">No notifications yet.</div>`;
      return;
    }
    list.innerHTML = state.notifs.map(n => `
      <div class="notif">
        <div class="notif__ic">✓</div>
        <div><div class="notif__t">${n.title}</div><div class="notif__d">${n.desc} · ${ago(n.createdAt)}</div></div>
      </div>`).join("");
  }
  $("bellBtn").addEventListener("click", () => {
    const p = $("notifPanel"); p.hidden = !p.hidden;
    if (!p.hidden) { state.notifs.forEach(n => n.read = true); save(); renderNotifs(); }
  });
  $("clearNotifs").addEventListener("click", () => { state.notifs = []; save(); renderNotifs(); });

  /* ---------- 13. Deposit Modal ---------- */
  const modal = $("depositModal");
  function openModal() { modal.classList.add("open"); showStep(1); updateQuote(); }
  function closeModal() { modal.classList.remove("open"); }
  function showStep(n) {
    modal.querySelectorAll(".step").forEach(s => s.hidden = +s.dataset.step !== n);
    if (n === 2) renderQR();
  }
  $("quickDeposit").addEventListener("click", openModal);
  $("qaDeposit").addEventListener("click", openModal);
  modal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeModal));

  const getAmount = () => parseFloat($("amountInput").value) || 0;
  const getPlan = () => document.querySelector('input[name="plan"]:checked').value;
  function updateQuote() {
    const amt = getAmount();
    const btc = amt / state.btcPrice;
    $("quoteBtc").textContent = fmtBtc(btc) + " BTC";
    $("quotePrice").textContent = "$" + Math.round(state.btcPrice).toLocaleString();
    $("confAmount").textContent = fmtUsd(amt);
    $("confBtc").textContent = fmtBtc(btc);
  }
  $("amountInput").addEventListener("input", updateQuote);
  document.querySelectorAll('input[name="plan"]').forEach(r => r.addEventListener("change", updateQuote));
  document.querySelectorAll(".presets button").forEach(b => b.addEventListener("click", () => {
    $("amountInput").value = b.dataset.preset; updateQuote();
  }));
  $("toStep2").addEventListener("click", () => {
    if (getAmount() < 50) return toast("Minimum investment is $50", "error");
    showStep(2);
  });
  $("backStep1").addEventListener("click", () => showStep(1));

  function renderQR() {
    const box = $("qrBox"); box.innerHTML = "";
    $("btcAddress").value = BTC_DEPOSIT_ADDRESS;
    if (window.QRCode) {
      QRCode.toCanvas(BTC_DEPOSIT_ADDRESS, { width: 180, margin: 1, color: { dark: "#06090f", light: "#fff" } }, (err, c) => { if (!err) box.appendChild(c); });
    }
  }
  $("copyBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(BTC_DEPOSIT_ADDRESS);
    toast("BTC address copied", "success");
  });

  $("confirmDeposit").addEventListener("click", () => {
    const amt = getAmount();
    if (amt < 50) return toast("Minimum investment is $50", "error");
    const plan = getPlan();
    const dep = {
      id: "dep_" + Date.now(),
      amountUsd: amt,
      amountBtc: amt / state.btcPrice,
      plan,
      txHash: $("txHash").value.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state.deposits.push(dep); save(); render(); closeModal();
    pushNotif("Deposit received", `Your ${fmtUsd(amt)} payment is awaiting confirmation.`);
    setTimeout(() => {
      dep.status = "confirmed"; dep.confirmedAt = new Date().toISOString();
      save(); render();
      pushNotif("Payment confirmed ✓", `${fmtUsd(amt)} added to your ${PLANS[plan].name} plan.`);
    }, 12000);
  });

  /* ---------- 14. Performance chart ---------- */
  function drawChart() {
    const c = $("perfChart"); if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight || 220;
    if (!w) return;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr, dpr);

    const pts = 60, data = []; let v = 50 + Math.random() * 20;
    for (let i = 0; i < pts; i++) { v += (Math.random() - 0.45) * 6 + 0.4; data.push(Math.max(20, v)); }
    const max = Math.max(...data), min = Math.min(...data);
    const xStep = w / (pts - 1);
    const y = (val) => h - ((val - min) / (max - min || 1)) * (h - 20) - 10;

    ctx.strokeStyle = "rgba(255,255,255,.05)";
    for (let i = 0; i < 4; i++) { const yy = (h/4)*i + 10; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(34,230,184,.35)"); grad.addColorStop(1, "rgba(34,230,184,0)");
    ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, h);
    data.forEach((d, i) => ctx.lineTo(i * xStep, y(d)));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

    const lg = ctx.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, "#22e6b8"); lg.addColorStop(1, "#22d3ff");
    ctx.strokeStyle = lg; ctx.lineWidth = 2.4; ctx.lineJoin = "round";
    ctx.beginPath();
    data.forEach((d, i) => i === 0 ? ctx.moveTo(0, y(d)) : ctx.lineTo(i * xStep, y(d)));
    ctx.stroke();
  }
  window.addEventListener("resize", () => { drawChart(); });

  /* ---------- 15. Live BTC ticker ---------- */
  setInterval(() => {
    state.btcPrice += (Math.random() - 0.48) * 80;
    $("btcPriceTop").textContent = "$" + Math.round(state.btcPrice).toLocaleString();
    const wp = $("walPrice"); if (wp) wp.textContent = "$" + Math.round(state.btcPrice).toLocaleString();
    save();
  }, 5000);
  setInterval(render, 30000);

  /* ---------- 16. Sidebar (mobile) ---------- */
  function openSidebar() { $("sidebar").classList.add("open"); $("scrim").hidden = false; }
  function closeSidebar() { $("sidebar").classList.remove("open"); $("scrim").hidden = true; }
  $("burgerDash").addEventListener("click", () => {
    const s = $("sidebar");
    s.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  $("scrim").addEventListener("click", closeSidebar);

  /* ---------- 17. Boot ---------- */
  initUser();
  render();
  drawChart();
  const initial = (location.hash || "").replace("#", "") || "overview";
  setView(initial);
})();

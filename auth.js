/* ApexTrade — Auth (Sign Up / Sign In) with localStorage
   Saves users locally and routes to dashboard.html on success.
   Replace the storage layer with your real backend when ready. */
(() => {
  "use strict";

  const USERS_KEY = "apextrade_users";
  const SESSION_KEY = "apextrade_session";
  const REDIRECT = "dashboard.html";

  /* ---------- Toast ---------- */
  function toast(message, type = "info") {
    let host = document.querySelector(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "toast-msg " + type;
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }
  window.toast = toast;

  /* ---------- Storage helpers ---------- */
  const getUsers = () => {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch { return []; }
  };
  const saveUsers = (u) => localStorage.setItem(USERS_KEY, JSON.stringify(u));
  const setSession = (user) => localStorage.setItem(SESSION_KEY, JSON.stringify({
    email: user.email, firstName: user.firstName, lastName: user.lastName,
    loggedInAt: Date.now()
  }));

  /* ---------- Tiny hash (demo only) ---------- */
  async function hash(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- Password toggle ---------- */
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      if (!input) return;
      const isPwd = input.type === "password";
      input.type = isPwd ? "text" : "password";
      btn.textContent = isPwd ? "Hide" : "Show";
    });
  });

  /* ---------- Password strength ---------- */
  const pwdInput = document.getElementById("password");
  const strengthFill = document.querySelector(".strength__fill");
  const strengthLabel = document.querySelector(".strength__label");
  if (pwdInput && strengthFill) {
    const colors = ["#ef4444", "#f59e0b", "#eab308", "#22e6b8"];
    const labels = ["Too weak", "Weak", "Okay", "Good", "Strong"];
    pwdInput.addEventListener("input", () => {
      const v = pwdInput.value;
      let s = 0;
      if (v.length >= 8) s++;
      if (/[A-Z]/.test(v)) s++;
      if (/[0-9]/.test(v)) s++;
      if (/[^A-Za-z0-9]/.test(v)) s++;
      strengthFill.style.width = (s / 4 * 100) + "%";
      strengthFill.style.background = colors[Math.max(0, s - 1)] || colors[0];
      strengthLabel.textContent = labels[s];
    });
  }

  /* ---------- Sign Up ---------- */
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = signupForm.querySelector(".error-msg");
      errEl.textContent = "";
      const fd = new FormData(signupForm);
      const firstName = (fd.get("firstName") || "").toString().trim();
      const lastName  = (fd.get("lastName") || "").toString().trim();
      const email     = (fd.get("email") || "").toString().trim().toLowerCase();
      const password  = (fd.get("password") || "").toString();
      const terms     = fd.get("terms");

      if (!firstName || !lastName || !email || !password) {
        errEl.textContent = "All fields are required.";
        toast("Please complete every field", "error"); return;
      }
      if (password.length < 8) {
        errEl.textContent = "Password must be at least 8 characters.";
        toast("Password too short", "error"); return;
      }
      if (!terms) {
        errEl.textContent = "Please agree to the Terms.";
        toast("Please accept the Terms", "error"); return;
      }

      const btn = signupForm.querySelector("button[type=submit]");
      btn.disabled = true; const origText = btn.textContent; btn.textContent = "Creating account…";

      try {
        const users = getUsers();
        if (users.find(u => u.email === email)) {
          throw new Error("An account with this email already exists.");
        }
        const passwordHash = await hash(password);
        const user = { firstName, lastName, email, passwordHash, createdAt: Date.now() };
        users.push(user); saveUsers(users); setSession(user);

        toast("Registered successfully! Redirecting…", "success");
        setTimeout(() => { window.location.href = REDIRECT; }, 900);
      } catch (err) {
        errEl.textContent = err.message;
        toast(err.message, "error");
        btn.disabled = false; btn.textContent = origText;
      }
    });
  }

  /* ---------- Sign In ---------- */
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = loginForm.querySelector(".error-msg");
      errEl.textContent = "";
      const fd = new FormData(loginForm);
      const email    = (fd.get("email") || "").toString().trim().toLowerCase();
      const password = (fd.get("password") || "").toString();

      if (!email || !password) {
        errEl.textContent = "Email and password are required.";
        toast("Please fill all fields", "error"); return;
      }

      const btn = loginForm.querySelector("button[type=submit]");
      btn.disabled = true; const origText = btn.textContent; btn.textContent = "Signing in…";

      try {
        const users = getUsers();
        const user = users.find(u => u.email === email);
        if (!user) throw new Error("No account found with this email.");
        const passwordHash = await hash(password);
        if (passwordHash !== user.passwordHash) throw new Error("Incorrect password.");

        setSession(user);
        toast("Logged in successfully! Redirecting…", "success");
        setTimeout(() => { window.location.href = REDIRECT; }, 900);
      } catch (err) {
        errEl.textContent = err.message;
        toast(err.message, "error");
        btn.disabled = false; btn.textContent = origText;
      }
    });
  }
})();

/* mcbflow.com account page.
   Uses the self-hosted supabase-js (vendor/supabase.js). The publishable key below is meant to be public:
   what each account can read or change is enforced by the database's row level security, not by this file. */
(() => {
'use strict';

const SUPABASE_URL = 'https://rxvcjdwmvxhwbdwncfhj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i786YYip9yEZ_KC0CwOcZw_q7yOIoyM';
const RETURN_URL   = 'https://mcbflow.com/account.html';
const THEME_KEY    = 'hub.theme';
const MIN_PASSWORD = 8;
const APP_NAMES = {
  hub: 'Hub', money: 'Money', garden: 'Garden', notes: 'Notes', reading: 'Reading', payday: 'Payday',
  mealprep: 'Meal Prep', nutrition: 'Nutrition', fishing: 'Fishing', weather: 'Weather',
  actionplan: 'Action Plan', auto: 'Auto', wishlist: 'Wishlist'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

/* ---------- theme (shared with the hub) ---------- */
function loadTheme() { try { return JSON.parse(localStorage.getItem(THEME_KEY)) === 'dark' ? 'dark' : 'light'; } catch (_) { return 'light'; } }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const b = $('#themeToggle'); if (b) b.setAttribute('aria-checked', t === 'dark' ? 'true' : 'false');
  const m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#1e2126' : '#ffffff');
}
let theme = loadTheme(); applyTheme(theme);
$('#themeToggle').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch (_) {}
});

/* ---------- small UI helpers ---------- */
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
function show(view) {
  $$('[data-view]').forEach(v => { v.hidden = v.dataset.view !== view; });
  const first = $(`[data-view="${view}"] input:not([type=hidden])`);
  if (first && view !== 'account') first.focus();
}
function msg(el, text, kind = 'err') { el.textContent = text || ''; el.className = 'formMsg ' + (text ? kind : ''); }
async function busy(btn, fn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = label; }
}
function friendly(error) {
  const m = (error && (error.message || error.error_description)) || String(error || 'Something went wrong.');
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match an account.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you. You can send it again below.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a few minutes and try again.';
  if (/password should be|weak password|at least/i.test(m)) return `Choose a longer password (at least ${MIN_PASSWORD} characters).`;
  if (/same.*password|different from the old/i.test(m)) return 'Choose a password different from your current one.';
  if (/failed to fetch|network/i.test(m)) return 'Can’t reach the account server. Check your connection and try again.';
  return m;
}
function openModal(id) { const m = $('#' + id); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); const f = $('input, button.btnDanger, button', m); if (f) f.focus(); }
function closeModal(id) { const m = $('#' + id); m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }
$$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal.open').forEach(m => closeModal(m.id)); });

/* ---------- Supabase ---------- */
if (!window.supabase || !window.supabase.createClient) {
  show('error'); $('#errorText').textContent = 'The account tools didn’t load. Reload the page to try again.'; return;
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
});

let user = null;
let recovering = /type=recovery/.test(location.hash);
let accountDeleted = false;

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') { recovering = true; user = session && session.user; show('recovery'); return; }
  if (event === 'SIGNED_OUT') { user = null; show(accountDeleted ? 'deleted' : 'signin'); return; }
  if (session && session.user) {
    const changed = !user || user.id !== session.user.id || user.email !== session.user.email;
    user = session.user;
    if (!recovering && (changed || event === 'INITIAL_SESSION')) setTimeout(loadAccount, 0);
  } else if (event === 'INITIAL_SESSION') {
    show(recovering ? 'recovery' : 'signin');
  }
});

/* Errors handed back in the link (expired or already used email links). */
(function linkErrors() {
  const p = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const d = p.get('error_description');
  if (d) {
    const text = /expired|invalid/i.test(d) ? 'That email link has expired or was already used. Request a new one.' : d.replace(/\+/g, ' ');
    setTimeout(() => { show('signin'); msg($('#signinMsg'), text); }, 0);
    history.replaceState(null, '', location.pathname);
  }
})();

/* ---------- tabs and links between views ---------- */
$$('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); show(a.dataset.go); }));

/* ---------- sign in ---------- */
$('#signinForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#signinMsg'); msg(out, '');
  $('#resendBox').hidden = true;
  busy($('button[type=submit]', f), async () => {
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) { msg(out, friendly(error)); if (/not confirmed/i.test(error.message)) $('#resendBox').hidden = false; return; }
    f.reset();
  });
});
$('#resendBtn').addEventListener('click', e => {
  const email = $('#signinForm').email.value.trim(), out = $('#signinMsg');
  if (!email) { msg(out, 'Enter your email above first.'); return; }
  busy(e.currentTarget, async () => {
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: RETURN_URL } });
    msg(out, error ? friendly(error) : 'Sent. Check your inbox (and spam folder).', error ? 'err' : 'ok');
  });
});

/* ---------- create account ---------- */
$('#signupForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#signupMsg'); msg(out, '');
  if (f.password.value.length < MIN_PASSWORD) { msg(out, `Use at least ${MIN_PASSWORD} characters for your password.`); return; }
  if (!f.age.checked) { msg(out, 'You need to be 13 or older to create an account.'); return; }
  busy($('button[type=submit]', f), async () => {
    const email = f.email.value.trim();
    const { data, error } = await sb.auth.signUp({
      email, password: f.password.value,
      options: { emailRedirectTo: RETURN_URL, data: { display_name: f.name.value.trim() } }
    });
    if (error) { msg(out, friendly(error)); return; }
    f.reset();
    if (data.session) return;                    // email confirmation turned off: already signed in
    $('#checkEmailAddr').textContent = email;
    show('checkEmail');
  });
});

/* ---------- forgot password ---------- */
$('#forgotForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#forgotMsg'); msg(out, '');
  busy($('button[type=submit]', f), async () => {
    const { error } = await sb.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: RETURN_URL });
    if (error) { msg(out, friendly(error)); return; }
    msg(out, 'If that email has an account, a reset link is on its way. It works once and expires after a while.', 'ok');
  });
});

/* ---------- set a new password (from the reset email) ---------- */
$('#recoveryForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#recoveryMsg'); msg(out, '');
  if (f.password.value.length < MIN_PASSWORD) { msg(out, `Use at least ${MIN_PASSWORD} characters.`); return; }
  if (f.password.value !== f.confirm.value) { msg(out, 'The two passwords don’t match.'); return; }
  busy($('button[type=submit]', f), async () => {
    const { error } = await sb.auth.updateUser({ password: f.password.value });
    if (error) { msg(out, friendly(error)); return; }
    f.reset(); recovering = false;
    history.replaceState(null, '', location.pathname);
    toast('Password saved'); loadAccount();
  });
});

/* ---------- signed-in account ---------- */
async function loadAccount() {
  if (!user) return;
  show('account');
  history.replaceState(null, '', location.pathname);
  $('#acctEmail').textContent = user.email || '';
  $('#acctSince').textContent = user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const pending = user.new_email;
  $('#pendingEmail').hidden = !pending;
  if (pending) $('#pendingEmailAddr').textContent = pending;
  const { data } = await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  $('#nameForm').name.value = (data && data.display_name) || '';
  loadSummary();
}

$('#nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#nameMsg'); msg(out, '');
  busy($('button[type=submit]', f), async () => {
    const name = f.name.value.trim().slice(0, 60) || null;
    const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', user.id);
    if (error) { msg(out, friendly(error)); return; }
    toast('Display name saved');
  });
});

$('#emailForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#emailMsg'); msg(out, '');
  const email = f.email.value.trim();
  if (!email || email.toLowerCase() === (user.email || '').toLowerCase()) { msg(out, 'Enter a different email address.'); return; }
  busy($('button[type=submit]', f), async () => {
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: RETURN_URL });
    if (error) { msg(out, friendly(error)); return; }
    f.reset();
    msg(out, `Almost done: open the confirmation link sent to ${email}. You may also get one at your current address. Your email changes once confirmed.`, 'ok');
  });
});

$('#passwordForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#passwordMsg'); msg(out, '');
  if (f.password.value.length < MIN_PASSWORD) { msg(out, `Use at least ${MIN_PASSWORD} characters.`); return; }
  if (f.password.value !== f.confirm.value) { msg(out, 'The two passwords don’t match.'); return; }
  busy($('button[type=submit]', f), async () => {
    const { error } = await sb.auth.updateUser({ password: f.password.value });
    if (error) { msg(out, friendly(error)); return; }
    f.reset(); toast('Password changed');
  });
});

/* ---------- synced data ---------- */
async function loadSummary() {
  const list = $('#syncList'), empty = $('#syncEmpty'), out = $('#syncMsg');
  msg(out, ''); list.innerHTML = '<li class="syncRow muted">Loading…</li>'; empty.hidden = true;
  const { data, error } = await sb.rpc('my_sync_summary');
  if (error) { list.innerHTML = ''; msg(out, friendly(error)); return; }
  const rows = (data || []).filter(r => Number(r.records) > 0 || r.last_synced);
  if (!rows.length) { list.innerHTML = ''; empty.hidden = false; return; }
  list.innerHTML = rows.map(r => `
    <li class="syncRow">
      <div><b>${esc(APP_NAMES[r.app] || r.app)}</b>
        <span class="muted">${Number(r.records).toLocaleString()} record${Number(r.records) === 1 ? '' : 's'} · last synced ${r.last_synced ? esc(new Date(r.last_synced).toLocaleString()) : 'never'}</span></div>
      <button class="btn sm" type="button" data-del-app="${esc(r.app)}">Delete</button>
    </li>`).join('');
  $$('[data-del-app]', list).forEach(b => b.addEventListener('click', () => {
    pendingApp = b.dataset.delApp;
    $('#delAppName').textContent = APP_NAMES[pendingApp] || pendingApp;
    openModal('delAppModal');
  }));
}
let pendingApp = null;
$('#delAppConfirm').addEventListener('click', e => {
  if (!pendingApp) return;
  busy(e.currentTarget, async () => {
    const { error } = await sb.from('app_data').delete().eq('app', pendingApp);
    closeModal('delAppModal');
    if (error) { msg($('#syncMsg'), friendly(error)); return; }
    toast(`${APP_NAMES[pendingApp] || pendingApp} synced data deleted`); pendingApp = null; loadSummary();
  });
});

$('#exportBtn').addEventListener('click', e => {
  const out = $('#syncMsg'); msg(out, '');
  busy(e.currentTarget, async () => {
    const records = [], PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('app_data')
        .select('app,key,data,updated_at,deleted').order('app').order('key').range(from, from + PAGE - 1);
      if (error) { msg(out, friendly(error)); return; }
      records.push(...data);
      if (data.length < PAGE) break;
    }
    const { data: profile } = await sb.from('profiles').select('display_name,created_at').eq('id', user.id).maybeSingle();
    const payload = {
      app: 'mcbflow.com', kind: 'account-export', format: 1, exported: new Date().toISOString(),
      account: { email: user.email, display_name: profile ? profile.display_name : null, created_at: profile ? profile.created_at : user.created_at },
      records
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mcbflow-account-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Exported ${records.length.toLocaleString()} record${records.length === 1 ? '' : 's'}`);
  });
});

/* ---------- sign out / delete account ---------- */
$('#signoutBtn').addEventListener('click', e => busy(e.currentTarget, async () => {
  await sb.auth.signOut({ scope: 'local' }); toast('Signed out');
}));

$('#deleteAcctBtn').addEventListener('click', () => { $('#delAcctInput').value = ''; $('#delAcctConfirm').disabled = true; msg($('#delAcctMsg'), ''); openModal('delAcctModal'); });
$('#delAcctInput').addEventListener('input', e => { $('#delAcctConfirm').disabled = e.target.value.trim().toUpperCase() !== 'DELETE'; });
$('#delAcctConfirm').addEventListener('click', e => busy(e.currentTarget, async () => {
  const { error } = await sb.rpc('delete_my_account');
  if (error) { msg($('#delAcctMsg'), friendly(error)); return; }
  accountDeleted = true; closeModal('delAcctModal');
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  user = null; show('deleted');
}));
})();

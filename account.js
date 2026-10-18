/* mcbflow.com account page.
   Uses the self-hosted supabase-js (vendor/supabase.js). The publishable key below is meant to be public:
   what each account can read or change is enforced by the database's row level security, not by this file. */
(() => {
'use strict';

const SUPABASE_URL = 'https://rxvcjdwmvxhwbdwncfhj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i786YYip9yEZ_KC0CwOcZw_q7yOIoyM';
const RETURN_URL   = 'https://mcbflow.com/account.html';
const THEME_KEY    = 'hub.theme';
const SESSION_KEY  = 'sb-rxvcjdwmvxhwbdwncfhj-auth-token';   // where supabase-js keeps the sign-in (same key as mb-sync.js)
const KEEP_KEY     = 'hub.keepSignedIn';                     // '0' = sign-in lasts until the browser closes; anything else = kept
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

function toast(msg) { if (window.MBUI) MBUI.toast(msg); }   // 6.3.0: the shared toast (mb-ui.js)
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
/* "Keep me signed in on this device" — same storage behaviour as mb-sync.js 1.1: the sign-in token lives in localStorage
   when kept, in sessionStorage (gone when the browser closes) when not. */
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} }
function ssDel(k) { try { sessionStorage.removeItem(k); } catch (_) {} }
function keepSignedIn() { return lsGet(KEEP_KEY) !== '0'; }
function setKeepSignedIn(on) {
  const raw = lsGet(SESSION_KEY) || ssGet(SESSION_KEY);
  if (on) { lsDel(KEEP_KEY); if (raw) { lsSet(SESSION_KEY, raw); ssDel(SESSION_KEY); } }
  else { lsSet(KEEP_KEY, '0'); if (raw) { ssSet(SESSION_KEY, raw); lsDel(SESSION_KEY); } }
}
const authStore = {
  getItem(k) { return keepSignedIn() ? lsGet(k) : (ssGet(k) || null); },
  setItem(k, v) { if (keepSignedIn()) { lsSet(k, v); ssDel(k); } else { ssSet(k, v); lsDel(k); } },
  removeItem(k) { lsDel(k); ssDel(k); }
};
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storage: authStore, storageKey: SESSION_KEY }
});

/* ---------- profile pictures (mb-avatars.js: the same 28 pictures as mb-sync.js) ---------- */
const AVS = window.MBAvatars || null;
function avatarHTML(id, text) { return AVS ? AVS.svg(id, AVS.initialOf(text)) : esc(((String(text || '?').trim()[0]) || '?').toUpperCase()); }
function paintAvatar(el, id, text) {
  if (!el) return;
  el.innerHTML = avatarHTML(id, text);
  el.classList.toggle('pic', !!(AVS && AVS.ids.includes(id)));
}
function renderPics(box, selected, text, name) {
  if (!box || !AVS) { if (box) box.hidden = true; return; }
  const legend = box.querySelector('legend');
  box.innerHTML = '';
  if (legend) box.appendChild(legend);
  box.insertAdjacentHTML('beforeend', [''].concat(AVS.ids).map(id =>
    `<label class="pic${id ? '' : ' ini'}" title="${esc(AVS.label(id))}"><input type="radio" name="${name}" value="${id}" ${(selected || '') === id ? 'checked' : ''} aria-label="${esc(AVS.label(id))}">${AVS.svg(id, AVS.initialOf(text))}</label>`).join(''));
}
function pickedPic(form, name) { const r = form.querySelector(`input[name="${name}"]:checked`); return r ? r.value : ''; }

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

renderPics($('#signupPics'), '', '', 'signupPic');
// the "Your initial" tile follows what's typed (screen name, else email), like the profile form
$('#signupForm').addEventListener('input', e => {
  if (!AVS || !/^(name|email)$/.test(e.target.name)) return;
  const f = e.currentTarget, l = $('#signupPics .pic.ini .mbs-av-l');
  if (l) l.textContent = AVS.initialOf(f.elements.name.value.trim() || f.elements.email.value.trim());
});
$('#nameForm').addEventListener('input', e => {
  if (!AVS || !user || e.target.name !== 'name') return;
  const l = $('#profilePics .pic.ini .mbs-av-l');
  if (l) l.textContent = AVS.initialOf(e.target.value.trim() || user.email);
});

/* ---------- tabs and links between views ---------- */
$$('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); show(a.dataset.go); }));

/* ---------- sign in ---------- */
$('#signinForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#signinMsg'); msg(out, '');
  $('#resendBox').hidden = true;
  if (f.keep.checked) lsDel(KEEP_KEY); else lsSet(KEEP_KEY, '0');   // where the token is saved (see authStore)
  busy($('button[type=submit]', f), async () => {
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) { msg(out, friendly(error)); if (/not confirmed/i.test(error.message)) $('#resendBox').hidden = false; return; }
    f.reset(); f.keep.checked = keepSignedIn();
  });
});
$('#signinForm').keep.checked = keepSignedIn();
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
      options: { emailRedirectTo: RETURN_URL, data: { display_name: f.elements.name.value.trim().slice(0, 60), avatar: pickedPic(f, 'signupPic') } }
    });
    if (error) { msg(out, friendly(error)); return; }
    f.reset(); renderPics($('#signupPics'), '', '', 'signupPic');
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
  $('#keepToggle').checked = keepSignedIn();
  const md = user.user_metadata || {};
  let name = md.display_name || '';
  const { data } = await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  if (data && data.display_name != null) name = data.display_name || name;
  profile = { name, avatar: md.avatar || '' };
  $('#nameForm').elements.name.value = name;
  renderPics($('#profilePics'), profile.avatar, name || user.email, 'pic');
  paintProfile();
  loadSummary();
}
let profile = { name: '', avatar: '' };
// header chip (saved profile) and the live preview in the Profile form (what Save would store)
function paintProfile() {
  if (!user) return;
  paintAvatar($('#acctAv'), profile.avatar, profile.name || user.email);
  $('#acctName').hidden = !profile.name; $('#acctName').textContent = profile.name;
  const f = $('#nameForm'), name = f.elements.name.value.trim(), pic = pickedPic(f, 'pic');
  paintAvatar($('#profAv'), pic, name || user.email);
  $('#profGreet').textContent = AVS ? AVS.greeting(name) : (name || user.email);
  $('#profSub').textContent = (AVS ? AVS.label(pic) + ' · ' : '') + (user.email || '');
}
$('#nameForm').addEventListener('input', paintProfile);
$('#nameForm').addEventListener('change', paintProfile);
$('#keepToggle').addEventListener('change', e => { setKeepSignedIn(e.currentTarget.checked); toast(e.currentTarget.checked ? 'You’ll stay signed in on this device' : 'You’ll be signed out when the browser closes'); });

$('#nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget, out = $('#nameMsg'); msg(out, '');
  busy($('button[type=submit]', f), async () => {
    // Same two writes as mb-sync.js saveProfile(): the account's user_metadata (what every app reads) and profiles.display_name.
    const name = f.elements.name.value.trim().slice(0, 60), avatar = pickedPic(f, 'pic');
    const { data, error } = await sb.auth.updateUser({ data: { display_name: name, avatar } });
    if (error) { msg(out, friendly(error)); return; }
    if (data && data.user) user = data.user;
    const r = await sb.from('profiles').update({ display_name: name || null }).eq('id', user.id);
    if (r.error) { msg(out, friendly(r.error)); return; }
    profile = { name, avatar }; paintProfile();
    toast('Profile saved');
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

/* ---------- import an account export (6.3.0) ---------- */
let importRows = null;
$('#importBtn').addEventListener('click', () => { msg($('#syncMsg'), ''); $('#importFile').value = ''; $('#importFile').click(); });
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const out = $('#syncMsg'); importRows = null;
  let payload;
  try { payload = JSON.parse(await file.text()); } catch (err) { msg(out, 'That file isn’t valid JSON. Pick the file saved by “Export all synced data”.'); return; }
  const recs = payload && payload.kind === 'account-export' && Array.isArray(payload.records) ? payload.records : null;
  if (!recs) { msg(out, 'That isn’t an mcbflow.com account export. Pick the file saved by “Export all synced data” (an app’s own backup file is imported inside that app).'); return; }
  const rows = recs.filter(r => r && typeof r.app === 'string' && typeof r.key === 'string' && r.key && !r.deleted && r.data != null);
  if (!rows.length) { msg(out, 'That export has no records to import.'); return; }
  importRows = rows;
  const apps = [...new Set(rows.map(r => r.app))].map(a => APP_NAMES[a] || a);
  const when = payload.exported ? new Date(payload.exported).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const other = payload.account && payload.account.email && user && payload.account.email.toLowerCase() !== String(user.email || '').toLowerCase();
  $('#impSummary').innerHTML = `This file has <b>${rows.length.toLocaleString()} record${rows.length === 1 ? '' : 's'}</b> from ${esc(apps.join(', '))}${when ? `, exported ${esc(when)}` : ''}.` +
    (other ? ` <b>It was exported from a different account (${esc(payload.account.email)}).</b>` : '');
  msg($('#impMsg'), ''); $('input[name=impMode][value=missing]').checked = true;
  openModal('impModal');
});
$('#impConfirm').addEventListener('click', e => {
  if (!importRows || !user) return;
  const mode = ($('input[name=impMode]:checked') || {}).value || 'missing', out = $('#impMsg');
  busy(e.currentTarget, async () => {
    let rows = importRows;
    if (mode === 'missing') {      // keep anything on the account that is the same age or newer
      const have = new Map(), PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from('app_data').select('app,key,updated_at').order('app').order('key').range(from, from + PAGE - 1);
        if (error) { msg(out, friendly(error)); return; }
        data.forEach(r => have.set(r.app + '\u0000' + r.key, Date.parse(r.updated_at) || 0));
        if (data.length < PAGE) break;
      }
      rows = rows.filter(r => { const t = have.get(r.app + '\u0000' + r.key); return t == null || (Date.parse(r.updated_at) || 0) > t; });
    }
    if (!rows.length) { closeModal('impModal'); toast('Nothing to import: your account already has everything in that file'); importRows = null; return; }
    const now = new Date().toISOString();
    const send = rows.map(r => ({ user_id: user.id, app: r.app, key: r.key, data: r.data, deleted: false,
      updated_at: mode === 'replace' ? now : (r.updated_at || now) }));
    let done = 0, failed = 0, batch = [], bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const { error } = await sb.from('app_data').upsert(batch, { onConflict: 'user_id,app,key' });
      if (error) failed += batch.length; else done += batch.length;
      batch = []; bytes = 0;
    };
    for (const r of send) {
      let n = 200; try { n += JSON.stringify(r.data).length; } catch (err) {}
      if (batch.length && (batch.length >= 200 || bytes + n > 900000)) await flush();
      batch.push(r); bytes += n;
    }
    await flush();
    importRows = null; closeModal('impModal'); loadSummary();
    if (failed) msg($('#syncMsg'), `Imported ${done.toLocaleString()} record${done === 1 ? '' : 's'}; ${failed.toLocaleString()} couldn’t be saved (an app that no longer syncs, or a record that’s too large).`);
    else toast(`Imported ${done.toLocaleString()} record${done === 1 ? '' : 's'}. Your apps pick them up on their next sync.`);
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

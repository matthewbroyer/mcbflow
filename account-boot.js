/* Runs first on account.html: refuse to display inside another site's frame, and apply the saved theme before paint. */
if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location.href; } catch (_) {} }
try { if (JSON.parse(localStorage.getItem('hub.theme')) === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch (_) {}

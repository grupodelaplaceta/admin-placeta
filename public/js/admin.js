// ── Sidebar toggle ────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── apiFetch ──────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { const e = await r.json(); if (e.error) msg = e.error; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── Toast ──────────────────────────────────────────────────────────────────
function mostrarToast(mensaje, tipo = 'info') {
  const colors = { success: '#22a06b', error: '#d03131', info: '#3f00d8', warning: '#d7a02d' };
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.style.cssText = `
    position: fixed; bottom: 28px; right: 28px; z-index: 99999;
    background: #fff; color: #111;
    padding: 16px 24px; border-radius: 16px; font-weight: 500;
    font-size: 14px; box-shadow: 0 8px 40px rgba(0,0,0,0.12);
    animation: toastIn 0.35s ease-out;
    font-family: 'Outfit', sans-serif; max-width: 420px;
    border: 1px solid #e8e4f0;
    display: flex; align-items: center; gap: 10px;
    border-left: 4px solid ${colors[tipo] || colors.info};
  `;
  toast.innerHTML = `<span style="font-size:18px">${icons[tipo] || 'ℹ️'}</span><span>${mensaje}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ── Modal ──────────────────────────────────────────────────────────────────
function mostrarModal(titulo, html) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4); z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(6px);
    animation: overlayIn 0.2s ease;
    padding: 20px;
  `;
  overlay.innerHTML = `
    <div class="modal-window" style="
      background: #fff; border: 1px solid #e8e4f0;
      border-radius: 20px; padding: 32px;
      max-width: 540px; width: 100%;
      max-height: 90vh; overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f0ecf8">
        <h3 style="font-weight:700;font-size:18px;color:#111;margin:0">${titulo}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" style="
          background: #f0ecf8; border: none;
          width: 32px; height: 32px; border-radius: 50%;
          font-size: 16px; cursor: pointer; color: #666;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        " onmouseover="this.style.background='#e0daf0'" onmouseout="this.style.background='#f0ecf8'">✕</button>
      </div>
      <div style="font-size:14px;color:#444;line-height:1.6">${html}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  // Close on Escape
  const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

// ── Búsqueda en tabla ─────────────────────────────────────────────────────
document.addEventListener('click', function(e) {
  const searchBtn = e.target.closest('[data-search-btn]');
  if (searchBtn) {
    const input = searchBtn.previousElementSibling;
    const term = input.value.toLowerCase();
    const table = searchBtn.closest('.table-container')?.querySelector('table');
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  }
});

// ── Inicialización ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Cerrar sidebar al hacer clic fuera en móvil
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !e.target.closest('.hamburger')) {
        sidebar.classList.remove('open');
      }
    }
  });
});

// ── Animaciones ───────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes toastIn { from { transform: translateX(60px) translateY(10px); opacity: 0; } to { transform: translateX(0) translateY(0); opacity: 1; } }
  @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes modalIn { from { transform: scale(0.92) translateY(30px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
  /* Table search highlight */
  .table-search-highlight { background: #fff8d6 !important; }
  /* Scrollbar for tables */
  .table-container::-webkit-scrollbar { height: 6px; }
  .table-container::-webkit-scrollbar-track { background: transparent; }
  .table-container::-webkit-scrollbar-thumb { background: #d0c8e0; border-radius: 3px; }
  .table-container::-webkit-scrollbar-thumb:hover { background: #b8aed0; }
`;
document.head.appendChild(style);

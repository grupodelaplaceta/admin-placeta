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
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: ${colors[tipo] || colors.info}; color: #fff;
    padding: 14px 24px; border-radius: 10px; font-weight: 600;
    font-size: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    animation: slideIn 0.3s ease-out;
    font-family: 'Outfit', sans-serif; max-width: 400px; border: 1px solid rgba(255,255,255,0.15);
  `;
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Modal ──────────────────────────────────────────────────────────────────
function mostrarModal(titulo, html) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-window">
      <div class="modal-header">
        <h3>${titulo}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">${html}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
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

// ── Animación slideIn ─────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
  }
  .modal-window {
    background: #fff; border: 1px solid #e5e7eb;
    border-radius: 16px; padding: 32px;
    max-width: 500px; width: 90%; max-height: 85vh; overflow: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    animation: modalIn 0.25s ease-out;
  }
  @keyframes modalIn {
    from { transform: scale(0.9) translateY(20px); opacity: 0; }
    to { transform: scale(1) translateY(0); opacity: 1; }
  }
  .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .modal-header h3 { font-weight: 700; font-size: 18px; color: #111; }
  .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; }
  .modal-body { font-size: 14px; color: #444; }
`;
document.head.appendChild(style);

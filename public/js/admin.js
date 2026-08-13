// ── Sidebar toggle ────────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const open = sb.classList.toggle('open');
  if (open && window.innerWidth <= 768) {
    // Refuerzo: si pasada la transición (360ms) el drawer sigue fuera de
    // pantalla (navegador que no aplica el transform del CSS), se fuerza por
    // JS. En navegadores normales la transición ya lo dejó en 0 y no se toca.
    setTimeout(() => {
      if (sb.classList.contains('open') && sb.getBoundingClientRect().left < 0) {
        sb.style.transform = 'translateX(0)';
      }
    }, 360);
  } else if (!open) {
    sb.style.transform = '';
  }
}

// ── apiFetch con manejo de errores RSP ────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    let isRSPError = false;
    let rspCode = '';
    let slideup = false;
    try {
      const e = await r.json();
      if (e.error) msg = e.error;
      if (e.slideup) slideup = true;
      if (e.error && e.error.startsWith('RSP-ERR')) {
        isRSPError = true;
        rspCode = e.error;
        msg = e.mensaje || msg;
      }
      if (e.mantenimiento) {
        // Error global de mantenimiento → recargar para ver pantalla completa
        mostrarPantallaMantenimiento(e.mensaje || msg, rspCode);
        throw new Error('MANTENIMIENTO');
      }
    } catch (e) {
      if (e.message === 'MANTENIMIENTO') throw e;
    }
    if (slideup || isRSPError) {
      mostrarSlideupError(rspCode || `ERR-${r.status}`, msg);
    }
    throw new Error(msg);
  }
  return r.json();
}

// ── Slideup de error RSP ──────────────────────────────────────────────────
function mostrarSlideupError(codigo, mensaje) {
  const existing = document.querySelector('.rsp-slideup');
  if (existing) existing.remove();

  const slideup = document.createElement('div');
  slideup.className = 'rsp-slideup';
  slideup.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
    background: #1f0070; color: #fff;
    padding: 20px 24px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    animation: slideUpIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 -8px 40px rgba(0,0,0,0.2);
    display: flex; align-items: center; gap: 16px;
  `;
  slideup.innerHTML = `
    <div style="flex-shrink:0;width:44px;height:44px;background:#d03131;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px">⚠️</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:11px;font-weight:700;color:#ff6b6b;text-transform:uppercase;letter-spacing:0.5px">${codigo || 'RSP-ERR'}</div>
      <div style="font-size:13px;margin-top:2px">${mensaje}</div>
    </div>
    <button onclick="this.closest('.rsp-slideup').remove()" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:16px;cursor:pointer">✕</button>
  `;
  document.body.appendChild(slideup);

  // Auto-dismiss después de 8 segundos
  setTimeout(() => {
    if (slideup.parentNode) {
      slideup.style.transform = 'translateY(100%)';
      slideup.style.transition = 'transform 0.3s ease';
      setTimeout(() => slideup.remove(), 300);
    }
  }, 8000);
}

// ── Pantalla completa de mantenimiento/error RSP ─────────────────────────
function mostrarPantallaMantenimiento(mensaje, codigo) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 100000;
    background: #1f0070;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Plus Jakarta Sans', sans-serif;
    padding: 20px;
  `;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px;padding:48px 40px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:64px;margin-bottom:16px">🔧</div>
      <div style="display:inline-block;padding:6px 16px;border-radius:50px;font-size:11px;font-weight:700;background:#fef2f2;color:#d03131;margin-bottom:16px">${codigo || 'RSP-ERR'}</div>
      <div style="font-size:22px;font-weight:800;color:#111;margin-bottom:8px">Servicio no disponible</div>
      <div style="font-size:14px;color:#888;line-height:1.6;margin-bottom:20px">${mensaje}</div>
      <button onclick="location.reload()" style="padding:12px 32px;background:#3702b3;color:#fff;border:none;border-radius:12px;font:600 14px 'Plus Jakarta Sans';cursor:pointer">🔄 Reintentar</button>
    </div>
  `;
  document.body.innerHTML = '';
  document.body.appendChild(overlay);
}

// ── Workspace switcher toggle ─────────────────────────────────────────────
function toggleWorkspaceSwitcher() {
  const dd = document.getElementById('wsDropdown');
  if (dd) dd.classList.toggle('open');
}

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', function(e) {
  const dd = document.getElementById('wsDropdown');
  if (dd && !e.target.closest('.sidebar-switcher') && dd.classList.contains('open')) {
    dd.classList.remove('open');
  }
});

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
function cerrarModal() {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
}

function mostrarModal(titulo, html, botones) {
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
  const botonesHtml = Array.isArray(botones) && botones.length
    ? `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid #f0ecf8">
        ${botones.map(b => {
          const cl = b.clase || 'btn-secondary';
          const accion = typeof b.onClick === 'function' ? b.onClick.toString() : (b.onClick || '');
          return `<button class="${cl}" ${accion ? `onclick="(${accion})()"` : ''}>${b.texto}</button>`;
        }).join('')}
      </div>` : '';
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
        <button class="modal-close" onclick="cerrarModal()" style="
          background: #f0ecf8; border: none;
          width: 32px; height: 32px; border-radius: 50%;
          font-size: 16px; cursor: pointer; color: #666;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        " onmouseover="this.style.background='#e0daf0'" onmouseout="this.style.background='#f0ecf8'">✕</button>
      </div>
      <div style="font-size:14px;color:#444;line-height:1.6">${html}</div>
      ${botonesHtml}
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarModal(); });
  // Close on Escape
  const escHandler = (e) => { if (e.key === 'Escape') { cerrarModal(); document.removeEventListener('keydown', escHandler); } };
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

// ── Documentos contextuales (usado desde cualquier vista) ─────────────────
function verDocsDe(refTipo, refId, entidad, refNombre) {
  fetch('/api/' + entidad + '/documentos/por-ref/' + refTipo + '/' + refId)
    .then(r => r.json())
    .then(data => {
      const docs = data.documentos || [];
      let html = '<div style="margin-bottom:12px">';
      if (docs.length === 0) {
        html += '<p style="color:#888;text-align:center;padding:20px">Sin documentos asociados.</p>';
      } else {
        html += '<table style="width:100%;border-collapse:collapse">';
        html += '<tr style="border-bottom:1px solid #f0ecf8"><th style="text-align:left;padding:8px;font-size:12px;font-weight:600;color:#666">Documento</th><th style="text-align:left;padding:8px;font-size:12px;font-weight:600;color:#666">Estado</th><th style="text-align:left;padding:8px;font-size:12px;font-weight:600;color:#666">Acción</th></tr>';
        docs.forEach(d => {
          const estLbl = d.estado === 'firmado' ? '✅ Firmado' : d.estado === 'final' ? 'Final' : 'Borrador';
          html += `<tr style="border-bottom:1px solid #f0ecf8">
            <td style="padding:8px;font-size:13px"><strong>${d.titulo || d.tipo}</strong></td>
            <td style="padding:8px"><span class="badge ${d.estado === 'firmado' ? 'badge-success' : d.estado === 'final' ? 'badge-info' : 'badge-warning'}">${estLbl}</span></td>
            <td style="padding:8px">
              <button class="btn-sm btn-secondary" onclick="window.open('/api/${entidad}/documentos/'+'${d.id}'+'/pdf','_blank')">📥 PDF</button>
            </td>
          </tr>`;
        });
        html += '</table>';
      }
      html += '</div>';
      html += `<div class="actions"><button class="btn-primary btn-sm" onclick="mostrarModal('📄 Nuevo Documento',\`
        <input type="text" id="docTituloModal" class="form-input" placeholder="Título" style="margin-bottom:8px">
        <select id="docTipoModal" class="form-input" style="margin-bottom:8px"><option value="informe-pdf">Informe PDF</option><option value="certificado">Certificado</option><option value="notificacion">Notificación</option></select>
        <textarea id="docContModal" class="form-input" placeholder="Contenido..." style="min-height:80px;margin-bottom:8px"></textarea>
        <button class="btn-primary" onclick="crearDocRef('${refTipo}','${refId}','${entidad}')">💾 Guardar</button>
      \`)">📄 Nuevo</button></div>`;
      mostrarModal('📄 Documentos' + (refNombre ? ' de ' + refNombre : ''), html);
    });
}

async function crearDocRef(refTipo, refId, entidad) {
  const titulo = document.getElementById('docTituloModal')?.value || '';
  const tipo = document.getElementById('docTipoModal')?.value || 'informe-pdf';
  const contenido = document.getElementById('docContModal')?.value || '';
  try {
    await apiFetch('/api/' + entidad + '/documentos', {
      method: 'POST',
      body: JSON.stringify({ tipo, titulo, datos: { contenido }, refId, refTipo })
    });
    mostrarToast('✅ Documento creado', 'success');
    document.querySelector('.modal-overlay')?.remove();
  } catch(e) { mostrarToast('Error: ' + e.message, 'error'); }
}

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

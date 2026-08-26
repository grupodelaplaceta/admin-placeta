import { useEffect, useMemo, useRef, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, Empty, Field, PageHeader, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { BopDocumento, CNICRegla } from '../../types';

type Workspace = 'cni' | 'cnic';
type DocForm = { codigo: string; titulo: string; tipo: string; categoria: string; contenidoMd: string; notasCambio: string; cnicRefs: string };
const EMPTY_DOC: DocForm = { codigo: '', titulo: '', tipo: 'cni', categoria: 'capitulo', contenidoMd: '', notasCambio: '', cnicRefs: '' };

function estadoTone(estado: string): 'success' | 'neutral' | 'warning' {
  return estado === 'vigente' || estado === 'aprobado' ? 'success' : estado === 'borrador' ? 'neutral' : 'warning';
}
function textoVisible(html: string) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function markdownToHtml(markdown: string) {
  if (!markdown) return '';
  return markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.*)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
    .split(/\n{2,}/).map((block) => block.startsWith('<h') || block.startsWith('<ul') ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
}
function htmlToMarkdown(html: string) {
  const root = document.createElement('div'); root.innerHTML = html;
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement; const body = Array.from(el.childNodes).map(render).join('');
    if (el.tagName === 'TABLE') {
      const rows = Array.from(el.querySelectorAll('tr')).map((row) => `| ${Array.from(row.children).map((cell) => (cell.textContent || '').trim()).join(' | ')} |`);
      return rows.length ? `${rows[0]}\n| ${Array.from(el.querySelectorAll('tr')[0]?.children || []).map(() => '---').join(' | ')} |\n${rows.slice(1).join('\n')}\n\n` : '';
    }
    if (/^H[1-3]$/.test(el.tagName)) return `${'#'.repeat(Number(el.tagName.slice(1)))} ${body.trim()}\n\n`;
    if (el.tagName === 'P' || el.tagName === 'DIV') return `${body.trim()}\n\n`;
    if (el.tagName === 'BR') return '\n';
    if (el.tagName === 'LI') return `- ${body.trim()}\n`;
    if (el.tagName === 'STRONG' || el.tagName === 'B') return `**${body}**`;
    if (el.tagName === 'EM' || el.tagName === 'I') return `*${body}*`;
    return body;
  };
  return Array.from(root.childNodes).map(render).join('').replace(/\n{3,}/g, '\n\n').trim();
}
export default function Bop() {
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState<Workspace>('cni');
  const [items, setItems] = useState<CNICRegla[] | null>(null);
  const [documentos, setDocumentos] = useState<BopDocumento[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [docForm, setDocForm] = useState<DocForm>(EMPTY_DOC);
  const [cnicForm, setCnicForm] = useState({ codigo: 'CNIC-', valor: '', motivo: '' });
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  function seleccionar(d: BopDocumento) {
    setSelectedId(d.id);
    setDocForm({ codigo: d.codigo, titulo: d.titulo, tipo: d.tipo, categoria: d.categoria, contenidoMd: d.contenidoMd || '', notasCambio: '', cnicRefs: (d.cnicRefs || []).map((r) => r.codigo).join(', ') });
    requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(d.contenidoMd || ''); });
  }
  function cargar() {
    provider.listarCNIC().then(setItems).catch(() => setItems([]));
    provider.listarBopDocumentos().then((docs) => { setDocumentos(docs); if (!selectedId && docs[0]) seleccionar(docs[0]); }).catch(() => setDocumentos([]));
  }
  useEffect(() => { cargar(); }, []);
  function nuevoDocumento() { setSelectedId(null); setDocForm(EMPTY_DOC); requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = ''; }); }
  function exec(command: string, value?: string) { editorRef.current?.focus(); document.execCommand(command, false, value); }
  function insertarCnic(codigo: string) {
    if (!codigo) return;
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, `<span class="bop-cnic-token" data-cnic="${codigo}">{{${codigo}}}</span>&nbsp;`);
    if (editorRef.current) setDocForm((f) => ({ ...f, contenidoMd: htmlToMarkdown(editorRef.current?.innerHTML || '') }));
    toast(`${codigo} insertado: se resolverá con su valor vigente`, 'success');
  }
  function insertarTabla() {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<table><thead><tr><th>Concepto</th><th>Valor</th></tr></thead><tbody><tr><td>Nuevo concepto</td><td>{{CNIC-CODIGO}}</td></tr></tbody></table><p><br></p>');
    toast('Tabla insertada. Sustituye el CNIC por una referencia oficial.', 'info');
  }
  async function guardarDocumento() {
    const contenido = htmlToMarkdown(editorRef.current?.innerHTML || docForm.contenidoMd);
    if (!docForm.codigo.trim() || !docForm.titulo.trim() || !textoVisible(contenido) || !docForm.notasCambio.trim()) { toast('Completa código, título, contenido y motivo del cambio', 'error'); return; }
    setSaving(true);
    try { const saved = await provider.guardarBopDocumento({ ...docForm, contenidoMd: contenido, cnicRefs: docForm.cnicRefs.split(',').map((codigo) => ({ codigo: codigo.trim(), etiqueta: codigo.trim() })).filter((r) => r.codigo) }); toast('Proyecto guardado correctamente', 'success'); setSelectedId(saved.id); cargar(); } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  }
  async function aprobarDocumento(id: string) { try { await provider.aprobarBopDocumento(id); toast('Documento publicado en BOP', 'success'); cargar(); } catch (e) { toast((e as Error).message, 'error'); } }
  async function aprobar(codigo: string) { try { await provider.aprobarCNIC(codigo); toast('CNIC aprobado y publicado', 'success'); cargar(); } catch (e) { toast((e as Error).message, 'error'); } }
  async function nuevaVersion() { if (!cnicForm.codigo.trim() || !cnicForm.valor.trim() || !cnicForm.motivo.trim()) { toast('Completa código, valor y motivo', 'error'); return; } try { await provider.crearVersionCNIC({ codigo: cnicForm.codigo.trim(), valor: Number(cnicForm.valor), motivo: cnicForm.motivo.trim() }); toast('Nueva versión creada como borrador', 'success'); setCnicForm({ codigo: 'CNIC-', valor: '', motivo: '' }); cargar(); } catch (e) { toast((e as Error).message, 'error'); } }
  async function refrescar() { setSyncing(true); try { const r = await provider.refrescarNormativa(); toast(`Sincronizado con ${r.fuente} · ${r.total} reglas`, 'success'); cargar(); } catch (e) { toast((e as Error).message, 'error'); } finally { setSyncing(false); } }
  const filteredDocs = useMemo(() => (documentos || []).filter((d) => `${d.codigo} ${d.titulo}`.toLowerCase().includes(query.toLowerCase())), [documentos, query]);
  const filteredCnic = useMemo(() => (items || []).filter((c) => `${c.codigo} ${c.etiqueta}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const selectedDoc = documentos?.find((d) => d.id === selectedId);

  return <>
    <PageHeader title="BOP · Centro normativo" subtitle="Crea, revisa y publica la normativa oficial con referencias CNIC vivas." breadcrumb="RSP / Normativa / BOP" actions={<><Badge tone="success"><Icon name="circleCheck" size={14} /> BOP conectado</Badge><Button size="sm" variant="outline" icon="refresh" onClick={refrescar} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar'}</Button></>} />
    <div className="bop-switcher"><button className={workspace === 'cni' ? 'is-active' : ''} onClick={() => setWorkspace('cni')}><span className="bop-switcher-icon"><Icon name="file" /></span><span><strong>CNI</strong><small>Documentos normativos</small></span><Icon name="chevronRight" size={16} /></button><button className={workspace === 'cnic' ? 'is-active' : ''} onClick={() => setWorkspace('cnic')}><span className="bop-switcher-icon bop-switcher-icon-gold"><Icon name="scale" /></span><span><strong>CNIC</strong><small>Valores complementarios</small></span><Icon name="chevronRight" size={16} /></button></div>
    {workspace === 'cni' ? <section className="bop-workspace"><aside className="bop-library rsp-card"><div className="bop-library-head"><div><span className="bop-eyebrow">Biblioteca CNI</span><h2>Documentos</h2></div><Button size="sm" icon="plus" onClick={nuevoDocumento}>Nuevo</Button></div><div className="bop-search"><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar documento…" aria-label="Buscar documento" /></div><div className="bop-doc-list">{documentos === null ? <Spinner label="Cargando documentos…" /> : filteredDocs.length === 0 ? <Empty icon="file" title="Sin documentos" hint="Crea el primer documento normativo." /> : filteredDocs.map((d) => <button key={d.id} className={`bop-doc-item ${selectedId === d.id ? 'is-selected' : ''}`} onClick={() => seleccionar(d)}><span className="bop-doc-icon"><Icon name="file" size={17} /></span><span className="bop-doc-copy"><strong>{d.codigo}</strong><span>{d.titulo}</span><small>v{d.version} · {d.estado}</small></span><Icon name="chevronRight" size={15} /></button>)}</div></aside>
      <main className="bop-editor-shell"><div className="bop-editor-top"><div><span className="bop-eyebrow">{selectedDoc ? `Editando · versión ${selectedDoc.version}` : 'Nuevo documento'}</span><h2>{docForm.titulo || 'Documento sin título'}</h2></div><div className="u-row"><Badge tone={selectedDoc ? estadoTone(selectedDoc.estado) : 'neutral'}>{selectedDoc?.estado || 'borrador'}</Badge>{selectedDoc && selectedDoc.estado !== 'vigente' && <Button size="sm" variant="outline" icon="stamp" onClick={() => aprobarDocumento(selectedDoc.id)}>Publicar</Button>}<Button size="sm" onClick={guardarDocumento} icon="check" disabled={saving}>{saving ? 'Guardando…' : 'Guardar proyecto'}</Button></div></div><div className="bop-editor-meta"><input className="bop-title-input" value={docForm.titulo} onChange={(e) => setDocForm({ ...docForm, titulo: e.target.value })} placeholder="Título del documento" /><span className="bop-save-state"><Icon name="circleCheck" size={14} /> Editor visual</span></div><div className="bop-editor-layout"><div className="bop-canvas-wrap"><div className="bop-toolbar" role="toolbar" aria-label="Formato del documento"><select aria-label="Estilo de texto" onChange={(e) => exec('formatBlock', e.target.value)} defaultValue="p"><option value="p">Texto normal</option><option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option></select><i /><button type="button" onClick={() => exec('bold')} title="Negrita"><b>B</b></button><button type="button" onClick={() => exec('italic')} title="Cursiva"><i>I</i></button><button type="button" onClick={() => exec('underline')} title="Subrayado"><u>U</u></button><i /><button type="button" onClick={() => exec('insertUnorderedList')} title="Lista"><Icon name="clipboard" size={16} /></button><button type="button" onClick={() => exec('insertOrderedList')} title="Lista numerada">1.</button><button type="button" onClick={() => exec('justifyLeft')} title="Alinear izquierda">≡</button><button type="button" onClick={() => exec('justifyCenter')} title="Centrar">≡</button><button type="button" onClick={() => exec('strikeThrough')} title="Tachado"><s>S</s></button><button type="button" onClick={() => exec('formatBlock', 'blockquote')} title="Cita">❝</button><button type="button" onClick={() => exec('insertHorizontalRule')} title="Línea horizontal">―</button><button type="button" onClick={insertarTabla} title="Insertar tabla">▦</button><button type="button" onClick={() => exec('undo')} title="Deshacer">↶</button><button type="button" onClick={() => exec('redo')} title="Rehacer">↷</button><button type="button" onClick={() => exec('removeFormat')} title="Limpiar formato">Tx</button><span className="bop-toolbar-spacer" /><select className="bop-cnic-select" aria-label="Insertar CNIC" defaultValue="" onChange={(e) => { insertarCnic(e.target.value); e.currentTarget.value = ''; }}><option value="">＋ Insertar CNIC</option>{(items || []).filter((c) => c.estado === 'vigente').map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.etiqueta}</option>)}</select></div><div ref={editorRef} className="bop-canvas" contentEditable suppressContentEditableWarning onInput={(e) => setDocForm({ ...docForm, contenidoMd: htmlToMarkdown(e.currentTarget.innerHTML) })} data-placeholder="Empieza a redactar el documento normativo…" /><div className="bop-editor-hint"><Icon name="info" size={14} /> Inserta formatos y tablas desde la barra. Usa <code>{'{{CNIC-CODIGO}}'}</code> para valores vivos del BOP.</div></div><aside className="bop-properties"><div className="bop-properties-title"><Icon name="settings" size={17} /><strong>Propiedades</strong></div><Field label="Código"><input value={docForm.codigo} onChange={(e) => setDocForm({ ...docForm, codigo: e.target.value })} placeholder="CNI-IV" /></Field><Field label="Tipo"><select value={docForm.tipo} onChange={(e) => setDocForm({ ...docForm, tipo: e.target.value })}><option value="cni">CNI</option><option value="estatuto">Estatuto</option><option value="programa">Programa</option></select></Field><Field label="Categoría"><select value={docForm.categoria} onChange={(e) => setDocForm({ ...docForm, categoria: e.target.value })}><option value="capitulo">Capítulo</option><option value="sistema">Sistema</option><option value="programa">Programa</option><option value="general">General</option></select></Field><Field label="Referencias CNIC" hint="Separa los códigos por comas"><input value={docForm.cnicRefs} onChange={(e) => setDocForm({ ...docForm, cnicRefs: e.target.value })} placeholder="CNIC-IVA, CNIC-LIMITE" /></Field><Field label="Motivo del cambio"><textarea rows={4} value={docForm.notasCambio} onChange={(e) => setDocForm({ ...docForm, notasCambio: e.target.value })} placeholder="Describe qué cambia y por qué…" /></Field><div className="bop-help"><Icon name="info" size={16} /><span>Los documentos se crean como proyecto y solo se publican tras su aprobación.</span></div></aside></div></main></section> : <section className="bop-cnic-page"><div className="bop-cnic-head"><div><span className="bop-eyebrow">Parámetros vivos del sistema</span><h2>Reglas CNIC</h2><p>Valores que el motor fiscal utiliza en tiempo real. Cada cambio crea una nueva versión.</p></div><Button icon="plus" onClick={() => document.getElementById('bop-cnic-new')?.scrollIntoView({ behavior: 'smooth' })}>Nueva versión</Button></div><div className="bop-cnic-grid"><Card className="bop-cnic-create" id="bop-cnic-new"><div className="bop-card-kicker"><span className="bop-round-icon"><Icon name="plus" size={17} /></span><div><h3>Nueva versión CNIC</h3><p>Se guardará como borrador para revisión.</p></div></div><div className="bop-form-stack"><Field label="Código CNIC"><input value={cnicForm.codigo} onChange={(e) => setCnicForm({ ...cnicForm, codigo: e.target.value })} placeholder="CNIC-FISC-001" /></Field><div className="bop-two-fields"><Field label="Nuevo valor"><input value={cnicForm.valor} onChange={(e) => setCnicForm({ ...cnicForm, valor: e.target.value })} placeholder="80" inputMode="decimal" /></Field><Field label="Unidad"><input placeholder="% / € / días" /></Field></div><Field label="Motivo del cambio"><textarea rows={3} value={cnicForm.motivo} onChange={(e) => setCnicForm({ ...cnicForm, motivo: e.target.value })} placeholder="Explica el ajuste normativo…" /></Field><Button icon="check" onClick={nuevaVersion}>Crear borrador</Button></div></Card><Card className="bop-cnic-list"><div className="bop-list-head"><div><h3>Catálogo de reglas</h3><span>{filteredCnic.length} reglas · valores publicados por BOP</span></div><div className="bop-search"><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar CNIC…" /></div></div>{items === null ? <Spinner label="Cargando CNIC…" /> : filteredCnic.length === 0 ? <Empty icon="scale" title="Sin reglas" hint="No hay CNIC que coincidan con la búsqueda." /> : <div className="bop-rule-list">{filteredCnic.map((c) => <div className="bop-rule" key={c.codigo}><div className="bop-rule-main"><span className="bop-rule-code">{c.codigo}</span><strong>{c.etiqueta}</strong><small>{c.fuente === 'BOP' ? 'Fuente oficial · ' : 'Local · '}v{c.version}{c.fechaVigencia ? ` · vigente desde ${c.fechaVigencia}` : ''}</small></div><div className="bop-rule-value"><strong>{c.valor}{c.unidad || ''}</strong><Badge tone={estadoTone(c.estado)}>{c.estado}</Badge>{c.estado !== 'vigente' && <Button size="sm" variant="outline" onClick={() => aprobar(c.codigo)}>Aprobar</Button>}</div></div>)}</div>}</Card></div></section>}
  </>;
}

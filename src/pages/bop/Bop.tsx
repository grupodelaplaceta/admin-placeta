import { useEffect, useRef, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, CardHeader, Field, PageHeader, Spinner, Table, Tabs, useToast, type Column } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { BopDocumento, CNICRegla } from '../../types';

export default function Bop() {
  const { toast } = useToast();
  const [items, setItems] = useState<CNICRegla[] | null>(null);
  const [documentos, setDocumentos] = useState<BopDocumento[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [panel, setPanel] = useState('cni');
  const [form, setForm] = useState({ codigo: 'CNIC-', valor: '', motivo: '' });
  const [docForm, setDocForm] = useState({ codigo: '', titulo: '', tipo: 'cni', categoria: 'capitulo', contenidoMd: '', notasCambio: '', cnicRefs: '' });
  const [preview, setPreview] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const cargar = () => { provider.listarCNIC().then(setItems).catch(() => setItems([])); provider.listarBopDocumentos().then(setDocumentos).catch(() => setDocumentos([])); };
  useEffect(() => { cargar(); }, []);

  async function refrescar() {
    setSincronizando(true);
    try {
      const r = await provider.refrescarNormativa();
      toast(`Sincronizado con ${r.fuente} (${r.total} reglas)`, 'success');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSincronizando(false);
    }
  }

  async function nuevaVersion() {
    if (!form.codigo.trim() || form.valor.trim() === '') return;
    try {
      await provider.crearVersionCNIC({ codigo: form.codigo.trim(), valor: Number(form.valor), motivo: form.motivo });
      toast('Nueva versión creada (borrador). Se publicará en el BOP al aprobarse.', 'success');
      setForm({ codigo: 'CNIC-', valor: '', motivo: '' });
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function aprobar(codigo: string) {
    try {
      await provider.aprobarCNIC(codigo);
      toast('CNIC aprobado y publicado como vigente en BOP', 'success');
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function guardarDocumento() {
    if (!docForm.codigo.trim() || !docForm.titulo.trim() || !docForm.contenidoMd.trim() || !docForm.notasCambio.trim()) { toast('Completa código, título, contenido y motivo', 'error'); return; }
    try { await provider.guardarBopDocumento({ ...docForm, cnicRefs: docForm.cnicRefs.split(',').map((codigo) => ({ codigo: codigo.trim(), etiqueta: codigo.trim() })).filter((r) => r.codigo) }); toast('Documento guardado como proyecto', 'success'); setDocForm({ codigo: '', titulo: '', tipo: 'cni', categoria: 'capitulo', contenidoMd: '', notasCambio: '', cnicRefs: '' }); cargar(); } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function aprobarDocumento(id: string) {
    try { await provider.aprobarBopDocumento(id); toast('Documento BOP aprobado y publicado', 'success'); cargar(); } catch (e) { toast((e as Error).message, 'error'); }
  }

  function formato(prefijo: string, sufijo = prefijo) {
    const editor = editorRef.current;
    if (!editor) return;
    const inicio = editor.selectionStart;
    const fin = editor.selectionEnd;
    const seleccionado = docForm.contenidoMd.slice(inicio, fin) || 'texto';
    const contenido = docForm.contenidoMd.slice(0, inicio) + prefijo + seleccionado + sufijo + docForm.contenidoMd.slice(fin);
    setDocForm({ ...docForm, contenidoMd: contenido });
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(inicio + prefijo.length, inicio + prefijo.length + seleccionado.length); });
  }

  function editarDocumento(d: BopDocumento) {
    setDocForm({ codigo: d.codigo, titulo: d.titulo, tipo: d.tipo, categoria: d.categoria, contenidoMd: d.contenidoMd, notasCambio: '', cnicRefs: (d.cnicRefs || []).map((r) => r.codigo).join(', ') });
    setPreview(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const columns: Column<CNICRegla>[] = [
    { key: 'codigo', header: 'Código', render: (c) => <span className="u-mono">{c.codigo}</span>, width: '240px' },
    { key: 'etiqueta', header: 'Regla', render: (c) => <strong>{c.etiqueta}</strong> },
    { key: 'valor', header: 'Valor', render: (c) => <span className="u-mono">{c.valor}{c.unidad ?? ''}</span> },
    { key: 'version', header: 'Versión', render: (c) => `v${c.version}` },
    { key: 'fuente', header: 'Fuente / estado', render: (c) => <>{c.fuente === 'BOP'
      ? <a href={c.bopUrl} target="_blank" rel="noreferrer"><Badge tone="success">BOP ↗</Badge></a>
      : <Badge tone="warning">{c.estado}</Badge>}{c.estado !== 'vigente' && <Button size="sm" variant="outline" onClick={() => aprobar(c.codigo)}>Aprobar</Button>}</> },
  ];

  return (
    <>
      <PageHeader
        title="Boletín Oficial (BOP)"
        subtitle="La normativa vive en el BOP. El RSP consume la versión vigente de cada CNIC y propone nuevas versiones."
        breadcrumb="RSP / Normativa"
      />
      <Tabs active={panel} onChange={setPanel} tabs={[{ id: 'cni', label: 'CNI · Documentos normativos' }, { id: 'cnic', label: 'CNIC · Valores complementarios' }]} />
      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card>
          <CardHeader title="Conexión con el BOP" subtitle="bop.laplaceta.org" />
          <div className="u-stack">
            <div className="u-row">
              <Badge tone="success"><Icon name="circleCheck" size={14} /> Conectado</Badge>
              <span className="u-muted">Fuente de verdad de los CNIC</span>
            </div>
            <Button variant="outline" icon="refresh" onClick={refrescar} disabled={sincronizando}>
              {sincronizando ? 'Sincronizando…' : 'Refrescar desde BOP'}
            </Button>
          </div>
        </Card>
        {panel === 'cnic' && <Card>
          <CardHeader title="Nueva versión CNIC" subtitle="Se crea en borrador y se publica en el BOP al aprobarse" />
          <div className="rsp-form-grid">
            <Field label="Código CNIC">
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="CNIC-FISC-001" />
            </Field>
            <Field label="Nuevo valor">
              <input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="80" inputMode="numeric" />
            </Field>
            <Field label="Motivo del cambio">
              <input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ajuste de la bonificación" />
            </Field>
          </div>
          <Button icon="plus" onClick={nuevaVersion} style={{ marginTop: 'var(--sp-3)' }}>Crear versión</Button>
        </Card>}
        {panel === 'cni' && <Card>
          <CardHeader title="Editor de documentos BOP" subtitle="Crear una versión en proyecto para revisión y publicación" />
          <div className="rsp-form-grid">
            <Field label="Código"><input value={docForm.codigo} onChange={(e) => setDocForm({ ...docForm, codigo: e.target.value })} placeholder="CNI-IV" /></Field>
            <Field label="Título"><input value={docForm.titulo} onChange={(e) => setDocForm({ ...docForm, titulo: e.target.value })} /></Field>
            <Field label="Tipo"><select value={docForm.tipo} onChange={(e) => setDocForm({ ...docForm, tipo: e.target.value })}><option value="cni">CNI</option><option value="estatuto">Estatuto</option><option value="programa">Programa</option></select></Field>
            <Field label="Categoría"><select value={docForm.categoria} onChange={(e) => setDocForm({ ...docForm, categoria: e.target.value })}><option value="capitulo">Capítulo</option><option value="sistema">Sistema</option><option value="programa">Programa</option><option value="general">General</option></select></Field>
            <Field label="Motivo del cambio"><input value={docForm.notasCambio} onChange={(e) => setDocForm({ ...docForm, notasCambio: e.target.value })} /></Field>
            <Field label="Referencias CNIC (separadas por coma)"><input value={docForm.cnicRefs} onChange={(e) => setDocForm({ ...docForm, cnicRefs: e.target.value })} placeholder="CNIC-IVA, CNIC-LIMITE-..." /></Field>
          </div>
          <div className="u-row" style={{ marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {['# ', '## ', '**', '*', '- ', '1. '].map((f) => <Button key={f} size="sm" variant="outline" onClick={() => formato(f, f === '**' || f === '*' ? f : '')}>{f.trim() || 'Formato'}</Button>)}
            <Button size="sm" variant={preview ? 'primary' : 'outline'} onClick={() => setPreview(!preview)} icon="eye">{preview ? 'Editar fuente' : 'Vista previa'}</Button>
            <Button icon="check" onClick={guardarDocumento}>Guardar proyecto</Button>
          </div>
          <div className="rsp-grid rsp-grid-2" style={{ marginTop: 'var(--sp-3)' }}>
            {!preview && <textarea ref={editorRef} aria-label="Contenido del documento CNI" rows={14} value={docForm.contenidoMd} onChange={(e) => setDocForm({ ...docForm, contenidoMd: e.target.value })} placeholder="# Capítulo…\n\nEscribe aquí la normativa…" style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', resize: 'vertical' }} />}
            {preview && <article className="rsp-card" style={{ minHeight: '250px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{docForm.contenidoMd || 'La vista previa aparecerá aquí.'}</article>}
          </div>
        </Card>}
      </div>

      {panel === 'cnic' && (items === null ? (
        <Spinner label="Cargando CNIC…" />
      ) : (
        <Table columns={columns} rows={items} rowKey={(c) => c.codigo} />
      ))}
      {panel === 'cni' && <Card>
        <CardHeader title="Documentos BOP" subtitle="Versionado y estado de publicación" />
        {documentos === null ? <Spinner label="Cargando documentos…" /> : documentos.length === 0 ? <p className="u-muted">No hay documentos gestionados desde RSP.</p> : documentos.map((d) => <div key={d.id} className="u-row" style={{ justifyContent: 'space-between', padding: 'var(--sp-2) 0', flexWrap: 'wrap' }}><span><strong>{d.codigo}</strong> · {d.titulo} · v{d.version}</span><span><Badge tone={d.estado === 'vigente' ? 'success' : 'warning'}>{d.estado}</Badge><Button size="sm" variant="outline" onClick={() => editarDocumento(d)}>Editar</Button>{d.estado !== 'vigente' && <Button size="sm" variant="outline" onClick={() => aprobarDocumento(d.id)}>Aprobar</Button>}</span></div>)}
      </Card>}
    </>
  );
}

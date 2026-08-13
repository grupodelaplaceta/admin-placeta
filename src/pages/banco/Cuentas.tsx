import { useCallback, useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import type { CuentaBancaria } from '../../types';

const TIPO_TONE: Record<string, 'brand' | 'info' | 'success' | 'warning' | 'neutral'> = {
  Current: 'brand',
  Savings: 'success',
  Business: 'info',
  Investment: 'warning',
  Child: 'neutral',
};

const TIPOS_ABRIR = ['Current', 'Savings', 'Child', 'Business', 'Investment'];

type ModalState =
  | { kind: 'abrir' }
  | { kind: 'tipo'; cuenta: CuentaBancaria }
  | { kind: 'cerrar'; cuenta: CuentaBancaria }
  | { kind: 'repartir'; cuenta: CuentaBancaria }
  | null;

export default function Cuentas() {
  const [items, setItems] = useState<CuentaBancaria[] | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const { toast } = useToast();

  const [fNombre, setFNombre] = useState('');
  const [fDip, setFDip] = useState('');
  const [fTipo, setFTipo] = useState('Current');
  const [fSaldo, setFSaldo] = useState('0');
  const [fNuevoTipo, setFNuevoTipo] = useState('Current');
  const [fMotivo, setFMotivo] = useState<'baja' | 'herencia' | ''>('');

  const cargar = useCallback(() => provider.listarCuentas().then(setItems).catch(() => setItems([])), []);
  useEffect(() => { cargar(); }, [cargar]);

  const saldoTotal = items?.reduce((s, c) => s + c.saldo, 0) ?? 0;
  const bloqueadas = items?.filter((c) => c.estado === 'bloqueada').length ?? 0;
  const fundaciones = items?.filter((c) => c.esFundacion).length ?? 0;

  async function accion(c: CuentaBancaria, a: 'bloquear' | 'desbloquear', ok: string) {
    try {
      await provider.accionCuenta(c.id, a);
      toast(ok, 'success');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function abrirCuenta() {
    try {
      await provider.abrirCuenta({
        nombre: fNombre.trim(),
        dip: fDip.trim().toUpperCase(),
        tipo: fTipo,
        saldoInicial: Number(fSaldo) || 0,
      });
      toast('Cuenta abierta correctamente', 'success');
      setModal(null);
      setFNombre(''); setFDip(''); setFTipo('Current'); setFSaldo('0');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function cambiarTipo(c: CuentaBancaria) {
    try {
      await provider.cambiarTipoCuenta(c.id, fNuevoTipo);
      toast(`Cuenta ${c.id} ahora es ${fNuevoTipo}`, 'success');
      setModal(null);
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function repartir(c: CuentaBancaria) {
    try {
      await provider.repartirCuenta(c.id);
      toast(`Fondos de ${c.nombre} repartidos conforme al %`, 'success');
      setModal(null);
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function cerrar(c: CuentaBancaria, motivo?: string) {
    try {
      await provider.accionCuenta(c.id, 'cerrar', motivo ? { motivo } : {});
      toast(`Cuenta ${c.id} cerrada`, 'success');
      setModal(null);
      setFMotivo('');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const columns: Column<CuentaBancaria>[] = [
    { key: 'id', header: 'Cuenta', render: (c) => <span className="u-mono">{c.id}</span>, width: '180px' },
    { key: 'nombre', header: 'Titular', render: (c) => <strong>{c.nombre}</strong> },
    { key: 'tipo', header: 'Tipo', render: (c) => <Badge tone={TIPO_TONE[c.tipo] ?? 'neutral'}>{c.tipo}{c.esFundacion ? ' · Fundación' : ''}</Badge> },
    { key: 'dip', header: 'DIP', render: (c) => <span className="u-mono">{c.dip || '—'}</span> },
    { key: 'saldo', header: 'Saldo', render: (c) => `${c.saldo.toLocaleString('es-ES', { maximumFractionDigits: 2 })} Pz` },
    {
      key: 'estado', header: 'Estado', render: (c) =>
        <Badge tone={c.estado === 'activa' ? 'success' : c.estado === 'bloqueada' ? 'warning' : 'neutral'}>{c.estado}</Badge>,
    },
    {
      key: 'acciones', header: 'Acciones', render: (c) => (
        <div className="u-row u-wrap">
          {c.estado === 'activa'
            ? <Button size="sm" variant="outline" icon="lock" onClick={() => accion(c, 'bloquear', `Cuenta ${c.id} bloqueada`)}>Bloquear</Button>
            : c.estado === 'bloqueada'
              ? <Button size="sm" variant="outline" icon="unlock" onClick={() => accion(c, 'desbloquear', `Cuenta ${c.id} desbloqueada`)}>Desbloquear</Button>
              : null}
          {c.estado !== 'cerrada' && !c.esFundacion && (
            <Button size="sm" variant="outline" icon="refresh" onClick={() => { setFNuevoTipo(c.tipo); setModal({ kind: 'tipo', cuenta: c }); }}>Tipo</Button>
          )}
          {c.tipo === 'Business' && c.saldo > 0 && !c.esFundacion && (
            <Button size="sm" variant="outline" icon="send" onClick={() => setModal({ kind: 'repartir', cuenta: c })}>Repartir</Button>
          )}
          {c.estado !== 'cerrada' && (
            <Button size="sm" variant="danger" icon="x" onClick={() => { setFMotivo(''); setModal({ kind: 'cerrar', cuenta: c }); }}>Cerrar</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Cuentas bancarias"
        subtitle="Gestión del sistema bancario: abrir, cambiar de tipo, repartir y cerrar cuentas conforme a la normativa."
        breadcrumb="RSP / Banco"
        actions={<Button icon="plus" onClick={() => setModal({ kind: 'abrir' })}>Abrir cuenta</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Cuentas" value={items?.length ?? '—'} icon="wallet" tone="brand" />
        <KPI label="Saldo total" value={`${saldoTotal.toLocaleString('es-ES')} Pz`} icon="banknote" tone="success" />
        <KPI label="Bloqueadas" value={bloqueadas} icon="lock" tone="warning" />
        <KPI label="Fundaciones" value={fundaciones} icon="landmark" tone="info" />
      </div>
      {items === null ? (
        <Spinner label="Cargando cuentas…" />
      ) : items.length === 0 ? (
        <Empty icon="wallet" title="Sin cuentas" />
      ) : (
        <Table columns={columns} rows={items} rowKey={(c) => c.id} />
      )}

      {/* ── Abrir cuenta ───────────────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'abrir'}
        title="Abrir cuenta bancaria"
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button icon="plus" onClick={abrirCuenta} disabled={!fNombre.trim() || !fDip.trim()}>Abrir</Button>
          </>
        }
      >
        <div className="rsp-form-grid">
          <Field label="Titular"><input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder="Nombre completo" /></Field>
          <Field label="PlacetaID (DIP)"><input value={fDip} onChange={(e) => setFDip(e.target.value)} placeholder="Ej. 23749931M" /></Field>
          <Field label="Tipo de cuenta">
            <select className="rsp-select" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              {TIPOS_ABRIR.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Saldo inicial (Pz)"><input type="number" value={fSaldo} onChange={(e) => setFSaldo(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* ── Cambiar tipo ───────────────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'tipo'}
        title={modal?.kind === 'tipo' ? `Cambiar tipo · ${modal.cuenta.id}` : ''}
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button icon="refresh" onClick={() => modal?.kind === 'tipo' && cambiarTipo(modal.cuenta)}>Cambiar</Button>
          </>
        }
      >
        {modal?.kind === 'tipo' && (
          <>
            <p className="u-muted">Titular: <strong>{modal.cuenta.nombre}</strong> · tipo actual <Badge tone={TIPO_TONE[modal.cuenta.tipo] ?? 'neutral'}>{modal.cuenta.tipo}</Badge></p>
            <Field label="Nuevo tipo">
              <select className="rsp-select" value={fNuevoTipo} onChange={(e) => setFNuevoTipo(e.target.value)}>
                {TIPOS_ABRIR.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </>
        )}
      </Modal>

      {/* ── Repartir (empresa) ─────────────────────────────────────── */}
      <Modal
        open={modal?.kind === 'repartir'}
        title={modal?.kind === 'repartir' ? `Repartir fondos · ${modal.cuenta.nombre}` : ''}
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button icon="send" onClick={() => modal?.kind === 'repartir' && repartir(modal.cuenta)}>Repartir conforme al %</Button>
          </>
        }
      >
        {modal?.kind === 'repartir' && (
          <>
            <p className="u-muted">Saldo a repartir: <strong>{modal.cuenta.saldo.toLocaleString('es-ES', { maximumFractionDigits: 2 })} Pz</strong></p>
            <ul className="rsp-doclist">
              {(modal.cuenta.participaciones ?? []).map((p) => (
                <li key={p.dip} className="rsp-doc">
                  <Badge tone="brand">{p.pct}%</Badge>
                  <span>{p.nombre} · {p.dip} → {(modal.cuenta.saldo * p.pct / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} Pz</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>

      {/* ── Cerrar (reglas normativas) ─────────────────────────────── */}
      <Modal
        open={modal?.kind === 'cerrar'}
        title={modal?.kind === 'cerrar' ? `Cerrar cuenta · ${modal.cuenta.id}` : ''}
        onClose={() => setModal(null)}
        footer={
          modal?.kind === 'cerrar' && !modal.cuenta.esFundacion && !(modal.cuenta.tipo === 'Business' && modal.cuenta.saldo > 0) && (
            <>
              <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="danger" icon="x" disabled={modal.cuenta.tipo !== 'Business' && modal.cuenta.saldo > 0 && !fMotivo}
                onClick={() => cerrar(modal.cuenta, modal.cuenta.tipo !== 'Business' ? fMotivo : undefined)}>
                Cerrar cuenta
              </Button>
            </>
          )
        }
      >
        {modal?.kind === 'cerrar' && (() => {
          const c = modal.cuenta;
          if (c.esFundacion) {
            return <div className="rsp-alert rsp-alert-danger">Las fundaciones no se pueden cerrar ni repartir (patrimonio afecto a un fin social).</div>;
          }
          if (c.tipo === 'Business' && c.saldo > 0) {
            return (
              <>
                <div className="rsp-alert rsp-alert-danger">Para cerrar una empresa con fondos, primero hay que repartir el capital conforme al % de participaciones.</div>
                <ul className="rsp-doclist">
                  {(c.participaciones ?? []).map((p) => (
                    <li key={p.dip} className="rsp-doc"><Badge tone="brand">{p.pct}%</Badge><span>{p.nombre}</span></li>
                  ))}
                </ul>
                <div className="u-row" style={{ marginTop: 12 }}>
                  <Button icon="send" onClick={() => setModal({ kind: 'repartir', cuenta: c })}>Ir a repartir</Button>
                </div>
              </>
            );
          }
          if (c.tipo !== 'Business' && c.saldo > 0) {
            return (
              <>
                <div className="rsp-alert rsp-alert-danger">Las cuentas personales con capital solo se cierran por <strong>baja de usuario</strong> o <strong>herencia</strong>.</div>
                <Field label="Motivo del cierre">
                  <select className="rsp-select" value={fMotivo} onChange={(e) => setFMotivo(e.target.value as 'baja' | 'herencia')}>
                    <option value="">— Selecciona el motivo —</option>
                    <option value="baja">Baja de usuario</option>
                    <option value="herencia">Herencia / sucesión</option>
                  </select>
                </Field>
              </>
            );
          }
          return <p className="u-muted">La cuenta no tiene capital. Confirma el cierre de <strong>{c.id}</strong>.</p>;
        })()}
      </Modal>
    </>
  );
}

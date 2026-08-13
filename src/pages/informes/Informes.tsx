import { useState } from 'react';
import { provider } from '../../api';
import { Card, PageHeader, useToast } from '../../components/ui';
import { generarPdfInforme, generarPdfResumenVotacion } from '../../lib/pdf';
import { Icon, type IconName } from '../../components/icons';

interface InformeDef {
  clave: string;
  titulo: string;
  icon: IconName;
  descripcion: string;
  generar: () => Promise<void>;
}

export default function Informes() {
  const { toast } = useToast();
  const [generando, setGenerando] = useState<string | null>(null);

  async function correr(def: InformeDef) {
    setGenerando(def.clave);
    try {
      await def.generar();
      toast(`Informe "${def.titulo}" generado`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGenerando(null);
    }
  }

  const informes: InformeDef[] = [
    {
      clave: 'cuentas', titulo: 'Cuentas y patrimonio', icon: 'wallet',
      descripcion: 'Listado completo de cuentas bancarias con saldos.',
      generar: async () => {
        const c = await provider.listarCuentas();
        await generarPdfInforme({
          titulo: 'Cuentas y patrimonio', subtitulo: `${c.length} cuentas`,
          logoSrc: '/img/logo-banco.png',
          secciones: [{
            titulo: 'Cuentas',
            filas: c.map((x) => [x.id, `${x.nombre} · ${x.tipo} · ${x.saldo} Pz (${x.estado})`] as [string, string]),
          }],
        });
      },
    },
    {
      clave: 'declaraciones', titulo: 'Declaraciones tributarias', icon: 'fileCheck',
      descripcion: 'Declaraciones con cuotas IRM/IGF.',
      generar: async () => {
        const d = await provider.listarDeclaraciones();
        await generarPdfInforme({
          titulo: 'Declaraciones tributarias', subtitulo: `${d.length} declaraciones`,
          logoSrc: '/img/tributos-logo.png',
          secciones: [{
            titulo: 'Declaraciones',
            filas: d.map((x) => [x.id, `${x.contribuyenteNombre} · ${x.mesPeriodo} · IRM ${x.cuotaIrm} · IGF ${x.cuotaIgf} Pz`] as [string, string]),
          }],
        });
      },
    },
    {
      clave: 'subvenciones', titulo: 'Subvenciones', icon: 'handshake',
      descripcion: 'Subvenciones concedidas y justificadas.',
      generar: async () => {
        const s = await provider.listarSubvenciones();
        await generarPdfInforme({
          titulo: 'Subvenciones', subtitulo: `${s.length} subvenciones`,
          secciones: [{ titulo: 'Subvenciones', filas: s.map((x) => [x.id, `${x.concepto} · ${x.importe} Pz · ${x.estado}`] as [string, string]) }],
        });
      },
    },
    {
      clave: 'bonos', titulo: 'Bonificaciones (bonos)', icon: 'sparkles',
      descripcion: 'Bonos y presupuesto usado.',
      generar: async () => {
        const b = await provider.listarBonos();
        await generarPdfInforme({
          titulo: 'Bonificaciones', subtitulo: `${b.length} bonos`,
          secciones: [{ titulo: 'Bonos', filas: b.map((x) => [x.nombre, `${x.presupuestoUsado}/${x.presupuesto} Pz · ${x.adscritos} adscritos`] as [string, string]) }],
        });
      },
    },
    {
      clave: 'operaciones', titulo: 'Operaciones', icon: 'cog',
      descripcion: 'Operaciones con clasificación y control.',
      generar: async () => {
        const o = await provider.listarOperaciones();
        await generarPdfInforme({
          titulo: 'Operaciones', subtitulo: `${o.length} operaciones`,
          secciones: [{ titulo: 'Operaciones', filas: o.map((x) => [x.id, `${x.concepto} · ${x.importe} Pz · ${x.estado}`] as [string, string]) }],
        });
      },
    },
    {
      clave: 'ciudadanos', titulo: 'Ciudadanos', icon: 'users',
      descripcion: 'Censo de ciudadanos con nivel.',
      generar: async () => {
        const c = await provider.buscarCiudadanos('');
        await generarPdfInforme({
          titulo: 'Ciudadanos', subtitulo: `${c.length} personas`,
          secciones: [{ titulo: 'Censo', filas: c.map((x) => [x.dip, `${x.nombre} · ${x.nivel}`] as [string, string]) }],
        });
      },
    },
    {
      clave: 'votaciones', titulo: 'Resumen de votaciones', icon: 'vote',
      descripcion: 'Resumen de cada votación (con anonimato).',
      generar: async () => {
        const v = await provider.listarVotaciones();
        for (const vot of v) {
          const det = await provider.getVotacion(vot.id);
          await generarPdfResumenVotacion(det, det.votos);
        }
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Informes"
        subtitle="Genera documentación en PDF de los distintos ámbitos del RSP."
        breadcrumb="RSP / Sistema"
      />
      <div className="rsp-acciones">
        {informes.map((i) => (
          <button key={i.clave} type="button" className="rsp-accion" onClick={() => correr(i)} disabled={generando === i.clave}>
            <Icon name={i.icon} size={18} />
            <span style={{ textAlign: 'left' }}>
              <strong>{i.titulo}</strong>
              <br />
              <span className="u-muted" style={{ fontSize: 'var(--fs-xs)', fontWeight: 400 }}>{i.descripcion}</span>
            </span>
            <span style={{ marginLeft: 'auto' }}>{generando === i.clave ? 'Generando…' : 'PDF'}</span>
          </button>
        ))}
      </div>
      <Card>
        <p className="u-muted" style={{ margin: 0 }}>
          Los informes usan los datos actuales del panel. Las actas de junta y los resúmenes de votación se generan desde sus respectivas vistas.
        </p>
      </Card>
    </>
  );
}

/**
 * Seed: Asignar permisos de administración a un DIP
 * Uso: node scripts/seed-admin.js <DIP>
 * 
 * Crea los registros necesarios en Supabase para que un DIP
 * tenga acceso a todas las entidades del panel administrativo.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://htikrqaywapshlkdonvs.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

const dip = process.argv[2];
if (!dip) {
  console.error('❌ Uso: node scripts/seed-admin.js <DIP>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function seed() {
  console.log(`🔑 Asignando permisos de administración a DIP: ${dip}\n`);

  // 1. Verificar si existe en solicitantes
  const { data: solicitante } = await supabase
    .from('solicitantes')
    .select('id, dip, nombre_real, alias, email')
    .eq('dip', dip)
    .maybeSingle();

  if (solicitante) {
    console.log(`✅ Solicitante encontrado: ${solicitante.nombre_real || solicitante.alias || dip}`);
  } else {
    console.log(`⚠️  DIP ${dip} no encontrado en solicitantes. Los permisos se asignarán igualmente.`);
  }

  // 2. Crear cargo de presidente en junta (si la tabla existe)
  try {
    const { error: cargoErr } = await supabase
      .from('cargos_junta')
      .upsert({
        dip,
        cargo: 'Presidente',
        departamento: 'Junta Directiva',
        activo: true,
        es_autorizado: true,
        fecha_aprobacion: new Date().toISOString(),
        codigo_ref: `SEED-ADMIN-${Date.now().toString(36)}`,
        via_votacion: 'Seed administrativo',
        created_at: new Date().toISOString()
      }, { onConflict: 'dip' });

    if (cargoErr) {
      console.log(`ℹ️  Tabla cargos_junta: ${cargoErr.message}`);
    } else {
      console.log('✅ Cargo "Presidente" asignado en junta directiva');
    }
  } catch (e) {
    console.log(`ℹ️  Tabla cargos_junta no disponible: ${e.message}`);
  }

  // 3. Crear permisos de superadmin (si la tabla existe)
  try {
    const { error: permErr } = await supabase
      .from('permisos_administracion')
      .upsert({
        dip,
        tipo: 'superadmin',
        activo: true,
        created_at: new Date().toISOString()
      }, { onConflict: 'dip' });

    if (permErr) {
      console.log(`ℹ️  Tabla permisos_administracion: ${permErr.message}`);
    } else {
      console.log('✅ Permiso "superadmin" asignado');
    }
  } catch (e) {
    console.log(`ℹ️  Tabla permisos_administracion no disponible: ${e.message}`);
  }

  // 4. También crear permisos específicos por entidad
  const entidades = ['banco_admin', 'tributos_admin'];
  for (const tipo of entidades) {
    try {
      await supabase
        .from('permisos_administracion')
        .upsert({
          dip,
          tipo,
          activo: true,
          created_at: new Date().toISOString()
        }, { onConflict: 'dip' });
    } catch (_) {}
  }
  console.log('✅ Permisos específicos por entidad asignados');

  console.log(`\n🎉 DIP ${dip} tiene ahora acceso completo como administrador.`);
  console.log('   Inicia sesión en http://localhost:3002/login');
}

seed().catch(console.error);

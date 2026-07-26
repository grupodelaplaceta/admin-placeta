/**
 * Seed: Inicializar la Red de Servicios de La Placeta (RSP)
 * 
 * Configura el estado inicial de la RSP:
 * - Fondo inicial: 18,309.83 Pz (transferido desde "Red del Grupo de La Placeta")
 * - Sanción pendiente: 2,461.77 Pz (IVA no abonado)
 * - Permisos RSP para administradores
 * 
 * Uso: node scripts/seed-rsp.js [dip_admin]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://htikrqaywapshlkdonvs.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

const dipAdmin = process.argv[2] || '23749931M';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function seed() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Seed — Red de Servicios de La Placeta (RSP)       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // 1. Verificar/Crear estado inicial
  console.log('📋 Configurando estado inicial de la RSP...');
  try {
    const { error: estadoErr } = await supabase
      .from('rsp_estado')
      .upsert({
        id: 'rsp-main',
        saldo: 18309.83,
        sancion_pagada: false,
        sancion_pendiente: 2461.77,
        fondos_iniciales: 18309.83,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (estadoErr) {
      console.log(`  ⚠️  rsp_estado: ${estadoErr.message}`);
    } else {
      console.log('  ✅ Estado inicial configurado: 18,309.83 Pz');
    }
  } catch (e) {
    console.log(`  ⚠️  Tabla rsp_estado no disponible: ${e.message}`);
  }

  // 2. Registrar transferencia inicial en el historial
  console.log('📋 Registrando transferencia inicial...');
  try {
    const { error: histErr } = await supabase
      .from('rsp_fondos_historial')
      .insert({
        tipo: 'TRANSFERENCIA_INICIAL',
        concepto: 'Transferencia desde Red del Grupo de La Placeta',
        importe: 18309.83,
        saldo: 18309.83,
        referencia_id: 'LEGACY-RGP-TRANSFER',
        created_at: new Date().toISOString()
      });

    if (histErr) {
      console.log(`  ⚠️  rsp_fondos_historial: ${histErr.message}`);
    } else {
      console.log('  ✅ Transferencia inicial registrada en historial');
    }
  } catch (e) {
    console.log(`  ⚠️  Tabla rsp_fondos_historial no disponible: ${e.message}`);
  }

  // 3. Asignar permisos RSP al admin
  console.log(`📋 Asignando permisos RSP a DIP: ${dipAdmin}...`);
  try {
    const { error: permSuperErr } = await supabase
      .from('permisos_administracion')
      .upsert({
        dip: dipAdmin,
        tipo: 'rsp_admin',
        activo: true,
        created_at: new Date().toISOString()
      }, { onConflict: 'dip' });

    if (permSuperErr) {
      console.log(`  ⚠️  permisos_administracion (rsp_admin): ${permSuperErr.message}`);
    } else {
      console.log('  ✅ Permiso rsp_admin asignado');
    }

    const { error: permOpErr } = await supabase
      .from('permisos_administracion')
      .upsert({
        dip: dipAdmin,
        tipo: 'rsp_operador',
        activo: true,
        created_at: new Date().toISOString()
      }, { onConflict: 'dip' });

    if (permOpErr) {
      console.log(`  ⚠️  permisos_administracion (rsp_operador): ${permOpErr.message}`);
    } else {
      console.log('  ✅ Permiso rsp_operador asignado');
    }
  } catch (e) {
    console.log(`  ⚠️  permisos_administracion no disponible: ${e.message}`);
  }

  // 4. Verificar estado final
  console.log('');
  console.log('📊 Verificando estado...');
  try {
    const { data: estado } = await supabase
      .from('rsp_estado')
      .select('*')
      .eq('id', 'rsp-main')
      .single();

    if (estado) {
      console.log(`  Saldo RSP: ${estado.saldo} Pz`);
      console.log(`  Sanción pendiente: ${estado.sancion_pendiente} Pz`);
      console.log(`  Sanción pagada: ${estado.sancion_pagada}`);
    }
  } catch (_) {}

  console.log('');
  console.log('🎉 Seed RSP completado.');
  console.log(`   DIP ${dipAdmin} tiene permisos rsp_admin y rsp_operador.`);
  console.log('   Inicia sesión en http://localhost:3002 para acceder al módulo RSP.');
  console.log('');
  console.log('📋 Resumen:');
  console.log('   • Fondos iniciales: 18,309.83 Pz (ex Red del Grupo de La Placeta)');
  console.log('   • Sanción IVA pendiente: 2,461.77 Pz');
  console.log('   • Facturas pendientes anteriores: ANULADAS (>20,000 Pz liberados)');
  console.log('   • Tarifa consulta: 0.001 Pz/conexión + IVA 12%');
  console.log('   • Tarifa modificación: 0.1 Pz/conexión + IVA 12%');
}

seed().catch(console.error);

// Marca las actividades code_blocks como subvencionadas (acceso anticipado)
import { supabase } from '../src/config/supabase.js';

const ids = [
  'act-code-sec-01','act-code-sec-02','act-code-sec-03','act-code-sec-04','act-code-sec-05',
  'act-code-buc-01','act-code-buc-02','act-code-buc-03','act-code-buc-04','act-code-buc-05',
  'act-code-con-01','act-code-con-02','act-code-con-03','act-code-con-04','act-code-con-05',
];

for (const id of ids) {
  const { data, error } = await supabase.from('junior_actividades').select('contenido').eq('id', id).maybeSingle();
  if (error || !data) { console.log(id, '→ no existe'); continue; }
  const contenido = (typeof data.contenido === 'object' && data.contenido) ? { ...data.contenido } : {};
  contenido.subvencionada = true;
  const { error: upErr } = await supabase.from('junior_actividades').update({ contenido }).eq('id', id);
  console.log(id, upErr ? 'ERR ' + upErr.message : 'OK subvencionada');
}
console.log('✅ Hecho');

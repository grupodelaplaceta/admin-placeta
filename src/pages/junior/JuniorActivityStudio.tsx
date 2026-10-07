import { useMemo, useState } from 'react';
import {
  createActivityBlock,
  JUNIOR_ACTIVITY_TYPES,
  parseActivityContent,
  serializeActivityContent,
  validateActivityContent,
  type JuniorActivityBlock,
  type JuniorActivityContent,
  type JuniorActivityType,
} from './activityStudioModel';
import './junior-activity-studio.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];

function lines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function idFor(value: string, index: number) {
  const slug = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'elemento';
  return `${slug}-${index + 1}`;
}

function drawingGuide(shape: string): Array<{ x: number; y: number }> {
  if (shape === 'cuadrado') return [{ x: 0.22, y: 0.2 }, { x: 0.78, y: 0.2 }, { x: 0.78, y: 0.8 }, { x: 0.22, y: 0.8 }, { x: 0.22, y: 0.2 }];
  if (shape === 'ola') return [{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.28 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.72 }, { x: 0.9, y: 0.5 }];
  if (shape === 'circulo') return Array.from({ length: 13 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: 0.5 + Math.cos(angle) * 0.32, y: 0.5 + Math.sin(angle) * 0.32 };
  });
  if (shape === 'linea') return [{ x: 0.15, y: 0.78 }, { x: 0.85, y: 0.22 }];
  return [{ x: 0.15, y: 0.8 }, { x: 0.5, y: 0.2 }, { x: 0.85, y: 0.8 }];
}

function jsonFieldValue(content: JuniorActivityContent) {
  return serializeActivityContent(content);
}

export default function JuniorActivityStudio({ value, onChange }: Props) {
  const parsed = useMemo(() => {
    try {
      return { content: parseActivityContent(value), error: '' };
    } catch (error) {
      return { content: null, error: error instanceof Error ? error.message : 'El contenido JSON no es válido.' };
    }
  }, [value]);
  const content = parsed.content;
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'editar' | 'probar' | 'json'>('editar');
  const [jsonError, setJsonError] = useState('');
  const [previewRound, setPreviewRound] = useState(0);
  const [previewState, setPreviewState] = useState({ selected: '', completed: false, matched: {} as Record<string, string>, drawn: [] as Array<{ x: number; y: number }> });

  const blocks = content?.bloques ?? [];
  const active = blocks[activeIndex];
  const meta = active ? JUNIOR_ACTIVITY_TYPES.find((type) => type.id === active.tipo) : undefined;
  const errors = content ? validateActivityContent(content) : [parsed.error];

  function updateContent(next: JuniorActivityContent) {
    onChange(jsonFieldValue(next));
    setJsonError('');
  }

  function updateBlock(patch: Partial<JuniorActivityBlock>) {
    if (!content || !active) return;
    updateContent({ ...content, bloques: content.bloques.map((block, index) => index === activeIndex ? { ...block, ...patch } : block) });
  }

  function addBlock(type: JuniorActivityType) {
    if (!content) return;
    const next = [...content.bloques, createActivityBlock(type, content.bloques.length)];
    updateContent({ ...content, bloques: next });
    setActiveIndex(next.length - 1);
    setMode('editar');
  }

  function removeBlock(index: number) {
    if (!content) return;
    const next = content.bloques.filter((_, itemIndex) => itemIndex !== index);
    updateContent({ ...content, bloques: next });
    setActiveIndex(Math.max(0, Math.min(index, next.length - 1)));
  }

  function moveBlock(index: number, delta: number) {
    if (!content) return;
    const destination = index + delta;
    if (destination < 0 || destination >= content.bloques.length) return;
    const next = [...content.bloques];
    [next[index], next[destination]] = [next[destination], next[index]];
    updateContent({ ...content, bloques: next });
    setActiveIndex(destination);
  }

  function updateData(patch: Record<string, unknown>) {
    if (!active) return;
    updateBlock({ datos: { ...object(active.datos), ...patch } });
  }

  function updateJson(nextValue: string) {
    onChange(nextValue);
    try {
      parseActivityContent(nextValue);
      setJsonError('');
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'El JSON no es válido.');
    }
  }

  function resetPreview() {
    setPreviewState({ selected: '', completed: false, matched: {}, drawn: [] });
    setPreviewRound((round) => round + 1);
  }

  return (
    <section className="junior-studio" aria-label="Studio de actividades">
      <header className="junior-studio__heading">
        <div>
          <span className="junior-studio__eyebrow">PLACETA JUNIOR · STUDIO</span>
          <h3>Crea una actividad paso a paso</h3>
          <p>Elige un reto, escribe el contenido y prueba cómo lo verá el alumno. No necesitas saber programar.</p>
        </div>
        <div className="junior-studio__modes" role="tablist" aria-label="Modo del Studio">
          <button type="button" className={mode === 'editar' ? 'is-active' : ''} onClick={() => setMode('editar')}>✏️ Editar</button>
          <button type="button" className={mode === 'probar' ? 'is-active' : ''} onClick={() => { setMode('probar'); resetPreview(); }}>▶ Probar</button>
          <button type="button" className={mode === 'json' ? 'is-active' : ''} onClick={() => setMode('json')}>{'{}'} Avanzado</button>
        </div>
      </header>

      {mode === 'json' ? (
        <div className="junior-studio__json">
          <label htmlFor="junior-studio-json">Contenido técnico (JSON)</label>
          <textarea id="junior-studio-json" rows={16} value={value} onChange={(event) => updateJson(event.target.value)} spellCheck={false} />
          {(jsonError || parsed.error) && <p className="junior-studio__error" role="alert">{jsonError || parsed.error}</p>}
          <p>El JSON avanzado permite conservar actividades antiguas o pegar contenido creado en Studio/DevAI.</p>
        </div>
      ) : (
        <div className="junior-studio__workbench">
          {mode === 'editar' && (
            <aside className="junior-studio__sidebar">
              <div className="junior-studio__sidebar-title">
                <strong>Retos de la actividad</strong>
                <span>{blocks.length}</span>
              </div>
              {blocks.map((block, index) => {
                const type = JUNIOR_ACTIVITY_TYPES.find((item) => item.id === block.tipo);
                return (
                  <div key={`${block.tipo}-${index}`} className={`junior-studio__block-row ${index === activeIndex ? 'is-active' : ''}`}>
                    <button type="button" className="junior-studio__block-select" onClick={() => setActiveIndex(index)}>
                      <span>{type?.icon || '🧩'}</span>
                      <span><b>{block.titulo || `Reto ${index + 1}`}</b><small>{type?.label || block.tipo}</small></span>
                    </button>
                    <div className="junior-studio__block-actions">
                      <button type="button" aria-label={`Mover reto ${index + 1} arriba`} disabled={index === 0} onClick={() => moveBlock(index, -1)}>↑</button>
                      <button type="button" aria-label={`Mover reto ${index + 1} abajo`} disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)}>↓</button>
                      <button type="button" aria-label={`Eliminar reto ${index + 1}`} onClick={() => removeBlock(index)}>×</button>
                    </div>
                  </div>
                );
              })}
              <div className="junior-studio__add">
                <strong>Añadir un reto</strong>
                <div className="junior-studio__type-grid">
                  {JUNIOR_ACTIVITY_TYPES.map((type) => (
                    <button type="button" key={type.id} title={type.hint} onClick={() => addBlock(type.id)}>
                      <span>{type.icon}</span>{type.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          )}

          <div className="junior-studio__main">
            {mode === 'editar' ? (
              active ? (
                <BlockEditor
                  block={active}
                  typeLabel={meta?.label || active.tipo}
                  onChange={updateBlock}
                  onDataChange={updateData}
                />
              ) : (
                <div className="junior-studio__empty">
                  <span>🎨</span><h4>Empieza con tu primer reto</h4>
                  <p>Elige un tipo en la columna izquierda. Puedes combinar varios retos en una misma actividad.</p>
                  <button type="button" onClick={() => addBlock('test')}>Crear una pregunta</button>
                </div>
              )
            ) : active ? (
              <ActivityPreview
                key={`${active.tipo}-${activeIndex}-${previewRound}`}
                block={active}
                completed={previewState.completed}
                state={previewState}
                setState={setPreviewState}
              />
            ) : (
              <div className="junior-studio__empty"><span>🕹️</span><h4>Aún no hay retos para probar</h4><p>Añade primero una pregunta o un juego.</p></div>
            )}
          </div>
        </div>
      )}

      <footer className="junior-studio__footer">
        <span className={errors.length ? 'has-errors' : 'is-ready'}>
          {errors.length ? `⚠ ${errors.length} ${errors.length === 1 ? 'detalle por revisar' : 'detalles por revisar'}` : '✓ Actividad lista para guardar'}
        </span>
        {errors.length > 0 && <details><summary>Ver qué falta</summary><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></details>}
      </footer>
    </section>
  );
}

type EditorProps = {
  block: JuniorActivityBlock;
  typeLabel: string;
  onChange: (patch: Partial<JuniorActivityBlock>) => void;
  onDataChange: (patch: Record<string, unknown>) => void;
};

function BlockEditor({ block, typeLabel, onChange, onDataChange }: EditorProps) {
  const data = object(block.datos);
  const questions = array(block.preguntas);
  const question = questions[0] || { pregunta: '', opciones: [] };
  const options = Array.isArray(question.opciones) ? question.opciones as string[] : [];

  function replaceQuestion(patch: Record<string, unknown>) {
    onChange({ preguntas: [{ ...question, ...patch }] });
  }

  return (
    <div className="junior-studio__editor">
      <div className="junior-studio__editor-title"><span>{JUNIOR_ACTIVITY_TYPES.find((item) => item.id === block.tipo)?.icon || '🧩'}</span><div><small>EDITANDO · {typeLabel.toUpperCase()}</small><h4>Prepara este reto</h4></div></div>
      <label className="junior-studio__field"><span>Nombre del reto</span><input value={block.titulo} onChange={(event) => onChange({ titulo: event.target.value })} placeholder="Ej. Los animales de la granja" /></label>
      <label className="junior-studio__field"><span>Instrucciones para el alumno</span><textarea rows={2} value={block.instrucciones} onChange={(event) => onChange({ instrucciones: event.target.value })} placeholder="Explica qué tiene que hacer" /></label>

      {block.tipo === 'test' && <>
        <label className="junior-studio__field"><span>Pregunta</span><textarea rows={2} value={text(question.pregunta)} onChange={(event) => replaceQuestion({ pregunta: event.target.value })} /></label>
        <div className="junior-studio__field">
          <span>Respuestas <small>(marca el círculo de la correcta)</small></span>
          <div className="junior-studio__option-list">
            {options.map((option, index) => <div className="junior-studio__option" key={index}>
              <input aria-label={`Marcar respuesta ${index + 1} como correcta`} type="radio" name={`correct-${block.titulo}`} checked={question.correcta === index} onChange={() => replaceQuestion({ correcta: index })} />
              <input aria-label={`Texto de respuesta ${index + 1}`} value={text(option)} onChange={(event) => replaceQuestion({ opciones: options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />
              <button type="button" aria-label={`Eliminar respuesta ${index + 1}`} onClick={() => {
                const next = options.filter((_, itemIndex) => itemIndex !== index);
                const correct = Number(question.correcta);
                replaceQuestion({ opciones: next, correcta: correct === index ? -1 : correct > index ? correct - 1 : correct });
              }}>×</button>
            </div>)}
          </div>
          <button type="button" className="junior-studio__text-button" onClick={() => replaceQuestion({ opciones: [...options, `Opción ${options.length + 1}`] })}>+ Añadir respuesta</button>
        </div>
      </>}

      {block.tipo === 'clic' && <>
        <label className="junior-studio__field"><span>Objetos que aparecerán <small>(uno por línea; marca los que hay que encontrar con *)</small></span>
          <textarea rows={6} value={array(data.objetos).map((item) => `${item.correcto ? '*' : ''}${text(item.emoji)} ${text(item.texto)}`.trim()).join('\n')} onChange={(event) => {
            const items = lines(event.target.value).map((line, index) => {
              const correcto = line.startsWith('*');
              const label = line.replace(/^\*/, '').trim();
              const [emoji, ...words] = label.split(/\s+/);
              return { id: idFor(words.join(' ') || emoji, index), texto: words.join(' ') || emoji, emoji: words.length ? emoji : '', correcto };
            });
            onDataChange({ objetos: items, objetivo: items.filter((item) => item.correcto).length });
          }} />
        </label><p className="junior-studio__tip">Escribe <b>*</b> delante de cada objeto que el alumno debe encontrar. El número se calcula automáticamente.</p>
      </>}

      {block.tipo === 'arrastrar' && <>
        <label className="junior-studio__field"><span>Elementos y su categoría <small>(uno por línea: elemento | categoría)</small></span>
          <textarea rows={7} value={array(data.elementos).map((item) => `${text(item.emoji)} ${text(item.texto)} | ${text(object(data.respuestas)[String(item.id)])}`).join('\n')} onChange={(event) => {
            const parsed = lines(event.target.value).map((line, index) => {
              const [label = '', category = ''] = line.split('|').map((part) => part.trim());
              const [emoji, ...words] = label.split(/\s+/);
              return { item: { id: idFor(words.join(' ') || emoji, index), texto: words.join(' ') || emoji, emoji: words.length ? emoji : '' }, category };
            });
            const zones = [...new Set(parsed.map((entry) => entry.category).filter(Boolean))].map((name) => ({ id: idFor(name, 0), nombre: name }));
            onDataChange({ elementos: parsed.map((entry) => entry.item), zonas: zones, respuestas: Object.fromEntries(parsed.map((entry) => [entry.item.id, idFor(entry.category, 0)])) });
          }} />
        </label><p className="junior-studio__tip">Cada línea se convertirá en una tarjeta arrastrable. Usa al menos dos categorías.</p>
      </>}

      {block.tipo === 'lineas' && <label className="junior-studio__field"><span>Parejas que hay que unir <small>(una por línea: elemento de la izquierda | pareja)</small></span>
        <textarea rows={7} value={array(data.pares).map((pair) => `${text(pair.izq)} | ${text(pair.der)}`).join('\n')} onChange={(event) => onDataChange({ pares: lines(event.target.value).map((line, index) => { const [izq = '', der = ''] = line.split('|').map((part) => part.trim()); return { id: `pareja-${index + 1}`, izq, der }; }) })} />
      </label>}

      {block.tipo === 'construir_frase' && <>
        <label className="junior-studio__field"><span>Frase correcta</span><input value={text(data.respuesta)} onChange={(event) => onDataChange({ respuesta: event.target.value, palabras: event.target.value.trim().split(/\s+/).filter(Boolean) })} placeholder="El sol brilla" /></label>
        <p className="junior-studio__tip">El juego mezclará las palabras de la frase para que el alumno las ordene.</p>
      </>}

      {block.tipo === 'memoria' && <>
        <label className="junior-studio__field"><span>Tarjetas para formar parejas <small>(escribe una tarjeta por línea; cada una aparecerá dos veces)</small></span>
          <textarea rows={5} value={(Array.isArray(data.tarjetas) ? data.tarjetas as string[] : []).filter((_, index) => index % 2 === 0).join('\n')} onChange={(event) => onDataChange({ tarjetas: lines(event.target.value).flatMap((card) => [card, card]) })} placeholder={'🐱\n🐶'} />
        </label><p className="junior-studio__tip">Puedes usar dibujos emoji o palabras.</p>
      </>}

      {block.tipo === 'dibujo' && <>
        <label className="junior-studio__field"><span>¿Qué tiene que dibujar?</span><input value={text(data.objetivo)} onChange={(event) => onDataChange({ objetivo: event.target.value })} placeholder="Una montaña" /></label>
        <label className="junior-studio__field"><span>Forma para seguir</span>
          <select value={text(data.forma, 'montana')} onChange={(event) => onDataChange({ forma: event.target.value, puntos: drawingGuide(event.target.value) })}>
            <option value="montana">Montaña</option><option value="cuadrado">Cuadrado</option><option value="ola">Ola</option><option value="circulo">Círculo</option><option value="linea">Línea recta</option>
          </select>
        </label><p className="junior-studio__tip">El alumno dibuja siguiendo una guía visual. Puedes elegir una forma sin introducir coordenadas.</p>
      </>}

      {block.tipo === 'fisica_objetos' && <>
        <div className="junior-studio__field-row">
          <label className="junior-studio__field"><span>Objeto</span><input value={text(data.objeto)} onChange={(event) => onDataChange({ objeto: event.target.value })} /></label>
          <label className="junior-studio__field"><span>Meta</span><input value={text(data.objetivo)} onChange={(event) => onDataChange({ objetivo: event.target.value })} /></label>
        </div>
        <div className="junior-studio__field-row">
          <label className="junior-studio__field"><span>Distancia (10–90)</span><input type="number" min="10" max="90" value={Number(data.distancia) || 65} onChange={(event) => onDataChange({ distancia: Number(event.target.value) })} /></label>
          <label className="junior-studio__field"><span>Potencia inicial (10–100)</span><input type="number" min="10" max="100" value={Number(data.potencia) || 65} onChange={(event) => onDataChange({ potencia: Number(event.target.value) })} /></label>
        </div>
        <label className="junior-studio__field"><span>Intentos</span><input type="number" min="1" max="10" value={Number(data.intentos) || 3} onChange={(event) => onDataChange({ intentos: Number(event.target.value) })} /></label>
        <p className="junior-studio__tip">El alumno probará combinaciones de fuerza y ángulo para llegar a la meta.</p>
      </>}

      {!JUNIOR_ACTIVITY_TYPES.some((type) => type.id === block.tipo) && <div className="junior-studio__legacy"><strong>Actividad compatible existente</strong><p>Este formato antiguo se conserva tal cual. Puedes revisarlo en el modo avanzado sin perder datos.</p></div>}
    </div>
  );
}

type PreviewState = {
  selected: string;
  completed: boolean;
  matched: Record<string, string>;
  drawn: Array<{ x: number; y: number }>;
};

function ActivityPreview({ block, completed, state, setState }: { block: JuniorActivityBlock; completed: boolean; state: PreviewState; setState: (state: PreviewState) => void }) {
  const data = object(block.datos);
  const questions = array(block.preguntas);
  const question = questions[0] || {};
  const options = Array.isArray(question.opciones) ? question.opciones as string[] : [];
  const clickItems = array(data.objetos);
  const pairs = array(data.pares);
  const dragItems = array(data.elementos);
  const zones = array(data.zonas);
  const responseMap = object(data.respuestas);
  const drawPoints = Array.isArray(data.puntos) ? data.puntos as Array<{ x: number; y: number }> : [];
  const [power, setPower] = useState(Number(data.potencia) || 65);
  const [angle, setAngle] = useState(Number(data.angulo) || 45);
  const [attempts, setAttempts] = useState(0);
  const [memoryOpen, setMemoryOpen] = useState<number[]>([]);
  const [sentenceChoice, setSentenceChoice] = useState<string[]>([]);
  const [dragChoice, setDragChoice] = useState('');
  const [clickChoice, setClickChoice] = useState<string[]>([]);
  const [lineChoice, setLineChoice] = useState('');

  function finish(correct: boolean) {
    setState({ ...state, completed: true, selected: correct ? '¡Muy bien! 🎉' : '¡Buen intento! Vuelve a probar.', });
  }

  function placeInZone(zoneId: string) {
    if (!dragChoice) return;
    const next = { ...state.matched, [dragChoice]: zoneId };
    setState({ ...state, matched: next });
    setDragChoice('');
    if (Object.keys(next).length === dragItems.length) finish(dragItems.every((item, index) => next[String(item.id ?? index)] === String(responseMap[String(item.id ?? index)])));
  }

  function checkDraw() {
    const drawn = state.drawn;
    const ok = drawPoints.length > 0 && drawPoints.every((point) => drawn.some((sample) => Math.hypot(point.x - sample.x, point.y - sample.y) < 0.13));
    finish(ok);
  }

  const distance = Number(data.distancia) || 65;
  const gravity = Number(data.gravedad) || 9.8;
  const range = (power * power * Math.sin((2 * angle * Math.PI) / 180)) / (gravity * 10);
  const reached = Math.abs(range - distance) < Math.max(8, distance * 0.13);

  return (
    <div className="junior-studio__preview">
      <div className="junior-studio__preview-label"><span>VISTA DEL ALUMNO</span><button type="button" onClick={() => { setState({ selected: '', completed: false, matched: {}, drawn: [] }); setClickChoice([]); setMemoryOpen([]); setSentenceChoice([]); setAttempts(0); }}>↻ Reiniciar</button></div>
      <article className="junior-studio__game">
        <div className="junior-studio__game-mark">PLACETA JUNIOR · RETO</div>
        <h4>{block.titulo || 'Tu reto'}</h4>
        <p>{block.instrucciones}</p>

        {block.tipo === 'test' && <>
          <h5>{text(question.pregunta, 'Elige la respuesta correcta')}</h5>
          <div className="junior-studio__preview-options">{options.map((option, index) => <button type="button" key={index} disabled={completed} onClick={() => finish(index === Number(question.correcta))}>{text(option, `Opción ${index + 1}`)}</button>)}</div>
        </>}

        {block.tipo === 'clic' && <>
          <h5>Encuentra {Number(data.objetivo) || 1} objetos</h5>
          <div className="junior-studio__click-grid">{clickItems.map((item, index) => {
            const id = String(item.id ?? index);
            const chosen = clickChoice.includes(id);
            return <button type="button" key={id} className={chosen ? 'is-picked' : ''} disabled={completed} onClick={() => {
              const next = chosen ? clickChoice.filter((value) => value !== id) : [...clickChoice, id];
              setClickChoice(next);
              const target = Number(data.objetivo) || 1;
              if (next.length === target) finish(next.every((itemId) => clickItems.find((candidate, candidateIndex) => String(candidate.id ?? candidateIndex) === itemId)?.correcto === true));
            }}><span>{text(item.emoji, '🔎')}</span>{text(item.texto)}</button>;
          })}</div>
        </>}

        {block.tipo === 'arrastrar' && <>
          <h5>Arrastra cada tarjeta a su grupo (o selecciónala y toca un grupo)</h5>
          <div className="junior-studio__drag-items">{dragItems.map((item, index) => {
            const id = String(item.id ?? index);
            return <button type="button" draggable={!completed} key={id} disabled={completed} onDragStart={() => setDragChoice(id)} onClick={() => setDragChoice(id)} className={dragChoice === id ? 'is-picked' : ''}>{text(item.emoji)} {text(item.texto)}</button>;
          })}</div>
          <div className="junior-studio__drop-zones">{zones.map((zone, index) => {
            const zoneId = String(zone.id ?? index);
            return <button type="button" key={zoneId} disabled={completed} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); placeInZone(zoneId); }} onClick={() => placeInZone(zoneId)}>{text(zone.nombre, text(zone.id, `Grupo ${index + 1}`))}<small>{Object.entries(state.matched).filter(([, value]) => value === zoneId).map(([key]) => text(dragItems.find((item, itemIndex) => String(item.id ?? itemIndex) === key)?.texto, key)).join(', ')}</small></button>;
          })}</div>
        </>}

        {block.tipo === 'lineas' && <>
          <h5>Une cada elemento con su pareja</h5>
          <div className="junior-studio__match-columns">
            <div>{pairs.map((pair, index) => <button type="button" key={String(pair.id ?? index)} className={lineChoice === String(pair.id ?? index) ? 'is-picked' : ''} disabled={completed || !!state.matched[String(pair.id ?? index)]} onClick={() => setLineChoice(String(pair.id ?? index))}>{text(pair.izq)}</button>)}</div>
            <div>{pairs.map((pair, index) => ({ pair, index })).reverse().map(({ pair, index }) => {
              const id = String(pair.id ?? index);
              return <button type="button" key={`${id}-right`} disabled={completed || !lineChoice || Object.values(state.matched).includes(id)} onClick={() => {
              const next = { ...state.matched, [lineChoice]: id };
              setState({ ...state, matched: next });
              setLineChoice('');
              if (Object.keys(next).length === pairs.length) finish(pairs.every((item, itemIndex) => next[String(item.id ?? itemIndex)] === String(item.id ?? itemIndex)));
            }}>{text(pair.der)}</button>;
            })}</div>
          </div>
        </>}

        {block.tipo === 'construir_frase' && <>
          <h5>Forma la frase correcta</h5><div className="junior-studio__sentence-result">{sentenceChoice.join(' ') || 'Toca las palabras en orden'}</div>
          <div className="junior-studio__preview-options">{(Array.isArray(data.palabras) ? data.palabras as string[] : []).map((word, index) => <button type="button" key={`${word}-${index}`} disabled={completed || sentenceChoice.includes(word)} onClick={() => {
            const next = [...sentenceChoice, word]; setSentenceChoice(next);
            if (next.length === (data.palabras as string[]).length) finish(next.join(' ').toLowerCase() === text(data.respuesta).toLowerCase());
          }}>{word}</button>)}</div>
        </>}

        {block.tipo === 'memoria' && <>
          <h5>Encuentra todas las parejas</h5><div className="junior-studio__memory-grid">{(Array.isArray(data.tarjetas) ? data.tarjetas as string[] : []).map((card, index, cards) => <button type="button" key={index} disabled={completed || memoryOpen.includes(index)} onClick={() => {
            const next = [...memoryOpen, index];
            setMemoryOpen(next);
            if (next.length === 2) {
              if (cards[next[0]] === cards[next[1]]) {
                const matched = { ...state.matched, [String(next[0])]: String(next[1]), [String(next[1])]: String(next[0]) };
                setState({ ...state, matched });
                if (Object.keys(matched).length === cards.length) finish(true);
                setMemoryOpen([]);
              } else window.setTimeout(() => setMemoryOpen([]), 650);
            }
          }}>          {memoryOpen.includes(index) || Object.prototype.hasOwnProperty.call(state.matched, String(index)) ? card : '❔'}</button>)}</div>
        </>}

        {block.tipo === 'dibujo' && <>
          <h5>Dibuja: {text(data.objetivo, 'sigue los puntos')}</h5>
          <svg className="junior-studio__drawing" viewBox="0 0 1000 360" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); setState({ ...state, drawn: [{ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }] }); }} onPointerMove={(event) => {
            if (!(event.buttons & 1)) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setState({ ...state, drawn: [...state.drawn, { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }] });
          }}>
            {drawPoints.length > 1 && <polyline points={drawPoints.map((point) => `${point.x * 1000},${point.y * 360}`).join(' ')} fill="none" stroke="#d5d8e7" strokeWidth="18" strokeDasharray="22 20" strokeLinecap="round" strokeLinejoin="round" />}
            {drawPoints.map((point, index) => <circle key={index} cx={point.x * 1000} cy={point.y * 360} r="17" fill="#f6bd60" />)}
            {state.drawn.length > 1 && <polyline points={state.drawn.map((point) => `${point.x * 1000},${point.y * 360}`).join(' ')} fill="none" stroke="#5b4bdb" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />}
          </svg><button type="button" className="junior-studio__check" disabled={completed || state.drawn.length < 2} onClick={checkDraw}>Comprobar dibujo</button>
        </>}

        {block.tipo === 'fisica_objetos' && <>
          <h5>{text(data.objeto, '⚽')} → {text(data.objetivo, '🥅')}</h5>
          <div className="junior-studio__physics" aria-label="Vista previa de lanzamiento">
            <span className="junior-studio__physics-ball">{text(data.objeto, '⚽')}</span>
            <span className="junior-studio__physics-target" style={{ left: `${Math.min(92, Math.max(8, distance))}%` }}>{text(data.objetivo, '🥅')}</span>
            <span className="junior-studio__physics-flight" style={{ left: '4%', width: `${Math.min(90, range)}%`, transform: `translateY(${-Math.min(70, Math.sin((angle * Math.PI) / 180) * 70)}px) rotate(${-angle / 3}deg)` }} />
          </div>
          <label className="junior-studio__slider">Fuerza <b>{power}</b><input type="range" min="10" max="100" value={power} disabled={completed} onChange={(event) => setPower(Number(event.target.value))} /></label>
          <label className="junior-studio__slider">Ángulo <b>{angle}°</b><input type="range" min="15" max="75" value={angle} disabled={completed} onChange={(event) => setAngle(Number(event.target.value))} /></label>
          <button type="button" className="junior-studio__check" disabled={completed || attempts >= (Number(data.intentos) || 3)} onClick={() => { setAttempts(attempts + 1); if (reached) finish(true); else if (attempts + 1 >= (Number(data.intentos) || 3)) finish(false); }}>{reached ? '¡Lanzar a la meta!' : 'Probar lanzamiento'} · {Math.max(0, (Number(data.intentos) || 3) - attempts)} intentos</button>
        </>}

        {completed && <div className={`junior-studio__feedback ${state.selected.startsWith('¡Muy') ? 'is-correct' : 'is-retry'}`} role="status">{state.selected || '¡Buen trabajo!'}</div>}
      </article>
    </div>
  );
}

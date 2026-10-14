import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import JuniorActivityStudio from '../pages/junior/JuniorActivityStudio';
import { createEmptyActivityContent } from '../pages/junior/activityStudioModel';

function StudioHarness() {
  const [value, setValue] = useState(createEmptyActivityContent());
  return <JuniorActivityStudio value={value} onChange={setValue} />;
}

describe('Studio de actividades · interfaz', () => {
  it('permite crear una pregunta y probar la respuesta correcta', () => {
    render(<StudioHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear una pregunta' }));
    fireEvent.change(screen.getByLabelText('Nombre del reto'), { target: { value: 'Animales' } });
    fireEvent.click(screen.getByRole('button', { name: '▶ Probar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opción A' }));

    expect(screen.getByRole('status')).toHaveTextContent('¡Muy bien!');
  });

  it('deja corregir el JSON sin quitar el modo avanzado', () => {
    render(<StudioHarness />);
    fireEvent.click(screen.getByRole('button', { name: '{} Avanzado' }));

    const editor = screen.getByLabelText('Contenido técnico (JSON)');
    fireEvent.change(editor, { target: { value: '{"bloques": []}' } });
    fireEvent.click(screen.getByText('Ver qué falta'));

    expect(screen.getByText('Añade al menos un reto antes de guardar.')).toBeInTheDocument();
  });
});

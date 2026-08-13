import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App (modo mock)', () => {
  it('muestra el dashboard tras cargar la sesión demo', async () => {
    render(<App />);
    expect(await screen.findByText(/Hola, Mikel/)).toBeInTheDocument();
  });

  it('muestra la navegación del RSP', async () => {
    render(<App />);
    expect(await screen.findByText('Bandeja de trabajo')).toBeInTheDocument();
    expect(screen.getAllByText('Expedientes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Auditoría').length).toBeGreaterThan(0);
  });
});

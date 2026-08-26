import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from '../App';

async function iniciarSesion() {
  // El acceso demo es el fallback escondido: primero se despliega.
  const toggle = await screen.findByRole('button', { name: /acceso de administrador/i });
  fireEvent.click(toggle);
  const passwordInput = await screen.findByLabelText(/contraseña/i);
  fireEvent.change(passwordInput, { target: { value: 'demo' } });
  fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
}

describe('App (modo mock)', () => {
  it('pide login y muestra el dashboard tras autenticarse', async () => {
    render(<App />);
    // Antes de autenticarse, se muestra el formulario de acceso
    expect(await screen.findByText('Panel de administración · acceso restringido')).toBeInTheDocument();
    await iniciarSesion();
    expect(await screen.findByText(/Hola, Mikel/)).toBeInTheDocument();
  });

  it('muestra la navegación del RSP tras el login', async () => {
    render(<App />);
    await iniciarSesion();
    expect(await screen.findByText('Bandeja de trabajo')).toBeInTheDocument();
    expect(screen.getAllByText('Expedientes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Auditoría').length).toBeGreaterThan(0);
  });
});

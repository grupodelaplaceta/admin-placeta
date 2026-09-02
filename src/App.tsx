import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ui';
import { RequireAuth, RequirePermiso } from './components/Guard';
import { AppLayout } from './components/layout/AppLayout';
import { RSP_ENTIDAD } from './router/nav';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Bandeja from './pages/bandeja/Bandeja';
import Expedientes from './pages/expedientes/Expedientes';
import ExpedienteDetail from './pages/expedientes/ExpedienteDetail';
import Ciudadanos from './pages/ciudadanos/Ciudadanos';
import CiudadanoDetail from './pages/ciudadanos/CiudadanoDetail';
import PlacetaID from './pages/placetaid/PlacetaID';
import Tramites from './pages/tramites/Tramites';
import TramiteDetail from './pages/tramites/TramiteDetail';
import Entidades from './pages/entidades/Entidades';
import Operaciones from './pages/operaciones/Operaciones';
import Auditoria from './pages/auditoria/Auditoria';
import Notificaciones from './pages/notificaciones/Notificaciones';
import Normativa from './pages/normativa/Normativa';
import Configuracion from './pages/configuracion/Configuracion';
import Bop from './pages/bop/Bop';
import Contribuyentes from './pages/tributos/Contribuyentes';
import Declaraciones from './pages/tributos/Declaraciones';
import DeclaracionDetail from './pages/tributos/DeclaracionDetail';
import Facturacion from './pages/tributos/Facturacion';
import EntidadDetail from './pages/entidades/EntidadDetail';
import Subvenciones from './pages/subvenciones/Subvenciones';
import SubvencionDetail from './pages/subvenciones/SubvencionDetail';
import Bonificaciones from './pages/bonos/Bonificaciones';
import BonoDetail from './pages/bonos/BonoDetail';
import Cuentas from './pages/banco/Cuentas';
import Tarjetas from './pages/banco/Tarjetas';
import Junior from './pages/junior/Junior';
import VoleyClub from './pages/voleyclub/VoleyClub';
import Votaciones from './pages/votaciones/Votaciones';
import Juntas from './pages/juntas/Juntas';
import Encuestas from './pages/encuestas/Encuestas';
import Informes from './pages/informes/Informes';
import { useAuth } from './auth/AuthContext';

function permiso(perm: string, element: ReactNode) {
  return <RequirePermiso entidad={RSP_ENTIDAD} permiso={perm}>{element}</RequirePermiso>;
}

function AuthLoading() {
  const { loading } = useAuth();
  if (!loading) return null;
  return <div className="rsp-app-loading" role="status" aria-live="polite"><div className="rsp-app-loading-mark">RSP</div><div className="rsp-spinner" /><p>Conectando con La Placeta…</p></div>;
}

export default function App() {
  return (
    <ToastProvider>
        <AuthProvider>
        <BrowserRouter>
          <AuthLoading />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={permiso('ver_dashboard', <Dashboard />)} />
              <Route path="/bandeja" element={permiso('gestionar_bandeja', <Bandeja />)} />
              <Route path="/tramites" element={permiso('ver_tramites', <Tramites />)} />
              <Route path="/tramites/:id" element={permiso('ver_tramites', <TramiteDetail />)} />
              <Route path="/expedientes" element={permiso('ver_expedientes', <Expedientes />)} />
              <Route path="/expedientes/:id" element={permiso('ver_expedientes', <ExpedienteDetail />)} />
              <Route path="/ciudadanos" element={permiso('ver_ciudadanos', <Ciudadanos />)} />
              <Route path="/ciudadanos/:dip" element={permiso('ver_ciudadanos', <CiudadanoDetail />)} />
              <Route path="/placetaid" element={permiso('ver_ciudadanos', <PlacetaID />)} />
              <Route path="/entidades" element={permiso('ver_entidades', <Entidades />)} />
              <Route path="/operaciones" element={permiso('ver_operaciones', <Operaciones />)} />
              <Route path="/auditoria" element={permiso('ver_auditoria', <Auditoria />)} />
              <Route path="/notificaciones" element={permiso('ver_notificaciones', <Notificaciones />)} />
              <Route path="/normativa" element={permiso('ver_normativa', <Normativa />)} />
              <Route path="/bop" element={permiso('ver_normativa', <Bop />)} />
              <Route path="/tributos" element={permiso('ver_contribuyentes', <Contribuyentes />)} />
              <Route path="/tributos/declaraciones" element={permiso('ver_declaraciones', <Declaraciones />)} />
              <Route path="/tributos/declaraciones/:id" element={permiso('ver_declaraciones', <DeclaracionDetail />)} />
              <Route path="/facturacion" element={permiso('ver_declaraciones', <Facturacion />)} />
              <Route path="/subvenciones" element={permiso('ver_subvenciones', <Subvenciones />)} />
              <Route path="/subvenciones/:id" element={permiso('ver_subvenciones', <SubvencionDetail />)} />
              <Route path="/bonos" element={permiso('ver_bonos', <Bonificaciones />)} />
              <Route path="/bonos/:id" element={permiso('ver_bonos', <BonoDetail />)} />
              <Route path="/banco/cuentas" element={permiso('ver_cuentas', <Cuentas />)} />
              <Route path="/banco/tarjetas" element={permiso('ver_tarjetas', <Tarjetas />)} />
              <Route path="/junior" element={permiso('ver_junior', <Junior />)} />
              <Route path="/voleyclub" element={permiso('ver_voleyclub', <VoleyClub />)} />
              <Route path="/votaciones" element={permiso('ver_votaciones', <Votaciones />)} />
              <Route path="/juntas" element={permiso('ver_juntas', <Juntas />)} />
              <Route path="/encuestas" element={permiso('ver_encuestas', <Encuestas />)} />
              <Route path="/informes" element={permiso('ver_informes', <Informes />)} />
              <Route path="/entidades/:eip" element={permiso('ver_entidades', <EntidadDetail />)} />
              <Route path="/configuracion" element={permiso('ver_dashboard', <Configuracion />)} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

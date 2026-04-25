import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ToastProvider } from './components/ui';
import { AppRoutes } from './routes';
import { AuthProvider } from './shared/auth';

/**
 * Composição raiz da árvore React.
 *
 * Hierarquia:
 *
 * - `<BrowserRouter>` — fornece roteamento. Hooks como `useNavigate`
 *   exigem este ancestral, então fica mais externo.
 * - `<AuthProvider>` — fica acima do `ToastProvider` para que callbacks
 *   internos de auth (ex.: handler de 401) possam, no futuro, exibir
 *   toasts via consumidor que combine `useAuth` + `useToast`.
 * - `<ToastProvider>` — UI feedback acessível em qualquer página.
 * - `<AppRoutes />` — componente de roteamento.
 */
const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;

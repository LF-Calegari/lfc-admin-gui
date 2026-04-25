import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ToastProvider } from './components/ui';
import { AppRoutes } from './routes';

const App: React.FC = () => (
  <BrowserRouter>
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  </BrowserRouter>
);

export default App;

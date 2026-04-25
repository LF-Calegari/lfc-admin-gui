import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './routes';

const App: React.FC = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
);

export default App;

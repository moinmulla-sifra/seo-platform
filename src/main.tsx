import React from 'react';
import { createRoot } from 'react-dom/client';
import DemoApp from './App';
import ProductionApp from './ProductionApp';

const productionMode = import.meta.env.VITE_LOCALPULSE_MODE === 'production';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {productionMode ? <ProductionApp /> : <DemoApp />}
  </React.StrictMode>,
);

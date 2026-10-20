import React from 'react';
import { createRoot } from 'react-dom/client';
import DemoApp from './App';
import ProductionApp from './ProductionApp';

// SaaS account/workspace mode is the default on every deployed environment.
// The demo is deliberately opt-in so a public URL never opens on fictional KPIs.
const query = new URLSearchParams(window.location.search);
const demoPreview = query.get('demo') === '1' ||
  (import.meta.env.DEV && import.meta.env.VITE_LOCALPULSE_MODE === 'demo');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {demoPreview ? <DemoApp /> : <ProductionApp />}
  </React.StrictMode>,
);

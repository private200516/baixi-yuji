import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './mobile/transit.css';
import './mobile/single-screen.css';
import './mobile/groove-navigation.css';
import './mobile/accessibility.css';
import './mobile/brand-fonts.css';
import './mobile/ui-motion.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

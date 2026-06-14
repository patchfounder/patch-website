import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Meeting from './components/Meeting.jsx';
import './styles.css';

const RootComponent = window.location.pathname === '/meeting' ? Meeting : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);

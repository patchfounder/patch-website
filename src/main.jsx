import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Meeting from './components/Meeting.jsx';
import './styles.css';

const bookingRoutes = {
  '/meeting': Meeting,
  // Add future Unbounce replacement pages here, for example:
  // '/kc': KcBookingPage,
};

const RootComponent = bookingRoutes[window.location.pathname] || App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);

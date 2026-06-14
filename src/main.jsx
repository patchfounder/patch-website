import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Meeting from './components/Meeting.jsx';
import Cancel from './components/Cancel.jsx';
import Kc from './components/Kc.jsx';
import Pre from './components/Pre.jsx';
import Reactivate from './components/Reactivate.jsx';
import './styles.css';

const bookingRoutes = {
  '/meeting': Meeting,
  '/cancel': Cancel,
  '/kc': Kc,
  '/pre': Pre,
  '/reactivate': Reactivate,
  // Add future Unbounce replacement pages here, for example:
  // '/kc': KcBookingPage,
};

function normalisePathname(pathname) {
  const normalised = pathname.replace(/\/+$/, '');
  return normalised || '/';
}

const pathname = normalisePathname(window.location.pathname);
const RootComponent = bookingRoutes[pathname] || App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);

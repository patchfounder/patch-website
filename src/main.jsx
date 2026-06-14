import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Meeting from './components/Meeting.jsx';
import Activity from './components/Activity.jsx';
import Cancel from './components/Cancel.jsx';
import Certified from './components/Certified.jsx';
import Coaching from './components/Coaching.jsx';
import Kc from './components/Kc.jsx';
import Masterclass from './components/Masterclass.jsx';
import Pre from './components/Pre.jsx';
import Reactivate from './components/Reactivate.jsx';
import './styles.css';

const bookingRoutes = {
  '/meeting': Meeting,
  '/activity': Activity,
  '/cancel': Cancel,
  '/certified': Certified,
  '/coaching': Coaching,
  '/kc': Kc,
  '/masterclass': Masterclass,
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

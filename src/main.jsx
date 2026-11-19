import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Assessment from './components/Assessment.jsx';
import Administration from './components/Administration.jsx';
import CoachApplication from './components/CoachApplication.jsx';
import Legal from './components/Legal.jsx';
import Meeting from './components/Meeting.jsx';
import Coaching from './components/Coaching.jsx';
import Training from './components/Training.jsx';
import { isRetiredTrainingPage } from './retired-training-pages.js';
import './styles.css';

const bookingRoutes = {
  '/application': CoachApplication,
  '/administration': Administration,
  '/assessment': Assessment,
  '/legal': Legal,
  '/meeting': Meeting,
  '/coaching': Coaching,
  '/training': Training,
  '/training/index.html': Training,
};

function normalisePathname(pathname) {
  const normalised = pathname.replace(/\/+$/, '');
  return normalised || '/';
}

const pathname = normalisePathname(window.location.pathname);
const RootComponent = bookingRoutes[pathname] || App;
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isRetiredTrainingPage(pathname)
      ? <main><h1>Not found.</h1></main>
      : <RootComponent />}
  </React.StrictMode>,
);

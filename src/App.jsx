import { useState } from 'react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import ProductShowcase from './components/ProductShowcase.jsx';
import WhyPatch from './components/WhyPatch.jsx';
import Stats from './components/Stats.jsx';
import Testimonials from './components/Testimonials.jsx';
import Pricing from './components/Pricing.jsx';
import Vision from './components/Vision.jsx';
import FirmEnquiries from './components/FirmEnquiries.jsx';
import AppDownloadCTA from './components/AppDownloadCTA.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  const openDownloadModal = (event) => {
    event.preventDefault();
    setIsDownloadModalOpen(true);
  };

  return (
    <>
      <Header onDownloadClick={openDownloadModal} />
      <main>
        <Hero onDownloadClick={openDownloadModal} />
        <ProductShowcase />
        <WhyPatch />
        <Stats />
        <Testimonials />
        <Pricing onDownloadClick={openDownloadModal} />
        <Vision />
        <FirmEnquiries />
        <AppDownloadCTA onDownloadClick={openDownloadModal} />
      </main>
      <Footer onDownloadClick={openDownloadModal} />
      {isDownloadModalOpen && (
        <div
          className="download-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="download-modal-title"
        >
          <div
            className="download-modal-backdrop"
            onClick={() => setIsDownloadModalOpen(false)}
            aria-hidden="true"
          />
          <div className="download-modal-panel">
            <button
              className="download-modal-close"
              type="button"
              onClick={() => setIsDownloadModalOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="download-modal-content">
              <div className="download-modal-copy">
                <span className="download-modal-eyebrow">Patch App</span>
                <h2 id="download-modal-title">The all-new Patch app is coming soon</h2>
                <p>
                  A new way to build a stronger, more confident speaking habit—with focused
                  practice, real coach conversations, and progress you can feel.
                </p>
                <p className="download-modal-launch">Launching early September.</p>
                <button
                  className="download-modal-action"
                  type="button"
                  onClick={() => setIsDownloadModalOpen(false)}
                >
                  See you in early September
                </button>
              </div>
              <div className="download-modal-phone" aria-hidden="true">
                <div className="download-phone-top">
                  <img src="/patch-icon.png" alt="" />
                  <span>Patch App</span>
                </div>
                <div className="download-phone-session">
                  <small>Your next session</small>
                  <strong>Ready to speak?</strong>
                  <span>15 minutes · coach call</span>
                </div>
                <div className="download-phone-rhythm">
                  <span>Launch window</span>
                  <strong>Early September</strong>
                </div>
                <div className="download-phone-score">
                  <span>Progress</span>
                  <strong>9/10</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

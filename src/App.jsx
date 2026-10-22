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
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ProductShowcase />
        <WhyPatch />
        <Stats />
        <Testimonials />
        <Pricing />
        <Vision />
        <FirmEnquiries />
        <AppDownloadCTA />
      </main>
      <Footer />
    </>
  );
}

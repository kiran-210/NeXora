import { Navbar } from "./landing/Navbar";
import { Hero } from "./landing/Hero";
import { Bento } from "./landing/Bento";
import { HowItWorks } from "./landing/HowItWorks";
import { Footer } from "./landing/Footer";

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Bento />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}

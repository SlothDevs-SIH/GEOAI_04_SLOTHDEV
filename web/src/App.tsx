import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import About from "./pages/About";
import Accuracy from "./pages/Accuracy";
import Analyse from "./pages/Analyse";
import Result from "./pages/Result";
import Scenes from "./pages/Scenes";

const NAV: [string, string][] = [["/", "Scenes"], ["/analyse", "Analyse"], ["/accuracy", "Accuracy"], ["/about", "About"]];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-200 bg-white px-4 py-2">
        <NavLink to="/" className="font-semibold">🛰️ GEOAI 04 · Change that matters</NavLink>
        <nav className="flex gap-4 text-sm">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "font-semibold text-accent" : "text-slate-600")}>{label}</NavLink>
          ))}
        </nav>
        <span className="ml-auto rounded border border-slate-300 px-2 text-[11px] text-slate-500">Team Slothdevs</span>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Scenes />} />
          <Route path="/scene/:id" element={<Result />} />
          <Route path="/analyse" element={<Analyse />} />
          <Route path="/accuracy" element={<Accuracy />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<p className="p-6">Page not found.</p>} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}

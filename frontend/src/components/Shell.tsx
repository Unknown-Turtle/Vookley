import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTheme } from "../lib/hooks";
import { useLibrary } from "../lib/store";
import { Logo, Moon, Sun } from "./Icons";

export function Shell() {
  const [theme, toggleTheme] = useTheme();
  const count = useLibrary().length;
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <header className="nav">
        <div className="container nav-inner">
          <Link to="/" className="brand" aria-label="Vookley home">
            <Logo />
            <span>Vookley</span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            <NavLink to="/analyze">Analyze</NavLink>
            <NavLink to="/library">
              Library{count > 0 && <span className="nav-count">{count}</span>}
            </NavLink>
            <NavLink to="/research">Research</NavLink>
          </nav>
          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
          <Link to="/analyze" className="btn btn-primary btn-sm">
            Analyze a track
          </Link>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container spread">
          <span>
            Vookley. Predictions come from a small model trained on 176 human-rated songs. Treat them as a second opinion, not a verdict.
          </span>
          <span className="row" style={{ gap: 18 }}>
            <Link to="/research">How it was validated</Link>
            <a href="https://github.com/unknown-turtle/vookley" target="_blank" rel="noreferrer">
              Source
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

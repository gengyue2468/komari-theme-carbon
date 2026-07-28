import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  Loading,
  SkipToContent,
} from "@carbon/react";
import {
  Asleep,
  EarthFilled,
  Light,
  Screen,
  Settings,
} from "@carbon/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { setLanguage, syncHtmlLang } from "~/i18n";
import type { Appearance } from "~/types/komari";
import { initAppearance, useAppearanceStore } from "~/stores/appearance";
import { useNodesStore } from "~/stores/nodes";

const THEME_ORDER: Appearance[] = ["system", "light", "dark"];
const FAVICON_SRC = "/favicon.ico";

export function AppShell() {
  const { t, i18n } = useTranslation();
  const appearance = useAppearanceStore((s) => s.appearance);
  const carbonTheme = useAppearanceStore((s) => s.carbonTheme);
  const setAppearance = useAppearanceStore((s) => s.setAppearance);
  const publicSettings = useNodesStore((s) => s.publicSettings);
  const loading = useNodesStore((s) => s.loading);
  const bootstrap = useNodesStore((s) => s.bootstrap);
  const teardown = useNodesStore((s) => s.teardown);
  const [faviconOk, setFaviconOk] = useState(true);

  const density = useNodesStore((s) => s.density);

  useEffect(() => {
    initAppearance();
    syncHtmlLang();
  }, []);

  useEffect(() => {
    void bootstrap();
    return () => teardown();
  }, [bootstrap, teardown]);

  useEffect(() => {
    document.documentElement.dataset.carbonTheme = carbonTheme;
    document.documentElement.style.colorScheme =
      carbonTheme === "g100" ? "dark" : "light";
  }, [carbonTheme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const siteName = publicSettings?.sitename?.trim() || "Komari Monitor";
  const isZh = i18n.language.startsWith("zh");
  const initial = (siteName.trim().charAt(0) || "K").toUpperCase();

  useEffect(() => {
    // SPA title; server still injects placeholders into index.html on first load
    document.title = siteName;
  }, [siteName]);

  const ThemeIcon =
    appearance === "dark" ? Asleep : appearance === "light" ? Light : Screen;

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(appearance);
    setAppearance(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };

  const cycleLanguage = () => {
    setLanguage(isZh ? "en" : "zh-CN");
  };

  return (
    <div className="app-shell">
      {loading && (
        <div className="loading-cover" role="status">
          <Loading withOverlay={false} small description={t("app.loading")} />
        </div>
      )}

      <Header aria-label="Komari" className="app-header">
        <div className="container app-header__inner">
          <SkipToContent />
          <Link to="/" className="app-header__brand">
            <span className="app-header__avatar" aria-hidden>
              {faviconOk ? (
                <img
                  src={FAVICON_SRC}
                  alt=""
                  className="app-header__avatar-img"
                  onError={() => setFaviconOk(false)}
                />
              ) : (
                <span className="app-header__avatar-fallback">{initial}</span>
              )}
            </span>
            <span className="app-header__title">{siteName}</span>
          </Link>
          <HeaderGlobalBar>
            <HeaderGlobalAction
              aria-label={`${t("appearance.language")}: ${isZh ? "中文" : "EN"}`}
              onClick={cycleLanguage}
              tooltipAlignment="center"
            >
              <EarthFilled size={20} />
            </HeaderGlobalAction>
            <HeaderGlobalAction
              aria-label={`${t("appearance.theme")}: ${t(`appearance.${appearance}`)}`}
              onClick={cycleTheme}
              tooltipAlignment="center"
            >
              <ThemeIcon size={20} />
            </HeaderGlobalAction>
            <HeaderGlobalAction
              aria-label={t("nav.admin")}
              onClick={() => {
                window.location.href = "/admin";
              }}
              tooltipAlignment="end"
            >
              <Settings size={20} />
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </div>
      </Header>

      {!loading && (
        <>
          <main id="main-content" className="app-main">
            <div className="container">
              <Outlet />
            </div>
          </main>
          <footer className="app-footer">
            <div className="container app-footer__row row-between">
              <span>
                {t("app.poweredByPrefix")}{" "}
                <a
                  href="https://github.com/komari-monitor/komari"
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>Komari Monitor</strong>
                </a>
                .
              </span>
              <span>
                {t("app.themeBy")}{" "}
                <a
                  href="https://github.com/gengyue2468/komari-theme-carbon"
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>Carbon</strong>
                </a>
              </span>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

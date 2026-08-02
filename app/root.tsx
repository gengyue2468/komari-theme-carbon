import { InlineNotification, Loading } from "@carbon/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { isRouteErrorResponse, Links, Meta, Scripts } from "react-router";
import type { Route } from "./+types/root";
import { AppShell } from "~/components/AppShell";
import { queryClient } from "~/lib/query-client";
import "~/i18n";
import "./styles/carbon.scss";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico" },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Komari Monitor" },
    { name: "description", content: "A simple server monitor tool." },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // lang is synced client-side from i18n; suppress mismatch with localStorage
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Apply stored/OS theme before first paint to avoid a light/dark flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a=localStorage.getItem('appearance');var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var t=a==='light'?'g10':a==='dark'?'g100':(d?'g100':'g10');document.documentElement.dataset.carbonTheme=t;document.documentElement.style.colorScheme=t==='g100'?'dark':'light';}catch(e){}})();`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return (
    <div className="hydrate-fallback" role="status" aria-label="Loading…">
      <Loading small withOverlay={false} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Error";
  let subtitle = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "404";
      subtitle = "The requested page could not be found.";
    } else {
      title = `Error ${error.status}`;
      subtitle = error.statusText || String(error.data) || subtitle;
    }
  } else if (error instanceof Error) {
    title = "Error";
    subtitle = error.message;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <InlineNotification
          className="page-banner"
          kind="error"
          title={title}
          subtitle={subtitle}
          lowContrast
          hideCloseButton
        />
      </AppShell>
    </QueryClientProvider>
  );
}

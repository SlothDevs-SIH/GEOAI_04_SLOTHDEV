import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

// Web shell: viewport, theme colour and the global focus ring (2 px, 2 px offset, style-guide yellow).
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#07111F" />
        <title>GEOAI 04: real change, not false alarms</title>
        <link rel="icon" href="/icon-192.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const CSS = `
html{background:#07111F}
html[data-theme="light"]{background:#F3F7FB}
:focus-visible{outline:2px solid #FDE047;outline-offset:2px}
html[data-theme="light"] :focus-visible{outline-color:#CA8A04}
@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

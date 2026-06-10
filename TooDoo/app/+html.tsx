import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

const PWA_THEME_COLOR = '#0e1325';

const serviceWorkerRegistration = `
if ('serviceWorker' in navigator) {
  var host = location.hostname;
  var isDevHost = host === 'localhost' || host === '127.0.0.1' || /^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(host);
  if (isDevHost) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { r.unregister(); });
    });
  } else {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="sv">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={PWA_THEME_COLOR} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TooDoo" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerRegistration }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import { html } from 'hono/html'
import { APP_KEYWORDS } from '../constants.js';

export const Layout = (props) => {
  const {
    title,
    children,
    description = 'Convert and optimize your subscription links easily',
    keywords = APP_KEYWORDS,
    lang = 'en-US'
  } = props
  const dir = lang === 'fa' ? 'rtl' : 'ltr'
  return html`
    <!DOCTYPE html>
    <html lang="${lang}" dir="${dir}" x-data="appData()">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <meta name="description" content="${description}" />
        <meta name="keywords" content="${keywords}" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link href="/styles.css" rel="stylesheet" />
        <link href="/vendor/fontawesome/css/all.min.css" rel="stylesheet" />
        <script src="/vendor/js-yaml/js-yaml.min.js"></script>
        <script defer src="/vendor/alpinejs/cdn.min.js" onerror="window.__alpineFailed=true"></script>
        <script>
          window.__alpineLoaded = false;
          document.addEventListener('alpine:init', () => { window.__alpineLoaded = true; });
          window.addEventListener('DOMContentLoaded', () => {
            if (window.__alpineFailed || !window.__alpineLoaded) {
              console.error('Failed to initialize Alpine.js. Interactive features are disabled.');
              const warning = document.createElement('div');
              warning.className = 'fixed bottom-4 right-4 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg shadow';
              warning.textContent = '加载 Alpine.js 失败，页面交互功能不可用，请刷新或检查网络。';
              document.body.appendChild(warning);
            }
          });
        </script>
        <style>
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            position: relative;
            min-height: 100vh;
            background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(246,248,251,0.98));
          }

          body::before {
            content: '';
            position: fixed;
            inset: 0;
            z-index: -2;
            background: linear-gradient(180deg, rgba(241,245,249,0.55), transparent 42%);
            pointer-events: none;
          }

          .dark body::before,
          html.dark body::before {
            background: linear-gradient(180deg, rgba(15,23,42,0.35), transparent 42%);
          }

          body::after {
            content: '';
            position: fixed;
            inset: 0;
            z-index: -1;
            opacity: 0.14;
            pointer-events: none;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
            background-repeat: repeat;
            background-size: 128px 128px;
          }

          .dark body::after,
          html.dark body::after {
            opacity: 0.08;
          }

          [x-cloak] { display: none !important; }

          :where(a, button, input, textarea, select):focus-visible {
            outline: 2px solid rgba(0, 130, 202, 0.72);
            outline-offset: 2px;
          }
        </style>
        <script>
          function appData() {
            return {
              darkMode: localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches),
              toggleDarkMode() {
                this.darkMode = !this.darkMode;
                localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
                if (this.darkMode) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              },
              init() {
                if (this.darkMode) {
                  document.documentElement.classList.add('dark');
                }
              }
            }
          }

        </script>
      </head>
      <body class="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        ${children}
      </body>
    </html>
  `
}

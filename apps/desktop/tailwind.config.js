/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  // テーマは html.dark クラスで切替（墨ダーク／和紙ライト）。
  // CSS 変数経由で色を定義し、darkMode:'class' で反転を表現する。
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 配色トークンは RGB 3値を CSS 変数で持ち、Tailwind の alpha-value で透過も効くようにする。
        // 変数の実体は index.css の :root（和紙ライト）と html.dark（墨ダーク）で定義。
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sub: 'rgb(var(--sub) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        linesoft: 'rgb(var(--linesoft) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        // 和欧混植：日本語ゴシック＋欧文システムサンセリフ
        sans: [
          'Hiragino Sans',
          'Hiragino Kaku Gothic ProN',
          'Yu Gothic',
          'Noto Sans JP',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        // 見出し用の明朝（墨筆の気配）
        head: [
          'Hiragino Mincho ProN',
          'YuMincho',
          'Yu Mincho',
          'Shippori Mincho',
          'Hina Mincho',
          'serif',
        ],
        // 等幅（日付・CodeMirror・ショートカットヒント）
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};

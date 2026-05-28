/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg:          'var(--bg)',
        'bg-surface': 'var(--bg-surface)',
        'bg-card':   'var(--bg-card)',
        'bg-hover':  'var(--bg-hover)',
        border:      'var(--border)',
        accent:      'var(--accent)',
        danger:      'var(--danger)',
        success:     'var(--success)',
      },
      textColor: {
        primary:   'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted:     'var(--text-muted)',
      },
      borderColor: {
        line:      'var(--border)',
        accent:    'var(--accent)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

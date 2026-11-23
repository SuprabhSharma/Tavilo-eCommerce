export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
        },
        accent: 'var(--accent)',
        ink: 'var(--ink)',
        'ink-light': 'var(--ink-light)',
        muted: 'var(--muted)',
        surface: 'var(--surface)',
        line: 'var(--line)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.05), 0 6px 16px -2px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'card-hover': '0 16px 32px -4px rgba(15, 23, 42, 0.12), 0 4px 12px -2px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 1)',
        float: '0 16px 36px -4px rgba(15, 23, 42, 0.14), 0 6px 16px -2px rgba(15, 23, 42, 0.06)',
        tactile: '0 2px 4px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        'tactile-btn': '0 2px 5px rgba(7, 141, 138, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        'tactile-btn-hover': '0 4px 12px rgba(7, 141, 138, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
        recessed: 'inset 0 2px 4px rgba(15, 23, 42, 0.06), inset 0 1px 2px rgba(15, 23, 42, 0.03)',
        'nav-bottom': '0 -8px 24px -4px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      },
      borderRadius: {
        card: '14px',
        '2card': '18px',
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Preserve the semantic utility names while reducing the visual weight
      // one step across the storefront. This keeps hierarchy intact without
      // the overly heavy 800-weight headings on compact screens.
      fontWeight: {
        semibold: '500',
        bold: '600',
        extrabold: '700',
      },
    },
  },
  plugins: [],
}

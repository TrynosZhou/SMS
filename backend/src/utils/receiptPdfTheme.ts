/** Modern flat receipt palette — neutral base, green accent for paid bar only */
export const RECEIPT_THEME = {
  pageBg: '#F3F4F6',
  cardBg: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  divider: '#E5E7EB',
  greenBg: '#ECFDF5',
  greenText: '#047857',
  greenDark: '#065F46',
  sans: 'Helvetica',
  sansBold: 'Helvetica-Bold',
  /** Tabular numerals for amounts and reference numbers */
  mono: 'Courier',
  monoBold: 'Courier-Bold',
} as const;

export type ReceiptTheme = typeof RECEIPT_THEME;

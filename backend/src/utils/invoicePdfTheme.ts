/** Crest Ledger — formal letterhead palette for invoice / receipt PDFs */
export const CREST_LEDGER = {
  navy: '#1B2A4A',
  gold: '#C9A227',
  ivory: '#FAFAF7',
  navyTint: '#EEF1F7',
  slate: '#2D3142',
  slateMuted: '#5C6478',
  white: '#FFFFFF',
  /** PDF built-ins approximating Lora (serif) and Inter (sans) */
  serifBold: 'Times-Bold',
  serif: 'Times-Roman',
  sans: 'Helvetica',
  sansBold: 'Helvetica-Bold',
} as const;

export type CrestLedgerTheme = typeof CREST_LEDGER;

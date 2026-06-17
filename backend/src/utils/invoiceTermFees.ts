import { Invoice } from '../entities/Invoice';

const tryNum = (v: unknown): number => (isFinite(Number(v)) ? Number(v) : 0);

/** Term fee lines on the invoice (tuition, transport, DH, registration, desk). */
export function canonicalInvoiceTermFees(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const tuition = tryNum(invoice.tuitionAmount);
  const transport = tryNum(invoice.transportAmount);
  const dining = tryNum(invoice.diningHallAmount);
  const registration = tryNum(invoice.registrationAmount);
  const desk = tryNum(invoice.deskFeeAmount);
  return parseFloat((tuition + transport + dining + registration + desk).toFixed(2));
}

/**
 * Term fees used for balance — prefer line items, but when line items exceed the billed
 * `amount` (stale duplicate transport/desk lines), trust `amount` so balance matches receipts.
 *
 * Exception: when logistics line items were added on top of a core-fee `amount` (tuition/reg/desk
 * only), sum line items so transport/DH toggles on the student profile update the balance.
 */
export function effectiveTermFeesForBalance(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const fromLines = canonicalInvoiceTermFees(invoice);
  const amountCol = tryNum(invoice.amount);

  if (fromLines <= 0.005) return amountCol;
  if (Math.abs(fromLines - amountCol) <= 0.05) return fromLines;

  if (fromLines > amountCol + 0.02) {
    const tuition = tryNum(invoice.tuitionAmount);
    const transport = tryNum(invoice.transportAmount);
    const dining = tryNum(invoice.diningHallAmount);
    const registration = tryNum(invoice.registrationAmount);
    const desk = tryNum(invoice.deskFeeAmount);
    const nonLogisticsLines = parseFloat((tuition + registration + desk).toFixed(2));
    const logisticsLines = parseFloat((transport + dining).toFixed(2));

    // Core fees match amount; transport/DH lines are additive (e.g. after enabling school transport).
    if (logisticsLines > 0.005 && nonLogisticsLines <= amountCol + 0.05) {
      return fromLines;
    }

    return amountCol;
  }

  if (fromLines < amountCol - 0.02) return amountCol;
  return fromLines;
}

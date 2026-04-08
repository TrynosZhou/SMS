/**
 * Transport / dining-hall payment logic for day scholars:
 * - Obligation amounts use Settings transportCost and diningHallCost (DH half price for staff child or exempted).
 * - Payments apply in order: previous balance → transport → dining hall → tuition & other (no proportional split).
 */

export const WATERFALL_EPS = 0.02;

const round2 = (x: number) => Math.round(Math.max(0, x) * 100) / 100;

export type WaterfallInvoiceSnapshot = {
  invoiceAmount: number;
  previousBalance: number;
  prepaidAmount: number;
  paidAmount: number;
  balance: number;
  invTuitionAmount: number;
  invTransportAmount: number;
  invDiningHallAmount: number;
  invRegistrationAmount: number;
  invDeskFeeAmount: number;
  studentType: string;
  usesTransport: boolean;
  usesDiningHall: boolean;
  isStaffChild: boolean;
  isExempted: boolean;
};

export function snapshotFromInvoiceAndStudent(inv: any, stu: any): WaterfallInvoiceSnapshot {
  return {
    invoiceAmount: parseFloat(String(inv?.amount ?? 0)) || 0,
    previousBalance: parseFloat(String(inv?.previousBalance ?? 0)) || 0,
    prepaidAmount: parseFloat(String(inv?.prepaidAmount ?? 0)) || 0,
    paidAmount: parseFloat(String(inv?.paidAmount ?? 0)) || 0,
    balance: parseFloat(String(inv?.balance ?? 0)) || 0,
    invTuitionAmount: parseFloat(String(inv?.tuitionAmount ?? 0)) || 0,
    invTransportAmount: parseFloat(String(inv?.transportAmount ?? 0)) || 0,
    invDiningHallAmount: parseFloat(String(inv?.diningHallAmount ?? 0)) || 0,
    invRegistrationAmount: parseFloat(String(inv?.registrationAmount ?? 0)) || 0,
    invDeskFeeAmount: parseFloat(String(inv?.deskFeeAmount ?? 0)) || 0,
    studentType: String(stu?.studentType || ''),
    usesTransport: !!stu?.usesTransport,
    usesDiningHall: !!stu?.usesDiningHall,
    isStaffChild: !!stu?.isStaffChild,
    isExempted: !!stu?.isExempted
  };
}

export function getLogisticsCaps(
  row: Pick<
    WaterfallInvoiceSnapshot,
    'studentType' | 'usesTransport' | 'usesDiningHall' | 'isStaffChild' | 'isExempted'
  >,
  transportCost: number,
  diningHallCost: number
): { capTr: number; capDh: number } {
  const st = String(row.studentType || '').trim().toLowerCase();
  const transportEligible =
    st === 'day scholar' && row.usesTransport && !row.isStaffChild && !row.isExempted && transportCost > 0;
  const dhEligible = st === 'day scholar' && row.usesDiningHall && diningHallCost > 0;
  const capTr = transportEligible ? round2(transportCost) : 0;
  const capDh = dhEligible
    ? row.isStaffChild || row.isExempted
      ? Math.round(diningHallCost * 0.5 * 100) / 100
      : round2(diningHallCost)
    : 0;
  return { capTr, capDh };
}

export type BucketState = { remPrev: number; remTr: number; remDh: number; remRest: number };

export function buildInitialBuckets(snapshot: WaterfallInvoiceSnapshot, capTr: number, capDh: number): BucketState {
  const prev = round2(snapshot.previousBalance || 0);
  const amt = round2(snapshot.invoiceAmount || 0);
  const remTr = round2(capTr);
  const remDh = round2(capDh);
  const remRest = round2(Math.max(0, amt - remTr - remDh));
  return { remPrev: prev, remTr, remDh, remRest };
}

export function cloneBuckets(s: BucketState): BucketState {
  return { remPrev: s.remPrev, remTr: s.remTr, remDh: s.remDh, remRest: s.remRest };
}

/** Apply one payment chunk: previous → transport → DH → rest (tuition & other). Mutates state. */
export function applyWaterfallChunk(
  payment: number,
  s: BucketState
): { toPrev: number; toTr: number; toDh: number; toRest: number } {
  let r = round2(payment);
  const toPrev = round2(Math.min(r, s.remPrev));
  r = round2(r - toPrev);
  s.remPrev = round2(s.remPrev - toPrev);

  const toTr = round2(Math.min(r, s.remTr));
  r = round2(r - toTr);
  s.remTr = round2(s.remTr - toTr);

  const toDh = round2(Math.min(r, s.remDh));
  r = round2(r - toDh);
  s.remDh = round2(s.remDh - toDh);

  const toRest = round2(Math.min(r, s.remRest));
  r = round2(r - toRest);
  s.remRest = round2(s.remRest - toRest);

  return { toPrev, toTr, toDh, toRest };
}

/** Sum of unpaid buckets excluding transport (for “outstanding” KPIs that must not include transport). */
export function outstandingExcludingTransportBucket(state: BucketState): number {
  return round2(state.remPrev + state.remDh + state.remRest);
}

/** Remaining buckets after applying prepaid then paidAmount (invoice totals). */
export function remainingBucketsAfterAppliedTotals(
  snapshot: WaterfallInvoiceSnapshot,
  transportCost: number,
  diningHallCost: number
): BucketState {
  const { capTr, capDh } = getLogisticsCaps(snapshot, transportCost, diningHallCost);
  const s = buildInitialBuckets(snapshot, capTr, capDh);
  applyWaterfallChunk(snapshot.prepaidAmount || 0, s);
  applyWaterfallChunk(snapshot.paidAmount || 0, s);
  return s;
}

export type PaymentLogSlice = { id: string; amountPaid: number; paymentDate?: Date; createdAt?: Date };

/**
 * Allocate each payment line for an invoice using full payment history order.
 * Cleared invoices: if attributed transport/DH falls short of settings caps (legacy data), top up on the last line.
 * Returns boosts when there are no payment lines but invoice is cleared (prepaid-only edge case).
 */
export function allocatePaymentLogsWaterfall(
  snapshot: WaterfallInvoiceSnapshot,
  logRows: PaymentLogSlice[],
  transportCost: number,
  diningHallCost: number
): {
  perLog: Map<string, { transportPortion: number; dhPortion: number; tuitionWithOverpayment: number }>;
  clearedBoostTr: number;
  clearedBoostDh: number;
} {
  const { capTr, capDh } = getLogisticsCaps(snapshot, transportCost, diningHallCost);
  const state = buildInitialBuckets(snapshot, capTr, capDh);
  const prepaid = Math.max(0, snapshot.prepaidAmount || 0);
  if (prepaid > 0) {
    applyWaterfallChunk(prepaid, state);
  }

  const sorted = [...logRows].sort((a, b) => {
    const ta = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
    const tb = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
    if (ta !== tb) return ta - tb;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ca - cb;
  });

  const perLog = new Map<string, { transportPortion: number; dhPortion: number; tuitionWithOverpayment: number }>();

  for (const row of sorted) {
    const pay = Math.max(0, parseFloat(String(row.amountPaid ?? 0)) || 0);
    const { toPrev, toTr, toDh, toRest } = applyWaterfallChunk(pay, state);
    perLog.set(row.id, {
      transportPortion: round2(toTr),
      dhPortion: round2(toDh),
      tuitionWithOverpayment: round2(toPrev + toRest)
    });
  }

  const bal = Math.max(0, snapshot.balance || 0);
  let clearedBoostTr = 0;
  let clearedBoostDh = 0;

  if (bal <= WATERFALL_EPS && (capTr > 0 || capDh > 0)) {
    const sumTr = [...perLog.values()].reduce((acc, v) => acc + v.transportPortion, 0);
    const sumDh = [...perLog.values()].reduce((acc, v) => acc + v.dhPortion, 0);
    const needTr = Math.max(0, round2(capTr - sumTr));
    const needDh = Math.max(0, round2(capDh - sumDh));

    if (needTr > WATERFALL_EPS || needDh > WATERFALL_EPS) {
      if (sorted.length > 0) {
        const lastId = sorted[sorted.length - 1].id;
        const cur = perLog.get(lastId)!;
        cur.transportPortion = round2(cur.transportPortion + needTr);
        cur.dhPortion = round2(cur.dhPortion + needDh);
      } else {
        clearedBoostTr = needTr;
        clearedBoostDh = needDh;
      }
    }
  }

  return { perLog, clearedBoostTr, clearedBoostDh };
}

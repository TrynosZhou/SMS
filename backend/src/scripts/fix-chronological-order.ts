import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { PaymentLog } from '../entities/PaymentLog';

async function fixChronologicalOrder() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);

    console.log('Finding invoice INV-2026-000070...');
    const invoice = await invoiceRepository.findOne({
      where: { invoiceNumber: 'INV-2026-000070' }
    });

    if (!invoice) {
      console.error('Invoice INV-2026-000070 not found');
      return;
    }

    console.log('Current invoice dueDate:', invoice.dueDate);
    console.log('Current invoice createdAt:', invoice.createdAt);

    // Set invoice date to early in Term 2 (12 May 2026 - term start)
    const newInvoiceDate = new Date('2026-05-15'); // 15 May 2026 (shortly after term start)
    invoice.dueDate = newInvoiceDate;
    
    // Update createdAt if it's later than the new dueDate to maintain consistency
    if (invoice.createdAt && invoice.createdAt > newInvoiceDate) {
      invoice.createdAt = newInvoiceDate;
    }

    await invoiceRepository.save(invoice);
    console.log('Updated invoice dueDate to:', invoice.dueDate.toISOString().split('T')[0]);

    console.log('\nFinding payment RCP-2026-97292990...');
    const payment = await paymentLogRepository.findOne({
      where: { receiptNumber: 'RCP-2026-97292990' }
    });

    if (!payment) {
      console.error('Payment RCP-2026-97292990 not found');
      return;
    }

    console.log('Current payment paymentDate:', payment.paymentDate);

    // Set payment date to after invoice date but within term window (20 July 2026)
    const newPaymentDate = new Date('2026-07-20');
    payment.paymentDate = newPaymentDate;
    
    await paymentLogRepository.save(payment);
    console.log('Updated payment paymentDate to:', payment.paymentDate.toISOString().split('T')[0]);

    console.log('\n✅ Successfully updated transaction dates');
    console.log('Invoice INV-2026-000070: 2026-05-15 (early in Term 2)');
    console.log('Payment RCP-2026-97292990: 2026-07-20 (after invoice, within Term 2)');
    console.log('\nThe ledger will now show:');
    console.log('1. Opening Balance → 2. Invoice → 3. Payment');
    console.log('Payment will be labeled as "Payment" (not "Advance Payment") since it comes after the invoice.');

  } catch (error) {
    console.error('Error updating dates:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

fixChronologicalOrder()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });

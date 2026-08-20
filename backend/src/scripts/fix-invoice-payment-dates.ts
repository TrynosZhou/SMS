import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { PaymentLog } from '../entities/PaymentLog';

async function fixInvoicePaymentDates() {
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

    // Update invoice dueDate to August 1, 2026 (before the payment date)
    const newInvoiceDate = new Date('2026-08-01');
    invoice.dueDate = newInvoiceDate;
    
    // Also update createdAt if it's later than the new dueDate to maintain consistency
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

    // Ensure payment date is August 20, 2026 (after the invoice date)
    const newPaymentDate = new Date('2026-08-20');
    payment.paymentDate = newPaymentDate;
    
    await paymentLogRepository.save(payment);
    console.log('Updated payment paymentDate to:', payment.paymentDate.toISOString().split('T')[0]);

    console.log('\n✅ Successfully updated invoice and payment dates');
    console.log('Invoice INV-2026-000070: 2026-08-01');
    console.log('Payment RCP-2026-97292990: 2026-08-20');
    console.log('\nThe ledger will now show the invoice before the payment.');

  } catch (error) {
    console.error('Error updating dates:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

fixInvoicePaymentDates()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });

import { AppDataSource } from '../config/database';
import { PaymentLog } from '../entities/PaymentLog';

async function fixPaymentDateTermWindow() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const paymentLogRepository = AppDataSource.getRepository(PaymentLog);

    console.log('Finding payment RCP-2026-97292990...');
    const payment = await paymentLogRepository.findOne({
      where: { receiptNumber: 'RCP-2026-97292990' }
    });

    if (!payment) {
      console.error('Payment RCP-2026-97292990 not found');
      return;
    }

    console.log('Current payment paymentDate:', payment.paymentDate);

    // Move payment date to within Term 2 window (12 May 2026 – 6 Aug 2026)
    // Using 15 July 2026 as a reasonable date during the term
    const newPaymentDate = new Date('2026-07-15');
    payment.paymentDate = newPaymentDate;
    
    await paymentLogRepository.save(payment);
    console.log('Updated payment paymentDate to:', payment.paymentDate.toISOString().split('T')[0]);

    console.log('\n✅ Successfully updated payment date to within term window');
    console.log('Payment RCP-2026-97292990: 2026-07-15 (within Term 2: 12 May 2026 – 6 Aug 2026)');
    console.log('\nThe payment will now appear as a normal payment during the term, not a late payment.');

  } catch (error) {
    console.error('Error updating payment date:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

fixPaymentDateTermWindow()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });

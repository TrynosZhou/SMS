/**
 * Migration script to fix invoice references for student JPS4200859
 * 
 * This script:
 * 1. Finds all invoices for student JPS4200859 by studentNumber
 * 2. Updates them to use the correct studentId
 * 3. Ensures all invoices are properly linked to the student record
 */

import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';

async function fixStudentInvoices() {
  try {
    console.log('Starting invoice fix for student JPS4200859...');
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    // Find the student by studentNumber
    const student = await studentRepository.findOne({
      where: { studentNumber: 'JPS4200859' },
      relations: ['user']
    });

    if (!student) {
      console.error('Student JPS4200859 not found!');
      return;
    }

    console.log(`Found student: ${student.studentNumber} (ID: ${student.id}, userId: ${student.userId || 'null'})`);

    // Find all invoices that might belong to this student
    // Query by studentId first
    let invoices = await invoiceRepository.find({
      where: { studentId: student.id },
      relations: ['student']
    });

    console.log(`Found ${invoices.length} invoice(s) directly linked by studentId`);

    // Also check for invoices linked by studentNumber through the join
    const invoicesByStudentNumber = await invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.student', 'student')
      .where('student.studentNumber = :studentNumber', { studentNumber: 'JPS4200859' })
      .getMany();

    // Combine and deduplicate
    const allInvoiceIds = new Set(invoices.map(inv => inv.id));
    for (const inv of invoicesByStudentNumber) {
      if (!allInvoiceIds.has(inv.id)) {
        invoices.push(inv);
        allInvoiceIds.add(inv.id);
      }
    }

    console.log(`Total invoices found: ${invoices.length}`);

    // Update any invoices that have incorrect studentId
    let updatedCount = 0;
    for (const invoice of invoices) {
      if (invoice.studentId !== student.id) {
        console.log(`Updating invoice ${invoice.invoiceNumber}: studentId ${invoice.studentId} -> ${student.id}`);
        invoice.studentId = student.id;
        await invoiceRepository.save(invoice);
        updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} invoice(s)`);

    // Calculate total balance
    const latestInvoice = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' }
    });

    if (latestInvoice) {
      const balance = parseFloat(String(latestInvoice.balance || 0));
      console.log(`Latest invoice: ${latestInvoice.invoiceNumber}, Balance: ${balance}`);
    } else {
      console.log('No invoices found for this student');
    }

    console.log('Invoice fix completed successfully!');
  } catch (error: any) {
    console.error('Error fixing invoices:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  fixStudentInvoices()
    .then(() => {
      console.log('Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { fixStudentInvoices };


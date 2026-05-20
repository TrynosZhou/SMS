import { AppDataSource } from '../src/config/database';
import { Invoice } from '../src/entities/Invoice';
import { fetchOutstandingBalanceRows } from '../src/utils/outstandingBalances';

async function main() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Invoice);

  const countCol = await repo
    .createQueryBuilder('i')
    .where('COALESCE(i.isVoided, false) = false')
    .andWhere('CAST(i.balance AS decimal) > 0.005')
    .getCount();

  const distinctOn: Array<{ id: string; balance: string; studentId: string }> = await repo.query(`
    SELECT DISTINCT ON ("studentId") id, balance, "studentId"
    FROM invoices
    WHERE COALESCE("isVoided", false) = false
    ORDER BY "studentId", "createdAt" DESC
  `);

  const withBal = distinctOn.filter((r) => parseFloat(String(r.balance)) > 0.005);
  const rows = await fetchOutstandingBalanceRows();

  console.log('invoices with balance>0:', countCol);
  console.log('distinct latest per student:', distinctOn.length);
  console.log('latest rows with balance>0:', withBal.length);
  console.log('fetchOutstandingBalanceRows:', rows.length);
  if (rows.length > 0) {
    console.log('sample:', rows[0]);
  }

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

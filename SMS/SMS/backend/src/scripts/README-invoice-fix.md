# Invoice Reference Fix for Student JPS4200859

## Problem
Student dashboard shows $0 invoice balance, but admin dashboard shows $600 for student JPS4200859. This is caused by invoice reference mismatches where invoices were created before the student was properly linked to a user account.

## Solution

### Option 1: Run TypeScript Migration Script (Recommended)

```bash
cd backend
npm run ts-node src/scripts/fix-student-invoices.ts
```

Or if using ts-node directly:
```bash
npx ts-node src/scripts/fix-student-invoices.ts
```

### Option 2: Run SQL Script Directly

Connect to your PostgreSQL database and run:
```bash
psql -U your_username -d your_database -f src/scripts/fix-student-invoices.sql
```

Or execute the SQL commands manually in your database client.

### Option 3: Manual SQL Update

If you know the correct studentId (15dc8309-5cf2-49f0-b6a1-f230059c4936), run:

```sql
UPDATE invoices
SET "studentId" = '15dc8309-5cf2-49f0-b6a1-f230059c4936'
WHERE "studentId" IN (
    SELECT s.id
    FROM students s
    WHERE s."studentNumber" = 'JPS4200859'
    AND s.id != '15dc8309-5cf2-49f0-b6a1-f230059c4936'
);
```

## Verification

After running the fix, verify the balance:

1. Check backend logs when student logs in - should show:
   ```
   [getStudentBalance] Found X invoice(s) for student JPS4200859
   [getStudentBalance] Final balance for student JPS4200859: 600
   ```

2. Query the database:
   ```sql
   SELECT 
       i."invoiceNumber",
       i."studentId",
       s."studentNumber",
       i.balance,
       i."createdAt"
   FROM invoices i
   INNER JOIN students s ON i."studentId" = s.id
   WHERE s."studentNumber" = 'JPS4200859'
   ORDER BY i."createdAt" DESC;
   ```

3. Test both dashboards:
   - Student dashboard should show $600
   - Admin dashboard should show $600

## Code Changes Made

1. **Updated `getStudentBalance` function** to query invoices using multiple criteria:
   - Matches by studentId (direct)
   - Also matches by studentNumber through join
   - Filters results to ensure correct student

2. **Updated `createInvoice` function** to:
   - Validate student exists before creating invoice
   - Check for and fix any reference mismatches in previous invoices
   - Log student information for debugging

3. **Created migration scripts** to fix existing invoice references

## Prevention

Going forward, invoice creation:
- Always validates student exists
- Uses the correct studentId from the student record
- Logs student information for debugging
- Automatically fixes any reference mismatches found


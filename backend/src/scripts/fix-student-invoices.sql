-- SQL script to fix invoice references for student JPS4200859
-- This updates all invoices to use the correct studentId

-- Step 1: Find the correct studentId for JPS4200859
-- SELECT id, "studentNumber", "userId" FROM students WHERE "studentNumber" = 'JPS4200859';

-- Step 2: Update all invoices that belong to this student
-- This query finds invoices by joining with students table and matching by studentNumber
UPDATE invoices
SET "studentId" = (
    SELECT id 
    FROM students 
    WHERE "studentNumber" = 'JPS4200859'
    LIMIT 1
)
WHERE "studentId" IN (
    SELECT i."studentId"
    FROM invoices i
    INNER JOIN students s ON i."studentId" = s.id
    WHERE s."studentNumber" = 'JPS4200859'
)
OR "studentId" IN (
    -- Also catch any invoices that might have been created with a different studentId
    -- but belong to the same student (by studentNumber)
    SELECT i.id
    FROM invoices i
    INNER JOIN students s ON i."studentId" = s.id
    WHERE s."studentNumber" = 'JPS4200859'
);

-- Alternative: More direct approach if you know the studentId
-- Replace '15dc8309-5cf2-49f0-b6a1-f230059c4936' with the actual studentId
-- UPDATE invoices
-- SET "studentId" = '15dc8309-5cf2-49f0-b6a1-f230059c4936'
-- WHERE "studentId" IN (
--     SELECT s.id
--     FROM students s
--     WHERE s."studentNumber" = 'JPS4200859'
--     AND s.id != '15dc8309-5cf2-49f0-b6a1-f230059c4936'
-- );

-- Step 3: Verify the fix
-- SELECT 
--     i."invoiceNumber",
--     i."studentId",
--     s."studentNumber",
--     i.balance,
--     i."createdAt"
-- FROM invoices i
-- INNER JOIN students s ON i."studentId" = s.id
-- WHERE s."studentNumber" = 'JPS4200859'
-- ORDER BY i."createdAt" DESC;


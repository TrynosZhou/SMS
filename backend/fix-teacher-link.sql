-- Fix teacher linking for user with username jpst3699880
-- This will unlink from "Teacher Account" and link to "Tami Sauka"

-- First, find the user ID
SELECT id, username FROM users WHERE username = 'jpst3699880';

-- Find both teachers with the same teacherId
SELECT id, firstName, lastName, teacherId, userId FROM teachers WHERE teacherId = 'jpst3699880';

-- Unlink the wrong teacher (Teacher Account)
UPDATE teachers SET userId = NULL WHERE firstName = 'Teacher' AND lastName = 'Account' AND teacherId = 'jpst3699880';

-- Link to the correct teacher (Tami Sauka) - UPDATE THIS WITH THE CORRECT ID
UPDATE teachers SET userId = (SELECT id FROM users WHERE username = 'jpst3699880') 
WHERE firstName = 'Tami' AND lastName = 'Sauka' AND teacherId = 'jpst3699880';

-- Verify the fix
SELECT u.username, t.firstName, t.lastName, t.teacherId 
FROM users u 
LEFT JOIN teachers t ON u.id = t.userId 
WHERE u.username = 'jpst3699880';

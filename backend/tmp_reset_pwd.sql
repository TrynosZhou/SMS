UPDATE users SET password = '$2a$10$YpJS1zb0qo9P/B/x5h3Ft.E3XhiW98n3T53EZCW7s.UOjvDQrTfdO' WHERE username = 'admin';
DELETE FROM login_attempt_logs WHERE username = 'admin' OR user_id IN (SELECT id FROM users WHERE username = 'admin');

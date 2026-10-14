SELECT id, username, role, "isActive" FROM users WHERE role IN ('superadmin','admin') LIMIT 5;

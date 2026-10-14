const bcrypt = require('bcryptjs');
bcrypt.hash('Admin@123', 10).then(h => console.log(h));

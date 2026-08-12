const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'datawarehouse',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'secretpassword',
});

pool.on('connect', () => {
  console.log('Conectado exitosamente a PostgreSQL Data Warehouse');
});

module.exports = pool;

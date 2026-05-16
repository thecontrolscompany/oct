import sql from 'mssql';

const config: sql.config = {
  server: process.env.CCT_DB_SERVER ?? 'localhost',
  database: 'CCT_DB',
  user: process.env.CCT_DB_USER,
  password: process.env.CCT_DB_PASSWORD,
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export { sql };

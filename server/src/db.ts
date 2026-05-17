import sql from 'mssql';

function makeConfig(database: string): sql.config {
  return {
    server: process.env.CCT_DB_SERVER ?? 'localhost',
    database,
    user: process.env.CCT_DB_USER,
    password: process.env.CCT_DB_PASSWORD,
    options: {
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };
}

const pools = new Map<string, sql.ConnectionPool>();

export async function getPool(database = 'CCT_DB'): Promise<sql.ConnectionPool> {
  const existing = pools.get(database);
  if (existing && existing.connected) return existing;
  const pool = await new sql.ConnectionPool(makeConfig(database)).connect();
  pools.set(database, pool);
  return pool;
}

export { sql };

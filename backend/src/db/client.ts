import mysql from 'mysql2/promise';
import { env } from '@/core/env';

export const pool = mysql.createPool({
  host: env.DB.host,
  port: env.DB.port,
  user: env.DB.user,
  password: env.DB.password,
  database: env.DB.name,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
});

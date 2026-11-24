import 'dotenv/config';
import mysql from 'mysql2/promise';

try {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });
  console.log('1. Connected to MySQL');

  const [tables] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'cmathgames'"
  );
  console.log('2. Tables in cmathgames:', tables.map(t => t.table_name || t.TABLE_NAME));

  await conn.beginTransaction();
  await conn.query(
    "INSERT INTO cmathgames.matrices_snl (name, turns_taken, correct_answers, wrong_answers, time_taken) VALUES ('TEST_DELETE_ME', 1, 1, 0, '00:00:30')"
  );
  const [rows] = await conn.query(
    "SELECT * FROM cmathgames.matrices_snl WHERE name = 'TEST_DELETE_ME'"
  );
  console.log('3. Test row inserted and read back:', rows.length === 1 ? 'OK' : 'FAILED');
  await conn.rollback();
  console.log('4. Test row rolled back (nothing left in your table)');

  await conn.end();
} catch (err) {
  console.error('FAILED:', err.code, err.message);
}
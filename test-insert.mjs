import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

await conn.query(
  "INSERT INTO cmathgames.matrices_snl (name, turns_taken, correct_answers, wrong_answers, time_taken) VALUES ('TEST_PLAYER', 24, 15, 9, '00:05:30')"
);

const [rows] = await conn.query('SELECT * FROM cmathgames.matrices_snl');
console.table(rows);
await conn.end();
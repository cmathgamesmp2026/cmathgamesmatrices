import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase } from '../services/db.js';

async function main() {
  console.log('--- Initializing MySQL Database for Matrices Snakes & Ladders ---');
  console.log(`Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
  console.log(`User: ${process.env.DB_USER || 'root'}`);

  try {
    await initializeDatabase();
    console.log(' Database initialization completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error(' Failed to initialize database:');
    console.error(err.message);
    console.error('\nPlease verify your DB settings in .env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD).');
    process.exit(1);
  }
}

main();

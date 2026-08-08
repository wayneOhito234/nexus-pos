import 'dotenv/config';
import { pool } from './db.js';

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cashiers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY,
      cashier_id INTEGER NOT NULL REFERENCES cashiers(id),
      terminal_id TEXT NOT NULL,
      clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
      clock_out TIMESTAMPTZ
    );
  `);

  const { rows: existing } = await pool.query('SELECT COUNT(*) FROM cashiers');
  if (Number(existing[0].count) === 0) {
    await pool.query(`
      INSERT INTO cashiers (name, role) VALUES
      ('Amina', 'cashier'),
      ('John Mwangi', 'cashier'),
      ('Grace Wanjiru', 'cashier'),
      ('David Otieno', 'manager');
    `);
    console.log('Seeded cashiers table.');
  }

  console.log('Migration complete: cashiers and shifts tables ready.');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
import 'dotenv/config';
import { pool } from './db.js';

async function migrate() {
  await pool.query(`ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS first_name TEXT;`);
  await pool.query(`ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS last_name TEXT;`);
  await pool.query(`ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS password_hash TEXT;`);

  // Backfill existing seeded cashiers so they still show sensibly.
  const { rows } = await pool.query('SELECT id, name FROM cashiers WHERE first_name IS NULL');
  for (const row of rows) {
    const [first, ...rest] = row.name.split(' ');
    await pool.query('UPDATE cashiers SET first_name = $1, last_name = $2 WHERE id = $3', [
      first,
      rest.join(' ') || '',
      row.id,
    ]);
  }

  console.log('Auth migration complete: first_name, last_name, password_hash added.');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
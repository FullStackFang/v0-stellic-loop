import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const migrations = join(process.cwd(), 'supabase', 'migrations');
let database: PGlite | null = null;

afterEach(async () => {
  await database?.close();
  database = null;
});

test('0005 accepts a remote schema where the original generated board check is absent', async () => {
  database = new PGlite();
  await database.exec('create role anon; create role authenticated;');
  for (const name of ['0001_schema.sql', '0002_lock.sql', '0003_grants.sql', '0004_lock_search_path.sql']) {
    await database.exec(readFileSync(join(migrations, name), 'utf8'));
  }
  await database.exec('alter table board drop constraint board_check');

  await expect(database.exec(readFileSync(join(migrations, '0005_boards.sql'), 'utf8'))).resolves.toBeDefined();
  await expect(database.exec("insert into board(slug,name,window_kind,window_start,window_end) values ('rolling','Rolling','rolling',null,null)")).resolves.toBeDefined();
});

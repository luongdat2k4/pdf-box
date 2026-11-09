import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const schema = version => JSON.parse(readFileSync(new URL(`../android/app/schemas/vn.alf.pdftoolbox.library.db.AppDatabase/${version}.json`, import.meta.url), 'utf8')).database
function create(db, version) {
  for (const entity of schema(version).entities) {
    db.exec(entity.createSql.replaceAll('${TABLE_NAME}', entity.tableName))
    for (const index of entity.indices ?? []) db.exec(index.createSql.replaceAll('${TABLE_NAME}', entity.tableName))
  }
}

test('Room v1 to v2 migration preserves library data and matches the generated v2 schema', () => {
  const upgraded = new DatabaseSync(':memory:')
  const fresh = new DatabaseSync(':memory:')
  try {
    create(upgraded, 1)
    upgraded.exec(`INSERT INTO document (id, storage, location, display_name, mime_type, is_favorite, last_page, added_at)
      VALUES ('kept', 'external', 'content://device/file.pdf', 'file.pdf', 'application/pdf', 1, 7, 1900000000000)`)
    const source = readFileSync(new URL('../android/app/src/main/kotlin/vn/alf/pdftoolbox/library/db/AppDatabase.kt', import.meta.url), 'utf8')
    const migration = source.match(/MIGRATION_1_2[\s\S]*?override fun migrate[\s\S]*?\n            }/)[0]
    for (const [, sql] of migration.matchAll(/db\.execSQL\("([^"]+)"\)/g)) upgraded.exec(sql)
    create(fresh, 2)
    assert.deepEqual(upgraded.prepare('PRAGMA table_info(document)').all(), fresh.prepare('PRAGMA table_info(document)').all())
    const indexes = db => db.prepare('PRAGMA index_list(document)').all().map(row => row.name).sort()
    assert.deepEqual(indexes(upgraded), indexes(fresh))
    assert.equal(upgraded.prepare('SELECT is_favorite FROM document').get().is_favorite, 1)
    assert.equal(upgraded.prepare('SELECT last_page FROM document').get().last_page, 7)
    assert.equal(upgraded.prepare('SELECT added_at FROM document').get().added_at, 1900000000000)
    assert.equal(upgraded.prepare('SELECT modified_at FROM document').get().modified_at, null)
  } finally { upgraded.close(); fresh.close() }
})

test('database orders by original file time, with unknown dates after known dates', () => {
  const db = new DatabaseSync(':memory:')
  try {
    create(db, 2)
    const insert = db.prepare(`INSERT INTO document (id, storage, location, display_name, mime_type, added_at, modified_at) VALUES (?, 'external', ?, ?, 'application/pdf', ?, ?)`)
    insert.run('old', 'content://file/old', 'old.pdf', 9000, 1000)
    insert.run('new', 'content://file/new', 'new.pdf', 1000, 9000)
    insert.run('unknown', 'content://file/unknown', 'unknown.pdf', 99999, null)
    const dao = readFileSync(new URL('../android/app/src/main/kotlin/vn/alf/pdftoolbox/library/db/DocumentDao.kt', import.meta.url), 'utf8')
    const query = dao.match(/@Query\("([^"]+)"\)\s+suspend fun getAll/)[1]
    assert.deepEqual(db.prepare(query).all().map(row => row.id), ['new', 'old', 'unknown'])
  } finally { db.close() }
})

test('Room v2 to v3 preserves metadata, creates checkpoints and advances revision only on committed document writes', () => {
  const upgraded = new DatabaseSync(':memory:')
  const fresh = new DatabaseSync(':memory:')
  try {
    create(upgraded, 2)
    upgraded.exec(`INSERT INTO document (id, storage, location, display_name, mime_type, is_favorite, last_page, last_opened_at, added_at, modified_at)
      VALUES ('kept', 'external', 'content://device/old.txt', 'old.txt', 'text/plain', 1, 7, 123, 100, 90)`)
    const source = readFileSync(new URL('../android/app/src/main/kotlin/vn/alf/pdftoolbox/library/db/AppDatabase.kt', import.meta.url), 'utf8')
    const migration = source.match(/MIGRATION_2_3[\s\S]*?override fun migrate[\s\S]*?\n            }/)[0]
    for (const [, sql] of migration.matchAll(/db\.execSQL\("([^"]+)"\)/g)) upgraded.exec(sql)
    const installer = source.match(/fun installRevision[\s\S]*?\n        }/)[0]
    for (const [, sql] of installer.matchAll(/db\.execSQL\("([^"]+)"\)/g)) {
      if (sql.includes('$action')) for (const action of ['INSERT', 'UPDATE', 'DELETE']) upgraded.exec(sql.replaceAll('$action', action))
      else upgraded.exec(sql)
    }
    create(fresh, 3)
    for (const table of ['document', 'library_state', 'library_directory', 'library_source']) {
      assert.deepEqual(upgraded.prepare(`PRAGMA table_info(${table})`).all(), fresh.prepare(`PRAGMA table_info(${table})`).all())
      const indexes = db => db.prepare(`PRAGMA index_list(${table})`).all().map(row => row.name).sort()
      assert.deepEqual(indexes(upgraded), indexes(fresh))
    }
    const kept = upgraded.prepare('SELECT * FROM document').get()
    assert.equal(kept.is_favorite, 1)
    assert.equal(kept.last_page, 7)
    assert.equal(kept.last_opened_at, 123)
    assert.equal(kept.modified_at, 90)
    assert.equal(kept.is_missing, 0)
    const revision = () => upgraded.prepare('SELECT revision FROM library_state').get().revision
    assert.equal(revision(), 0)
    upgraded.exec("UPDATE document SET size_bytes = 99 WHERE id = 'kept'")
    assert.equal(revision(), 1)
    upgraded.exec("BEGIN; UPDATE document SET size_bytes = 100 WHERE id = 'kept'; ROLLBACK")
    assert.equal(revision(), 1)
    upgraded.exec("UPDATE document SET is_missing = 1 WHERE id = 'kept'")
    assert.equal(upgraded.prepare('SELECT COUNT(*) AS count FROM document WHERE is_missing = 0').get().count, 0)
    assert.equal(upgraded.prepare('SELECT last_page FROM document').get().last_page, 7)
    upgraded.exec("UPDATE document SET is_missing = 0, location = 'content://device/moved.txt' WHERE id = 'kept'")
    assert.equal(upgraded.prepare('SELECT last_page FROM document WHERE is_missing = 0').get().last_page, 7)
    assert.equal(revision(), 3)
    assert.equal(upgraded.prepare('SELECT status FROM library_state').get().status, 'not_started')
  } finally { upgraded.close(); fresh.close() }
})

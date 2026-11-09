package vn.alf.pdftoolbox.library.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import vn.alf.pdftoolbox.library.model.DocumentEntity
import vn.alf.pdftoolbox.library.model.LibraryState
import vn.alf.pdftoolbox.library.model.LibraryDirectory
import vn.alf.pdftoolbox.library.model.LibrarySource

/**
 * The app's SQLite database. Schema changes must bump [version] and ship a Migration; never use
 * fallbackToDestructiveMigration, it would wipe the user's library.
 */
@Database(entities = [DocumentEntity::class, LibraryState::class, LibraryDirectory::class, LibrarySource::class], version = 4, exportSchema = true)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun documentDao(): DocumentDao
    abstract fun libraryIndexDao(): LibraryIndexDao

    companion object {
        const val FILE_NAME = "pdftoolbox.db"
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE document ADD COLUMN modified_at INTEGER")
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_doc_modified ON document (modified_at DESC)")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE document ADD COLUMN source_key TEXT")
                db.execSQL("ALTER TABLE document ADD COLUMN is_missing INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE document ADD COLUMN local_path TEXT")
                db.execSQL("ALTER TABLE document ADD COLUMN source_name TEXT")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_local_path ON document (local_path)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_source_key ON document (source_key)")
                db.execSQL("CREATE TABLE IF NOT EXISTS library_state (id INTEGER NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, indexVersion INTEGER NOT NULL, lastSuccessAt INTEGER, PRIMARY KEY(id))")
                db.execSQL("CREATE TABLE IF NOT EXISTS library_directory (path TEXT NOT NULL, modifiedAt INTEGER NOT NULL, PRIMARY KEY(path))")
                db.execSQL("CREATE TABLE IF NOT EXISTS library_source (volume TEXT NOT NULL, version TEXT NOT NULL, generation INTEGER NOT NULL, PRIMARY KEY(volume))")
                installRevision(db)
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE document ADD COLUMN trashed_at INTEGER")
            }
        }

        internal fun installRevision(db: SupportSQLiteDatabase) {
            db.execSQL("INSERT OR IGNORE INTO library_state (id, revision, status, indexVersion) VALUES (1, 0, 'not_started', 1)")
            for (action in listOf("INSERT", "UPDATE", "DELETE")) {
                db.execSQL("CREATE TRIGGER IF NOT EXISTS library_revision_$action AFTER $action ON document BEGIN UPDATE library_state SET revision = revision + 1 WHERE id = 1; END")
            }
        }

        @Volatile
        private var instance: AppDatabase? = null

        /** One instance per process; opening a second one on the same file is unsafe. */
        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, FILE_NAME)
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
                    .addCallback(object : Callback() {
                        override fun onCreate(db: SupportSQLiteDatabase) { installRevision(db) }
                    })
                    .build()
                    .also { instance = it }
            }
    }
}

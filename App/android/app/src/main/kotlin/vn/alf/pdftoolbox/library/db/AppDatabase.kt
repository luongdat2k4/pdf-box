package vn.alf.pdftoolbox.library.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import vn.alf.pdftoolbox.library.model.DocumentEntity

/**
 * The app's SQLite database. Schema changes must bump [version] and ship a Migration; never use
 * fallbackToDestructiveMigration, it would wipe the user's library.
 */
@Database(entities = [DocumentEntity::class], version = 2, exportSchema = true)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun documentDao(): DocumentDao

    companion object {
        const val FILE_NAME = "pdftoolbox.db"
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE document ADD COLUMN modified_at INTEGER")
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_doc_modified ON document (modified_at DESC)")
            }
        }

        @Volatile
        private var instance: AppDatabase? = null

        /** One instance per process; opening a second one on the same file is unsafe. */
        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, FILE_NAME)
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }
    }
}

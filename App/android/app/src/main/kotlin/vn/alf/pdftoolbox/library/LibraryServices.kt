package vn.alf.pdftoolbox.library

import android.content.Context
import vn.alf.pdftoolbox.library.db.AppDatabase
import vn.alf.pdftoolbox.library.files.AppContentStore
import vn.alf.pdftoolbox.library.files.ExternalContentStore
import vn.alf.pdftoolbox.library.files.WriteSessions

/**
 * The process-wide objects behind the library: one database, one DataStore, one set of write sessions.
 * They must be singletons (a second Room or DataStore instance on the same file is unsafe), so the plugin,
 * which Android may recreate, fetches them here instead of building its own.
 */
class LibraryServices private constructor(context: Context) {
    val writeSessions: WriteSessions
    val repository: LibraryRepository

    init {
        val app = context.applicationContext
        val content = AppContentStore(app.filesDir)
        writeSessions = WriteSessions(content)
        repository = LibraryRepository(
            context = app,
            dao = AppDatabase.get(app).documentDao(),
            app = content,
            external = ExternalContentStore(app),
            settingsStore = SettingsStore(app),
        )
    }

    companion object {
        @Volatile
        private var instance: LibraryServices? = null

        fun get(context: Context): LibraryServices =
            instance ?: synchronized(this) {
                instance ?: LibraryServices(context).also { instance = it }
            }
    }
}

package vn.alf.pdftoolbox.library

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import vn.alf.pdftoolbox.library.model.SaveMode
import vn.alf.pdftoolbox.library.model.Settings
import vn.alf.pdftoolbox.library.model.SettingsPatch

/**
 * `save_mode` and `save_folder_uri` (design-note/schema.md section 3). Kept in DataStore, not in the
 * `document` table.
 *
 * The DataStore is created through a top-level property delegate, which guarantees one instance per file;
 * two instances on the same file would crash.
 */
private val Context.librarySettings by preferencesDataStore(name = "library_settings")

class SettingsStore(context: Context) {
    private val store = context.applicationContext.librarySettings

    suspend fun get(): Settings = store.data.first().toSettings()

    suspend fun update(patch: SettingsPatch): Settings {
        store.edit { prefs ->
            patch.saveMode?.let { prefs[SAVE_MODE] = it.value }
            patch.saveFolderUri?.let { folder ->
                val uri = folder.value
                if (uri == null) prefs.remove(SAVE_FOLDER_URI) else prefs[SAVE_FOLDER_URI] = uri
            }
        }
        return get()
    }

    private fun Preferences.toSettings(): Settings {
        // A stored value this build does not recognise falls back to the safe default instead of failing.
        val mode = this[SAVE_MODE]?.let { raw -> SaveMode.entries.firstOrNull { it.value == raw } } ?: SaveMode.APP
        return Settings(saveMode = mode, saveFolderUri = this[SAVE_FOLDER_URI])
    }

    private companion object {
        val SAVE_MODE = stringPreferencesKey("save_mode")
        val SAVE_FOLDER_URI = stringPreferencesKey("save_folder_uri")
    }
}

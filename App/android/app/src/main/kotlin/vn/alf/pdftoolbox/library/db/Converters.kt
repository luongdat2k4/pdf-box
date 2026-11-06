package vn.alf.pdftoolbox.library.db

import androidx.room.TypeConverter
import vn.alf.pdftoolbox.library.model.Storage

/**
 * Stores [Storage] as its text value. Room cannot emit the schema's `CHECK (storage IN ('app','external'))`,
 * so the constraint is enforced here: reading an unknown value throws instead of returning a guess.
 */
class Converters {
    @TypeConverter
    fun storageToString(value: Storage): String = value.value

    @TypeConverter
    fun stringToStorage(value: String): Storage = Storage.parse(value)
}

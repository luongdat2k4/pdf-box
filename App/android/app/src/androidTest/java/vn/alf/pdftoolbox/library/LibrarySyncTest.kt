package vn.alf.pdftoolbox.library

import android.os.Environment
import android.util.Log
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import vn.alf.pdftoolbox.library.db.AppDatabase
import vn.alf.pdftoolbox.library.files.*
import vn.alf.pdftoolbox.library.model.DocumentPatch
import vn.alf.pdftoolbox.library.model.ImportMode
import vn.alf.pdftoolbox.library.model.Nullable

/** Isolated DB and UUID test folder; never opens or clears the user's library. */
@RunWith(AndroidJUnit4::class)
class LibrarySyncTest {
    @Test
    fun foregroundEventsCatchupRecoveryAndPermissions() = runBlocking<Unit> {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val testId = UUID.randomUUID().toString()
        @Suppress("DEPRECATION")
        val root = File(Environment.getExternalStorageDirectory(), "Download/PDFToolbox-sync-test-$testId")
        val privateRoot = File(context.cacheDir, "sync-test-$testId")
        assertTrue(root.mkdirs())
        val empty = File(root, "previously-empty").also { assertTrue(it.mkdir()) }
        val original = File(root, "original.txt").also { it.writeText("original") }
        var access = true
        val storage = DeviceStorage(context, { listOf(root) }, { access })
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).addCallback(object : RoomDatabase.Callback() {
            override fun onCreate(database: SupportSQLiteDatabase) { AppDatabase.installRevision(database) }
        }).build()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val statuses = CopyOnWriteArrayList<LibrarySyncStatus>()
        val repo = LibraryRepository(context, db.documentDao(), AppContentStore(privateRoot), ExternalContentStore(context),
            SettingsStore(context), database = db, deviceStorage = storage)
        val filter = ExtensionFilter(listOf("txt"))
        val watcher = LibraryWatcher(context, repo, scope) { statuses += it }
        suspend fun eventually(check: suspend () -> Boolean) = withTimeout(12_000) {
            while (!check()) delay(100)
        }
        try {
            // A durable running state simulates process death during the first scan.
            repo.index.setState("running", LibraryRepository.INDEX_VERSION, null)
            val started = System.nanoTime()
            val first = async { watcher.synchronize(filter) }
            val duplicate = async { watcher.synchronize(filter) }
            assertEquals("complete", first.await().initialization)
            duplicate.await()
            assertEquals(1, statuses.count { it.phase == "indexing" && it.processed == 0 })
            val initial = repo.list().single()
            repo.update(initial.id, DocumentPatch(isFavorite = true, lastPage = 7, lastOpenedAt = Nullable(123L)))
            val imported = repo.importPicked(listOf(PickedUri(storage.uri(original), 0)), filter, ImportMode.LINK)
            assertEquals("linking an indexed physical file must not duplicate it", initial.id, imported.added.single().id)

            val counts = storage.directoriesRead to storage.filesRead
            val snapshotStart = System.nanoTime()
            repeat(10) { repo.snapshot() }
            assertEquals("DB reads must not touch filesystem metadata", counts, storage.directoriesRead to storage.filesRead)
            Log.i("LibrarySyncTest", "initialMs=${(snapshotStart - started) / 1_000_000} tenSnapshotsMs=${(System.nanoTime() - snapshotStart) / 1_000_000} observers=${first.await().observers}")

            // First document in an already watched empty folder.
            val added = File(empty, "first.txt").also { it.writeText("first document") }
            eventually { repo.list().any { it.displayName == added.name } }
            // A directory moved/created with existing content is registered recursively.
            val newFolder = File(root, "new-folder").also { assertTrue(it.mkdir()) }
            File(newFolder, "new.txt").writeText("new subtree")
            eventually { repo.list().any { it.displayName == "new.txt" } }
            original.writeText("modified original content")
            eventually { repo.get(initial.id).sizeBytes == original.length() }
            assertTrue(repo.get(initial.id).isFavorite)
            assertEquals(7, repo.get(initial.id).lastPage)
            assertEquals(123L, repo.get(initial.id).lastOpenedAt)
            added.delete()
            eventually { repo.list().none { it.displayName == added.name } }

            // No observer replay is assumed: catch up a new copy retaining an old file date.
            watcher.pause(); delay(600)
            val missed = File(empty, "copied-while-away.txt").also { it.writeText("offline"); it.setLastModified(1_600_000_000_000) }
            val indexingBefore = statuses.count { it.phase == "indexing" }
            watcher.resume()
            eventually { repo.list().any { it.displayName == missed.name } }
            assertEquals(indexingBefore, statuses.count { it.phase == "indexing" })
            delay(1000)
            watcher.synchronize(filter)
            val unchanged = storage.directoriesRead to storage.filesRead
            watcher.synchronize(filter)
            assertEquals("unchanged refresh must not reread every file", unchanged, storage.directoriesRead to storage.filesRead)

            // A stable provider key can recover an ID even if FileObserver discovered the destination first.
            val moveFile = File(root, "before-move.txt").also { it.writeText("move identity") }
            eventually { repo.list().any { it.displayName == moveFile.name } }
            val moveRecord = repo.list().first { it.displayName == moveFile.name }
            repo.update(moveRecord.id, DocumentPatch(isFavorite = true, lastPage = 11))
            repo.observeFile(moveFile, filter, "test-volume|version|123|1")
            val destination = File(newFolder, "after-move.txt")
            assertTrue(moveFile.renameTo(destination))
            repo.observeFile(destination, filter) // Discovery can win the race with MediaStore.
            repo.observeFile(destination, filter, "test-volume|version|123|1")
            val moved = repo.list().single { it.displayName == destination.name }
            assertEquals(moveRecord.id, moved.id)
            assertTrue(moved.isFavorite)
            assertEquals(11, moved.lastPage)

            access = false
            val retained = repo.list().map { it.id }
            original.delete()
            watcher.resume()
            assertEquals("permission_required", watcher.synchronize(filter).phase)
            assertEquals(retained, repo.list().map { it.id })
            access = true
            watcher.resume()
            watcher.synchronize(filter)
            eventually { repo.list().none { it.id == initial.id } }
            assertEquals(indexingBefore, statuses.count { it.phase == "indexing" })
            Log.i("LibrarySyncTest", "final directoriesRead=${storage.directoriesRead} filesRead=${storage.filesRead} tasks=${statuses.last().syncTasks}")
        } finally {
            scope.cancel()
            delay(300)
            db.close()
            // Only UUID folders created by this test are removed.
            assertTrue(root.name == "PDFToolbox-sync-test-$testId")
            root.deleteRecursively()
            privateRoot.deleteRecursively()
        }
    }
}

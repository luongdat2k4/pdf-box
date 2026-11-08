package vn.alf.pdftoolbox.library.bridge

import android.app.Activity
import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import android.provider.Settings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject
import vn.alf.pdftoolbox.library.LibraryRepository
import vn.alf.pdftoolbox.library.LibraryServices
import vn.alf.pdftoolbox.library.PickedUri
import vn.alf.pdftoolbox.library.files.ExtensionFilter
import vn.alf.pdftoolbox.library.files.FileNames
import vn.alf.pdftoolbox.library.files.MimeTypes
import vn.alf.pdftoolbox.library.files.WriteSessions
import vn.alf.pdftoolbox.library.files.LibraryWatcher
import vn.alf.pdftoolbox.library.model.DocumentEntity
import vn.alf.pdftoolbox.library.model.ErrorCode
import vn.alf.pdftoolbox.library.model.ImportMode
import vn.alf.pdftoolbox.library.model.LibraryException
import vn.alf.pdftoolbox.library.model.SaveMode

/**
 * The WebView's door into the native library (design-note/native-api.md). Deliberately thin: it parses the
 * request, calls [LibraryRepository], and turns the result or [LibraryException] into JSON or a rejection with
 * a stable error code. No business rules live here.
 *
 * Binary data never crosses the bridge as one blob. Reads are served in chunks (`readChunk`) and writes arrive
 * in chunks through a session (`writeBegin`, `writeChunk`, `writeCommit` / `writeAbort`).
 */
@CapacitorPlugin(name = "Library", permissions = [Permission(alias = "deviceStorage", strings = [
    Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE,
])])
class LibraryPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var repo: LibraryRepository
    private lateinit var sessions: WriteSessions
    private lateinit var watcher: LibraryWatcher

    override fun load() {
        val services = LibraryServices.get(context)
        repo = services.repository
        sessions = services.writeSessions
        watcher = LibraryWatcher(context, repo, scope, ::notifyRemoved)
        // A cold start through "Open with" carries the file in the launch intent.
        activity?.intent?.let { handleViewIntent(it) }
        // Housekeeping must never delay or break startup.
        scope.launch {
            try {
                val removed = repo.cleanup()
                if (removed > 0) Log.i(TAG, "Removed $removed orphaned file(s)")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Cleanup failed", e)
            }
        }
    }

    /** A warm start (app already running) through "Open with". */
    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        handleViewIntent(intent)
    }

    /**
     * Imports the file another app asked us to open and tells the WebView with a `documentOpened` event.
     * The event is retained until the WebView registers its listener, so a cold start is not lost. The file is
     * linked when the sender granted a lasting permission, otherwise copied (see [LibraryRepository.importPicked]).
     */
    private fun handleViewIntent(intent: Intent) {
        val uri = intent.data
        if (intent.action != Intent.ACTION_VIEW || uri == null) return
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return
        // Consume it so recreating the activity does not import the same file again.
        activity?.intent = Intent(Intent.ACTION_MAIN)
        val flags = intent.flags
        scope.launch {
            val event = JSObject()
            try {
                val imported = repo.importPicked(listOf(PickedUri(uri, flags)), ExtensionFilter(emptyList()), ImportMode.LINK)
                watcher.refresh()
                imported.added.firstOrNull()?.let { event.put("document", it.toJson()) }
                event.put("skipped", JSArray().also { array -> imported.skipped.forEach { array.put(it) } })
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Could not open $uri", e)
                event.put("error", (e as? LibraryException)?.message ?: "Could not open this file")
            }
            notifyListeners("documentOpened", event, true)
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
    }

    override fun handleOnResume() {
        if (::watcher.isInitialized) watcher.resume()
    }

    override fun handleOnPause() {
        if (::watcher.isInitialized) watcher.pause()
    }

    private fun notifyRemoved(ids: List<String>) {
        notifyListeners("documentsRemoved", JSObject().put("ids", JSArray(ids)), true)
    }

    // ---- library -------------------------------------------------------------------------------------------------

    @PluginMethod
    fun listDocuments(call: PluginCall) = launchCall(call) {
        watcher.refresh()
        JSObject().put("documents", repo.list().toJsonArray())
    }

    @PluginMethod
    fun updateDocument(call: PluginCall) = launchCall(call) {
        val patch = call.data.getJSONObject("patch").toDocumentPatch()
        JSObject().put("document", repo.update(call.data.requireString("id"), patch).toJson())
    }

    @PluginMethod
    fun removeDocuments(call: PluginCall) = launchCall(call) {
        val removed = mutableListOf<String>()
        try {
            repo.remove(call.data.stringList("ids")) { id ->
                removed += id
                if (removed.size >= 32) {
                    notifyRemoved(removed.toList())
                    removed.clear()
                }
            }
        } finally {
            if (removed.isNotEmpty()) notifyRemoved(removed)
            watcher.refresh()
        }
        null
    }

    // ---- import --------------------------------------------------------------------------------------------------

    private suspend fun libraryAccessJson(): JSObject {
        val (readable, prompted) = repo.libraryAccess()
        return JSObject().put("hasAccess", readable).put("prompted", prompted)
    }

    @PluginMethod
    fun getLibraryAccess(call: PluginCall) = launchCall(call) { libraryAccessJson() }

    @PluginMethod
    fun requestLibraryAccess(call: PluginCall) = launchCall(call) {
        repo.markLibraryPrompted()
        if (repo.libraryAccess().first) return@launchCall libraryAccessJson()
        withContext(Dispatchers.Main) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:${context.packageName}"))
                try {
                    startActivityForResult(call, intent, "libraryAccessReturned")
                } catch (_: ActivityNotFoundException) {
                    startActivityForResult(call, Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION), "libraryAccessReturned")
                }
            } else {
                requestPermissionForAlias("deviceStorage", call, "legacyLibraryAccessReturned")
            }
        }
        DEFERRED
    }

    @ActivityCallback
    fun libraryAccessReturned(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        // Special-access Settings does not return RESULT_OK; always check actual OS permission.
        launchCall(call) { libraryAccessJson() }
    }

    @PermissionCallback
    fun legacyLibraryAccessReturned(call: PluginCall) {
        launchCall(call) { libraryAccessJson() }
    }

    @PluginMethod
    fun scanLibrary(call: PluginCall) = launchCall(call) {
        JSObject().put("count", repo.scanLibrary(ExtensionFilter(call.data.stringList("accept"))))
    }

    @PluginMethod
    fun importFromDevice(call: PluginCall) {
        try {
            ImportMode.parse(call.data.stringOrNull("mode") ?: "copy")
        } catch (e: LibraryException) {
            reject(call, e)
            return
        }
        // The picker takes MIME types, not extensions, so it is opened for everything and filtered afterwards
        // with the extension list the WebView sent.
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.data.booleanOr("multiple", false))
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
            )
        }
        startActivityForResult(call, intent, "importPicked")
    }

    @ActivityCallback
    fun importPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val picked = pickedUris(result)
        if (picked.isEmpty()) {
            reject(call, LibraryException(ErrorCode.CANCELLED, "Cancelled"))
            return
        }
        launchCall(call) {
            val filter = ExtensionFilter(call.data.stringList("accept"))
            val mode = ImportMode.parse(call.data.stringOrNull("mode") ?: "copy")
            val imported = repo.importPicked(picked, filter, mode)
            JSObject()
                .put("added", imported.added.toJsonArray())
                .put("skipped", JSArray().also { array -> imported.skipped.forEach { array.put(it) } })
        }
    }

    private fun pickedUris(result: ActivityResult): List<PickedUri> {
        val data = result.data
        if (result.resultCode != Activity.RESULT_OK || data == null) return emptyList()
        val clip = data.clipData
        val uris = if (clip != null) List(clip.itemCount) { clip.getItemAt(it).uri } else listOfNotNull(data.data)
        return uris.map { PickedUri(it, data.flags) }
    }

    // ---- reading content -----------------------------------------------------------------------------------------

    @PluginMethod
    fun readChunk(call: PluginCall) = launchCall(call) {
        val chunk = repo.readChunk(
            call.data.requireString("id"),
            call.data.requireLong("offset"),
            call.data.requireInt("length"),
        )
        JSObject()
            .put("data", Base64.encodeToString(chunk.bytes, Base64.NO_WRAP))
            .put("eof", chunk.eof)
            .put("size", chunk.size ?: JSONObject.NULL)
    }

    // ---- writing content (chunked) -------------------------------------------------------------------------------

    @PluginMethod
    fun writeBegin(call: PluginCall) = launchCall(call) {
        JSObject().put("token", sessions.begin())
    }

    @PluginMethod
    fun writeChunk(call: PluginCall) = launchCall(call) {
        val bytes = try {
            Base64.decode(call.data.requireString("data"), Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            throw LibraryException(ErrorCode.INVALID_ARGUMENT, "data is not valid base64", e)
        }
        sessions.append(call.data.requireString("token"), bytes)
        null
    }

    @PluginMethod
    fun writeAbort(call: PluginCall) = launchCall(call) {
        sessions.abort(call.data.requireString("token"))
        null
    }

    /**
     * Finishes a write session. With `id` it replaces that document's content (`replaceContent`). With `name` it
     * creates a new document where the save mode says (`saveOutput`). `fallbackToApp: true` forces the app's own
     * storage, for when a chosen folder or picker is unavailable.
     */
    @PluginMethod
    fun writeCommit(call: PluginCall) = launchCall(call) {
        val token = call.data.requireString("token")
        val temp = sessions.file(token)
        val id = call.data.stringOrNull("id")
        if (id != null) {
            val doc = repo.replaceContent(id, temp)
            sessions.release(token)
            return@launchCall documentResult(doc)
        }

        val name = call.data.requireString("name")
        val mime = call.data.stringOrNull("mimeType")
        val mode = if (call.data.booleanOr("fallbackToApp", false)) SaveMode.APP else repo.getSettings().saveMode
        when (mode) {
            SaveMode.APP -> {
                val doc = repo.saveToApp(temp, name, mime)
                sessions.release(token)
                documentResult(doc)
            }
            SaveMode.FOLDER -> {
                val doc = repo.saveToFolder(temp, name, mime)
                temp.delete()
                sessions.release(token)
                documentResult(doc)
            }
            SaveMode.ASK -> {
                // Answered later by saveOutputPicked. The temp file stays until then (or until writeAbort).
                openCreateDocumentPicker(call, name, MimeTypes.resolve(mime, name), "saveOutputPicked")
                DEFERRED
            }
        }
    }

    @ActivityCallback
    fun saveOutputPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        val uri = data?.data
        if (result.resultCode != Activity.RESULT_OK || data == null || uri == null) {
            // The write session is kept so the WebView can retry with fallbackToApp instead of losing the result.
            reject(call, LibraryException(ErrorCode.CANCELLED, "Cancelled"))
            return
        }
        launchCall(call) {
            val token = call.data.requireString("token")
            val temp = sessions.file(token)
            val doc = repo.saveToUri(temp, call.data.requireString("name"), call.data.stringOrNull("mimeType"), uri, data.flags)
            temp.delete()
            sessions.release(token)
            documentResult(doc)
        }
    }

    // ---- export and share ----------------------------------------------------------------------------------------

    @PluginMethod
    fun exportDocument(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            launchCall(call) {
                JSObject().put("where", repo.exportToMediaStore(call.data.requireString("id")))
            }
            return
        }
        // Android 9 and older cannot write to a public folder without a storage permission; let the user choose.
        scope.launch {
            try {
                val doc = repo.get(call.data.requireString("id"))
                openCreateDocumentPicker(call, FileNames.safeForExport(doc.displayName), doc.mimeType, "exportPicked")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                fail(call, e)
            }
        }
    }

    @ActivityCallback
    fun exportPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            reject(call, LibraryException(ErrorCode.CANCELLED, "Cancelled"))
            return
        }
        launchCall(call) {
            JSObject().put("where", repo.exportToUri(call.data.requireString("id"), uri))
        }
    }

    @PluginMethod
    fun shareDocument(call: PluginCall) = launchCall(call) {
        val target = repo.prepareShare(call.data.requireString("id"))
        val send = Intent(Intent.ACTION_SEND).apply {
            type = target.mimeType
            putExtra(Intent.EXTRA_STREAM, target.uri)
            putExtra(Intent.EXTRA_SUBJECT, target.name)
            // The clip data carries the read grant through the chooser to whichever app the user picks.
            clipData = ClipData.newRawUri(target.name, target.uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        withContext(Dispatchers.Main) { activity.startActivity(Intent.createChooser(send, target.name)) }
        null
    }

    // ---- settings ------------------------------------------------------------------------------------------------

    @PluginMethod
    fun getSettings(call: PluginCall) = launchCall(call) {
        repo.getSettings().toJson()
    }

    @PluginMethod
    fun setSettings(call: PluginCall) = launchCall(call) {
        repo.updateSettings(call.data.toSettingsPatch()).toJson()
    }

    /** Lets the user choose the save folder; the app keeps access and switches to folder mode. */
    @PluginMethod
    fun pickSaveFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PREFIX_URI_PERMISSION,
            )
        }
        startActivityForResult(call, intent, "saveFolderPicked")
    }

    @ActivityCallback
    fun saveFolderPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        val uri = data?.data
        if (result.resultCode != Activity.RESULT_OK || data == null || uri == null) {
            reject(call, LibraryException(ErrorCode.CANCELLED, "Cancelled"))
            return
        }
        launchCall(call) { repo.setSaveFolder(uri, data.flags).toJson() }
    }

    // ---- helpers -------------------------------------------------------------------------------------------------

    private fun documentResult(doc: DocumentEntity): JSObject =
        JSObject().put("document", doc.toJson())

    /** Opens the system "create document" picker from the main thread. */
    private fun openCreateDocumentPicker(call: PluginCall, name: String, mime: String, callbackName: String) {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime
            putExtra(Intent.EXTRA_TITLE, name)
        }
        activity.runOnUiThread { startActivityForResult(call, intent, callbackName) }
    }

    /**
     * Runs [block] off the main thread and settles [call] with its result. A block returns the JSON to send,
     * `null` for an empty success, or [DEFERRED] when something else (a picker callback) will settle the call.
     */
    private fun launchCall(call: PluginCall, block: suspend () -> JSObject?) {
        scope.launch {
            try {
                val result = block()
                if (result?.has("document") == true || result?.has("added") == true) watcher.refresh()
                when {
                    result === DEFERRED -> Unit
                    result == null -> call.resolve()
                    else -> call.resolve(result)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                fail(call, e)
            }
        }
    }

    private fun fail(call: PluginCall, e: Exception) {
        when (e) {
            is LibraryException -> reject(call, e)
            is JSONException -> call.reject(e.message ?: "Malformed request", ErrorCode.INVALID_ARGUMENT.name)
            else -> {
                Log.e(TAG, "Unexpected failure", e)
                call.reject(e.message ?: "I/O error", ErrorCode.IO_ERROR.name)
            }
        }
    }

    private fun reject(call: PluginCall, e: LibraryException) = call.reject(e.message, e.code.name, e)

    private companion object {
        const val TAG = "LibraryPlugin"

        /** Returned by a block that has handed the call to a picker callback, which will settle it. */
        val DEFERRED = JSObject()
    }
}

package vn.alf.pdftoolbox.library.files

import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import vn.alf.pdftoolbox.library.model.invalid

/**
 * Receives a file from the WebView in pieces (design-note/native-api.md section 5). Each session writes to its own
 * temp file; a later commit turns it into a document (`saveOutput`) or replaces a document's content.
 *
 * Splitting a large file into chunks avoids sending one huge base64 string across the bridge.
 */
class WriteSessions(
    private val store: AppContentStore,
    private val newToken: () -> String = { UUID.randomUUID().toString() },
) {
    private val sessions = ConcurrentHashMap<String, File>()

    /** Starts a session and returns its token. */
    fun begin(): String {
        val token = newToken()
        sessions[token] = store.newTemp()
        return token
    }

    /** Appends [bytes] to the session's file. Chunks must arrive in order; the WebView sends them one at a time. */
    fun append(token: String, bytes: ByteArray) {
        val file = file(token)
        FileOutputStream(file, true).use { it.write(bytes) }
    }

    /** The session's temp file. Throws INVALID_ARGUMENT for an unknown or finished token. */
    fun file(token: String): File = sessions[token] ?: throw invalid("Unknown write token")

    /** Ends the session without deleting the file, because the caller has moved or consumed it. */
    fun release(token: String) {
        sessions.remove(token)
    }

    /** Ends the session and deletes whatever was written. Unknown tokens are ignored so abort is always safe to call. */
    fun abort(token: String) {
        sessions.remove(token)?.delete()
    }

    /** Number of open sessions (for tests and diagnostics). */
    fun openCount(): Int = sessions.size
}

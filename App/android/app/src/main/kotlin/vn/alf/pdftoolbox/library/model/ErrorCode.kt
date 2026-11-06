package vn.alf.pdftoolbox.library.model

/**
 * Error codes shared with the WebView (design-note/native-api.md section 3). The enum name is sent as the
 * rejection code, so renaming a constant is a breaking change for the JavaScript side.
 */
enum class ErrorCode {
    /** No such document, or its content is gone. */
    NOT_FOUND,

    /** An `external` document whose URI permission was lost. */
    PERMISSION_LOST,

    /** An `external` document that cannot be written (the UI offers "save a copy"). */
    NO_WRITE_PERMISSION,

    /** The file type is not in the `accept` list the WebView passed. */
    UNSUPPORTED_TYPE,

    /** The user closed a picker. Not a failure; the UI shows nothing. */
    CANCELLED,

    /** Any other read or write failure. */
    IO_ERROR,

    /** A malformed request (unknown token, bad field). Added beyond the original contract. */
    INVALID_ARGUMENT,
}

class LibraryException(
    val code: ErrorCode,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

fun notFound(what: String): LibraryException = LibraryException(ErrorCode.NOT_FOUND, "$what not found")

fun invalid(message: String): LibraryException = LibraryException(ErrorCode.INVALID_ARGUMENT, message)

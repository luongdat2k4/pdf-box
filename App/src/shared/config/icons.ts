// Offline icons: each Lucide icon is bundled individually (no network lookups).
import arrowLeft from '@iconify-icons/lucide/arrow-left'
import arrowUp from '@iconify-icons/lucide/arrow-up'
import arrowDown from '@iconify-icons/lucide/arrow-down'
import check from '@iconify-icons/lucide/check'
import chevronRight from '@iconify-icons/lucide/chevron-right'
import circleCheck from '@iconify-icons/lucide/circle-check'
import download from '@iconify-icons/lucide/download'
import ellipsisVertical from '@iconify-icons/lucide/ellipsis-vertical'
import camera from '@iconify-icons/lucide/camera'
import file from '@iconify-icons/lucide/file'
import fileCode from '@iconify-icons/lucide/file-code'
import fileImage from '@iconify-icons/lucide/file-image'
import fileSpreadsheet from '@iconify-icons/lucide/file-spreadsheet'
import fileText from '@iconify-icons/lucide/file-text'
import filesIcon from '@iconify-icons/lucide/files'
import highlighter from '@iconify-icons/lucide/highlighter'
import history from '@iconify-icons/lucide/history'
import house from '@iconify-icons/lucide/house'
import image from '@iconify-icons/lucide/image'
import images from '@iconify-icons/lucide/images'
import info from '@iconify-icons/lucide/info'
import loader from '@iconify-icons/lucide/loader-circle'
import lock from '@iconify-icons/lucide/lock'
import lockOpen from '@iconify-icons/lucide/lock-open'
import merge from '@iconify-icons/lucide/merge'
import panelLeft from '@iconify-icons/lucide/panel-left-open'
import pencil from '@iconify-icons/lucide/pencil'
import penLine from '@iconify-icons/lucide/pen-line'
import plus from '@iconify-icons/lucide/plus'
import presentation from '@iconify-icons/lucide/presentation'
import redo from '@iconify-icons/lucide/redo-2'
import save from '@iconify-icons/lucide/save'
import scanLine from '@iconify-icons/lucide/scan-line'
import scissors from '@iconify-icons/lucide/scissors'
import search from '@iconify-icons/lucide/search'
import share from '@iconify-icons/lucide/share-2'
import star from '@iconify-icons/lucide/star'
import strike from '@iconify-icons/lucide/strikethrough'
import trash from '@iconify-icons/lucide/trash-2'
import triangleAlert from '@iconify-icons/lucide/triangle-alert'
import underline from '@iconify-icons/lucide/underline'
import undo from '@iconify-icons/lucide/undo-2'
import upload from '@iconify-icons/lucide/upload'
import x from '@iconify-icons/lucide/x'
import zoomIn from '@iconify-icons/lucide/zoom-in'
import zoomOut from '@iconify-icons/lucide/zoom-out'

export const icons = {
  back: arrowLeft, up: arrowUp, down: arrowDown, check, next: chevronRight, ok: circleCheck,
  download, more: ellipsisVertical, camera, file, code: fileCode, fileImage, excel: fileSpreadsheet, doc: fileText,
  files: filesIcon, highlight: highlighter, history, home: house, image, images, info, loading: loader,
  lock, unlock: lockOpen, merge, thumbs: panelLeft, rename: pencil, pen: penLine, plus, ppt: presentation,
  redo, save, scan: scanLine, split: scissors, search, share, star, strike, trash, warn: triangleAlert,
  underline, undo, upload, close: x, zoomIn, zoomOut,
} as const

export type IconName = keyof typeof icons

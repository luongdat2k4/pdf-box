import { parseSpreadsheet } from '../lib/spreadsheet'

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage({ book: parseSpreadsheet(event.data) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}

/** Isolated, inert preview: file-supplied links/scripts and external resource requests cannot run. */
export function slideDocument(svg: string): string {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob: data:; font-src blob: data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:white}body>svg{display:block;width:100%;height:100%}</style>' +
    '</head><body>' + svg + '</body></html>'
}

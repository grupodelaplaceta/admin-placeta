import PDFDocument from 'pdfkit';
const origAddPage = PDFDocument.prototype.addPage;
let pageCount = 0;
let pageStacks = [];
PDFDocument.prototype.addPage = function(...args) {
  pageCount++;
  const stack = new Error().stack.split('\n').slice(2,5).join(' -> ');
  pageStacks.push({count: pageCount, stack});
  console.log(`addPage #${pageCount}: ${stack}`);
  return origAddPage.apply(this, args);
};

const mod = await import('./src/config/documentos.js');
const buf = await mod.generarPDF('banco', {
  id:'t', tipo:'cambio-tipo-cuenta', titulo:'T',
  datos:{ titular:'U', dip:'123', iban:'E', tipoAnterior:'A', tipoNuevo:'B', motivo:'t', fecha:new Date().toISOString() },
  estado:'final', hash:'a'
});
const pages = (buf.toString().match(/\/Type\s*\/Page\b/g) || []).length;
console.log(`\nTotal addPage calls: ${pageCount}, PDF pages: ${pages}`);

/* Local PDF presentation only. Never changes carrier data, identifiers or barcodes. */
((root) => {
  'use strict';
  const scriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : '';
  let library;
  async function loadLibrary() {
    if (root.PDFLib) return root.PDFLib;
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/pdf-lib.min.js', scriptUrl).href;
      script.onload = () => root.PDFLib ? resolve(root.PDFLib) : reject(Error('PDF_LAYOUT_LIBRARY'));
      script.onerror = () => reject(Error('PDF_LAYOUT_LIBRARY'));
      document.head.appendChild(script);
    });
    return library;
  }
  function cmap(raw) {
    // The supported carrier template uses 16-bit Identity-H and single bfranges.
    const map = new Map();
    for (const section of raw.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const m of section[1].matchAll(/<([0-9a-f]{4})>\s*<([0-9a-f]{4})>\s*<([0-9a-f]{4})>/gi)) {
        const a = parseInt(m[1], 16), b = parseInt(m[2], 16), u = parseInt(m[3], 16);
        if (b - a > 65535) throw Error('PDF_LAYOUT_CMAP');
        for (let n = a; n <= b; n++) map.set(n, String.fromCharCode(u + n - a));
      }
    }
    return map;
  }
  const phonePattern = /^0[0-9*#,\-]{6,29}$/;
  function planStream(source, maps) {
    let font = '', size = 0;
    const records = [];
    const num = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
    const td = new RegExp('(' + num + ')\\s+(' + num + ')\\s+Td\\s*<([0-9a-f]+)>\\s*Tj', 'gi');
    for (const event of source.matchAll(/\/(F\d+)\s+([\d.]+)\s+Tf|BT\b[\s\S]*?\bET/g)) {
      if (event[1]) { font = event[1]; size = Number(event[2]); continue; }
      const block = event[0];
      for (const f of block.matchAll(/\/(F\d+)\s+([\d.]+)\s+Tf/g)) { font = f[1]; size = Number(f[2]); }
      const matches = [...block.matchAll(td)];
      if (matches.length !== 1 || (block.match(/\bTd\b/g) || []).length !== 1 || (block.match(/\bTj\b/g) || []).length !== 1) continue;
      const m = matches[0], map = maps.get(font);
      if (!map || m[3].length % 4) continue;
      let text = '';
      for (let i = 0; i < m[3].length; i += 4) text += map.get(parseInt(m[3].slice(i, i + 4), 16)) ?? '\uFFFD';
      records.push({ text, x: Number(m[1]), y: Number(m[2]), size, start: event.index + m.index, end: event.index + m.index + m[1].length });
    }
    const moves = [];
    for (const r of records.filter(r => phonePattern.test(r.text))) {
      if (r.size !== 9) throw Error('PDF_LAYOUT_UNSUPPORTED');
      // Names occupy the line exactly 10pt above the telephone in API1.9.4 A4-2.
      const names = records.filter(n => Math.abs(n.y - r.y - 10) < 0.01 && n.size === r.size && n.x <= r.x && r.x - n.x <= 150 && /[\u3400-\u9fffA-Za-z]/.test(n.text) && !/[\r\n]/.test(n.text)).sort((a, b) => b.x - a.x);
      if (!names.length) throw Error('PDF_LAYOUT_UNSUPPORTED');
      const n = names[0];
      if (![34, 230, 212, 336].includes(n.x) || (n.x === 212 && r.text.length > 26)) throw Error('PDF_LAYOUT_UNSUPPORTED');
      if (r.x !== n.x) moves.push({ start: r.start, end: r.end, x: n.x, oldX: r.x, y: r.y });
    }
    let changed = source;
    for (const m of moves.slice().reverse()) changed = changed.slice(0, m.start) + m.x + changed.slice(m.end);
    return { source: changed, moves, phoneCount: records.filter(r => phonePattern.test(r.text)).length };
  }
  async function transform(input, suppliedLibrary) {
    const lib = suppliedLibrary || await loadLibrary();
    const { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } = lib;
    const doc = await PDFDocument.load(input, { updateMetadata: false });
    const report = { pages: doc.getPageCount(), moved: 0, phones: 0, moves: [] };
    for (const [pageIndex, page] of doc.getPages().entries()) {
      const size = page.getSize();
      if (Math.abs(size.width - 595) > 1 || Math.abs(size.height - 842) > 1 || page.getRotation().angle !== 0) throw Error('PDF_LAYOUT_UNSUPPORTED');
      const resources = page.node.Resources(), fonts = resources.lookup(PDFName.of('Font'));
      const maps = new Map();
      for (const key of fonts.keys()) {
        const f = fonts.lookup(key), toUnicode = f.lookup(PDFName.of('ToUnicode'));
        if (f.get(PDFName.of('Encoding'))?.toString() !== '/Identity-H' || !(toUnicode instanceof PDFRawStream)) continue;
        maps.set(key.toString().slice(1), cmap(new TextDecoder('latin1').decode(decodePDFRawStream(toUnicode).decode())));
      }
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
      const plans = streams.map(stream => {
        if (!(stream instanceof PDFRawStream)) throw Error('PDF_LAYOUT_UNSUPPORTED');
        const raw = decodePDFRawStream(stream).decode();
        if (raw.some(byte => byte > 127)) throw Error('PDF_LAYOUT_UNSUPPORTED');
        return planStream(new TextDecoder().decode(raw), maps);
      });
      const pagePhones = plans.reduce((n, p) => n + p.phoneCount, 0);
      // Four copies per parcel; fail closed on unexpected layouts instead of guessing.
      if (pagePhones !== 8 && pagePhones !== 16) throw Error('PDF_LAYOUT_UNSUPPORTED');
      report.phones += pagePhones;
      const refs = plans.map(plan => {
        report.moved += plan.moves.length;
        report.moves.push(...plan.moves.map(m => ({ page: pageIndex, ...m })));
        return doc.context.register(doc.context.flateStream(plan.source));
      });
      page.node.set(PDFName.of('Contents'), doc.context.obj(refs));
    }
    return { bytes: await doc.save({ useObjectStreams: false }), report };
  }
  async function prepare(result) {
    try {
      const input = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
      const { bytes } = await transform(input);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return { ...result, pdfBase64: btoa(binary), phoneLayoutAdjusted: true };
    } catch (_) {
      // Unknown templates remain byte-for-byte original; UI must show the fallback.
      return { ...result, phoneLayoutAdjusted: false };
    }
  }
  root.BlackCatPdfLayout = { transform, prepare };
})(globalThis);

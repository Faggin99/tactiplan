/* Paginador dos relatórios (roda DENTRO do Chromium antes do page.pdf).
   Cada <section class="page"> tem um .body com blocos. Quando um bloco não
   cabe, ele vai para uma página de continuação (header compacto, clonada de
   <template id="tpl-cont">). Blocos com data-split="<seletor>" (tabelas,
   grade de fotos, lista de blocos da ficha) são partidos item a item, e o
   pedaço seguinte leva o mesmo cabeçalho (thead / título da seção).
   No fim numera os rodapés "n / total" e marca window.__reportReady. */
(function () {
  var TOL = 1;

  function overflows(body) { return body.scrollHeight > body.clientHeight + TOL; }

  function makeContinuation(after) {
    var tpl = document.getElementById('tpl-cont');
    var page = tpl.content.firstElementChild.cloneNode(true);
    var sub = after.getAttribute('data-subtitle') || '';
    page.setAttribute('data-subtitle', sub);
    var slot = page.querySelector('[data-slot="subtitle"]');
    if (slot) slot.textContent = sub ? '· ' + sub : '';
    var extra = after.querySelector('[data-slot="footer-extra"]');
    var extraDst = page.querySelector('[data-slot="footer-extra"]');
    if (extra && extraDst) extraDst.innerHTML = extra.innerHTML;
    after.parentNode.insertBefore(page, after.nextSibling);
    return page;
  }

  // Tenta partir o bloco `b` (já no body, transbordando). Devolve o clone com o
  // resto dos itens, ou null se não deu para partir.
  function trySplit(body, b) {
    var sel = b.getAttribute('data-split');
    if (!sel) return null;
    var items = Array.prototype.slice.call(b.querySelectorAll(sel));
    if (items.length < 2) return null;
    var moved = [];
    while (overflows(body) && items.length - moved.length > 1) {
      var it = items[items.length - 1 - moved.length];
      moved.unshift({ el: it, parent: it.parentNode, next: it.nextSibling });
      it.parentNode.removeChild(it);
    }
    if (overflows(body) || moved.length === 0) {
      // nem com 1 item coube: devolve tudo e trata como bloco inteiro
      for (var i = 0; i < moved.length; i++) moved[i].parent.appendChild(moved[i].el);
      return null;
    }
    var rest = b.cloneNode(true);
    rest.classList.add('cont');
    var restItems = rest.querySelectorAll(sel);
    var parent = moved[0].parent;
    // localiza no clone o mesmo contêiner dos itens (pelo caminho de índices)
    var pathIdx = [];
    var n = parent;
    while (n && n !== b) {
      pathIdx.unshift(Array.prototype.indexOf.call(n.parentNode.children, n));
      n = n.parentNode;
    }
    var restParent = rest;
    for (var k = 0; k < pathIdx.length; k++) restParent = restParent.children[pathIdx[k]];
    for (var r = 0; r < restItems.length; r++) restItems[r].parentNode.removeChild(restItems[r]);
    for (var m = 0; m < moved.length; m++) restParent.appendChild(moved[m].el);
    var more = rest.querySelector('[data-cont-label]');
    if (more) more.textContent = more.getAttribute('data-cont-label');
    return rest;
  }

  function paginate() {
    var page = document.querySelector('.page');
    var guard = 0;
    while (page && guard++ < 200) {
      var body = page.querySelector('.body');
      var blocks = Array.prototype.slice.call(body.children);
      for (var i = 0; i < blocks.length; i++) body.removeChild(blocks[i]);
      var carry = [];
      for (var j = 0; j < blocks.length; j++) {
        var b = blocks[j];
        body.appendChild(b);
        if (!overflows(body)) continue;
        var rest = trySplit(body, b);
        if (rest) {
          carry = [rest].concat(blocks.slice(j + 1));
          break;
        }
        if (body.children.length > 1) {
          body.removeChild(b);
          carry = blocks.slice(j);
          break;
        }
        // bloco sozinho maior que a página: fica (cortado) e segue
      }
      if (carry.length) {
        var cont = makeContinuation(page);
        var cbody = cont.querySelector('.body');
        for (var c = 0; c < carry.length; c++) cbody.appendChild(carry[c]);
      }
      var nxt = page.nextElementSibling;
      while (nxt && !nxt.classList.contains('page')) nxt = nxt.nextElementSibling;
      page = nxt;
    }
    var pages = document.querySelectorAll('.page');
    for (var p = 0; p < pages.length; p++) {
      var slot = pages[p].querySelector('[data-slot="pageno"]');
      if (slot) slot.textContent = (p + 1) + ' / ' + pages.length;
    }
    window.__reportPages = pages.length;
  }

  function waitImages() {
    var imgs = Array.prototype.slice.call(document.images);
    return Promise.all(imgs.map(function (img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (res) { img.onload = img.onerror = function () { res(); }; });
    }));
  }

  window.__reportReady = false;
  Promise.all([document.fonts.ready, waitImages()]).then(function () {
    try { paginate(); } catch (e) { window.__reportError = String(e && e.stack || e); }
    window.__reportReady = true;
  });
})();

(() => {
  const transcript = globalThis.SlideTranscript;
  const player = document.querySelector('#player');
  const image = document.querySelector('#slide-image');
  const previous = document.querySelector('#previous');
  const next = document.querySelector('#next');
  const fullscreen = document.querySelector('#fullscreen');
  const message = document.querySelector('#player-message');
  const transcriptList = document.querySelector('#slide-transcript');
  const titles = ['開場', '現行作業', '經營痛點', '網站構想', '開發歷程', '版本與測試', '網站 Demo', '學習心得'];
  let page;

  function render() {
    page = /^[1-8]$/.test(location.hash.slice(1)) ? Number(location.hash.slice(1)) : 1;
    image.src = './slides/slide-' + page + '.png';
    image.alt = '第 ' + page + ' 頁：' + titles[page - 1];
    document.querySelector('#audit-exhibit').hidden = page !== 5;
    document.querySelector('#page-status').textContent = page + ' / ' + titles.length + '　' + titles[page - 1];
    document.querySelector('#history-links').hidden = page !== 6;
    document.querySelector('#demo-links').hidden = page !== 7;
    previous.disabled = page === 1;
    next.disabled = page === titles.length;
    transcriptList.replaceChildren(...transcript[page - 1].map(line => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
  }

  function go(offset) {
    const destination = page + offset;
    if (destination >= 1 && destination <= titles.length) location.hash = String(destination);
  }

  previous.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  addEventListener('hashchange', render);
  addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      go(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  fullscreen.disabled = !document.fullscreenEnabled;
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await player.requestFullscreen();
      message.textContent = '';
    } catch {
      message.textContent = '目前瀏覽器無法進入全螢幕。';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement ? '退出全螢幕' : '全螢幕';
  });
  render();
})();

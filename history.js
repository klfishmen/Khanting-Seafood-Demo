'use strict';

document.getElementById('copy-history').addEventListener('click', async () => {
  const url = document.getElementById('history-url');
  const status = document.getElementById('history-copy-status');
  try {
    await navigator.clipboard.writeText(url.value);
    status.textContent = '已複製公開網址。';
  } catch {
    url.select();
    status.textContent = '已選取網址，可按 Ctrl+C 或使用裝置的複製功能。';
  }
});

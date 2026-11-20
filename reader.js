(() => {
  'use strict';

  const chapter = document.querySelector('#chapter');
  const player = document.querySelector('.player');
  const caption = document.querySelector('#nowPlaying');
  const translation = document.querySelector('#translation');
  const replay = document.querySelector('#replay');
  const stop = document.querySelector('#stop');
  const rate = document.querySelector('#rate');
  const status = document.querySelector('#playback-status');
  const audio = new Audio();
  let selected;
  let playbackRequest = 0;

  function pause() {
    playbackRequest += 1;
    audio.pause();
  }

  window.InteractiveNotesPOC = { pause };

  async function play() {
    pause();
    const request = playbackRequest;
    status.textContent = '';
    if (!selected?.audio) {
      status.textContent = '此句的朗读音频尚未添加。';
      return;
    }
    try {
      const url = new URL(selected.audio, document.baseURI).href;
      if (audio.src !== url) audio.src = url;
      audio.currentTime = 0;
      audio.playbackRate = Number(rate.value);
      await audio.play();
    } catch {
      if (request === playbackRequest) status.textContent = '音频暂时无法播放，请再试一次。';
    }
  }

  function select(sentence, control) {
    selected?.control.setAttribute('aria-pressed', 'false');
    selected = { ...sentence, control };
    control.setAttribute('aria-pressed', 'true');
    caption.lang = 'en';
    caption.textContent = sentence.en;
    translation.textContent = sentence.zh;
    replay.disabled = false;
    stop.disabled = false;
    window.dispatchEvent(new CustomEvent('notes-select', {
      detail: { id: control.id, text: sentence.en },
    }));
    play();
  }

  let index = 0;
  for (const paragraph of window.chapter) {
    const block = document.createElement('p');
    for (const sentence of paragraph) {
      const control = document.createElement('span');
      control.id = 'sentence-' + ++index;
      control.className = 'sentence';
      control.tabIndex = 0;
      control.setAttribute('role', 'button');
      control.textContent = sentence.en;
      control.setAttribute('aria-pressed', 'false');
      control.addEventListener('click', () => select(sentence, control));
      control.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(sentence, control);
        }
      });
      if (block.childNodes.length) block.append(' ');
      block.append(control);
    }
    chapter.append(block);
  }

  replay.addEventListener('click', () => {
    if (selected) select(selected, selected.control);
  });
  stop.addEventListener('click', pause);
  rate.addEventListener('change', () => { audio.playbackRate = Number(rate.value); });
  window.addEventListener('pagehide', pause);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--player-height', player.offsetHeight + 'px');
  }).observe(player);
})();

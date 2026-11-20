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
  const wordPattern = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  let selected;
  let highlightedPhrase;
  let heardWords;
  let playbackRequest = 0;

  function pause() {
    playbackRequest += 1;
    audio.pause();
  }

  function showTranslation() {
    const text = selected.zh;
    if (!highlightedPhrase) {
      translation.textContent = text;
      return;
    }
    const [, , ...ranges] = highlightedPhrase;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (let index = 0; index < ranges.length; index += 2) {
      const start = ranges[index];
      const end = ranges[index + 1];
      const mark = document.createElement('mark');
      mark.className = 'phrase-translation';
      mark.textContent = text.slice(start, end);
      fragment.append(text.slice(offset, start), mark);
      offset = end;
    }
    fragment.append(text.slice(offset));
    translation.replaceChildren(fragment);
  }

  function showCaption() {
    const script = selected.en;
    const words = Array.from(script.matchAll(wordPattern));
    const fragment = document.createDocumentFragment();
    let wordIndex = 0;
    function appendRange(parent, start, end) {
      let offset = start;
      while (wordIndex < words.length && words[wordIndex].index < end) {
        const word = words[wordIndex];
        parent.append(script.slice(offset, word.index));
        const span = document.createElement('span');
        span.textContent = word[0];
        if (heardWords?.[wordIndex]?.heardClear) span.className = 'notes-heard';
        parent.append(span);
        offset = word.index + word[0].length;
        wordIndex += 1;
      }
      parent.append(script.slice(offset, end));
    }
    let offset = 0;
    for (const phrase of selected.links || []) {
      const [start, end] = phrase;
      appendRange(fragment, offset, start);
      const button = document.createElement('span');
      button.className = 'phrase';
      button.tabIndex = 0;
      button.setAttribute('role', 'button');
      button.setAttribute('aria-pressed', String(phrase === highlightedPhrase));
      appendRange(button, start, end);
      function toggle() {
        highlightedPhrase = phrase === highlightedPhrase ? undefined : phrase;
        for (const other of caption.querySelectorAll('.phrase[aria-pressed=true]')) {
          other.setAttribute('aria-pressed', 'false');
        }
        button.setAttribute('aria-pressed', String(Boolean(highlightedPhrase)));
        showTranslation();
      }
      button.addEventListener('click', toggle);
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
      fragment.append(button);
      offset = end;
    }
    appendRange(fragment, offset, script.length);
    caption.replaceChildren(fragment);
  }

  window.InteractiveNotesPOC = {
    pause,
    renderFeedback(words) {
      if (!selected) return false;
      heardWords = words;
      showCaption();
      return true;
    },
  };

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
    if (selected?.control !== control) highlightedPhrase = undefined;
    selected = { ...sentence, control };
    heardWords = undefined;
    control.setAttribute('aria-pressed', 'true');
    caption.lang = 'en';
    showCaption();
    showTranslation();
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

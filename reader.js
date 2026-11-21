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
    if (!highlightedPhrase || highlightedPhrase.length === 2) {
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
    function phraseControl(phrase) {
      const button = document.createElement('span');
      button.className = phrase.length > 2 ? 'phrase' : 'phrase pronunciation-only';
      button.tabIndex = 0;
      button.setAttribute('role', 'button');
      button.setAttribute('aria-pressed', String(phrase[0] === highlightedPhrase?.[0]));
      function activate() {
        highlightedPhrase = phrase;
        caption.querySelector('.phrase[aria-pressed=true]')?.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
        showTranslation();
        window.dispatchEvent(new Event('notes-playback'));
        playPhrase(script.slice(phrase[0], phrase[1]), phrase.length > 2);
      }
      button.addEventListener('click', activate);
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
      return button;
    }
    function appendRange(parent, start, end, pronounceWords = false) {
      let offset = start;
      while (wordIndex < words.length && words[wordIndex].index < end) {
        const word = words[wordIndex];
        parent.append(script.slice(offset, word.index));
        const span = document.createElement('span');
        span.textContent = word[0];
        if (heardWords?.[wordIndex]?.heardClear) span.className = 'notes-heard';
        if (pronounceWords) {
          const button = phraseControl([word.index, word.index + word[0].length]);
          button.append(span);
          parent.append(button);
        } else {
          parent.append(span);
        }
        offset = word.index + word[0].length;
        wordIndex += 1;
      }
      parent.append(script.slice(offset, end));
    }
    let offset = 0;
    for (const phrase of selected.links || []) {
      const [start, end] = phrase;
      appendRange(fragment, offset, start, true);
      const button = phraseControl(phrase);
      appendRange(button, start, end);
      fragment.append(button);
      offset = end;
    }
    appendRange(fragment, offset, script.length, true);
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

  async function play(source, hint = '') {
    pause();
    const request = playbackRequest;
    status.textContent = hint;
    try {
      const url = new URL(source, document.baseURI).href;
      if (audio.src !== url) audio.src = url;
      audio.currentTime = 0;
      audio.playbackRate = Number(rate.value);
      await audio.play();
    } catch {
      if (request === playbackRequest) status.textContent = '音频暂时无法播放，请再试一次。';
    }
  }

  function playPhrase(text, hasTranslation) {
    const key = text.replaceAll('’', "'").trim().replace(/\s+/g, ' ').toLowerCase();
    const clip = window.wordAudio?.[key];
    if (!clip) {
      pause();
      status.textContent = '此处暂无单独的发音。';
      return;
    }
    play('audio/words/' + clip + '.mp3', hasTranslation ? '' : '此处暂无单独对应的中文。');
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
    play(selected.audio);
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

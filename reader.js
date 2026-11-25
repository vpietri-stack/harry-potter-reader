(() => {
  'use strict';

  const chapter = document.querySelector('#chapter');
  const chapterFooter = document.querySelector('#chapter-footer');
  const chapterTitleEl = document.querySelector('.book-header h1');
  const chapterSubtitleEl = document.querySelector('.book-header .chapter');
  const chapterTabs = Array.from(document.querySelectorAll('.chapter-tab'));
  const player = document.querySelector('.player');
  const caption = document.querySelector('#nowPlaying');
  const translation = document.querySelector('#translation');
  const replay = document.querySelector('#replay');
  const stop = document.querySelector('#stop');
  const rate = document.querySelector('#rate');
  const status = document.querySelector('#playback-status');
  const partsRow = document.querySelector('#sentence-parts');
  const partButtons = document.querySelector('#part-buttons');
  const audio = new Audio();
  audio.preservesPitch = true;
  const wordPattern = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  const lastChapterKey = 'harry-potter-reader:last-chapter';

  const CHAPTERS = {
    1: {
      id: 1,
      titleEn: 'The Boy Who Lived',
      titleZh: '第一章 · 大难不死的男孩',
      ariaLabel: '第一章正文',
      data: () => window.chapter || [],
      parts: () => window.sentenceParts || {},
      partsDir: 'audio/parts/',
      wordAudioMode: 'local',
      bookmarkKey: 'harry-potter-reader:chapter-1:last-sentence',
    },
    2: {
      id: 2,
      titleEn: 'The Vanishing Glass',
      titleZh: '第二章 · 悄然消失的玻璃',
      ariaLabel: '第二章正文',
      data: () => window.chapter2 || [],
      parts: () => window.sentenceParts2 || {},
      partsDir: 'audio/parts-ch2/',
      wordAudioMode: 'live-baidu',
      bookmarkKey: 'harry-potter-reader:chapter-2:last-sentence',
    },
  };

  let currentChapter = CHAPTERS[1];
  let selected;
  let highlightedPhrase;
  let heardWords;
  let activePart;
  let playbackRequest = 0;
  let baiduTimeoutId = 0;

  function clearBaiduFallback() {
    if (baiduTimeoutId) {
      clearTimeout(baiduTimeoutId);
      baiduTimeoutId = 0;
    }
    audio.onplaying = null;
    audio.onerror = null;
  }

  function pause() {
    playbackRequest += 1;
    clearBaiduFallback();
    audio.pause();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  function inActivePart(offset) {
    return Boolean(activePart && activePart[0] <= offset && offset < activePart[1]);
  }

  function setActivePart(part) {
    activePart = part;
    heardWords = undefined;
    for (const word of caption.querySelectorAll('[data-word-start]')) {
      word.classList.remove('notes-heard', 'notes-grade-yellow', 'notes-grade-red');
      word.removeAttribute('title');
      word.classList.toggle('playing-part', inActivePart(Number(word.dataset.wordStart)));
    }
    for (const button of partButtons.children) {
      button.setAttribute('aria-pressed', String(button.dataset.file === part?.[2]));
    }
  }

  function showParts() {
    const parts = currentChapter.parts()[selected.audio] || [];
    partsRow.hidden = parts.length < 2;
    partButtons.replaceChildren();
    parts.forEach((part, index) => {
      const [start, end, file] = part;
      const label = selected.en.slice(start, end).trim();
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '▶ ' + (index + 1);
      button.title = label;
      button.dataset.file = file;
      button.setAttribute('aria-label', '播放第 ' + (index + 1) + ' 段 ' + label);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (activePart !== part) setActivePart(part);
        window.dispatchEvent(new CustomEvent('notes-select', {
          detail: { id: 'ch' + currentChapter.id + '-' + selected.control.id + '-part-' + (index + 1), text: label, partNumber: index + 1 },
        }));
        play(currentChapter.partsDir + file);
      });
      partButtons.append(button);
    });
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
    const partWordOffset = activePart ? words.filter(word => word.index < activePart[0]).length : 0;
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
        const w = (!activePart || inActivePart(word.index)) ? heardWords?.[wordIndex - partWordOffset] : null;
        if (w) {
          const cls = [];
          if (w.heardClear) cls.push('notes-heard');
          if (w.grade === 'yellow') cls.push('notes-grade-yellow');
          else if (w.grade === 'red') cls.push('notes-grade-red');
          if (cls.length) span.className = cls.join(' ');
          if ((w.grade === 'yellow' || w.grade === 'red') && w.tip) span.title = w.tip;
        }
        span.dataset.wordStart = word.index;
        span.classList.toggle('playing-part', inActivePart(word.index));
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

  function speakBrowserFallback(text, request) {
    if (request !== playbackRequest) return;
    if (!('speechSynthesis' in window)) {
      status.textContent = '音频暂时无法播放，请再试一次。';
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = Math.max(0.5, Math.min(1.5, Number(rate.value) * 0.9));
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(val => val.lang.includes('GB') || val.lang.includes('UK') || val.lang.startsWith('en'));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }

  function playLiveBaidu(text, hasTranslation) {
    pause();
    const request = playbackRequest;
    const cleanText = text.replaceAll('’', "'").trim().replace(/\s+/g, ' ');
    status.textContent = hasTranslation ? '' : '此处暂无单独对应的中文。';
    if (!cleanText) return;

    const url = 'https://fanyi.baidu.com/gettts?lan=uk&text=' + encodeURIComponent(cleanText) + '&spd=3&source=web';
    let settled = false;
    const fallback = () => {
      if (settled || request !== playbackRequest) return;
      settled = true;
      clearBaiduFallback();
      audio.pause();
      speakBrowserFallback(cleanText, request);
    };

    baiduTimeoutId = setTimeout(fallback, 2500);
    audio.onplaying = () => {
      if (request !== playbackRequest) return;
      settled = true;
      clearBaiduFallback();
    };
    audio.onerror = fallback;
    audio.src = url;
    audio.playbackRate = Number(rate.value);
    audio.play().catch(fallback);
  }

  function playPhrase(text, hasTranslation) {
    if (currentChapter.wordAudioMode === 'live-baidu') {
      playLiveBaidu(text, hasTranslation);
      return;
    }
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
    activePart = undefined;
    heardWords = undefined;
    control.setAttribute('aria-pressed', 'true');
    caption.lang = 'en';
    showCaption();
    showTranslation();
    showParts();
    replay.disabled = false;
    stop.disabled = false;
    window.dispatchEvent(new CustomEvent('notes-select', {
      detail: { id: 'ch' + currentChapter.id + '-' + control.id, text: sentence.en },
    }));
  }

  function renderChapterFooter() {
    chapterFooter.replaceChildren();
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'chapter-next-btn';
    if (currentChapter.id === 1) {
      nextBtn.textContent = '下一章：第二章 · The Vanishing Glass →';
      nextBtn.addEventListener('click', () => loadChapter(2, { restoreBookmark: false, scrollToTop: true }));
    } else {
      nextBtn.textContent = '← 返回第一章 · The Boy Who Lived';
      nextBtn.addEventListener('click', () => loadChapter(1, { restoreBookmark: false, scrollToTop: true }));
    }
    chapterFooter.append(nextBtn);
  }

  function loadChapter(chapterId, { restoreBookmark = false, scrollToTop = false } = {}) {
    const cfg = CHAPTERS[chapterId] || CHAPTERS[1];
    pause();
    selected = undefined;
    highlightedPhrase = undefined;
    activePart = undefined;
    heardWords = undefined;
    currentChapter = cfg;

    document.title = cfg.titleEn + ' · Chapter Reader';
    chapterTitleEl.textContent = cfg.titleEn;
    chapterSubtitleEl.textContent = cfg.titleZh;
    chapter.setAttribute('aria-label', cfg.ariaLabel);
    for (const tab of chapterTabs) {
      tab.setAttribute('aria-selected', String(Number(tab.dataset.chapter) === cfg.id));
    }

    caption.replaceChildren();
    translation.textContent = '选择一句话开始。';
    partsRow.hidden = true;
    partButtons.replaceChildren();
    status.textContent = '';
    replay.disabled = true;
    stop.disabled = true;
    window.NotesSpeech?.dispose?.();

    try {
      localStorage.setItem(lastChapterKey, String(cfg.id));
    } catch {
      // Ignore storage errors.
    }

    let bookmarkedAudio;
    if (restoreBookmark) {
      try {
        bookmarkedAudio = localStorage.getItem(cfg.bookmarkKey);
      } catch {
        // Ignore storage errors.
      }
    }

    let bookmark;
    let index = 0;
    const fragment = document.createDocumentFragment();
    for (const paragraph of cfg.data()) {
      const block = document.createElement('p');
      for (const sentence of paragraph) {
        const control = document.createElement('span');
        control.id = 'sentence-' + ++index;
        control.className = 'sentence';
        control.tabIndex = 0;
        control.setAttribute('role', 'button');
        control.textContent = sentence.en;
        control.setAttribute('aria-pressed', 'false');
        if (sentence.audio === bookmarkedAudio) bookmark = { sentence, control };
        function openSentence() {
          select(sentence, control);
          try {
            localStorage.setItem(cfg.bookmarkKey, sentence.audio);
          } catch {
            // Keep playing even if the browser could not save the bookmark.
          }
          play(sentence.audio);
        }
        control.addEventListener('click', openSentence);
        control.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openSentence();
          }
        });
        if (block.childNodes.length) block.append(' ');
        block.append(control);
      }
      fragment.append(block);
    }
    chapter.replaceChildren(fragment);
    renderChapterFooter();

    if (bookmark) {
      const restore = () => {
        if (selected) return;
        select(bookmark.sentence, bookmark.control);
        requestAnimationFrame(() => {
          if (selected?.control === bookmark.control) {
            bookmark.control.scrollIntoView({ block: 'center' });
          }
        });
      };
      if (document.readyState === 'complete') restore();
      else window.addEventListener('pageshow', restore, { once: true });
    } else if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  for (const tab of chapterTabs) {
    tab.addEventListener('click', () => {
      const id = Number(tab.dataset.chapter);
      if (id !== currentChapter.id) {
        loadChapter(id, { restoreBookmark: true, scrollToTop: true });
      }
    });
  }

  replay.addEventListener('click', () => {
    if (!selected) return;
    select(selected, selected.control);
    play(selected.audio);
  });
  stop.addEventListener('click', pause);
  rate.addEventListener('change', () => { audio.playbackRate = Number(rate.value); });
  window.addEventListener('pagehide', pause);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--player-height', player.offsetHeight + 'px');
  }).observe(player);

  let initialChapter = 1;
  try {
    const params = new URLSearchParams(window.location.search);
    const paramCh = Number(params.get('chapter'));
    if (CHAPTERS[paramCh]) initialChapter = paramCh;
    else if (window.location.hash === '#chapter-2') initialChapter = 2;
    else {
      const saved = Number(localStorage.getItem(lastChapterKey));
      if (CHAPTERS[saved]) initialChapter = saved;
    }
  } catch {
    // Default to Chapter 1.
  }

  loadChapter(initialChapter, { restoreBookmark: true, scrollToTop: false });
})();

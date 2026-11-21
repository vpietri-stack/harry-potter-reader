# Chapter reader

A standalone bilingual, sentence-by-sentence reader for Chapter 1 of Harry Potter and the Sorcerer’s Stone. Select an English sentence to hear Jim Dale’s audiobook narration and see its Simplified Chinese translation. Select a word or expression in the bottom panel to hear its BaiduFanyi British English pronunciation. Underlined items also highlight their corresponding Chinese text. Select 试着读 to record the sentence and check which words the speech engine heard clearly.

Serve the repository root with a static web server that supports HTTP byte ranges for the speech model. The microphone requires localhost or HTTPS.

The reader uses the same on-device Adaptive Speech engine and read-aloud controls as Classroom Survivors, sourced from commit `626c2ef6f8f06da4905d49a5d89269edbf5cbcab`. It downloads the model on first use and keeps practice recordings in the browser for replay. The player is wired to the original Notes Speech event interface.

# Chapter reader

A standalone bilingual, sentence-by-sentence reader for Chapter 1 of Harry Potter and the Sorcerer’s Stone. The current local draft contains the opening sentence for voice review.

Serve the repository root with a static web server that supports HTTP byte ranges for the speech model. The microphone requires localhost or HTTPS.

The reader uses the same on-device Adaptive Speech engine and read-aloud controls as Classroom Survivors, sourced from commit `626c2ef6f8f06da4905d49a5d89269edbf5cbcab`. It downloads the model on first use and keeps practice recordings in the browser for replay. The player is wired to the original Notes Speech event interface.

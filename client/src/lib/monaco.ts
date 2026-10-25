import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';

// Bundle Monaco locally so the YAML editor works offline
// (desktop apps, air-gapped clusters — no CDN dependency).
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
} as any;

loader.config({ monaco });

export default monaco;

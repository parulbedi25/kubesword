'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('kubesword', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
});

const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('relayDesktop',Object.freeze({execute:input=>ipcRenderer.invoke('request:execute',input),cancel:id=>ipcRenderer.invoke('request:cancel',id),copy:text=>ipcRenderer.invoke('response:copy',text)}));

import {mount} from './app.mjs';
mount(document.getElementById('app'),(channel,payload)=>window.pluginBridge.invoke(channel,payload),()=>window.pluginBridge.invoke('ui.closePanel'));

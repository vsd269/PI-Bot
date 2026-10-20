import {colorOf} from './upstream/characters.mjs';
import {INKS,isHex,luminance} from './upstream/inks.mjs';

// The official rule is for 1:1 chats. Groups keep the selected theme's user
// bubble; never let a previously selected Bot tint another conversation.
export function privateBubble(bot,prefs={},dark=false){
  const accent=String(prefs.accent||'').toLowerCase();
  if(!bot||['#000000','#141416'].includes(accent))return null;
  const color=colorOf(bot),background=isHex(color)?color:INKS[color][dark?1:0];
  const light=(luminance(background)+.05)/.05;
  const white=1.05/(luminance(background)+.05);
  return {background,ink:light>=white?'#000000':'#ffffff'};
}

export function applyChatColors(transcript,bot,prefs,dark){
  const colors=privateBubble(bot,prefs,dark);
  for(const [key,value] of [['--pi-user-bg',colors?.background],['--pi-user-ink',colors?.ink]]){
    if(value){if(transcript.style.getPropertyValue(key)!==value)transcript.style.setProperty(key,value);}
    else transcript.style.removeProperty(key);
  }
  transcript.toggleAttribute('data-bot-colors',Boolean(colors));
}

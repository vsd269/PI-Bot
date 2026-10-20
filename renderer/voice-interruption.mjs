// ASR text is a second gate for speaker playback. This is echo rejection, not
// acoustic echo cancellation: a headset remains the most reliable option.
const chars=text=>Array.from(String(text||'')).map((char,index)=>({char:char.toLocaleLowerCase(),index})).filter(v=>/[\p{L}\p{N}]/u.test(v.char));
const norm=text=>chars(text).map(v=>v.char).join('');
export function withoutSpeechPrefix(text,count){
  const input=String(text||''),map=chars(input);
  if(!count)return input.trim();
  return count>=map.length?'':Array.from(input).slice(map[count].index).join('').trim();
}
export function meaningfulSpeech(text){
  const clean=norm(text);
  if(clean==='停')return true;
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(clean)?clean.length>=2:clean.length>=3;
}
export function playbackEchoGuard(spoken){
  const reference=norm(spoken).slice(0,16000);let skip=0,locked=false,lastText,lastCandidate,cutText,cutSkip,cutResult;
  const cut=text=>{if(text!==cutText||skip!==cutSkip){cutText=text;cutSkip=skip;cutResult=withoutSpeechPrefix(text,skip);}return cutResult;};
  return {
    candidate(text){
      if(locked)return cut(text);if(text===lastText)return lastCandidate;
      const input=norm(text);
      // ASR may accumulate several sentences or repeat the same playback.
      // Consume only a leading passage actually present in the known reply.
      let at=0;
      while(at<input.length){
        let longest=0,high=Math.min(reference.length,input.length-at);
        while(longest<high){const middle=Math.ceil((longest+high)/2);if(reference.includes(input.slice(at,at+middle)))longest=middle;else high=middle-1;}
        if(longest<3){if(at===0&&longest===input.length){at=input.length;}break;}
        at+=longest;
      }
      skip=at;lastText=text;return lastCandidate=cut(text);
    },
    commit(){locked=true;},
    result:cut,
  };
}

// Interpolate the measured audio envelope locally. The host bridge is rate
// limited, so visual frames must never wait for another microphone RPC.
export function createDictationWave(count=17){
  let envelope=0,last;
  return {reset(){envelope=0;last=undefined;},frame(level,now,reduced=false){
    const dt=last===undefined?16:Math.min(64,Math.max(0,now-last));last=now;
    const target=Math.min(1,Math.max(0,Number(level)||0));
    envelope+=(target-envelope)*(1-Math.exp(-dt/(target>envelope?65:180)));
    return Array.from({length:count},(_,i)=>{
      const position=(i-(count-1)/2)/(count/2),weight=.45+.55*(1-position*position);
      const carrier=reduced ? .7 : .38+.42*(.5+.5*Math.sin(now/190+i*.72))+.2*(.5+.5*Math.sin(now/310-i*.43));
      return (3+envelope*24*weight*carrier)/28;
    });
  }};
}

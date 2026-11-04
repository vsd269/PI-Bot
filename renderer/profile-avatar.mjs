import {MAIN_LOOK} from './upstream/characters.mjs';

export function profileLook(image){
  const valid=typeof image==='string'&&image.length<=36000&&/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(image);
  return {avatar:valid?{image}:{shape:MAIN_LOOK.shape},color:MAIN_LOOK.color};
}

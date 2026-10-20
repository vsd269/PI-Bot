import { PI_NATURE_CHARACTERS } from './pi-nature-characters.mjs';
import { PI_OBJECT_CHARACTERS } from './pi-avatars-objects.mjs';

// One family of original PI companions; keep stored IDs stable.
export const PI_CHARACTERS = {...PI_NATURE_CHARACTERS,...PI_OBJECT_CHARACTERS};

export const LEGACY_SHAPE_ALIASES = Object.freeze({
  whale:'pi-ray',star:'pi-spark',moon:'pi-comet',gumdrop:'pi-droplet',
  peanut:'pi-otter',bunny:'pi-sprout',kitty:'pi-fox',
  wave:'pi-orbit',zed:'pi-comet',hex:'pi-mountain',saucer:'pi-sailboat',
  beacon:'pi-lantern',squircle:'pi-cassette',plus:'pi-satellite',
  magnet:'pi-headphones',acorn:'pi-mushroom',pebbles:'pi-turtle',
  cushion:'pi-backpack',ring:'pi-compass',gem:'pi-lantern',
});

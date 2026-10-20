// User-supplied 3D artwork. Keep the saved shape IDs and their order intact:
// existing Bots pick up the new art without rewriting any personal data.
import { PI_AVATAR_IMAGES } from './pi-avatar-images.mjs';
import { PI_NEW_AVATAR_IMAGES } from './pi-new-avatar-images.mjs';
const artwork = [
  ['pi-cloud', '蓝晶'], ['pi-spark', '橙乐'], ['pi-sprout', '紫棱'],
  ['pi-leaf', '星莓'], ['pi-bloom', '曜石'], ['pi-mushroom', '青苔'],
  ['pi-droplet', '新芽'], ['pi-comet', '心动'], ['pi-orbit', '云泡'],
  ['pi-mountain', '金豆'], ['pi-otter', '蓝焰'], ['pi-owl', '奶星'],
  ['pi-fox', '紫电'], ['pi-seal', '哨兵'], ['pi-penguin', '玫晶'],
  ['pi-turtle', '荧光'], ['pi-koala', '冰露'], ['pi-crab', '可可'],
  ['pi-ray', '光环'], ['pi-snail', '墨方'], ['pi-rocket', '星芋'],
  ['pi-lantern', '赤铁'], ['pi-camera', '数码'], ['pi-book', '蜜桃'],
  ['pi-teacup', '蓝翼'], ['pi-compass', '花火'], ['pi-satellite', '晚安'],
  ['pi-sailboat', '金兔'], ['pi-flask', '白团'], ['pi-bell', '彩虹'],
  ['pi-cassette', '海戟'], ['pi-hourglass', '栗宝'], ['pi-puzzle', '银梭'],
  ['pi-headphones', '绒紫'], ['pi-backpack', '双子'],
];

export const PI_RASTER_AVATARS = Object.freeze(Object.fromEntries(artwork.map(([id, name], index) => {
  const number = String(index + 1).padStart(2, '0');
  return [id, Object.freeze({
    label: `${number} · ${name}`,
    // PI's renderer protocol serves modules rather than raw image files.
    // Bundled PNG data URLs work inside inline SVG and never enter Bot state.
    raster: PI_AVATAR_IMAGES[number],
    size: 256,
  })];
})));

export const PI_NEW_RASTER_AVATARS = Object.freeze(Object.fromEntries(PI_NEW_AVATAR_IMAGES.map((raster, index) => [
  `pi-custom-${String(index + 1).padStart(3, '0')}`,
  Object.freeze({label: `PI 头像 ${index + 1}`, raster, size: 256}),
])));

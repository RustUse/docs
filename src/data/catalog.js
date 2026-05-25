import {
  rustuseCrates as generatedRustuseCrates,
  rustuseSets as generatedRustuseSets,
} from './catalog.generated.js';

export const rustuseSets = generatedRustuseSets;

export const rustuseCrates = generatedRustuseCrates;

function compareCratesByName(left, right) {
  return left.name.localeCompare(right.name, 'en');
}

export const publicRustuseCrates = rustuseCrates
  .filter((crate) => crate.public)
  .sort(compareCratesByName);

export function getPublicCratesBySet(setName) {
  return publicRustuseCrates.filter((crate) => crate.set === setName);
}

export function getPublicCrate(name) {
  return publicRustuseCrates.find((crate) => crate.name === name);
}

export function getRustuseSet(name) {
  return rustuseSets.find((set) => set.name === name);
}

export function getSidebarSetLinks() {
  return rustuseSets.map((set) => ({
    label: set.name,
    link: set.setPath,
  }));
}

export function getSidebarCrateLinks() {
  const linksByName = new Map();

  for (const crate of rustuseCrates) {
    if (!crate.name.startsWith('use-') || !crate.pagePath) {
      continue;
    }

    linksByName.set(crate.name, {
      label: crate.name,
      link: crate.pagePath,
    });
  }

  return [...linksByName.values()].sort((left, right) =>
    left.label.localeCompare(right.label, 'en'),
  );
}

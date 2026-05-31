import {
  rustuseCrates as generatedRustuseCrates,
  rustuseFacades as generatedRustuseFacades,
} from './catalog.generated.js';

export const rustuseFacades = generatedRustuseFacades;

export const rustuseCrates = generatedRustuseCrates;

function compareCratesByName(left, right) {
  return left.name.localeCompare(right.name, 'en');
}

export const publicRustuseCrates = rustuseCrates
  .filter((crate) => crate.public)
  .sort(compareCratesByName);

export function getPublicCratesByFacade(facadeName) {
  return publicRustuseCrates.filter((crate) => crate.facade === facadeName);
}

export function getPublicCrate(name) {
  return publicRustuseCrates.find((crate) => crate.name === name);
}

export function getRustuseFacade(name) {
  return rustuseFacades.find((facade) => facade.name === name);
}

export function getSidebarFacadeLinks() {
  return rustuseFacades.map((facade) => ({
    label: facade.name,
    link: facade.facadePath,
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

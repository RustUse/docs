import {
  rustuseCrates as generatedRustuseCrates,
  rustuseSets as generatedRustuseSets,
} from './catalog.generated.js';

export const rustuseSets = generatedRustuseSets;

export const rustuseCrates = generatedRustuseCrates;

export const publicRustuseCrates = rustuseCrates.filter((crate) => crate.public);

export function getPublicCratesBySet(setName) {
  return publicRustuseCrates.filter((crate) => crate.set === setName);
}

export function getPublicCrate(name) {
  return publicRustuseCrates.find((crate) => crate.name === name);
}

export function getSidebarSetLinks() {
  return rustuseSets.map((set) => ({
    label: set.name,
    link: set.setPath,
  }));
}

export function getSidebarCrateLinks() {
  return publicRustuseCrates
    .filter((crate) => Boolean(crate.pagePath))
    .map((crate) => ({
      label: crate.name,
      link: crate.pagePath,
    }));
}

export function getSidebarApiLinks() {
  const workspaceLinks = rustuseSets.map((set) => ({
    label: `${set.name} workspace Rustdocs`,
    link: set.workspaceApiPath,
  }));

  const crateLinks = publicRustuseCrates
    .filter((crate) => Boolean(crate.docsUrl))
    .map((crate) => ({
      label: `${crate.name} Rustdocs`,
      link: crate.docsUrl,
    }));

  return [...workspaceLinks, ...crateLinks];
}
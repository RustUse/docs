import {
  rustuseCrates as generatedRustuseCrates,
  rustuseSets as generatedRustuseSets,
} from './catalog.generated.js';

export const rustuseSets = generatedRustuseSets;

export const rustuseCrates = generatedRustuseCrates;

export const publicRustuseCrates = rustuseCrates.filter(
  (crate) => crate.public,
);

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
  const setsByName = new Map(rustuseSets.map((set) => [set.name, set]));

  return publicRustuseCrates
    .filter((crate) => Boolean(crate.pagePath))
    .map((crate) => {
      const rustdocLinks = [];

      if (crate.docsUrl) {
        rustdocLinks.push({
          label: 'RustUse RustDocs',
          link: crate.docsUrl,
        });
      }

      const set = crate.name === crate.set ? setsByName.get(crate.set) : null;
      if (set?.workspaceApiPath) {
        rustdocLinks.push({
          label: 'Workspace RustDocs',
          link: set.workspaceApiPath,
        });
      }

      if (rustdocLinks.length === 0) {
        return {
          label: crate.name,
          link: crate.pagePath,
        };
      }

      return {
        label: crate.name,
        collapsed: true,
        items: [
          {
            label: 'Overview',
            link: crate.pagePath,
          },
          ...rustdocLinks,
        ],
      };
    });
}

import {
  rustuseCrates as generatedRustuseCrates,
  rustuseFacades as generatedRustuseFacades,
} from './catalog.generated.js';

interface RustUseCrate {
  name: string;
  packageName: string;
  facade: string;
  facadePath: string;
  version: string;
  description: string;
  repositoryUrl: string;
  cratesIoUrl?: string;
  docsUrl?: string;
  docsRsUrl?: string;
  apiPath?: string;
  pagePath?: string;
  tags: string[];
}

interface RustUseFacade {
  name: string;
  facadePath: string;
  version: string;
  description: string;
  repositoryUrl: string;
  cratesIoUrl?: string;
  docsRsUrl?: string;
  workspaceApiPath?: string;
}

interface SidebarLink {
  label: string;
  link: string;
}

const rustuseCrates = generatedRustuseCrates as RustUseCrate[];

const rustuseFacades = generatedRustuseFacades as RustUseFacade[];

function compareCratesByName(left: RustUseCrate, right: RustUseCrate): number {
  return left.name.localeCompare(right.name, 'en');
}

function compareSidebarLinksByLabel(
  left: SidebarLink,
  right: SidebarLink,
): number {
  return left.label.localeCompare(right.label, 'en');
}

const sortedCrates = [...rustuseCrates].sort(compareCratesByName);

const crates = sortedCrates;

const facades = rustuseFacades;

function getCratesByFacade(facadeName: string): RustUseCrate[] {
  return sortedCrates.filter((crate) => crate.facade === facadeName);
}

function getCrate(name: string): RustUseCrate | undefined {
  return sortedCrates.find((crate) => crate.name === name);
}

function getRustuseFacade(name: string): RustUseFacade | undefined {
  return rustuseFacades.find((facade) => facade.name === name);
}

function getSidebarFacadeLinks(): SidebarLink[] {
  return rustuseFacades.map((facade) => ({
    label: facade.name,
    link: facade.facadePath,
  }));
}

function getSidebarCrateLinks(): SidebarLink[] {
  const linksByName = new Map<string, SidebarLink>();

  for (const crate of rustuseCrates) {
    if (
      !crate.name.startsWith('use-') ||
      !crate.pagePath ||
      crate.name === crate.facade
    ) {
      continue;
    }

    linksByName.set(crate.name, {
      label: crate.name,
      link: crate.pagePath,
    });
  }

  return [...linksByName.values()].sort(compareSidebarLinksByLabel);
}

export {
  crates,
  facades,
  getCrate,
  getCratesByFacade,
  getRustuseFacade,
  getSidebarCrateLinks,
  getSidebarFacadeLinks,
  rustuseCrates,
  rustuseFacades,
};

export type { RustUseCrate, RustUseFacade };

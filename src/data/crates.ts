import {
  getPublicCrate as getCatalogPublicCrate,
  getPublicCratesByFacade as getCatalogPublicCratesByFacade,
  getRustuseFacade as getCatalogRustuseFacade,
  publicRustuseCrates,
  rustuseCrates,
  rustuseFacades,
} from './catalog.js';

export type CrateStatus = 'planned' | 'scaffolded' | 'published';

export interface RustUseCrate {
  name: string;
  packageName: string;
  facade: string;
  facadePath: string;
  status: CrateStatus;
  description: string;
  repositoryUrl: string;
  cratesIoUrl?: string;
  docsUrl?: string;
  docsRsUrl?: string;
  apiPath?: string;
  pagePath?: string;
  tags: string[];
  public: boolean;
}

export interface RustUseFacade {
  name: string;
  facadePath: string;
  status: CrateStatus;
  description: string;
  repositoryUrl: string;
  cratesIoUrl?: string;
  docsRsUrl?: string;
  workspaceApiPath?: string;
}

export const facades = rustuseFacades as RustUseFacade[];

export const crates = rustuseCrates as RustUseCrate[];

export const publicCrates = publicRustuseCrates as RustUseCrate[];

export function getPublicCratesByFacade(facadeName: string) {
  return getCatalogPublicCratesByFacade(facadeName) as RustUseCrate[];
}

export function getPublicCrate(name: string) {
  return getCatalogPublicCrate(name) as RustUseCrate | undefined;
}

export function getRustuseFacade(name: string) {
  return getCatalogRustuseFacade(name) as RustUseFacade | undefined;
}

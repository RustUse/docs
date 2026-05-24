import {
  getPublicCrate as getCatalogPublicCrate,
  getPublicCratesBySet as getCatalogPublicCratesBySet,
  getRustuseSet as getCatalogRustuseSet,
  publicRustuseCrates,
  rustuseCrates,
  rustuseSets,
} from './catalog.js';

export type CrateStatus = 'planned' | 'scaffolded' | 'published';

export interface RustUseCrate {
  name: string;
  packageName: string;
  set: string;
  setPath: string;
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

export interface RustUseSet {
  name: string;
  setPath: string;
  status: CrateStatus;
  description: string;
  repositoryUrl: string;
  cratesIoUrl?: string;
  docsRsUrl?: string;
  workspaceApiPath?: string;
}

export const sets = rustuseSets as RustUseSet[];

export const crates = rustuseCrates as RustUseCrate[];

export const publicCrates = publicRustuseCrates as RustUseCrate[];

export function getPublicCratesBySet(setName: string) {
  return getCatalogPublicCratesBySet(setName) as RustUseCrate[];
}

export function getPublicCrate(name: string) {
  return getCatalogPublicCrate(name) as RustUseCrate | undefined;
}

export function getRustuseSet(name: string) {
  return getCatalogRustuseSet(name) as RustUseSet | undefined;
}

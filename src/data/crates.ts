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

const useMathRepositoryUrl = 'https://github.com/RustUse/use-math';
const cratesIoBaseUrl = 'https://crates.io/crates';
const docsRsBaseUrl = 'https://docs.rs';

// Public crates keep their external registry and docs.rs targets prewired so publication is a status flip once those pages are live.
export const crates: RustUseCrate[] = [
  {
    name: 'use-math',
    packageName: 'use-math',
    set: 'use-math',
    setPath: '/sets/use-math/',
    status: 'scaffolded',
    description:
      'Facade crate with feature-flagged re-exports and a prelude module.',
    repositoryUrl: useMathRepositoryUrl,
    cratesIoUrl: `${cratesIoBaseUrl}/use-math`,
    docsUrl: '/api/use-math/',
    docsRsUrl: `${docsRsBaseUrl}/use-math`,
    apiPath: '/api/use-math/',
    pagePath: '/use-math/',
    tags: ['math', 'facade', 'prelude'],
    public: true,
  },
  {
    name: 'use-geometry',
    packageName: 'use-geometry',
    set: 'use-math',
    setPath: '/sets/use-math/',
    status: 'scaffolded',
    description: '2D geometry primitives and common measurement helpers.',
    repositoryUrl: useMathRepositoryUrl,
    cratesIoUrl: `${cratesIoBaseUrl}/use-geometry`,
    docsUrl: '/api/use-geometry/',
    docsRsUrl: `${docsRsBaseUrl}/use-geometry`,
    apiPath: '/api/use-geometry/',
    pagePath: '/use-math/use-geometry/',
    tags: ['math', 'geometry', '2d'],
    public: true,
  },
  {
    name: 'use-combinatorics',
    packageName: 'use-combinatorics',
    set: 'use-math',
    setPath: '/sets/use-math/',
    status: 'scaffolded',
    description: 'Counting, permutations, combinations, and discrete helpers.',
    repositoryUrl: useMathRepositoryUrl,
    cratesIoUrl: `${cratesIoBaseUrl}/use-combinatorics`,
    docsUrl: '/api/use-combinatorics/',
    docsRsUrl: `${docsRsBaseUrl}/use-combinatorics`,
    apiPath: '/api/use-combinatorics/',
    pagePath: '/use-math/use-combinatorics/',
    tags: ['math', 'discrete', 'counting'],
    public: true,
  },
  {
    name: 'use-geode',
    packageName: 'use-geode',
    set: 'use-math',
    setPath: '/sets/use-math/',
    status: 'planned',
    description: 'Geospatial and earth-shape utilities for the use-math set.',
    repositoryUrl: useMathRepositoryUrl,
    docsUrl: '/api/use-geode/',
    apiPath: '/api/use-geode/',
    pagePath: '/use-math/use-geode/',
    tags: ['math', 'geospatial'],
    public: false,
  },
];

export const publicCrates = crates.filter((crate) => crate.public);

export function getPublicCratesBySet(setName: string) {
  return publicCrates.filter((crate) => crate.set === setName);
}

export function getPublicCrate(name: string) {
  return publicCrates.find((crate) => crate.name === name);
}

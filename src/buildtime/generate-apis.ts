import * as _ from 'lodash';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as globby from 'globby';

import * as swaggerParser from '@apidevtools/swagger-parser';
import * as swaggerToOpenApi from 'swagger2openapi';

import { OpenAPI, OpenAPIV3 } from 'openapi-types';
import { PathsObject, InfoObject } from 'openapi3-ts';

import {
    KNOWN_ERRORS,
    matchErrors
} from './known-errors';

const OUTPUT_DIRECTORY = path.join(__dirname, '..', '..', 'api');

type ExtendedInfo = InfoObject & {
    'x-preferred'?: boolean;
    'x-providerName'?: string;
    'x-serviceName'?: string;
}

type OpenAPIDocument = OpenAPIV3.Document & {
    'x-ms-paths'?: PathsObject;
    info: ExtendedInfo
}

async function generateApi(specPath: string): Promise<OpenAPIDocument> {
    const parsedSwagger = await swaggerParser.parse(specPath);

    // Manually patch up some known issues in existing specs:
    patchSpec(parsedSwagger);

    // Convert everything to OpenAPI v3
    const openapi: OpenAPIV3.Document = await swaggerToOpenApi.convertObj(parsedSwagger, {
        direct: true,
        patch: true
    });

    // Extra conversion to transform x-ms-paths into fragment queries
    mergeMsPaths(openapi);

    // Bundle all external $ref pointers
    return <Promise<OpenAPIDocument>> swaggerParser.bundle(openapi);
}

function mergeMsPaths(openApi: OpenAPIDocument) {
    const msPaths = openApi['x-ms-paths'];
    if (!msPaths) return openApi;

    Object.assign(openApi.paths, _(msPaths)
        .mapKeys((v, key) => key.replace('?', '#')) // Turn invalid queries into fragments queries like AWS
        .pickBy((v, key) => !openApi.paths[key]) // Drop any conflicting paths
        .valueOf()
    );
    delete openApi['x-ms-paths'];
}

function patchSpec(spec: OpenAPI.Document & Partial<OpenAPIDocument>) {
    const specId = idFromSpec(spec);

    if (specId === 'spotify.com') {
        // Fix a broken reference to an external policies.json file:
        delete (spec.components as any)['x-spotify-policy']['$ref'];
    }

    if (specId === 'evetech.net') {
        // Fix a (not swagger-convertable) parameter definition:
        delete spec.paths['/route/{origin}/{destination}/']
            .get
            .parameters[1]
            .items.collectionFormat;
    }
}

type PathParts = Array<string | RegExp>;

function commonStringPrefix(...strings: string[]): string {
    const first = strings[0] || '';
    let commonLength = first.length

    for (let i = 1; i < strings.length; ++i) {
        for (let j = 0; j < commonLength; ++j) {
            if (strings[i].charAt(j) !== first.charAt(j)) {
                commonLength = j
                break
            }
        }
    }

    return first.slice(0, commonLength)
}

function commonPartsPrefix(...partsArrays: Array<PathParts>): PathParts {
    const first = partsArrays[0] || [];
    let commonLength = first.length;

    // Find the length of the exactly matching parts prefix for these arrays
    for (let i = 1; i < partsArrays.length; ++i) {
        for (let j = 0; j < commonLength; ++j) {
            const parts = partsArrays[i];
            if (!_.isEqual(parts[j], first[j])) {
                commonLength = j;
                break;
            }
        }
    }

    // In the first non-matching part, find the common prefix there (if any)
    const nonMatchingIndex = commonLength;
    let extraSubPart: string | undefined;
    // They must all be strings for us to be able to do this.
    if (!_.some(partsArrays, part => !part[nonMatchingIndex] || part[nonMatchingIndex] instanceof RegExp)) {
        // Get the common string prefix (if any) of the non-matching part of each parts array
        extraSubPart = commonStringPrefix(
            ...partsArrays.map(parts => parts[nonMatchingIndex] as string)
        );
    }

    if (extraSubPart) {
        return first.slice(0, commonLength).concat(extraSubPart);
    } else {
        return first.slice(0, commonLength)
    }
}

function isAPrefix(possiblePrefix: PathParts, longerParts: PathParts) {
    const commonPrefix = commonPartsPrefix(possiblePrefix, longerParts);
    return _.isEqual(possiblePrefix, commonPrefix);
}

// Take a base URL, and a set of specs who all use the same base, and build an index
// within that base, keyed by the unique paths that map to each spec. This might still
// end up with duplicates if two specs define literally the same endpoint, but it
// gets much closer than just using the server URLs standalone.
export function calculateCommonPrefixes(
    commonBase: string,
    specPaths: { [specId: string]: string[] }
): Map<PathParts, string | string[]> {
    let index = new Map<PathParts, string | string[]>();

    const specPathParts = _.mapValues(specPaths, (paths) =>
        paths.map(path =>
            path
                .split('#')[0] // Drop anything in a fragment (#Action=abc)
                .split(/\{[^}]+\}/) // Split around param sections
                .reduce<PathParts>((pathParts, pathPart) => {
                    // Inject a param regex between every split section to replace the params, and at the end
                    return [...pathParts, pathPart, /^[^/]+/];
                }, [])
                .slice(0, -1) // Drop the extra param regex from the end
                .filter(p => !!p) // Drop any empty strings, e.g. if {param} was the end of the path
        )
    );

    _.forEach(specPathParts, (pathParts, specId) => {
        // For each spec, try to work out the minimum set of URL prefixes that unambiguously
        // point to this spec, and no others.

        let prefixes: Array<PathParts> = [];
        const otherSpecPaths = _(specPathParts)
            .omit(specId)
            .flatMap((otherPaths) => otherPaths).valueOf();

        pathParts.forEach((parts) => {
            // If the existing prefixes for this spec already work fine for this path, skip it
            if (_.some(prefixes, (prefixParts) =>
                // Does an existing prefix for this spec match the start of this path?
                isAPrefix(prefixParts, parts) &&
                // Do no prefixes for other specs match the start of this path?
                !_.some(otherSpecPaths, path => isAPrefix(path, parts))
            )) return;

            // Try to shorten existing prefixes as little as possible to match this path,
            // without matching the paths of any other routes
            const possibleShortenings = prefixes
                .map((prefix) => commonPartsPrefix(parts, prefix))
                .filter((shortenedPrefix) =>
                    shortenedPrefix.length &&
                    !_.some(otherSpecPaths, path => isAPrefix(shortenedPrefix, path))
                );

            // Sort and [0] to use the longest/most specific shortened prefix we can come up with
            const shortening = possibleShortenings
                .sort((prefixA, prefixB) => {
                    if (prefixA.length > prefixB.length) return -1;
                    if (prefixB.length > prefixA.length) return 1;

                    // The have the same number of parts, compare the length of the last parts
                    const lastIndex = prefixA.length - 1;
                    const lastPartA = prefixA[lastIndex];
                    const lastPartB = prefixB[lastIndex];
                    if (lastPartA.toString().length > lastPartB.toString().length) return -1;
                    if (lastPartA.toString().length > lastPartA.toString().length) return 1;
                    return 0;
                })[0];

            if (shortening && shortening.length) {
                // Drop any existing prefixes that this makes irrelevant
                prefixes = prefixes
                    .filter((existingPrefix) => !isAPrefix(shortening, existingPrefix))
                    .concat([shortening]);
            } else {
                // There are no possible shortenings of existing prefixes that would uniquely
                // identify this path - we have nothing unique in commmon with existing prefixes.
                // Either we're a new 'branch' of the API (e.g. the first endpoint), or
                // we're a prefix/exact match for some other endpoint's full path.
                // We create a specific case that covers this one path, which may be shortened
                // later on if we find other similar paths for this spec.
                prefixes.push(parts);
            }
        });

        // Add each prefix that was found to an index of URLs within this base URL.
        prefixes.forEach((prefixParts) => {
            const baseUrl = commonBase.replace(/\/$/, '');
            const urlParts =
                prefixParts[0] === undefined ?
                    [baseUrl] :
                _.isString(prefixParts[0]) ?
                    [baseUrl + prefixParts[0], ...prefixParts.slice(1)]
                : [baseUrl, ...prefixParts];

            const existingKey = _.find(Array.from(index.keys()), (k) => _.isEqual(k, urlParts));
            const key = existingKey || urlParts;
            const existingValue = index.get(key);

            if (_.isArray(existingValue)) {
                index.set(key, _.union(existingValue, [specId]));
            } else if (existingValue) {
                index.set(key, _.union([existingValue], [specId]));
            } else {
                index.set(key, specId);
            }
        });
    });

    // Where we have directly conflicting endpoints (two specs both defining a.com/b), we'll get
    // a prefix for each unique endpoint. This is technically correct, but for specs that heavily
    // overlap (e.g. Azure's LUIS Runtime/Authoring) these become very noisy and inflate the index
    // hugely (approx 100% right now).
    // Here, we try to find shortenings for conflicting cases, by grouping each set of conflicts,
    // and finding a small set of shortenings that cover these cases. The heuristic for 'small'
    // is to include allow shortenings that match no other specs (so therefore are pretty specific).
    _(Array.from(index))
        // Get conflicting groups
        .filter(([key, value]) => Array.isArray(value))
        // Group by the specs which conflict
        .groupBy(([key, value]) => value)
        // For each set of conflicts, find the possible shortenings
        .forEach((conflicts) => {
            const conflictingSpecs = <string[]> conflicts[0][1];
            const conflictingPaths = conflicts.map(([key]) => key);

            // Collect all paths that map to specs other than these. These are the specs we don't
            // want our shortenings to overlap with.
            const otherSpecPaths = _(Array.from(index))
                // Don't worry about any paths that only match one of these specs
                .omitBy(([_paths, specs]: [unknown, string | string[]]) => {
                    if (Array.isArray(specs)) {
                        return _.intersection(specs, conflictingSpecs).length === specs.length;
                    } else {
                        return _.includes(conflictingSpecs, specs);
                    }
                })
                .map(([otherPaths]) => otherPaths).valueOf();

            const shortenings = conflictingPaths.reduce((foundShortenings: PathParts[], conflictingPath) => {
                // Find any possible shared prefixes between this conflicting path
                // and our shortened prefixes found so far that don't conflict with other specs
                let newShortenings = foundShortenings
                    .map(s => commonPartsPrefix(s, conflictingPath))
                    .filter(s => s && !_.some(otherSpecPaths, path => isAPrefix(s, path)));

                // If this can't be shortened, it needs to exist as a path standalone. This is ok - it will
                // always happen for the first value at least, and it can be shortened further later.
                if (newShortenings.length === 0) newShortenings = [conflictingPath];

                return foundShortenings
                    // Remove any existing shortenings that our new shortenings replace
                    .filter(s => !_.some(newShortenings,
                        newShortening => isAPrefix(newShortening, s))
                    )
                    // Add our new shortenings
                    .concat(newShortenings);
            }, []);

            // We now have a set of common paths covering these conflicting paths, which
            // is hopefully shorter (at worst the same) as the existing ones. Update the
            // index to replace the conflicts with these values.
            conflictingPaths.forEach((p) => index.delete(p));
            shortenings.forEach((p) => index.set(p, conflictingSpecs));
            // (An aside: we know writing over index[p] is safe, because shortenings cannot
            // contain any paths that conflict with existing paths in the index)
        })

    return index;
}

function getSpecPath(specId: string) {
    return path.join('api', specId) + '.json';
}

function idFromSpec(spec: OpenAPIDocument | OpenAPI.Document) {
    const info = spec.info as ExtendedInfo;
    const provider = info['x-providerName'];
    const service = info['x-serviceName'];

    return provider + (service ? path.sep + service : '');
}

export interface ApiGenerationOptions {
    /**
     * If set, API generation will not fail for errors in the known error set.
     */
    ignoreKnownErrors?: boolean,

    /**
     * If set, API generation will fail if not all errors in the known error set are thrown.
     */
    expectKnownErrors?: boolean

}

const IGNORED_SPEC_IDS = [
    // Ambiguous GitHub specs - we consider these as duplicate non-preferred versions of
    // github.com/api.github.com, and ignore entirely, until this issue is fixed:
    // https://github.com/APIs-guru/openapi-directory/issues/1115
    'github.com/ghec.2022-11-28',
    'github.com/ghec',
    'github.com/api.github.com.2022-11-28'
];

const IGNORED_SPEC_PATHS = [
    'node_modules/openapi-directory/APIs/ably.net/control/1.0.14/openapi.yaml', // Dupe of ably.net/control/v1
    'node_modules/openapi-directory/APIs/visma.net/1.0.14.784/openapi.yaml' // Old & conflicting with Visma 9.0 spec
];

// For some specs, we do want to include the spec in the collection, but the server URLs shouldn't
// be indexed, because they're not valid public URLs. For example, relative URLs, localhost/local
// network URLs, etc. The specs can still be required by id, where required, it's just that they're
// ambiguous enough that looking up these addresses in the index shouldn't return these APIs.
function shouldIndexUrl(url: string) {
    if (!url) return false; // Bizarrely, yes, some specs list an empty server URL
    if (url.startsWith('/')) return false; // Purely relative URLs aren't indexable

    // Make protocol-less URLs (common from Swagger?) parseable:
    if (!url.match(/^http(s)?:\/\//)) url = `https://${url}`;

    try {
        const parsedUrl = new URL(url);

        return parsedUrl.hostname !== 'localhost' && // Localhost URLs
            !parsedUrl.hostname.endsWith('.localhost') &&
            !parsedUrl.hostname.endsWith('.local') && // mDNS local addresses
            !parsedUrl.hostname.match(/^(127|10|192|0)\.\d+\.\d+\.\d+$/) && // Local network ips
            parsedUrl.hostname.includes('.'); // Local-only hostnames
    } catch (e) {
        console.log('Failed to parse', url);
        return false; // If it's not a parseable URL, it's definitely not indexable
    }
}

export async function generateApis(globs: string[], options: ApiGenerationOptions = {}) {
    const [specs] = await Promise.all([
        globby(globs),
        fs.emptyDir(OUTPUT_DIRECTORY)
    ]);

    const index: _.Dictionary<string | string[]> = {};
    const specIds: _.Dictionary<string> = {};

    const errors: { [specSource: string]: Error } = {};

    await Promise.all(
        specs.map(async (specSource) => {
            const spec = await generateApi(specSource);

            // If the spec has been explicitly superceded, skip it.
            // TODO: In future, accept it, if it adds some distinct paths?
            if (spec.info['x-preferred'] === false) return;

            const specId = idFromSpec(spec);

            // To work around some awkward spec overlaps, in some cases we drop specs from the index
            // unilaterally, to effectively override our 'preferred' version as the
            if (IGNORED_SPEC_IDS.includes(specId) || IGNORED_SPEC_PATHS.includes(specSource)) return;

            const { servers } = spec;
            const serverUrls = _(servers!)
                // Expand to include possible variable values. This handles v3 specs, or any
                // specs converted to v3 variable hosts (e.g. azure's x-ms-parameterized-host).
                .flatMap((server) => {
                    if (!server.variables) {
                        return server.url;
                    }

                    return _.reduce(server.variables, (urls, variable, variableKey) => {
                        const {
                            default: varDefault,
                            enum: enumValues
                        } = variable;

                        const possibleValues = <string[]>_.uniq(
                            [
                                varDefault,
                                ...(enumValues || [])
                            ].filter(v => !!v)
                        );

                        // For each URL we have, replace it with each possible var replacement
                        return _.flatMap(urls, (url) =>
                            possibleValues.map((value) => url.replace(`{${variableKey}}`, value))
                        );

                        // Here we will drop specs for any variables without concrete default/enum
                        // values. Wildcard URL params (e.g. Azure's search-searchservice) could be
                        // matched with index regexes, but it might get expensive, and it's complicated
                        // to do. Ignoring this for now, but TODO: we might want to match open wildcards
                        // in URLs later (as long as their _somewhat_ constrained - 100% wildcard is bad)
                    }, [server.url]);
                })
                // Drop protocols from all URLs
                .map((url) => url.replace(/^(https?:)?\/\//, '').toLowerCase())
                .uniq()
                .valueOf();

            // Case-insensitively check for duplicate spec ids, and report conflicts:
            const existingSpecSource = specIds[specId.toLowerCase()];
            if (existingSpecSource) {
                throw new Error(`Duplicate spec id ${specId} between ${specSource} and ${existingSpecSource}`);
            }
            specIds[specId.toLowerCase()] = specSource;

            serverUrls.forEach((url) => {
                if (!shouldIndexUrl(url)) return; // Skip adding this spec to the index

                if (index[url]) {
                    index[url] = [specId].concat(index[url]);
                } else {
                    index[url] = specId;
                }
            });

            const specPath = getSpecPath(specId);

            const exists = await new Promise<boolean>((resolve) =>
                fs.exists(specPath, resolve)
            );

            if (exists) {
                console.warn(
                    `Spec naming collision for ${specId} (from ${specSource})`
                );
            }

            await fs.mkdirp(path.dirname(specPath));
            await fs.writeFile(specPath, JSON.stringify(spec));
        }).map((p, i) => p.catch((err: Error) => {
            console.log(
                `Failed to generate API from ${specs[i]}`,
                err.message.split('\n')[0]
            );

            errors[specs[i]] = err;
        }))
    );

    const errorPairs = Object.entries(errors);
    const expectedErrorsPairs = Object.entries(KNOWN_ERRORS);

    if (options.ignoreKnownErrors) {
        const unexpectedErrors = _.differenceWith(errorPairs, expectedErrorsPairs, matchErrors);
        if (unexpectedErrors.length) {
            throw new Error(`Build failed unexpectedly due to errors in:\n${
                unexpectedErrors.map(([source]) => source).join(', ')
            }`);
        }
    } else {
        if (errorPairs.length) throw new Error('Unexpected errors while building specs');
    }

    if (options.expectKnownErrors) {
        const missingErrors = _.differenceWith(expectedErrorsPairs, errorPairs, (a, b) => matchErrors(b, a));
        if (missingErrors.length) {
            throw new Error(`Build succeeded, but unexpectedly missing known errors from:\n${
                missingErrors.map(([source]) => source).join(', ')
            }`);
        }
    }

    console.log('APIs parsed and loaded');

    // Try to split duplicate index values for the same key (e.g. two specs for the
    // same base server URL) into separate values, by pulling common prefixes of the
    // paths from the specs into their index keys.
    let dedupedIndex = new Map<PathParts, string | string[]>();
    await Promise.all(
        _.map(index, async (specs, commonBase) => {
            if (typeof specs === 'string') {
                dedupedIndex.set([commonBase], specs);
                return;
            } else {
                const specFiles: _.Dictionary<string[]> = _.fromPairs(
                    await Promise.all(
                        specs.map(async (specId) => [
                            specId,
                            await swaggerParser.parse(getSpecPath(specId))
                                .then((api) =>
                                    Object.keys(api.paths).map(p => p.toLowerCase())
                                )
                        ])
                    )
                );


                console.log(`Deduping index for ${commonBase}`);
                const dedupedPaths = calculateCommonPrefixes(commonBase, specFiles);
                dedupedIndex = new Map([...dedupedIndex, ...dedupedPaths]);
            }
        })
    );

    return dedupedIndex;
}
import * as _ from 'lodash';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as globby from 'globby';

import * as swaggerParser from 'swagger-parser';
import * as swaggerToOpenApi from 'swagger2openapi';
import { OpenAPIObject } from 'openapi3-ts';

const OUTPUT_DIRECTORY = path.join(__dirname, '..', '..', 'api');

async function generateApi(specPath: string): Promise<OpenAPIObject> {
    const parsedSwagger = await swaggerParser.parse(specPath);

    // Convert everything to OpenAPI v3
    const openapi: OpenAPIObject = await swaggerToOpenApi.convertObj(parsedSwagger, {
        direct: true,
        patch: true
    });

    // Extra conversion to transform x-ms-paths into fragment queries
    mergeMsPaths(openapi);

    // Bundle all external $ref pointers
    return swaggerParser.bundle(<any> openapi);
}

function mergeMsPaths(openApi: OpenAPIObject) {
    const msPaths = openApi['x-ms-paths'];
    if (!msPaths) return openApi;

    Object.assign(openApi.paths, _(msPaths)
        .mapKeys((v, key) => key.replace('?', '#')) // Turn invalid queries into fragments queries like AWS
        .pickBy((v, key) => !openApi.paths[key]) // Drop any conflicting paths
        .valueOf()
    );
    delete openApi['x-ms-paths'];
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
                // There's no possible shortenings of existing prefixes.
                // Either we're a new unusual case, or we're the first case,
                // or we're a prefix of some other spec's full path, and we need
                // a specific case that covers this one part.
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

    return index;
}

function getSpecPath(specId: string) {
    return path.join('api', specId) + '.json';
}

export async function generateApis(globs: string[]) {
    const [specs] = await Promise.all([
        globby(globs),
        fs.emptyDir(OUTPUT_DIRECTORY)
    ]);

    const index: _.Dictionary<string | string[]> = {};

    await Promise.all(
        specs.map(async (specSource) => {
            const spec = await generateApi(specSource);

            // If the spec has been explicitly superceded, skip it.
            // TODO: In future, accept it, if it adds some distinct paths?
            if (spec.info['x-preferred'] === false) return;

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

            const provider = spec.info['x-providerName'];
            const service = spec.info['x-serviceName'];
            const specId = provider + (service ? path.sep + service : '');

            serverUrls.forEach((url) => {
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
        }).map((p, i) => p.catch((e) => {
            console.log(
                `Failed to generate API from ${specs[i]}`,
                e.message.split('\n')[0]
            );
        }))
    );

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
                                .then((api: OpenAPIObject) =>
                                    Object.keys(api.paths).map(p => p.toLowerCase())
                                )
                        ])
                    )
                );

                const dedupedPaths = calculateCommonPrefixes(commonBase, specFiles);
                dedupedIndex = new Map([...dedupedIndex, ...dedupedPaths]);
            }
        })
    );

    return dedupedIndex;
}
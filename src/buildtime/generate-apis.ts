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
    const openapi = await swaggerToOpenApi.convertObj(parsedSwagger, {
        direct: true,
        patch: true
    });

    // Bundle all external $ref pointers
    return swaggerParser.bundle(openapi);
}

function commonSubstring(...strings: string[]): string {
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

// Take a base URL, and a set of specs who all use the same base, and build an index
// within that base, keyed by the unique paths that map to each spec. This might still
// end up with duplicates if two specs define literally the same endpoint, but it
// gets much closer than just using the server URLs standalone.
export function calculateCommonPrefixes(
    commonBase: string,
    specPaths: { [specId: string]: string[] }
): { [url: string]: string | string[] } {
    let index: { [url: string]: string | string[] } = {};

    specPaths = _.mapValues(specPaths, (paths) =>
        // Drop templated values ({var}), and anything that follows them
        paths.map(path => path.replace(/{.*/, ''))
        // TODO: Drop #fragments from URLs too?
    );

    _.forEach(specPaths, (paths, specId) => {
        // For each spec, try to work out the minimum set of URL prefixes that unambiguously
        // point to this spec, and no others.

        let prefixes: string[] = [];
        const otherSpecPaths = _(specPaths).omit(specId).flatMap((otherPaths) => otherPaths).valueOf();

        paths.forEach((path) => {
            // If we've already got a working prefix for this path, skip it
            if (_.some(prefixes, (prefix) =>
                path.startsWith(prefix) &&
                !_.some(otherSpecPaths, path => path.startsWith(prefix))
            )) return;

            // Try to shorten existing prefixes as little as possible to match this path,
            // without matching the paths of any other routes
            const shortening = _(prefixes)
                .map((prefix) => commonSubstring(path, prefix))
                .filter((shortenedPrefix) =>
                    !_.some(otherSpecPaths, path => path.startsWith(shortenedPrefix))
                )
                .maxBy((prefix) => prefix.length);

            if (shortening) {
                prefixes = prefixes
                    .filter((prefix) => !prefix.startsWith(shortening))
                    .concat(shortening);
            } else {
                // There's no possible shortenings of existing prefixes.
                // Either we're a new unusual case, or we're the first case,
                // or we're a substring of some other spec's path and we need
                // a new more specific case.
                prefixes.push(path);
            }
        });

        // Add each prefix that was found to an index of URLs within this base URL.
        prefixes.forEach((prefix) => {
            const baseUrl = commonBase.replace(/\/$/, '') + prefix;
            if (index[baseUrl]) {
                index[baseUrl] = [specId].concat(index[baseUrl]);
            } else {
                index[baseUrl] = specId;
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
                // Expand to include possible variable values:
                .flatMap((server) => {
                    if (!server.variables) {
                        return server.url;
                    } else {
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
                        }, [server.url]);
                    }
                })
                // Drop protocols from all URLs
                .map((url) => url.replace(/^(https?:)?\/\//, ''))
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
    //
    // This helps, but it's not totally effective. TODO: We could do better if
    // we used template params, by allowing inline wildcards in the trie somehow.
    const dedupedIndex: _.Dictionary<string | string[]> = {};
    await Promise.all(
        _.map(index, async (specs, commonBase) => {
            if (typeof specs === 'string') {
                dedupedIndex[commonBase] = specs;
                return dedupedIndex;
            } else {
                const specFiles: _.Dictionary<string[]> = _.fromPairs(
                    await Promise.all(
                        specs.map(async (specId) => [
                            specId,
                            await swaggerParser.parse(getSpecPath(specId))
                                .then((api: OpenAPIObject) => Object.keys(api.paths))
                        ])
                    )
                );

                const dedupedPaths = calculateCommonPrefixes(commonBase, specFiles);
                Object.assign(dedupedIndex, dedupedPaths);
            }
        })
    );

    return dedupedIndex;
}
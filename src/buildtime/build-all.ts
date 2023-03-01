import * as path from 'path';
import * as fs from 'fs-extra';
import * as serializeToJs from 'serialize-javascript';

import { ApiGenerationOptions, generateApis } from "./generate-apis";
import { buildTrie } from './build-index';

const SOURCE_DIRECTORY = path.join('node_modules', 'openapi-directory', 'APIs');

export async function buildAll(globs: string[], options: ApiGenerationOptions = {}) {
    const index = await generateApis(globs, options);

    console.log('APIs generated and written to disk');

    await fs.writeFile(
        path.join('api', '_index.js'),
        'module.exports = ' + serializeToJs(buildTrie(index), {
            unsafe: true // We're not embedded in HTML, we don't want XSS escaping
        })
    );

    console.log(`Index trie for ${index.size} entries generated and written to disk`);
}

if (require.main === module) {
    buildAll([
        `${SOURCE_DIRECTORY}/**/swagger.yaml`,
        `${SOURCE_DIRECTORY}/**/openapi.yaml`,
    ], {
        // When run directly, we expect KNOWN_ERRORS to *exactly* match the current errors
        expectKnownErrors: true,
        ignoreKnownErrors: true
    }).catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
import * as path from 'path';
import * as fs from 'fs-extra';

import { generateApis } from "./generate-apis";
import { buildTrie } from './build-index';

const SOURCE_DIRECTORY = path.join('node_modules', 'openapi-directory', 'APIs');

export async function buildAll(globs: string[]) {
    const index = await generateApis(globs);

    console.log('APIs generated and written to disk');

    await fs.writeFile(
        path.join('api', '_index.json'),
        JSON.stringify(buildTrie(index))
    );

    const indexSize = Object.keys(index).length;
    console.log(`Index trie for ${indexSize} entries generated and written to disk`);
}

if (require.main === module) {
    buildAll([
        `${SOURCE_DIRECTORY}/**/swagger.yaml`,
        `${SOURCE_DIRECTORY}/**/openapi.yaml`,
    ]);
}
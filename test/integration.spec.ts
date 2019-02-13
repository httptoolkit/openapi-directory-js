import { expect } from "chai";

import { buildAll } from '../src/buildtime/build-all';

describe('Integration test:', function () {
    this.timeout(1000 * 60);

    it('building all APIs should create a usable index', async () => {
        await buildAll([
            // Build only a limited set, to keep the tests quick
            'node_modules/openapi-directory/APIs/amazonaws.com/a*/**/swagger.yaml',
            'node_modules/openapi-directory/APIs/**/openapi.yaml'
        ]);

        const { findApi } = await import('../src/runtime/index');
        const awsSpecId = findApi(
            'apigateway.amazonaws.com/restapis/1234/deployments/1234'
        );

        expect(awsSpecId).to.be.a('string');

        const awsSpec = await import(`../api/${awsSpecId}.json`);
        expect(awsSpec.info.title).to.equal('Amazon API Gateway');
    });
});

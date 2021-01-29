import { expect } from "chai";

import { buildAll } from '../src/buildtime/build-all';

describe('Integration test:', function () {
    this.timeout(1000 * 60);

    it('building all APIs should create a usable index', async () => {
        await buildAll([
            // Build only a limited set, to keep the tests quick
            'node_modules/openapi-directory/APIs/amazonaws.com/ap*/**/{swagger,openapi}.yaml',
            'node_modules/openapi-directory/APIs/azure.com/ap*/**/{swagger,openapi}.yaml',
            'node_modules/openapi-directory/APIs/tomtom.com/**/{swagger,openapi}.yaml'
        ]);

        const { findApi } = await import('../src/runtime/index');

        // Direct string lookup, but requires path-based deduplication to avoid apigateway v2:
        const awsSpecId = findApi(
            'apigateway.eu-north-1.amazonaws.com/restapis/1234/deployments/1234'
        );
        expect(awsSpecId).to.equal('amazonaws.com/apigateway');
        const awsSpec = await import(`../api/${awsSpecId}.json`);
        expect(awsSpec.info.title).to.equal('Amazon API Gateway');

        // Lookup that requires path-based deduplication using regexes for params, case-insensitive:
        const azureSpecId = findApi(
            'management.azure.com/subscriptions/123456/providers/Microsoft.Insights/listMigrationDate'
        );
        expect(azureSpecId).to.equal('azure.com/applicationinsights-eaSubscriptionMigration_API');
        const azureSpec = await import(`../api/${azureSpecId}.json`);
        expect(azureSpec.info.title).to.equal('ApplicationInsightsManagementClient');
    });
});

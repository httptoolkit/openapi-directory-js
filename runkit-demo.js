const { findApi } = require('openapi-directory');

const requestUrls = [
    "api.nytimes.com/svc/topstories/v2/travel.json",
    "sqs.us-east-2.amazonaws.com/123456789012/MyQueue/?Action=SendMessage&MessageBody=test+message",
    "api.github.com/repos/httptoolkit/mockttp",
];

requestUrls.forEach((url) => {
    console.log(url);
    // Look up the API spec id from the URL:
    const apiId = findApi(url);

    // With the id, you can require() a full specification for this API:
    const apiSpec = require(`openapi-directory/api/${apiId}`);

    // Includes lots of things, e.g. a link straight to the API docs:
    console.log(`    -> Docs: ${apiSpec.externalDocs.url}`);
});
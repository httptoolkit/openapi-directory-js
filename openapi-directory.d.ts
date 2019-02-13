declare module 'openapi-directory/api/*.json' {
    import { OpenAPIObject } from 'openapi3-ts';
    const api: OpenAPIObject;
    export = api;
}
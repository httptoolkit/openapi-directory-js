# An OpenAPI Directory for JS

> _Part of [HTTP Toolkit](https://httptoolkit.tech): powerful tools for building, testing & debugging HTTP(S)_

This repo builds & bundles the [OpenAPI Directory](https://github.com/APIs-guru/openapi-directory), so you can easily find, require and use any OpenAPI spec from the directory in your JS projects.

It provides files that can be individually required or remotely downloaded (via https://unpkg.com/openapi-directory/) for every API in the collection, and an index to quickly find the relevant OpenAPI spec for a given URL.

All specs are:

* Pre-parsed and exposed as JavaScript objects (not YAML strings).
* Converted to OpenAPI v3.
* Pre-bundled with all external $refs.

That means you can import them, and immediately & consistently start using them.

## How to use it

All OpenAPI specs can be required with:

```js
const spec = require('openapi-directory/api/<spec-id>.json');
```

(or read from `https://unpkg.com/openapi-directory/api/<spec-id>.json`)

The easiest way to obtain a spec id is to use the index. You can look up a URL in the index with:

```js
const { findApi } = require('openapi-directory');

findApi('wikimedia.org/api/rest_v1/feed/availability');
```

`findApi` takes a URL (host and path, _without_ the protocol) within any API, and will return either:

* Undefined, if there is no matching APIs.
* A string spec id, if there is exactly one API that's relevant to that URL.
* A list of spec ids, in rare cases where multiple specs may cover the same URL.

Alternatively if you know in advance which spec you want you can require it directly. The id for every spec in the directory is made up of the provider name, followed by a slash and the service name if a service name exists. Some example ids:

* `xkcd.com` (provider is xkcd.com, no service name)
* `amazonaws.com/acm` (provider is amazonaws.com, service name is acm).

You can find the provider and service name in the spec itself (under `info`, `x-providerName` and `x-serviceName`), and you can browse the raw specs directly at https://github.com/APIs-guru/openapi-directory.

## License

This repo/npm module is licensed as MIT.

The license for API definitions varies by spec, see https://github.com/APIs-guru/openapi-directory#licenses for more information.

In general it's very likely that your use of any API definition is covered either by CC0 (for specs submitted directly to the directory), the spec's own license (check `info.license`) or by Fair Use provisions when communicating with the corresponding service. This is not formal legal advice though, its your responsibility to confirm this for yourself for the specs you're using.
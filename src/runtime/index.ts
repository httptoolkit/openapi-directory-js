// Include a global type declaration that covers all
// generated api/* files.
/// <reference path="../../openapi-directory.d.ts" />

import { Trie } from "./trie";

const trieData = require('../../api/_index.json');
const apiIndex = new Trie(trieData);

export const findApi = (url: string) =>
    apiIndex.getMatchingPrefix(url);
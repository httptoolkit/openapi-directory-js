import { Trie } from "./trie";

const trieData = require('../../api/_index.json');
const apiIndex = new Trie(trieData);

export const findApi = (url: string) =>
    apiIndex.getMatchingPrefix(url);
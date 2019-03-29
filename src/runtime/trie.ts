import * as _ from 'lodash';
type TrieLeafValue = string | string[];

export type TrieValue =
    | TrieData
    | TrieLeafValue
    | undefined;

export interface TrieData extends Map<
    string | RegExp,
    TrieValue
> {}

export function isLeafValue(value: any): value is TrieLeafValue {
    return typeof value === 'string' || Array.isArray(value);
}

export class Trie {

    constructor(private root: TrieData) { }

    private _getLongestMatchingPrefix(key: string) {
        let remainingKey = key.toLowerCase();
        let node: TrieData | undefined = this.root;

        while (node) {
            // Calculate the max key length. String keys should be all the same length,
            // except one optional '' key if there's an on-path leaf node here, so we
            // just use the first non-zero non-regex length.
            let maxKeyLength;
            for (let k of node.keys()) {
                if (k && !(k instanceof RegExp)) {
                    maxKeyLength = k.length;
                    break;
                }
            }

            // Given a common key length L, we try to see if the first L characters
            // of our remaining key are an existing key here
            const keyToMatch = remainingKey.slice(0, maxKeyLength);
            // We check for the key with a hash lookup (as we know it would have to be an exact match),
            // _not_ by looping through keys with startsWith - this is key (ha!) to perf here.
            let nextNode: TrieValue = node.get(keyToMatch);

            if (nextNode) {
                // If that bit of the key matched, we can remove it from the key to match,
                // and move on to match the next bit.
                remainingKey = remainingKey.slice(maxKeyLength);
            } else {
                // If it didn't match, we need to check regexes, if present, and check
                // for an on-path leaf node here ('' key)
                const matchedRegex: {
                    matchedNode: TrieValue,
                    matchLength: number
                } | undefined = Array.from(node.keys()).map(k => {
                    const match = k instanceof RegExp && k.exec(remainingKey)
                    if (!!match && match.index === 0) {
                        return {
                            matchedNode: node!.get(k),
                            matchLength: match[0].length
                        };
                    };
                }).filter(r => !!r)[0];

                if (matchedRegex) {
                    // If we match a regex, we no longer need to match the part of the
                    // key that the regex has consumed
                    remainingKey = remainingKey.slice(matchedRegex.matchLength);
                    nextNode = matchedRegex.matchedNode;
                } else {
                    nextNode = node.get('');
                }
            }

            if (isLeafValue(nextNode)) {
                // We've reached the end of a key - if we're out of
                // input, that's good, if not it's just a prefix.
                return {
                    remainingKey,
                    matchedKey: key.slice(0, -1 * remainingKey.length),
                    value: nextNode
                };
            } else {
                node = nextNode;
            }
        }

        // We failed to match - this means at some point we either had no key left, and
        // no on-path key present, or we had a key left that disagreed with every option.
        return undefined;
    }

    /*
     * Given a key, finds an exact match and returns the value(s).
     * Returns undefined if no match can be found.
     */
    get(key: string): string | string[] | undefined {
        const searchResult = this._getLongestMatchingPrefix(key);

        if (!searchResult) return undefined;

        const {
            remainingKey,
            value
        } = searchResult;

        return remainingKey.length === 0 ?
            value : undefined;
    }

    /*
     * Given a key, finds the longest key that is a prefix of this
     * key, and returns its value(s). I.e. for input 'abcdef', 'abc'
     * would match in preference to 'ab', and 'abcdefg' would never
     * be matched.
     *
     * Returns undefined if no match can be found.
     */
    getMatchingPrefix(key: string): string | string[] | undefined {
        const searchResult = this._getLongestMatchingPrefix(key);

        if (!searchResult) return undefined;

        const { value } = searchResult;

        return value;
    }
}